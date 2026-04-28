// ══════════════════════════════════════════════════
// AUTHORS MODAL
// ══════════════════════════════════════════════════
function openAbout() {
  HFX.light(); SFX.play('sheet_open');
  document.getElementById('aboutOv').classList.add('on');
  document.body.style.overflow='hidden';
}
function closeAbout() {
  SFX.play('sheet_close');
  document.getElementById('aboutOv').classList.remove('on');
  document.body.style.overflow='';
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

function showOfflineModal() {
  // Убеждаемся что кнопка "Проверить" видна
  const btn = document.getElementById('offlRetryBtn');
  if(btn){ btn.style.display=''; btn.disabled=false;
    btn.innerHTML='<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-3.5"/></svg> Проверить соединение';
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
  _isOfflineMode = true;
  hideOfflineModal();
  document.getElementById('offlBar').classList.add('on');
  // Блокируем AI кнопку
  document.querySelectorAll('.nb').forEach(b => {
    if(b.getAttribute('onclick')?.includes("'ai'")) {
      b.style.opacity='.35'; b.style.pointerEvents='none';
    }
  });
  // Блокируем кнопку добавить еду
  const addBtn = document.querySelector('.nb-add');
  if(addBtn){ addBtn.style.opacity='.35'; addBtn.style.pointerEvents='none'; }
}

function retryConnection() {
  const btn = document.getElementById('offlRetryBtn');
  const origHTML = btn ? btn.innerHTML : '';
  if(btn){ btn.disabled=true; btn.style.opacity='.6'; btn.innerHTML='<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" style="animation:spin .7s linear infinite"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-3.5"/></svg> Проверяю...'; }
  checkConnection().then(online => {
    if(online) {
      hideOfflineModal();
    } else {
      if(btn){ btn.disabled=false; btn.style.opacity='1'; btn.innerHTML=origHTML||'<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-3.5"/></svg> Проверить соединение'; }
      const card = document.getElementById('offlCard');
      if(card){ 
        card.style.animation='none'; void card.offsetWidth;
        card.style.animation='offlShake .4s ease';
      }
    }
  });
}

// Восстановление / потеря соединения — единый обработчик
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
  if (addBtn) {
    addBtn.style.opacity = offline ? '.35' : '';
    addBtn.style.pointerEvents = offline ? 'none' : '';
  }
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

