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

// True when the browser rejected a write because the origin is out of quota.
function _isQuotaError(e){
  if (!e) return false;
  return e.name === 'QuotaExceededError'
      || e.name === 'NS_ERROR_DOM_QUOTA_REACHED'
      || e.code === 22 || e.code === 1014
      || /quota/i.test(e.message || '');
}

// Reclaim localStorage space, cheapest-to-lose first. Returns true when
// anything was actually freed. Legacy inline photos are the only large
// payload, so they are moved into IndexedDB (or dropped) oldest-first.
function _reclaimStorage(){
  let freed = false;
  // (a) Disposable AI/tip caches.
  try {
    const doomed = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k) continue;
      if (k.startsWith('week_') || k.startsWith('tip_') ||
          (k.startsWith('goal_hit_') && k !== 'goal_hit_' + ds()) ||
          (k.startsWith('daily_ai_') && k !== 'daily_ai_' + ds())) doomed.push(k);
    }
    doomed.forEach(k => { try { localStorage.removeItem(k); } catch(e) {} delete _lsCache[k]; });
    if (doomed.length) freed = true;
  } catch(e) {}
  // (b) Water history older than 120 days.
  try {
    const cutoff = Date.now() - 120 * 86400000;
    const doomed = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k || !k.startsWith('water_') || k === 'water_enabled') continue;
      const d = new Date(k.slice(6));
      if (!isNaN(d) && d.getTime() < cutoff) doomed.push(k);
    }
    doomed.forEach(k => { try { localStorage.removeItem(k); } catch(e) {} delete _lsCache[k]; });
    if (doomed.length) freed = true;
  } catch(e) {}
  // (c) Legacy inline photos in the food log — the actual space hog.
  try {
    if (Array.isArray(log)) {
      // Oldest entries first: the log is newest-first, so walk it backwards.
      let moved = 0;
      for (let i = log.length - 1; i >= 0 && moved < 40; i--) {
        const e = log[i];
        if (!e || !e.img) continue;
        const legacy = e.img;
        delete e.img;
        moved++;
        // Best-effort move into IndexedDB; the entry itself survives either way.
        try {
          if (typeof storeFoodImage === 'function') {
            storeFoodImage(legacy).then(ref => {
              if (ref && ref.imgId) { e.imgId = ref.imgId; _persistLogRaw(); }
            }).catch(() => {});
          }
        } catch(err) {}
      }
      if (moved) {
        freed = true;
        _persistLogRaw();
      }
    }
  } catch(e) {}
  return freed;
}

// Raw log write used by the reclaim path — never recurses into _reclaimStorage.
function _persistLogRaw(){
  try { return _writeThrough('log', JSON.stringify(log)); }
  catch(e) { return false; }
}

// Storage that silently discards writes cannot be worked around — but the user
// must be told, once, instead of losing a day's log without a word.
let _storageBrokenReported = false;
function _reportStorageBroken(){
  if (_storageBrokenReported) return;
  _storageBrokenReported = true;
  try { if (window._devErrors) window._devErrors.push('localStorage is not persisting writes'); } catch(e) {}
  try { if (typeof showToast === 'function') showToast(t('toast_storage_broken'), 7000); } catch(e) {}
}

// Write-through setter. Returns true on success. On quota exhaustion it
// reclaims space and retries once; if it still fails the in-memory cache is
// invalidated (rather than poisoned with a value that was never persisted)
// so the UI cannot keep pretending the data is safe.
// Verified write. `setItem` succeeding is not proof of persistence: private
// modes and some Android WebViews accept the call and discard the value, which
// is indistinguishable from success until the next launch. Reading the key back
// catches that immediately.
function _writeThrough(k, str){
  localStorage.setItem(k, str);
  if (localStorage.getItem(k) !== str) throw new Error('storage-not-persisting');
  _lsCache[k] = str;
  return true;
}

// Keys worth mirroring into IndexedDB — everything the user would mourn.
const _DURABLE = /^(u|wts|favs|pending_photos|water_)/;

