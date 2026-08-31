let ALL_MODELS=[
  // ── Gemini 3.x (newest — also returned by the API) ──
  {id:'gemini-3.1-pro-preview-customtools',   name:'Gemini 3.1 Pro Preview Customtools'},
  {id:'gemini-3.1-pro-preview',               name:'Gemini 3.1 Pro Preview'},
  {id:'gemini-3.1-flash-image-preview',       name:'Gemini 3.1 Flash Image Preview'},
  {id:'gemini-3.1-flash-lite-preview',        name:'Gemini 3.1 Flash Lite Preview'},
  {id:'gemini-3-flash-preview',               name:'Gemini 3 Flash Preview'},
  {id:'gemini-3-pro-preview',                 name:'Gemini 3 Pro Preview'},
  {id:'gemini-3-pro-image-preview',           name:'Gemini 3 Pro Image Preview'},
  // ── Latest aliases ──
  {id:'gemini-flash-latest',                  name:'Gemini Flash Latest'},
  {id:'gemini-flash-lite-latest',             name:'Gemini Flash Lite Latest'},
  {id:'gemini-pro-latest',                    name:'Gemini Pro Latest'},
  {id:'gemini-2.5-flash-latest',             name:'Gemini 2.5 Flash Latest'},
  {id:'gemini-2.5-pro-latest',               name:'Gemini 2.5 Pro Latest'},
  // ── Gemini 2.5 ──
  {id:'gemini-2.5-pro',                       name:'Gemini 2.5 Pro'},
  {id:'gemini-2.5-flash',                     name:'Gemini 2.5 Flash'},
  {id:'gemini-2.5-flash-lite',                name:'Gemini 2.5 Flash Lite'},
  {id:'gemini-2.5-flash-lite-preview-06-17',  name:'Gemini 2.5 Flash Lite Preview'},
  {id:'gemini-2.5-flash-lite-preview-09-2025',name:'Gemini 2.5 Flash Lite Preview Sep'},
  {id:'gemini-2.5-flash-preview-05-20',       name:'Gemini 2.5 Flash Preview May'},
  {id:'gemini-2.5-flash-preview-04-17',       name:'Gemini 2.5 Flash Preview Apr'},
  {id:'gemini-2.5-flash-image',               name:'Gemini 2.5 Flash Image'},
  {id:'gemini-2.5-flash-native-audio-latest', name:'Gemini 2.5 Flash Native Audio'},
  {id:'gemini-2.5-flash-native-audio-preview-09-2025',name:'Gemini 2.5 Flash Audio Preview Sep'},
  {id:'gemini-2.5-flash-native-audio-preview-12-2025',name:'Gemini 2.5 Flash Audio Preview Dec'},
  {id:'gemini-2.5-flash-preview-tts',         name:'Gemini 2.5 Flash Preview TTS'},
  {id:'gemini-2.5-pro-preview-06-05',         name:'Gemini 2.5 Pro Preview Jun'},
  {id:'gemini-2.5-pro-preview-05-06',         name:'Gemini 2.5 Pro Preview May'},
  {id:'gemini-2.5-pro-preview-03-25',         name:'Gemini 2.5 Pro Preview Mar'},
  {id:'gemini-2.5-pro-exp-03-25',             name:'Gemini 2.5 Pro Experimental'},
  {id:'gemini-2.5-pro-preview-tts',           name:'Gemini 2.5 Pro Preview TTS'},
  {id:'gemini-2.5-computer-use-preview-10-2025',name:'Gemini 2.5 Computer Use Preview'},
  // ── Gemini 2.0 ──
  {id:'gemini-2.0-flash',                     name:'Gemini 2.0 Flash'},
  {id:'gemini-2.0-flash-001',                 name:'Gemini 2.0 Flash 001'},
  {id:'gemini-2.0-flash-lite',                name:'Gemini 2.0 Flash Lite'},
  {id:'gemini-2.0-flash-lite-001',            name:'Gemini 2.0 Flash Lite 001'},
  {id:'gemini-2.0-flash-thinking-exp-01-21',  name:'Gemini 2.0 Flash Thinking'},
  {id:'gemini-2.0-flash-exp-image-generation',name:'Gemini 2.0 Flash Exp Image Gen'},
  {id:'gemini-2.0-pro-exp-02-05',             name:'Gemini 2.0 Pro Experimental'},
  // ── Gemini 1.5 ──
  {id:'gemini-1.5-pro',                       name:'Gemini 1.5 Pro'},
  {id:'gemini-1.5-pro-001',                   name:'Gemini 1.5 Pro 001'},
  {id:'gemini-1.5-pro-002',                   name:'Gemini 1.5 Pro 002'},
  {id:'gemini-1.5-flash',                     name:'Gemini 1.5 Flash'},
  {id:'gemini-1.5-flash-001',                 name:'Gemini 1.5 Flash 001'},
  {id:'gemini-1.5-flash-002',                 name:'Gemini 1.5 Flash 002'},
  {id:'gemini-1.5-flash-8b',                  name:'Gemini 1.5 Flash 8B'},
  {id:'gemini-1.5-flash-8b-001',              name:'Gemini 1.5 Flash 8B 001'},
  // ── Robotics ──
  {id:'gemini-robotics-er-1.5-preview',       name:'Gemini Robotics Er 1.5 Preview'},
];

