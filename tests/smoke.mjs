// ══════════════════════════════════════════════════════════════════
// CalSnap smoke tests
// ══════════════════════════════════════════════════════════════════
// Loads index.html in jsdom, boots the app, and exercises the paths that
// have historically broken: i18n coverage, language switching, food-log
// persistence under a full localStorage quota, meal grouping, streaks.
//
//   npm i jsdom && node tests/smoke.mjs
//
// jsdom is resolved from NODE_PATH or a local node_modules.

import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

let JSDOM;
for (const spec of ['jsdom', process.env.JSDOM_PATH].filter(Boolean)) {
  try { ({ JSDOM } = await import(spec)); break; } catch { /* try next */ }
}
if (!JSDOM) {
  console.error('jsdom not found. Install it (npm i jsdom) or point JSDOM_PATH at it.');
  process.exit(2);
}

// Optional: a real IndexedDB implementation lets the image store and the
// snapshot backup be exercised for real instead of only their fallbacks.
let IDBFactoryImpl = null;
for (const spec of ['fake-indexeddb', process.env.FAKE_IDB_PATH].filter(Boolean)) {
  try {
    const m = await import(spec);
    IDBFactoryImpl = m.IDBFactory || m.default?.IDBFactory;
    if (IDBFactoryImpl) break;
  } catch { /* optional */ }
}

