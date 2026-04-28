// localStorage helpers with a small in-memory cache to avoid repeated
// synchronous IPC during hot render paths (rH/rCal/rP/rWater all read the
// same keys multiple times per render). Cache is invalidated on S() and on
// the `storage` event so cross-tab updates still flow through.
const _lsCache = Object.create(null);
const G=(k,d='')=>{
  if (k in _lsCache) {
    const v = _lsCache[k];
    return v == null ? d : v;
  }
  try {
    const v = localStorage.getItem(k);
    _lsCache[k] = v;
    return v == null ? d : v;
  } catch(e) { return d; }
};
const S=(k,v)=>{
  _lsCache[k] = v == null ? null : String(v);
  try { localStorage.setItem(k, v); } catch(e) {}
};
// Drop the cache for a key (or everything) — used by reset / import flows.
const Ginvalidate=(k)=>{ if(k==null){ for(const x in _lsCache) delete _lsCache[x]; } else { delete _lsCache[k]; } };
try { window.addEventListener('storage', e => { if (e.key) delete _lsCache[e.key]; else Ginvalidate(); }); } catch(e) {}

// State
let U=JSON.parse(G('u','null')),
    log=JSON.parse(G('log','[]')),
    wts=JSON.parse(G('wts','[]')),
    key=G('key'),
    cur={},
    edType='',
    aiReady=false,
    obAct=1.2,obGoal='maintain';

// Goals — labels follow current language via t()
function getGL(){ return { lose: t('goal_lose'), maintain: t('goal_maintain'), gain: t('goal_gain') }; }
const GL = new Proxy({}, { get(_,k){ return getGL()[k]; }, ownKeys(){ return ['lose','maintain','gain']; }, getOwnPropertyDescriptor(){ return { enumerable:true, configurable:true }; } });

// INIT
function init(){
  // Re-read U from localStorage in case of stale module-level parse (e.g. after notification permission reload)
  try { const _fresh = JSON.parse(localStorage.getItem('u') || 'null'); if(_fresh && !U) U = _fresh; } catch(e) {}
  // Unlock vibration on first user gesture (required by browser policy)
  const _unlockVibration = () => {
    try { navigator.vibrate && navigator.vibrate(1); } catch(e) {}
    document.removeEventListener('touchstart', _unlockVibration);
    document.removeEventListener('click', _unlockVibration);
  };
  document.addEventListener('touchstart', _unlockVibration, {once:true, passive:true});
  document.addEventListener('click', _unlockVibration, {once:true});

  // Применить переводы (если используется локаль EN)
  try { applyI18n(); } catch(e) {}

  // Drag-select для онбординга — вешаем для обоих веток (новый/существующий пользователь)
  setTimeout(()=>{
    try {
      initDragSelect(document.querySelector('#os2 .gender-row'), '.gender-card', c => pickGender(c.id === 'gen_m' ? 'm' : 'f'));
      initDragSelect(document.querySelector('#os3 .act-grid, .act-grid'), '.act-card', c => sa(c));
      initDragSelect(document.querySelector('#os4 .goal-grid, .goal-grid'), '.goal-card', c => sg(c));
    } catch(e) {}
  }, 60);

  // DOB handled by drum picker
  if(!U){
    // Первый запуск — звук приветствия (с задержкой после сплэша)
    setTimeout(()=>SFX.play('welcome'), 2000);
    ss('ob');
    // Прогресс онбординга обновляем через ob-prog
    return;
  }
  document.getElementById('nav').style.display='flex';
  // Check notification status
  if(typeof Notification!=='undefined'&&Notification.permission==='granted') _updateNotifStatus(true);
  // Re-schedule notifications if enabled
  if(G('notif_enabled')==='1' && Notification?.permission==='granted') {
    try { _scheduleNotifs(); } catch(e) { console.warn('scheduleNotifs failed:', e); }
  } else if(G('notif_enabled')==='1') {
    // Permission not granted but was enabled — sync disabled state
    try { _syncScheduleToSW(_getNotifCfg()); } catch(e) {}
  }
  ss('home');rH();rSet();if(key)setTimeout(fetchGeminiModels,800);
  // Init sliding pills
  setTimeout(()=>{
    const firstNb=document.querySelector('.nb.on');
    if(firstNb)_moveNavPill(firstNb);
    _initPill('addTabPill','addTabs');
    initDragTabs('addTabs','addTabPill',[0,1,2,3]);
    initNavDrag();
  },80);

  // Обработка share-target из manifest (расшарить текст еды → сразу анализ)
  try { _handleShareTarget(); } catch(e) {}
  // Обработка hash-shortcut (#add, #scan)
  try { _handleHashShortcut(); } catch(e) {}
  // Daily AI summary (если уже сегодня показывали — пропускаем)
  setTimeout(()=>{ try { _maybeShowDailySummary(); } catch(e){} }, 1500);
}