const S=(k,v)=>{
  const str = v == null ? '' : String(v);
  try {
    _writeThrough(k, str);
    if (_DURABLE.test(k)) { try { snapshotSave(); } catch(err) {} }
    return true;
  } catch(e) {
    if (!_isQuotaError(e)) {
      delete _lsCache[k];
      if (e && e.message === 'storage-not-persisting') _reportStorageBroken();
      return false;
    }
    const freed = _reclaimStorage();
    if (freed) {
      try {
        _writeThrough(k, str);
        try { if (typeof showToast === 'function') showToast(t('toast_storage_full'), 4200); } catch(err) {}
        return true;
      } catch(e2) { /* fall through */ }
    }
    delete _lsCache[k];
    try { if (typeof showToast === 'function') showToast(t('toast_storage_fail'), 6000); } catch(err) {}
    try { if (window._devErrors) window._devErrors.push('Storage quota exceeded on key: ' + k); } catch(err) {}
    return false;
  }
};

// Persist the food log. Every mutation of `log` must go through this so a
// failed write is surfaced instead of silently losing the day's entries.
//
// The retry deliberately re-serialises: _reclaimStorage() strips legacy inline
// photos out of `log` itself, so replaying the *original* JSON string would
// still be too big and the write would fail again.
function saveLog(){
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      _writeThrough('log', JSON.stringify(log));
      // Mirror into IndexedDB so an evicted or misbehaving localStorage can be
      // healed on the next launch instead of losing the diary.
      try { snapshotSave(); } catch(e) {}
      return true;
    } catch(e) {
      delete _lsCache['log'];
      if (!_isQuotaError(e)) {
        if (e && e.message === 'storage-not-persisting') _reportStorageBroken();
        return false;
      }
      if (!_reclaimStorage()) break;
      if (attempt === 0) {
        try { if (typeof showToast === 'function') showToast(t('toast_storage_full'), 4200); } catch(err) {}
      }
    }
  }
  try { if (typeof showToast === 'function') showToast(t('toast_storage_fail'), 6000); } catch(err) {}
  try { if (window._devErrors) window._devErrors.push('Storage quota exceeded saving food log'); } catch(err) {}
  return false;
}

// Drop the cache for a key (or everything) — used by reset / import flows.
const Ginvalidate=(k)=>{ if(k==null){ for(const x in _lsCache) delete _lsCache[x]; } else { delete _lsCache[k]; } };
try { window.addEventListener('storage', e => { if (e.key) delete _lsCache[e.key]; else Ginvalidate(); }); } catch(e) {}

// Water tracking — opt-in feature, OFF by default until the user enables it
// in Settings → Nutrition. Used to gate water widgets (Home/Progress) and to
// decide whether the AI assistant is allowed to mention water at all.
const isWaterOn = () => G('water_enabled','0') === '1';

