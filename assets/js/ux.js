// ═══════════════════════════════════════════════════
// UX HELPERS — count-up tween, skeleton, micro-anims
// ═══════════════════════════════════════════════════

// Animate the textContent of an element from its current numeric value to `target`
// over `duration` ms with a smooth ease-out curve. Skips animation if user prefers
// reduced motion or if the delta is small enough to not be perceptible.
//
// Usage:
//   tweenNumber(el, 1240);                      // default 380ms, integer formatting
//   tweenNumber(el, 1240, { suffix: ' kcal' }); // appends suffix
//   tweenNumber(el, 12.5, { decimals: 1 });     // 1 decimal
//   tweenNumber(el, 1240, { format: v => Math.round(v) + ' g' }); // custom formatter
function tweenNumber(el, target, opts) {
  if (!el) return;
  opts = opts || {};
  const duration = opts.duration != null ? opts.duration : 380;
  const decimals = opts.decimals != null ? opts.decimals : 0;
  const suffix = opts.suffix || '';
  const prefix = opts.prefix || '';
  const format = opts.format || (v => prefix + v.toFixed(decimals) + suffix);
  const reducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  // Read current value from data attribute (set by us) or parse from text
  const fromRaw = el.dataset._tweenVal != null ? parseFloat(el.dataset._tweenVal) : parseFloat((el.textContent||'0').replace(/[^\d.\-]/g,'')) || 0;
  const from = isFinite(fromRaw) ? fromRaw : 0;
  // Cancel any running animation on this element
  if (el._tweenRaf) cancelAnimationFrame(el._tweenRaf);
  // No animation needed
  if (reducedMotion || Math.abs(target - from) < 0.5) {
    el.textContent = format(target);
    el.dataset._tweenVal = target;
    return;
  }
  const start = performance.now();
  // ease-out cubic — fast start, soft settle
  const ease = t => 1 - Math.pow(1 - t, 3);
  const step = now => {
    const t = Math.min(1, (now - start) / duration);
    const v = from + (target - from) * ease(t);
    el.textContent = format(v);
    if (t < 1) {
      el._tweenRaf = requestAnimationFrame(step);
    } else {
      el.textContent = format(target);
      el.dataset._tweenVal = target;
      el._tweenRaf = null;
    }
  };
  el._tweenRaf = requestAnimationFrame(step);
}


// ── SCROLL LOCK (reference counted) ───────────────────────────────
// Modals stack: opening the food-detail sheet, then Edit, then closing Edit
// used to release the lock while the sheet underneath was still open, letting
// the page scroll behind it. Counting opens/closes keeps the lock until the
// last overlay is gone.
let _scrollLocks = 0;
function lockScroll(on){
  if (on) _scrollLocks++;
  else _scrollLocks = Math.max(0, _scrollLocks - 1);
  document.body.style.overflow = _scrollLocks > 0 ? 'hidden' : '';
  // Every overlay open/close goes through here, so this is the natural place to
  // arm and release the hardware-back guard (see OVERLAYS below).
  if (on) { try { armBackGuard(); } catch(e) {} }
  else if (_scrollLocks === 0) {
    // Check after the caller has finished removing its `.on` class.
    requestAnimationFrame(() => { try { if (!anyOverlayOpen()) disarmBackGuard(); } catch(e) {} });
  }
}
// Escape hatch for reset/import flows that tear down the whole UI.
function resetScrollLock(){
  _scrollLocks = 0;
  document.body.style.overflow = '';
}