let pass = 0, fail = 0;
const failures = [];
function ok(name, cond, detail) {
  if (cond) { pass++; }
  else { fail++; failures.push(name + (detail ? ' — ' + detail : '')); }
}
function eq(name, actual, expected) {
  ok(name, actual === expected, `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

// ── A localStorage stand-in with a configurable byte budget ────────
function makeStorage(limitBytes = Infinity) {
  const map = new Map();
  const size = () => [...map].reduce((s, [k, v]) => s + k.length + v.length, 0);
  return {
    get length() { return map.size; },
    key(i) { return [...map.keys()][i] ?? null; },
    getItem(k) { return map.has(String(k)) ? map.get(String(k)) : null; },
    setItem(k, v) {
      k = String(k); v = String(v);
      const prev = map.get(k) ?? '';
      if (size() - prev.length + v.length > limitBytes) {
        const e = new Error('QuotaExceededError');
        e.name = 'QuotaExceededError';
        throw e;
      }
      map.set(k, v);
    },
    removeItem(k) { map.delete(String(k)); },
    clear() { map.clear(); },
    _bytes: size,
    _map: map,
  };
}

async function boot({ lang = 'ru', quota = Infinity, seed = {}, fetchImpl = null, online = true, idb = false } = {}) {
  const raw = readFileSync(path.join(ROOT, 'index.html'), 'utf8');

  // Collect the scripts in document order, then strip them from the markup so
  // we can install stubs before anything runs. They are re-appended as inline
  // <script> elements: script-level `const`/`let` then land in the shared
  // global lexical environment, exactly as in a browser (window.eval would
  // scope them to a single call and break cross-file references).
  const ordered = [];
  const stripped = raw.replace(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi, (m, attrs, body) => {
    if (/\btype\s*=\s*["']application\/ld\+json["']/i.test(attrs)) return m;
    const src = /\bsrc\s*=\s*["']([^"']+)["']/i.exec(attrs);
    ordered.push(src ? { file: src[1] } : { code: body });
    return '';
  });

  const dom = new JSDOM(stripped, {
    url: 'https://example.test/CalSnap/',
    runScripts: 'dangerously',
    pretendToBeVisual: true,
  });
  const { window } = dom;

  const storage = makeStorage(quota);
  Object.defineProperty(window, 'localStorage', { value: storage, configurable: true });
  Object.defineProperty(window, 'sessionStorage', { value: makeStorage(), configurable: true });
  storage.setItem('lang', lang);
  for (const [k, v] of Object.entries(seed)) storage.setItem(k, v);

  // Stubs for APIs jsdom lacks.
  window.HTMLMediaElement.prototype.play = () => Promise.resolve();
  window.HTMLMediaElement.prototype.load = () => {};
  window.HTMLCanvasElement.prototype.getContext = () => ({
    scale(){}, clearRect(){}, beginPath(){}, moveTo(){}, lineTo(){}, closePath(){},
    fill(){}, stroke(){}, arc(){}, fillText(){}, setLineDash(){}, drawImage(){},
    fillRect(){}, strokeRect(){}, rect(){}, save(){}, restore(){}, translate(){}, rotate(){},
    createLinearGradient(){ return { addColorStop(){} }; },
    set font(v){}, set textAlign(v){}, set fillStyle(v){}, set strokeStyle(v){}, set lineWidth(v){},
    set lineJoin(v){}, set lineCap(v){},
  });
  window.HTMLCanvasElement.prototype.toDataURL = () => 'data:image/jpeg;base64,QUJD';
  window.navigator.vibrate = () => true;
  window.requestIdleCallback = (fn) => setTimeout(fn, 0);
  window.cancelIdleCallback = (id) => clearTimeout(id);
  window.matchMedia = (q) => ({
    matches: false, media: q,
    addEventListener(){}, removeEventListener(){}, addListener(){}, removeListener(){},
    onchange: null, dispatchEvent(){ return false; },
  });
  window.fetch = fetchImpl || (() => Promise.reject(new Error('Failed to fetch')));
  // jsdom neither decodes images nor fires load/error for them, so stub the
  // decode step the thumbnailer relies on.
  class StubImage {
    constructor(){ this.naturalWidth = 1200; this.naturalHeight = 800; }
    set src(v){ this._src = v; setTimeout(() => this.onload && this.onload(), 0); }
    get src(){ return this._src; }
  }
  window.Image = StubImage;
  // `idb: true` opts into a real IndexedDB; pass a factory to share one across
  // simulated reloads. The default exercises the inline-image / no-backup paths.
  window.indexedDB = idb
    ? (typeof idb === 'object' ? idb : (IDBFactoryImpl ? new IDBFactoryImpl() : undefined))
    : undefined;
  window.scrollTo = () => {};
  window.AudioContext = undefined;
  window.webkitAudioContext = undefined;
  Object.defineProperty(window.navigator, 'onLine', { value: online, writable: true, configurable: true });
  try { delete window.navigator.serviceWorker; } catch(e) {}
  window.Element.prototype.scrollIntoView = function(){};

  const errors = [];
  window.addEventListener('error', e => errors.push('runtime: ' + (e.message || e.error)));
  const doc = window.document;
  for (const item of ordered) {
    const el = doc.createElement('script');
    try {
      el.textContent = item.file ? readFileSync(path.join(ROOT, item.file), 'utf8') : item.code;
    } catch (e) { errors.push(`${item.file}: unreadable (${e.message})`); continue; }
    try { doc.body.appendChild(el); }
    catch (e) { errors.push(`${item.file || 'inline'}: ${e.message}`); }
  }

  // `const`/`let` at script top level are global-lexical, not window
  // properties, so surface the ones the tests poke at.
  const LEXICAL = ['I18N', 'S', 'G', 'Ginvalidate', 'LANG', 'U', 'log', 'wts', 'key', 'cur',
                   'IMG', 'SFX', 'HFX', 'DRINKS', 'GL', 'MEAL_META', 'ds', 'tnow', 'tlog', 'dlog', 'tot',
                   'onIdle', 'ALL_MODELS', 'OVERLAYS', 'SFX', 'RECOMMENDED_MODEL_IDS', 'KEY_COOLDOWNS', 'I18N',
                   'QUEUE_MAX_ATTEMPTS', 'GEM_MAX_ATTEMPTS', 'OVERLAYS',
                   'RESET_KEEP_KEYS', 'EMO_RULES', 'isWaterOn', 'isChatMemoryOn', 'isFullscreenPref',
                   'selDay', 'aiConvo', 'selModel', 'DEFAULT_MODEL', 'THEME_ORDER',
                   'themePref', 'resolvedTheme', 'systemPrefersDark',
                   'aiChat', 'AI_CHAT_MAX', '_aiPhotos', 'AI_PHOTOS_MAX', 'enqueuePhoto', 'IMG_MAX_EDGE',
                   'aiChats', 'aiChatId', 'AI_CHAT_TTL_DAYS', 'USAGE_KEY',
                   '_drumDay', '_drumMonth', '_drumYear', '_syncDrumDays', '_drumMaxDays',
                   'MEAL_KEYS', 'MEAL_WINDOW_DEFAULTS', 'hmToMins', 'minsToHm',
                   'getMealWindows', 'saveMealWindows', 'mealWindowsSummary', 'encodeImage',
                   '_sniffMime', '_b64Head', 'dataUrlMime', '_jpegPayload', 'IMG_RAW_OK'];
  const expose = doc.createElement('script');
  expose.textContent = `for (const n of ${JSON.stringify(LEXICAL)}) {
    try { window[n] = eval(n); } catch(e) {}
  }
  window.__read = (expr) => eval(expr);`;
  doc.body.appendChild(expose);

  return { dom, window, storage, errors };
}

// ══════════════════════════════════════════════════════════════════
console.log('CalSnap smoke tests\n');

// ── 1. Every module parses and boots without throwing ─────────────
{
  const { window, errors } = await boot();
  ok('all scripts load without error', errors.length === 0, errors.join(' | '));
  ok('translator is available', typeof window.t === 'function');
  ok('storage layer is available', typeof window.S === 'function' && typeof window.saveLog === 'function');
  ok('escaping helper is available', typeof window.esc === 'function');
  ok('fullscreen module is available', typeof window.toggleFullscreen === 'function');
  window.close();
}

// ── 2. i18n dictionaries are complete in both directions ──────────
{
  const { window } = await boot();
  const I18N = window.I18N;
  const ru = Object.keys(I18N.ru), en = Object.keys(I18N.en);
  const missingEn = ru.filter(k => !(k in I18N.en));
  const missingRu = en.filter(k => !(k in I18N.ru));
  ok('no keys missing from `en`', missingEn.length === 0, missingEn.join(', '));
  ok('no keys missing from `ru`', missingRu.length === 0, missingRu.join(', '));

  // Every data-i18n* attribute in the markup must resolve to a real key.
  const doc = window.document;
  const unknown = [];
  for (const attr of ['data-i18n', 'data-i18n-html', 'data-i18n-placeholder', 'data-i18n-aria', 'data-i18n-title']) {
    doc.querySelectorAll(`[${attr}]`).forEach(el => {
      const key = el.getAttribute(attr);
      if (!(key in I18N.ru)) unknown.push(`${attr}="${key}"`);
    });
  }
  ok('every data-i18n key exists in the dictionary', unknown.length === 0, [...new Set(unknown)].join(', '));

  // No English value should still be the Russian one (catches copy-paste).
  const sameAsRu = ru.filter(k =>
    typeof I18N.ru[k] === 'string' &&
    I18N.ru[k] === I18N.en[k] &&
    /[А-Яа-яЁё]/.test(I18N.ru[k]));
  ok('no English value left in Cyrillic', sameAsRu.length === 0, sameAsRu.join(', '));
  window.close();
}

// ── 3. Switching to English leaves no Russian text in the DOM ─────
{
  const { window } = await boot({
    lang: 'en',
    seed: {
      u: JSON.stringify({ name: 'Alex', dob: '1995-05-05', age: 30, gen: 'm', h: 180, w: 80,
                          goal: 'maintain', act: 1.375, kcal: 2400, pr: 144, ft: 67, cb: 273, prefs: [], allerg: '' }),
      log: '[]', wts: '[]',
    },
  });
  eq('LANG follows localStorage', window.LANG, 'en');
  eq('t() resolves in English', window.t('nav_home'), 'Home');
  eq('document <html lang>', window.document.documentElement.getAttribute('lang'), 'en');

  // Screens that are actually visible after boot.
  const cyrillic = [];
  const check = (root) => {
    root.querySelectorAll('*').forEach(el => {
      if (el.children.length) return;                       // leaf text only
      if (['SCRIPT', 'STYLE', 'NOSCRIPT'].includes(el.tagName)) return;
      const txt = (el.textContent || '').trim();
      if (/[А-Яа-яЁё]/.test(txt)) cyrillic.push(`<${el.tagName.toLowerCase()}> ${txt.slice(0, 60)}`);
      for (const a of ['placeholder', 'aria-label', 'title']) {
        const v = el.getAttribute?.(a);
        if (v && /[А-Яа-яЁё]/.test(v)) cyrillic.push(`[${a}] ${v.slice(0, 60)}`);
      }
    });
  };
  ['home', 'prog', 'sett', 'ob', 'ai', 'addOv', 'fdOv', 'notifOv', 'editFoodOv', 'drumOv', 'wlogOv', 'cfrmOv', 'apiOv', 'edOv', 'offlOv', 'aboutOv', 'mdlOv', 'installBanner', 'updateBanner']
    .forEach(id => { const el = window.document.getElementById(id); if (el) check(el); });
  // Author names and the app name are intentionally not translated.
  const real = cyrillic.filter(x => !/RJV|Rizan|CalSnap/.test(x));
  ok('no Russian text left in EN mode', real.length === 0, [...new Set(real)].slice(0, 12).join(' | '));
  window.close();
}

// ── 4. The AI prompt is built in the active language ──────────────
{
  const seedU = JSON.stringify({ name: 'Alex', age: 30, gen: 'm', h: 180, w: 80,
                                 goal: 'lose', act: 1.55, kcal: 2000, pr: 144, ft: 55, cb: 200, prefs: ['vegan'], allerg: 'peanuts' });
  const en = await boot({ lang: 'en', seed: { u: seedU, log: '[]', wts: '[]' } });
  const pEn = en.window._aiBuildSystemPrompt();
  ok('EN prompt asks for an English reply', /Reply in English/.test(pEn), pEn.slice(0, 120));
  ok('EN prompt has no Cyrillic', !/[А-Яа-яЁё]/.test(pEn));
  ok('EN prompt carries user preferences', /Preferences: .*Vegan/i.test(pEn));
  en.window.close();

  const ru = await boot({ lang: 'ru', seed: { u: seedU, log: '[]', wts: '[]' } });
  const pRu = ru.window._aiBuildSystemPrompt();
  ok('RU prompt asks for a Russian reply', /Отвечай по-русски/.test(pRu));
  ru.window.close();
}

// ── 5. Weekly-analysis + daily-summary prompts follow the language ─
{
  const { window } = await boot({ lang: 'en', seed: { u: JSON.stringify({ name: 'A', kcal: 2000, goal: 'lose', w: 80, h: 180, age: 30, gen: 'm' }), log: '[]' } });
  const src = readFileSync(path.join(ROOT, 'assets/js/daily.js'), 'utf8');
  ok('weekly prompt has an English branch', /JSON only, in English/.test(src));
  ok('weekly card headings are translated', /t\('week_good'\)/.test(src));
  ok('pace card no longer mislabels kg as days', !/t\('streak_days','кг'\)/.test(src));
  window.close();
}

// ── 6. THE DAY-6/7 BUG: entries must survive a full quota ─────────
{
  // 64 KB budget: enough for the profile, far too little for photo blobs.
  const { window, storage } = await boot({
    quota: 64 * 1024,
    seed: {
      u: JSON.stringify({ name: 'A', kcal: 2000, goal: 'maintain', w: 80, h: 180, age: 30, gen: 'm', pr: 100, ft: 60, cb: 200 }),
      wts: '[]',
    },
  });

  // Fill the log with legacy inline photos, the way old builds did.
  const bigImg = 'data:image/jpeg;base64,' + 'A'.repeat(6000);
  const seeded = [];
  for (let d = 0; d < 6; d++) {
    const day = new Date(); day.setDate(day.getDate() - d);
    for (let i = 0; i < 2; i++) {
      seeded.push({ food: `Meal ${d}-${i}`, kcal: 500, prot: 20, fat: 10, carb: 50,
                    time: '12:00', date: day.toDateString(), img: bigImg });
    }
  }
  window.log.length = 0;
  window.log.push(...seeded);
  // Direct raw write would throw; go through the app's own path.
  const savedSeed = window.saveLog();
  ok('log write succeeds by reclaiming space', savedSeed === true);

  // Now add "today's" entry — the exact action that used to be lost.
  const before = window.log.length;
  // Mutate the shared object rather than replacing the window property, so the
  // app's own module-level `cur` binding sees it.
  window.__read('cur').text = { food: 'Fresh entry', kcal: 321, prot: 9, fat: 3, carb: 40,
                                time: '18:30', date: window.ds() };
  window.addRes('text');
  ok('new entry is in memory', window.log.some(e => e.food === 'Fresh entry'));

  // Re-read from storage exactly like a cold start would.
  const persisted = JSON.parse(storage.getItem('log') || '[]');
  ok('new entry is actually persisted', persisted.some(e => e.food === 'Fresh entry'),
     `persisted ${persisted.length} of ${window.__read('log').length}`);
  ok('memory and storage agree', persisted.length === window.__read('log').length,
     `mem=${window.__read('log').length} disk=${persisted.length}`);
  ok('oversized inline photos were shed', !persisted.some(e => (e.img || '').length > 4000));
  ok('entry count did not shrink', window.log.length === before + 1);
  window.close();
}

// ── 7. S() reports failure instead of poisoning its cache ─────────
{
  const { window, storage } = await boot({ quota: 2 * 1024 });
  const huge = 'x'.repeat(50 * 1024);
  const wrote = window.S('some_key', huge);
  eq('S() returns false when it cannot write', wrote, false);
  eq('G() does not return the phantom value', window.G('some_key', 'MISSING'), 'MISSING');
  eq('nothing was persisted', storage.getItem('some_key'), null);
  window.close();
}

// ── 8. tnow() is locale-independent 24h, so meal grouping holds ────
{
  for (const lang of ['ru', 'en']) {
    const { window } = await boot({ lang });
    const v = window.tnow(new Date(2026, 0, 2, 14, 5));
    eq(`tnow() is HH:MM in ${lang}`, v, '14:05');
    eq(`getMealType parses it in ${lang}`, window.getMealType(v), 'snack');
    eq(`getMealType 08:00 in ${lang}`, window.getMealType('08:00'), 'breakfast');
    eq(`getMealType 12:30 in ${lang}`, window.getMealType('12:30'), 'lunch');
    eq(`getMealType 20:00 in ${lang}`, window.getMealType('20:00'), 'dinner');
    eq(`getMealType 03:00 in ${lang}`, window.getMealType('03:00'), 'snack');
    window.close();
  }
}

// ── 9. Emoji + beverage detection understand English ──────────────
{
  const { window } = await boot({ lang: 'en' });
  eq('emo("Grilled chicken")', window.emo('Grilled chicken breast'), '🍗');
  eq('emo("Apple")', window.emo('Apple'), '🍎');
  eq('emo("Куриная грудка")', window.emo('Куриная грудка'), '🍗');
  eq('emo(unknown)', window.emo('Zorblax'), '🍽️');
  const bev = window._detectBeverage({ food: 'Latte coffee', portion: '250 ml' });
  ok('English beverage detected', !!bev, JSON.stringify(bev));
  eq('ml parsed from English portion', bev?.ml, 250);
  eq('drink id mapped', bev?.drinkId, 'coffee');
  ok('non-beverage ignored', window._detectBeverage({ food: 'Steak', portion: '200 g' }) === null);
  window.close();
}

// ── 10. Untrusted names cannot inject markup ──────────────────────
{
  const { window } = await boot({
    seed: {
      u: JSON.stringify({ name: 'A', kcal: 2000, goal: 'maintain', w: 80, h: 180, age: 30, gen: 'm', pr: 100, ft: 60, cb: 200 }),
      wts: '[]',
    },
  });
  window.log.length = 0;
  window.log.push({ food: '<img src=x onerror=alert(1)>', kcal: 100, prot: 1, fat: 1, carb: 1,
                    time: '10:00', date: window.ds() });
  window.saveLog();
  window.rH();
  const html = window.document.getElementById('hlog').innerHTML;
  ok('food name is HTML-escaped in the log list', /&lt;img src=x/.test(html), html.slice(0, 200));
  ok('injected tag did not become an element',
     window.document.querySelectorAll('#hlog img[src="x"]').length === 0);
  eq('rendered name is the literal string',
     window.document.querySelector('#hlog .li-name').textContent.trim(),
     '<img src=x onerror=alert(1)>');
  eq('fmt() escapes AI output', window.fmt('<b>x</b>'), '&lt;b&gt;x&lt;/b&gt;');
  eq('fmt() still renders bold markdown', window.fmt('**hi**'), '<b>hi</b>');
  window.close();
}

// ── 11. Meal grouping and totals ──────────────────────────────────
{
  const { window } = await boot({
    seed: {
      u: JSON.stringify({ name: 'A', kcal: 2000, goal: 'maintain', w: 80, h: 180, age: 30, gen: 'm', pr: 100, ft: 60, cb: 200 }),
      wts: '[]',
    },
  });
  const today = window.ds();
  window.log.length = 0;
  window.log.push(
    { food: 'Eggs',   kcal: 200, prot: 12, fat: 14, carb: 2,  time: '08:00', date: today },
    { food: 'Soup',   kcal: 300, prot: 10, fat: 8,  carb: 30, time: '13:00', date: today },
    { food: 'Yogurt', kcal: 150, prot: 8,  fat: 4,  carb: 18, time: '16:00', date: today },
    { food: 'Fish',   kcal: 400, prot: 40, fat: 15, carb: 5,  time: '19:30', date: today },
  );
  window.saveLog();
  window.rH();
  const groups = [...window.document.querySelectorAll('#hlog .meal-group')].map(g => g.dataset.meal);
  ok('meals are grouped in chronological order',
     JSON.stringify(groups) === JSON.stringify(['breakfast', 'lunch', 'snack', 'dinner']),
     JSON.stringify(groups));
  const totals = window.tot(window.tlog());
  eq('total kcal', totals.k, 1050);
  eq('total protein', totals.p, 70);
  eq('rendered goal', window.document.getElementById('hgoal').textContent, '2000');
  window.close();
}

// ── 12. Streak counting ───────────────────────────────────────────
{
  const days = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return d.toDateString(); };
  const { window } = await boot({
    seed: {
      u: JSON.stringify({ name: 'A', kcal: 2000, goal: 'maintain', w: 80, h: 180, age: 30, gen: 'm', pr: 100, ft: 60, cb: 200 }),
      log: JSON.stringify([0, 1, 2, 3].map(i => ({ food: 'x', kcal: 100, time: '12:00', date: days(i) }))),
      wts: '[]',
      streak_freezes: '{}',
    },
  });
  eq('4 consecutive logged days => streak 4', window.streak(), 4);
  window.close();
}

// ── 13. Reset wipes everything the app owns ───────────────────────
{
  const { window, storage } = await boot({
    seed: {
      u: JSON.stringify({ name: 'A', kcal: 2000, goal: 'maintain', w: 80, h: 180, age: 30, gen: 'm' }),
      log: '[{"food":"x","kcal":1,"date":"x","time":"1"}]',
      wts: '[{"v":80,"d":"x","t":"1"}]',
      favs: '[{"food":"f","kcal":1}]',
      model: 'gemini-2.0-flash',
      chat_memory_enabled: '1',
      streak_freezes: '{"a":true}',
      week_2026_01: '{"good":"x"}',
      theme: 'dark',
      lang: 'ru',
    },
  });
  window.clrAll();
  window.cfrmConfirm();
  for (const k of ['u', 'log', 'wts', 'favs', 'chat_memory_enabled', 'streak_freezes', 'week_2026_01']) {
    eq(`reset removes "${k}"`, storage.getItem(k), null);
  }
  // A full reset is a fresh install, so the recommended model is re-seeded.
  eq('reset restores the default model', storage.getItem('model'), 'gemini-flash-lite-latest');
  eq('reset keeps the chosen theme', storage.getItem('theme'), 'dark');
  eq('reset keeps the chosen language', storage.getItem('lang'), 'ru');
  eq('in-memory log cleared', window.__read('log').length, 0);
  eq('in-memory profile cleared', window.__read('U'), null);
  eq('in-memory key cleared', window.__read('key'), '');
  window.close();
}

// ── 14. Export/import round-trip preserves everything ─────────────
{
  const src = readFileSync(path.join(ROOT, 'assets/js/ui.js'), 'utf8');
  const exported = [...src.matchAll(/^\s{6}(\w+):\s*G\('([\w_]+)'/gm)].map(m => m[2]);
  const importBody = src.slice(src.indexOf('function importJSON'), src.indexOf('// Toast'));
  const imported = [...importBody.matchAll(/S\('([\w_]+)'/g)].map(m => m[1]);
  const missing = exported.filter(k => k !== 'log' && !imported.includes(k));
  ok('every exported key is also imported', missing.length === 0, missing.join(', '));
  ok('favourites are part of the backup', exported.includes('favs'));
  ok('language is part of the backup', exported.includes('lang'));
  ok('CSV fields are quoted', /_csvCell/.test(src));
}

// ── 15. Service worker inventory matches the repo ─────────────────
{
  const sw = readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
  const jsList = [...sw.matchAll(/'\.\/assets\/js\/([\w.-]+\.js)'/g)].map(m => m[1]).sort();
  const onDisk = readdirSync(path.join(ROOT, 'assets/js')).filter(f => f.endsWith('.js')).sort();
  ok('SW precaches every JS module',
     onDisk.every(f => jsList.includes(f)),
     'missing: ' + onDisk.filter(f => !jsList.includes(f)).join(', '));
  ok('SW lists no phantom JS module',
     jsList.every(f => onDisk.includes(f)),
     'phantom: ' + jsList.filter(f => !onDisk.includes(f)).join(', '));

  const soundList = [...(sw.match(/const SOUNDS = \[([\s\S]*?)\]\.map/) || [, ''])[1].matchAll(/'([\w]+)'/g)].map(m => m[1]).sort();
  const soundsOnDisk = readdirSync(path.join(ROOT, 'sounds')).filter(f => f.endsWith('.mp3')).map(f => f.replace('.mp3', '')).sort();
  ok('SW precaches only sounds that exist',
     soundList.every(n => soundsOnDisk.includes(n)),
     'phantom: ' + soundList.filter(n => !soundsOnDisk.includes(n)).join(', '));

  ok('SW receives the UI language for background notifications', /lang: LANG/.test(readFileSync(path.join(ROOT, 'assets/js/notif.js'), 'utf8')));
  ok('SW honours schedule.lang', /schedule\.lang \|\| 'ru'/.test(sw));
}

// ── 16. Manifest requests fullscreen ──────────────────────────────
{
  const m = JSON.parse(readFileSync(path.join(ROOT, 'manifest.json'), 'utf8'));
  eq('manifest display', m.display, 'fullscreen');
  ok('display_override prefers fullscreen', m.display_override?.[0] === 'fullscreen', JSON.stringify(m.display_override));
  const html = readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  ok('viewport resizes for the on-screen keyboard', /interactive-widget=resizes-content/.test(html));
  ok('fullscreen module is loaded', /assets\/js\/fullscreen\.js/.test(html));
  ok('settings expose a fullscreen toggle', /id="fullscreenToggle"/.test(html));
}

// ── 17. Language switch re-renders live UI ────────────────────────
{
  const { window } = await boot({
    lang: 'ru',
    seed: {
      u: JSON.stringify({ name: 'Иван', kcal: 2000, goal: 'maintain', w: 80, h: 180, age: 30, gen: 'm', pr: 100, ft: 60, cb: 200 }),
      log: '[]', wts: '[]',
    },
  });
  eq('starts in Russian', window.document.querySelector('[data-i18n="nav_home"]').textContent, 'Дом');
  window.toggleLang();
  eq('nav switched to English', window.document.querySelector('[data-i18n="nav_home"]').textContent, 'Home');
  eq('settings indicator switched', window.document.getElementById('slang').textContent, 'EN');
  eq('persisted', window.localStorage.getItem('lang'), 'en');
  ok('document title localised', /calorie tracker/i.test(window.document.title), window.document.title);
  const dayLabel = window.document.getElementById('dayLabel').textContent;
  eq('dynamic day label re-rendered', dayLabel, 'Today');
  window.toggleLang();
  eq('switches back', window.localStorage.getItem('lang'), 'ru');
  window.close();
}

// ── 18. Scroll lock is reference counted ──────────────────────────
{
  const { window } = await boot({
    seed: { u: JSON.stringify({ name: 'A', kcal: 2000, goal: 'maintain', w: 80, h: 180, age: 30, gen: 'm', pr: 100, ft: 60, cb: 200 }), wts: '[]' },
  });
  const body = window.document.body;
  window.log.length = 0;
  window.log.push({ food: 'x', kcal: 10, prot: 1, fat: 1, carb: 1, time: '10:00', date: window.ds() });
  window.saveLog();
  window.openFd(0);
  eq('detail sheet locks scroll', body.style.overflow, 'hidden');
  window.editFd();
  window.closeEditFd();
  eq('closing the nested sheet keeps the lock', body.style.overflow, 'hidden');
  window.closeFd();
  eq('last close releases the lock', body.style.overflow, '');
  window.close();
}

// ── 19. Water goal parity between app and widget ──────────────────
{
  const w = readFileSync(path.join(ROOT, 'widget.html'), 'utf8');
  ok('widget uses the app water formula', /\*30\/50\)\*50/.test(w) && /1500/.test(w) && /3500/.test(w));
  ok('widget is localisable', /function wt\(k\)/.test(w) && /data-wt=/.test(w));
  ok('widget escapes food names', /wesc\(item\.food/.test(w));
}

// ── 20. Diary is usable without an API key / offline ──────────────
{
  const { window } = await boot({
    seed: { u: JSON.stringify({ name: 'A', kcal: 2000, goal: 'maintain', w: 80, h: 180, age: 30, gen: 'm', pr: 100, ft: 60, cb: 200 }), wts: '[]' },
  });
  eq('no API key configured', window.key, '');
  window.openAdd();
  ok('Add sheet opens without a key', window.document.getElementById('addOv').classList.contains('on'));
  ok('API modal was not forced', !window.document.getElementById('apiOv').classList.contains('on'));
  window.closeAdd();
  window.enterOffline();
  const addBtn = window.document.querySelector('.nb-add');
  ok('the + button stays usable offline', addBtn.style.pointerEvents !== 'none', addBtn.style.pointerEvents);
  // The AI tab stays reachable so the transcript can be read offline; it is the
  // composer that goes inert, with an explanation.
  const aiBtn = [...window.document.querySelectorAll('.nb')].find(b => (b.getAttribute('onclick') || '').includes("'ai'"));
  ok('the AI tab is still reachable offline', aiBtn.style.pointerEvents !== 'none', aiBtn.style.pointerEvents);
  ok('the document is flagged offline', window.document.documentElement.classList.contains('is-offline'));
  ok('the offline bar is shown', window.document.getElementById('offlBar').classList.contains('on'));
  window.close();
}

// ── 21. AI tab highlights itself in the bottom nav ────────────────
{
  const { window } = await boot({
    seed: { u: JSON.stringify({ name: 'A', kcal: 2000, goal: 'maintain', w: 80, h: 180, age: 30, gen: 'm', pr: 100, ft: 60, cb: 200 }), wts: '[]' },
  });
  const nbs = [...window.document.querySelectorAll('.nb')];
  const aiBtn = nbs.find(b => (b.getAttribute('onclick') || '').includes("'ai'"));
  window.goS('ai', aiBtn);
  ok('AI button gets the active class', aiBtn.classList.contains('on'));
  eq('only one nav item is active', nbs.filter(b => b.classList.contains('on')).length, 1);
  eq('AI overlay shown', window.document.getElementById('ai').style.display, 'flex');
  window.goS('home', nbs[0]);
  eq('AI overlay hidden again', window.document.getElementById('ai').style.display, 'none');
  ok('home button active', nbs[0].classList.contains('on'));
  window.close();
}

// ══════════════════════════════════════════════════════════════════
// ── 23. Model picker descriptions follow the language ─────────────
{
  const { window } = await boot({ lang: 'en' });
  const tagKeys = (id) => window.modelTags({ id }).map(x => x.key);
  ok('a thinking model is tagged as reasoning', tagKeys('gemini-2.0-flash-thinking-exp-01-21').includes('mdl_tag_reasoning'),
     tagKeys('gemini-2.0-flash-thinking-exp-01-21').join(','));
  ok('the tier line is language-neutral branding', /Flash/.test(window._modelTier({ id: 'gemini-2.5-flash' })));
  ok('no static Cyrillic descriptions remain',
     !window.__read('ALL_MODELS').some(m => /[А-Яа-яЁё]/.test(m.desc || '')));

  // Every tag renders through the dictionary in both languages.
  const allKeys = new Set();
  window.__read('ALL_MODELS').forEach(m => window.modelTags(m).forEach(x => allKeys.add(x.key)));
  ok('every tag key exists in both dictionaries',
     [...allKeys].every(k => k in window.I18N.ru && k in window.I18N.en),
     [...allKeys].filter(k => !(k in window.I18N.en)).join(','));

  // Guidance the picker is supposed to give.
  ok('flash-lite is the fastest', tagKeys('gemini-flash-lite-latest').includes('mdl_tag_fastest'));
  ok('pro is more accurate but slower', tagKeys('gemini-pro-latest').includes('mdl_tag_accurate')
     && tagKeys('gemini-pro-latest').includes('mdl_tag_slow'));
  ok('pro-latest is recommended too', tagKeys('gemini-pro-latest').includes('mdl_tag_recommended'));
  ok('1.5 is marked legacy', tagKeys('gemini-1.5-flash').includes('mdl_tag_legacy'));
  ok('a TTS model is flagged as unsuited', tagKeys('gemini-2.5-flash-preview-tts').includes('mdl_tag_not_for_food'));
  ok('an image-generation model is flagged too', tagKeys('gemini-3-pro-image-preview').includes('mdl_tag_not_for_food'));
  ok('at most four tags per model',
     window.__read('ALL_MODELS').every(m => window.modelTags(m).length <= 4));

  window.openModelPicker();
  const rows = window.document.querySelectorAll('#mdlList .mdl-row');
  ok('rows render', rows.length > 5, String(rows.length));
  ok('the first row is a recommended one', /recommended/i.test(rows[0].textContent), rows[0].textContent);
  ok('tags are rendered as pills', window.document.querySelectorAll('#mdlList .mdl-tag').length > 5);
  ok('a legend explains them', !!window.document.querySelector('.mdl-legend'));

  // Grouped, and searchable — fifty ids are unusable as one flat list.
  const groups = [...window.document.querySelectorAll('#mdlList .mdl-grp')].map(g => g.textContent);
  eq('two groups', groups.length, 2);
  ok('recommended come first', /recommended/i.test(groups[0]), groups.join(' | '));
  const search = window.document.getElementById('mdlSearch');
  ok('there is a search box', !!search);
  search.value = 'flash-lite';
  search.oninput({ target: search });
  const hits = [...window.document.querySelectorAll('#mdlList .mdl-row')];
  ok('search narrows the list', hits.length > 0 && hits.length < rows.length, String(hits.length));
  ok('and every hit matches', hits.every(r => /lite/i.test(r.textContent)));
  ok('the clear button appears', !window.document.getElementById('mdlSearchX').hidden);
  search.value = 'zzzz-no-such-model';
  search.oninput({ target: search });
  ok('an empty result explains itself', !!window.document.querySelector('#mdlList .mdl-empty'));
  window.clearModelSearch();
  eq('clearing restores every row', window.document.querySelectorAll('#mdlList .mdl-row').length, rows.length);
  window.closeModelPicker();
  window.close();
}

// ── 24. Every data-i18n element is a text leaf ─────────────────────
{
  const { window } = await boot();
  const withKids = [];
  window.document.querySelectorAll('[data-i18n]').forEach(el => {
    if (el.children.length) withKids.push(`${el.tagName.toLowerCase()}[${el.getAttribute('data-i18n')}]`);
  });
  ok('data-i18n is only used on leaf elements (markup goes through data-i18n-html)',
     withKids.length === 0, withKids.join(', '));
  window.close();
}

// ── 25. Photos are stored small, outside localStorage ─────────────
{
  const src = readFileSync(path.join(ROOT, 'assets/js/app.js'), 'utf8');
  ok('the analysis blob is no longer written to the log', !/img:'data:image\/jpeg;base64,'\+imgData/.test(src));
  ok('photos go through the image store', /await storeFoodImage\(/.test(src));
  const store = readFileSync(path.join(ROOT, 'assets/js/store.js'), 'utf8');
  ok('thumbnails are downscaled before storing', /shrinkDataUrl\(dataUrl, 480/.test(store));
  ok('IndexedDB is used for images', /indexedDB\.open/.test(store));
  const state = readFileSync(path.join(ROOT, 'assets/js/state.js'), 'utf8');
  ok('quota errors are detected, not swallowed', /_isQuotaError/.test(state));
  ok('saveLog re-serialises on retry', /for \(let attempt = 0/.test(state));
  ok('legacy photos are migrated off localStorage', /_migrateLegacyImages/.test(state));
}

// ── 26. Fullscreen preference round-trips ─────────────────────────
{
  const { window, storage } = await boot({
    seed: { u: JSON.stringify({ name: 'A', kcal: 2000, goal: 'maintain', w: 80, h: 180, age: 30, gen: 'm', pr: 100, ft: 60, cb: 200 }), wts: '[]' },
  });
  eq('fullscreen defaults to on', window.isFullscreenPref(), true);
  const tog = window.document.getElementById('fullscreenToggle');
  window.rSet();
  ok('the settings toggle reflects the default', tog.classList.contains('on'));
  // jsdom has no Fullscreen API, so the toggle should report that rather than
  // silently flipping a preference the platform cannot honour.
  window.toggleFullscreen();
  eq('preference untouched when unsupported', storage.getItem('fullscreen_enabled'), null);
  // With the API present it persists.
  window.document.documentElement.requestFullscreen = () => Promise.resolve();
  window.document.exitFullscreen = () => Promise.resolve();
  window.toggleFullscreen();
  eq('turning it off persists', storage.getItem('fullscreen_enabled'), '0');
  eq('pref reads back', window.isFullscreenPref(), false);
  window.toggleFullscreen();
  eq('turning it on persists', storage.getItem('fullscreen_enabled'), '1');
  window.close();
}

// ── 27. Photos referenced by id are hydrated after render ─────────
{
  const { window } = await boot({
    seed: { u: JSON.stringify({ name: 'A', kcal: 2000, goal: 'maintain', w: 80, h: 180, age: 30, gen: 'm', pr: 100, ft: 60, cb: 200 }), wts: '[]' },
  });
  const blob = 'data:image/jpeg;base64,QUJD';
  window.__read('IMG').get = async (id) => (id === 'img-1' ? blob : null);
  window.log.length = 0;
  window.log.push({ food: 'With photo', kcal: 100, prot: 1, fat: 1, carb: 1,
                    time: '10:00', date: window.ds(), imgId: 'img-1' });
  window.saveLog();
  window.rH();
  ok('the log row renders an <img> placeholder',
     !!window.document.querySelector('#hlog img'), window.document.getElementById('hlog').innerHTML.slice(0, 160));
  await new Promise(r => setTimeout(r, 30));
  eq('src is filled in from the image store',
     window.document.querySelector('#hlog img')?.getAttribute('src'), blob);
  ok('the id attribute is consumed',
     !window.document.querySelector('#hlog img[data-img-id]'));
  window.close();
}

// ── 28. Backup round-trip through the real export/import code ─────
{
  const seed = {
    u: JSON.stringify({ name: 'Иван', kcal: 2345, goal: 'gain', w: 81, h: 181, age: 31, gen: 'm', pr: 146, ft: 65, cb: 250, prefs: ['keto'], allerg: 'nuts' }),
    log: JSON.stringify([{ food: 'Rice', kcal: 260, prot: 5, fat: 0, carb: 57, time: '12:00', date: new Date().toDateString() }]),
    wts: JSON.stringify([{ v: 81, d: new Date().toDateString(), t: '08:00' }]),
    favs: JSON.stringify([{ food: 'Rice', kcal: 260 }]),
    model: 'gemini-2.0-flash',
    chat_memory_enabled: '1',
    water_enabled: '1',
    notif_cfg: JSON.stringify({ breakfast: '07:15' }),
    lang: 'ru',
  };
  const a = await boot({ seed });
  // Capture what exportJSON would write.
  let payload = null;
  a.window.URL.createObjectURL = (blob) => { payload = blob; return 'blob:x'; };
  a.window.URL.revokeObjectURL = () => {};
  a.window.HTMLAnchorElement.prototype.click = function(){};
  a.window.exportJSON();
  ok('export produced a blob', !!payload);
  const text = await payload.text();
  const data = JSON.parse(text);
  for (const k of ['user', 'log', 'wts', 'favs', 'model', 'chatMemory', 'waterEnabled', 'notifCfg', 'lang']) {
    ok(`backup contains "${k}"`, data[k] != null && data[k] !== '', JSON.stringify(data[k]));
  }
  a.window.close();

  // Import it into a blank instance.
  const b = await boot({});
  // The import schedules a reload 300 ms later; we assert before that and
  // close the window, so there is nothing to stub.
  const file = { name: 'b.json' };
  const input = { files: [file], value: '' };
  // Drive the FileReader path directly.
  class FR {
    readAsText(){ this.onload({ target: { result: text } }); }
  }
  b.window.FileReader = FR;
  b.window.importJSON(input);
  b.window.cfrmConfirm();      // confirm the dialog
  eq('profile restored', JSON.parse(b.storage.getItem('u')).name, 'Иван');
  eq('favourites restored', b.storage.getItem('favs'), seed.favs);
  eq('model restored', b.storage.getItem('model'), 'gemini-2.0-flash');
  eq('chat memory restored', b.storage.getItem('chat_memory_enabled'), '1');
  eq('notif config restored', b.storage.getItem('notif_cfg'), seed.notif_cfg);
  b.window.close();
}

// ── 29. Plural agreement (RU three forms, EN two) ─────────────────
{
  for (const [lang, expected] of [
    ['ru', { 1: '1 год', 2: '2 года', 5: '5 лет', 11: '11 лет', 21: '21 год', 31: '31 год' }],
    ['en', { 1: '1 year', 2: '2 years', 5: '5 years', 11: '11 years', 21: '21 years', 31: '31 years' }],
  ]) {
    const { window } = await boot({ lang });
    for (const [n, want] of Object.entries(expected)) {
      eq(`fmtYears(${n}) [${lang}]`, window.fmtYears(Number(n)), want);
    }
    const days = lang === 'ru'
      ? { 1: 'день', 2: 'дня', 5: 'дней', 11: 'дней', 21: 'день' }
      : { 1: 'day', 2: 'days', 5: 'days', 11: 'days', 21: 'days' };
    for (const [n, want] of Object.entries(days)) {
      eq(`fmtDaysWord(${n}) [${lang}]`, window.fmtDaysWord(Number(n)), want);
    }
    window.close();
  }

  // Rendered on the streak chip.
  const day = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return d.toDateString(); };
  const { window } = await boot({
    lang: 'ru',
    seed: {
      u: JSON.stringify({ name: 'A', kcal: 2000, goal: 'maintain', w: 80, h: 180, age: 30, gen: 'm', pr: 100, ft: 60, cb: 200 }),
      log: JSON.stringify([{ food: 'x', kcal: 100, time: '12:00', date: day(0) }]),
      wts: '[]', streak_freezes: '{}',
    },
  });
  window.rH();
  eq('streak chip agrees with the count', window.document.querySelector('.streak .sl').textContent, 'день');
  window.rP();
  eq('progress streak label agrees', window.document.querySelector('.sbc-lbl').textContent, 'день стрик');
  window.close();
}

// ── 30. API key pool: add / dedupe / remove ───────────────────────
{
  const { window, storage } = await boot({});
  eq('pool starts empty', window.getKeyPool().length, 0);
  eq('hasApiKey() false', window.hasApiKey(), false);

  ok('adds a key', window.addApiKey('AIzaSyTESTKEY_0000000000000000000001').ok);
  eq('pool has one key', window.getKeyPool().length, 1);
  eq('legacy `key` mirror is synced', window.__read('key'), 'AIzaSyTESTKEY_0000000000000000000001');
  eq('duplicate rejected', window.addApiKey('AIzaSyTESTKEY_0000000000000000000001').reason, 'duplicate');
  eq('blank rejected', window.addApiKey('   ').reason, 'empty');
  eq('too short rejected', window.addApiKey('AIza').reason, 'malformed');
  eq('key with whitespace rejected', window.addApiKey('AIza abcdefghijklmnopqrstu').reason, 'malformed');

  ok('adds a second key', window.addApiKey('AIzaSyTESTKEY_0000000000000000000002').ok);
  eq('pool has two', window.getKeyPool().length, 2);
  eq('persisted', JSON.parse(storage.getItem('api_keys')).length, 2);
  eq('masking hides the middle', window.maskKey('AIzaSyABCDEFGHIJKLMNOP'), 'AIzaSy…MNOP');

  window.removeApiKey('AIzaSyTESTKEY_0000000000000000000001');
  eq('removal works', window.getKeyPool().length, 1);
  eq('mirror follows removal', window.__read('key'), 'AIzaSyTESTKEY_0000000000000000000002');
  window.close();
}

// ── 31. Legacy single key is migrated into the pool ───────────────
{
  const { window } = await boot({ seed: { key: 'AIzaSyLEGACY_00000000000000000001' } });
  const pool = window.getKeyPool();
  eq('legacy key migrated', pool.length, 1);
  eq('same value', pool[0].k, 'AIzaSyLEGACY_00000000000000000001');
  // Running init twice must not duplicate it.
  window.migrateLegacyApiKey();
  eq('migration is idempotent', window.getKeyPool().length, 1);
  window.close();
}

// ── 32. gem() rotates past a rate-limited key ─────────────────────
{
  const calls = [];
  const fetchImpl = (url) => {
    const k = new URL(url).searchParams.get('key');
    calls.push(k);
    if (k === 'K1') return Promise.resolve({ ok: false, status: 429, json: () => Promise.resolve({ error: { message: 'Resource exhausted' } }) });
    return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ candidates: [{ content: { parts: [{ text: 'OK from ' + k }] } }] }) });
  };
  const { window } = await boot({ fetchImpl, seed: { api_keys: JSON.stringify([
    { k: 'K1', added: 1, strikes: 0, cooldownUntil: 0, invalid: false, uses: 0 },
    { k: 'K2', added: 2, strikes: 0, cooldownUntil: 0, invalid: false, uses: 0 },
  ]) } });
  const out = await window.gem([{ text: 'hi' }]);
  eq('answer came from the second key', out, 'OK from K2');
  eq('both keys were tried, in order', calls.join(','), 'K1,K2');
  const pool = window.getKeyPool();
  const k1 = pool.find(e => e.k === 'K1'), k2 = pool.find(e => e.k === 'K2');
  eq('rate-limited key got a strike', k1.strikes, 1);
  ok('rate-limited key is on cooldown', k1.cooldownUntil > Date.now(), String(k1.cooldownUntil));
  ok('rate-limited key is skipped now', !window.keyIsUsable(k1));
  eq('working key stays clean', k2.strikes, 0);
  ok('working key counted a use', k2.uses >= 1);

  // Next call must skip K1 entirely.
  calls.length = 0;
  eq('second call answers again', await window.gem([{ text: 'hi' }]), 'OK from K2');
  eq('cooling key was not retried', calls.join(','), 'K2');
  window.close();
}

// ── 33. Cooldown escalates, and a 403 marks the key invalid ───────
{
  const fetchImpl = (url) => {
    const k = new URL(url).searchParams.get('key');
    if (k === 'BAD') return Promise.resolve({ ok: false, status: 403, json: () => Promise.resolve({ error: { message: 'API key not valid' } }) });
    return Promise.resolve({ ok: false, status: 429, json: () => Promise.resolve({ error: { message: 'quota' } }) });
  };
  const { window } = await boot({ lang: 'en', fetchImpl, seed: { api_keys: JSON.stringify([
    { k: 'BAD', added: 1, strikes: 0, cooldownUntil: 0, invalid: false, uses: 0 },
    { k: 'LIM', added: 2, strikes: 0, cooldownUntil: 0, invalid: false, uses: 0 },
  ]) } });
  let err = '';
  try { await window.gem([{ text: 'hi' }]); } catch(e) { err = e.message; }
  const pool = window.getKeyPool();
  ok('403 marks the key invalid', pool.find(e => e.k === 'BAD').invalid);
  ok('429 puts the other key on cooldown', pool.find(e => e.k === 'LIM').cooldownUntil > Date.now());
  ok('the error explains the pool is exhausted', /rate limited|frees up/i.test(err), err);
  eq('no usable key left', window.hasUsableApiKey(), false);

  // Escalating backoff.
  const cd = window.__read('KEY_COOLDOWNS');
  window.reviveApiKey('LIM');
  window.markKeyQuota('LIM'); const c1 = window.keyCooldownLeft(window.getKeyPool().find(e => e.k === 'LIM'));
  window.markKeyQuota('LIM'); const c2 = window.keyCooldownLeft(window.getKeyPool().find(e => e.k === 'LIM'));
  ok('first cooldown is the shortest step', Math.abs(c1 - cd[0]) < 2000, String(c1));
  ok('second cooldown is longer', c2 > c1, `${c1} -> ${c2}`);

  // Revive clears everything.
  window.reviveApiKey('BAD');
  const revived = window.getKeyPool().find(e => e.k === 'BAD');
  ok('revive clears invalid + cooldown', !revived.invalid && !revived.cooldownUntil && !revived.strikes);
  window.close();
}

// ── 34. A network failure does not blame the keys ─────────────────
{
  const { window } = await boot({ seed: { api_keys: JSON.stringify([
    { k: 'K1', added: 1, strikes: 0, cooldownUntil: 0, invalid: false, uses: 0 },
    { k: 'K2', added: 2, strikes: 0, cooldownUntil: 0, invalid: false, uses: 0 },
  ]) } });   // default fetch rejects with "Failed to fetch"
  let err = '';
  try { await window.gem([{ text: 'hi' }]); } catch(e) { err = e.message; }
  ok('reports a connectivity problem', /connection|Gemini API|GitHub Pages/i.test(err), err);
  ok('no key was penalised', window.getKeyPool().every(e => !e.invalid && !e.cooldownUntil),
     JSON.stringify(window.getKeyPool()));
  window.close();
}

// ── 35. Offline photo queue: park now, analyse later ──────────────
{
  const PROFILE = JSON.stringify({ name: 'A', kcal: 2000, goal: 'maintain', w: 80, h: 180, age: 30, gen: 'm', pr: 100, ft: 60, cb: 200 });
  let serve = false;
  const fetchImpl = (url) => serve
    ? Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ candidates: [{ content: { parts: [{
        text: '{"food":"Omelette","portion":"150 g","calories":205,"protein":14,"fat":15,"carbs":3,"description":"Two eggs"}' }] } }] }) })
    : Promise.reject(new Error('Failed to fetch'));

  const { window } = await boot({
    lang: 'en', online: false, fetchImpl,
    seed: { u: PROFILE, wts: '[]', api_keys: JSON.stringify([{ k: 'K1', added: 1, strikes: 0, cooldownUntil: 0, invalid: false, uses: 0 }]) },
  });

  eq('queue starts empty', window.queueCount(), 0);
  ok('offline is reported as the blocker', /connection/i.test(window.queueBlockedReason()), window.queueBlockedReason());
  ok('photos must wait while offline', window.photoMustWait());

  const n = await window.enqueuePhoto('data:image/jpeg;base64,QUJD', 'homemade omelette');
  eq('one photo queued', n, 1);
  eq('nothing was added to the diary yet', window.__read('log').length, 0);

  window.rH();
  const card = window.document.getElementById('pendingCard');
  ok('the pending card is visible', card.style.display !== 'none');
  ok('it shows the count', /1/.test(card.textContent), card.textContent.slice(0, 80));
  ok('it explains why it is waiting', /connection/i.test(card.textContent), card.textContent.slice(0, 160));

  // Draining while offline must be a no-op.
  await window.processQueue({});
  eq('still queued while offline', window.queueCount(), 1);

  // Back online.
  window.navigator.onLine = true;
  serve = true;
  await window.processQueue({ manual: true });
  eq('queue drained', window.queueCount(), 0);
  const log = window.__read('log');
  eq('the meal landed in the diary', log.length, 1);
  eq('name from the AI response', log[0].food, 'Omelette');
  eq('calories from the AI response', log[0].kcal, 205);
  ok('it kept the moment the photo was taken', !!log[0].time && log[0].date === window.ds(), JSON.stringify({ t: log[0].time, d: log[0].date }));
  ok('meal type derived from that time', ['breakfast','lunch','snack','dinner'].includes(log[0].mealType), log[0].mealType);
  ok('it carries an image reference', !!(log[0].imgId || log[0].img));
  ok('marked as coming from the queue', log[0].fromQueue === true);
  window.rH();
  eq('the card hides once empty', window.document.getElementById('pendingCard').style.display, 'none');
  window.close();
}

// ── 36. Queue items give up gracefully and can be retried/deleted ─
{
  const PROFILE = JSON.stringify({ name: 'A', kcal: 2000, goal: 'maintain', w: 80, h: 180, age: 30, gen: 'm', pr: 100, ft: 60, cb: 200 });
  // Always answers with unparseable text — a per-item failure, not a network one.
  const fetchImpl = () => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ candidates: [{ content: { parts: [{ text: 'sorry, no' }] } }] }) });
  const { window } = await boot({
    lang: 'en', fetchImpl,
    seed: { u: PROFILE, wts: '[]', api_keys: JSON.stringify([{ k: 'K1', added: 1, strikes: 0, cooldownUntil: 0, invalid: false, uses: 0 }]) },
  });
  await window.enqueuePhoto('data:image/jpeg;base64,QUJD', '');
  const maxAttempts = window.__read('QUEUE_MAX_ATTEMPTS');
  for (let i = 0; i < maxAttempts; i++) await window.processQueue({});
  const q = window.getQueue();
  eq('item is still queued, not silently dropped', q.length, 1);
  ok('attempts were counted', q[0].attempts >= maxAttempts, String(q[0].attempts));
  ok('item is flagged as failed', q[0].failed === true);
  eq('nothing bogus reached the diary', window.__read('log').length, 0);
  window.rH();
  ok('the card offers a retry', /↻/.test(window.document.getElementById('pendingCard').innerHTML));

  window.deleteQueueItem(q[0].id);
  eq('deleting clears the queue', window.queueCount(), 0);
  window.close();
}

// ── 37. Settings surface the pool state ───────────────────────────
{
  const PROFILE = JSON.stringify({ name: 'A', kcal: 2000, goal: 'maintain', w: 80, h: 180, age: 30, gen: 'm', pr: 100, ft: 60, cb: 200 });
  const { window } = await boot({
    lang: 'en',
    seed: { u: PROFILE, wts: '[]', api_keys: JSON.stringify([
      { k: 'AIzaSyREADYKEY_000000000000000001', added: 1, strikes: 0, cooldownUntil: 0, invalid: false, uses: 0 },
      { k: 'AIzaSyLIMITED_000000000000000002', added: 2, strikes: 1, cooldownUntil: Date.now() + 120000, invalid: false, uses: 0 },
      { k: 'AIzaSyINVALID_000000000000000003', added: 3, strikes: 0, cooldownUntil: 0, invalid: true, uses: 0 },
    ]) },
  });
  window.rSet();
  eq('subtitle counts ready keys', window.document.getElementById('sapi').textContent, 'Ready: 1 of 3');
  window.openApi();
  const rows = window.document.querySelectorAll('#keyList .key-row');
  eq('one row per key', rows.length, 3);
  ok('a ready key is marked ready', /Ready/.test(rows[0].textContent), rows[0].textContent);
  ok('a limited key shows the wait', /Rate limited/.test(rows[1].textContent), rows[1].textContent);
  ok('an invalid key is marked invalid', /Invalid/.test(rows[2].textContent), rows[2].textContent);
  ok('keys are never printed in full',
     !window.document.getElementById('keyList').innerHTML.includes('AIzaSyREADYKEY_000000000000000001'),
     'raw key leaked into the DOM');
  ok('limited and invalid rows offer a revive', window.document.querySelectorAll('#keyList .key-mini').length >= 4);
  window.closeApi();
  window.close();
}

// ── 38. The API-key bar tracks the pool, not a single key ─────────
{
  const PROFILE = JSON.stringify({ name: 'A', kcal: 2000, goal: 'maintain', w: 80, h: 180, age: 30, gen: 'm', pr: 100, ft: 60, cb: 200 });
  const { window } = await boot({ seed: { u: PROFILE, wts: '[]' } });
  window.rH();
  eq('bar shown with no keys', window.document.getElementById('abar').style.display, 'flex');
  window.addApiKey('AIzaSyTESTKEY_0000000000000000000009');
  window.rH();
  eq('bar hidden once a key exists', window.document.getElementById('abar').style.display, 'none');
  window.close();
}

// ── 39. Back / Escape peel overlays instead of leaving the app ─────
{
  const PROFILE = JSON.stringify({ name: 'A', kcal: 2000, goal: 'maintain', w: 80, h: 180, age: 30, gen: 'm', pr: 100, ft: 60, cb: 200 });
  const { window } = await boot({ seed: { u: PROFILE, wts: '[]' } });
  const doc = window.document;
  window.log.length = 0;
  window.log.push({ food: 'x', kcal: 10, prot: 1, fat: 1, carb: 1, time: '10:00', date: window.ds() });
  window.saveLog();

  eq('nothing open at rest', window.anyOverlayOpen(), false);
  eq('closeTopOverlay is a no-op when idle', window.closeTopOverlay(), false);

  // Stack: food detail → edit → confirm. Each Escape must peel exactly one.
  window.openFd(0);
  eq('detail sheet is the top overlay', window.topOverlay().sel, '#fdOv');
  window.editFd();
  eq('edit sheet is now on top', window.topOverlay().sel, '#editFoodOv');
  const esc = () => doc.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  esc();
  ok('edit sheet closed', !doc.getElementById('editFoodOv').classList.contains('on'));
  eq('detail sheet is still open underneath', window.topOverlay().sel, '#fdOv');
  eq('scroll stays locked', doc.body.style.overflow, 'hidden');
  esc();
  eq('everything closed', window.anyOverlayOpen(), false);
  eq('scroll released', doc.body.style.overflow, '');

  // The hardware back gesture arrives as popstate.
  window.openAdd();
  eq('add sheet open', window.topOverlay().sel, '#addOv');
  window.dispatchEvent(new window.PopStateEvent('popstate', { state: null }));
  eq('back closed the sheet', window.anyOverlayOpen(), false);

  // The AI screen is an overlay too — back returns Home rather than exiting.
  const nbs = [...doc.querySelectorAll('.nb')];
  const aiBtn = nbs.find(b => (b.getAttribute('onclick') || '').includes("'ai'"));
  window.goS('ai', aiBtn);
  eq('AI counts as an overlay', window.topOverlay().sel, '#ai');
  window.dispatchEvent(new window.PopStateEvent('popstate', { state: null }));
  eq('back left the AI screen', doc.getElementById('ai').style.display, 'none');
  ok('home is showing again', doc.getElementById('home').classList.contains('active'));
  window.close();
}

// ── 40. Missing sound files fall back to synthesis, never silence ──
{
  const { window } = await boot({});
  const src = readFileSync(path.join(ROOT, 'assets/js/sound.js'), 'utf8');
  const volumes = [...src.matchAll(/^\s{4}([a-z_]+):\s*[\d.]+,/gm)].map(m => m[1]);
  const synth = [...(src.match(/const SYNTH = \{([\s\S]*?)\n  \};/) || [, ''])[1].matchAll(/^\s{4}([a-z_]+):/gm)].map(m => m[1]);
  const played = [...new Set([
    ...readFileSync(path.join(ROOT, 'index.html'), 'utf8').matchAll(/SFX\.play\('([a-z_]+)'\)/g),
    ...readdirSync(path.join(ROOT, 'assets/js')).flatMap(f =>
      [...readFileSync(path.join(ROOT, 'assets/js', f), 'utf8').matchAll(/SFX\.play\('([a-z_]+)'\)/g)]),
  ].map(m => m[1]))];

  ok('every played sound has a volume', played.every(n => volumes.includes(n)),
     played.filter(n => !volumes.includes(n)).join(', '));
  ok('every played sound has a synth recipe', played.every(n => synth.includes(n)),
     played.filter(n => !synth.includes(n)).join(', '));

  // Names with no file on disk must still be covered — those were the silent ones.
  const onDisk = readdirSync(path.join(ROOT, 'sounds')).filter(f => f.endsWith('.mp3')).map(f => f.replace('.mp3', ''));
  const fileless = played.filter(n => !onDisk.includes(n));
  ok('sounds without a file are synthesised', fileless.every(n => synth.includes(n)),
     fileless.join(', '));
  ok('there really are file-less sounds to cover', fileless.length > 0, String(fileless.length));

  // Playing one must not throw even without AudioContext (jsdom).
  window.SFX.play('sheet_close');
  window.SFX.play('does_not_exist');
  ok('SFX.play never throws', true);
  window.close();
}

// ── 41. Interactions that should make a sound do ───────────────────
{
  const js = readdirSync(path.join(ROOT, 'assets/js'))
    .map(f => [f, readFileSync(path.join(ROOT, 'assets/js', f), 'utf8')]);
  const find = (file) => js.find(([f]) => f === file)?.[1] || '';
  // Search the whole function body, not a fixed-size slice: showConfirm() is
  // long enough that a short window missed the call at its end.
  const has = (file, fn, sound) => {
    const src = find(file);
    const i = src.indexOf(fn);
    if (i < 0) return false;
    const end = src.indexOf('\n}', i);
    return src.slice(i, end < 0 ? src.length : end).includes(`SFX.play('${sound}'`);
  };
  ok('closing a sheet is audible',        has('ui.js', 'function closeEd(', 'sheet_close'));
  ok('closing the model picker is audible', has('gemini.js', 'function closeModelPicker(', 'sheet_close'));
  ok('opening a confirm dialog is audible', has('confirm.js', 'function showConfirm(', 'sheet_open'));
  ok('dismissing the daily summary is audible', has('daily-ai.js', 'function dismissDailyAi(', 'sheet_close'));
  ok('a finished weekly analysis is audible', find('daily.js').includes("SFX.play('scan_success')"));
  ok('a drained offline queue is audible', find('queue.js').includes("SFX.play('scan_success')"));
  ok('a growing streak is audible', find('app.js').includes("SFX.play('streak_up')"));
}

// ── 42. No dead exports left behind ───────────────────────────────
{
  const files = readdirSync(path.join(ROOT, 'assets/js')).filter(f => f.endsWith('.js'));
  const all = files.map(f => readFileSync(path.join(ROOT, 'assets/js', f), 'utf8')).join('\n')
    + readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  for (const gone of ['FOOD_DB', 'getRecents', 'setSkeleton', 'scrollDrumTo', 'debouncedRender', 'setupNotifications', '_drumStates']) {
    ok(`"${gone}" is gone`, !all.includes(gone), gone + ' still referenced');
  }
  ok('the hold-to-repeat weight stepper is wired', all.includes('_wlogHold(this'));
  ok('steppers cancel on pointercancel', (all.match(/onpointercancel="_qtyClear\(\)"/g) || []).length === 2);
}

// ── 42. Closing a sheet normally releases the back sentinel ────────
{
  const PROFILE = JSON.stringify({ name: 'A', kcal: 2000, goal: 'maintain', w: 80, h: 180, age: 30, gen: 'm', pr: 100, ft: 60, cb: 200 });
  const { window } = await boot({ seed: { u: PROFILE, wts: '[]' } });
  let pushed = 0, went = 0;
  const realPush = window.history.pushState.bind(window.history);
  window.history.pushState = (...a) => { pushed++; return realPush(...a); };
  // Emulate the browser: back() pops the entry and fires popstate.
  try { window.history.back = () => { went++; window.dispatchEvent(new window.PopStateEvent('popstate', { state: null })); }; } catch(e) {}
  const frame = () => new Promise(r => window.requestAnimationFrame ? window.requestAnimationFrame(r) : setTimeout(r, 16));

  window.openAdd();
  eq('opening a sheet pushes one sentinel', pushed, 1);
  window.closeAdd();          // closed with ✕, not with the back gesture
  await frame();
  eq('closing it consumes the sentinel', went, 1);

  // Stacked: only one sentinel for the whole stack, released once at the end.
  pushed = 0; went = 0;
  window.log.length = 0;
  window.log.push({ food: 'x', kcal: 10, prot: 1, fat: 1, carb: 1, time: '10:00', date: window.ds() });
  window.saveLog();
  window.openFd(0);
  window.editFd();
  eq('a stack still only pushes once', pushed, 1);
  window.closeEditFd();
  await frame();
  eq('nothing released while a layer remains', went, 0);
  window.closeFd();
  await frame();
  eq('released after the last layer', went, 1);
  window.close();
}

// ── 43. Storage that silently drops writes is detected ─────────────
{
  const { window } = await boot({});
  const store = window.localStorage;
  // Emulate a private-mode WebView: setItem "succeeds" but nothing is kept.
  const realSet = store.setItem.bind(store);
  store.setItem = () => {};
  eq('a discarded write is reported as failure', window.S('probe', 'x'), false);
  eq('the cache is not poisoned', window.G('probe', 'MISSING'), 'MISSING');
  window.log.length = 0;
  window.log.push({ food: 'ghost', kcal: 1, time: '10:00', date: window.ds() });
  eq('saveLog also reports failure', window.saveLog(), false);
  store.setItem = realSet;
  eq('and works again once storage does', window.saveLog(), true);
  window.close();
}

// ── 44. THE DATA-LOSS SAFETY NET: heal from the IndexedDB mirror ────
{
  const PROFILE = JSON.stringify({ name: 'Иван', kcal: 2100, goal: 'lose', w: 80, h: 180, age: 30, gen: 'm', pr: 144, ft: 58, cb: 230 });
  const today = new Date().toDateString();
  const meals = [
    { food: 'Гречка', portion: '200г', kcal: 132, prot: 5, fat: 1, carb: 26, time: '08:30', date: today },
    { food: 'Борщ',   portion: '300г', kcal: 165, prot: 8, fat: 6, carb: 22, time: '13:10', date: today },
  ];

  // One IndexedDB shared across all three "launches" — that is the whole point:
  // localStorage is wiped, IndexedDB survives.
  const sharedIdb = IDBFactoryImpl ? new IDBFactoryImpl() : null;

  // Session one: log meals with a real IndexedDB present.
  const a = await boot({ idb: sharedIdb || false, seed: { u: PROFILE, wts: '[]' } });
  if (!a.window.indexedDB) {
    console.log('  (skipped: no IndexedDB implementation available)');
    a.window.close();
  } else {
    a.window.log.length = 0;
    a.window.log.push(...meals);
    ok('meals saved', a.window.saveLog());
    // snapshotSave() is debounced; let it land.
    await new Promise(r => setTimeout(r, 1800));
    a.window.close();

    // Session two: localStorage came back empty (evicted), IndexedDB did not.
    const b = await boot({ idb: sharedIdb });
    await new Promise(r => setTimeout(r, 600));   // init() heals on its own
    const healedLog = b.window.__read('log');
    eq('entries were restored', healedLog.length, 2);
    ok('names survived', healedLog.some(e => e.food === 'Борщ'), JSON.stringify(healedLog.map(e => e.food)));
    eq('profile was restored', b.window.__read('U')?.name, 'Иван');
    eq('restored entries are persisted again', JSON.parse(b.storage.getItem('log') || '[]').length, 2);
    ok('the user is told it happened', /восстановлено/i.test(b.window.document.getElementById('_toast')?.textContent || ''),
       b.window.document.getElementById('_toast')?.textContent);
    b.window.close();

    // Session three: a *partial* loss heals without duplicating what is there.
    const c = await boot({ idb: sharedIdb, seed: { u: PROFILE, wts: '[]', log: JSON.stringify([meals[0]]) } });
    await new Promise(r => setTimeout(r, 600));
    const merged = c.window.__read('log');
    eq('merged to the full set', merged.length, 2);
    eq('no duplicates', new Set(merged.map(e => e.food)).size, 2);
    c.window.close();
  }
}

// ── 45. Onboarding never shows through another screen ──────────────
{
  const css = readFileSync(path.join(ROOT, 'assets/css/base.css'), 'utf8');
  // `#ob` is an ID selector, so `display:flex` there out-specifies
  // `.screen{display:none}` and left the onboarding painted underneath.
  ok('#ob is hidden by default', /#ob\{display:none/.test(css), (css.match(/#ob\{[^}]*\}/) || [''])[0]);
  ok('#ob only shows when active', /#ob\.active\{display:flex/.test(css));

  const PROFILE = JSON.stringify({ name: 'A', kcal: 2000, goal: 'maintain', w: 80, h: 180, age: 30, gen: 'm', pr: 100, ft: 60, cb: 200 });
  const { window } = await boot({ seed: { u: PROFILE, wts: '[]' } });
  const doc = window.document;
  ok('onboarding is not active for a returning user', !doc.getElementById('ob').classList.contains('active'));
  // Switching screens must never leave every screen inactive, even mid-flight.
  const nbs = [...doc.querySelectorAll('.nb')];
  for (const id of ['prog', 'sett', 'home']) {
    window.goS(id, nbs.find(b => (b.getAttribute('onclick') || '').includes(`'${id}'`)) || nbs[0]);
    const active = [...doc.querySelectorAll('.screen.active')].map(e => e.id);
    eq(`exactly one screen active after ${id}`, active.length, 1);
    ok(`onboarding is not it (${id})`, active[0] !== 'ob', active.join(','));
  }
  window.close();
}

// ── 46. Theme has three states and follows the OS on "system" ──────
{
  const PROFILE = JSON.stringify({ name: 'A', kcal: 2000, goal: 'maintain', w: 80, h: 180, age: 30, gen: 'm', pr: 100, ft: 60, cb: 200 });
  const { window, storage } = await boot({ lang: 'en', seed: { u: PROFILE, wts: '[]' } });
  const doc = window.document;
  const root = doc.documentElement;

  // No stored preference means "system"; jsdom's matchMedia reports light.
  eq('defaults to system', window.themePref(), 'system');
  window.rSet();
  eq('row shows the mode', doc.getElementById('sthemeVal').textContent, 'System');

  window.cycleTheme();
  eq('system → light', storage.getItem('theme'), 'light');
  eq('applied', root.getAttribute('data-theme'), 'light');
  eq('row updated', doc.getElementById('sthemeVal').textContent, 'Light');

  window.cycleTheme();
  eq('light → dark', storage.getItem('theme'), 'dark');
  eq('applied', root.getAttribute('data-theme'), 'dark');
  eq('meta theme-color follows', doc.getElementById('tc-meta').getAttribute('content'), '#0F0E0C');

  window.cycleTheme();
  eq('dark → system', storage.getItem('theme'), 'system');

  // With "system" selected, the OS switching to dark must switch the app.
  window.matchMedia = (q) => ({
    matches: /prefers-color-scheme:\s*dark/.test(q), media: q,
    addEventListener(){}, removeEventListener(){}, addListener(){}, removeListener(){},
  });
  window.applyTheme('system');
  eq('follows a dark OS', root.getAttribute('data-theme'), 'dark');
  eq('and does not overwrite the preference', storage.getItem('theme'), 'system');

  // boot.js must resolve 'system' the same way on a cold start.
  const bootSrc = readFileSync(path.join(ROOT, 'assets/js/boot.js'), 'utf8');
  ok('boot resolves anything that is not light/dark via the OS',
     /t!=='light' && t!=='dark'/.test(bootSrc), bootSrc.slice(0, 200));
  window.close();
}

// ── 47. The Widgets settings row is gone ──────────────────────────
{
  const html = readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  ok('no widgets row in settings', !/data-i18n="set_widgets"/.test(html));
  ok('no widget.html link from settings', !/window\.open\('\.\/widget\.html'/.test(html));
  const { window } = await boot({});
  ok('its strings are gone from the dictionary', !('set_widgets' in window.I18N.ru) && !('set_widgets' in window.I18N.en));
  ok('the binary theme toggle is gone', !window.document.getElementById('themeToggle'));
  window.close();
}

// ── 48. The default model is seeded once, then never re-applied ────
{
  // Fresh install: the recommended model is written to storage.
  const a = await boot({});
  eq('seeded on first run', a.storage.getItem('model'), 'gemini-flash-lite-latest');
  a.window.close();

  // A stored choice survives, even when the live list no longer offers it.
  const b = await boot({ seed: { model: 'gemini-2.5-pro' } });
  eq('stored choice is used', b.window.__read('selModel'), 'gemini-2.5-pro');
  eq('and is not overwritten', b.storage.getItem('model'), 'gemini-2.5-pro');
  // fetchGeminiModels() keeps the selection visible; the merge step is asserted
  // on the source below.
  ok('the picker can still describe the stored model',
     b.window._modelTier({ id: 'gemini-2.5-pro' }).length > 0);
  const src = readFileSync(path.join(ROOT, 'assets/js/gemini.js'), 'utf8');
  ok('the fetched list keeps the selected model', /if\(!fresh\.some\(m=>m\.id===selModel\)\)/.test(src));
  b.window.close();
}

// ── 49. Removing a drink removes its diary entry (and vice versa) ──
{
  const PROFILE = JSON.stringify({ name: 'A', kcal: 2000, goal: 'maintain', w: 80, h: 180, age: 30, gen: 'm', pr: 100, ft: 60, cb: 200 });
  const { window, storage } = await boot({ lang: 'en', seed: { u: PROFILE, wts: '[]', water_enabled: '1' } });
  const today = window.ds();

  window.log.length = 0;
  window.addWater('milk');            // 120 kcal → also a diary entry
  eq('drink logged in the diary', window.__read('log').length, 1);
  let water = JSON.parse(storage.getItem('water_' + today) || '[]');
  eq('and in the water card', water.length, 1);
  ok('the two are linked', !!water[0].ev && window.__read('log')[0].waterEv === water[0].ev);

  // Removing it from the water card must clear the calories too.
  window.removeWaterEvent(water[0].ev);
  eq('water event removed', JSON.parse(storage.getItem('water_' + today) || '[]').length, 0);
  eq('diary entry removed with it', window.__read('log').length, 0);
  eq('and persisted', JSON.parse(storage.getItem('log') || '[]').length, 0);

  // The other direction: deleting the drink from the diary clears the water.
  window.addWater('milk');
  water = JSON.parse(storage.getItem('water_' + today) || '[]');
  eq('logged again', water.length, 1);
  window.delL(0);
  window.cfrmConfirm();
  eq('diary entry gone', window.__read('log').length, 0);
  eq('water event gone as well', JSON.parse(storage.getItem('water_' + today) || '[]').length, 0);

  // Water-only additions carry an id so they can be removed individually.
  window.addWater('water');
  const only = JSON.parse(storage.getItem('water_' + today) || '[]');
  ok('plain water has an id', !!only[0].ev);
  eq('and adds nothing to the diary', window.__read('log').length, 0);
  window.rWater();
  ok('the timeline offers a delete button',
     /water-event-del/.test(window.document.getElementById('waterEvents').innerHTML));
  window.close();
}

// ── 50. 28-day map is opaque and tolerant of a small overshoot ──────
{
  const PROFILE = JSON.stringify({ name: 'A', kcal: 2000, goal: 'maintain', w: 80, h: 180, age: 30, gen: 'm', pr: 100, ft: 60, cb: 200 });
  const day = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return d.toDateString(); };
  // One day per bucket, oldest → newest.
  const kcalFor = { 27: 400, 26: 900, 25: 1500, 24: 2000, 23: 2020, 22: 2400, 21: 2700, 20: 3100, 19: 3800 };
  const entries = Object.entries(kcalFor).map(([back, kcal]) =>
    ({ food: 'x', kcal, prot: 0, fat: 0, carb: 0, time: '12:00', date: day(Number(back)) }));
  const { window } = await boot({ seed: { u: PROFILE, wts: '[]', log: JSON.stringify(entries) } });
  window.rP();
  const cells = [...window.document.querySelectorAll('#hgrid .hcell')];
  eq('28 cells', cells.length, 28);
  const cls = (back) => cells[27 - back].className.replace('hcell', '').trim();
  eq('20% of goal → c1', cls(27), 'c1');
  eq('45% → c2', cls(26), 'c2');
  eq('75% → c3', cls(25), 'c3');
  eq('100% → c4 (on target)', cls(24), 'c4');
  eq('101% is still on target, not red', cls(23), 'c4');
  eq('120% → o1', cls(22), 'o1');
  eq('135% → o2', cls(21), 'o2');
  eq('155% → o3', cls(20), 'o3');
  eq('190% → o4', cls(19), 'o4');
  ok('the tooltip shows the percentage', /·\s*101%/.test(cells[27 - 23].getAttribute('title') || ''),
     cells[27 - 23].getAttribute('title'));

  // Every level, and the semantic chips, must be fully opaque so they read the
  // same on the page, on a card and inside a sheet.
  const css = readFileSync(path.join(ROOT, 'assets/css/base.css'), 'utf8');
  const tokens = ['--heat-0', '--heat-1', '--heat-2', '--heat-3', '--heat-4',
                  '--heat-o1', '--heat-o2', '--heat-o3', '--heat-o4',
                  '--ok2', '--warn2', '--err2', '--blue2', '--streak-bg'];
  for (const tk of tokens) {
    const vals = [...css.matchAll(new RegExp(tk + ':\\s*([^;]+);', 'g'))].map(m => m[1].trim());
    ok(`${tk} is defined`, vals.length > 0);
    ok(`${tk} is opaque everywhere`, vals.every(v => /^#[0-9a-f]{3,8}$/i.test(v) || v.startsWith('var(')),
       tk + ' = ' + vals.join(' | '));
  }
  ok('the legend uses the real cell classes', /h-sq hcell o2/.test(readFileSync(path.join(ROOT, 'index.html'), 'utf8')));
  window.close();
}

// ── 51. Re-rendering in place does not replay entrance animations ────
{
  const PROFILE = JSON.stringify({ name: 'A', kcal: 2000, goal: 'maintain', w: 80, h: 180, age: 30, gen: 'm', pr: 100, ft: 60, cb: 200 });
  const { window } = await boot({ seed: { u: PROFILE, wts: '[]', water_enabled: '1' } });
  const doc = window.document;
  const hlog = doc.getElementById('hlog');
  window.log.length = 0;
  window.log.push({ food: 'Eggs', kcal: 200, prot: 12, fat: 14, carb: 2, time: '08:00', date: window.ds() });
  window.saveLog();

  // init() already rendered once, so clear the marker to model a first paint.
  hlog.dataset.day = '';
  window.rH();
  ok('first render animates', !hlog.classList.contains('no-anim'));
  window.rH();
  ok('a second render of the same day does not', hlog.classList.contains('no-anim'));
  window.addWater('water');           // unrelated update → still no replay
  ok('an unrelated update does not re-animate', hlog.classList.contains('no-anim'));
  window.selectDay(new Date(Date.now() - 86400000).toDateString());
  ok('switching day animates again', !hlog.classList.contains('no-anim'));
  window.close();
}

// ── 52. Durable keys are mirrored, and persistence state is reported ─
{
  const state = readFileSync(path.join(ROOT, 'assets/js/state.js'), 'utf8');
  ok('the durable key list covers profile, weights, favourites, water and queue',
     /_DURABLE = \/\^\(u\|wts\|favs\|pending_photos\|water_\)/.test(state), (state.match(/_DURABLE = [^;]+/) || [''])[0]);
  ok('S() mirrors them', /_DURABLE\.test\(k\)/.test(state));
  ok('saveLog mirrors the diary', /snapshotSave\(\)/.test(state));
  ok('persistent storage is requested at startup', /requestPersistentStorage\(\)/.test(state));
  const store = readFileSync(path.join(ROOT, 'assets/js/store.js'), 'utf8');
  ok('the persistence result is kept for the dev panel', /storagePersisted/.test(store));
  const init = readFileSync(path.join(ROOT, 'assets/js/init.js'), 'utf8');
  ok('the dev panel reports it', /dev_persisted/.test(init) && /dev_backup/.test(init));
}

// ── 53. AI chat: photos, persistence, cancel, markdown ─────────────
{
  const PROFILE = JSON.stringify({ name: 'Иван', kcal: 2100, goal: 'lose', w: 80, h: 180, age: 30, gen: 'm', pr: 144, ft: 58, cb: 230 });
  const KEYS = JSON.stringify([{ k: 'K1', added: 1, strikes: 0, cooldownUntil: 0, invalid: false, uses: 0 }]);
  let reply = 'Съешь **200 г** творога.\n- белка много\n- углеводов мало\n1. сначала вода\n2. потом еда';
  let hold = null;
  const fetchImpl = () => hold
    ? new Promise(res => { hold = () => res({ ok: true, status: 200, json: () => Promise.resolve({ candidates: [{ content: { parts: [{ text: reply }] } }] }) }); })
    : Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ candidates: [{ content: { parts: [{ text: reply }] } }] }) });

  const { window, storage } = await boot({ lang: 'ru', idb: true, fetchImpl, seed: { u: PROFILE, wts: '[]', api_keys: KEYS } });
  const doc = window.document;
  const nbs = [...doc.querySelectorAll('.nb')];
  window.goS('ai', nbs.find(b => (b.getAttribute('onclick') || '').includes("'ai'")));

  // Welcome state: hero + suggestion chips, no bubbles.
  ok('hero is shown when empty', !!doc.querySelector('#aimsg .ai-hero'));
  eq('six suggestions', doc.querySelectorAll('#aimsg .ai-chip').length, 6);
  ok('hero mentions the goal', /Похудеть/.test(doc.querySelector('.ai-hero-sub').textContent),
     doc.querySelector('.ai-hero-sub').textContent);
  eq('status is online', doc.getElementById('aiStatusText').textContent, 'Онлайн');

  // Send a text message.
  doc.getElementById('aiinp').value = 'Что съесть?';
  await window.aiSend();
  eq('two bubbles', doc.querySelectorAll('#aimsg .msg').length, 2);
  ok('hero is gone', !doc.querySelector('#aimsg .ai-hero'));
  const bubble = doc.querySelector('#aimsg .msg-ai .bbl').innerHTML;
  ok('bold is rendered', /<b>200 г<\/b>/.test(bubble), bubble.slice(0, 120));
  ok('bullet list is rendered', /<ul><li>белка много<\/li>/.test(bubble), bubble);
  ok('numbered list is rendered', /<ol><li>сначала вода<\/li>/.test(bubble), bubble);
  ok('each message has a timestamp', doc.querySelectorAll('#aimsg .msg-meta').length >= 2);
  ok('AI messages offer copy', !!doc.querySelector('#aimsg .msg-ai .msg-copy'));

  // Persistence across a reopen. The transcript lives inside `ai_chats` now.
  const msgsOf = () => (JSON.parse(storage.getItem('ai_chats') || '[]')[0]?.msgs) || [];
  eq('transcript persisted', msgsOf().length, 2);
  ok('the conversation got a title from the first question',
     /Что съесть/.test(JSON.parse(storage.getItem('ai_chats'))[0].title),
     JSON.parse(storage.getItem('ai_chats'))[0].title);
  window.goS('home', nbs[0]);
  window.goS('ai', nbs.find(b => (b.getAttribute('onclick') || '').includes("'ai'")));
  eq('transcript survives reopening', doc.querySelectorAll('#aimsg .msg').length, 2);

  // Attach a photo and send it.
  window.__read("_aiPhotos = [{ dataUrl: 'data:image/jpeg;base64,QUJD', mime: 'image/jpeg' }]; _aiRenderAttach();");
  doc.getElementById('aiinp').value = '';
  await window.aiSend();
  const userMsgs = [...doc.querySelectorAll('#aimsg .msg-user')];
  const last = userMsgs[userMsgs.length - 1];
  ok('the photo appears in the bubble', !!last.querySelector('.bbl-img, img'), last.innerHTML.slice(0, 160));
  const saved = msgsOf();
  ok('the photo is stored by reference',
     saved.some(m => m.role === 'user' && (m.imgId || (m.imgIds || []).length)),
     JSON.stringify(saved.map(m => ({ r: m.role, i: m.imgId || m.imgIds }))));
  ok('the attachment chip is cleared', !doc.getElementById('aiAttach').classList.contains('on'));

  // Error bubble offers a retry.
  reply = '';
  window.__read("window.fetch = () => Promise.resolve({ok:false,status:500,json:()=>Promise.resolve({error:{message:'boom'}})});");
  doc.getElementById('aiinp').value = 'ещё раз';
  await window.aiSend();
  ok('an error bubble is shown', !!doc.querySelector('#aimsg .msg-err'));
  ok('and offers a retry', !!doc.querySelector('#aimsg .msg-retry'));

  // Clearing wipes the transcript and brings the hero back.
  window.clearAiChat();
  window.cfrmConfirm();
  eq('transcript cleared', msgsOf().length, 0);
  ok('hero is back', !!doc.querySelector('#aimsg .ai-hero'));
  window.close();
}

// ── 54. Sending can be cancelled mid-flight ────────────────────────
{
  const PROFILE = JSON.stringify({ name: 'A', kcal: 2000, goal: 'maintain', w: 80, h: 180, age: 30, gen: 'm', pr: 100, ft: 60, cb: 200 });
  const KEYS = JSON.stringify([{ k: 'K1', added: 1, strikes: 0, cooldownUntil: 0, invalid: false, uses: 0 }]);
  let release;
  const fetchImpl = () => new Promise(res => { release = () => res({ ok: true, status: 200, json: () => Promise.resolve({ candidates: [{ content: { parts: [{ text: 'late answer' }] } }] }) }); });
  const { window } = await boot({ lang: 'en', idb: true, fetchImpl, seed: { u: PROFILE, wts: '[]', api_keys: KEYS } });
  const doc = window.document;
  doc.getElementById('aiinp').value = 'hello';
  const p = window.aiSend();
  await new Promise(r => setTimeout(r, 20));
  ok('typing indicator is up', !!doc.getElementById('aiTyping'));
  ok('the send button became a stop button', doc.getElementById('aiSendBtn').classList.contains('busy'));
  eq('status says typing', doc.getElementById('aiStatusText').textContent, 'typing…');

  window.aiCancel();
  ok('typing indicator removed', !doc.getElementById('aiTyping'));
  ok('back to the send button', !doc.getElementById('aiSendBtn').classList.contains('busy'));
  release();
  await p;
  ok('the late answer is discarded', !/late answer/.test(doc.getElementById('aimsg').textContent),
     doc.getElementById('aimsg').textContent.slice(0, 120));
  window.close();
}

// ── 55. Offline mode: sheet, bar, queue-aware copy ─────────────────
{
  const PROFILE = JSON.stringify({ name: 'A', kcal: 2000, goal: 'maintain', w: 80, h: 180, age: 30, gen: 'm', pr: 100, ft: 60, cb: 200 });
  const KEYS = JSON.stringify([{ k: 'K1', added: 1, strikes: 0, cooldownUntil: 0, invalid: false, uses: 0 }]);
  const { window } = await boot({ lang: 'en', online: false, idb: true, seed: { u: PROFILE, wts: '[]', api_keys: KEYS } });
  const doc = window.document;

  // The sheet is a themed overlay now, not an always-dark inline block.
  window.showOfflineModal();
  ok('sheet opens via a class', doc.getElementById('offlOv').classList.contains('on'));
  ok('it locks scrolling', doc.body.style.overflow === 'hidden');
  ok('the retry button is localised', /Retry connection/i.test(doc.getElementById('offlRetryBtn').textContent),
     doc.getElementById('offlRetryBtn').textContent);
  ok('it says photos get queued', /queued/i.test(doc.querySelector('.offl-feat.wait').textContent),
     doc.querySelector('.offl-feat.wait').textContent);

  window.enterOffline();
  ok('sheet closed', !doc.getElementById('offlOv').classList.contains('on'));
  ok('scroll released', doc.body.style.overflow === '');
  eq('bar text with an empty queue', doc.getElementById('offlBarText').textContent, 'Offline — AI unavailable');

  // Queue a photo: the bar starts reporting it.
  await window.enqueuePhoto('data:image/jpeg;base64,QUJD', '');
  window.__read('_applyOfflineUI(true)');
  ok('bar counts queued photos', /1 photo/.test(doc.getElementById('offlBarText').textContent),
     doc.getElementById('offlBarText').textContent);

  // The AI composer explains itself instead of the tab going dead.
  ok('composer notice is in the DOM', !!doc.querySelector('.ai-offline-note'));
  eq('AI status says offline', doc.getElementById('aiStatusText').textContent, 'No connection — waiting');

  // Coming back online clears everything and drains the queue.
  window.navigator.onLine = true;
  await window.retryConnection(true);
  ok('offline flag cleared', !doc.documentElement.classList.contains('is-offline'));
  ok('bar hidden', !doc.getElementById('offlBar').classList.contains('on'));
  window.close();
}

// ── 56. Goal chime fires once per day, not on every visit ──────────
{
  const PROFILE = JSON.stringify({ name: 'A', kcal: 500, goal: 'maintain', w: 80, h: 180, age: 30, gen: 'm', pr: 100, ft: 60, cb: 200 });
  const today = new Date().toDateString();
  const yday = new Date(Date.now() - 86400000).toDateString();
  const log = JSON.stringify([
    { food: 'x', kcal: 600, prot: 0, fat: 0, carb: 0, time: '12:00', date: today },
    { food: 'y', kcal: 100, prot: 0, fat: 0, carb: 0, time: '12:00', date: yday },
  ]);
  const { window, storage } = await boot({ seed: { u: PROFILE, wts: '[]', log } });
  let plays = [];
  window.__read('SFX').play = (n) => plays.push(n);
  // init() already rendered once and marked the day; undo that to model the
  // moment the goal is actually crossed.
  storage.removeItem('goal_hit_' + today);
  window.Ginvalidate('goal_hit_' + today);

  window.rH();
  ok('chime plays on the crossing', plays.includes('goal_reached'), plays.join(','));
  ok('the day is marked', storage.getItem('goal_hit_' + today) === '1');

  // Re-render, switch days and come back: silence.
  plays = [];
  window.rH();
  window.selectDay(yday);
  window.selectDay(today);
  window.rH();
  ok('no repeat on re-render or day switching', !plays.includes('goal_reached'), plays.join(','));
  window.close();

  // A fresh launch (sessionStorage empty, localStorage kept) must also stay quiet.
  const again = await boot({ seed: { u: PROFILE, wts: '[]', log, ['goal_hit_' + today]: '1' } });
  const plays2 = [];
  again.window.__read('SFX').play = (n) => plays2.push(n);
  again.window.rH();
  ok('no repeat after a restart', !plays2.includes('goal_reached'), plays2.join(','));
  again.window.close();
}

// ── 57. Onboarding date picker opens on today ──────────────────────
{
  const { window } = await boot({});
  window.openDrum('ob');
  const now = new Date();
  eq('day is today', window.__read('_drumDay'), now.getDate());
  eq('month is this month', window.__read('_drumMonth'), now.getMonth() + 1);
  eq('year is this year', window.__read('_drumYear'), now.getFullYear());

  // The year wheel reaches the current year — it used to stop five years short,
  // which made a recent birth date impossible to enter.
  const years = [...window.document.querySelectorAll('#drum_y .drum-item')].map(e => e.textContent);
  eq('newest selectable year is this year', years[0], String(now.getFullYear()));
  ok('and it goes back a lifetime', years.includes(String(now.getFullYear() - 120)), years.at(-1));

  // The day wheel follows the month: February has no 30th.
  window.__read("_drumYear = 2023; _drumMonth = 3; _drumDay = 31; _syncDrumDays();");
  const days = [...window.document.querySelectorAll('#drum_d .drum-item')];
  ok('a 31-day month offers every day', !days.some(d => d.classList.contains('off')));
  window.__read("_drumMonth = 2; _syncDrumDays();");
  eq('February dims the 29th in a common year', days[28].classList.contains('off'), true);
  eq('and pulls the selection back to the 28th', window.__read('_drumDay'), 28);
  window.__read("_drumYear = 2024; _syncDrumDays();");
  eq('a leap year offers the 29th', days[28].classList.contains('off'), false);
  window.close();
}

// ── 58. Fresh install records the system theme explicitly ──────────
{
  const { window, storage } = await boot({});
  eq('nothing stored before it is asked for', storage.getItem('theme'), null);
  eq('preference resolves to system', window.themePref(), 'system');
  eq('and is now recorded', storage.getItem('theme'), 'system');
  window.close();
}

// ── 59. Text and barcode can be queued offline too ─────────────────
{
  const PROFILE = JSON.stringify({ name: 'A', kcal: 2000, goal: 'maintain', w: 80, h: 180, age: 30, gen: 'm', pr: 100, ft: 60, cb: 200 });
  const KEYS = JSON.stringify([{ k: 'K1', added: 1, strikes: 0, cooldownUntil: 0, invalid: false, uses: 0 }]);
  let serve = false;
  const fetchImpl = (url) => {
    if (!serve) return Promise.reject(new Error('Failed to fetch'));
    if (String(url).includes('openfoodfacts')) {
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({
        status: 1, product: { product_name: 'Chips', product_name_en: 'Chips', brands: 'Lay\'s',
          nutriments: { 'energy-kcal_100g': 530, proteins_100g: 6, fat_100g: 30, carbohydrates_100g: 53 } } }) });
    }
    return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ candidates: [{ content: { parts: [{
      text: '{"food":"Oatmeal","portion":"200 g","calories":180,"protein":6,"fat":3,"carbs":32,"description":"Oats"}' }] } }] }) });
  };
  const { window, storage } = await boot({ lang: 'en', online: false, idb: true, fetchImpl, seed: { u: PROFILE, wts: '[]', api_keys: KEYS } });
  const doc = window.document;

  // Text tab, offline.
  doc.getElementById('txinp').value = 'a bowl of oatmeal';
  await window.doText();
  eq('text entry queued', window.queueCount(), 1);
  eq('nothing in the diary yet', window.__read('log').length, 0);
  eq('kind recorded', window.getQueue()[0].kind, 'text');

  // Barcode by hand, offline.
  doc.getElementById('bc_manual').value = '4600000000001';
  await window.doBarcodeManual();
  eq('barcode queued too', window.queueCount(), 2);
  ok('code recorded', window.getQueue().some(r => r.kind === 'barcode' && r.code === '4600000000001'),
     JSON.stringify(window.getQueue().map(r => [r.kind, r.code])));

  window.rH();
  const card = doc.getElementById('pendingCard');
  ok('both show in the pending card', /oatmeal/i.test(card.textContent) && /4600000000001/.test(card.textContent),
     card.textContent.replace(/\s+/g, ' ').slice(0, 200));

  // Back online: both resolve into diary entries.
  window.navigator.onLine = true;
  serve = true;
  await window.processQueue({ manual: true });
  eq('queue drained', window.queueCount(), 0);
  const names = window.__read('log').map(e => e.food);
  ok('the text entry landed', names.some(n => /Oatmeal/.test(n)), names.join(', '));
  ok('the barcode entry landed', names.some(n => /Chips/.test(n)), names.join(', '));
  window.close();
}

