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

// Single source of truth for the retry button's markup so every state
// (idle / checking / restored) renders localised copy.
function _offlRetryHtml(labelKey){
  return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-3.5"/></svg> <span>${esc(t(labelKey))}</span>`;
}
function showOfflineModal() {
  const btn = document.getElementById('offlRetryBtn');
  if(btn){ btn.style.display=''; btn.disabled=false; btn.style.opacity='1';
    btn.innerHTML=_offlRetryHtml('offl_retry');
  }
  const _ov=document.getElementById('offlOv'); 
  _ov.style.display='flex'; 
  const _oc=document.getElementById('offlCard');
  if(_oc){ _oc.style.animation='none'; void _oc.offsetWidth; _oc.style.animation='sheetUp .26s cubic-bezier(.22,.68,0,1)'; }
}

function hideOfflineModal() {
  document.getElementById('offlOv').style.display='none';
}

function enterOffline() {
  hideOfflineModal();
  _applyOfflineUI(true);
}

function retryConnection() {
  const btn = document.getElementById('offlRetryBtn');
  if(btn){
    btn.disabled=true; btn.style.opacity='.6';
    btn.innerHTML=_offlRetryHtml('offl_checking').replace('<svg ', '<svg style="animation:spin .7s linear infinite" ');
  }
  checkConnection().then(online => {
    if(online) {
      _applyOfflineUI(false);
      hideOfflineModal();
    } else {
      if(btn){ btn.disabled=false; btn.style.opacity='1'; btn.innerHTML=_offlRetryHtml('offl_retry'); }
      const card = document.getElementById('offlCard');
      if(card){
        card.style.animation='none'; void card.offsetWidth;
        card.style.animation='offlShake .4s ease';
      }
    }
  });
}

// Восстановление / потеря соединения — единый обработчик.
// Only the AI tab is disabled offline. The "+" button stays live because the
// diary genuinely works offline (favourites, manual entry, editing) — exactly
// what the offline sheet itself promises. Disabling it made the app look
// broken the moment connectivity dropped.
function _applyOfflineUI(offline) {
  _isOfflineMode = offline;
  document.getElementById('offlBar')?.classList.toggle('on', offline);
  document.querySelectorAll('.nb').forEach(b => {
    if (b.getAttribute('onclick')?.includes("'ai'")) {
      b.style.opacity = offline ? '.35' : '';
      b.style.pointerEvents = offline ? 'none' : '';
    }
  });
  const addBtn = document.querySelector('.nb-add');
  if (addBtn) { addBtn.style.opacity = ''; addBtn.style.pointerEvents = ''; }
}
window.addEventListener('online', () => {
  setTimeout(() => {
    checkConnection().then(ok => { if (ok) _applyOfflineUI(false); });
  }, 500);
});
window.addEventListener('offline', () => {
  _applyOfflineUI(true);
  showToast(t('toast_offline'));
});



// ── RIPPLE TAP FEEDBACK ──
(function(){
  const RIPPLE_SELS = '.btn,.btn2,.goal-card,.act-card,.gender-card,.st-row,.logitem,.water-btn,.tab,.streak,.sc,.wt-btn,.ex,.ai-sg';
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

