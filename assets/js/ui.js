// ── API key manager ──────────────────────────────────────────────
function openApi(){
  const i=document.getElementById('apiinp');
  if(i)i.value='';
  renderKeyList();
  document.getElementById('apiOv').classList.add('on');
  lockScroll(true);
}
function closeApi(){document.getElementById('apiOv').classList.remove('on');lockScroll(false);}

function renderKeyList(){
  const el=document.getElementById('keyList');
  if(!el)return;
  const pool=getKeyPool();
  if(!pool.length){
    el.innerHTML=`<div class="key-empty">${esc(t('key_empty'))}</div>`;
    return;
  }
  el.innerHTML=pool.map((e,i)=>{
    const st=keyStatus(e);
    return `<div class="key-row">
      <span class="key-dot ${st.cls}"></span>
      <div class="key-info">
        <div class="key-val">${esc(maskKey(e.k))}</div>
        <div class="key-state ${st.cls}">${esc(st.label)}</div>
      </div>
      ${(e.invalid||keyCooldownLeft(e)>0)?`<button class="key-mini" onclick="HFX.light();reviveKeyRow(${i})" title="${esc(t('retry'))}">↻</button>`:''}
      <button class="key-mini del" onclick="HFX.light();removeKeyRow(${i})" title="${esc(t('btn_delete'))}">✕</button>
    </div>`;
  }).join('');
}

function saveApi(){
  const inp=document.getElementById('apiinp');
  const v=(inp?.value||'').trim();
  if(!v){ if(inp){inp.style.borderColor='var(--err)';setTimeout(()=>{inp.style.borderColor='';},1400);} return; }
  const res=addApiKey(v);
  if(!res.ok){
    HFX.error(); SFX.play('error');
    showToast(res.reason==='duplicate'?t('key_dup'):res.reason==='full'?t('key_pool_full'):t('key_malformed'));
    if(inp){inp.style.borderColor='var(--err)';setTimeout(()=>{inp.style.borderColor='';},1600);}
    return;
  }
  if(inp)inp.value='';
  HFX.success(); SFX.play('save');
  showToast(tf('key_added',{n:res.count}));
  renderKeyList();
  document.getElementById('abar').style.display='none';
  rSet();
  fetchGeminiModels();
  // A fresh key may unblock photos parked while everything was exhausted.
  try{ processQueue({}); }catch(e){}
}

function removeKeyRow(i){
  const e=getKeyPool()[i];
  if(!e)return;
  showConfirm('🔑',t('key_remove_title'),maskKey(e.k),t('btn_delete'),()=>{
    removeApiKey(e.k);
    SFX.play('delete');
    renderKeyList(); rSet();
    document.getElementById('abar').style.display=hasApiKey()?'none':'flex';
  });
}

function reviveKeyRow(i){
  const e=getKeyPool()[i];
  if(!e)return;
  reviveApiKey(e.k);
  SFX.play('toggle');
  renderKeyList(); rSet();
  try{ processQueue({}); }catch(err){}
}

// Settings
function rSet(){
  if(!U)return;
  document.getElementById('sname').textContent=U.name||'—';
  if(U.dob){const _a=calcAgeFromDob(U.dob);if(_a&&_a!==U.age){U.age=_a;rcalc();S('u',JSON.stringify(U));}}
  document.getElementById('sgoal').textContent=GL[U.goal]||'—';
  document.getElementById('skcal').textContent=(U.kcal||0)+' '+t('unit_kcal');
  const _sp=document.getElementById('sprefs');
  if(_sp){
    // Translate the stored preference keys — this row used to print the raw
    // identifiers ("no_sugar") in both languages.
    const _labels=(U.prefs||[]).map(pk=>t('pref_'+pk, pk));
    const _ac=U.allerg?1:0;
    _sp.textContent=(_labels.length+_ac)>0
      ? _labels.join(', ')+(_ac?(_labels.length?' · ':'')+U.allerg:'')
      : t('not_set');
  }
  const _pool=getKeyPool();
  const _ready=_pool.filter(e=>keyIsUsable(e)).length;
  document.getElementById('sapi').textContent = !_pool.length
    ? t('set_api_unset')
    : (_pool.length===1
        ? (_ready?t('set_api_set'):t('set_api_paused'))
        : tf('set_api_pool',{ready:_ready,total:_pool.length}));
  const _mname=ALL_MODELS.find(m=>m.id===selModel)?.name||selModel;
  document.getElementById('smodel').textContent=_mname;
  const dark=document.documentElement.getAttribute('data-theme')==='dark';
  const tog=document.getElementById('themeToggle');if(tog)tog.classList.toggle('on',dark);
  const sfxTog=document.getElementById('sfxToggle');if(sfxTog)sfxTog.classList.toggle('on',SFX.isEnabled());
  const hfxTog=document.getElementById('hfxToggle');if(hfxTog)hfxTog.classList.toggle('on',HFX.isOn());
  const waterTog=document.getElementById('waterTrackingToggle');if(waterTog)waterTog.classList.toggle('on',isWaterOn());
  const memTog=document.getElementById('chatMemoryToggle');if(memTog)memTog.classList.toggle('on',isChatMemoryOn());
  const fsTog=document.getElementById('fullscreenToggle');if(fsTog)fsTog.classList.toggle('on',isFullscreenPref());
  const sl=document.getElementById('slang');if(sl)sl.textContent = LANG === 'en' ? 'EN' : 'RU';
  // Notif status
  if(typeof Notification!=='undefined'&&Notification.permission==='granted') _updateNotifStatus(true);
}