// Models we actively recommend — shown with a "Recommended" badge and
// sorted to the top of the picker. Kept as an id allowlist (rather than a
// per-entry flag) so the recommendation survives ALL_MODELS being replaced
// wholesale by fetchGeminiModels() once the live API list loads.
const RECOMMENDED_MODEL_IDS = ['gemini-flash-lite-latest','gemini-flash-latest','gemini-pro-latest'];
const isRecommendedModel = (id) => RECOMMENDED_MODEL_IDS.includes(id);

// The recommended model is only ever written on a *fresh install*. After that
// the stored choice wins unconditionally — including when the live model list
// from the API no longer advertises it, which used to make the picker fall back
// to the default and look like the setting had reset itself.
const DEFAULT_MODEL = 'gemini-flash-lite-latest';
let selModel = (() => {
  const stored = (localStorage.getItem('model') || '').trim();
  if (stored) return stored;
  try { localStorage.setItem('model', DEFAULT_MODEL); } catch(e) {}
  return DEFAULT_MODEL;
})();

// Fetch all available models from Gemini API
async function fetchGeminiModels(){
  const k=usableKeys()[0]||getKeyPool()[0]?.k;
  if(!k) return;
  try{
    const r=await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(k)}&pageSize=100`);
    if(!r.ok) return;
    const d=await r.json();
    if(!d.models) return;
    // Filter to generateContent-capable models only, exclude audio/video/embedding
    const skip=['embedding','aqa','retrieval'];
    const fresh=d.models
      .filter(m=>m.supportedGenerationMethods?.includes('generateContent'))
      .filter(m=>!skip.some(s=>m.name.toLowerCase().includes(s)))
      .map(m=>{
        const id=m.name.replace('models/','');
        const dname=m.displayName||id;
        return {id, name:dname, desc:m.description?.split('.')[0]?.substring(0,50)||'', fromApi:true};
      })
      .sort((a,b)=>a.name.localeCompare(b.name));
    if(fresh.length>0){
      // Keep the user's current model in the list even if the API stopped
      // advertising it, so the picker never silently loses the selection.
      if(!fresh.some(m=>m.id===selModel)){
        const kept=ALL_MODELS.find(m=>m.id===selModel);
        fresh.unshift(kept?{...kept}:{id:selModel,name:selModel});
      }
      ALL_MODELS=fresh;
    }
  }catch(e){console.log('Model fetch failed:',e.message);}
}

// ── Model tags ────────────────────────────────────────────────────
// The picker lists dozens of ids that mean nothing to anyone who has not read
// the Gemini docs. Each one gets a few plain-language tags derived from its id,
// so "which of these should I pick" has an answer at a glance.
//
// tone: 'good' | 'warn' | 'bad' | 'info' — drives the pill colour.
function modelTags(m){
  const id = (m?.id || '').toLowerCase();
  const tags = [];
  const add = (key, tone) => tags.push({ key, tone: tone || 'info' });

  if (isRecommendedModel(id)) add('mdl_tag_recommended', 'good');

  // Speed / quality tier.
  if (/flash-lite/.test(id))      { add('mdl_tag_fastest', 'good'); add('mdl_tag_cheap', 'good'); }
  else if (/flash/.test(id))      { add('mdl_tag_fast', 'good'); }
  else if (/\bpro\b|-pro/.test(id)) { add('mdl_tag_accurate', 'good'); add('mdl_tag_slow', 'warn'); add('mdl_tag_low_quota', 'warn'); }

  // Capabilities that make a model a poor fit for photographing dinner.
  if (/tts|native-audio|audio/.test(id))       add('mdl_tag_not_for_food', 'bad');
  else if (/image-generation|flash-image|pro-image/.test(id)) add('mdl_tag_not_for_food', 'bad');
  else if (/computer-use|robotics|embedding/.test(id))       add('mdl_tag_not_for_food', 'bad');

  if (/thinking/.test(id)) { add('mdl_tag_reasoning', 'info'); add('mdl_tag_slow', 'warn'); }
  if (/-8b/.test(id))      add('mdl_tag_compact', 'info');

  // Maturity.
  if (/\bexp\b|-exp/.test(id))  add('mdl_tag_experimental', 'warn');
  else if (/preview/.test(id))  add('mdl_tag_preview', 'warn');
  else if (/latest/.test(id))   add('mdl_tag_latest', 'info');
  else if (/-\d{3}$/.test(id))  add('mdl_tag_pinned', 'info');

  if (/gemini-1\.5|gemini-1\.0|gemini-pro$/.test(id)) add('mdl_tag_legacy', 'bad');
  else if (/gemini-2\.0/.test(id))                    add('mdl_tag_older', 'warn');

  // De-duplicate (a "thinking exp" model can pick up "slow" twice).
  const seen = new Set();
  return tags.filter(x => !seen.has(x.key) && seen.add(x.key)).slice(0, 4);
}

// Short tier line shown above the tags.
function _modelTier(m){
  const id = (m?.id || '').toLowerCase();
  const tier =
    /flash-lite/.test(id)   ? '🪶 Flash Lite' :
    /flash/.test(id)        ? '⚡ Flash' :
    /\bpro\b|-pro/.test(id) ? '🏆 Pro' :
    /robotics/.test(id)     ? '🤖 Robotics' : '✨ Gemini';
  const ver = (id.match(/(\d+\.\d+|\d+)(?=[-.]|$)/) || [])[1] || '';
  return tier + (ver ? ' ' + ver : '');
}

function _modelRowHtml(m){
  const on = m.id === selModel;
  const tags = modelTags(m).map(x => `<span class="mdl-tag ${x.tone}">${esc(t(x.key))}</span>`).join('');
  return `<button class="mdl-row${on ? ' on' : ''}" onclick="HFX.tick();SFX.play('select');selectModel('${esc(m.id)}')">
      <div class="mdl-main">
        <div class="mdl-name">${esc(m.name)}</div>
        <div class="mdl-tier">${esc(_modelTier(m))}</div>
        ${tags ? `<div class="mdl-tags">${tags}</div>` : ''}
      </div>
      <span class="mdl-check" aria-hidden="true">${on ? '✓' : ''}</span>
    </button>`;
}

// Grouped, searchable list. Fifty-odd ids is far too many to scan, so the ones
// worth picking come first under their own heading and everything else follows.
function _renderModelList(filter){
  const list = document.getElementById('mdlList');
  if (!list) return;
  const f = String(filter || '').trim().toLowerCase();
  const match = (m) => !f || m.name.toLowerCase().includes(f) || m.id.toLowerCase().includes(f)
                    || modelTags(m).some(x => t(x.key).toLowerCase().includes(f));
  const rec = ALL_MODELS.filter(m => isRecommendedModel(m.id) && match(m));
  const rest = ALL_MODELS.filter(m => !isRecommendedModel(m.id) && match(m));
  if (!rec.length && !rest.length) {
    list.innerHTML = `<div class="mdl-empty">
      <div class="mdl-empty-ico" aria-hidden="true">🔍</div>
      <div class="mdl-empty-t">${esc(t('mdl_none'))}</div>
      <div class="mdl-empty-s">${esc(t('mdl_none_sub'))}</div>
    </div>`;
    return;
  }
  const group = (key, items) => items.length
    ? `<div class="mdl-grp">${esc(t(key))}<span>${items.length}</span></div>` + items.map(_modelRowHtml).join('')
    : '';
  // Replaying the entrance animation on every keystroke makes the list flicker,
  // so it only plays for the unfiltered list the sheet opens with.
  list.classList.toggle('no-anim', !!f);
  list.innerHTML = group('mdl_grp_recommended', rec) + group('mdl_grp_rest', rest);
  const x = document.getElementById('mdlSearchX');
  if (x) x.hidden = !f;
}

function clearModelSearch(){
  const box = document.getElementById('mdlSearch');
  if (box) { box.value = ''; box.focus(); }
  HFX.light(); SFX.play('btn_tap');
  _renderModelList('');
}

function openModelPicker(){
  const ov=document.getElementById('mdlOv');
  const cnt=document.getElementById('mdlCount');
  if(cnt) cnt.textContent=tf('mdl_count',{n:ALL_MODELS.length});
  const searchBox = document.getElementById('mdlSearch');
  if(searchBox){
    searchBox.value='';
    searchBox.oninput = (e) => _renderModelList(e.target.value);
  }
  _renderModelList('');
  ov.style.display='flex';
  ov.style.animation='ovIn .18s ease';
  lockScroll(true);
  // The selected row is usually below the fold once the list is this long.
  requestAnimationFrame(() => {
    document.querySelector('#mdlList .mdl-row.on')?.scrollIntoView({ block: 'nearest' });
  });
}
function closeModelPicker(){
  const ov=document.getElementById('mdlOv');
  if(!ov || ov.style.display==='none') return;
  HFX.light(); SFX.play('sheet_close');
  ov.style.display='none';
  lockScroll(false);
}

function selectModel(id){
  selModel=id;
  S('model',id);
  document.getElementById('smodel').textContent=ALL_MODELS.find(m=>m.id===id)?.name||id;
  closeModelPicker();
  // Keep the list in step for the next time it opens.
  _renderModelList(document.getElementById('mdlSearch')?.value || '');
}
// Fatal errors must not be retried with the same key — that only fires more
// doomed requests and delays the message the user needs.
class GemFatalError extends Error {}

// How many HTTP attempts a single gem() call may make. With several keys and
// five fallback models the full matrix could be 50 requests; cap it so a bad
// day fails in seconds rather than minutes.
const GEM_MAX_ATTEMPTS = 8;

async function gem(parts,sys='',opts={},history=[]){
  if(!hasApiKey()) throw new Error(t('week_ai_no_key'));
  const models=[selModel,'gemini-flash-lite-latest','gemini-flash-latest','gemini-2.0-flash-lite','gemini-2.0-flash'].filter((v,i,a)=>a.indexOf(v)===i);
  const generationConfig={temperature:opts.temperature ?? 0.2, maxOutputTokens:opts.maxOutputTokens ?? 2048};
  if(opts.json) generationConfig.responseMimeType='application/json';
  // Conversation memory (opt-in): prior turns go first, current message last.
  const contents=[...(history||[]),{role:'user',parts}];
  const body={contents,generationConfig};
  if(sys)body.system_instruction={parts:[{text:sys}]};
  const payload=JSON.stringify(body);

  let lastErr='', attempts=0, sawQuota=false, sawNetwork=false;
  for(const m of models){
    // Re-read the pool for every model: keys knocked out on the previous
    // model are skipped, and a key whose cooldown expired comes back.
    const pool=usableKeys();
    if(!pool.length) break;
    for(const k of pool){
      if(attempts++ >= GEM_MAX_ATTEMPTS) break;
      try{
        // No AbortSignal — SW structured clone fails with it
        const r=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent?key=${encodeURIComponent(k)}`,
          {method:'POST',headers:{'Content-Type':'application/json'},body:payload});
        if(r.ok){
          const d=await r.json();
          const tx=d.candidates?.[0]?.content?.parts?.[0]?.text||'';
          if(!tx) throw new Error(t('err_analyze'));
          markKeyOk(k);
          // Token accounting lives in usage.js: it is the only way to see how
          // much of the free quota this app actually spends.
          try { recordUsage(m, d.usageMetadata); } catch(e) {}
          return tx;
        }
        const er=await r.json().catch(()=>({}));
        const code=r.status;
        const emsg=er.error?.message||'';
        if(code===429){
          // Quota/rate limit on this key — park it and move to the next one.
          markKeyQuota(k, emsg);
          sawQuota=true;
          lastErr=t('ai_err_quota');
          continue;
        }
        if(code===400||code===401||code===403){
          // A malformed/expired/blocked key. `API_KEY_INVALID` and friends are
          // about the key; a 400 about the request body is not, so only
          // disable the key when the message points at it.
          if(code!==400 || /api[ _-]?key|API_KEY_INVALID|credential|unauthenticated/i.test(emsg) || !emsg){
            markKeyInvalid(k, emsg);
            lastErr=t('ai_err_key');
            continue;
          }
          throw new GemFatalError(emsg || t('ai_err_generic'));
        }
        lastErr=emsg||`HTTP ${code}`;
        break; // server-side/model problem — try the next model
      }catch(e){
        if(e instanceof GemFatalError) throw new Error(e.message);
        const isLocal=location.protocol==='file:'||location.protocol==='content:'||location.hostname==='';
        if(e.message==='Failed to fetch'||e.name==='TypeError'){
          sawNetwork=true;
          lastErr=isLocal?t('err_open_pages'):t('err_no_gemini');
          break; // the network is down; another key will not help
        }
        lastErr=e.name==='AbortError'?t('ai_err_net'):(e.message||t('ai_err_net'));
      }
    }
    if(sawNetwork) break;
    if(attempts >= GEM_MAX_ATTEMPTS) break;
  }
  if(sawNetwork) throw new Error(lastErr||t('err_no_gemini'));
  if(!hasUsableApiKey() && hasApiKey()){
    // Every key is exhausted or invalid — say so explicitly, and say when the
    // soonest one frees up so the user is not left guessing.
    const soonest=getKeyPool().filter(e=>!e.invalid && keyCooldownLeft(e)>0)
      .sort((a,b)=>a.cooldownUntil-b.cooldownUntil)[0];
    throw new Error(soonest
      ? tf('keys_all_cooldown',{time:fmtDuration(keyCooldownLeft(soonest))})
      : t('keys_all_invalid'));
  }
  if(sawQuota && !lastErr) lastErr=t('ai_err_quota');
  throw new Error(lastErr||t('ai_err_generic'));
}
// Decode + downscale any picked image to base64 JPEG for the API.
//
// The old implementation went File → FileReader → `new Image()` → canvas, which
// silently failed for anything the <img> decoder does not accept — HEIC/HEIF
// from iPhones being the common case, plus very large images where the canvas
// allocation fails. Now the decode is attempted three ways before giving up, and
// as a last resort the original bytes are sent through untouched.
const IMG_MAX_EDGE = 1024;
const IMG_QUALITY = 0.85;
// Progressively smaller retries: a 12 000 px screenshot can exceed the platform
// canvas limit, where toDataURL either throws or hands back an empty string.
const IMG_FALLBACK_EDGES = [1024, 768, 512, 320];
// Hard ceiling for the pass-through path: Gemini takes inline data up to ~20 MB
// base64, and base64 inflates by ~4/3.
const IMG_RAW_MAX_BYTES = 12 * 1024 * 1024;
// Types the API will accept as-is when we cannot re-encode them ourselves.
const IMG_RAW_OK = /^image\/(jpeg|jpg|png|webp|heic|heif|gif|bmp|avif|tiff?)$/i;

