// ══════════════════════════════════════════════════
// AUTHORS MODAL
// ══════════════════════════════════════════════════
function openAbout() {
  HFX.light(); SFX.play('sheet_open');
  document.getElementById('aboutOv').classList.add('on');
  lockScroll(true);
}
function closeAbout() {
  SFX.play('sheet_close');
  document.getElementById('aboutOv').classList.remove('on');
  lockScroll(false);
}


let _isOfflineMode = false;

function checkConnection() {
  // Reliable: use navigator.onLine as primary signal
  // Image ping as secondary (may fail in WebView due to CORS/SW)
  return new Promise(resolve => {
    // If browser says offline, trust it
    if (!navigator.onLine) { resolve(false); return; }
    // If browser says online, do a quick verify with short timeout
    // but default to TRUE if fetch fails (could be CORS/CSP issue not actual offline)
    let resolved = false;
    const done = (v) => { if (!resolved) { resolved = true; resolve(v); } };
    // Try fetch to a tiny endpoint
    // No AbortSignal — SW can't clone it. Use timeout promise race instead.
    const fetchPromise = fetch('https://connectivitycheck.gstatic.com/generate_204', {
      mode: 'no-cors', cache: 'no-store'
    });
    const timeoutPromise = new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 2500));
    Promise.race([fetchPromise, timeoutPromise])
    .then(() => { done(true); }).catch(() => {
      // Fetch failed — but could be CSP/CORS. Trust navigator.onLine
      done(navigator.onLine);
    });
    // Fallback: after 3s, trust navigator.onLine
    setTimeout(() => done(navigator.onLine), 3000);
  });
}

// Single source of truth for the retry button so every state (idle / checking)
// renders localised copy.
function _offlRetryHtml(labelKey, spinning){
  const spin = spinning ? ' style="animation:spin .7s linear infinite"' : '';
  return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"${spin}><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-3.5"/></svg> <span>${esc(t(labelKey))}</span>`;
}
function showOfflineModal() {
  const btn = document.getElementById('offlRetryBtn');
  if(btn){ btn.disabled=false; btn.style.opacity='1'; btn.innerHTML=_offlRetryHtml('offl_retry'); }
  const ov = document.getElementById('offlOv');
  if(!ov || ov.classList.contains('on')) return;
  ov.classList.add('on');
  lockScroll(true);
  HFX.medium(); SFX.play('sheet_open');
}

function hideOfflineModal() {
  const ov = document.getElementById('offlOv');
  if(!ov || !ov.classList.contains('on')) return;
  ov.classList.remove('on');
  lockScroll(false);
}

function enterOffline() {
  hideOfflineModal();
  _applyOfflineUI(true);
}

// Tapping the offline bar takes you to whatever is waiting on the connection.
function offlBarTap(){
  HFX.light(); SFX.play('btn_tap');
  if (typeof queueCount === 'function' && queueCount()) {
    const nb = document.querySelector('#nav .nb');
    if (nb) goS('home', nb);
    setTimeout(() => {
      document.getElementById('pendingCard')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 120);
    return;
  }
  retryConnection(true);
}

function retryConnection(silent) {
  const btn = document.getElementById('offlRetryBtn');
  if(!silent){
    HFX.light(); SFX.play('btn_tap');
    if(btn){ btn.disabled=true; btn.style.opacity='.6'; btn.innerHTML=_offlRetryHtml('offl_checking', true); }
  }
  return checkConnection().then(online => {
    if(online) {
      _applyOfflineUI(false);
      hideOfflineModal();
      HFX.success(); SFX.play('scan_success');
      showToast(t('offl_back_online'));
      try { processQueue({}); } catch(e) {}
    } else {
      if(btn){ btn.disabled=false; btn.style.opacity='1'; btn.innerHTML=_offlRetryHtml('offl_retry'); }
      HFX.error();
      const card = document.getElementById('offlCard');
      if(card){
        card.style.animation='none'; void card.offsetWidth;
        card.style.animation='offlShake .42s ease';
      }
      if(silent) showToast(t('offl_still_offline'));
    }
    return online;
  });
}

// One handler for losing and regaining the connection.
// Only the AI tab is disabled offline. The "+" button stays live because the
// diary genuinely works offline (favourites, manual entry, editing) — exactly
// what the offline sheet itself promises. Disabling it made the app look
// broken the moment connectivity dropped.
function _applyOfflineUI(offline) {
  _isOfflineMode = offline;
  document.documentElement.classList.toggle('is-offline', offline);
  document.getElementById('offlBar')?.classList.toggle('on', offline);
  // The AI tab stays reachable: the transcript is worth reading offline, and the
  // composer disables itself with an explanation instead of the tab going dead
  // for no visible reason.
  document.querySelectorAll('.nb, .nb-add').forEach(b => {
    b.style.opacity = ''; b.style.pointerEvents = '';
  });
  try { if (typeof aiSetStatus === 'function') aiSetStatus(offline ? 'off' : 'on'); } catch(e) {}
  try { renderQueue(); } catch(e) {}
  _updateOfflineBarText();
}

// The bar says what is actually waiting, not just "offline".
function _updateOfflineBarText(){
  const el = document.getElementById('offlBarText');
  if (!el) return;
  let n = 0;
  try { n = queueCount(); } catch(e) {}
  el.textContent = n ? tf('offl_bar_queued', { n }) : t('offl_bar');
}
window.addEventListener('online', () => {
  setTimeout(() => {
    checkConnection().then(ok => {
      if (!ok) return;
      const was = _isOfflineMode;
      _applyOfflineUI(false);
      hideOfflineModal();
      if (was) { HFX.success(); SFX.play('scan_success'); showToast(t('offl_back_online')); }
    });
  }, 500);
});
window.addEventListener('offline', () => {
  _applyOfflineUI(true);
  HFX.error();
  showToast(t('toast_offline'));
});



// ── RIPPLE TAP FEEDBACK ──
(function(){
  const RIPPLE_SELS = '.btn,.btn2,.goal-card,.act-card,.gender-card,.st-row,.logitem,.water-btn,.tab,.streak,.sc,.wt-btn,.ex,.ai-chip';
  function ripple(e) {
    const el = e.target.closest(RIPPLE_SELS);
    if (!el) return;
    const pos = getComputedStyle(el).position;
    if (pos === 'static') el.style.position = 'relative';
    el.style.overflow = 'hidden';
    const r = document.createElement('span');
    r.className = 'rpl';
    const rect = el.getBoundingClientRect();
    const cx = e.touches ? e.touches[0].clientX : e.clientX;
    const cy = e.touches ? e.touches[0].clientY : e.clientY;
    const x = cx - rect.left, y = cy - rect.top;
    const sz = Math.max(rect.width, rect.height) * 2.2;
    r.style.cssText = `width:${sz}px;height:${sz}px;left:${x - sz/2}px;top:${y - sz/2}px`;
    el.appendChild(r);
    setTimeout(() => r.remove(), 640);
  }
  document.addEventListener('touchstart', ripple, {passive:true});
  document.addEventListener('mousedown', ripple);
})();

