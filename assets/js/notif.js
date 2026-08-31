// ══════════════════════════════════════════════════
// NOTIFICATIONS — Configurable reminders
// ══════════════════════════════════════════════════
// Resolved at fire time so a language switch takes effect immediately
// (the old object was a hard-coded Russian literal built once at load).
function notifMsgs(){
  return {
    breakfast: [{title:t('notif_bf_title'), body:t('notif_bf_body')}],
    lunch:     [{title:t('notif_ln_title'), body:t('notif_ln_body')}],
    dinner:    [{title:t('notif_dn_title'), body:t('notif_dn_body')}],
    water:     [{title:t('notif_wt_title'), body:t('notif_wt_body')}],
  };
}

function openNotifSettings() {
  HFX.light(); SFX.play('sheet_open');
  lockScroll(true);
  // Load saved settings
  const cfg = _getNotifCfg();
  document.getElementById('notifBreakfast').value = cfg.breakfast || '08:30';
  document.getElementById('notifLunch').value = cfg.lunch || '13:00';
  document.getElementById('notifDinner').value = cfg.dinner || '19:00';
  document.getElementById('notifWaterInterval').value = cfg.waterInterval || '2';
  ['breakfast','lunch','dinner','water'].forEach(k => {
    const tog = document.getElementById('notif'+k.charAt(0).toUpperCase()+k.slice(1)+'Tog');
    if(tog) tog.classList.toggle('on', cfg[k+'_on'] !== false);
  });
  // Master toggle
  const masterOn = G('notif_enabled')==='1' && window.Notification?.permission==='granted';
  _updateNotifMasterUI(masterOn);
  // Show hint if not installed as standalone PWA
  const _isStandalone = isInstalledApp();
  const _pwaHint = document.getElementById('notifPwaHint');
  if(_pwaHint) _pwaHint.style.display = _isStandalone ? 'none' : 'block';
  const _pwaOk = document.getElementById('notifPwaOk');
  if(_pwaOk) _pwaOk.style.display = _isStandalone ? 'block' : 'none';
  document.getElementById('notifOv').classList.add('on');
}

function closeNotifSettings() {
  HFX.light(); SFX.play('sheet_close');
  document.getElementById('notifOv').classList.remove('on');
  lockScroll(false);
}

function _getNotifCfg() {
  try { return JSON.parse(G('notif_cfg','{}')) || {}; } catch(e) { return {}; }
}

function _updateNotifMasterUI(on) {
  const tog = document.getElementById('notifMasterToggle');
  const sub = document.getElementById('notifMasterSub');
  const rows = document.getElementById('notifRows');
  if(tog) tog.classList.toggle('on', on);
  if(sub) sub.textContent = on ? t('notif_master_active') : (window.Notification?.permission==='denied' ? t('notif_master_blocked') : t('notif_master_sub'));
  if(rows) { rows.style.opacity = on ? '1' : '.5'; rows.style.pointerEvents = on ? '' : 'none'; }
}

async function toggleNotifMaster() {
  if(!('Notification' in window)) {
    showConfirm('⚠️',t('notif_no_support_title'),t('notif_no_support_body'),null,t('btn_understood'));
    return;
  }
  if(Notification.permission==='denied') {
    showConfirm('🔕',t('notif_blocked_title'),t('notif_blocked_body'),null,t('btn_understood'));
    return;
  }
  if(Notification.permission !== 'granted') {
    HFX.medium();
    const perm = await Notification.requestPermission();
    if(perm !== 'granted') { HFX.error(); _updateNotifMasterUI(false); _updateNotifStatus(false); return; }
  }
  const newOn = !(G('notif_enabled')==='1');
  S('notif_enabled', newOn ? '1' : '0');
  _updateNotifMasterUI(newOn);
  _updateNotifStatus(newOn);
  if(newOn) {
    HFX.success(); SFX.play('save');
    _scheduleNotifs();
    _registerPeriodicSync();
    setTimeout(()=>{
      const opts={body:t('notif_test_body'),icon:'icons/icon-192.png',badge:'icons/icon-72.png'};
      if('serviceWorker' in navigator && navigator.serviceWorker.controller){
        navigator.serviceWorker.ready.then(r=>r.showNotification('🍎 CalSnap',opts)).catch(()=>new Notification('🍎 CalSnap',opts));
      } else { try{new Notification('🍎 CalSnap',opts);}catch(e){} }
    },300);
    // Check if installed as PWA for background notifs
    const _isPWA=isInstalledApp();
    if(!_isPWA) showToast(t('toast_install_for_notifs_short'));
  } else {
    HFX.light();
    _clearNotifTimers();
  }
}

function toggleNotifRow(key) {
  const cfg = _getNotifCfg();
  const k = key+'_on';
  cfg[k] = cfg[k] === false ? true : false; // default on
  S('notif_cfg', JSON.stringify(cfg));
  const capKey = key.charAt(0).toUpperCase()+key.slice(1);
  const tog = document.getElementById('notif'+capKey+'Tog');
  if(tog) tog.classList.toggle('on', cfg[k] !== false);
  HFX.light(); SFX.play('toggle');
}

function saveNotifSettings() {
  HFX.success(); SFX.play('notif_save');
  const cfg = _getNotifCfg();
  cfg.breakfast = document.getElementById('notifBreakfast').value;
  cfg.lunch = document.getElementById('notifLunch').value;
  cfg.dinner = document.getElementById('notifDinner').value;
  cfg.waterInterval = document.getElementById('notifWaterInterval').value;
  S('notif_cfg', JSON.stringify(cfg));
  if(G('notif_enabled')==='1' && window.Notification?.permission==='granted') {
    _clearNotifTimers();
    _scheduleNotifs();
  } else {
    // Still sync disabled state to SW so it stops showing notifs
    _syncScheduleToSW(cfg);
  }
  closeNotifSettings();
  _updateNotifStatus(G('notif_enabled')==='1');
}

