// ══════════════════════════════════════════════════════════════════
// OFFLINE ANALYSIS QUEUE
// ══════════════════════════════════════════════════════════════════
// Photo analysis needs the network, but meals happen wherever you are. A photo
// taken offline (or while every API key is on cooldown) is parked here with its
// image, and analysed automatically as soon as the app is online again with a
// usable key. Queued photos are NOT counted in the diary until they resolve —
// their calories are unknown, and guessing would corrupt the day's totals.
//
// Record: { id, imgId | img, desc, date, time, createdAt, attempts, lastErr, failed }

const QUEUE_MAX = 30;
const QUEUE_MAX_ATTEMPTS = 5;

function getQueue(){
  try {
    const a = JSON.parse(G('pending_photos', '[]'));
    return Array.isArray(a) ? a : [];
  } catch(e) { return []; }
}
function saveQueue(q){ return S('pending_photos', JSON.stringify(q.slice(0, QUEUE_MAX))); }
function queueCount(){ return getQueue().length; }

function _queueId(){
  return 'q' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7);
}

// The queued copy is what gets sent to Gemini later, so it keeps analysis
// resolution (1024 px) rather than the 480 px display thumbnail.
async function storeQueueImage(dataUrl){
  const full = await shrinkDataUrl(dataUrl, 1024, 0.82);
  try {
    const id = newImgId();
    await IMG.put(id, full);
    // Read it back before calling the photo saved: a record whose blob did not
    // survive looks perfectly fine right up until analysis time, and then the
    // photo is simply gone.
    if (await IMG.get(id)) return { imgId: id };
  } catch(e) { /* fall through to the inline copy */ }
  // No usable IndexedDB (private-mode WebView), or the write did not stick:
  // keep a smaller inline copy so the queue still works.
  return { img: await shrinkDataUrl(dataUrl, 768, 0.7) };
}

// Park a photo for later analysis. Returns the new queue length, or -1 on
// failure (storage full).
async function enqueuePhoto(dataUrl, desc){
  const q = getQueue();
  if (q.length >= QUEUE_MAX) { showToast(t('queue_full')); return -1; }
  const ref = await storeQueueImage(dataUrl);
  const rec = {
    id: _queueId(), ...ref,
    desc: (desc || '').slice(0, 400),
    date: ds(), time: tnow(), createdAt: Date.now(),
    attempts: 0, lastErr: '', failed: false,
  };
  q.push(rec);
  if (!saveQueue(q)) {
    if (ref.imgId) IMG.del(ref.imgId);
    return -1;
  }
  renderQueue();
  return q.length;
}

function _dropQueueItem(id){
  const q = getQueue();
  const i = q.findIndex(r => r.id === id);
  if (i < 0) return;
  const rec = q[i];
  if (rec.imgId) IMG.del(rec.imgId);
  q.splice(i, 1);
  saveQueue(q);
}

function deleteQueueItem(id){
  HFX.light(); SFX.play('delete');
  _dropQueueItem(id);
  renderQueue();
}

function retryQueueItem(id){
  const q = getQueue();
  const rec = q.find(r => r.id === id);
  if (!rec) return;
  rec.failed = false; rec.attempts = 0; rec.lastErr = '';
  saveQueue(q);
  HFX.light(); SFX.play('btn_tap');
  processQueue({ manual: true });
}

// ── Processing ────────────────────────────────────────────────────
let _queueRunning = false;

// Why the queue cannot run right now, or '' when it can.
function queueBlockedReason(){
  if (!navigator.onLine) return t('queue_offline');
  if (!hasApiKey()) return t('week_ai_no_key');
  if (!hasUsableApiKey()) return t('keys_all_cooldown_short');
  return '';
}