// Magic bytes, so a file the picker handed over with an empty or wrong type
// still gets a truthful MIME. Android document providers routinely report
// `application/octet-stream` (or nothing at all) for a perfectly ordinary
// screenshot, and declaring that to the API gets the picture refused.
const IMG_MAGIC = [
  ['image/jpeg', [0xFF, 0xD8, 0xFF]],
  ['image/png',  [0x89, 0x50, 0x4E, 0x47]],
  ['image/gif',  [0x47, 0x49, 0x46, 0x38]],
  ['image/bmp',  [0x42, 0x4D]],
  ['image/tiff', [0x49, 0x49, 0x2A, 0x00]],
  ['image/tiff', [0x4D, 0x4D, 0x00, 0x2A]],
];
function _sniffMime(bytes){
  for (const [mime, sig] of IMG_MAGIC) {
    if (sig.every((b, i) => bytes[i] === b)) return mime;
  }
  // RIFF....WEBP / ....ftypheic|heif|mif1|avif — both carry the marker at 8.
  const tag = String.fromCharCode(...bytes.slice(4, 12));
  if (bytes[0] === 0x52 && bytes[1] === 0x49 && /WEBP/.test(tag)) return 'image/webp';
  if (/ftyp(heic|heix|hevc|mif1|msf1)/i.test(tag)) return 'image/heic';
  if (/ftyp(avif|avis)/i.test(tag)) return 'image/avif';
  return '';
}
// First bytes of a base64 payload, for _sniffMime().
function _b64Head(b64str){
  try {
    const bin = atob(String(b64str).slice(0, 32));
    return Array.from(bin, c => c.charCodeAt(0));
  } catch(e) { return []; }
}
// MIME declared by a data URL, or '' when it carries none.
function dataUrlMime(u){
  return (String(u || '').match(/^data:([^;,]+)/) || [, ''])[1].toLowerCase();
}

