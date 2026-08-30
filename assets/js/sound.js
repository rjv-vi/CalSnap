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

  // ── Synthesised fallback ─────────────────────────────────────────
  // Twelve of the sound names the UI plays have no file in ./sounds/
  // (sheet_close, ob_next, welcome, streak_up, goal_reached, …), so those
  // interactions were simply silent. Rather than ship more binaries — and to
  // keep the UI audible even when a file fails to load offline — every name
  // has a tiny Web Audio recipe. A real file, when present, always wins.
  //
  // Recipe: { seq:[[freq, dur, type?, freqTo?]], gain?, gap? }
  const SYNTH = {
    // UI
    btn_tap:      { seq: [[880, .045, 'sine']], gain: .5 },
    card_tap:     { seq: [[660, .05, 'sine']], gain: .5 },
    tab_switch:   { seq: [[720, .05, 'triangle', 900]], gain: .5 },
    toggle:       { seq: [[540, .05, 'square', 720]], gain: .28 },
    select:       { seq: [[780, .05, 'triangle', 980]], gain: .4 },
    back:         { seq: [[600, .06, 'sine', 420]], gain: .45 },
    sheet_open:   { seq: [[420, .10, 'sine', 660]], gain: .45 },
    sheet_close:  { seq: [[620, .10, 'sine', 380]], gain: .38 },
    copy:         { seq: [[1000, .05, 'sine'], [1330, .05, 'sine']], gain: .35, gap: .04 },
    // Onboarding
    welcome:      { seq: [[523, .12, 'sine'], [659, .12, 'sine'], [784, .22, 'sine']], gain: .5, gap: .09 },
    splash:       { seq: [[392, .14, 'sine', 523]], gain: .34 },
    ob_next:      { seq: [[659, .07, 'triangle', 880]], gain: .45 },
    onboard_skip: { seq: [[520, .06, 'sine', 400]], gain: .3 },
    ob_finish:    { seq: [[659, .10, 'sine'], [880, .10, 'sine'], [1175, .24, 'sine']], gain: .5, gap: .08 },
    // Data
    save:         { seq: [[784, .07, 'sine'], [1046, .12, 'sine']], gain: .45, gap: .05 },
    add_food:     { seq: [[698, .07, 'triangle'], [1046, .14, 'sine']], gain: .5, gap: .05 },
    delete:       { seq: [[420, .07, 'square', 240]], gain: .26 },
    scan_success: { seq: [[880, .07, 'sine'], [1318, .14, 'sine']], gain: .48 },
    photo_snap:   { seq: [[1600, .03, 'square'], [900, .05, 'sine']], gain: .22, gap: .02 },
    barcode_scan: { seq: [[1500, .035, 'square'], [1100, .05, 'square']], gain: .2, gap: .05 },
    export_done:  { seq: [[880, .06, 'sine'], [1175, .12, 'sine']], gain: .4, gap: .05 },
    import_done:  { seq: [[659, .07, 'sine'], [880, .07, 'sine'], [1175, .16, 'sine']], gain: .45, gap: .06 },
    reset_confirm:{ seq: [[440, .10, 'square', 220]], gain: .26 },
    // Feedback
    error:        { seq: [[320, .09, 'square'], [240, .16, 'square']], gain: .22, gap: .05 },
    ai_error:     { seq: [[360, .09, 'triangle'], [260, .15, 'triangle']], gain: .26, gap: .05 },
    ai_send:      { seq: [[760, .06, 'triangle', 1020]], gain: .38 },
    ai_reply:     { seq: [[1046, .07, 'sine'], [784, .11, 'sine']], gain: .4, gap: .04 },
    // Milestones
    streak_up:    { seq: [[659, .09, 'sine'], [988, .09, 'sine'], [1318, .20, 'sine']], gain: .5, gap: .07 },
    goal_reached: { seq: [[523, .09, 'sine'], [659, .09, 'sine'], [784, .09, 'sine'], [1046, .26, 'sine']], gain: .55, gap: .07 },
    water_goal:   { seq: [[784, .09, 'sine'], [1175, .18, 'sine']], gain: .5, gap: .06 },
    // Water / weight
    water_add:    { seq: [[520, .06, 'sine', 780]], gain: .42 },
    water_undo:   { seq: [[700, .06, 'sine', 480]], gain: .3 },
    weight_log:   { seq: [[587, .08, 'sine'], [880, .12, 'sine']], gain: .45, gap: .05 },
    // Pickers / notifications
    drum_tick:    { seq: [[1200, .018, 'square']], gain: .1 },
    drum_confirm: { seq: [[880, .06, 'sine'], [1175, .10, 'sine']], gain: .4, gap: .04 },
    notif_save:   { seq: [[784, .07, 'sine'], [1046, .12, 'sine']], gain: .45, gap: .05 },
    notif_ring:   { seq: [[1318, .09, 'sine'], [1046, .09, 'sine'], [1318, .22, 'sine']], gain: .5, gap: .07 },
    install:      { seq: [[523, .08, 'triangle'], [784, .08, 'triangle'], [1046, .20, 'sine']], gain: .5, gap: .06 },
  };

  let _ctx = null;
  function _audioCtx() {
    if (_ctx) return _ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    try { _ctx = new AC(); } catch(e) { return null; }
    return _ctx;
  }

  function _synth(name) {
    const recipe = SYNTH[name];
    if (!recipe) return false;
    const ctx = _audioCtx();
    if (!ctx) return false;
    try {
      if (ctx.state === 'suspended') ctx.resume();
      const master = (VOLUMES[name] ?? 0.5) * (recipe.gain ?? 0.45);
      let at = ctx.currentTime + 0.005;
      for (const [freq, dur, type, freqTo] of recipe.seq) {
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = type || 'sine';
        osc.frequency.setValueAtTime(freq, at);
        if (freqTo) osc.frequency.exponentialRampToValueAtTime(freqTo, at + dur);
        // Short attack, exponential release — no click, no lingering tail.
        g.gain.setValueAtTime(0.0001, at);
        g.gain.exponentialRampToValueAtTime(master, at + Math.min(0.012, dur * 0.3));
        g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
        osc.connect(g); g.connect(ctx.destination);
        osc.start(at);
        osc.stop(at + dur + 0.02);
        at += dur + (recipe.gap ?? 0.01);
      }
      return true;
    } catch(e) { return false; }
  }

  // Пул Audio объектов для каждого звука (2-4 штуки — для быстрых повторов)
  const _pool = {};
  const _poolIdx = {};
  // Names whose file is absent / unplayable — they go straight to the synth.
  const _missing = Object.create(null);

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
      // A 404 (or an unsupported file) fires `error`; remember it so every
      // later play goes to the synthesised version instead of silence.
      a.addEventListener('error', () => { _missing[name] = true; }, { once: true });
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
    try {
      const ctx = _audioCtx();
      if (!ctx) return;
      if (ctx.state === 'suspended') ctx.resume();
      const buf = ctx.createBuffer(1, 1, 22050);
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.connect(ctx.destination);
      src.start(0);
    } catch(e) {}
  }

  // Воспроизвести звук
  function play(name) {
    if (!_enabled) return;
    if (_missing[name]) { _synth(name); return; }
    if (!_pool[name]) _createPool(name);
    // Берём следующий из пула (round-robin) — не прерываем предыдущий
    const pool = _pool[name];
    const idx = _poolIdx[name] % pool.length;
    _poolIdx[name] = (idx + 1) % pool.length;
    const a = pool[idx];
    if (a.error) { _missing[name] = true; _synth(name); return; }
    try {
      a.currentTime = 0;
      const p = a.play();
      if (p) p.catch(() => { _missing[name] = true; _synth(name); });
    } catch(e) { _missing[name] = true; _synth(name); }
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
