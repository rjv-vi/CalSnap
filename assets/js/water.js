// ══════════════════════════════════════════════════
// WATER BALANCE
// ══════════════════════════════════════════════════
// Drink data — `name` resolved via t() at render time so it follows the current language.
const _DRINKS_BASE = [
  { id:'water',  icon:'💧', i18n:'drink_water',  ml:250, hydration:1.0,  kcal:0,   prot:0,  fat:0,   carb:0   },
  { id:'tea',    icon:'🍵', i18n:'drink_tea',    ml:200, hydration:0.9,  kcal:2,   prot:0,  fat:0,   carb:0.4 },
  { id:'coffee', icon:'☕', i18n:'drink_coffee', ml:150, hydration:0.6,  kcal:5,   prot:0.3,fat:0.1, carb:0   },
  { id:'juice',  icon:'🧃', i18n:'drink_juice',  ml:200, hydration:0.85, kcal:90,  prot:0.5,fat:0.1, carb:21  },
  { id:'milk',   icon:'🥛', i18n:'drink_milk',   ml:200, hydration:0.9,  kcal:120, prot:6,  fat:4,   carb:9   },
  { id:'other',  icon:'🫗', i18n:'drink_other',  ml:200, hydration:0.8,  kcal:0,   prot:0,  fat:0,   carb:0   },
];
function getDrinks(){ return _DRINKS_BASE.map(d => ({...d, name: t(d.i18n)})); }
// Backward-compatible iterable so `DRINKS.find(...)` / `.map(...)` keep working.
const DRINKS = new Proxy(_DRINKS_BASE, {
  get(target, prop){
    if (prop === 'find')   return (fn) => getDrinks().find(fn);
    if (prop === 'filter') return (fn) => getDrinks().filter(fn);
    if (prop === 'map')    return (fn) => getDrinks().map(fn);
    if (prop === 'forEach')return (fn) => getDrinks().forEach(fn);
    if (prop === 'length') return _DRINKS_BASE.length;
    if (typeof prop === 'string' && /^\d+$/.test(prop)){
      const idx = +prop;
      const d = _DRINKS_BASE[idx];
      return d ? {...d, name: t(d.i18n)} : undefined;
    }
    return target[prop];
  }
});


function _updateMiniWater(dateStr) {
  const row = document.getElementById('miniWaterRow');
  // Water tracking is opt-in — hide the Home widget entirely when it's off.
  if (!isWaterOn()) {
    if (row) row.style.display = 'none';
    return;
  }
  if (row) row.style.display = '';
  // Respect whichever day is selected on Home (calendar strip), same as
  // the calorie ring does — otherwise this always showed today's water
  // even while browsing a past day's food log.
  const targetDate = dateStr || ds();
  const isToday = targetDate === ds();
  const arr = getWaterToday(targetDate);
  const total = arr.reduce((s,e) => s + e.ml, 0);
  const goal = getWaterGoal().adjusted;
  const pct = Math.min(total / goal * 100, 100);
  const fillEl = document.getElementById('miniWaterFill');
  const labelEl = document.getElementById('miniWaterLabel');
  if (fillEl) fillEl.style.width = pct + '%';
  if (labelEl) labelEl.textContent = total + ' / ' + goal + ' ' + t('water_ml');
  // Past-day view is read-only — the button still opens Progress, but
  // dim it slightly so it doesn't look like "today" data.
  if (row) row.style.opacity = isToday ? '1' : '.6';
}

function getWaterGoal() {
  const base = Math.round((U?.w||70) * 30 / 50) * 50;
  const goal = Math.max(1500, Math.min(3500, base));
  const saltWords = ['чипсы','соленый','соль','рыба','сыр','колбаса','пицца','бургер','хот-дог','соевый','рамен'];
  const hasSalt = dlog(ds()).some(i => saltWords.some(s => (i.food||'').toLowerCase().includes(s)));
  return { goal, hasSalt, adjusted: hasSalt ? Math.round(goal * 1.2 / 50) * 50 : goal };
}

function getWaterToday(dateStr) {
  try { return JSON.parse(G('water_'+(dateStr||ds()),'[]')); } catch(e) { return []; }
}

