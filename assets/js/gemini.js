// ── MEAL CATEGORY ──
// ── RECENT FOODS ──

function getRecents(){try{return JSON.parse(G('recents','[]'));}catch(e){return [];}}



// ── FAVORITES ──

let ALL_MODELS=[
  // ── Gemini 3.x (новейшие — из API) ──
  {id:'gemini-3.1-pro-preview-customtools',   name:'Gemini 3.1 Pro Preview Customtools', desc:'🔧 Pro с кастомными инструментами'},
  {id:'gemini-3.1-pro-preview',               name:'Gemini 3.1 Pro Preview',             desc:'🏆 Pro 3.1 новейший'},
  {id:'gemini-3.1-flash-image-preview',       name:'Gemini 3.1 Flash Image Preview',     desc:'🖼️ Flash 3.1 · Изображения'},
  {id:'gemini-3.1-flash-lite-preview',        name:'Gemini 3.1 Flash Lite Preview',      desc:'⚡ Flash Lite 3.1'},
  {id:'gemini-3-flash-preview',               name:'Gemini 3 Flash Preview',             desc:'✨ Flash нового поколения'},
  {id:'gemini-3-pro-preview',                 name:'Gemini 3 Pro Preview',               desc:'🏆 Pro 3 · Топ качество'},
  {id:'gemini-3-pro-image-preview',           name:'Gemini 3 Pro Image Preview',         desc:'🖼️ Pro с изображениями'},
  // ── Latest aliases ──
  {id:'gemini-flash-latest',                  name:'Gemini Flash Latest',                desc:'⚡ Flash · Последняя версия'},
  {id:'gemini-flash-lite-latest',             name:'Gemini Flash Lite Latest',           desc:'⚡ Flash Lite · Последняя'},
  {id:'gemini-pro-latest',                    name:'Gemini Pro Latest',                  desc:'💎 Pro · Последняя версия'},
  {id:'gemini-2.5-flash-latest',             name:'Gemini 2.5 Flash Latest',            desc:'⚡ Flash 2.5 · Последняя'},
  {id:'gemini-2.5-pro-latest',               name:'Gemini 2.5 Pro Latest',              desc:'🏆 Pro 2.5 · Последняя'},
  // ── Gemini 2.5 ──
  {id:'gemini-2.5-pro',                       name:'Gemini 2.5 Pro',                    desc:'🏆 Pro 2.5 стабильный'},
  {id:'gemini-2.5-flash',                     name:'Gemini 2.5 Flash',                  desc:'⚡ Flash 2.5 стабильный'},
  {id:'gemini-2.5-flash-lite',                name:'Gemini 2.5 Flash Lite',             desc:'🪶 Flash Lite 2.5'},
  {id:'gemini-2.5-flash-lite-preview-06-17',  name:'Gemini 2.5 Flash Lite Preview',     desc:'⚡ Flash Lite · Рекомендован'},
  {id:'gemini-2.5-flash-lite-preview-09-2025',name:'Gemini 2.5 Flash Lite Preview Sep', desc:'⚡ Flash Lite Sep 2025'},
  {id:'gemini-2.5-flash-preview-05-20',       name:'Gemini 2.5 Flash Preview May',      desc:'✨ Flash Preview май'},
  {id:'gemini-2.5-flash-preview-04-17',       name:'Gemini 2.5 Flash Preview Apr',      desc:'✨ Flash Preview апрель'},
  {id:'gemini-2.5-flash-image',               name:'Gemini 2.5 Flash Image',            desc:'🖼️ Flash с поддержкой изображений'},
  {id:'gemini-2.5-flash-native-audio-latest', name:'Gemini 2.5 Flash Native Audio',     desc:'🔊 Flash с нативным аудио'},
  {id:'gemini-2.5-flash-native-audio-preview-09-2025',name:'Gemini 2.5 Flash Audio Preview Sep',desc:'🔊 Flash Audio Sep 2025'},
  {id:'gemini-2.5-flash-native-audio-preview-12-2025',name:'Gemini 2.5 Flash Audio Preview Dec',desc:'🔊 Flash Audio Dec 2025'},
  {id:'gemini-2.5-flash-preview-tts',         name:'Gemini 2.5 Flash Preview TTS',      desc:'🗣️ Flash с синтезом речи'},
  {id:'gemini-2.5-pro-preview-06-05',         name:'Gemini 2.5 Pro Preview Jun',        desc:'🏆 Pro Preview июнь'},
  {id:'gemini-2.5-pro-preview-05-06',         name:'Gemini 2.5 Pro Preview May',        desc:'🏆 Pro Preview май'},
  {id:'gemini-2.5-pro-preview-03-25',         name:'Gemini 2.5 Pro Preview Mar',        desc:'🏆 Pro Preview март'},
  {id:'gemini-2.5-pro-exp-03-25',             name:'Gemini 2.5 Pro Experimental',       desc:'🔬 Pro Experimental'},
  {id:'gemini-2.5-pro-preview-tts',           name:'Gemini 2.5 Pro Preview TTS',        desc:'🗣️ Pro с синтезом речи'},
  {id:'gemini-2.5-computer-use-preview-10-2025',name:'Gemini 2.5 Computer Use Preview', desc:'🖥️ Управление компьютером'},
  // ── Gemini 2.0 ──
  {id:'gemini-2.0-flash',                     name:'Gemini 2.0 Flash',                  desc:'🧠 Flash 2.0 · Надёжный'},
  {id:'gemini-2.0-flash-001',                 name:'Gemini 2.0 Flash 001',              desc:'📌 Flash 2.0 стабильный'},
  {id:'gemini-2.0-flash-lite',                name:'Gemini 2.0 Flash Lite',             desc:'🔹 Flash Lite 2.0'},
  {id:'gemini-2.0-flash-lite-001',            name:'Gemini 2.0 Flash Lite 001',         desc:'📌 Flash Lite 2.0 стабильный'},
  {id:'gemini-2.0-flash-thinking-exp-01-21',  name:'Gemini 2.0 Flash Thinking',         desc:'🤔 Думающая модель'},
  {id:'gemini-2.0-flash-exp-image-generation',name:'Gemini 2.0 Flash Exp Image Gen',    desc:'🖼️ Генерация изображений'},
  {id:'gemini-2.0-pro-exp-02-05',             name:'Gemini 2.0 Pro Experimental',       desc:'🔬 Pro 2.0 экспериментальный'},
  // ── Gemini 1.5 ──
  {id:'gemini-1.5-pro',                       name:'Gemini 1.5 Pro',                    desc:'💎 Pro 1.5 · Мощный'},
  {id:'gemini-1.5-pro-001',                   name:'Gemini 1.5 Pro 001',                desc:'📌 Pro 1.5 стабильный'},
  {id:'gemini-1.5-pro-002',                   name:'Gemini 1.5 Pro 002',                desc:'📌 Pro 1.5 v2'},
  {id:'gemini-1.5-flash',                     name:'Gemini 1.5 Flash',                  desc:'⚡ Flash 1.5'},
  {id:'gemini-1.5-flash-001',                 name:'Gemini 1.5 Flash 001',              desc:'📌 Flash 1.5 стабильный'},
  {id:'gemini-1.5-flash-002',                 name:'Gemini 1.5 Flash 002',              desc:'📌 Flash 1.5 v2'},
  {id:'gemini-1.5-flash-8b',                  name:'Gemini 1.5 Flash 8B',               desc:'🪶 Компактный 8B'},
  {id:'gemini-1.5-flash-8b-001',              name:'Gemini 1.5 Flash 8B 001',           desc:'📌 8B стабильный'},
  // ── Robotics ──
  {id:'gemini-robotics-er-1.5-preview',       name:'Gemini Robotics Er 1.5 Preview',    desc:'🤖 Роботика · Preview'},
];
let selModel=localStorage.getItem('model')||'gemini-2.5-flash-lite-preview-06-17';
const MODELS=[selModel,'gemini-2.5-flash-lite-preview-06-17','gemini-2.0-flash-lite','gemini-2.0-flash'].filter((v,i,a)=>a.indexOf(v)===i);