function toggleLang(){
  setLang(LANG === 'ru' ? 'en' : 'ru');
}

function ed(type){
  edType=type;
  const tl=document.getElementById('edtitle'),ct=document.getElementById('edcont');
  if(type==='name'){tl.textContent=t('set_name');ct.innerHTML=`<input class="inp" id="ed_v" value="${U.name||''}">`;}
  else if(type==='params'){
    tl.textContent=t('set_params');
    const curDob=U.dob||'';
    const curAge=curDob?calcAgeFromDob(curDob):U.age;
    const dispDob=curDob?`${String(new Date(curDob).getDate()).padStart(2,'0')}.${String(new Date(curDob).getMonth()+1).padStart(2,'0')}.${new Date(curDob).getFullYear()}`:'';
    _edGender=U.gen||'m';
    ct.innerHTML=`
      <label class="dob-label">${t('ob_dob')}</label>
      <button class="dob-picker-btn ${curDob?'filled':''}" id="ed_dob_btn" data-dob="${curDob}" onclick="openDrum('ed')">
        ${curDob?`<span class="dob-value">${dispDob}</span>`:`<span class="dob-placeholder">${t('ob_dob_pick')}</span>`}
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
      </button>
      <div class="dob-age-hint" id="ed_dob_hint" style="margin-bottom:14px">${curAge?tf('age_label',{age:curAge,years:fmtYears(curAge)}):''}</div>
      <div class="gender-row" style="margin-bottom:14px">
        <div class="gender-card ${U.gen==='m'?'on':''}" id="ed_gen_m" onclick="HFX.tick();SFX.play('select');edPickGender('m')"><span class="gc-icon">♂️</span><span class="gc-lbl">${t('gender_male')}</span></div>
        <div class="gender-card ${U.gen==='f'?'on':''}" id="ed_gen_f" onclick="HFX.tick();SFX.play('select');edPickGender('f')"><span class="gc-icon">♀️</span><span class="gc-lbl">${t('gender_female')}</span></div>
      </div>
      <input class="inp" type="number" id="ed_h" placeholder="${t('ob_height_ph')}" value="${U.h||''}" inputmode="decimal" style="margin-bottom:10px">
      <input class="inp" type="number" id="ed_w" placeholder="${t('ob_weight_ph')}" value="${U.w||''}" inputmode="decimal">
    `;
  }
  else if(type==='goal'){tl.textContent=t('set_goal');ct.innerHTML=`<div class="goal-grid">${Object.entries(GL).map(([k,v])=>`<div class="goal-card ${U.goal===k?'on':''}" data-g="${k}" onclick="HFX.tick();SFX.play('select');document.querySelectorAll('[data-g]').forEach(e=>e.classList.remove('on'));this.classList.add('on')"><div class="gn">${v}</div></div>`).join('')}</div>`;}
  else if(type==='prefs'){
    tl.textContent=t('set_prefs');
    const PREF_OPTS=[{p:'no_meat',l:t('pref_no_meat')},{p:'no_gluten',l:t('pref_no_gluten')},{p:'no_lactose',l:t('pref_no_lactose')},{p:'no_sugar',l:t('pref_no_sugar')},{p:'vegan',l:t('pref_vegan')},{p:'keto',l:t('pref_keto')},{p:'halal',l:t('pref_halal')},{p:'no_eggs',l:t('pref_no_eggs')}];
    const curPrefs=U.prefs||[];
    ct.innerHTML=`<div class="pref-grid" id="ed_prefs_grid">${PREF_OPTS.map(o=>`<div class="pref-chip${curPrefs.includes(o.p)?' on':''}" data-p="${o.p}" onclick="HFX.tick();SFX.play('select');this.classList.toggle('on')">${o.l}</div>`).join('')}</div>
    <div style="font-size:13px;font-weight:600;color:var(--t1);margin-bottom:6px">${t('allergies')}</div>
    <input class="inp" id="ed_allerg" value="${U.allerg||''}" placeholder="${t('allerg_ph')}">`;
  }
  else if(type==='kcal'){tl.textContent=t('set_kcal_norm');ct.innerHTML=`<input class="inp" type="number" id="ed_v" value="${U.kcal||2000}">`;}
  document.getElementById('edOv').classList.add('on');
  lockScroll(true);
  // Drag-select for edit modal cards
  if(type==='params') setTimeout(()=>{
    initDragSelect(ct.querySelector('.gender-row'), '.gender-card', c => edPickGender(c.id.includes('_m') ? 'm' : 'f'));
  }, 50);
  if(type==='goal') setTimeout(()=>{
    initDragSelect(ct.querySelector('.goal-grid'), '.goal-card', c => {
      ct.querySelectorAll('.goal-card').forEach(e=>e.classList.remove('on')); c.classList.add('on');
    });
  }, 50);
}
function closeEd(){HFX.light();SFX.play('sheet_close');document.getElementById('edOv').classList.remove('on');lockScroll(false);}
function saveEd(){
  if(edType==='name'){const v=document.getElementById('ed_v')?.value.trim();if(v)U.name=v;}
  else if(edType==='params'){
    const dobBtn=document.getElementById('ed_dob_btn');
    const dob=dobBtn?.dataset?.dob||'';
    if(dob){U.dob=dob;const a=calcAgeFromDob(dob);if(a&&a>0)U.age=a;}
    const hv=parseFloat(document.getElementById('ed_h')?.value);
    const wv=parseFloat(document.getElementById('ed_w')?.value);
    if(hv>0)U.h=hv;
    if(wv>0)U.w=wv;
    U.gen=_edGender||U.gen;
    rcalc();
  }else if(edType==='goal'){const s=document.querySelector('[data-g].on');if(s){U.goal=s.dataset.g;rcalc();}}
  else if(edType==='kcal'){const v=parseInt(document.getElementById('ed_v')?.value);if(v>0)U.kcal=v;}
  else if(edType==='prefs'){
    const chips=document.querySelectorAll('#ed_prefs_grid .pref-chip.on');
    U.prefs=[...chips].map(c=>c.dataset.p);
    const allerg=document.getElementById('ed_allerg')?.value.trim()||'';
    U.allerg=allerg;
  }
  S('u',JSON.stringify(U));rH();rSet();closeEd();
}
let _edGender='m';
function edPickGender(g){
  _edGender=g;
  const m=document.getElementById('ed_gen_m');
  const f=document.getElementById('ed_gen_f');
  if(m)m.classList.toggle('on',g==='m');
  if(f)f.classList.toggle('on',g==='f');
}
function edDobHint(){
  const dob=document.getElementById('ed_dob')?.value;
  const hint=document.getElementById('ed_dob_hint');
  if(!hint)return;
  const age=calcAgeFromDob(dob);
  hint.textContent=age&&age>0?tf('age_label',{age:age,years:fmtYears(age)}):t('check_date');
}
function rcalc(){
  let bmr=U.gen==='m'?10*U.w+6.25*U.h-5*U.age+5:10*U.w+6.25*U.h-5*U.age-161;
  let k=Math.round(bmr*(U.act||1.375));
  if(U.goal==='lose')k-=500;if(U.goal==='gain')k+=300;
  U.kcal=Math.max(1200,k);U.pr=Math.round(U.w*1.8);U.ft=Math.round(U.kcal*.25/9);U.cb=Math.round((U.kcal-U.pr*4-U.ft*9)/4);
}

