// ══════════════════════════════════════════════════════════════════
// INSTALL STATE
// ══════════════════════════════════════════════════════════════════
// One place to answer "are we running as an installed app?". The manifest asks
// for `display: fullscreen`, so an installed instance reports
// `display-mode: fullscreen` — checking only `standalone` (as the notification
// hint did) told installed users to install the app they were already using.
const INSTALL_DISPLAY_MODES = ['fullscreen', 'standalone', 'minimal-ui', 'window-controls-overlay'];
function isInstalledApp(){
  try {
    if (window.navigator.standalone === true) return true;              // iOS
    for (const m of INSTALL_DISPLAY_MODES) {
      if (window.matchMedia(`(display-mode: ${m})`).matches) return true;
    }
    // Android TWA: the page is opened by the app shell, not by a browser tab.
    if (document.referrer.startsWith('android-app://')) return true;
  } catch(e) {}
  return false;
}

// ══════════════════════════════════════════════════════════════════
// IMAGE STORE + STORAGE SAFETY
// ══════════════════════════════════════════════════════════════════
// Why this file exists
// -------------------
// Food photos used to be persisted as full-size base64 data URLs inside the
// `log` array in localStorage. A 1024px JPEG is ~80–200 KB, which becomes
// ~110–270 KB once base64-encoded. At a few photos a day the 5 MB
// localStorage quota is exhausted after roughly a week — and because the old
// `S()` helper swallowed QuotaExceededError while still updating its
// in-memory cache, the UI kept showing the new entries until the next reload,
// at which point that whole day was gone. That is the "records from day 6–7
// disappeared after reopening the app" bug.
//
// Fix: photos live in IndexedDB (quota measured in hundreds of MB, not 5 MB),
// the log only keeps a short `imgId` reference, and every localStorage write
// goes through a quota-aware path that reclaims space and reports failure.

const IMG_DB = 'calsnap-img';
const IMG_STORE = 'img';
let _imgDbPromise = null;

function _openImgDb(){
  if (_imgDbPromise) return _imgDbPromise;
  _imgDbPromise = new Promise((resolve, reject) => {
    try {
      if (!('indexedDB' in window)) { reject(new Error('no-idb')); return; }
      const req = indexedDB.open(IMG_DB, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(IMG_STORE)) db.createObjectStore(IMG_STORE);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error || new Error('idb-open-failed'));
      req.onblocked = () => reject(new Error('idb-blocked'));
    } catch(e) { reject(e); }
  }).catch(err => { _imgDbPromise = null; throw err; });
  return _imgDbPromise;
}

// Run one request inside its own transaction and settle on *commit*, not on the
// request's success. Resolving early is how a queued photo could report "saved"
// and then vanish when the transaction aborted (quota, eviction) — leaving an
// `imgId` in localStorage pointing at nothing.
function _imgRun(mode, fn){
  return _openImgDb().then(db => new Promise((resolve, reject) => {
    let out;
    const tx = db.transaction(IMG_STORE, mode);
    const req = fn(tx.objectStore(IMG_STORE));
    if (req) req.onsuccess = () => { out = req.result; };
    tx.oncomplete = () => resolve(out);
    tx.onerror = () => reject(tx.error || new Error('idb-tx-failed'));
    tx.onabort = () => reject(tx.error || new Error('idb-tx-aborted'));
  }));
}

const IMG = {
  // Resolves to true when IndexedDB is usable in this context.
  async available(){
    try { await _openImgDb(); return true; } catch(e) { return false; }
  },
  async put(id, dataUrl){
    await _imgRun('readwrite', st => st.put(dataUrl, id));
    return id;
  },
  async get(id){
    if (!id) return null;
    try { return (await _imgRun('readonly', st => st.get(id))) || null; }
    catch(e) { return null; }
  },
  async del(id){
    if (!id) return;
    try { await _imgRun('readwrite', st => st.delete(id)); } catch(e) {}
  },
  async keys(){
    try { return (await _imgRun('readonly', st => st.getAllKeys())) || []; }
    catch(e) { return []; }
  },
  // Wipe everything — used by "delete all data".
  async clear(){
    try { await _imgRun('readwrite', st => st.clear()); return true; }
    catch(e) { return false; }
  },
};

let _imgSeq = 0;
function newImgId(){
  _imgSeq = (_imgSeq + 1) % 100000;
  return 'i' + Date.now().toString(36) + '-' + _imgSeq.toString(36) +
         '-' + Math.random().toString(36).slice(2, 8);
}