// Onboarding
function os(n){HFX.light();SFX.play('onboard_skip');document.querySelectorAll('.ob-step').forEach(s=>s.classList.remove('on'));document.getElementById('os'+n).classList.add('on')}
function on1(){
  const obn=document.getElementById('obn');
  const v=obn?.value.trim()||'';
  if(!v){
    HFX.error(); SFX.play('error');
    if(obn){
      obn.style.borderColor='var(--err)';
      obn.placeholder=t('ob_name_required','Введи имя');
      obn.focus();
      setTimeout(()=>{ obn.style.borderColor=''; }, 1600);
    }
    return;
  }
  HFX.medium();SFX.play('ob_next');os(2);
}
let obGender='m';
function pickGender(g){
  HFX.light(); SFX.play('select');
  obGender=g;
  document.getElementById('gen_m').classList.toggle('on',g==='m');
  document.getElementById('gen_f').classList.toggle('on',g==='f');
}
function calcAgeFromDob(dob){
  if(!dob)return null;
  const b=new Date(dob),n=new Date();
  let a=n.getFullYear()-b.getFullYear();
  if(n.getMonth()<b.getMonth()||(n.getMonth()===b.getMonth()&&n.getDate()<b.getDate()))a--;
  return a;
}
// onDobChange replaced by drum picker
function on2(){
  const btn=document.getElementById('ob_dob_btn');
  const dob=btn?.dataset?.dob||'';
  const h=document.getElementById('obh').value,w=document.getElementById('obw').value;
  const age=calcAgeFromDob(dob);
  if(!dob||!age||age<5||age>120){
    // Animate button to highlight
    const b=document.getElementById('ob_dob_btn');
    if(b){b.style.borderColor='var(--err)';setTimeout(()=>{b.style.borderColor='';},1500);}
    return;
  }
  if(!h||!w){
    const h_el=document.getElementById('obh'),w_el=document.getElementById('obw');
    if(!h&&h_el){h_el.style.borderColor='var(--err)';setTimeout(()=>{h_el.style.borderColor='';},1500);}
    if(!w&&w_el){w_el.style.borderColor='var(--err)';setTimeout(()=>{w_el.style.borderColor='';},1500);}
    return;
  }
  os(3);HFX.medium();SFX.play('ob_next');
}
function on3(){HFX.medium();SFX.play('ob_next');os(4)}
function sa(el){HFX.tick();SFX.play('select');document.querySelectorAll('[data-a]').forEach(e=>e.classList.remove('on'));el.classList.add('on');obAct=parseFloat(el.dataset.a)}
function sg(el){HFX.tick();SFX.play('select');document.querySelectorAll('[data-g]').forEach(e=>e.classList.remove('on'));el.classList.add('on');obGoal=el.dataset.g}
let _obPrefs=new Set();
function togglePref(el){el.classList.toggle('on');const p=el.dataset.p;if(_obPrefs.has(p))_obPrefs.delete(p);else _obPrefs.add(p);}
function onFin(){
  const name=document.getElementById('obn').value.trim();
  const dob=document.getElementById('ob_dob_btn')?.dataset?.dob||'';
  const gen=obGender;
  const h=parseFloat(document.getElementById('obh').value);
  const w=parseFloat(document.getElementById('obw').value);
  const age=calcAgeFromDob(dob)||18;
  let bmr=gen==='m'?10*w+6.25*h-5*age+5:10*w+6.25*h-5*age-161;
  let kcal=Math.round(bmr*obAct);
  if(obGoal==='lose')kcal-=500;
  if(obGoal==='gain')kcal+=300;
  kcal=Math.max(1200,kcal);
  const pr=Math.round(w*1.8),ft=Math.round(kcal*.25/9),cb=Math.round((kcal-pr*4-ft*9)/4);
  const prefs=[..._obPrefs];
  const allerg=document.getElementById('ob_allerg')?.value.trim()||'';
  U={name,dob,age,gen,h,w,goal:obGoal,act:obAct,kcal,pr,ft,cb,prefs,allerg};
  S('u',JSON.stringify(U));
  HFX.success();SFX.play('ob_finish');
  document.getElementById('nav').style.display='flex';
  ss('home');rH();rSet();
}