// RFC-4180 field escaping. The previous version just stripped commas from
// names, which silently corrupted anything containing quotes or a newline.
function _csvCell(v){
  const s = String(v == null ? '' : v);
  return /[",\n\r;]/.test(s) ? '"' + s.replace(/"/g,'""') + '"' : s;
}
function exportCSV() {
  try {
    const rows = [[t('csv_date'),t('csv_time'),t('csv_food'),t('csv_portion'),t('csv_kcal'),t('csv_protein'),t('csv_carbs'),t('csv_fats')]];
    const sortedLog = [...log].sort((a,b) => {
      const da = a.date + ' ' + (a.time||''), db = b.date + ' ' + (b.time||'');
      return da < db ? 1 : -1;
    });
    sortedLog.forEach(item => {
      rows.push([
        item.date||'', item.time||'',
        item.food||'', item.portion||'',
        item.kcal||0, Math.round(item.prot||0),
        Math.round(item.carb||0), Math.round(item.fat||0)
      ]);
    });
    // Add water rows
    rows.push([]);
    rows.push([t('csv_date'),t('csv_time'),t('csv_drink'),t('csv_ml'),'','','','']);
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k || !k.startsWith('water_')) continue;
      try {
        const arr = JSON.parse(localStorage.getItem(k)||'[]');
        arr.forEach(e => {
          const d = DRINKS.find(x=>x.id===e.id)||{name:t('drink_default')};
          rows.push([k.replace('water_',''), e.t||'', d.name, e.ml||0,'','','','']);
        });
      } catch(e) {}
    }
    const csv = rows.map(r => r.map(_csvCell).join(',')).join('\r\n');
    const bom = '\uFEFF'; // UTF-8 BOM for Excel
    const blob = new Blob([bom + csv], {type:'text/csv;charset=utf-8;'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const date = new Date().toISOString().split('T')[0];
    a.href = url; a.download = `calsnap-${date}.csv`; a.click();
    setTimeout(()=>URL.revokeObjectURL(url), 4000);
    SFX.play('export_done'); HFX.success();
    showToast(t('toast_export_ok'));
  } catch(e) { showToast(t('toast_export_error')); }
}

function exportJSON(){
  try{
    const data={
      version:2,
      exported:new Date().toISOString(),
      user:G('u','null'),
      log:G('log','[]'),
      wts:G('wts','[]'),
      favs:G('favs','[]'),
      key:G('key',''),
      apiKeys:G('api_keys','[]'),
      model:G('model',''),
      theme:G('theme',''),
      lang:G('lang',''),
      cal:G('cal',''),
      hfx:G('hfx_enabled','1'),
      sfx:G('sfx_enabled','1'),
      notif:G('notif_enabled','0'),
      notifCfg:G('notif_cfg',''),
      waterEnabled:G('water_enabled','0'),
      chatMemory:G('chat_memory_enabled','0'),
      fullscreen:G('fullscreen_enabled','1'),
      freezes:G('streak_freezes','{}'),
    };
    // Сохраняем water_ ключи
    const waterKeys={};
    for(let i=0;i<localStorage.length;i++){
      const k=localStorage.key(i);
      if(k&&k.startsWith('water_'))waterKeys[k]=localStorage.getItem(k);
    }
    data.water=waterKeys;
    const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});
    const url=URL.createObjectURL(blob);
    const a=document.createElement('a');
    const date=new Date().toISOString().split('T')[0];
    a.href=url;a.download=`calsnap-backup-${date}.json`;a.click();
    setTimeout(()=>URL.revokeObjectURL(url), 4000);
    HFX.success();SFX.play('export_done');
    showToast(t('toast_export_ok'));
  }catch(e){showToast(tf('toast_export_error_msg',{msg:e.message}));}
}