function _fileToDataUrl(file){
  return new Promise((res, rej) => {
    const fr = new FileReader();
    fr.onload = () => res(fr.result);
    fr.onerror = () => rej(new Error(t('err_file_open')));
    fr.readAsDataURL(file);
  });
}

function _fitted(w, h, maxEdge){
  const m = maxEdge || IMG_MAX_EDGE;
  if (w <= m && h <= m) return [Math.max(1, w), Math.max(1, h)];
  return w >= h
    ? [m, Math.max(1, Math.round(h * m / w))]
    : [Math.max(1, Math.round(w * m / h)), m];
}

// Draw whatever was decoded onto a canvas and return bare base64. It retries at
// smaller sizes because the failure mode of an oversized canvas is a silent
// empty result rather than an exception — which is how large screenshots ended
// up being refused.
// A JPEG data URL is only trustworthy if it actually says so and carries a
// payload. The old check demanded 512 characters, which quietly rejected small
// pictures — an icon, a cropped screenshot, a flat-colour image — even though
// the encode had succeeded.
function _jpegPayload(out){
  const s = String(out || '');
  if (!/^data:image\/jpe?g;base64,/i.test(s)) return '';
  const b = s.slice(s.indexOf(',') + 1);
  return b.length >= 4 ? b : '';
}

