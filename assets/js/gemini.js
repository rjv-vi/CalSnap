let ALL_MODELS=[
  // ── Gemini 3.x (новейшие — из API) ──
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
const RECOMMENDED_MODEL_IDS = ['gemini-flash-lite-latest','gemini-flash-latest'];
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

// ── Model descriptions ────────────────────────────────────────────
// Derived from the model id so the picker follows the UI language. Entries
// fetched from the live API carry their own (English) description and keep it.
function _modelDescFor(m){
  if (m.fromApi && m.desc) return m.desc;
  if (m.desc) return m.desc;
  const id = m.id || '';
  const tier =
    /flash-lite/.test(id) ? '🪶 Flash Lite' :
    /flash/.test(id)      ? '⚡ Flash' :
    /\bpro\b|-pro/.test(id) ? '🏆 Pro' :
    /robotics/.test(id)   ? '🤖 Robotics' : '✨ Gemini';
  const ver = (id.match(/(\d+\.\d+|\d+)(?=[-.]|$)/) || [])[1] || '';
  const traits = [];
  if (/image/.test(id))        traits.push(t('mdl_images'));
  if (/audio/.test(id))        traits.push(t('mdl_audio'));
  if (/tts/.test(id))          traits.push(t('mdl_tts'));
  if (/thinking/.test(id))     traits.push(t('mdl_thinking'));
  if (/computer-use/.test(id)) traits.push(t('mdl_computer_use'));
  if (/-8b/.test(id))          traits.push(t('mdl_compact'));
  if (/\bexp\b|-exp/.test(id))traits.push(t('mdl_experimental'));
  else if (/preview/.test(id)) traits.push(t('mdl_preview'));
  else if (/latest/.test(id))  traits.push(t('mdl_latest'));
  else if (/-\d{3}$/.test(id)) traits.push(t('mdl_stable'));
  return [tier + (ver ? ' ' + ver : '')].concat(traits).join(' · ');
}

// Recommended models first, then the rest in their existing order.
function _sortedModelsForPicker(){
  const recommended = ALL_MODELS.filter(m => isRecommendedModel(m.id));
  const rest = ALL_MODELS.filter(m => !isRecommendedModel(m.id));
  return [...recommended, ...rest];
}

function _modelRowHtml(m){
  const badge = isRecommendedModel(m.id)
    ? `<span style="display:inline-block;margin-left:6px;padding:2px 7px;border-radius:8px;font-size:10px;font-weight:800;letter-spacing:.2px;background:${m.id===selModel?'color-mix(in srgb,var(--on-acc) 22%,transparent)':'var(--acc)'};color:var(--on-acc);vertical-align:middle">${t('model_recommended')}</span>`
    : '';
  return `
    <div onclick="HFX.tick();SFX.play('select');selectModel('${m.id}')" style="
      padding:14px 16px;border-radius:14px;cursor:pointer;
      background:${m.id===selModel?'var(--acc)':'var(--bg0)'};
      border:1.5px solid ${m.id===selModel?'var(--acc)':'var(--b0)'};
      display:flex;justify-content:space-between;align-items:center;transition:all .15s">
      <div>
        <div style="font-size:14px;font-weight:700;color:${m.id===selModel?'var(--on-acc)':'var(--t0)'}">${esc(m.name)}${badge}</div>
        <div style="font-size:11px;margin-top:2px;color:${m.id===selModel?'color-mix(in srgb,var(--on-acc) 78%,transparent)':'var(--t1)'}">${esc(_modelDescFor(m))}</div>
      </div>
      ${m.id===selModel?'<span style="font-size:18px;color:var(--on-acc)">✓</span>':''}
    </div>
  `;
}

function openModelPicker(){
  const ov=document.getElementById('mdlOv');
  const list=document.getElementById('mdlList');
  const cnt=document.getElementById('mdlCount');
  if(cnt) cnt.textContent=tf('mdl_count',{n:ALL_MODELS.length});
  // Add search box
  const searchBox = document.getElementById('mdlSearch');
  if(searchBox){ searchBox.value=''; }
  const renderModels = (filter='') => {
    const source = _sortedModelsForPicker();
    const filtered = filter ? source.filter(m=>m.name.toLowerCase().includes(filter.toLowerCase())||m.id.toLowerCase().includes(filter.toLowerCase())) : source;
    list.innerHTML=filtered.map(_modelRowHtml).join('');
  };
  renderModels();
  ov.style.display='flex';
  ov.style.animation='ovIn .18s ease';
  lockScroll(true);
  if(searchBox){ searchBox.oninput=e=>renderModels(e.target.value); }
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
  // Re-render list
  const list=document.getElementById('mdlList');
  if(list) list.innerHTML=_sortedModelsForPicker().map(_modelRowHtml).join('');
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
async function b64(file){
  // Reuse the dataURL only when called with the exact same File the photo
  // tab already read (phDataUrl belongs to phFile). Without this guard a
  // barcode scan after picking a photo would analyse the stale photo
  // instead of the barcode image.
  const _canReuse = (typeof phFile !== 'undefined') && file && file === phFile && (typeof phDataUrl !== 'undefined') && phDataUrl;
  const dataUrl = _canReuse ? phDataUrl : await new Promise((res,rej)=>{
    const fr=new FileReader();
    fr.onload=()=>res(fr.result);
    fr.onerror=()=>rej(new Error(t('err_file_open')));
    fr.readAsDataURL(file);
  });
  // Resize via canvas and return pure base64
  return new Promise((resolve,reject)=>{
    const img=new Image();
    img.onload=()=>{
      try{
        const MAX=1024;
        let w=img.naturalWidth,h=img.naturalHeight;
        if(w>MAX||h>MAX){
          if(w>h){h=Math.round(h*MAX/w);w=MAX;}
          else{w=Math.round(w*MAX/h);h=MAX;}
        }
        const cv=document.createElement('canvas');
        cv.width=w;cv.height=h;
        cv.getContext('2d').drawImage(img,0,0,w,h);
        resolve(cv.toDataURL('image/jpeg',0.85).split(',')[1]);
      }catch(e){reject(new Error('Canvas: '+e.message));}
    };
    img.onerror=()=>reject(new Error(t('err_file_open')));
    img.src=dataUrl;
  });
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