// ── 60. AI usage is recorded and summarised ────────────────────────
{
  const PROFILE = JSON.stringify({ name: 'A', kcal: 2000, goal: 'maintain', w: 80, h: 180, age: 30, gen: 'm', pr: 100, ft: 60, cb: 200 });
  const KEYS = JSON.stringify([{ k: 'K1', added: 1, strikes: 0, cooldownUntil: 0, invalid: false, uses: 0 }]);
  const fetchImpl = () => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({
    candidates: [{ content: { parts: [{ text: 'ok' }] } }],
    usageMetadata: { promptTokenCount: 1200, candidatesTokenCount: 300, totalTokenCount: 1500 },
  }) });
  const { window, storage } = await boot({ lang: 'en', fetchImpl, seed: { u: PROFILE, wts: '[]', api_keys: KEYS } });
  eq('nothing recorded yet', window.getUsage().req, 0);

  await window.gem([{ text: 'hi' }]);
  const u = window.getUsage();
  eq('one request', u.req, 1);
  eq('prompt tokens', u.in, 1200);
  eq('response tokens', u.out, 300);
  eq('today is broken out', u.days[window.ds()].req, 1);
  ok('per-model breakdown', Object.keys(u.models).length === 1, JSON.stringify(u.models));
  eq('persisted', JSON.parse(storage.getItem('ai_usage')).req, 1);

  window.rSet();
  ok('settings row summarises it', /1 req · 1\.5k tokens/.test(window.document.getElementById('susage').textContent),
     window.document.getElementById('susage').textContent);

  window.openUsage();
  const body = window.document.getElementById('usageBody').textContent;
  ok('sheet shows the totals', /1500|1\.5k/.test(body), body.slice(0, 200));
  ok('and a 7-day chart', window.document.querySelectorAll('#usageBody .usage-bar').length === 7);
  eq('compact formatting', window.fmtCount(12345), '12k');
  eq('compact formatting, small', window.fmtCount(1500), '1.5k');

  window.resetUsage();
  window.cfrmConfirm();
  eq('reset clears the counters', window.getUsage().req, 0);
  window.closeUsage();
  window.close();
}

