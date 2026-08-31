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
  // shrinkDataUrl hands the original back when it cannot re-encode (HEIC, a
  // truncated file), so the stored copy is not necessarily a JPEG. Record what
  // it actually is: the API refuses a payload whose bytes and declared type
  // disagree.
  const mime = dataUrlMime(full) || 'image/jpeg';
  try {
    const id = newImgId();
    await IMG.put(id, full);
    // Read it back before calling the photo saved: a record whose blob did not
    // survive looks perfectly fine right up until analysis time, and then the
    // photo is simply gone.
    if (await IMG.get(id)) return { imgId: id, mime };
  } catch(e) { /* fall through to the inline copy */ }
  // No usable IndexedDB (private-mode WebView), or the write did not stick:
  // keep a smaller inline copy so the queue still works.
  const small = await shrinkDataUrl(dataUrl, 768, 0.7);
  return { img: small, mime: dataUrlMime(small) || mime };
}

// Park an entry for later analysis. `kind` is 'photo' | 'text' | 'barcode';
// photo/barcode carry an image (`src` data URL), barcode may instead carry a
// typed `code`, text carries `text`. Returns the new queue length, or -1.
async function enqueueEntry(entry){
  const q = getQueue();
  if (q.length >= QUEUE_MAX) { showToast(t('queue_full')); return -1; }
  let ref = {};
  if (entry.src) ref = await storeQueueImage(entry.src);
  const rec = {
    id: _queueId(),
    kind: entry.kind || 'photo',
    ...ref,
    mime: ref.mime || entry.mime || 'image/jpeg',
    text: (entry.text || '').slice(0, 500),
    code: entry.code || '',
    desc: (entry.desc || '').slice(0, 400),
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

// Back-compat wrapper for the photo path.
const enqueuePhoto = (dataUrl, desc) => enqueueEntry({ kind: 'photo', src: dataUrl, desc });

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
  // The record goes first so the queue is authoritative immediately; the row
  // left behind plays its exit animation and the list rebuilds after it.
  _dropQueueItem(id);
  _queueRowOut(id, 'out').then(renderQueue);
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
// The record currently being analysed, and how far the drain has got. Both are
// only for the UI: a queue that says nothing while it works looks stuck.
let _queueActiveId = '';
let _queueProgress = { done: 0, total: 0 };

// Let a row play its exit animation before the list is rebuilt without it.
function _queueRowOut(id, cls){
  if (typeof document === 'undefined' || !document) return Promise.resolve();
  const row = document.querySelector('.pq-row[data-qid="' + id + '"]');
  if (!row) return Promise.resolve();
  row.classList.add(cls);
  return new Promise(res => setTimeout(res, 280));
}

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
  const pending = getQueue().slice().sort((a, b) => a.createdAt - b.createdAt).filter(r => !r.failed);
  _queueProgress = { done: 0, total: pending.length };
  _queueActiveId = '';
  renderQueue();
  let done = 0;
  try {
    // Oldest first, so the diary fills in chronologically.
    for (const rec of pending) {
      if (rec.failed) continue;
      if (queueBlockedReason()) break;
      _queueActiveId = rec.id;
      renderQueue();
      const kind = rec.kind || 'photo';
      const needsImage = kind === 'photo' || (kind === 'barcode' && !rec.code);
      const src = needsImage ? (rec.img || (rec.imgId ? await IMG.get(rec.imgId) : null)) : null;
      if (needsImage && !src) {
        // The image is unreadable. Flag it so the row explains itself instead
        // of the photo quietly disappearing from the queue.
        const cur = getQueue();
        const live = cur.find(x => x.id === rec.id);
        if (live) { live.failed = true; live.lastErr = 'image-missing'; saveQueue(cur); }
        continue;
      }
      try {
        let r;
        // Trust the stored bytes over the stored field: a record written by an
        // older build may carry a MIME that no longer matches its image.
        const mime = (src ? dataUrlMime(src) : '') || rec.mime || 'image/jpeg';
        if (kind === 'text')          r = await analyzeTextData(rec.text);
        else if (kind === 'barcode')  r = rec.code ? await _offLookup(rec.code) : await analyzeBarcodeData(src, mime);
        else                          r = await analyzePhotoData(src, rec.desc, mime);
        if (!r) throw new Error(t('bc_not_found'));
        const imgRef = src ? await storeFoodImage(src) : {};
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
        // Tick the row off on screen before it disappears, so a drain of several
        // photos reads as progress rather than a list flickering shorter.
        await _queueRowOut(rec.id, 'done');
        _dropQueueItem(rec.id);
        done++;
        _queueProgress.done = done;
      } catch(e) {
        const msg = String(e?.message || e || '');
        const cur = getQueue();
        const live = cur.find(x => x.id === rec.id);
        if (live) {
          live.attempts = (live.attempts || 0) + 1;
          live.lastErr = msg.slice(0, 160);
          // "No food in this picture" will not change on a retry — fail it now
          // and let the row say why, instead of burning five attempts.
          if (e?.noFood || live.attempts >= QUEUE_MAX_ATTEMPTS) live.failed = true;
          saveQueue(cur);
        }
        // A network drop or an exhausted pool means every remaining item will
        // fail the same way — stop instead of burning attempts.
        if (/fetch|network|соединени|connection|quota|лимит|limit|cooldown|пауз/i.test(msg)) break;
      }
    }
  } finally {
    _queueRunning = false;
    _queueActiveId = '';
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
// Short, human reason a row is stuck. lastErr holds whatever the API or the
// network said, which is worth showing — "failed" on its own tells the user
// nothing they can act on.
function _queueReason(rec){
  const raw = String(rec.lastErr || '');
  if (!raw) return '';
  if (raw === 'image-missing') return t('queue_err_image');
  return raw.length > 90 ? raw.slice(0, 88) + '…' : raw;
}

let _queueSig = '';
function renderQueue(){
  // A deferred trigger can land after the document is gone (page teardown, or
  // a closed test window), and `document` is undefined by then.
  if (typeof document === 'undefined' || !document) return;
  const card = document.getElementById('pendingCard');
  if (!card) return;
  const q = getQueue().slice().sort((a, b) => b.createdAt - a.createdAt);
  const blocked = queueBlockedReason();
  // rH() calls this on every render; rebuilding identical markup would replay
  // the row entrance animation for no reason.
  const sig = JSON.stringify([q.map(r => [r.id, r.failed, r.attempts, r.lastErr]),
                              _queueRunning, _queueActiveId, _queueProgress.done, blocked, LANG]);
  if (sig === _queueSig && card.dataset.built === '1') return;
  _queueSig = sig;
  card.dataset.built = q.length ? '1' : '';
  if (!q.length) {
    card.style.display = 'none'; card.innerHTML = '';
    try { _updateOfflineBarText(); } catch(e) {}
    return;
  }
  card.style.display = '';
  card.classList.toggle('working', _queueRunning);
  const stuck = q.filter(r => r.failed).length;

  const btn = _queueRunning
    ? `<button class="pq-btn work" disabled><span class="pq-spin" aria-hidden="true"></span>${esc(t('queue_working'))}</button>`
    : `<button class="pq-btn${blocked ? '' : ' go'}" onclick="HFX.light();SFX.play('btn_tap');processQueue({manual:true})">${esc(t('queue_analyze_now'))}</button>`;

  // While draining, the header carries a determinate bar: "2 / 5".
  const total = _queueProgress.total || q.length;
  const pct = total ? Math.round(_queueProgress.done / total * 100) : 0;
  const prog = _queueRunning
    ? `<div class="pq-prog"><i style="width:${pct}%"></i></div>
       <div class="pq-prog-lbl">${_queueProgress.done} / ${total}</div>`
    : '';

  const KIND_ICON = { photo: '📷', text: '✍️', barcode: '📦' };
  const rows = q.map(rec => {
    const kind = rec.kind || 'photo';
    const active = _queueRunning && rec.id === _queueActiveId;
    const thumb = rec.imgId
      ? `<img class="pq-thumb" data-img-id="${esc(rec.imgId)}" alt="">`
      : (rec.img ? `<img class="pq-thumb" src="${esc(rec.img)}" alt="">`
                 : `<div class="pq-thumb">${KIND_ICON[kind] || '📷'}</div>`);
    // What the entry actually is: the typed meal, the barcode digits, or the
    // optional photo hint.
    const label = kind === 'text' ? rec.text : kind === 'barcode' ? (rec.code || t('tab_barcode')) : rec.desc;
    const when = rec.date === ds() ? rec.time : fmtDate(rec.date, { day: 'numeric', month: 'short' }) + ' · ' + rec.time;
    const reason = _queueReason(rec);
    const tries = !rec.failed && rec.attempts > 0
      ? `<span class="pq-tries">${rec.attempts}/${QUEUE_MAX_ATTEMPTS}</span>` : '';
    const state = rec.failed
      ? `<span class="pq-state bad"><span class="pq-dot bad"></span>${esc(reason ? t('queue_state_failed_short') + ' · ' + reason : t('queue_state_failed'))}</span>`
      : (active
          ? `<span class="pq-state work"><span class="pq-dot work"></span>${esc(t('queue_state_working'))}</span>`
          : `<span class="pq-state"><span class="pq-dot"></span>${esc(blocked || t('queue_state_waiting'))}${tries}</span>`);
    return `<div class="pq-row${rec.failed ? ' bad' : ''}${active ? ' active' : ''}" data-qid="${esc(rec.id)}">
      <div class="pq-thumb-wrap">${thumb}${active ? '<span class="pq-thumb-spin" aria-hidden="true"></span>' : ''}</div>
      <div class="pq-info">
        <div class="pq-when">${esc(when)}${kind !== 'photo' ? ` <span class="pq-kind">${KIND_ICON[kind] || ''}</span>` : ''}</div>
        ${label ? `<div class="pq-desc">${esc(label)}</div>` : ''}
        ${state}
      </div>
      ${rec.failed ? `<button class="pq-mini retry" onclick="retryQueueItem('${esc(rec.id)}')" aria-label="${esc(t('retry'))}" title="${esc(t('retry'))}">↻</button>` : ''}
      <button class="pq-mini del" onclick="deleteQueueItem('${esc(rec.id)}')" aria-label="${esc(t('btn_delete'))}" title="${esc(t('btn_delete'))}">✕</button>
    </div>`;
  }).join('');

  const sub = stuck && !_queueRunning
    ? tf('queue_sub_stuck', { n: stuck })
    : (blocked || t('queue_sub_ready'));

  // The offline bar counts the same queue — keep the two in step.
  try { _updateOfflineBarText(); } catch(e) {}

  card.innerHTML = `
    <div class="pq-hdr">
      <div class="pq-ico">📸<span class="pq-badge">${q.length}</span></div>
      <div style="flex:1;min-width:0">
        <div class="pq-title">${esc(tf('queue_title', { n: q.length }))}</div>
        <div class="pq-sub${stuck && !_queueRunning ? ' bad' : ''}">${esc(sub)}</div>
      </div>
      ${btn}
    </div>
    ${prog}
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