function _drawToBase64(src, w, h){
  let lastErr;
  for (const edge of IMG_FALLBACK_EDGES) {
    const [dw, dh] = _fitted(w, h, edge);
    let cv = null;
    try {
      cv = document.createElement('canvas');
      cv.width = dw; cv.height = dh;
      const ctx = cv.getContext('2d');
      if (!ctx) throw new Error('no-2d-context');
      // PNGs and screenshots with transparency come out black on a JPEG
      // background unless it is painted first.
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, dw, dh);
      ctx.drawImage(src, 0, 0, dw, dh);
      const payload = _jpegPayload(cv.toDataURL('image/jpeg', IMG_QUALITY));
      if (!payload) throw new Error('canvas-empty');
      return payload;
    } catch(e) {
      lastErr = e;
    } finally {
      // Free the backing store right away: several 100 MP attempts in a row is
      // exactly how a mobile tab gets killed.
      if (cv) { cv.width = 1; cv.height = 1; }
    }
  }
  throw lastErr || new Error('canvas-failed');
}

// Same job on an OffscreenCanvas. Some WebViews cap the *element* canvas well
// below the offscreen one, so this rescues large screenshots that the loop
// above gives up on. Async because the only way out is a Blob.
async function _drawToBase64Offscreen(src, w, h){
  if (typeof OffscreenCanvas !== 'function') throw new Error('no-offscreen');
  let lastErr;
  for (const edge of IMG_FALLBACK_EDGES) {
    const [dw, dh] = _fitted(w, h, edge);
    try {
      const cv = new OffscreenCanvas(dw, dh);
      const ctx = cv.getContext('2d');
      if (!ctx) throw new Error('no-2d-context');
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, dw, dh);
      ctx.drawImage(src, 0, 0, dw, dh);
      if (typeof cv.convertToBlob !== 'function') throw new Error('no-convertToBlob');
      const blob = await cv.convertToBlob({ type: 'image/jpeg', quality: IMG_QUALITY });
      const payload = _jpegPayload(await _fileToDataUrl(blob));
      if (!payload) throw new Error('offscreen-empty');
      return payload;
    } catch(e) { lastErr = e; }
  }
  throw lastErr || new Error('offscreen-failed');
}