// Fetch all available models from Gemini API
async function fetchGeminiModels(){
  if(!key) return;
  try{
    const r=await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${key}&pageSize=100`);
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
        return {id, name:dname, desc:m.description?.split('.')[0]?.substring(0,50)||''};
      })
      .sort((a,b)=>a.name.localeCompare(b.name));
    if(fresh.length>0){
      ALL_MODELS=fresh;
      console.log('Loaded',fresh.length,'models from API');
    }
  }catch(e){console.log('Model fetch failed:',e.message);}
}

function openModelPicker(){
  const ov=document.getElementById('mdlOv');
  const list=document.getElementById('mdlList');
  const cnt=document.getElementById('mdlCount');
  if(cnt) cnt.textContent=`${ALL_MODELS.length} моделей · свайп для прокрутки`;
  // Add search box
  const searchBox = document.getElementById('mdlSearch');
  if(searchBox){ searchBox.value=''; }
  const renderModels = (filter='') => {
    const filtered = filter ? ALL_MODELS.filter(m=>m.name.toLowerCase().includes(filter.toLowerCase())||m.id.toLowerCase().includes(filter.toLowerCase())) : ALL_MODELS;
    list.innerHTML=filtered.map(m=>`
    <div onclick="HFX.tick();SFX.play('select');selectModel('${m.id}')" style="
      padding:14px 16px;border-radius:14px;cursor:pointer;
      background:${m.id===selModel?'var(--acc)':'var(--bg0)'};
      border:1.5px solid ${m.id===selModel?'var(--acc)':'var(--b0)'};
      display:flex;justify-content:space-between;align-items:center;transition:all .15s">
      <div>
        <div style="font-size:14px;font-weight:700;color:${m.id===selModel?'#fff':'var(--t0)'}">${m.name}</div>
        <div style="font-size:11px;margin-top:2px;color:${m.id===selModel?'rgba(255,255,255,0.8)':'var(--t1)'}">${m.desc}</div>
      </div>
      ${m.id===selModel?'<span style="font-size:18px;color:#fff">✓</span>':''}
    </div>
  `).join('');
  };
  renderModels();
  ov.style.display='flex';
  ov.style.animation='ovIn .18s ease';
  if(searchBox){ searchBox.oninput=e=>renderModels(e.target.value); }
}

function selectModel(id){
  selModel=id;
  localStorage.setItem('model',id);
  // Update MODELS array to put selected first
  MODELS.length=0;
  [id,'gemini-2.5-flash-lite-preview-06-17','gemini-2.0-flash-lite','gemini-2.0-flash'].filter((v,i,a)=>a.indexOf(v)===i).forEach(m=>MODELS.push(m));
  document.getElementById('smodel').textContent=ALL_MODELS.find(m=>m.id===id)?.name||id;
  document.getElementById('mdlOv').style.display='none';
  // Re-render list
  const list=document.getElementById('mdlList');
  list.innerHTML=ALL_MODELS.map(m=>`
    <div onclick="HFX.tick();SFX.play('select');selectModel('${m.id}')" style="
      padding:14px 16px;border-radius:14px;cursor:pointer;
      background:${m.id===selModel?'var(--acc)':'var(--bg0)'};
      border:1.5px solid ${m.id===selModel?'var(--acc)':'var(--b0)'};
      display:flex;justify-content:space-between;align-items:center">
      <div>
        <div style="font-size:14px;font-weight:700;color:${m.id===selModel?'#fff':'var(--t0)'}">${m.name}</div>
        <div style="font-size:11px;margin-top:2px;color:${m.id===selModel?'rgba(255,255,255,0.8)':'var(--t1)'}">${m.desc}</div>
      </div>
      ${m.id===selModel?'<span style="font-size:18px;color:#fff">✓</span>':''}
    </div>
  `).join('');
}
async function gem(parts,sys='',opts={}){
  if(!key) throw new Error('API ключ не установлен. Добавь в Настройках → API');
  const models=[selModel,'gemini-2.5-flash-lite-preview-06-17','gemini-2.0-flash-lite','gemini-2.0-flash'].filter((v,i,a)=>a.indexOf(v)===i);
  let lastErr;
  for(const m of models){
    try{
      const generationConfig={temperature:opts.temperature ?? 0.2, maxOutputTokens:opts.maxOutputTokens ?? 2048};
      if(opts.json) generationConfig.responseMimeType='application/json';
      const body={contents:[{parts}],generationConfig};
      if(sys)body.system_instruction={parts:[{text:sys}]};
      // No AbortSignal — SW structured clone fails with it
      const r=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent?key=${key}`,
        {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
      if(r.ok){
        const d=await r.json();
        const tx=d.candidates?.[0]?.content?.parts?.[0]?.text||'';
        if(!tx) throw new Error('Пустой ответ');
        return tx;
      }
      const er=await r.json().catch(()=>({}));
      const code=r.status;
      if(code===400) lastErr='Неверный API ключ';
      else if(code===429) lastErr='Превышен лимит запросов — подожди минуту';
      else if(code===403) lastErr='Доступ запрещён — проверь API ключ';
      else lastErr=er.error?.message||`Ошибка ${code}`;
    }catch(e){
      const isLocal=location.protocol==='file:'||location.protocol==='content:'||location.hostname==='';
      if(e.message==='Failed to fetch'||e.name==='TypeError'){
        lastErr=isLocal?'Открой приложение через GitHub Pages, а не как локальный файл':'Нет соединения с Gemini API';
      } else {
        lastErr=e.name==='AbortError'?'Таймаут — проверь интернет':(e.message||'Сетевая ошибка');
      }
    }
  }
  throw new Error(lastErr||'Ошибка Gemini API');
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
    fr.onerror=()=>rej(new Error('Ошибка чтения файла'));
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
    img.onerror=()=>reject(new Error('Ошибка обработки изображения'));
    img.src=dataUrl;
  });
}
function pj(raw){
  if(!raw||!raw.trim()) throw new Error('Пустой ответ');
  let c=raw.trim();
  // Strip markdown code fences (```json ... ``` or just ``` ... ```), incl. unicode backticks
  c=c.replace(/[`\u2018\u2019\u201B\u02CB\uFF40]{3,}\s*json/gi,'')
     .replace(/[`\u2018\u2019\u201B\u02CB\uFF40]{3,}/g,'')
     .replace(/^[`\u2018\u2019\u201B\u02CB\uFF40]+|[`\u2018\u2019\u201B\u02CB\uFF40]+$/g,'')
     .trim();
  // Find outermost JSON object via balanced-brace match (handles trailing prose).
  const start=c.indexOf('{');
  if(start===-1) throw new Error('JSON не найден в ответе');
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
  if(!obj) throw new Error('Не удалось разобрать JSON');
  // Ensure numeric fields
  ['calories','protein','fat','carbs'].forEach(k=>{
    if(typeof obj[k]==='string') obj[k]=parseFloat(obj[k])||0;
    if(typeof obj[k]!=='number'||isNaN(obj[k])) obj[k]=0;
  });
  if(!obj.food) obj.food='Блюдо';
  return obj;
}

// API modal
