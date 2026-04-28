// ═══════════════════════════════════════════════════
// CALSNAP SOUND ENGINE
// ═══════════════════════════════════════════════════

// AI thinking loop sound
let _aiThinkTimer = null;
function _aiThinkStart(){
  _aiThinkStop();
  _aiThinkTimer = null; // ai_thinking sound removed
}
function _aiThinkStop(){
  if(_aiThinkTimer){ clearInterval(_aiThinkTimer); _aiThinkTimer=null; }
}
const SFX = (() => {
  // Громкость каждого звука (0.0 — 1.0)
  const VOLUMES = {
    welcome:      0.7,
    splash:       0.5,
    tab_switch:   0.4,
    sheet_open:   0.45,
    sheet_close:  0.35,
    drum_tick:    0.22,
    drum_confirm: 0.55,
    ob_next:      0.5,
    ob_finish:    0.75,
    add_food:     0.65,
    scan_success: 0.65,
    btn_tap:      0.3,
    toggle:       0.35,
    save:         0.55,
    error:        0.5,
    ai_send:      0.4,
    ai_reply:     0.45,

    // v1.5 new sounds
    select:       0.4,
    card_tap:     0.3,
    delete:       0.45,
    water_add:    0.5,
    water_undo:   0.35,
    weight_log:   0.55,
    back:         0.3,
    copy:         0.35,
    notif_save:   0.55,
    install:      0.65,
    streak_up:    0.65,
    goal_reached: 0.75,
    water_goal:   0.6,
    photo_snap:   0.4,
    ai_error:     0.45,
    barcode_scan: 0.5,
    onboard_skip: 0.3,
    export_done:  0.5,
    import_done:  0.6,
    reset_confirm:0.5,
    notif_ring:   0.65,
  };

  // Пул Audio объектов для каждого звука (3 штуки — для быстрых повторов)
  const _pool = {};
  const _poolIdx = {};

  // Звуки включены?
  let _enabled = localStorage.getItem('sfx_enabled') !== '0';
  let _unlocked = false;

  const NAMES = Object.keys(VOLUMES);

  // Создать пул Audio для одного звука
  function _createPool(name) {
    const vol = VOLUMES[name] ?? 0.5;
    const count = name === 'drum_tick' ? 4 : 2; // для тика больше копий
    _pool[name] = [];
    _poolIdx[name] = 0;
    for (let i = 0; i < count; i++) {
      const a = new Audio();
      a.preload = 'auto';
      a.volume = vol;
      // Пробуем mp3 — основной формат
      a.src = `sounds/${name}.mp3`;
      _pool[name].push(a);
    }
  }

  // Предзагрузка всех звуков
  function preload() {
    NAMES.forEach(n => { if (!_pool[n]) _createPool(n); });
  }

  // Разблокировка Audio на iOS — через AudioContext без звука
  function _unlock() {
    if (_unlocked) return;
    _unlocked = true;
    // Используем AudioContext для разблокировки — без воспроизведения реальных звуков
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const buf = ctx.createBuffer(1, 1, 22050);
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.connect(ctx.destination);
      src.start(0);
      setTimeout(() => ctx.close(), 500);
    } catch(e) {}
  }

  // Воспроизвести звук
  function play(name) {
    if (!_enabled) return;
    if (!_pool[name]) _createPool(name);
    // Берём следующий из пула (round-robin) — не прерываем предыдущий
    const pool = _pool[name];
    const idx = _poolIdx[name] % pool.length;
    _poolIdx[name] = (idx + 1) % pool.length;
    const a = pool[idx];
    try {
      a.currentTime = 0;
      const p = a.play();
      if (p) p.catch(() => {});
    } catch(e) {}
  }

  // Включить/выключить
  function setEnabled(v) {
    _enabled = v;
    localStorage.setItem('sfx_enabled', v ? '1' : '0');
  }
  function isEnabled() { return _enabled; }

  // Разблокировка при первом касании + предзагрузка
  function _onFirstTouch() {
    preload();
    _unlock();
  }
  document.addEventListener('touchstart', _onFirstTouch, { once: true });
  document.addEventListener('mousedown',  _onFirstTouch, { once: true });
  document.addEventListener('touchend',   _onFirstTouch, { once: true });

  return { play, setEnabled, isEnabled, preload };
})();