function addWater(drinkId) {
  const drink = DRINKS.find(d => d.id === drinkId);
  if(!drink) return;
  const arr = getWaterToday();
  arr.push({ id: drinkId, ml: drink.ml, t: tnow() });
  S('water_'+ds(), JSON.stringify(arr));
  // For caloric drinks — also add to food log
  if(drink.kcal > 0) {
    const _ml = t('water_ml');
    const entry = {
      food: drink.name + ' ' + drink.ml + ' ' + _ml,
      portion: drink.ml + ' ' + _ml,
      kcal: drink.kcal, prot: drink.prot, fat: drink.fat, carb: drink.carb,
      time: tnow(), date: ds(),
      isDrink: true, drinkId: drinkId
    };
    log.unshift(entry);
    S('log', JSON.stringify(log));
    rH();
  }
  const _prevW = getWaterToday().reduce((s,x)=>s+(x.ml||0),0) - drink.ml;
  const _wGoal = getWaterGoal().goal;
  if(_prevW + drink.ml >= _wGoal && _prevW < _wGoal){ HFX.success(); SFX.play('water_goal'); }
  else { HFX.success(); SFX.play('water_add'); }
  rWater();
}

function undoLastWater() {
  const arr = getWaterToday();
  if(!arr.length) return;
  arr.pop();
  S('water_'+ds(), JSON.stringify(arr));
  HFX.light(); SFX.play('water_undo');
  rWater();
}

// Custom water amount via slider modal
function openWaterCustom(){
  HFX.light(); SFX.play('sheet_open');
  let ov = document.getElementById('waterCustomOv');
  if (!ov) {
    ov = document.createElement('div');
    ov.id = 'waterCustomOv';
    ov.className = 'modal-ov';
    ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.45);display:flex;align-items:flex-end;justify-content:center;z-index:9000;-webkit-backdrop-filter:blur(8px);backdrop-filter:blur(8px);opacity:0;transition:opacity .22s';
    ov.innerHTML = `
      <div id="waterCustomCard" style="width:100%;max-width:480px;background:var(--bg1);border-top-left-radius:24px;border-top-right-radius:24px;padding:22px 22px calc(22px + env(safe-area-inset-bottom));transform:translateY(20px);transition:transform .26s cubic-bezier(.22,.68,0,1);box-shadow:var(--s4)">
        <div style="display:flex;justify-content:center;margin-bottom:14px"><div style="width:42px;height:4px;border-radius:2px;background:var(--t3)"></div></div>
        <div style="font-size:18px;font-weight:800;color:var(--t0);margin-bottom:4px">${t('water_custom')}</div>
        <div style="font-size:13px;color:var(--t1);margin-bottom:18px">${t('water_drink')}</div>
        <div style="display:flex;align-items:baseline;justify-content:center;gap:6px;margin-bottom:8px">
          <div id="waterCustomVal" style="font-size:48px;font-weight:900;color:var(--t0);letter-spacing:-1.5px">250</div>
          <div style="font-size:18px;color:var(--t1);font-weight:700">${t('water_ml')}</div>
        </div>
        <input id="waterCustomSlider" type="range" min="50" max="1000" step="10" value="250" style="width:100%;margin:6px 0 18px;accent-color:var(--blue,#1D4ED8)">
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:18px">
          ${[100,200,300,500,750].map(v=>`<button onclick="_setWaterCustom(${v})" style="flex:1;min-width:64px;background:var(--f1);border:none;border-radius:12px;padding:10px;font-size:13px;font-weight:700;color:var(--t0);cursor:pointer">${v}</button>`).join('')}
        </div>
        <div style="display:flex;gap:10px">
          <button class="btn2" onclick="closeWaterCustom()" style="flex:1">${t('cancel')}</button>
          <button class="btn" onclick="addWaterCustom()" style="flex:1.5">${t('add_in_diary')}</button>
        </div>
      </div>`;
    document.body.appendChild(ov);
    ov.querySelector('#waterCustomSlider').addEventListener('input', (e)=>{
      document.getElementById('waterCustomVal').textContent = e.target.value;
    });
    ov.addEventListener('click', (e)=>{ if(e.target===ov) closeWaterCustom(); });
  }
  requestAnimationFrame(()=>{
    ov.style.opacity = '1';
    document.getElementById('waterCustomCard').style.transform = 'translateY(0)';
  });
  document.body.style.overflow = 'hidden';
}
function _setWaterCustom(v){
  document.getElementById('waterCustomSlider').value = String(v);
  document.getElementById('waterCustomVal').textContent = String(v);
  HFX.light(); SFX.play('select');
}
function closeWaterCustom(){
  const ov = document.getElementById('waterCustomOv'); if(!ov) return;
  HFX.light(); SFX.play('sheet_close');
  ov.style.opacity = '0';
  document.getElementById('waterCustomCard').style.transform = 'translateY(20px)';
  document.body.style.overflow = '';
  setTimeout(()=>{ ov.remove(); }, 240);
}
function addWaterCustom(){
  const v = parseInt(document.getElementById('waterCustomSlider').value || '250');
  const arr = getWaterToday();
  arr.push({ id: 'water', ml: v, t: tnow() });
  S('water_'+ds(), JSON.stringify(arr));
  const _prevW = arr.reduce((s,x)=>s+(x.ml||0),0) - v;
  const _wGoal = getWaterGoal().goal;
  if(_prevW + v >= _wGoal && _prevW < _wGoal){ HFX.success(); SFX.play('water_goal'); }
  else { HFX.success(); SFX.play('water_add'); }
  closeWaterCustom();
  rWater();
}

