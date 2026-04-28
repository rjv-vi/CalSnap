// ── iOS 26 PILL HELPERS ──
function _movePill(pillId, targetBtn, instant){
  const pill = document.getElementById(pillId);
  if(!pill || !targetBtn) return;
  const tabs = targetBtn.closest('.tabs');
  if(!tabs) return;
  const tr = tabs.getBoundingClientRect();
  const br = targetBtn.getBoundingClientRect();
  const inset = 3;
  const tx = br.left - tr.left + inset;
  const w = br.width - inset * 2;
  if(instant){
    pill.style.transition = 'none';
    requestAnimationFrame(()=>{ pill.style.transition = ''; });
  }
  pill.style.transform = `translateX(${tx}px)`;
  pill.style.width = w + 'px';
}

function _initPill(pillId, tabsId){
  const tabs = document.getElementById(tabsId);
  if(!tabs) return;
  const active = tabs.querySelector('.tab.on');
  if(!active) return;
  _movePill(pillId, active, true);
}

function _moveNavPill(activeBtn){
  const pill = document.getElementById('nav-pill');
  if(!pill || !activeBtn) return;
  const br = activeBtn.getBoundingClientRect();
  const pad = br.width * 0.08;
  pill.style.left = (br.left + pad) + 'px';
  pill.style.width = (br.width - pad*2) + 'px';
}


// ── iOS 26 DRAGGABLE TABS ──
function initDragTabs(tabsId, pillId, items){
  const tabs = document.getElementById(tabsId);
  if(!tabs) return;
  const pill = document.getElementById(pillId);
  const tabEls = items.map((_,i)=>document.getElementById(tabsId.replace('Tabs','Tab')+i)).filter(Boolean);
  let dragging = false, startBtn = null, _lastTabIdx = -1;
  const SPRING = 'transform .32s cubic-bezier(.22,1,.36,1), width .32s cubic-bezier(.22,1,.36,1)';

  tabs.addEventListener('touchstart', e=>{
    const t = e.target.closest('.tab');
    if(!t) return;
    // Only start drag if finger is directly on the pill rectangle
    const touch = e.touches[0];
    const pr = pill.getBoundingClientRect();
    if(touch.clientX < pr.left || touch.clientX > pr.right ||
       touch.clientY < pr.top  || touch.clientY > pr.bottom) return;
    startBtn = t;
    dragging = true;
    pill.style.transition = 'none';
  },{passive:true});

  tabs.addEventListener('touchmove', e=>{
    if(!dragging) return;
    const x = e.touches[0].clientX;
    const tr = tabs.getBoundingClientRect();
    const inset = 3;

    // Get bounds of first and last tab
    const first = tabEls[0].getBoundingClientRect();
    const last  = tabEls[tabEls.length-1].getBoundingClientRect();
    const clampedX = Math.max(first.left + first.width/2, Math.min(last.left + last.width/2, x));

    // Interpolate between tabs based on exact finger position
    for(let i = 0; i < tabEls.length - 1; i++){
      const a = tabEls[i].getBoundingClientRect();
      const b = tabEls[i+1].getBoundingClientRect();
      const aCenter = a.left + a.width / 2;
      const bCenter = b.left + b.width / 2;
      if(clampedX >= aCenter && clampedX <= bCenter){
        const t = (clampedX - aCenter) / (bCenter - aCenter); // 0→1
        const tx = (a.left - tr.left + inset) + (b.left - a.left) * t;
        const w  = (a.width - inset*2) + (b.width - a.width) * t;
        pill.style.transform = `translateX(${tx}px)`;
        pill.style.width = w + 'px';
        return;
      }
    }
    // Edge cases — snap to first or last
    const edge = clampedX < first.left + first.width/2 ? tabEls[0] : tabEls[tabEls.length-1];
    const er = edge.getBoundingClientRect();
    pill.style.transform = `translateX(${er.left - tr.left + inset}px)`;
    pill.style.width = (er.width - inset*2) + 'px';
  },{passive:true});

  tabs.addEventListener('touchend', e=>{
    if(!dragging) return;
    dragging = false;
    pill.style.transition = SPRING;
    const x = e.changedTouches[0].clientX;
    // Find nearest tab center
    let nearest = tabEls[0], nearestDist = Infinity;
    for(const t of tabEls){
      const r = t.getBoundingClientRect();
      const d = Math.abs(x - (r.left + r.width/2));
      if(d < nearestDist){ nearestDist = d; nearest = t; }
    }
    if(nearest !== startBtn) nearest.click();
    else _movePill(pillId, nearest);
  },{passive:true});
}