// Re-encode a data URL down to `maxPx` on the long edge at `quality`.
// Used for the *stored* thumbnail; the copy sent to Gemini stays larger.
function shrinkDataUrl(dataUrl, maxPx, quality){
  maxPx = maxPx || 480;
  quality = quality == null ? 0.72 : quality;
  return new Promise((resolve) => {
    // Decoding is the one step here that can stall indefinitely (a truncated
    // JPEG never fires load *or* error in some engines). Time it out so the
    // caller — saving a meal, draining the offline queue — can never hang.
    let settled = false;
    const done = (v) => { if (!settled) { settled = true; resolve(v); } };
    const bail = setTimeout(() => done(dataUrl), 8000);
    const finish = (v) => { clearTimeout(bail); done(v); };
    try {
      const img = new Image();
      img.onload = () => {
        try {
          let w = img.naturalWidth || maxPx, h = img.naturalHeight || maxPx;
          if (w > maxPx || h > maxPx) {
            if (w >= h) { h = Math.round(h * maxPx / w); w = maxPx; }
            else { w = Math.round(w * maxPx / h); h = maxPx; }
          }
          const cv = document.createElement('canvas');
          cv.width = w; cv.height = h;
          cv.getContext('2d').drawImage(img, 0, 0, w, h);
          finish(cv.toDataURL('image/jpeg', quality));
        } catch(e) { finish(dataUrl); }
      };
      img.onerror = () => finish(dataUrl);
      img.src = dataUrl;
    } catch(e) { finish(dataUrl); }
  });
}

// Store a photo and return the reference to persist on the log entry.
// Falls back to an inline (but already small) data URL when IndexedDB is
// unavailable — e.g. private-mode WebViews.
async function storeFoodImage(dataUrl){
  if (!dataUrl) return {};
  const thumb = await shrinkDataUrl(dataUrl, 480, 0.72);
  try {
    const id = newImgId();
    await IMG.put(id, thumb);
    return { imgId: id };
  } catch(e) {
    return { img: thumb };
  }
}

// ── Async image hydration ────────────────────────────────────────
// Lists are rendered as HTML strings, so images referenced by id are
// filled in right after the markup lands in the DOM.
function hydrateImages(root){
  const scope = root || document;
  scope.querySelectorAll('[data-img-id]').forEach(el => {
    const id = el.getAttribute('data-img-id');
    el.removeAttribute('data-img-id');
    IMG.get(id).then(src => {
      if (!src) { el.dispatchEvent(new Event('error')); return; }
      el.src = src;
    }).catch(() => { el.dispatchEvent(new Event('error')); });
  });
}

// Resolve the displayable source for a log entry (legacy inline or IDB ref).
async function resolveEntryImage(item){
  if (!item) return null;
  if (item.img) return item.img;
  if (item.imgId) return await IMG.get(item.imgId);
  return null;
}

// Drop the IndexedDB blob backing a deleted entry so it doesn't leak — unless
// a favourite (or another log entry) still references the same image.
function releaseEntryImage(item){
  if (!item || !item.imgId) return;
  const id = item.imgId;
  try {
    const stillUsed = (Array.isArray(log) ? log : []).filter(e => e && e.imgId === id).length > 1
      || (JSON.parse(G('favs','[]')) || []).some(f => f && f.imgId === id);
    if (stillUsed) return;
  } catch(e) { /* be conservative and keep the blob */ return; }
  IMG.del(id);
}

// Remove IndexedDB images no longer referenced by the log or favourites.
async function pruneOrphanImages(){
  try {
    const keys = await IMG.keys();
    if (!keys.length) return;
    const alive = new Set();
    (Array.isArray(log) ? log : []).forEach(e => { if (e && e.imgId) alive.add(e.imgId); });
    try { (JSON.parse(G('favs','[]')) || []).forEach(f => { if (f && f.imgId) alive.add(f.imgId); }); } catch(e) {}
    for (const k of keys) if (!alive.has(k)) await IMG.del(k);
  } catch(e) {}
}

// ══════════════════════════════════════════════════════════════════
// SNAPSHOT BACKUP (IndexedDB)
// ══════════════════════════════════════════════════════════════════
// localStorage is "best-effort" storage: Android Chrome and iOS Safari are both
// allowed to evict it under storage pressure, and some WebViews accept
// `setItem` and then quietly drop the value. Either way the diary comes back
// empty on the next launch, which is the worst thing this app can do.
//
// So every write of the diary is mirrored into IndexedDB — a much larger, much
// less eviction-prone store — and on startup anything missing from
// localStorage is merged back in. The mirror is debounced so a burst of edits
// costs one write.

const META_STORE = 'meta';
const SNAP_KEY = 'snapshot';
let _metaDbPromise = null;

function _openMetaDb(){
  if (_metaDbPromise) return _metaDbPromise;
  _metaDbPromise = new Promise((resolve, reject) => {
    try {
      if (!('indexedDB' in window)) { reject(new Error('no-idb')); return; }
      const req = indexedDB.open('calsnap-meta', 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(META_STORE)) db.createObjectStore(META_STORE);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error || new Error('meta-open-failed'));
      req.onblocked = () => reject(new Error('meta-blocked'));
    } catch(e) { reject(e); }
  }).catch(err => { _metaDbPromise = null; throw err; });
  return _metaDbPromise;
}

function _metaRun(mode, fn){
  return _openMetaDb().then(db => new Promise((resolve, reject) => {
    let out;
    const tx = db.transaction(META_STORE, mode);
    const req = fn(tx.objectStore(META_STORE));
    if (req) req.onsuccess = () => { out = req.result; };
    tx.oncomplete = () => resolve(out);
    tx.onerror = () => reject(tx.error || new Error('meta-tx-failed'));
    tx.onabort = () => reject(tx.error || new Error('meta-tx-aborted'));
  }));
}