// ── 61. Multiple conversations: switch, delete, expire ─────────────
{
  const PROFILE = JSON.stringify({ name: 'A', kcal: 2000, goal: 'maintain', w: 80, h: 180, age: 30, gen: 'm', pr: 100, ft: 60, cb: 200 });
  const old = Date.now() - 40 * 86400000;      // older than the 30-day TTL
  const chats = JSON.stringify([
    { id: 'c1', title: 'Recent one', at: Date.now() - 3600e3, msgs: [{ role: 'user', text: 'Recent one', at: '10:00' }, { role: 'ai', text: 'sure', at: '10:00' }] },
    { id: 'c2', title: 'Older one',  at: Date.now() - 5 * 86400e3, msgs: [{ role: 'user', text: 'Older one', at: '09:00' }] },
    { id: 'c3', title: 'Ancient',    at: old, msgs: [{ role: 'user', text: 'Ancient', at: '08:00' }] },
  ]);
  const { window, storage } = await boot({ lang: 'en', idb: true, seed: { u: PROFILE, wts: '[]', ai_chats: chats, ai_chat_cur: 'c1' } });
  const doc = window.document;
  const nbs = [...doc.querySelectorAll('.nb')];
  window.goS('ai', nbs.find(b => (b.getAttribute('onclick') || '').includes("'ai'")));

  eq('stale conversation expired', window.__read('aiChats').length, 2);
  ok('the expiry was persisted', !/Ancient/.test(storage.getItem('ai_chats')));
  eq('the stored current chat is open', window.__read('aiChatId'), 'c1');
  ok('its messages are rendered', /Recent one/.test(doc.getElementById('aimsg').textContent));

  window.openAiList();
  eq('two rows listed', doc.querySelectorAll('#aiListBody .ai-list-row').length, 2);
  ok('the open one is marked', !!doc.querySelector('#aiListBody .ai-list-row.on'));
  ok('a TTL note is shown', /30 days/.test(doc.getElementById('aiListBody').textContent));

  window.aiOpenChat('c2');
  eq('switched', window.__read('aiChatId'), 'c2');
  ok('the other transcript is shown', /Older one/.test(doc.getElementById('aimsg').textContent));
  eq('the choice is remembered', storage.getItem('ai_chat_cur'), 'c2');

  window.aiNewChat();
  eq('a new empty draft', window.__read('aiChat').length, 0);
  ok('hero shown for the empty draft', !!doc.querySelector('#aimsg .ai-hero'));
  // A blank draft is not stored until it has a message.
  eq('list still has two', JSON.parse(storage.getItem('ai_chats')).length, 2);

  window.openAiList();
  window.aiDeleteChat('c1');
  window.cfrmConfirm();
  eq('deleted by hand', JSON.parse(storage.getItem('ai_chats')).length, 1);
  ok('the survivor is the other one', /Older one/.test(storage.getItem('ai_chats')));
  window.closeAiList();
  window.close();
}

