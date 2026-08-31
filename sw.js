/*!
 * CalSnap — © 2024–2026 RJV. All rights reserved.
 * Proprietary. Reviews, videos and screenshots are welcome; copying,
 * redistributing or republishing this code is not. See LICENSE.
 * https://github.com/rjv-vi/CalSnap
 */
// ═══════════════════════════════════════════════════
// CALSNAP SERVICE WORKER
// • Precache all sounds + icons + manifest
// • Stale-while-revalidate for HTML/JSON
// • Background notifications via Periodic Sync
// • Push handler ready for future server push
// • Notification click focuses existing tab + navigates if URL differs
// • Navigation Preload speeds up the very first network-first nav request
// ═══════════════════════════════════════════════════

const CACHE = 'calsnap-v15';
const NOTIF_CACHE = 'calsnap-notif';
const API_CACHE = 'calsnap-api-v1';
// Hard cap so a single user runaway (lots of barcodes) cannot grow the API
// cache without bound on disk-constrained devices.
const API_CACHE_MAX_ENTRIES = 200;

// TTL for API caches (ms). After expiry the entry is treated as stale.
const OFF_TTL = 24 * 60 * 60 * 1000; // OpenFoodFacts product info — 24h
const GEM_TTL = 60 * 60 * 1000;      // Gemini responses — 1h

function _stamped(res){
  // Add a custom header carrying the cache time so we can decide freshness
  // without parsing Date headers (some upstreams omit them).
  const h = new Headers(res.headers);
  h.set('x-cs-cached-at', Date.now().toString());
  return new Response(res.clone().body, { status: res.status, statusText: res.statusText, headers: h });
}
function _isFresh(res, ttl){
  if(!res) return false;
  const at = parseInt(res.headers.get('x-cs-cached-at') || '0', 10);
  return at && (Date.now() - at) < ttl;
}

const ICONS = [
  './icons/icon-72.png',  './icons/icon-96.png',
  './icons/icon-128.png', './icons/icon-144.png',
  './icons/icon-152.png', './icons/icon-192.png',
  './icons/icon-384.png', './icons/icon-512.png',
];

// Keep this list in sync with the files actually present in ./sounds/.
// Names that don't exist on disk produced a 404 on every install and a wasted
// network round-trip on every first playback.
const SOUNDS = [
  'add_food','ai_error','ai_reply','ai_send','back','btn_tap','card_tap','copy',
  'delete','drum_confirm','drum_tick','error','install','notif_save',
  'ob_finish','photo_snap','reset_confirm','save','scan_success','select',
  'sheet_open','tab_switch','toggle','water_add','water_undo','weight_log',
].map(n => `./sounds/${n}.mp3`);

const CSS_FILES = [
  './assets/css/base.css',
  './assets/css/components.css',
  './assets/css/screens.css',
  './assets/css/polish.css',
];

const JS_FILES = [
  './assets/js/boot.js',
  './assets/js/sw-register.js',
  './assets/js/sound.js',
  './assets/js/i18n.js',
  './assets/js/store.js',
  './assets/js/state.js',
  './assets/js/keys.js',
  './assets/js/usage.js',
  './assets/js/ux.js',
  './assets/js/app.js',
  './assets/js/gemini.js',
  './assets/js/ui.js',
  './assets/js/drum.js',
  './assets/js/confirm.js',
  './assets/js/haptic.js',
  './assets/js/bmi.js',
  './assets/js/water.js',
  './assets/js/daily.js',
  './assets/js/daily-ai.js',
  './assets/js/share.js',
  './assets/js/notif.js',
  './assets/js/about.js',
  './assets/js/queue.js',
  './assets/js/fullscreen.js',
  './assets/js/init.js',
];

const STATIC_ASSETS = [
  './',
  './index.html',
  './widget.html',
  './manifest.json',
  ...ICONS,
  ...SOUNDS,
  ...CSS_FILES,
  ...JS_FILES,
];