// Element canvas first, OffscreenCanvas as the backstop — their size limits
// differ, and only one of them failing is the common case.
async function _rasterize(src, w, h){
  try { return _drawToBase64(src, w, h); }
  catch(e) { return await _drawToBase64Offscreen(src, w, h); }
}

// 1) createImageBitmap — the widest format coverage (HEIC where the platform
//    supports it, AVIF, WebP) and no data-URL round-trip.
async function _decodeViaBitmap(file){
  if (typeof createImageBitmap !== 'function') throw new Error('no-createImageBitmap');
  const bmp = await createImageBitmap(file);
  try { return await _rasterize(bmp, bmp.width, bmp.height); }
  finally { bmp.close?.(); }
}

// 2) The classic <img> decoder, from a data URL or a blob URL.
function _decodeViaImage(src){
  return new Promise((resolve, reject) => {
    const img = new Image();
    // Long enough for a 50 MP PNG on a slow phone, short enough not to hang.
    const bail = setTimeout(() => reject(new Error('decode-timeout')), 20000);
    img.onload = () => {
      clearTimeout(bail);
      _rasterize(img, img.naturalWidth || IMG_MAX_EDGE, img.naturalHeight || IMG_MAX_EDGE).then(resolve, reject);
    };
    img.onerror = () => { clearTimeout(bail); reject(new Error('decode-failed')); };
    img.src = src;
  });
}

