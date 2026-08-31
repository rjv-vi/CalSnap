// ══════════════════════════════════════════════════
// WATER BALANCE
// ══════════════════════════════════════════════════
// Drink data — `name` resolved via t() at render time so it follows the current language.
const _DRINKS_BASE = [
  { id:'water',  icon:'💧', i18n:'drink_water',  ml:250, hydration:1.0,  kcal:0,   prot:0,  fat:0,   carb:0   },
  { id:'tea',    icon:'🍵', i18n:'drink_tea',    ml:200, hydration:0.9,  kcal:2,   prot:0,  fat:0,   carb:0.4 },
  { id:'coffee', icon:'☕', i18n:'drink_coffee', ml:150, hydration:0.6,  kcal:5,   prot:0.3,fat:0.1, carb:0   },
  { id:'juice',  icon:'🧃', i18n:'drink_juice',  ml:200, hydration:0.85, kcal:90,  prot:0.5,fat:0.1, carb:21  },
  { id:'milk',   icon:'🥛', i18n:'drink_milk',   ml:200, hydration:0.9,  kcal:120, prot:6,  fat:4,   carb:9   },
  { id:'other',  icon:'🫗', i18n:'drink_other',  ml:200, hydration:0.8,  kcal:0,   prot:0,  fat:0,   carb:0   },
];
function getDrinks(){ return _DRINKS_BASE.map(d => ({...d, name: t(d.i18n)})); }
// Backward-compatible iterable so `DRINKS.find(...)` / `.map(...)` keep working.
const DRINKS = new Proxy(_DRINKS_BASE, {
  get(target, prop){
    if (prop === 'find')   return (fn) => getDrinks().find(fn);
    if (prop === 'filter') return (fn) => getDrinks().filter(fn);
    if (prop === 'map')    return (fn) => getDrinks().map(fn);
    if (prop === 'forEach')return (fn) => getDrinks().forEach(fn);
    if (prop === 'length') return _DRINKS_BASE.length;
    if (typeof prop === 'string' && /^\d+$/.test(prop)){
      const idx = +prop;
      const d = _DRINKS_BASE[idx];
      return d ? {...d, name: t(d.i18n)} : undefined;
    }
    return target[prop];
  }
});


function _updateMiniWater(dateStr) {
  const row = document.getElementById('miniWaterRow');
  // Water tracking is opt-in — hide the Home widget entirely when it's off.
  if (!isWaterOn()) {
    if (row) row.style.display = 'none';
    return;
  }
  if (row) row.style.display = '';
  // Respect whichever day is selected on Home (calendar strip), same as
  // the calorie ring does — otherwise this always showed today's water
  // even while browsing a past day's food log.
  const targetDate = dateStr || ds();
  const isToday = targetDate === ds();
  const arr = getWaterToday(targetDate);
  const total = arr.reduce((s,e) => s + e.ml, 0);
  const goal = getWaterGoal(targetDate).adjusted;
  const pct = Math.min(total / goal * 100, 100);
  const fillEl = document.getElementById('miniWaterFill');
  const labelEl = document.getElementById('miniWaterLabel');
  if (fillEl) fillEl.style.width = pct + '%';
  if (labelEl) labelEl.textContent = total + ' / ' + goal + ' ' + t('water_ml');
  // Home and Progress are one tracker: when the card turns green, so does this.
  if (row) row.classList.toggle('done', total >= goal);
  // Past-day view is read-only — the button still opens Progress, but
  // dim it slightly so it doesn't look like "today" data.
  if (row) row.style.opacity = isToday ? '1' : '.6';
}

function getWaterGoal(dateStr) {
  const base = Math.round((U?.w||70) * 30 / 50) * 50;
  const goal = Math.max(1500, Math.min(3500, base));
  // Both languages: the AI writes dish names in whatever language the UI is
  // set to, so a Russian-only list silently disabled the +20% adjustment for
  // English users.
  const saltWords = ['чипсы','солен','соль','рыба','сыр','колбаса','пицца','бургер','хот-дог','соевый','рамен','сосиск','бекон','шаурма',
    'chips','crisps','salt','salty','fish','cheese','sausage','pizza','burger','hot dog','hotdog','soy sauce','ramen','bacon','pretzel','olives','jerky'];
  const hasSalt = dlog(dateStr || ds()).some(i => saltWords.some(s => (i.food||'').toLowerCase().includes(s)));
  return { goal, hasSalt, adjusted: hasSalt ? Math.round(goal * 1.2 / 50) * 50 : goal };
}