// ── 62. Legacy single transcript migrates into a conversation ──────
{
  const PROFILE = JSON.stringify({ name: 'A', kcal: 2000, goal: 'maintain', w: 80, h: 180, age: 30, gen: 'm', pr: 100, ft: 60, cb: 200 });
  const legacy = JSON.stringify([{ role: 'user', text: 'Old question', at: '12:00' }, { role: 'ai', text: 'Old answer', at: '12:01' }]);
  const { window, storage } = await boot({ lang: 'en', idb: true, seed: { u: PROFILE, wts: '[]', ai_chat: legacy } });
  const nbs = [...window.document.querySelectorAll('.nb')];
  window.goS('ai', nbs.find(b => (b.getAttribute('onclick') || '').includes("'ai'")));
  eq('one conversation created', window.__read('aiChats').length, 1);
  eq('messages carried over', window.__read('aiChat').length, 2);
  ok('rendered', /Old question/.test(window.document.getElementById('aimsg').textContent));
  eq('the legacy key is emptied', storage.getItem('ai_chat'), '[]');
  window.close();
}

// ── 63. Image decoding falls back instead of refusing the photo ────
{
  const src = readFileSync(path.join(ROOT, 'assets/js/gemini.js'), 'utf8');
  ok('createImageBitmap is tried first', /_decodeViaBitmap/.test(src));
  ok('the <img> decoder is the fallback', /_decodeViaImage/.test(src));
  ok('undecodable but valid bytes pass through', /IMG_RAW_MAX_BYTES/.test(src));
  ok('heic/heif are accepted', /heic\|heif/.test(src));
  ok('the declared MIME type follows the file', /function b64Mime/.test(src));
  const html = readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  ok('the chat offers a camera input', /id="aiCamInput"[^>]*capture="environment"/.test(html));
  ok('and a source picker', /id="picSrcOv"/.test(html));
}

