// ══════════════════════════════════════════════════════════════════
// MEAL WINDOWS
// ══════════════════════════════════════════════════════════════════
// Which slot an entry lands in — breakfast, lunch, snack, dinner — used to be
// hard-coded to 6:00 / 11:00 / 14:00 / 18:00. People do not live on one
// schedule: a night shift eats "breakfast" at 19:00, and a 21:00 dinner filed
// under "dinner" for someone who eats at 17:30 is just wrong. The four window
// START times are editable, and everything that groups by meal reads them.
//
// Stored as { breakfast, lunch, snack, dinner } — "HH:MM" strings, ascending.
// A time earlier than the first window is a snack (a 3 a.m. bite is nobody's
// breakfast).

const MEAL_KEYS = ['breakfast', 'lunch', 'snack', 'dinner'];
const MEAL_WINDOW_DEFAULTS = { breakfast: '06:00', lunch: '11:00', snack: '14:00', dinner: '18:00' };

// "HH:MM" → minutes past midnight, or null when unparseable.
function hmToMins(v){
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(v || '').trim());
  if (!m) return null;
  const h = +m[1], mi = +m[2];
  if (h > 23 || mi > 59) return null;
  return h * 60 + mi;
}
function minsToHm(mins){
  const m = ((Math.round(mins) % 1440) + 1440) % 1440;
  return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
}

// The saved windows, repaired into something usable: every key present, every
// value a valid time, and strictly ascending. Corrupted or out-of-order values
// fall back to the default for that key rather than breaking the timeline.
function getMealWindows(){
  let raw = {};
  try { raw = JSON.parse(G('meal_windows', '{}')) || {}; } catch(e) { raw = {}; }
  const out = {};
  let prev = -1;
  for (const k of MEAL_KEYS) {
    let mins = hmToMins(raw[k]);
    if (mins == null || mins <= prev) mins = hmToMins(MEAL_WINDOW_DEFAULTS[k]);
    // Even the default can collide with an edited earlier window (breakfast at
    // 12:00 pushes lunch past its default) — step past it instead of dropping
    // the window entirely.
    if (mins <= prev) mins = Math.min(prev + 30, 1439);
    out[k] = minsToHm(mins);
    prev = mins;
  }
  return out;
}

function isMealWindowsDefault(w){
  const x = w || getMealWindows();
  return MEAL_KEYS.every(k => x[k] === MEAL_WINDOW_DEFAULTS[k]);
}

// Persist and re-render everything that groups by meal.
function saveMealWindows(w){
  const clean = {};
  for (const k of MEAL_KEYS) clean[k] = minsToHm(hmToMins(w[k]) ?? hmToMins(MEAL_WINDOW_DEFAULTS[k]));
  const okOrder = MEAL_KEYS.every((k, i) => i === 0 || hmToMins(clean[k]) > hmToMins(clean[MEAL_KEYS[i - 1]]));
  if (!okOrder) return false;
  if (!S('meal_windows', JSON.stringify(clean))) return false;
  return true;
}

// A human-readable "06:00 · 11:00 · 14:00 · 18:00" for the settings row.
function mealWindowsSummary(){
  const w = getMealWindows();
  return MEAL_KEYS.map(k => w[k]).join(' · ');
}

// The window an entry belongs to, as a label like "11:00–14:00".
function mealWindowRange(key){
  const w = getMealWindows();
  const i = MEAL_KEYS.indexOf(key);
  if (i < 0) return '';
  const next = MEAL_KEYS[i + 1];
  return w[key] + '–' + (next ? w[next] : w[MEAL_KEYS[0]]);
}

// ── Settings sheet ────────────────────────────────────────────────
const MEAL_ROW_ICON = { breakfast: '🌅', lunch: '☀️', snack: '🍎', dinner: '🌙' };
const MEAL_ROW_GRAD = {
  breakfast: 'linear-gradient(135deg,#fbbf24,#f59e0b)',
  lunch:     'linear-gradient(135deg,#fb923c,#ef4444)',
  snack:     'linear-gradient(135deg,#4ade80,#16a34a)',
  dinner:    'linear-gradient(135deg,#818cf8,#6366f1)',
};