function importJSON(input){
  const file=input.files[0];
  if(!file)return;
  const reader=new FileReader();
  reader.onload=function(e){
    try{
      const data=JSON.parse(e.target.result);
      if(!data.version||!data.log)throw new Error(t('toast_import_bad_format'));
      showConfirm('📥',t('confirm_import_title'),tf('confirm_import_body',{date:new Date(data.exported).toLocaleDateString(_localeTag())}),t('confirm_import_btn'),()=>{
        if(data.user&&data.user!=='null')S('u',data.user);
        if(data.log)S('log',data.log);
        if(data.wts)S('wts',data.wts);
        if(data.favs)S('favs',data.favs);
        if(data.key)S('key',data.key);
        if(data.apiKeys)S('api_keys',data.apiKeys);
        if(data.model)S('model',data.model);
        if(data.theme)S('theme',data.theme);
        if(data.lang)S('lang',data.lang);
        if(data.cal)S('cal',data.cal);
        if(data.hfx!=null)S('hfx_enabled',data.hfx);
        if(data.sfx!=null)S('sfx_enabled',data.sfx);
        if(data.notif!=null)S('notif_enabled',data.notif);
        if(data.notifCfg)S('notif_cfg',data.notifCfg);
        if(data.waterEnabled!=null)S('water_enabled',data.waterEnabled);
        if(data.chatMemory!=null)S('chat_memory_enabled',data.chatMemory);
        if(data.fullscreen!=null)S('fullscreen_enabled',data.fullscreen);
        if(data.freezes)S('streak_freezes',data.freezes);
        HFX.success(); SFX.play('import_done');
        if(data.water){Object.entries(data.water).forEach(([k,v])=>{try{localStorage.setItem(k,v);Ginvalidate(k);}catch(e){}});}
        resetScrollLock();
        setTimeout(()=>window.location.reload(),300);
      });
    }catch(err){showToast(tf('toast_error_msg',{msg:err.message}));}
    input.value='';
  };
  reader.readAsText(file);
}

