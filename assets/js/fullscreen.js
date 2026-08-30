// ══════════════════════════════════════════════════════════════════
// FULLSCREEN MODE
// ══════════════════════════════════════════════════════════════════
// The manifest asks for `display: "fullscreen"`, which covers the installed
// PWA / TWA. In a plain browser tab that has no effect, so the app also
// requests the Fullscreen API — which browsers only grant from inside a user
// gesture, hence the one-shot listener on the first tap.
//
// Controlled by Settings → Внешний вид → Полноэкранный режим (default: on).

const isFullscreenPref = () => G('fullscreen_enabled', '1') === '1';

function _fsElement(){
  return document.fullscreenElement || document.webkitFullscreenElement || null;
}
function _fsSupported(){
  const el = document.documentElement;
  return !!(el.requestFullscreen || el.webkitRequestFullscreen);
}
// True when the app already fills the screen because it was launched as an
// installed app — requesting fullscreen again would be pointless.
function _isStandaloneDisplay(){
  try {
    return window.matchMedia('(display-mode: fullscreen)').matches
        || window.matchMedia('(display-mode: standalone)').matches
        || window.navigator.standalone === true;
  } catch(e) { return false; }
}

async function enterFullscreen(){
  if (_fsElement() || _isStandaloneDisplay()) return true;
  const el = document.documentElement;
  const req = el.requestFullscreen || el.webkitRequestFullscreen;
  if (!req) return false;
  try {
    // navigationUI:'hide' is ignored where unsupported.
    await req.call(el, { navigationUI: 'hide' });
    return true;
  } catch(e) {
    try { await req.call(el); return true; } catch(e2) { return false; }
  }
}

async function exitFullscreen(){
  if (!_fsElement()) return;
  try {
    if (document.exitFullscreen) await document.exitFullscreen();
    else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
  } catch(e) {}
}

// Keep a CSS hook in sync so the layout can drop the status-bar inset when
// the status bar genuinely isn't there any more.
function _syncFullscreenClass(){
  const on = !!_fsElement() || _isStandaloneDisplay();
  document.documentElement.classList.toggle('is-fullscreen', on);
}

function toggleFullscreen(){
  if (!_fsSupported() && !_isStandaloneDisplay()) {
    HFX.error(); SFX.play('error');
    showToast(t('toast_fullscreen_unsupported'));
    return;
  }
  const next = !isFullscreenPref();
  S('fullscreen_enabled', next ? '1' : '0');
  const tog = document.getElementById('fullscreenToggle');
  if (tog) tog.classList.toggle('on', next);
  HFX.medium(); SFX.play('toggle');
  if (next) { enterFullscreen(); showToast(t('toast_fullscreen_on')); }
  else { exitFullscreen(); showToast(t('toast_fullscreen_off')); }
}

// ── Auto-enter on the first user gesture ──────────────────────────
(function(){
  let armed = true;
  const tryEnter = () => {
    if (!armed) return;
    if (!isFullscreenPref()) { armed = false; return; }
    if (_isStandaloneDisplay() || !_fsSupported()) { armed = false; _syncFullscreenClass(); return; }
    armed = false;
    enterFullscreen().finally(_syncFullscreenClass);
  };
  // `pointerup`/`touchend` are real activation triggers; `click` covers desktop.
  ['touchend', 'pointerup', 'click', 'keydown'].forEach(ev =>
    document.addEventListener(ev, tryEnter, { once: true, passive: true }));

  ['fullscreenchange', 'webkitfullscreenchange'].forEach(ev =>
    document.addEventListener(ev, () => {
      _syncFullscreenClass();
      // The user left fullscreen by hand (system gesture / Esc): respect it
      // instead of fighting them on the next tap.
      if (!_fsElement() && isFullscreenPref() && !_isStandaloneDisplay()) {
        S('fullscreen_enabled', '0');
        const tog = document.getElementById('fullscreenToggle');
        if (tog) tog.classList.remove('on');
      }
    }));

  // Re-assert after the device is rotated or the app is resumed, since some
  // Android builds drop fullscreen on those transitions.
  const reassert = () => {
    if (!isFullscreenPref() || _isStandaloneDisplay()) return;
    if (_fsElement()) return;
    // Needs a gesture again — arm the one-shot listeners.
    armed = true;
    ['touchend', 'pointerup', 'click'].forEach(ev =>
      document.addEventListener(ev, tryEnter, { once: true, passive: true }));
  };
  window.addEventListener('orientationchange', () => setTimeout(reassert, 300));
  document.addEventListener('visibilitychange', () => { if (!document.hidden) reassert(); });

  _syncFullscreenClass();
})();