// ── iOS 26 DRAGGABLE NAV BAR ──
function initNavDrag(){
  const nav = document.getElementById('nav');
  const pill = document.getElementById('nav-pill');
  const nbs = Array.from(document.querySelectorAll('.nb'));
  if(!nav || !pill) return;
  let dragging = false, startBtn = null;
  const SPRING = 'left .38s cubic-bezier(.22,1,.36,1), width .38s cubic-bezier(.22,1,.36,1)';
  const PAD = 0.1; // 10% padding each side

  function setPillToBtn(btn, instant){
    const r = btn.getBoundingClientRect();
    if(instant) pill.style.transition = 'none';
    pill.style.left = (r.left + r.width * PAD) + 'px';
    pill.style.width = (r.width * (1 - PAD*2)) + 'px';
    if(instant) requestAnimationFrame(()=>{ pill.style.transition = SPRING; });
  }

  nav.addEventListener('touchstart', e=>{
    const t = e.target.closest('.nb');
    if(!t) return;
    // Only start drag if finger is directly on the pill rectangle
    const touch = e.touches[0];
    const pr = pill.getBoundingClientRect();
    if(touch.clientX < pr.left || touch.clientX > pr.right ||
       touch.clientY < pr.top  || touch.clientY > pr.bottom) return;
    startBtn = t;
    dragging = true;
    pill.style.transition = 'none';
  },{passive:true});

  nav.addEventListener('touchmove', e=>{
    if(!dragging) return;
    const x = e.touches[0].clientX;
    // Interpolate between adjacent tabs — pill follows finger smoothly
    for(let i = 0; i < nbs.length - 1; i++){
      const a = nbs[i].getBoundingClientRect();
      const b = nbs[i+1].getBoundingClientRect();
      const aC = a.left + a.width / 2;
      const bC = b.left + b.width / 2;
      if(x >= aC && x <= bC){
        const t = (x - aC) / (bC - aC);
        pill.style.left = ((a.left + a.width*PAD) + (b.left - a.left) * t) + 'px';
        pill.style.width = ((a.width*(1-PAD*2)) + (b.width - a.width) * t) + 'px';
        return;
      }
    }
    // Clamp to edges
    const first = nbs[0].getBoundingClientRect();
    const last  = nbs[nbs.length-1].getBoundingClientRect();
    if(x < first.left + first.width/2) setPillToBtn(nbs[0]);
    else setPillToBtn(nbs[nbs.length-1]);
  },{passive:true});

  nav.addEventListener('touchend', e=>{
    if(!dragging) return;
    dragging = false;
    pill.style.transition = SPRING;
    const x = e.changedTouches[0].clientX;
    let nearest = nbs[0], nearestDist = Infinity;
    for(const nb of nbs){
      const r = nb.getBoundingClientRect();
      const d = Math.abs(x - (r.left + r.width/2));
      if(d < nearestDist){ nearestDist = d; nearest = nb; }
    }
    if(nearest !== startBtn) nearest.click();
    else setPillToBtn(nearest);
  },{passive:true});
}

// ── DRAG SELECT (gender / activity / goal cards) ──
function initDragSelect(container, cardSel, onPick) {
  if(!container) return;
  let dragging = false, lastCard = null;

  container.addEventListener('touchstart', e => {
    const t = e.target.closest(cardSel);
    if(!t) return;
    // Only start drag if finger begins on the currently selected (.on) card
    if(!t.classList.contains('on')) return;
    dragging = true;
    lastCard = t;
  }, {passive:true});

  container.addEventListener('touchmove', e => {
    if(!dragging) return;
    const touch = e.touches[0];
    const el = document.elementFromPoint(touch.clientX, touch.clientY);
    const card = el && el.closest(cardSel);
    if(card && card !== lastCard) {
      container.querySelectorAll(cardSel).forEach(c => c.classList.remove('on'));
      card.classList.add('on');
      lastCard = card;
      if(typeof HFX !== 'undefined') HFX.light();
    }
  }, {passive:true});

  const finish = () => {
    if(!dragging) return;
    dragging = false;
    if(lastCard) { onPick(lastCard); lastCard = null; }
  };
  container.addEventListener('touchend',   finish, {passive:true});
  container.addEventListener('touchcancel',finish, {passive:true});
}