// ── Install ──────────────────────────────────────
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => Promise.allSettled(STATIC_ASSETS.map(url => c.add(url).catch(() => {}))))
      .then(() => self.skipWaiting())
  );
});

// ── Activate ─────────────────────────────────────
self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    // Enable Navigation Preload — Chrome can start fetching the navigation
    // request in parallel with SW boot, shaving ~50-200 ms off the first
    // load after activation when the user is online.
    if (self.registration.navigationPreload) {
      try { await self.registration.navigationPreload.enable(); } catch(e) {}
    }
    const keys = await caches.keys();
    await Promise.all(keys
      .filter(k => k.startsWith('calsnap-') && k !== CACHE && k !== NOTIF_CACHE && k !== API_CACHE)
      .map(k => caches.delete(k)));
    // Trim the API cache if it grew past the soft cap (oldest entries first).
    try { await _trimCache(API_CACHE, API_CACHE_MAX_ENTRIES); } catch(e) {}
    await self.clients.claim();
  })());
});

async function _trimCache(name, max){
  const c = await caches.open(name);
  const reqs = await c.keys();
  if (reqs.length <= max) return;
  // Cache.keys() preserves insertion order — drop the oldest.
  const drop = reqs.length - max;
  for (let i = 0; i < drop; i++) await c.delete(reqs[i]);
}

// ── Fetch ─────────────────────────────────────────
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = req.url;

  // Gemini API — POST-by-default and not cached.
  // GET endpoints (rare) get cached for GEM_TTL with offline fallback.
  if (url.includes('generativelanguage.googleapis.com')) {
    e.respondWith((async () => {
      try {
        const res = await fetch(req);
        if (req.method === 'GET' && res.ok) {
          const stamped = _stamped(res);
          caches.open(API_CACHE).then(c => c.put(req, stamped.clone()).catch(()=>{}));
          return stamped;
        }
        return res;
      } catch {
        if (req.method === 'GET') {
          const cached = await caches.open(API_CACHE).then(c => c.match(req));
          if (cached && _isFresh(cached, GEM_TTL)) return cached;
        }
        return new Response('{"error":{"message":"Нет интернета","code":503}}',
          { headers: { 'Content-Type': 'application/json' }, status: 503 });
      }
    })());
    return;
  }

  // OpenFoodFacts — stale-while-revalidate with TTL freshness gate.
  // Fresh hits (≤ 24h) come straight from cache; older entries trigger a
  // background refetch but still return the stale response immediately.
  if (url.includes('world.openfoodfacts.org') || url.includes('openfoodfacts.org')) {
    e.respondWith((async () => {
      const c = await caches.open(API_CACHE);
      const cached = await c.match(req);
      if (cached && _isFresh(cached, OFF_TTL)) {
        // Background revalidate without blocking response
        e.waitUntil(fetch(req).then(res => {
          if (res.ok) c.put(req, _stamped(res)).catch(()=>{});
        }).catch(()=>{}));
        return cached;
      }
      try {
        const res = await fetch(req);
        if (res.ok) {
          const stamped = _stamped(res);
          c.put(req, stamped.clone()).catch(()=>{});
          return stamped;
        }
        return cached || res;
      } catch {
        return cached || new Response('{"status":0}', {
          headers: { 'Content-Type': 'application/json' }, status: 503,
        });
      }
    })());
    return;
  }

  // Connectivity check — pass-through
  if (url.includes('connectivitycheck.gstatic.com')) {
    e.respondWith(fetch(req).catch(() => new Response('', { status: 408 })));
    return;
  }

  // Google Fonts — stale-while-revalidate
  if (url.includes('fonts.googleapis.com') || url.includes('fonts.gstatic.com')) {
    e.respondWith((async () => {
      const cached = await caches.match(req);
      const fetchP = fetch(req).then(res => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(req, copy).catch(() => {}));
        }
        return res;
      }).catch(() => cached);
      return cached || fetchP;
    })());
    return;
  }

  // HTML / manifest — network-first (always get latest), fallback to cache.
  // Use Navigation Preload when available so the network request is already
  // in flight by the time this handler runs.
  if (req.mode === 'navigate' || url.endsWith('.html') || url.endsWith('manifest.json')) {
    e.respondWith((async () => {
      try {
        const preload = e.preloadResponse ? await e.preloadResponse : null;
        const res = preload || await fetch(req);
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(req, copy).catch(() => {}));
        }
        return res;
      } catch {
        return (await caches.match(req)) || (await caches.match('./index.html'));
      }
    })());
    return;
  }

  // JS / CSS bundles — stale-while-revalidate. This is the key fix for the
  // "I pushed a change but the app still behaves like the old version"
  // problem: previously these were cache-first (never re-checked against
  // the network unless the whole CACHE constant was bumped). Now every
  // load serves the cached copy instantly but also kicks off a background
  // fetch to refresh the cache, so the *next* load already has the update
  // — no manual version bump required for ordinary code changes.
  if (url.endsWith('.js') || url.endsWith('.css')) {
    e.respondWith((async () => {
      const cached = await caches.match(req);
      const fetchP = fetch(req).then(res => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(req, copy).catch(() => {}));
        }
        return res;
      }).catch(() => cached);
      return cached || fetchP;
    })());
    return;
  }

  // Everything else (icons, sounds) — cache-first, rarely changes.
  e.respondWith((async () => {
    const cached = await caches.match(req);
    if (cached) return cached;
    try {
      const res = await fetch(req);
      if (res.ok) {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(req, copy).catch(() => {}));
      }
      return res;
    } catch {
      return (await caches.match('./index.html')) || new Response('', { status: 504 });
    }
  })());
});