async function _metaPut(key, value){
  await _metaRun('readwrite', st => st.put(value, key));
  return true;
}
async function _metaGet(key){
  try { return (await _metaRun('readonly', st => st.get(key))) ?? null; }
  catch(e) { return null; }
}

// Drop the whole IndexedDB mirror. "Delete all data" must leave nothing behind,
// otherwise the next launch would helpfully restore everything the user just
// asked to erase.
async function wipeBackup(){
  let ok = true;
  _snapshotSuspended = true;
  try { clearTimeout(_snapTimer); } catch(e) {}
  try { await _metaRun('readwrite', st => st.clear()); } catch(e) { ok = false; }
  try { await IMG.clear(); } catch(e) { ok = false; }
  _snapshotSuspended = false;
  return ok;
}

// Ask the browser not to evict us. Installed PWAs usually get this for free;
// a plain tab does not, which is exactly where silent data loss happens.
// Last known persistence state, surfaced in the dev panel: "not persisted" is
// the single best predictor of the browser wiping the diary.
let storagePersisted = null;
async function requestPersistentStorage(){
  try {
    if (!navigator.storage?.persist) { storagePersisted = 'unsupported'; return null; }
    if (await navigator.storage.persisted?.()) { storagePersisted = true; return true; }
    storagePersisted = await navigator.storage.persist();
    return storagePersisted;
  } catch(e) { storagePersisted = null; return null; }
}

function _collectWaterKeys(){
  const out = {};
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith('water_') && k !== 'water_enabled') out[k] = localStorage.getItem(k);
    }
  } catch(e) {}
  return out;
}

let _snapTimer = null;
// While a wipe is in flight no new mirror may be written, or "delete all data"
// would race against its own backup.
let _snapshotSuspended = false;
// Mirror the durable slice of state. Called after every diary/profile write.
function snapshotSave(delay){
  if (_snapshotSuspended) return;
  clearTimeout(_snapTimer);
  _snapTimer = setTimeout(async () => {
    try {
      await _metaPut(SNAP_KEY, {
        v: 1,
        at: Date.now(),
        u: G('u', 'null'),
        log: G('log', '[]'),
        wts: G('wts', '[]'),
        favs: G('favs', '[]'),
        water: _collectWaterKeys(),
        pending: G('pending_photos', '[]'),
      });
    } catch(e) {}
  }, delay == null ? 1500 : delay);
}

const _entryKey = (e) => [e?.date, e?.time, e?.food, e?.kcal].join('|');

// Merge anything the snapshot has that localStorage lost. Returns a short
// report so the caller can tell the user something actually happened.
async function snapshotRestore(){
  const snap = await _metaGet(SNAP_KEY);
  if (!snap || snap.v !== 1) return null;
  const report = { profile: false, entries: 0, weights: 0, favs: 0, water: 0 };

  // Profile: only ever fill in a missing one, never overwrite.
  try {
    if (G('u', 'null') === 'null' && snap.u && snap.u !== 'null') {
      S('u', snap.u);
      U = JSON.parse(snap.u);
      report.profile = true;
    }
  } catch(e) {}

  // Diary: union by (date, time, name, kcal) so a partial loss also heals.
  try {
    const backup = JSON.parse(snap.log || '[]');
    if (Array.isArray(backup) && backup.length) {
      const seen = new Set((Array.isArray(log) ? log : []).map(_entryKey));
      const missing = backup.filter(e => e && !seen.has(_entryKey(e)));
      if (missing.length) {
        log.push(...missing);
        log.sort((a, b) => (new Date(b.date) - new Date(a.date)) || String(b.time).localeCompare(String(a.time)));
        saveLog();
        report.entries = missing.length;
      }
    }
  } catch(e) {}

  // Weights
  try {
    const backup = JSON.parse(snap.wts || '[]');
    if (Array.isArray(backup) && backup.length) {
      const seen = new Set(wts.map(w => w?.d + '|' + w?.v));
      const missing = backup.filter(w => w && !seen.has(w.d + '|' + w.v));
      if (missing.length) {
        wts.push(...missing);
        wts.sort((a, b) => new Date(b.d) - new Date(a.d));
        S('wts', JSON.stringify(wts));
        report.weights = missing.length;
      }
    }
  } catch(e) {}

  // Favourites + water days: restore only when absent locally.
  try {
    if (G('favs', '[]') === '[]' && snap.favs && snap.favs !== '[]') {
      S('favs', snap.favs);
      report.favs = (JSON.parse(snap.favs) || []).length;
    }
  } catch(e) {}
  try {
    for (const [k, v] of Object.entries(snap.water || {})) {
      if (localStorage.getItem(k) == null) { S(k, v); report.water++; }
    }
  } catch(e) {}
  try {
    if (G('pending_photos', '[]') === '[]' && snap.pending && snap.pending !== '[]') S('pending_photos', snap.pending);
  } catch(e) {}

  const healed = report.profile || report.entries || report.weights || report.favs || report.water;
  return healed ? report : null;
}