// ── OVERLAY STACK: hardware back + Escape ─────────────────────────
// On Android the system back gesture used to leave the app (or the installed
// PWA) even with a sheet open, which is the single most jarring thing about
// using this as an app. Every overlay is registered here with the function that
// closes it, ordered top-down by z-index, so back / Escape peel one layer at a
// time and only exit once nothing is open.
const OVERLAYS = [
  { sel: '#waterCustomOv', open: el => !!el,                                   close: () => closeWaterCustom() },
  { sel: '#editFoodOv',    open: el => el.classList.contains('on'),            close: () => closeEditFd() },
  { sel: '#cfrmOv',        open: el => el.classList.contains('on'),            close: () => cfrmCancel() },
  { sel: '#picSrcOv',      open: el => el.classList.contains('on'),            close: () => closePicSrc() },
  { sel: '#usageOv',       open: el => el.classList.contains('on'),            close: () => closeUsage() },
  { sel: '#aiListOv',      open: el => el.classList.contains('on'),            close: () => closeAiList() },
  { sel: '#devOv',         open: el => el.style.display === 'flex',            close: () => closeDevPanel() },
  { sel: '#drumOv',        open: el => el.classList.contains('on'),            close: () => closeDrum() },
  { sel: '#wlogOv',        open: el => el.classList.contains('on'),            close: () => closeWlog() },
  { sel: '#mdlOv',         open: el => el.classList.contains('on'),            close: () => closeModelPicker() },
  { sel: '#aboutOv',       open: el => el.classList.contains('on'),            close: () => closeAbout() },
  { sel: '#notifOv',       open: el => el.classList.contains('on'),            close: () => closeNotifSettings() },
  { sel: '#mealOv',        open: el => el.classList.contains('on'),            close: () => closeMealTimes() },
  { sel: '#apiOv',         open: el => el.classList.contains('on'),            close: () => closeApi() },
  { sel: '#edOv',          open: el => el.classList.contains('on'),            close: () => closeEd() },
  { sel: '#addOv',         open: el => el.classList.contains('on'),            close: () => closeAdd() },
  { sel: '#fdOv',          open: el => el.classList.contains('on'),            close: () => closeFd() },
  // The AI screen is an overlay too, so back returns to Home rather than exiting.
  { sel: '#ai',            open: el => el.style.display === 'flex',
    close: () => { const nb = document.querySelector('#nav .nb'); if (nb) goS('home', nb); } },
];

function topOverlay(){
  for (const o of OVERLAYS) {
    const el = document.querySelector(o.sel);
    if (el && o.open(el)) return o;
  }
  return null;
}
function anyOverlayOpen(){ return !!topOverlay(); }

function closeTopOverlay(){
  const o = topOverlay();
  if (!o) return false;
  try { o.close(); } catch(e) { return false; }
  return true;
}

// A single sentinel history entry stands in front of the app while anything is
// open; consuming it is what the back gesture does.
let _backGuardArmed = false;
let _disarmingGuard = false;
function armBackGuard(){
  if (_backGuardArmed) return;
  try {
    history.pushState({ csOverlay: true }, '');
    _backGuardArmed = true;
  } catch(e) {}
}
// When the last overlay is closed by tapping ✕ or the backdrop, the sentinel is
// still on the stack. Without removing it the *next* back press would be
// swallowed doing nothing, which feels like the app ignored you.
let _disarmTimer = null;
function disarmBackGuard(){
  if (!_backGuardArmed || _disarmingGuard) return;
  _backGuardArmed = false;
  _disarmingGuard = true;
  // Safety net: if popstate never arrives (some WebViews swallow it) the flag
  // must not stay set, or every later disarm would be a no-op.
  clearTimeout(_disarmTimer);
  _disarmTimer = setTimeout(() => { _disarmingGuard = false; }, 400);
  try { history.back(); } catch(e) { _disarmingGuard = false; }
}
window.addEventListener('popstate', () => {
  if (_disarmingGuard) { _disarmingGuard = false; clearTimeout(_disarmTimer); return; }
  _backGuardArmed = false;
  if (closeTopOverlay()) {
    // More layers underneath? Re-arm so the next back press peels the next one.
    if (anyOverlayOpen()) armBackGuard();
  }
});
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  if (closeTopOverlay()) e.preventDefault();
});