// ── Messages from page ────────────────────────────
self.addEventListener('message', async e => {
  if (e.data === 'skipWaiting') { self.skipWaiting(); return; }

  if (e.data?.type === 'SAVE_NOTIF_SCHEDULE') {
    try {
      const cache = await caches.open(NOTIF_CACHE);
      await cache.put('schedule', new Response(JSON.stringify(e.data.schedule), {
        headers: { 'Content-Type': 'application/json' }
      }));
    } catch(err) {}
    return;
  }

  if (e.data?.type === 'SHOW_NOTIF') {
    try {
      await self.registration.showNotification(e.data.title, {
        body: e.data.body, icon: 'icons/icon-192.png',
        badge: 'icons/icon-72.png', vibrate: [100, 50, 100],
        tag: e.data.tag || 'calsnap', renotify: true,
      });
    } catch(err) {}
    return;
  }
});

// ── Periodic Background Sync ──────────────────────
self.addEventListener('periodicsync', e => {
  if (e.tag === 'calsnap-notifs') {
    e.waitUntil(checkScheduledNotifs());
  }
});

// ── Push (server-driven future use) ───────────────
self.addEventListener('push', e => {
  let data = {};
  try { data = e.data ? e.data.json() : {}; } catch {}
  e.waitUntil(self.registration.showNotification(data.title || '🍎 CalSnap', {
    body: data.body || '',
    icon: 'icons/icon-192.png',
    badge: 'icons/icon-72.png',
    vibrate: [100, 50, 100],
    tag: data.tag || 'calsnap-push',
    data: { url: data.url || './' },
  }));
});

