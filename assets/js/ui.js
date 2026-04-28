function openApi(){if(key)document.getElementById('apiinp').value=key;document.getElementById('apiOv').classList.add('on');document.body.style.overflow='hidden';}
function closeApi(){document.getElementById('apiOv').classList.remove('on');document.body.style.overflow='';}
function saveApi(){const v=document.getElementById('apiinp').value.trim();if(!v)return;key=v;S('key',v);closeApi();document.getElementById('abar').style.display='none';rSet();fetchGeminiModels();}

// Settings
function rSet(){
  if(!U)return;
  document.getElementById('sname').textContent=U.name||'—';
  if(U.dob){const _a=calcAgeFromDob(U.dob);if(_a&&_a!==U.age){U.age=_a;rcalc();S('u',JSON.stringify(U));}}
  document.getElementById('sgoal').textContent=GL[U.goal]||'—';
  document.getElementById('skcal').textContent=(U.kcal||0)+' '+t('unit_kcal');
  const _sp=document.getElementById('sprefs');if(_sp){const _pc=(U.prefs||[]).length,_ac=U.allerg?1:0;_sp.textContent=(_pc+_ac)>0?(_pc?U.prefs.join(', '):'')+(_ac?(_pc?' · ':'')+U.allerg:''):t('not_set');}
  document.getElementById('sapi').textContent=key?t('set_api_set'):t('set_api_unset');
  const _mname=ALL_MODELS.find(m=>m.id===selModel)?.name||selModel;
  document.getElementById('smodel').textContent=_mname;
  const dark=document.documentElement.getAttribute('data-theme')==='dark';
  const tog=document.getElementById('themeToggle');if(tog)tog.classList.toggle('on',dark);
  const sfxTog=document.getElementById('sfxToggle');if(sfxTog)sfxTog.classList.toggle('on',SFX.isEnabled());
  const hfxTog=document.getElementById('hfxToggle');if(hfxTog)hfxTog.classList.toggle('on',HFX.isOn());
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
      <div class="dob-age-hint" id="ed_dob_hint" style="margin-bottom:14px">${curAge?tf('age_label',{age:curAge}):''}</div>
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
  document.body.style.overflow='hidden';
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
function closeEd(){document.getElementById('edOv').classList.remove('on');document.body.style.overflow='';}
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
  hint.textContent=age&&age>0?tf('age_label',{age:age}):t('check_date');
}
function rcalc(){
  let bmr=U.gen==='m'?10*U.w+6.25*U.h-5*U.age+5:10*U.w+6.25*U.h-5*U.age-161;
  let k=Math.round(bmr*(U.act||1.375));
  if(U.goal==='lose')k-=500;if(U.goal==='gain')k+=300;
  U.kcal=Math.max(1200,k);U.pr=Math.round(U.w*1.8);U.ft=Math.round(U.kcal*.25/9);U.cb=Math.round((U.kcal-U.pr*4-U.ft*9)/4);
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
        (item.food||'').replace(/,/g,' '),
        (item.portion||'').replace(/,/g,' '),
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
    const csv = rows.map(r => r.join(',')).join('\n');
    const bom = '\uFEFF'; // UTF-8 BOM for Excel
    const blob = new Blob([bom + csv], {type:'text/csv;charset=utf-8;'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const date = new Date().toISOString().split('T')[0];
    a.href = url; a.download = `calsnap-${date}.csv`; a.click();
    URL.revokeObjectURL(url);
    SFX.play('export_done'); HFX.success();
  } catch(e) { showToast(t('toast_export_error')); }
}

function exportJSON(){
  try{
    const data={
      version:1,
      exported:new Date().toISOString(),
      user:G('u','null'),
      log:G('log','[]'),
      wts:G('wts','[]'),
      key:G('key',''),
      model:G('model',''),
      theme:G('theme',''),
      cal:G('cal',''),
      hfx:G('hfx_enabled','1'),
      sfx:G('sfx_enabled','1'),
      notif:G('notif_enabled','0'),
      notifCfg:G('notif_cfg',''),
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
    URL.revokeObjectURL(url);
    HFX.success();SFX.play('export_done');
    showToast('✅ Данные экспортированы');
  }catch(e){showToast(tf('toast_export_error_msg',{msg:e.message}));}
}

function importJSON(input){
  const file=input.files[0];
  if(!file)return;
  const reader=new FileReader();
  reader.onload=function(e){
    try{
      const data=JSON.parse(e.target.result);
      if(!data.version||!data.log)throw new Error('Неверный формат файла');
      showConfirm('📥','Импорт данных?','Текущие данные будут заменены данными из файла от '+new Date(data.exported).toLocaleDateString('ru'),'Импортировать',()=>{
        if(data.user&&data.user!=='null')S('u',data.user);
        if(data.log)S('log',data.log);
        if(data.wts)S('wts',data.wts);
        if(data.key)S('key',data.key);
        if(data.model)S('model',data.model);
        if(data.theme)S('theme',data.theme);
        if(data.cal)S('cal',data.cal);
        if(data.hfx)S('hfx_enabled',data.hfx);
        if(data.sfx)S('sfx_enabled',data.sfx);
        if(data.notif)S('notif_enabled',data.notif);
        if(data.notifCfg)S('notif_cfg',data.notifCfg);
        HFX.success(); SFX.play('import_done');
        if(data.water){Object.entries(data.water).forEach(([k,v])=>localStorage.setItem(k,v));}
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
    t.style.cssText = 'position:fixed;bottom:calc(var(--nav-h)+20px);left:50%;transform:translateX(-50%) translateY(8px);background:var(--t0);color:var(--bg0);padding:11px 20px;border-radius:28px;font-size:14px;font-weight:600;z-index:9999;max-width:calc(100% - 32px);text-align:center;box-shadow:0 8px 32px rgba(0,0,0,.22),0 2px 8px rgba(0,0,0,.14),inset 0 1px 0 rgba(255,255,255,.09);transition:opacity .32s cubic-bezier(.22,1,.36,1),transform .32s cubic-bezier(.22,1,.36,1);font-family:var(--ff);opacity:0;pointer-events:none;-webkit-backdrop-filter:blur(16px);backdrop-filter:blur(16px);';
    document.body.appendChild(t);
  }
  t.textContent = msg;
  // Reset transition state
  t.style.opacity = '0';
  t.style.transform = 'translateX(-50%) translateY(8px)';
  requestAnimationFrame(() => {
    t.style.opacity = '1';
    t.style.transform = 'translateX(-50%) translateY(0)';
  });
  clearTimeout(t._t);
  t._t = setTimeout(() => {
    t.style.opacity = '0';
    t.style.transform = 'translateX(-50%) translateY(6px)';
    setTimeout(() => _drainToastQueue(), 240);
  }, duration);
}

function clrAll(){
  showConfirm('🗑️','Сбросить всё?','Все данные будут удалены безвозвратно: журнал еды, вес, профиль и настройки.','Удалить всё',()=>{
    SFX.play('reset_confirm'); HFX.heavy();
    log=[];S('log','[]');wts=[];S('wts','[]');S('u','null');U=null;S('key','');key='';S('mdl','');
    // Clear water data for all dates
    const keysToRemove=[];for(let i=0;i<localStorage.length;i++){const k=localStorage.key(i);if(k&&(k.startsWith('water_')||k.startsWith('tip_')||k==='notif_cfg'||k==='notif_enabled'))keysToRemove.push(k);}
    keysToRemove.forEach(k=>localStorage.removeItem(k));
    document.getElementById('nav').style.display='none';
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

function showErr(id,msg){const e=document.getElementById(id);e.textContent='⚠️ '+(msg||'Неизвестная ошибка');e.classList.add('on');}

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