// ── 64. Several photos in one message ──────────────────────────────
{
  const PROFILE = JSON.stringify({ name: 'A', kcal: 2000, goal: 'maintain', w: 80, h: 180, age: 30, gen: 'm', pr: 100, ft: 60, cb: 200 });
  const KEYS = JSON.stringify([{ k: 'K1', added: 1, strikes: 0, cooldownUntil: 0, invalid: false, uses: 0 }]);
  let sentParts = null;
  const fetchImpl = (url, opts) => {
    sentParts = JSON.parse(opts.body).contents.at(-1).parts;
    return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ candidates: [{ content: { parts: [{ text: 'three plates' }] } }] }) });
  };
  const { window } = await boot({ lang: 'en', idb: true, fetchImpl, seed: { u: PROFILE, wts: '[]', api_keys: KEYS } });
  const doc = window.document;
  const nbs = [...doc.querySelectorAll('.nb')];
  window.goS('ai', nbs.find(b => (b.getAttribute('onclick') || '').includes("'ai'")));

  ok('the gallery input accepts several files',
     doc.getElementById('aiPhotoInput').hasAttribute('multiple'));

  // Attach three.
  window.__read(`_aiPhotos = [
    { dataUrl: 'data:image/jpeg;base64,QQ==', mime: 'image/jpeg' },
    { dataUrl: 'data:image/jpeg;base64,Qg==', mime: 'image/jpeg' },
    { dataUrl: 'data:image/png;base64,Qw==',  mime: 'image/png'  }];
    _aiRenderAttach();`);
  eq('three thumbnails in the strip', doc.querySelectorAll('#aiAttachStrip .ai-attach-thumb').length, 3);
  ok('the chip is visible', doc.getElementById('aiAttach').classList.contains('on'));
  eq('the count is spelled out', doc.getElementById('aiAttachTitle').textContent, '3 photos attached');

  // Removing one leaves the rest.
  window.aiRemovePhoto(1);
  eq('two left', window.__read('_aiPhotos').length, 2);
  eq('strip redrawn', doc.querySelectorAll('#aiAttachStrip .ai-attach-thumb').length, 2);

  // Send without text: one inline_data part per photo, plus the fallback question.
  await window.aiSend();
  const imgParts = sentParts.filter(p2 => p2.inline_data);
  eq('both images were sent', imgParts.length, 2);
  eq('the second keeps its own MIME type', imgParts[1].inline_data.mime_type, 'image/png');
  ok('a question was added for a text-less send', /these photos/i.test(sentParts.at(-1).text), sentParts.at(-1).text);

  // The bubble shows a grid, and both ids are persisted.
  const userMsg = [...doc.querySelectorAll('#aimsg .msg-user')].at(-1);
  eq('two images in the bubble', userMsg.querySelectorAll('.bbl-imgs .bbl-img').length, 2);
  const msgs = window.__read('aiChat');
  eq('both references stored', msgs.find(m => m.role === 'user').imgIds.length, 2);
  ok('the composer is empty again', !window.__read('_aiPhotos').length);
  ok('chip hidden again', !doc.getElementById('aiAttach').classList.contains('on'));

  // The cap is enforced.
  const max = window.__read('AI_PHOTOS_MAX');
  window.__read(`_aiPhotos = Array.from({length: ${max}}, () => ({ dataUrl: 'data:image/jpeg;base64,QQ==', mime: 'image/jpeg' })); _aiRenderAttach();`);
  await window.aiOnPhoto({ target: { files: [new window.File(['x'], 'a.jpg', { type: 'image/jpeg' })], value: '' } });
  eq('cannot exceed the cap', window.__read('_aiPhotos').length, max);
  window.close();
}