// ── DEV PANEL ──
let _devTaps=0,_devTapTimer=null;
function devTap(){
  _devTaps++;clearTimeout(_devTapTimer);
  if(_devTaps>=5){_devTaps=0;openDevPanel();return;}
  _devTapTimer=setTimeout(()=>_devTaps=0,1500);
}
async function openDevPanel(){
  HFX.heavy();SFX.play('sheet_open');
  const ov=document.getElementById('devOv');
  ov.style.display='flex';
  const c=document.getElementById('devContent');
  let swStatus='Не поддерживается',swCache='—';
  if('serviceWorker' in navigator){
    try{
      const regs=await navigator.serviceWorker.getRegistrations();
      swStatus=regs.length>0?'✅ Активен ('+regs.length+' SW)':'⚠️ Не зарегистрирован';
      const keys=await caches.keys();
      swCache=keys.length>0?keys.join(', '):'Пусто';
    }catch(e){swStatus='Ошибка: '+e.message;}
  }
  let lsSize=0;
  for(let k in localStorage){if(localStorage.hasOwnProperty(k))lsSize+=localStorage[k].length+k.length;}
  const errs=window._devErrors||[];
  c.innerHTML=`
    <div style="background:var(--f1);border-radius:12px;padding:12px;display:flex;flex-direction:column;gap:6px">
      <div style="font-weight:700;color:var(--t2);font-size:10px;text-transform:uppercase;letter-spacing:.5px;margin-bottom:2px">Приложение</div>
      <div>Версия: <b>1.4</b></div>
      <div>ETag: <b style="font-size:11px;word-break:break-all">${localStorage.getItem('_etag')||'—'}</b></div>
      <div>Онлайн: <b>${navigator.onLine?'✅ Да':'❌ Нет'}</b></div>
    </div>
    <div style="background:var(--f1);border-radius:12px;padding:12px;display:flex;flex-direction:column;gap:6px">
      <div style="font-weight:700;color:var(--t2);font-size:10px;text-transform:uppercase;letter-spacing:.5px;margin-bottom:2px">Service Worker</div>
      <div>Статус: <b>${swStatus}</b></div>
      <div>Кэш: <b>${swCache}</b></div>
    </div>
    <div style="background:var(--f1);border-radius:12px;padding:12px;display:flex;flex-direction:column;gap:6px">
      <div style="font-weight:700;color:var(--t2);font-size:10px;text-transform:uppercase;letter-spacing:.5px;margin-bottom:2px">Данные</div>
      <div>localStorage: <b>${(lsSize/1024).toFixed(1)} КБ</b></div>
      <div>Уведомления: <b>${typeof Notification!=='undefined'?Notification.permission:'—'}</b></div>
      <div style="font-size:10px;color:var(--t2);word-break:break-all">UA: ${navigator.userAgent.substring(0,100)}</div>
    </div>
    <div style="background:var(--f1);border-radius:12px;padding:12px;display:flex;flex-direction:column;gap:6px">
      <div style="font-weight:700;color:var(--t2);font-size:10px;text-transform:uppercase;letter-spacing:.5px;margin-bottom:2px">Ошибки (последние 5)</div>
      ${errs.length>0?errs.slice(-5).map(e=>`<div style="color:var(--err);font-size:11px">${e}</div>`).join(''):'<div style="color:var(--ok)">Ошибок нет ✅</div>'}
    </div>`;
}
function closeDevPanel(){
  SFX.play('sheet_close');
  const ov=document.getElementById('devOv');
  ov.style.display='none';
}
async function devForceUpdate(){
  showConfirm('🔄','Принудительное обновление?','Кэш и SW будут очищены, приложение перезагрузится.','Обновить',async()=>{
    localStorage.removeItem('_etag');
    if('serviceWorker' in navigator){const r=await navigator.serviceWorker.getRegistrations();await Promise.all(r.map(x=>x.unregister()));}
    if('caches' in window){const ks=await caches.keys();await Promise.all(ks.map(k=>caches.delete(k)));}
    window.location.replace(location.pathname+'?_='+Date.now());
  });
}
function devCopyLogs(){
  SFX.play('copy'); HFX.light();
  const errs=window._devErrors||[];
  const info={version:'1.4',etag:localStorage.getItem('_etag'),online:navigator.onLine,ua:navigator.userAgent,errors:errs};
  const text=JSON.stringify(info,null,2);
  try{
    navigator.clipboard.writeText(text).then(()=>showToast('📋 Логи скопированы')).catch(()=>{
      // Fallback for browsers that block clipboard without user gesture
      const ta=document.createElement('textarea');
      ta.value=text;ta.style.position='fixed';ta.style.opacity='0';
      document.body.appendChild(ta);ta.focus();ta.select();
      document.execCommand('copy');document.body.removeChild(ta);
      showToast('📋 Логи скопированы');
    });
  }catch(e){showToast(tf('toast_error_msg',{msg:e.message}));}
}
window._devErrors=[];
window.onerror=function(m,s,l){window._devErrors.push(m+' ('+s+':'+l+')');if(window._devErrors.length>20)window._devErrors.shift();};
window.addEventListener('unhandledrejection',function(e){window._devErrors.push('Promise: '+e.reason);if(window._devErrors.length>20)window._devErrors.shift();});