function rWater() {
  if(!U) return;
  const card = document.getElementById('waterCard');
  // Water tracking is opt-in — hide the Progress widget entirely when it's off.
  if (!isWaterOn()) {
    if (card) card.style.display = 'none';
    return;
  }
  if (card) card.style.display = '';
  const { goal, hasSalt, adjusted } = getWaterGoal();
  const arr = getWaterToday();
  const totalMl = arr.reduce((s,e) => s+e.ml, 0);
  const hydrated = arr.reduce((s,e) => {
    const d = DRINKS.find(x => x.id === e.id);
    return s + e.ml * (d?.hydration||1);
  }, 0);
  const pct = Math.min(hydrated / adjusted, 1);

  // Animate number — bump
  const mlEl = document.getElementById('waterConsumedMl');
  if(mlEl){mlEl.classList.remove('bump');void mlEl.offsetWidth;mlEl.classList.add('bump');}
  if(mlEl) {
    const prev = parseInt(mlEl.dataset.val||0);
    const target = Math.round(totalMl);
    mlEl.dataset.val = target;
    if(prev !== target) {
      mlEl.style.transform = 'scale(1.15)';
      setTimeout(()=>{ mlEl.style.transform=''; }, 150);
    }
    mlEl.textContent = target;
  }
  const glEl = document.getElementById('waterGoalMl');
  if(glEl) glEl.textContent = adjusted;

  // Bar
  const barEl = document.getElementById('waterBar');
  if(barEl) {
    barEl.style.width = (pct*100)+'%';
    if(pct >= 1) barEl.style.background = 'linear-gradient(90deg,#4ade80,#22c55e)';
    else barEl.style.background = '';
  }

  // Ring
  const ringFill = document.getElementById('waterRingFill');
  const pctEl = document.getElementById('waterPct');
  if(ringFill) ringFill.style.strokeDashoffset = 188.5*(1-pct);
  if(pctEl) pctEl.textContent = Math.round(pct*100)+'%';

  // Salt hint
  const hint = document.getElementById('waterSaltHint');
  if(hint) {
    hint.classList.toggle('on', hasSalt);
    hint.textContent = t('water_salt_hint','🧂 Солёная еда — норма воды +20%') + ' (' + adjusted + ' ' + t('water_ml','мл') + ')';
  }

  // Drink buttons
  const dc = document.getElementById('waterDrinks');
  if(dc) {
    const items = DRINKS.map(d => {
      const count = arr.filter(e=>e.id===d.id).length;
      return `<div class="water-btn${count>0?' hit':''}" onclick="addWater('${d.id}')">
        ${count>0?`<div class="water-count">${count}</div>`:''}
        <span class="water-btn-icon">${d.icon}</span>
        <span class="water-btn-name">${d.name}</span>
        <span class="water-btn-ml">+${d.ml}</span>
      </div>`;
    }).join('');
    const customBtn = `<div class="water-btn" onclick="openWaterCustom()" style="border-style:dashed">
      <span class="water-btn-icon">➕</span>
      <span class="water-btn-name">${t('water_custom')}</span>
      <span class="water-btn-ml" style="opacity:.6">${t('water_ml')}</span>
    </div>`;
    dc.innerHTML = items + customBtn;
  }

  // History timeline
  const eventsEl = document.getElementById('waterEvents');
  if(eventsEl) {
    if(!arr.length) {
      eventsEl.innerHTML = `<div class="water-empty-hint">${t('water_empty')}</div>`;
    } else {
      eventsEl.innerHTML = arr.slice().reverse().slice(0,8).map((e,i) => {
        const d = DRINKS.find(x=>x.id===e.id)||DRINKS[0];
        return `<div class="water-event" style="animation-delay:${i*0.04}s">
          <span class="water-event-icon">${d.icon}</span>
          <span class="water-event-ml">${e.ml} ${t('water_ml')}</span>
          <span class="water-event-t">${e.t||''}</span>
        </div>`;
      }).join('');
    }
  }

  // Undo button
  const undoBtn = document.getElementById('waterUndoBtn');
  if(undoBtn) undoBtn.style.display = arr.length ? 'flex' : 'none';
}