// ── 65. A legacy single-image message still renders ────────────────
{
  const PROFILE = JSON.stringify({ name: 'A', kcal: 2000, goal: 'maintain', w: 80, h: 180, age: 30, gen: 'm', pr: 100, ft: 60, cb: 200 });
  const chats = JSON.stringify([{ id: 'c1', title: 'Old', at: Date.now(), msgs: [
    { role: 'user', text: 'look', at: '10:00', imgId: 'legacy-1' },
    { role: 'ai', text: 'ok', at: '10:00' },
  ] }]);
  const { window } = await boot({ lang: 'en', idb: true, seed: { u: PROFILE, wts: '[]', ai_chats: chats, ai_chat_cur: 'c1' } });
  const nbs = [...window.document.querySelectorAll('.nb')];
  window.goS('ai', nbs.find(b => (b.getAttribute('onclick') || '').includes("'ai'")));
  const userMsg = window.document.querySelector('#aimsg .msg-user');
  eq('single image renders without the grid', userMsg.querySelectorAll('.bbl-imgs').length, 0);
  eq('and still shows one image', userMsg.querySelectorAll('.bbl-img').length, 1);
  window.close();
}


// ── 66. Meal windows are editable and everything follows them ─────
{
  const PROFILE = JSON.stringify({ name: 'A', kcal: 2000, goal: 'maintain', w: 80, h: 180, age: 30, gen: 'm', pr: 100, ft: 60, cb: 200 });
  const { window, storage } = await boot({ lang: 'en', seed: { u: PROFILE, wts: '[]' } });

  // Defaults reproduce the behaviour the hard-coded version had.
  eq('default windows', window.mealWindowsSummary(), '06:00 · 11:00 · 14:00 · 18:00');
  eq('08:00 is breakfast', window.getMealType('08:00'), 'breakfast');
  eq('03:00 is a snack', window.getMealType('03:00'), 'snack');

  // A night-shift schedule: breakfast at 19:00.
  ok('saving accepts an ascending set',
     window.saveMealWindows({ breakfast: '19:00', lunch: '23:00', snack: '02:00', dinner: '05:00' }) === false,
     'times must ascend within the day');
  ok('an ascending set is stored',
     window.saveMealWindows({ breakfast: '09:30', lunch: '13:00', snack: '16:00', dinner: '20:30' }));
  eq('19:00 is now a snack', window.getMealType('19:00'), 'snack');
  eq('21:00 is now dinner', window.getMealType('21:00'), 'dinner');
  eq('10:00 is now breakfast', window.getMealType('10:00'), 'breakfast');
  eq('08:00 falls before breakfast → snack', window.getMealType('08:00'), 'snack');
  eq('the settings row summarises them', window.mealWindowsSummary(), '09:30 · 13:00 · 16:00 · 20:30');

  // Out-of-order storage is repaired rather than breaking the timeline.
  storage.setItem('meal_windows', JSON.stringify({ breakfast: '12:00', lunch: '07:00', snack: 'nonsense', dinner: '18:00' }));
  const repaired = window.getMealWindows();
  const mins = window.__read('MEAL_KEYS').map(k => window.hmToMins(repaired[k]));
  ok('repaired windows still ascend', mins.every((m, i) => i === 0 || m > mins[i - 1]), JSON.stringify(repaired));
  ok('every key survives', window.__read('MEAL_KEYS').every(k => /^\d\d:\d\d$/.test(repaired[k])), JSON.stringify(repaired));

  // Diary grouping uses them.
  storage.setItem('meal_windows', JSON.stringify({ breakfast: '09:30', lunch: '13:00', snack: '16:00', dinner: '20:30' }));
  window.__read(`log.length = 0; log.push({food:'Late plate',kcal:400,prot:10,fat:10,carb:40,time:'21:00',date:ds()}); saveLog();`);
  window.rH();
  const groups = [...window.document.querySelectorAll('#hlog .meal-group')].map(g => g.dataset.meal);
  ok('a 21:00 meal groups under dinner', groups.includes('dinner'), groups.join(','));
  // With custom windows the header spells out the hours it covers.
  const range = window.document.querySelector('#hlog .meal-group-range');
  ok('the group header shows its window', !!range && /20:30/.test(range.textContent), range?.textContent);
  window.saveMealWindows(window.__read('MEAL_WINDOW_DEFAULTS'));
  window.rH();
  ok('and stays out of the way on the defaults',
     !window.document.querySelector('#hlog .meal-group-range'));
  window.__read("S('meal_windows', JSON.stringify({breakfast:'09:30',lunch:'13:00',snack:'16:00',dinner:'20:30'}))");

  // The sheet renders, validates live and refuses to save an out-of-order set.
  window.openMealTimes();
  eq('four rows', window.document.querySelectorAll('#mealList .ml-row').length, 4);
  const inp = window.document.getElementById('mlInp_lunch');
  inp.value = '08:00';                       // earlier than breakfast
  window.onMealTimeInput('lunch');
  ok('the warning shows', window.document.getElementById('mealWarn').classList.contains('on'));
  ok('saving is blocked', window.document.getElementById('mealSaveBtn').disabled);
  inp.value = '13:00';
  window.onMealTimeInput('lunch');
  ok('and clears again', !window.document.getElementById('mealWarn').classList.contains('on'));
  window.resetMealTimes();
  eq('reset restores the default', window.document.getElementById('mlInp_breakfast').value, '06:00');
  window.saveMealTimes();
  eq('the default set is saved', window.mealWindowsSummary(), '06:00 · 11:00 · 14:00 · 18:00');
  window.close();
}

