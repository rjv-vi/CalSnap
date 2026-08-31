// ══════════════════════════════════════════════════════════════════
// GEMINI API KEY POOL
// ══════════════════════════════════════════════════════════════════
// A single free-tier key runs into per-minute (RPM) and per-day (RPD) limits
// quickly once photo analysis is used regularly. Instead of one key, the app
// keeps a pool: every request walks the pool round-robin, a key that answers
// 429 is put on a growing cooldown and skipped, and a key that answers
// 400/401/403 is marked invalid until the user revives it.
//
// Pool entry: { k, added, strikes, cooldownUntil, invalid, lastErr, uses }
//
// `key` (declared in state.js) is kept in sync with the currently preferred
// key so all the existing `if(!key)` guards keep working unchanged.

const KEY_POOL_MAX = 10;
// Escalating cooldown: a 429 is usually the per-minute limit, but repeated
// 429s on the same key mean the daily quota is gone, so back off harder.
const KEY_COOLDOWNS = [60e3, 5 * 60e3, 30 * 60e3, 6 * 3600e3];
// Strikes decay, so a key that hit its per-minute cap an hour ago starts fresh.
const KEY_STRIKE_DECAY = 60 * 60e3;

function _mkKeyEntry(k){
  return { k: String(k).trim(), added: Date.now(), strikes: 0, cooldownUntil: 0, invalid: false, lastErr: '', uses: 0 };
}

function getKeyPool(){
  try {
    const a = JSON.parse(G('api_keys', '[]'));
    return Array.isArray(a) ? a.filter(e => e && typeof e.k === 'string' && e.k) : [];
  } catch(e) { return []; }
}

function saveKeyPool(pool){
  const ok = S('api_keys', JSON.stringify(pool.slice(0, KEY_POOL_MAX)));
  syncActiveKey();
  return ok;
}

// Older builds stored a single key under `key`. Fold it into the pool once.
function migrateLegacyApiKey(){
  const legacy = G('key', '').trim();
  if (!legacy) return;
  const pool = getKeyPool();
  if (!pool.some(e => e.k === legacy)) {
    pool.unshift(_mkKeyEntry(legacy));
    S('api_keys', JSON.stringify(pool.slice(0, KEY_POOL_MAX)));
  }
}

function _decayStrikes(e, now){
  if (e.strikes > 0 && e.cooldownUntil && now - e.cooldownUntil > KEY_STRIKE_DECAY) {
    e.strikes = 0;
    e.cooldownUntil = 0;
  }
}

// Is this entry ready to be used right now?
function keyIsUsable(e, now){
  now = now || Date.now();
  if (!e || !e.k || e.invalid) return false;
  return !(e.cooldownUntil > now);
}

function keyCooldownLeft(e){
  const ms = (e?.cooldownUntil || 0) - Date.now();
  return ms > 0 ? ms : 0;
}

function hasApiKey(){ return getKeyPool().length > 0; }
function hasUsableApiKey(){ const now = Date.now(); return getKeyPool().some(e => keyIsUsable(e, now)); }

// Keys to try, in round-robin order starting after the last one used, so load
// is spread across the pool instead of always hammering the first key.
function usableKeys(){
  const now = Date.now();
  const pool = getKeyPool();
  pool.forEach(e => _decayStrikes(e, now));
  const usable = pool.filter(e => keyIsUsable(e, now));
  if (usable.length < 2) return usable.map(e => e.k);
  let cursor = parseInt(G('api_key_cursor', '0'), 10) || 0;
  cursor = ((cursor % usable.length) + usable.length) % usable.length;
  return usable.slice(cursor).concat(usable.slice(0, cursor)).map(e => e.k);
}

// Mirror the preferred key into the legacy `key` global.
function syncActiveKey(){
  const usable = usableKeys();
  const pool = getKeyPool();
  try { key = usable[0] || (pool[0]?.k || ''); } catch(e) {}
  return key;
}

function _updateKey(k, fn){
  const pool = getKeyPool();
  const e = pool.find(x => x.k === k);
  if (!e) return;
  fn(e);
  saveKeyPool(pool);
}

function markKeyQuota(k, msg){
  _updateKey(k, e => {
    e.strikes = Math.min((e.strikes || 0) + 1, KEY_COOLDOWNS.length);
    e.cooldownUntil = Date.now() + KEY_COOLDOWNS[e.strikes - 1];
    e.lastErr = msg || 'quota';
  });
}
function markKeyInvalid(k, msg){
  _updateKey(k, e => { e.invalid = true; e.lastErr = msg || 'invalid'; });
}
function markKeyOk(k){
  const pool = getKeyPool();
  const e = pool.find(x => x.k === k);
  if (!e) return;
  const changed = e.strikes || e.cooldownUntil || e.invalid;
  e.strikes = 0; e.cooldownUntil = 0; e.invalid = false; e.lastErr = '';
  e.uses = (e.uses || 0) + 1;
  // Advance the round-robin cursor past the key that just served a request.
  const usable = pool.filter(x => keyIsUsable(x, Date.now()));
  const idx = usable.findIndex(x => x.k === e.k);
  if (usable.length > 1 && idx >= 0) S('api_key_cursor', String((idx + 1) % usable.length));
  saveKeyPool(pool);
}

// ── Mutations from the UI ─────────────────────────────────────────
function addApiKey(raw){
  const v = String(raw || '').trim();
  if (!v) return { ok: false, reason: 'empty' };
  // Gemini keys are `AIza` + 35 URL-safe chars, but don't hard-fail on a
  // format the user pasted correctly and Google later changed.
  if (v.length < 20 || /\s/.test(v)) return { ok: false, reason: 'malformed' };
  const pool = getKeyPool();
  if (pool.some(e => e.k === v)) return { ok: false, reason: 'duplicate' };
  if (pool.length >= KEY_POOL_MAX) return { ok: false, reason: 'full' };
  pool.push(_mkKeyEntry(v));
  saveKeyPool(pool);
  return { ok: true, count: pool.length };
}
function removeApiKey(k){
  const pool = getKeyPool().filter(e => e.k !== k);
  saveKeyPool(pool);
  S('api_key_cursor', '0');
  return pool.length;
}
function reviveApiKey(k){
  _updateKey(k, e => { e.invalid = false; e.strikes = 0; e.cooldownUntil = 0; e.lastErr = ''; });
}

// `AIzaSy…abcd` — enough to recognise a key without exposing it.
function maskKey(k){
  const s = String(k || '');
  if (s.length <= 12) return s.slice(0, 4) + '…';
  return s.slice(0, 6) + '…' + s.slice(-4);
}

function keyStatus(e){
  if (!e) return { cls: 'off', label: '' };
  if (e.invalid) return { cls: 'bad', label: t('key_state_invalid') };
  const left = keyCooldownLeft(e);
  if (left > 0) return { cls: 'wait', label: tf('key_state_cooldown', { time: fmtDuration(left) }) };
  return { cls: 'ok', label: t('key_state_ready') };
}

// Compact duration, e.g. "2 min".
function fmtDuration(ms){
  const s = Math.max(1, Math.round(ms / 1000));
  if (s < 60) return tf('dur_sec', { n: s });
  const m = Math.round(s / 60);
  if (m < 60) return tf('dur_min', { n: m });
  const h = Math.round(m / 60);
  return tf('dur_hour', { n: h });
}