function openMealTimes(){
  const ov = document.getElementById('mealOv');
  if (!ov) return;
  HFX.light(); SFX.play('sheet_open');
  renderMealTimes();
  ov.classList.add('on');
  lockScroll(true);
}
function closeMealTimes(){
  const ov = document.getElementById('mealOv');
  if (!ov || !ov.classList.contains('on')) return;
  HFX.light(); SFX.play('sheet_close');
  ov.classList.remove('on');
  lockScroll(false);
}

function renderMealTimes(){
  const list = document.getElementById('mealList');
  if (!list) return;
  const w = getMealWindows();
  list.innerHTML = MEAL_KEYS.map((k, i) => `
    <div class="ml-row"${i ? ' style="border-top:.5px solid var(--b1)"' : ''}>
      <div class="ml-ico" style="background:${MEAL_ROW_GRAD[k]}">${MEAL_ROW_ICON[k]}</div>
      <div class="ml-txt">
        <div class="ml-t">${esc(t('meal_' + k))}</div>
        <div class="ml-s" id="mlRange_${k}">${esc(t('meal_from'))} ${esc(w[k])}</div>
      </div>
      <input type="time" class="notif-time-inp" id="mlInp_${k}" value="${esc(w[k])}"
             oninput="onMealTimeInput('${k}')" onchange="onMealTimeInput('${k}')">
    </div>`).join('');
  _mealSyncHints();
}

// Live feedback while editing: each row shows the span it now covers, and an
// out-of-order pair is called out before the user hits save.
function _mealReadInputs(){
  const w = {};
  for (const k of MEAL_KEYS) w[k] = document.getElementById('mlInp_' + k)?.value || getMealWindows()[k];
  return w;
}
function _mealSyncHints(){
  const w = _mealReadInputs();
  let bad = false;
  MEAL_KEYS.forEach((k, i) => {
    const mins = hmToMins(w[k]);
    const prev = i ? hmToMins(w[MEAL_KEYS[i - 1]]) : null;
    const off = mins == null || (prev != null && mins <= prev);
    if (off) bad = true;
    const next = MEAL_KEYS[i + 1];
    const el = document.getElementById('mlRange_' + k);
    if (el) {
      el.textContent = next ? w[k] + ' – ' + w[next] : t('meal_from') + ' ' + w[k];
      el.classList.toggle('bad', off);
    }
    document.getElementById('mlInp_' + k)?.classList.toggle('bad', off);
  });
  const warn = document.getElementById('mealWarn');
  if (warn) warn.classList.toggle('on', bad);
  const save = document.getElementById('mealSaveBtn');
  if (save) save.disabled = bad;
  const reset = document.getElementById('mealResetBtn');
  if (reset) reset.style.display = isMealWindowsDefault(w) ? 'none' : '';
  return !bad;
}
function onMealTimeInput(){ HFX.tick(); _mealSyncHints(); }

function saveMealTimes(){
  if (!_mealSyncHints()) { HFX.error(); SFX.play('error'); return; }
  if (!saveMealWindows(_mealReadInputs())) { HFX.error(); SFX.play('error'); showToast(t('toast_storage_fail')); return; }
  HFX.success(); SFX.play('save');
  showToast(t('meal_saved'));
  closeMealTimes();
  _refreshMealDependentUI();
}

function resetMealTimes(){
  HFX.medium(); SFX.play('btn_tap');
  for (const k of MEAL_KEYS) {
    const inp = document.getElementById('mlInp_' + k);
    if (inp) inp.value = MEAL_WINDOW_DEFAULTS[k];
  }
  _mealSyncHints();
}

// Meal windows decide how the diary is grouped, so everything that renders a
// grouped day has to be rebuilt — including the settings row's own subtitle.
function _refreshMealDependentUI(){
  const sub = document.getElementById('smeals');
  if (sub) sub.textContent = mealWindowsSummary();
  try { rH(); } catch(e) {}
  try { rCal(); } catch(e) {}
  try { rP(); } catch(e) {}
}