// 3) A blob URL skips the base64 round-trip entirely, which matters once the
//    data URL alone would be tens of megabytes.
async function _decodeViaBlobUrl(file){
  if (!(file instanceof Blob) || typeof URL?.createObjectURL !== 'function') throw new Error('no-blob-url');
  const url = URL.createObjectURL(file);
  try { return await _decodeViaImage(url); }
  finally { URL.revokeObjectURL(url); }
}

// Decode + downscale any picked image for the API.
//
// Four decode paths are attempted before giving up, because "the browser can
// display it" and "an <img> can decode it into a canvas of that size" are not
// the same set. Large screenshots, HEIC from iPhones and exotic types all used
// to land in the same dead end and the picture was refused outright.
//
// Returns { data, mime } — the two always belong together. Declaring the wrong
// MIME is not a cosmetic mistake: the API rejects a payload whose bytes do not
// match the type it was told to expect, which is exactly how re-encoded PNG
// screenshots ended up being refused as invalid images.
const _encMime = new WeakMap();   // File -> MIME actually produced

async function encodeImage(file){
  // Reuse the dataURL only when called with the exact same File the photo tab
  // already read (phDataUrl belongs to phFile). Without this guard a barcode
  // scan after picking a photo would analyse the stale photo instead.
  const canReuse = (typeof phFile !== 'undefined') && file && file === phFile
                && (typeof phDataUrl !== 'undefined') && phDataUrl;
  const errs = [];
  const done = (data, mime) => {
    try { if (file && typeof file === 'object') _encMime.set(file, mime); } catch(e) {}
    return { data, mime };
  };

  if (!canReuse) {
    try { return done(await _decodeViaBitmap(file), 'image/jpeg'); } catch(e) { errs.push('bitmap:' + (e?.message || e)); }
    try { return done(await _decodeViaBlobUrl(file), 'image/jpeg'); } catch(e) { errs.push('blob:' + (e?.message || e)); }
  }

  let dataUrl;
  try { dataUrl = canReuse ? phDataUrl : await _fileToDataUrl(file); }
  catch(e) { throw new Error(t('err_file_open')); }

  try { return done(await _decodeViaImage(dataUrl), 'image/jpeg'); } catch(e) { errs.push('img:' + (e?.message || e)); }

  // Nothing could re-encode it. If the bytes are already a type the API takes,
  // hand them over untouched rather than refusing the picture — but send the
  // type the *bytes* say they are, not the one the file picker claimed.
  const raw = String(dataUrl).split(',')[1] || '';
  const declared = dataUrlMime(dataUrl);
  const sniffed = _sniffMime(_b64Head(raw));
  const type = sniffed || declared;
  if (IMG_RAW_OK.test(type) && raw && raw.length <= IMG_RAW_MAX_BYTES) return done(raw, type);

  try { if (window._devErrors) window._devErrors.push('image decode failed — ' + errs.join(' | ')); } catch(e) {}
  if (raw.length > IMG_RAW_MAX_BYTES) throw new Error(t('err_photo_too_big'));
  // Not an image at all (a PDF or a document picked through "All files") is a
  // different problem from an image we could not read, and saying so saves the
  // user from retrying the same file.
  throw new Error(type && !/^image\//.test(type) ? t('err_photo_not_image') : t('err_photo_unsupported'));
}

// Bare-base64 form, for the call sites that only need the payload.
async function b64(file){ return (await encodeImage(file)).data; }

// MIME type to declare for a payload produced by b64(). The value recorded by
// encodeImage() wins; the heuristic below is only for a file that has not been
// encoded yet.
function b64Mime(file){
  try { if (file && _encMime.has(file)) return _encMime.get(file); } catch(e) {}
  const t2 = (file && file.type || '').toLowerCase();
  return IMG_RAW_OK.test(t2) && !/^image\/(jpeg|jpg)$/.test(t2) ? t2 : 'image/jpeg';
}

function pj(raw){
  if(!raw||!raw.trim()) throw new Error(t('err_analyze'));
  let c=raw.trim();
  // Strip markdown code fences (```json ... ``` or just ``` ... ```), incl. unicode backticks
  c=c.replace(/[`\u2018\u2019\u201B\u02CB\uFF40]{3,}\s*json/gi,'')
     .replace(/[`\u2018\u2019\u201B\u02CB\uFF40]{3,}/g,'')
     .replace(/^[`\u2018\u2019\u201B\u02CB\uFF40]+|[`\u2018\u2019\u201B\u02CB\uFF40]+$/g,'')
     .trim();
  // Find outermost JSON object via balanced-brace match (handles trailing prose).
  const start=c.indexOf('{');
  if(start===-1) throw new Error(t('photo_parse_error'));
  let depth=0, end=-1, inStr=false, esc=false;
  for(let i=start;i<c.length;i++){
    const ch=c[i];
    if(esc){ esc=false; continue; }
    if(ch==='\\'){ esc=true; continue; }
    if(ch==='"'){ inStr=!inStr; continue; }
    if(inStr) continue;
    if(ch==='{') depth++;
    else if(ch==='}'){ depth--; if(depth===0){ end=i; break; } }
  }
  let candidate;
  if(end!==-1){
    candidate=c.slice(start,end+1);
  } else {
    // Truncated JSON: try to repair by closing open braces/strings.
    candidate=c.slice(start);
    if(inStr) candidate+='"';
    while(depth-->0) candidate+='}';
  }
  const tryParse=(s)=>{ try{ return JSON.parse(s); } catch(e){ return null; } };
  let obj=tryParse(candidate);
  if(!obj){
    const fixed=candidate
      .replace(/,\s*}/g,'}').replace(/,\s*]/g,']')
      .replace(/[\u201C\u201D]/g,'"').replace(/[\u2018\u2019]/g,"'")
      .replace(/[\u00A0]/g,' ');
    obj=tryParse(fixed);
  }
  if(!obj){
    // Last attempt: drop a trailing partial value after the last comma.
    const cut=candidate.replace(/,[^,}\]]*$/,'');
    obj=tryParse(cut.endsWith('}')?cut:cut+'}');
  }
  if(!obj) throw new Error(t('photo_parse_error'));
  // Ensure numeric fields
  ['calories','protein','fat','carbs'].forEach(k=>{
    if(typeof obj[k]==='string') obj[k]=parseFloat(obj[k])||0;
    if(typeof obj[k]!=='number'||isNaN(obj[k])) obj[k]=0;
  });
  if(!obj.food) obj.food=t('h_dish');
  return obj;
}

// API modal