function _clearNotifTimers() {
  if(!Array.isArray(_notifTimers)) { _notifTimers = []; return; }
  // The water reminder schedules a setInterval; clear both kinds explicitly
  // rather than relying on the two id spaces overlapping.
  _notifTimers.forEach(id => { clearTimeout(id); clearInterval(id); });
  _notifTimers = [];
}

function _sendNotif(type) {
  if(window.Notification?.permission !== 'granted') return;
  const msgs = notifMsgs()[type] || [];
  const m = msgs[Math.floor(Math.random()*msgs.length)];
  if(!m) return;
  const opts = {body:m.body, icon:'icons/icon-192.png', badge:'icons/icon-72.png', vibrate:[100,50,100]};
  // Use the SW's showNotification — it works even when the tab is backgrounded
  if('serviceWorker' in navigator && navigator.serviceWorker.controller) {
    navigator.serviceWorker.ready.then(reg => {
      reg.showNotification(m.title, opts);
    }).catch(()=>{ try{new Notification(m.title,opts);}catch(e){} });
  } else {
    try { new Notification(m.title, opts); } catch(e) {}
  }
  SFX.play('notif_ring'); HFX.medium();
}

function _scheduleNotifs() {
  try {
    _clearNotifTimers();
    if(G('notif_enabled') !== '1') return;
    const cfg = _getNotifCfg();
    const now = new Date();
    const nowMin = now.getHours()*60 + now.getMinutes();

    // ── Push schedule to Service Worker for background notifications ──
    _syncScheduleToSW(cfg);

    // ── Register Periodic Background Sync (Android Chrome) ──
    _registerPeriodicSync();

    // ── In-app timers (work while app is open / in background tab) ──
    const schedule = (timeStr, type) => {
      if(!timeStr) return;
      const [hh,mm] = timeStr.split(':').map(Number);
      const targetMin = hh*60+mm;
      let diff = targetMin - nowMin;
      if(diff <= 2) diff += 24*60;
      const id = setTimeout(()=>{ _sendNotif(type); _syncScheduleToSW(cfg); }, diff*60*1000);
      _notifTimers.push(id);
    };

    if(cfg.breakfast_on !== false) schedule(cfg.breakfast||'08:30', 'breakfast');
    if(cfg.lunch_on !== false)     schedule(cfg.lunch||'13:00',     'lunch');
    if(cfg.dinner_on !== false)    schedule(cfg.dinner||'19:00',    'dinner');

    const waterH = parseInt(cfg.waterInterval||'2');
    if(cfg.water_on !== false && waterH > 0) {
      const waterIntervalMs = waterH * 3600 * 1000;
      // Align water reminders to multi-hour boundaries from midnight (e.g. 0/2/4/...)
      // for waterH=2. The previous formula only looked at minutes+seconds within
      // the current hour, which produced the wrong delay for intervals > 1h.
      const totalDayMs = (now.getHours()*3600 + now.getMinutes()*60 + now.getSeconds()) * 1000;
      const firstWater = waterIntervalMs - (totalDayMs % waterIntervalMs);
      const scheduleWater = (delay) => {
        const id = setTimeout(() => {
          _sendNotif('water');
          const id2 = setInterval(() => _sendNotif('water'), waterIntervalMs);
          _notifTimers.push(id2);
        }, delay);
        _notifTimers.push(id);
      };
      scheduleWater(firstWater);
    }
  } catch(e) { console.warn('_scheduleNotifs error:', e); }
}

// Push notification schedule to SW cache so it can fire when app is closed
function _syncScheduleToSW(cfg) {
  if(!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.ready.then(reg => {
    if(reg.active) {
      reg.active.postMessage({
        type: 'SAVE_NOTIF_SCHEDULE',
        schedule: {
          enabled: G('notif_enabled') === '1',
          // Without this the SW fell back to 'ru' unconditionally, so
          // background reminders stayed Russian after switching to English.
          lang: LANG,
          breakfast: cfg.breakfast || '08:30',
          breakfast_on: cfg.breakfast_on !== false,
          lunch: cfg.lunch || '13:00',
          lunch_on: cfg.lunch_on !== false,
          dinner: cfg.dinner || '19:00',
          dinner_on: cfg.dinner_on !== false,
          water_on: cfg.water_on !== false,
          waterInterval: cfg.waterInterval || '2',
        }
      });
    }
  }).catch(()=>{});
}

// Register Periodic Background Sync — fires SW even when app is closed (Chrome Android)
async function _registerPeriodicSync() {
  try {
    if(!('periodicSync' in navigator)) return;
    const status = await navigator.permissions.query({ name: 'periodic-background-sync' });
    if(status.state === 'granted') {
      const reg = await navigator.serviceWorker.ready;
      await reg.periodicSync.register('calsnap-notifs', { minInterval: 15 * 60 * 1000 }); // every 15 min
    }
  } catch(e) {}
}

function _updateNotifStatus(on) {
  const st = document.getElementById('notifStatus');
  const arr = document.getElementById('notifArr');
  if(on){
    if(st) st.innerHTML='<span class="notif-dot"></span>'+esc(t('notif_status_on'));
    if(arr) { arr.textContent='✓'; arr.style.color='var(--ok)'; }
  } else {
    if(st) st.textContent=t('set_reminders_sub');
    if(arr) { arr.textContent='›'; arr.style.color=''; }
  }
}