async function processQueue(opts){
  opts = opts || {};
  if (_queueRunning) return;
  const q = getQueue();
  if (!q.length) { renderQueue(); return; }
  const blocked = queueBlockedReason();
  if (blocked) {
    if (opts.manual) { HFX.error(); showToast(blocked); }
    renderQueue();
    return;
  }
  _queueRunning = true;
  renderQueue();
  let done = 0;
  try {
    // Oldest first, so the diary fills in chronologically.
    for (const rec of getQueue().slice().sort((a, b) => a.createdAt - b.createdAt)) {
      if (rec.failed) continue;
      if (queueBlockedReason()) break;
      const src = rec.img || (rec.imgId ? await IMG.get(rec.imgId) : null);
      if (!src) {
        // The image is unreadable. Flag it so the row explains itself instead
        // of the photo quietly disappearing from the queue.
        const cur = getQueue();
        const live = cur.find(x => x.id === rec.id);
        if (live) { live.failed = true; live.lastErr = 'image-missing'; saveQueue(cur); }
        continue;
      }
      try {
        const r = await analyzePhotoData(src, rec.desc);
        const imgRef = await storeFoodImage(src);
        const entry = {
          food: r.food, portion: r.portion,
          kcal: r.calories || 0, prot: r.protein || 0, fat: r.fat || 0, carb: r.carbs || 0,
          ...imgRef,
          time: rec.time, date: rec.date,
          mealType: getMealType(rec.time),
          desc: r.description || '', ingr: r.ingredients || [],
          fromQueue: true,
        };
        log.unshift(entry);
        if (!saveLog()) { log.shift(); break; }   // storage full — stop, keep the item
        _dropQueueItem(rec.id);
        done++;
      } catch(e) {
        const msg = String(e?.message || e || '');
        const cur = getQueue();
        const live = cur.find(x => x.id === rec.id);
        if (live) {
          live.attempts = (live.attempts || 0) + 1;
          live.lastErr = msg.slice(0, 160);
          if (live.attempts >= QUEUE_MAX_ATTEMPTS) live.failed = true;
          saveQueue(cur);
        }
        // A network drop or an exhausted pool means every remaining item will
        // fail the same way — stop instead of burning attempts.
        if (/fetch|network|соединени|connection|quota|лимит|limit|cooldown|пауз/i.test(msg)) break;
      }
    }
  } finally {
    _queueRunning = false;
  }
  if (done) {
    HFX.success(); SFX.play('scan_success');
    showToast(tf('queue_analyzed', { n: done }));
    try { rH(); } catch(e) {}
  } else if (opts.manual) {
    const left = queueCount();
    if (left) { HFX.error(); showToast(t('queue_failed_hint')); }
  }
  renderQueue();
}

// ── Rendering ─────────────────────────────────────────────────────
let _queueSig = '';
function renderQueue(){
  const card = document.getElementById('pendingCard');
  if (!card) return;
  const q = getQueue().slice().sort((a, b) => b.createdAt - a.createdAt);
  // rH() calls this on every render; rebuilding identical markup would replay
  // the row entrance animation for no reason.
  const sig = JSON.stringify([q.map(r => [r.id, r.failed, r.attempts]), _queueRunning, queueBlockedReason(), LANG]);
  if (sig === _queueSig && card.dataset.built === '1') return;
  _queueSig = sig;
  card.dataset.built = q.length ? '1' : '';
  if (!q.length) { card.style.display = 'none'; card.innerHTML = ''; return; }
  card.style.display = '';
  const blocked = queueBlockedReason();
  const btn = _queueRunning
    ? `<button class="pq-btn" disabled>${esc(t('queue_working'))}</button>`
    : `<button class="pq-btn" onclick="HFX.light();SFX.play('btn_tap');processQueue({manual:true})">${esc(t('queue_analyze_now'))}</button>`;
  const rows = q.map(rec => {
    const thumb = rec.imgId
      ? `<img class="pq-thumb" data-img-id="${esc(rec.imgId)}" alt="">`
      : (rec.img ? `<img class="pq-thumb" src="${esc(rec.img)}" alt="">` : `<div class="pq-thumb">📷</div>`);
    const when = rec.date === ds() ? rec.time : fmtDate(rec.date, { day: 'numeric', month: 'short' }) + ' · ' + rec.time;
    const state = rec.failed
      ? `<span class="pq-state bad">${esc(t('queue_state_failed'))}</span>`
      : (_queueRunning
          ? `<span class="pq-state work">${esc(t('queue_state_working'))}</span>`
          : `<span class="pq-state">${esc(blocked || t('queue_state_waiting'))}</span>`);
    return `<div class="pq-row">
      ${thumb}
      <div class="pq-info">
        <div class="pq-when">${esc(when)}</div>
        ${rec.desc ? `<div class="pq-desc">${esc(rec.desc)}</div>` : ''}
        ${state}
      </div>
      ${rec.failed ? `<button class="pq-mini" onclick="retryQueueItem('${esc(rec.id)}')" title="${esc(t('retry'))}">↻</button>` : ''}
      <button class="pq-mini del" onclick="deleteQueueItem('${esc(rec.id)}')" title="${esc(t('btn_delete'))}">✕</button>
    </div>`;
  }).join('');
  card.innerHTML = `
    <div class="pq-hdr">
      <div class="pq-ico">📸</div>
      <div style="flex:1;min-width:0">
        <div class="pq-title">${esc(tf('queue_title', { n: q.length }))}</div>
        <div class="pq-sub">${esc(blocked || t('queue_sub_ready'))}</div>
      </div>
      ${btn}
    </div>
    <div class="pq-list">${rows}</div>`;
  hydrateImages(card);
}

// ── Triggers ──────────────────────────────────────────────────────
// Process when connectivity returns, when the app comes back to the
// foreground, and shortly after start-up.
window.addEventListener('online', () => setTimeout(() => processQueue({}), 1200));
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && queueCount()) setTimeout(() => processQueue({}), 600);
});