function getWaterToday(dateStr) {
  try { return JSON.parse(G('water_'+(dateStr||ds()),'[]')); } catch(e) { return []; }
}

// Every water event carries its own id so the diary entry it created can be
// found again. Without it, removing a drink from the water card left the
// calories sitting in the diary forever.
function _waterEvId(){
  return 'w' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

function addWater(drinkId) {
  const drink = DRINKS.find(d => d.id === drinkId);
  if(!drink) return;
  const ev = _waterEvId();
  const arr = getWaterToday();
  arr.push({ id: drinkId, ml: drink.ml, t: tnow(), ev });
  S('water_'+ds(), JSON.stringify(arr));
  // For caloric drinks — also add to food log
  if(drink.kcal > 0) {
    const _ml = t('water_ml');
    const entry = {
      food: drink.name + ' ' + drink.ml + ' ' + _ml,
      portion: drink.ml + ' ' + _ml,
      kcal: drink.kcal, prot: drink.prot, fat: drink.fat, carb: drink.carb,
      time: tnow(), date: ds(),
      isDrink: true, drinkId: drinkId, waterEv: ev
    };
    log.unshift(entry);
    if(!saveLog()) log.shift();
    rH();
  }
  _waterFeedback(getWaterToday(), drink.ml);
  rWater();
}

function undoLastWater() {
  const arr = getWaterToday();
  if(!arr.length) return;
  // Prefer undoing a manual entry: the last item may have been added
  // automatically alongside a food record, which the user never tapped.
  let idx = -1;
  for(let i=arr.length-1;i>=0;i--){ if(!arr[i].fromFood){ idx=i; break; } }
  if(idx===-1) idx=arr.length-1;
  _removeWaterAt(idx);
  HFX.light(); SFX.play('water_undo');
}

// Remove one water event and, if that event also created a diary entry, the
// entry with it. Auto-detected drinks (`fromFood`) work the other way round:
// the food record owns the water event, so the food stays.
function _removeWaterAt(idx) {
  const arr = getWaterToday();
  const rec = arr[idx];
  if(!rec) return;
  arr.splice(idx, 1);
  S('water_'+ds(), JSON.stringify(arr));
  if (rec.ev) {
    const li = log.findIndex(e => e && e.waterEv === rec.ev);
    if (li >= 0) {
      releaseEntryImage(log[li]);
      log.splice(li, 1);
      saveLog();
      try { rH(); } catch(e) {}
    }
  }
  rWater();
}

// Delete a single event from the history timeline.
function removeWaterEvent(ev) {
  const arr = getWaterToday();
  const idx = arr.findIndex(e => e && e.ev === ev);
  if (idx < 0) return;
  HFX.light(); SFX.play('water_undo');
  _removeWaterAt(idx);
}

// Called when a drink is deleted from the diary side: drop its water event too,
// otherwise the water total keeps counting a drink that is no longer logged.
function unlinkWaterForEntry(item) {
  if (!item || !item.waterEv) return;
  const key = 'water_' + (item.date || ds());
  let arr = [];
  try { arr = JSON.parse(G(key, '[]')) || []; } catch(e) { return; }
  const idx = arr.findIndex(e => e && e.ev === item.waterEv);
  if (idx < 0) return;
  arr.splice(idx, 1);
  S(key, JSON.stringify(arr));
  try { if (isWaterOn()) rWater(); } catch(e) {}
}

// ── Custom amount ─────────────────────────────────────────────────
// A real bottom sheet, like every other sheet in the app. It used to be built
// imperatively from one long inline-style string, with its own scrim, radius and
// handle, which is why it did not look like anything else here.
const WATER_PRESETS = [100, 200, 250, 330, 500, 750];

function openWaterCustom(){
  const ov = document.getElementById('waterCustomOv');
  if (!ov) return;
  HFX.light(); SFX.play('sheet_open');
  _syncWaterCustom(250, true);
  const box = document.getElementById('waterPresets');
  if (box) box.innerHTML = WATER_PRESETS.map(v =>
    `<button class="wc-preset" onclick="_setWaterCustom(${v})" data-v="${v}">${v}</button>`).join('');
  _markWaterPreset(250);
  ov.classList.add('on');
  lockScroll(true);
}

function closeWaterCustom(){
  const ov = document.getElementById('waterCustomOv');
  if (!ov || !ov.classList.contains('on')) return;
  HFX.light(); SFX.play('sheet_close');
  ov.classList.remove('on');
  lockScroll(false);
}

// A preset that matches the current value is highlighted, so the row doubles as
// a readout instead of being write-only.
function _markWaterPreset(v){
  document.querySelectorAll('#waterPresets .wc-preset').forEach(b =>
    b.classList.toggle('on', +b.dataset.v === +v));
}

function _syncWaterCustom(v, quiet){
  const val = Math.max(50, Math.min(1000, parseInt(v, 10) || 250));
  const out = document.getElementById('waterCustomVal');
  const sl = document.getElementById('waterCustomSlider');
  if (sl && +sl.value !== val) sl.value = String(val);
  if (out) out.textContent = String(val);
  _markWaterPreset(val);
  if (!quiet) HFX.tick();
}

function _setWaterCustom(v){
  HFX.light(); SFX.play('select');
  _syncWaterCustom(v, true);
}

function addWaterCustom(){
  const v = parseInt(document.getElementById('waterCustomSlider')?.value || '250', 10);
  const arr = getWaterToday();
  arr.push({ id: 'water', ml: v, t: tnow(), ev: _waterEvId() });
  S('water_' + ds(), JSON.stringify(arr));
  _waterFeedback(arr, v);
  closeWaterCustom();
  showToast(tf('water_added_toast', { ml: v }));
  rWater();
}

// Crossing the goal deserves a different sound from an ordinary sip.
function _waterFeedback(arr, addedMl){
  const total = arr.reduce((s, x) => s + (x.ml || 0), 0);
  const goal = getWaterGoal().adjusted;
  HFX.success();
  SFX.play(total >= goal && total - addedMl < goal ? 'water_goal' : 'water_add');
}

// ── Render ────────────────────────────────────────────────────────
// The card answers three questions in order: how far along am I, what can I add,
// and what have I drunk. It used to show the same progress twice (a ring and a
// bar) while the big number counted raw millilitres and the ring counted
// hydration-adjusted ones — two different quantities side by side, unexplained.
let _waterLastCounts = '';

function rWater() {
  if (!U) return;
  const card = document.getElementById('waterCard');
  // Water tracking is opt-in — hide the Progress widget entirely when it's off.
  if (!isWaterOn()) {
    if (card) card.style.display = 'none';
    return;
  }
  if (card) card.style.display = '';

  const { hasSalt, adjusted } = getWaterGoal();
  const arr = getWaterToday();
  const totalMl = arr.reduce((s, e) => s + e.ml, 0);
  const hydrated = Math.round(arr.reduce((s, e) => {
    const d = DRINKS.find(x => x.id === e.id);
    return s + e.ml * (d?.hydration ?? 1);
  }, 0));
  const pct = adjusted > 0 ? Math.min(hydrated / adjusted, 1) : 0;
  const done = hydrated >= adjusted;
  if (card) card.classList.toggle('done', done);

  // Big number: what you actually drank, counted up rather than snapping.
  const mlEl = document.getElementById('waterConsumedMl');
  if (mlEl) _countTo(mlEl, totalMl);
  const glEl = document.getElementById('waterGoalMl');
  if (glEl) glEl.textContent = adjusted;

  const pctEl = document.getElementById('waterPct');
  if (pctEl) {
    pctEl.textContent = Math.round(pct * 100) + '%';
    pctEl.classList.toggle('done', done);
  }

  // Remaining, or how far past the target — never a bare "100%".
  const leftEl = document.getElementById('waterLeft');
  if (leftEl) {
    const gap = adjusted - hydrated;
    leftEl.textContent = gap > 0
      ? tf('water_left', { ml: gap })
      : (gap < 0 ? tf('water_over', { ml: -gap }) : t('water_goal_reached'));
    leftEl.classList.toggle('done', gap <= 0);
  }

  // The honest bit: coffee and juice move the bar less than they move the
  // number, so say so instead of letting the two look broken.
  const cntEl = document.getElementById('waterCounted');
  if (cntEl) {
    const differs = hydrated !== totalMl;
    cntEl.hidden = !differs;
    if (differs) {
      cntEl.textContent = tf('water_counted', { ml: hydrated });
      cntEl.title = t('water_counted_hint');
    }
  }

  // One progress reading, in two places that agree: the glass and the track.
  const barEl = document.getElementById('waterBar');
  if (barEl) barEl.style.width = (pct * 100) + '%';
  const fillEl = document.getElementById('waterGlassFill');
  if (fillEl) fillEl.style.height = Math.max(pct * 100, pct > 0 ? 6 : 0) + '%';

  const hint = document.getElementById('waterSaltHint');
  if (hint) {
    hint.classList.toggle('on', hasSalt);
    hint.textContent = t('water_salt_hint') + ' (' + adjusted + ' ' + t('water_ml') + ')';
  }

  // Drink buttons. The count badge only pops when a count really changed —
  // otherwise every unrelated re-render replayed the animation.
  const dc = document.getElementById('waterDrinks');
  if (dc) {
    const counts = DRINKS.map(d => arr.filter(e => e.id === d.id).length);
    const changed = counts.join(',') !== _waterLastCounts;
    _waterLastCounts = counts.join(',');
    dc.innerHTML = DRINKS.map((d, i) => {
      const n = counts[i];
      return `<button class="water-btn${n > 0 ? ' hit' : ''}" onclick="addWater('${d.id}')"
          aria-label="${esc(d.name)} +${d.ml} ${esc(t('water_ml'))}">
          ${n > 0 ? `<span class="water-count${changed ? ' pop' : ''}">${n}</span>` : ''}
          <span class="water-btn-icon">${d.icon}</span>
          <span class="water-btn-name">${esc(d.name)}</span>
          <span class="water-btn-ml">+${d.ml}</span>
        </button>`;
    }).join('');
  }

  // A vertical timeline with times reads as the shape of the day; the old
  // horizontal chip strip had no room for either the time or a delete button.
  const eventsEl = document.getElementById('waterEvents');
  if (eventsEl) {
    if (!arr.length) {
      eventsEl.innerHTML = `<div class="water-empty-hint">${esc(t('water_empty'))}</div>`;
    } else {
      const rows = arr.slice().reverse();
      const shown = rows.slice(0, 10);
      eventsEl.innerHTML = shown.map((e, i) => {
        const d = DRINKS.find(x => x.id === e.id) || DRINKS[0];
        // `fromFood` events belong to a diary record — remove the food instead.
        const del = (e.ev && !e.fromFood)
          ? `<button class="water-event-del" onclick="removeWaterEvent('${esc(e.ev)}')" aria-label="${esc(t('btn_delete'))}" title="${esc(t('btn_delete'))}">✕</button>`
          : '';
        return `<div class="water-event" style="animation-delay:${i * 35}ms">
          <span class="water-event-t">${esc(e.t || '')}</span>
          <span class="water-event-icon">${d.icon}</span>
          <span class="water-event-name">${esc(d.name)}</span>
          <span class="water-event-ml">${e.ml} ${esc(t('water_ml'))}</span>
          ${del}
        </div>`;
      }).join('')
        + (rows.length > shown.length
            ? `<div class="water-event-more">${esc(tf('water_more', { n: rows.length - shown.length }))}</div>`
            : '');
    }
  }

  const undoBtn = document.getElementById('waterUndoBtn');
  if (undoBtn) undoBtn.style.display = arr.length ? 'flex' : 'none';
}

// Count a number up to its new value. A total that jumps from 250 to 500 tells
// you less than one you can watch move.
function _countTo(el, target){
  const from = parseInt(el.dataset.val || '0', 10) || 0;
  el.dataset.val = String(target);
  // Write the final value first: if the frame callbacks never run (a background
  // tab, a paused engine) the card still shows the right number.
  el.textContent = String(target);
  if (from === target) return;
  const reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduced || Math.abs(target - from) > 900 || typeof requestAnimationFrame !== 'function') {
    el.textContent = String(target);
    return;
  }
  el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump');
  const t0 = Date.now(), dur = 420;
  const step = () => {
    const k = Math.min((Date.now() - t0) / dur, 1);
    const eased = 1 - Math.pow(1 - k, 3);
    el.textContent = String(Math.round(from + (target - from) * eased));
    if (k < 1) requestAnimationFrame(step);
    else el.textContent = String(target);
  };
  requestAnimationFrame(step);
}