// AI chat memory — opt-in, OFF by default. When enabled, prior chat turns
// are sent back to Gemini as conversation history so the assistant can
// reference earlier messages — at the cost of more tokens per request.
const isChatMemoryOn = () => G('chat_memory_enabled','0') === '1';

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
  // Ask the browser to stop treating our storage as disposable, then heal
  // whatever it already discarded. Both are fire-and-forget.
  try { requestPersistentStorage(); } catch(e) {}
  try { _healFromSnapshot(); } catch(e) {}
  // Older builds kept a single API key in `key`; fold it into the pool.
  try { migrateLegacyApiKey(); syncActiveKey(); } catch(e) {}
  // Unlock vibration on first user gesture (required by browser policy)
  const _unlockVibration = () => {
    try { navigator.vibrate && navigator.vibrate(1); } catch(e) {}
    document.removeEventListener('touchstart', _unlockVibration);
    document.removeEventListener('click', _unlockVibration);
  };
  document.addEventListener('touchstart', _unlockVibration, {once:true, passive:true});
  document.addEventListener('click', _unlockVibration, {once:true});

  // Apply translations for the stored locale
  try { applyI18n(); } catch(e) {}

  // Drag-select in onboarding — wired for both new and returning users
  setTimeout(()=>{
    try {
      initDragSelect(document.querySelector('#os2 .gender-row'), '.gender-card', c => pickGender(c.id === 'gen_m' ? 'm' : 'f'));
      initDragSelect(document.querySelector('#os3 .act-grid, .act-grid'), '.act-card', c => sa(c));
      initDragSelect(document.querySelector('#os4 .goal-grid, .goal-grid'), '.goal-card', c => sg(c));
    } catch(e) {}
  }, 60);

  // DOB handled by drum picker
  if(!U){
    // First launch — welcome sound, after the splash has faded
    setTimeout(()=>SFX.play('welcome'), 2000);
    ss('ob');
    // Onboarding progress is driven by the .ob-prog dots
    return;
  }
  document.getElementById('nav').style.display='flex';
  // Check notification status
  if(window.Notification?.permission==='granted') _updateNotifStatus(true);
  // Re-schedule notifications if enabled
  if(G('notif_enabled')==='1' && window.Notification?.permission==='granted') {
    try { _scheduleNotifs(); } catch(e) { console.warn('scheduleNotifs failed:', e); }
  } else if(G('notif_enabled')==='1') {
    // Permission not granted but was enabled — sync disabled state
    try { _syncScheduleToSW(_getNotifCfg()); } catch(e) {}
  }
  ss('home');rH();rSet();if(hasApiKey())setTimeout(fetchGeminiModels,800);
  // Photos parked while offline: analyse them now if we can.
  try { renderQueue(); } catch(e) {}
  setTimeout(()=>{ try { processQueue({}); } catch(e) {} }, 2500);
  // Init sliding pills
  setTimeout(()=>{
    const firstNb=document.querySelector('.nb.on');
    if(firstNb)_moveNavPill(firstNb);
    _initPill('addTabPill','addTabs');
    initDragTabs('addTabs','addTabPill',[0,1,2,3]);
    initNavDrag();
  },80);

  // Handle the manifest share_target (shared text → straight to analysis)
  try { _handleShareTarget(); } catch(e) {}
  // Handle the hash shortcuts (#add, #scan)
  try { _handleHashShortcut(); } catch(e) {}
  // Daily AI summary (skipped if it was already shown today)
  setTimeout(()=>{ try { _maybeShowDailySummary(); } catch(e){} }, 1500);
  // Move any legacy inline photos out of localStorage and drop unreferenced
  // IndexedDB blobs. Runs off the critical path.
  onIdle(()=>{ _migrateLegacyImages(); }, 2000);
  // Keep the IndexedDB mirror current even if nothing is edited this session.
  onIdle(()=>{ try { snapshotSave(200); } catch(e) {} }, 3000);
}

// Restore anything the IndexedDB mirror still has but localStorage lost. Runs
// before the first render for the profile, and re-renders if entries came back.
async function _healFromSnapshot(){
  try {
    const report = await snapshotRestore();
    if (!report) return;
    try { rH(); rSet(); } catch(e) {}
    if (report.entries) showToast(tf('toast_data_restored', { n: report.entries }), 6000);
    else if (report.profile) showToast(t('toast_profile_restored'), 5000);
    try { if (window._devErrors) window._devErrors.push('Restored from snapshot: ' + JSON.stringify(report)); } catch(e) {}
    // A profile that came back means we were showing onboarding — leave it.
    if (report.profile && U) {
      document.getElementById('nav').style.display = 'flex';
      ss('home');
    }
  } catch(e) {}
}