// Toast — очередь до 3 одновременно, чтобы не перетирать важные сообщения
const _toastQueue = [];
let _toastShowing = false;
function showToast(msg, duration){
  duration = duration || 2400;
  _toastQueue.push({ msg, duration });
  if (!_toastShowing) _drainToastQueue();
}
function _drainToastQueue(){
  if (!_toastQueue.length) { _toastShowing = false; return; }
  _toastShowing = true;
  const { msg, duration } = _toastQueue.shift();
  let t = document.getElementById('_toast');
  if (!t) {
    t = document.createElement('div'); t.id = '_toast';
    t.style.cssText = 'position:fixed;top:calc(env(safe-area-inset-top, 0px) + 16px);left:50%;transform:translateX(-50%) translateY(-12px);background:var(--t0);color:var(--bg0);padding:12px 22px 14px;border-radius:18px;font-size:14px;font-weight:600;z-index:9999;max-width:calc(100% - 32px);text-align:center;box-shadow:0 12px 36px rgba(0,0,0,.28),0 2px 8px rgba(0,0,0,.16),inset 0 1px 0 rgba(255,255,255,.09);transition:opacity .36s cubic-bezier(.22,1,.36,1),transform .36s cubic-bezier(.22,1,.36,1);font-family:var(--ff);opacity:0;pointer-events:none;-webkit-backdrop-filter:blur(20px);backdrop-filter:blur(20px);overflow:hidden;';
    const bar = document.createElement('div'); bar.id = '_toastBar';
    bar.style.cssText = 'position:absolute;left:0;bottom:0;height:2px;width:100%;background:rgba(255,255,255,.18);transform-origin:left center;transform:scaleX(1);transition:transform linear;';
    t.appendChild(bar);
    document.body.appendChild(t);
  }
  // Set message via a text node to keep the progress bar element intact
  let label = t.querySelector('._lbl');
  if (!label) { label = document.createElement('span'); label.className = '_lbl'; t.insertBefore(label, t.firstChild); }
  label.textContent = msg;
  const bar = t.querySelector('#_toastBar');
  // Reset transition state
  t.style.opacity = '0';
  t.style.transform = 'translateX(-50%) translateY(-12px)';
  if (bar) { bar.style.transition = 'none'; bar.style.transform = 'scaleX(1)'; }
  requestAnimationFrame(() => {
    t.style.opacity = '1';
    t.style.transform = 'translateX(-50%) translateY(0)';
    // Animate progress bar collapsing left over `duration`
    if (bar) requestAnimationFrame(() => {
      bar.style.transition = 'transform ' + duration + 'ms linear';
      bar.style.transform = 'scaleX(0)';
    });
  });
  clearTimeout(t._t);
  t._t = setTimeout(() => {
    t.style.opacity = '0';
    t.style.transform = 'translateX(-50%) translateY(-10px)';
    setTimeout(() => _drainToastQueue(), 280);
  }, duration);
}