// Screens
function ss(id){document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active'));document.getElementById(id).classList.add('active');if(id==='prog')rP();if(id==='ai'){initAi();}}
function goS(id,btn){
  // Guard: don't switch if onboarding is showing
  if(!U) return;
  HFX.light(); SFX.play('tab_switch');
  const prev = document.querySelector('.screen.active');
  if(prev) prev.classList.remove('active');
  // Hide AI overlay
  const aiEl = document.getElementById('ai');
  if(id==='ai'){
    if(aiEl) aiEl.style.display='flex';
    return; // AI is not a .screen
  } else {
    if(aiEl) aiEl.style.display='none';
  }
  // Show new screen with fresh animation
  const next = document.getElementById(id);
  if(next){
    next.style.animation='none';
    // Force reflow to restart animation
    void next.offsetWidth;
    next.style.animation='';
    next.classList.add('active');
  }
  document.querySelectorAll('.nb').forEach(b=>b.classList.remove('on'));
  if(btn) btn.classList.add('on');
  _moveNavPill(btn);
  // Refresh data for screen
  if(id==='home')  rH();
  if(id==='prog')  rP();
  if(id==='sett')  rSet();
}

// Date
const ds=d=>(d||new Date()).toDateString();
const tlog=()=>log.filter(e=>e.date===ds());
const dlog=d=>log.filter(e=>e.date===d);
const tot=es=>es.reduce((s,e)=>({k:s.k+(e.kcal||0),p:s.p+(e.prot||0),f:s.f+(e.fat||0),c:s.c+(e.carb||0)}),{k:0,p:0,f:0,c:0});
const tnow=()=>new Date().toLocaleTimeString('ru',{hour:'2-digit',minute:'2-digit'});

// Streak — с поддержкой стрик-фриза (1 пропуск/неделю)
function streak(){
  let s=0;
  const n=new Date();
  const freezes = _getFreezes(); // {dateStr: true}
  let usedFreezeThisWeek = _isFreezeUsedThisWeek(freezes);
  for(let i=0;;i++){
    const d=new Date(n);d.setDate(d.getDate()-i);
    const dStr=ds(d);
    if(dlog(dStr).length){ s++; continue; }
    if(i===0){ continue; } // today not logged yet — check yesterday
    // Если уже есть фриз в этом дне — учитываем
    if(freezes[dStr]){ continue; }
    // Авто-фриз: один пропуск в неделю можно «подморозить»
    if(!usedFreezeThisWeek){
      freezes[dStr] = true;
      usedFreezeThisWeek = true;
      try { localStorage.setItem('streak_freezes', JSON.stringify(freezes)); } catch(e){}
      continue;
    }
    break;
  }
  return s;
}
function _getFreezes(){
  try { return JSON.parse(localStorage.getItem('streak_freezes') || '{}') || {}; }
  catch(e) { return {}; }
}
function _isFreezeUsedThisWeek(freezes){
  const now = new Date();
  const day = now.getDay() || 7; // ISO: Mon=1..Sun=7
  const monday = new Date(now);
  monday.setDate(now.getDate() - (day - 1));
  monday.setHours(0,0,0,0);
  for (const k in freezes) {
    const d = new Date(k);
    if (d >= monday && d < now) return true;
  }
  return false;
}

// HOME