// ── 67. An encoded image and its declared MIME always agree ───────
{
  const { window } = await boot({ lang: 'en' });

  // When the canvas path succeeds the result is a JPEG and must say so. The old
  // code declared the *original* type, which the API refuses as an invalid
  // image — that is why re-encoded PNG screenshots failed. The canvas stub also
  // returns a very short data URL, which the old 512-character sanity check
  // rejected outright.
  const png = new window.File([new Uint8Array([0x89, 0x50, 0x4E, 0x47, 13, 10, 26, 10])], 's.png', { type: 'image/png' });
  const enc = await window.encodeImage(png);
  eq('a re-encoded payload is declared as JPEG', enc.mime, 'image/jpeg');
  eq('a small image is not rejected as empty', enc.data, 'QUJD');
  eq('b64Mime agrees with what was produced', window.b64Mime(png), enc.mime);
  eq('b64() returns the same payload', await window.b64(png), enc.data);

  // The pass-through branch declares what the *bytes* are, not what the picker
  // claimed — Android document providers routinely report octet-stream (or
  // nothing) for an ordinary screenshot.
  const sniff = (bytes) => window._sniffMime(bytes);
  eq('PNG magic', sniff([0x89, 0x50, 0x4E, 0x47, 13, 10, 26, 10]), 'image/png');
  eq('JPEG magic', sniff([0xFF, 0xD8, 0xFF, 0xE0]), 'image/jpeg');
  eq('GIF magic', sniff([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]), 'image/gif');
  eq('WebP magic', sniff([...'RIFF????WEBPVP8 '].map(c => c.charCodeAt(0))), 'image/webp');
  eq('HEIC magic', sniff([...'????ftypheic....'].map(c => c.charCodeAt(0))), 'image/heic');
  eq('AVIF magic', sniff([...'????ftypavif....'].map(c => c.charCodeAt(0))), 'image/avif');
  eq('a PDF is not an image', sniff([...'%PDF-1.4'].map(c => c.charCodeAt(0))), '');
  ok('every sniffed type is one the API accepts',
     ['image/png','image/jpeg','image/gif','image/webp','image/heic','image/avif']
       .every(m => window.__read('IMG_RAW_OK').test(m)));
  eq('bytes are read back out of base64', window._sniffMime(window._b64Head('iVBORw0KGgo=')), 'image/png');
  eq('a data URL reports its own type', window.dataUrlMime('data:image/webp;base64,AA=='), 'image/webp');

  // The canvas sanity check: a real JPEG data URL passes at any size, an empty
  // canvas does not.
  ok('a short JPEG data URL is accepted', !!window._jpegPayload('data:image/jpeg;base64,QUJDRA=='));
  ok('an empty canvas is still rejected', !window._jpegPayload('data:,'));
  ok('a PNG data URL is not mistaken for JPEG', !window._jpegPayload('data:image/png;base64,QUJDRA=='));

  // Both refusal messages exist in both languages.
  ok('there is a message for a non-image file',
     ['err_photo_not_image', 'err_photo_unsupported', 'err_photo_too_big', 'err_photo_no_food']
       .every(k => k in window.I18N.ru && k in window.I18N.en));
  window.close();
}

// ── 68. The pending card reports progress and reasons ─────────────
{
  const PROFILE = JSON.stringify({ name: 'A', kcal: 2000, goal: 'maintain', w: 80, h: 180, age: 30, gen: 'm', pr: 100, ft: 60, cb: 200 });
  const fetchImpl = () => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ candidates: [{ content: { parts: [{ text: 'nope' }] } }] }) });
  const { window } = await boot({
    lang: 'en', fetchImpl,
    seed: { u: PROFILE, wts: '[]', api_keys: JSON.stringify([{ k: 'K1', added: 1, strikes: 0, cooldownUntil: 0, invalid: false, uses: 0 }]) },
  });
  await window.enqueuePhoto('data:image/jpeg;base64,QUJD', 'soup');
  window.rH();
  const card = window.document.getElementById('pendingCard');
  ok('the row carries its id for the exit animation', /data-qid="q/.test(card.innerHTML));
  ok('the header badges the count', /pq-badge/.test(card.innerHTML));
  ok('each row has a status dot', /pq-dot/.test(card.innerHTML));

  const max = window.__read('QUEUE_MAX_ATTEMPTS');
  for (let i = 0; i < max; i++) await window.processQueue({});
  window.rH();
  const html = window.document.getElementById('pendingCard').innerHTML;
  ok('a failed row is marked', /pq-row bad/.test(html));
  ok('and says what went wrong', /pq-state bad[^>]*>[\s\S]{0,400}·/.test(html), html.slice(0, 400));
  ok('the header counts the failures', /failed/i.test(window.document.querySelector('.pq-sub').textContent),
     window.document.querySelector('.pq-sub').textContent);
  window.close();
}

// ── 69. The offline sheet says how much is waiting ────────────────
{
  const PROFILE = JSON.stringify({ name: 'A', kcal: 2000, goal: 'maintain', w: 80, h: 180, age: 30, gen: 'm', pr: 100, ft: 60, cb: 200 });
  const { window } = await boot({ lang: 'en', online: false, seed: { u: PROFILE, wts: '[]' } });
  const chip = window.document.getElementById('offlQueue');
  window.showOfflineModal();
  ok('no chip with an empty queue', chip.hidden);
  await window.enqueuePhoto('data:image/jpeg;base64,QUJD', '');
  window.showOfflineModal();
  ok('the chip appears once something is queued', !chip.hidden);
  ok('and states the count', /1/.test(window.document.getElementById('offlQueueTxt').textContent),
     window.document.getElementById('offlQueueTxt').textContent);
  ok('the bar advertises the queue', window.document.getElementById('offlBar').classList.contains('has-queue'));
  window.close();
}

// ── 70. Every t()/tf() key in the source exists in both languages ─
{
  const { window } = await boot({ lang: 'en' });
  const files = readdirSync(path.join(ROOT, 'assets/js')).filter(f => f.endsWith('.js'));
  const missing = new Set();
  const used = new Set();
  for (const f of files) {
    const src = readFileSync(path.join(ROOT, 'assets/js', f), 'utf8');
    // Only whole literals — `t('pref_' + k)` is a family, checked separately.
    for (const m of src.matchAll(/\bt(?:f)?\(\s*'([a-z0-9_]+)'\s*[),]/g)) used.add(m[1]);
  }
  for (const k of used) {
    if (!(k in window.I18N.ru) || !(k in window.I18N.en)) missing.add(k);
  }
  ok('t() keys are all defined', missing.size === 0, [...missing].join(', '));
  ok('the scan actually found keys', used.size > 150, String(used.size));

  // Keys built by concatenation, one family at a time.
  const family = (pre, parts) => parts.map(p2 => pre + p2)
    .filter(k => !(k in window.I18N.ru) || !(k in window.I18N.en));
  ok('every meal label exists', family('meal_', window.__read('MEAL_KEYS')).length === 0,
     family('meal_', window.__read('MEAL_KEYS')).join(', '));
  ok('every theme label exists', family('theme_', ['light', 'dark', 'system']).length === 0,
     family('theme_', ['light', 'dark', 'system']).join(', '));
  window.close();
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) {
  console.log('\nFailures:');
  failures.forEach(f => console.log('  ✗ ' + f));
  process.exit(1);
}
console.log('All good.');
process.exit(0);