// One-time migration: photos saved by older builds live inline in `log` as
// base64 data URLs. Move them to IndexedDB so localStorage stops filling up.
async function _migrateLegacyImages(){
  try {
    if (!Array.isArray(log)) return;
    if (typeof storeFoodImage !== 'function') return;
    if (!(await IMG.available())) return;
    let changed = false;
    for (const e of log) {
      if (!e || !e.img) continue;
      try {
        const ref = await storeFoodImage(e.img);
        if (ref && ref.imgId) { e.imgId = ref.imgId; delete e.img; changed = true; }
        else if (ref && ref.img) { e.img = ref.img; changed = true; } // at least shrink it
      } catch(err) {}
    }
    if (changed) { saveLog(); try { rH(); } catch(err) {} }
    // Favourites copied the same oversized data URLs out of the log.
    try {
      const favs = JSON.parse(G('favs','[]')) || [];
      let favChanged = false;
      for (const f of favs) {
        if (!f || !f.img) continue;
        const ref = await storeFoodImage(f.img);
        if (ref && ref.imgId) { f.imgId = ref.imgId; delete f.img; favChanged = true; }
        else if (ref && ref.img) { f.img = ref.img; favChanged = true; }
      }
      if (favChanged) { S('favs', JSON.stringify(favs)); try { renderFavs(); } catch(err) {} }
    } catch(err) {}
    await pruneOrphanImages();
  } catch(e) {}
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
  const b=new Date(dob);
  if(isNaN(b))return null;
  const n=new Date();
  let a=n.getFullYear()-b.getFullYear();
  if(n.getMonth()<b.getMonth()||(n.getMonth()===b.getMonth()&&n.getDate()<b.getDate()))a--;
  // A negative result means the date is in the future; callers check for it.
  return a;
}
// onDobChange replaced by drum picker
function on2(){
  const btn=document.getElementById('ob_dob_btn');
  const dob=btn?.dataset?.dob||'';
  const h=document.getElementById('obh').value,w=document.getElementById('obw').value;
  const age=calcAgeFromDob(dob);
  if(!dob||age==null||age<0||age>120){
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
  try { snapshotSave(200); } catch(e) {}
  HFX.success();SFX.play('ob_finish');
  document.getElementById('nav').style.display='flex';
  ss('home');rH();rSet();
  // init() returns early for first-run users (onboarding), so the sliding
  // pills and drag handlers were never wired up in that first session.
  setTimeout(()=>{
    try {
      const firstNb=document.querySelector('.nb.on');
      if(firstNb)_moveNavPill(firstNb);
      _initPill('addTabPill','addTabs');
      initDragTabs('addTabs','addTabPill',[0,1,2,3]);
      initNavDrag();
    } catch(e) {}
  },80);
}

// Screens
function ss(id){document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active'));document.getElementById(id).classList.add('active');if(id==='prog')rP();if(id==='ai'){initAi();}}
function goS(id,btn){
  // Guard: don't switch if onboarding is showing
  if(!U) return;
  HFX.light(); SFX.play('tab_switch');
  const prev = document.querySelector('.screen.active');
  if(prev) prev.classList.remove('active');
  // Nav highlight + pill are updated for *every* destination, including the
  // AI overlay. Previously the AI branch returned early, which left the
  // previous tab highlighted and the sliding pill parked on the wrong button.
  document.querySelectorAll('.nb').forEach(b=>b.classList.remove('on'));
  if(btn) btn.classList.add('on');
  if(btn) _moveNavPill(btn);
  // AI is an overlay, not a .screen
  const aiEl = document.getElementById('ai');
  if(id==='ai'){
    if(aiEl) aiEl.style.display='flex';
    initAi();
    try { armBackGuard(); } catch(e) {}
    return;
  }
  if(aiEl) aiEl.style.display='none';
  // Leaving the AI overlay releases the back-guard it armed.
  try { if(!anyOverlayOpen()) disarmBackGuard(); } catch(e) {}
  // Show new screen with fresh animation
  const next = document.getElementById(id);
  if(next){
    next.style.animation='none';
    // Force reflow to restart animation
    void next.offsetWidth;
    next.style.animation='';
    next.classList.add('active');
  }
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
// Always a zero-padded 24-hour HH:MM string. This value is *parsed* back
// (getMealType splits on ':') and compared as text, so it must never follow
// the display locale — an en-US formatter would yield "02:05 PM" and break
// meal grouping the moment the user switches language.
const tnow=(d)=>{
  const n = d || new Date();
  return String(n.getHours()).padStart(2,'0') + ':' + String(n.getMinutes()).padStart(2,'0');
};

// Streak, with a freeze that forgives one missed day per week
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
    // A freeze already recorded for this day keeps the streak alive
    if(freezes[dStr]){ continue; }
    // Auto-freeze: one missed day a week can be covered
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