// ── Core: check if any notification is due ────────
async function checkScheduledNotifs() {
  try {
    const cache = await caches.open(NOTIF_CACHE);
    const res = await cache.match('schedule');
    if (!res) return;

    const schedule = await res.json();
    if (!schedule?.enabled) return;

    const allClients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const appFocused = allClients.some(c => c.visibilityState === 'visible');

    const now = new Date();
    const todayStr = now.toDateString();
    const nowMin = now.getHours() * 60 + now.getMinutes();
    let changed = false;

    // Choose locale-appropriate strings
    const lang = schedule.lang || 'ru';
    const MSGS = lang === 'en' ? {
      breakfast: { title: '🌅 Good morning!', body: 'Time for breakfast — log it now!' },
      lunch:     { title: '☀️ Lunch time',     body: 'Quick — log what you had (10s)' },
      dinner:    { title: '🌙 Evening',        body: 'How was your day? Log dinner in CalSnap.' },
      water:     { title: '💧 Drink some water', body: 'A glass of water helps reach your goal! 💪' },
    } : {
      breakfast: { title: '🌅 Доброе утро!',   body: 'Время завтрака — не забудь записать!' },
      lunch:     { title: '☀️ Обед',           body: 'Запиши что ел на обед — 10 секунд!' },
      dinner:    { title: '🌙 Вечер',          body: 'Как прошёл день? Запиши ужин в CalSnap.' },
      water:     { title: '💧 Пора пить воды', body: 'Стакан воды помогает достичь цели! 💪' },
    };

    const meals = [
      { key: 'breakfast', time: schedule.breakfast || '08:30', on: schedule.breakfast_on !== false },
      { key: 'lunch',     time: schedule.lunch     || '13:00', on: schedule.lunch_on     !== false },
      { key: 'dinner',    time: schedule.dinner    || '19:00', on: schedule.dinner_on    !== false },
    ];

    for (const meal of meals) {
      if (!meal.on) continue;
      const [hh, mm] = meal.time.split(':').map(Number);
      const targetMin = hh * 60 + mm;
      const diff = Math.abs(nowMin - targetMin);
      const lastKey = `last_${meal.key}_${todayStr}`;

      if (diff <= 20 && !schedule[lastKey]) {
        if (!appFocused) {
          const m = MSGS[meal.key];
          await self.registration.showNotification(m.title, {
            body: m.body, icon: 'icons/icon-192.png', badge: 'icons/icon-72.png',
            vibrate: [100, 50, 100], tag: `calsnap-${meal.key}`, renotify: false,
            data: { url: './index.html#add' },
          });
        }
        schedule[lastKey] = true;
        changed = true;
      }
    }

    if (schedule.water_on !== false) {
      const waterH = parseInt(schedule.waterInterval || '2');
      if (waterH > 0) {
        const slot = Math.floor(nowMin / (waterH * 60));
        const lastWaterKey = `last_water_${todayStr}_${slot}`;

        if (!schedule[lastWaterKey]) {
          if (!appFocused) {
            const m = MSGS.water;
            await self.registration.showNotification(m.title, {
              body: m.body, icon: 'icons/icon-192.png', badge: 'icons/icon-72.png',
              vibrate: [100, 50, 100], tag: 'calsnap-water', renotify: true,
              data: { url: './index.html#water' },
            });
          }
          schedule[lastWaterKey] = true;
          changed = true;
        }
      }
    }

    // Cleanup stale per-day flags
    for (const key of Object.keys(schedule)) {
      if (key.startsWith('last_') && !key.includes(todayStr)) {
        delete schedule[key];
        changed = true;
      }
    }

    if (changed) {
      await cache.put('schedule', new Response(JSON.stringify(schedule), {
        headers: { 'Content-Type': 'application/json' }
      }));
    }
  } catch(err) {
    // silent
  }
}

// ── Notification click — focus existing tab + navigate if URL differs ─
// The previous implementation focused the first available client without
// looking at its URL, so a notification linking to e.g. `#add` would do
// nothing if any CalSnap tab was already open on a different screen.
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const targetUrl = e.notification.data?.url || './';
  e.waitUntil((async () => {
    const cs = await clients.matchAll({ type: 'window', includeUncontrolled: true });
    // Prefer a client whose URL already matches the target.
    let target = cs.find(c => c.url && c.url.endsWith(targetUrl));
    // Fallback: any CalSnap tab — focus and navigate it to the target.
    if (!target && cs.length) target = cs[0];
    if (target) {
      try { if ('navigate' in target) await target.navigate(targetUrl); } catch(_) {}
      try { if ('focus' in target) return await target.focus(); } catch(_) {}
    }
    if (clients.openWindow) return clients.openWindow(targetUrl);
  })());
});