// "Reset all data" must leave nothing behind. The previous version kept
// favourites, the streak-freeze ledger, the chat-memory flag, cached AI
// analyses and the model choice (it cleared a non-existent `mdl` key instead
// of `model`), so a "fresh start" was not actually fresh.
// Interface preferences the user picked deliberately — language, theme,
// sound/haptics, fullscreen — are intentionally preserved.
const RESET_KEEP_KEYS = ['lang','theme','sfx_enabled','hfx_enabled','fullscreen_enabled','install_dismissed_at','_etag'];
function clrAll(){
  showConfirm('🗑️',t('confirm_reset_title'),t('confirm_reset_body'),t('confirm_reset_btn'),()=>{
    SFX.play('reset_confirm'); HFX.heavy();
    const doomed=[];
    for(let i=0;i<localStorage.length;i++){
      const k=localStorage.key(i);
      if(k && RESET_KEEP_KEYS.indexOf(k)===-1) doomed.push(k);
    }
    doomed.forEach(k=>{ try{ localStorage.removeItem(k); }catch(e){} Ginvalidate(k); });
    // Drop every stored food photo as well.
    try { IMG.keys().then(ks=>ks.forEach(k=>IMG.del(k))); } catch(e) {}
    log=[];wts=[];U=null;key='';
    try { S('api_keys','[]'); } catch(e) {}
    try { aiConvo.length=0; } catch(e) {}
    try { selDay=null; } catch(e) {}
    try { _clearNotifTimers(); } catch(e) {}
    try { document.getElementById('aimsg').innerHTML=''; } catch(e) {}
    document.getElementById('nav').style.display='none';
    resetScrollLock();
    // Brief delay for animation
    setTimeout(()=>ss('ob'),150);
  });
}

function toggleTheme(){
  const dark=document.documentElement.getAttribute('data-theme')==='dark';
  const next=dark?'light':'dark';
  document.documentElement.setAttribute('data-theme',next);
  S('theme',next);
  document.getElementById('themeToggle')?.classList.toggle('on',next==='dark');
  // Обновляем meta theme-color (Android URL bar / iOS PWA status)
  const tcm=document.getElementById('tc-meta');
  if(tcm) tcm.setAttribute('content', next==='dark' ? '#0F0E0C' : '#F2F0EB');
  // Возвращающий рендер UI с новой темой
  try { rH && rH(); rSet && rSet(); } catch(e){}
}

function toggleSfx(){
  const newVal=!SFX.isEnabled();
  SFX.setEnabled(newVal);
  const tog=document.getElementById('sfxToggle');
  if(tog)tog.classList.toggle('on',newVal);
}

// Water tracking master toggle — OFF by default (opt-in). Flips visibility of
// the Home mini-widget + Progress card, and gates whether the AI assistant
// is allowed to mention water anywhere in its responses.
function toggleWaterTracking(){
  const newVal=!isWaterOn();
  S('water_enabled', newVal?'1':'0');
  const tog=document.getElementById('waterTrackingToggle');
  if(tog)tog.classList.toggle('on',newVal);
  showToast(newVal ? t('toast_water_on') : t('toast_water_off'));
  try { rH && rH(); } catch(e){}
  try { if(document.getElementById('prog')?.classList.contains('active')) rWater(); } catch(e){}
}

// AI chat memory toggle — opt-in, OFF by default. Turning it ON costs more
// tokens per message (prior turns get resent every time), so we warn before
// enabling. Turning it OFF needs no confirmation.
function toggleChatMemory(){
  if(isChatMemoryOn()){
    S('chat_memory_enabled','0');
    const tog=document.getElementById('chatMemoryToggle');
    if(tog)tog.classList.remove('on');
    showToast(t('toast_chat_memory_off'));
    return;
  }
  showConfirm('🧠',t('confirm_chat_memory_title'),
    t('confirm_chat_memory_body'),
    t('confirm_chat_memory_btn'),
    ()=>{
      S('chat_memory_enabled','1');
      const tog=document.getElementById('chatMemoryToggle');
      if(tog)tog.classList.add('on');
      showToast(t('toast_chat_memory_on'));
    });
}

function showErr(id,msg){const e=document.getElementById(id);if(!e)return;e.textContent='⚠️ '+(msg||t('err_unknown'));e.classList.add('on');}

// Тема применена в <head>; здесь только следим за системными изменениями темы (если юзер не выбрал явно)
try {
  const _mq = window.matchMedia('(prefers-color-scheme: dark)');
  if (_mq && _mq.addEventListener) {
    _mq.addEventListener('change', e => {
      // Только если у пользователя нет явного выбора темы
      if (!localStorage.getItem('theme')) {
        const next = e.matches ? 'dark' : 'light';
        document.documentElement.setAttribute('data-theme', next);
        const tcm = document.getElementById('tc-meta');
        if (tcm) tcm.setAttribute('content', next === 'dark' ? '#0F0E0C' : '#F2F0EB');
      }
    });
  }
} catch (e) {}
