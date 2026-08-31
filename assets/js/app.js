// ── MEAL TIMELINE ──
function getMealType(timeStr) {
  if (!timeStr) return 'snack';
  const [h, m] = timeStr.split(':').map(Number);
  const mins = h * 60 + (m || 0);
  if (mins >= 360 && mins < 660)  return 'breakfast'; // 6:00–11:00
  if (mins >= 660 && mins < 840)  return 'lunch';     // 11:00–14:00
  if (mins >= 840 && mins < 1080) return 'snack';     // 14:00–18:00
  if (mins >= 1080)               return 'dinner';    // 18:00+
  return 'snack';
}
function mealMeta(){
  return {
    breakfast: { label: t('meal_breakfast'), icon: '🌅', color: 'var(--acc)' },
    lunch:     { label: t('meal_lunch'),     icon: '☀️', color: '#f97316' },
    snack:     { label: t('meal_snack'),     icon: '🍎', color: '#22c55e' },
    dinner:    { label: t('meal_dinner'),    icon: '🌙', color: '#818cf8' },
  };
}
// Backward-compat getter (some legacy code references MEAL_META object)
const MEAL_META = new Proxy({}, { get(_,k){ return mealMeta()[k]; } });

// Run a function the next idle frame (defers non-critical work off the
// main render path). Falls back to setTimeout when requestIdleCallback
// is unavailable (Safari).
const onIdle = (fn, timeout=300) => {
  if (typeof requestIdleCallback === 'function') return requestIdleCallback(fn, { timeout });
  return setTimeout(fn, 1);
};

function rH(){
  if(!U)return;
  const hr=new Date().getHours();
  const _gk = hr<6 ? 'greet_night' : hr<12 ? 'greet_morning' : hr<18 ? 'greet_day' : 'greet_evening';
  document.getElementById('greet').textContent=t(_gk);
  document.getElementById('hname').textContent=U.name+'!';
  document.getElementById('abar').style.display=hasApiKey()?'none':'flex';
  const _sk=streak();
  const _psk=parseInt(sessionStorage.getItem('_sk')||'0');
  if(_sk>_psk&&_psk>=0&&_sk>0){
    sessionStorage.setItem('_sk',_sk);
    if(_psk>0){
      SFX.play('streak_up'); HFX.success();
      // One-shot celebration: retrigger the animation by removing the class,
      // forcing a reflow, then adding it back.
      const _chip=document.querySelector('.streak');
      if(_chip){
        _chip.classList.remove('celebrate');
        void _chip.offsetWidth;
        _chip.classList.add('celebrate');
        setTimeout(()=>_chip.classList.remove('celebrate'),700);
      }
    }
  }
  document.getElementById('snum').textContent=_sk;
  // Agreeing noun — a fixed 'дней' rendered "1 дней".
  const _sl=document.querySelector('.streak .sl');
  if(_sl)_sl.textContent=fmtDaysWord(_sk);
  rCal();
  
  const activeDayStr=selDay||ds();
  const tl=dlog(activeDayStr),tt=tot(tl),g=U.kcal||2000;
  // Update section label
  const lbl=document.getElementById('dayLabel');
  if(lbl){
    if(selDay){
      const _sd=new Date(selDay);
      const _yd=new Date();_yd.setDate(_yd.getDate()-1);
      const _isYest=ds(_yd)===selDay;
      lbl.textContent=_isYest?t('label_yesterday'):_sd.toLocaleDateString(_localeTag(),{weekday:'short',day:'numeric',month:'long'});
    } else lbl.textContent=t('label_today');
  }
  const _pe=parseFloat(sessionStorage.getItem('_le')||'0');
  if(tt.k>=g&&_pe<g&&g>0){SFX.play('goal_reached');}
  sessionStorage.setItem('_le',tt.k);
  const pct=Math.min(tt.k/g,1);
  const ring=document.getElementById('hring');
  const C=2*Math.PI*33;
  ring.style.strokeDasharray=C;
  ring.style.strokeDashoffset=C*(1-pct);
  // Ring state: under goal → accent, goal met → green, clearly over → red.
  // The label carries the "done" signal so the ring itself stays a clean
  // stroke; the previous drop-shadow glow read as a rendering artefact.
  const _over = g>0 && tt.k>g*1.05;
  const _done = g>0 && tt.k>=g && !_over;
  ring.style.stroke = _over ? 'var(--err)' : _done ? 'var(--ok)' : 'var(--acc)';
  const _lbl = document.querySelector('.cc-ring-label');
  if(_lbl){
    const _wasDone = _lbl.classList.contains('done');
    _lbl.classList.toggle('done', _done);
    _lbl.classList.toggle('over', _over);
    // Celebrate only on the crossing, not on every re-render.
    if(_done && !_wasDone){
      _lbl.classList.remove('just-done'); void _lbl.offsetWidth; _lbl.classList.add('just-done');
      setTimeout(()=>_lbl.classList.remove('just-done'), 900);
    }
  }
  const _sub = document.querySelector('.cc-pct-s');
  if(_sub) _sub.textContent = _done ? t('hcc_pct_done') : t('hcc_pct_sub');
  tweenNumber(document.getElementById('hpct'), Math.round(pct*100), { suffix:'%', duration:480 });
  tweenNumber(document.getElementById('hkcal'), tt.k, { duration:520 });
  document.getElementById('hgoal').textContent=g;
  document.getElementById('hrem').textContent=tt.k<=g?tf('h_remaining',{n:g-tt.k}):tf('h_exceeded',{n:tt.k-g});
  const _g = t('unit_g');
  tweenNumber(document.getElementById('hprot'), tt.p, { suffix:_g, duration:420 });
  tweenNumber(document.getElementById('hcarb'), tt.c, { suffix:_g, duration:420 });
  tweenNumber(document.getElementById('hfat'),  tt.f, { suffix:_g, duration:420 });
  document.getElementById('hpg').textContent=(U.pr||0)+_g;
  document.getElementById('hcg').textContent=(U.cb||0)+_g;
  document.getElementById('hfg').textContent=(U.ft||0)+_g;
  document.getElementById('hpbar').style.width=Math.min(tt.p/(U.pr||100)*100,100)+'%';
  document.getElementById('hcbar').style.width=Math.min(tt.c/(U.cb||100)*100,100)+'%';
  document.getElementById('hfbar').style.width=Math.min(tt.f/(U.ft||100)*100,100)+'%';

  // Mini water — reflect whichever day is selected (matches the calorie ring above)
  _updateMiniWater(activeDayStr);
  try { renderQueue(); } catch(e) {}
  const logEl=document.getElementById('hlog');
  if(!tl.length){
    const wasEmpty=logEl.dataset.day===activeDayStr&&logEl.dataset.empty==='1';
    logEl.dataset.day=activeDayStr; logEl.dataset.empty='1';
    logEl.classList.toggle('no-anim', wasEmpty);
    logEl.innerHTML=`<div class="empty"><span class="ei">🥗</span><p>${t('h_tap_plus')}</p></div>`;
    return;
  }
  logEl.dataset.empty='0';

  // ── Group by meal type ──
  const mealOrder = ['breakfast','lunch','snack','dinner'];
  const groups = {};
  mealOrder.forEach(m => groups[m] = []);
  tl.forEach(item => {
    const mt = item.mealType || getMealType(item.time);
    if (!groups[mt]) groups[mt] = [];
    groups[mt].push(item);
  });

  let html = '';
  let groupIdx = 0;
  mealOrder.forEach(mealKey => {
    const items = groups[mealKey];
    if (!items.length) return;
    const meta = MEAL_META[mealKey];
    const mealKcal = items.reduce((s,i) => s + (i.kcal||0), 0);
    // Stagger the group entrances so the day reads top-to-bottom.
    html += `<div class="meal-group" data-meal="${mealKey}" style="animation-delay:${groupIdx++ * 55}ms">
      <div class="meal-group-hdr">
        <span class="meal-group-icon">${meta.icon}</span>
        <span class="meal-group-name">${meta.label}</span>
        <span class="meal-group-kcal">${mealKcal} ${t('unit_kcal')}</span>
      </div>`;
    items.forEach(item => {
      const idx = log.indexOf(item);
      const em = emo(item.food||'');
      const qty = item.qty||1;
      // Photos live in IndexedDB now; render a placeholder and fill the src
      // in after the markup is attached (hydrateImages below).
      const imgCell = item.imgId
        ? `<img class="li-img" data-img-id="${esc(item.imgId)}" alt="" onerror="this.outerHTML='<div class=\\'li-img\\'>${em}</div>'">`
        : (item.img
            ? `<img class="li-img" src="${esc(item.img)}" alt="" onerror="this.outerHTML='<div class=\\'li-img\\'>${em}</div>'">`
            : `<div class="li-img">${em}</div>`);
      html += `<div class="logitem" onclick="openFd(${idx})">
        ${imgCell}
        <div class="li-info">
          <div class="li-name">${esc(item.food||t('h_dish'))}${qty>1?`<span class="li-qty">${qty} ${t('unit_pcs')}</span>`:''}${item.isDrink?'<span class="li-drink-tag">💧</span>':''}</div>
          <div class="li-sub">${esc(item.time||'')}${item.portion?' · '+esc(item.portion):''}</div>
          <div class="li-macs">
            <span class="li-mac p">${t('macro_p_short')}:${Math.round(item.prot||0)}${t('unit_g')}</span>
            <span class="li-mac c">${t('macro_c_short')}:${Math.round(item.carb||0)}${t('unit_g')}</span>
            <span class="li-mac f">${t('macro_f_short')}:${Math.round(item.fat||0)}${t('unit_g')}</span>
          </div>
        </div>
        <div class="li-right">
          <div class="li-kcal">${item.kcal||0}</div>
          <div class="li-unit">${t('unit_kcal')}</div>
        </div>
        <button class="li-star ${isFav(item)?'on':''}" onclick="event.stopPropagation();toggleFav(${idx})" title="${t('add_to_fav')}">${isFav(item)?'⭐':'☆'}</button>
      <button class="li-del" onclick="event.stopPropagation();HFX.light();SFX.play('delete');delL(${idx})" title="${t('delete_action')}"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/></svg></button>
      </div>`;
    });
    html += '</div>';
  });
  // Replay the entrance animation only when the day actually changed. rH() also
  // runs for a quantity tweak, a water tap or a theme switch, and re-animating
  // the whole diary on those looked like a glitch.
  const sameDay = logEl.dataset.day === activeDayStr;
  logEl.dataset.day = activeDayStr;
  logEl.classList.toggle('no-anim', sameDay);
  logEl.innerHTML = html;
  hydrateImages(logEl);
}


// ── FAVOURITES ──
function getFavs(){try{return JSON.parse(G('favs','[]'));}catch(e){return[];}}
function saveFavs(f){S('favs',JSON.stringify(f));}
function isFav(item){
  const favs=getFavs();
  return favs.some(f=>f.food===item.food&&f.kcal===item.kcal);
}
function toggleFav(idx){
  const item=log[idx];if(!item)return;
  let favs=getFavs();
  const fi=favs.findIndex(f=>f.food===item.food&&f.kcal===item.kcal);
  if(fi>=0){
    favs.splice(fi,1);
    HFX.light();SFX.play('toggle');
    showToast(t('toast_removed_from_fav'));
  } else {
    const fav={food:item.food,portion:item.portion,kcal:item.kcal,prot:item.prot,fat:item.fat,carb:item.carb,img:item.img||null,imgId:item.imgId||null};
    favs.unshift(fav);
    if(favs.length>30)favs=favs.slice(0,30);
    HFX.medium();SFX.play('save');
    showToast(t('toast_added_to_fav'));
  }
  saveFavs(favs);rH();
}
function renderFavs(){
  const favs=getFavs();
  const el=document.getElementById('favsList');
  if(!el)return;
  if(!favs.length){
    el.innerHTML=`<div class="fav-empty"><span class="fav-empty-ico">⭐</span><b>${t('fav_empty_title')}</b><br>${t('fav_empty_sub')}</div>`;
    return;
  }
  const _thumb=(f)=>{
    if(f.imgId) return `<img data-img-id="${esc(f.imgId)}" alt="" style="width:40px;height:40px;border-radius:12px;object-fit:cover">`;
    if(f.img)   return `<img src="${esc(f.img)}" alt="" style="width:40px;height:40px;border-radius:12px;object-fit:cover">`;
    return emo(f.food||'');
  };
  el.innerHTML=favs.map((f,fi)=>`<div class="fav-item">
    <div class="fav-icon">${_thumb(f)}</div>
    <div class="fav-info">
      <div class="fav-name">${esc(f.food||t('h_dish'))}</div>
      <div class="fav-kcal">${f.kcal} ${t('unit_kcal')}${f.portion?' · '+esc(f.portion):''}</div>
    </div>
    <button class="fav-del-btn" onclick="removeFav(${fi})" title="${t('delete_action')}">✕</button>
    <button class="fav-add-btn" onclick="addFavToLog(${fi})">${t('fav_add_btn')}</button>
  </div>`).join('');
  hydrateImages(el);
}
function addFavToLog(fi){
  const favs=getFavs();
  const f=favs[fi];if(!f)return;
  const entry={...f,time:tnow(),date:ds(),qty:1};
  log.unshift(entry);
  if(!saveLog()){ log.shift(); HFX.error(); return; }
  HFX.success();SFX.play('add_food');
  showToast(tf('toast_added_with_name',{name:f.food}));
  rH();closeAdd();
}
function removeFav(fi){
  const favs=getFavs();
  favs.splice(fi,1);saveFavs(favs);
  HFX.light();SFX.play('delete');
  renderFavs();
}


// Food name → emoji. Matches both Russian and English stems: the AI returns
// dish names in whatever language the UI is set to, so a RU-only table meant
// every English entry fell through to the generic plate icon.
const EMO_RULES = [
  ['🍎', ['яблок','apple']],
  ['🍌', ['банан','banana']],
  ['🍗', ['кури','куриц','курин','chicken','poultry','turkey','индейк']],
  ['🐟', ['рыб','лосос','тунец','fish','salmon','tuna','cod','shrimp','креветк']],
  ['🥗', ['салат','salad','greens']],
  ['🍞', ['хлеб','бутерброд','тост','bread','sandwich','toast','bagel','лаваш','wrap']],
  ['🍲', ['суп','борщ','щи','soup','stew','broth','рамен','ramen']],
  ['🍕', ['пицц','pizza']],
  ['🍔', ['бургер','burger','cheeseburger','hamburger','шаурма','shawarma','kebab','hot dog','hotdog','хот-дог']],
  ['🍚', ['гречк','рис','каша','крупа','buckwheat','rice','porridge','oatmeal','овсян','oats','quinoa','паста','макарон','спагетти','pasta','noodle','spaghetti']],
  ['🍆', ['баклажан','eggplant','aubergine']],
  ['🥚', ['яиц','яйц','омлет','egg','omelet','omelette']],
  ['🥛', ['молок','кефир','творог','йогурт','milk','kefir','yogurt','yoghurt','cottage cheese','curd']],
  ['🧀', ['сыр','cheese']],
  ['☕', ['кофе','чай','латте','капучино','coffee','tea','latte','cappuccino','espresso','matcha','матча']],
  ['🍟', ['чипс','фри','chips','fries','crisps']],
  ['🍫', ['шоколад','торт','пирож','конфет','печенье','chocolate','cake','cookie','candy','brownie','dessert','десерт']],
  ['🥦', ['овощ','брокколи','капуст','vegetable','broccoli','cabbage','spinach','шпинат']],
  ['🥑', ['авокадо','avocado']],
  ['🥩', ['говядин','свинин','стейк','мясо','фарш','beef','pork','steak','meat','lamb','баранин']],
  ['🍑', ['фрукт','ягод','fruit','berry','berries','персик','peach','груша','pear','виноград','grape']],
  ['🥤', ['сок','лимонад','кола','газиров','juice','soda','cola','smoothie','смузи','напиток','drink']],
  ['💧', ['вода','water']],
  ['🌰', ['орех','миндал','кешью','арахис','nut','almond','cashew','peanut','walnut']],
  ['🫘', ['фасол','чечевиц','нут','горох','bean','lentil','chickpea','pea']],
];
// Latin needles must start at a word boundary; Cyrillic stems match anywhere
// (Russian inflects the ending, so "кури" has to catch "куриная").
// Plain `includes` for Latin made "Steak" match the needle "tea" — S-tea-k —
// and a steak was logged as a beverage.
function _hasNeedle(haystack, needle){
  if(/^[a-z0-9 '\-]+$/.test(needle)){
    const q = needle.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
    return new RegExp('(^|[^a-z])' + q, 'i').test(haystack);
  }
  return haystack.includes(needle);
}
function emo(f){
  f=String(f||'').toLowerCase();
  if(!f) return '🍽️';
  for(const [icon, words] of EMO_RULES){
    for(const w of words) if(_hasNeedle(f, w)) return icon;
  }
  return '🍽️';
}

function delL(i){
  const item=log[i];if(!item)return;
  showConfirm('🗑️',t('confirm_delete_title'),`«${item.food||t('food_default_label')}» (${item.kcal||0} ${t('food_kcal_short')})`,t('btn_delete'),()=>{
    HFX.heavy();SFX.play('delete');
    releaseEntryImage(item);
    unlinkWaterForEntry(item);
    log.splice(i,1);saveLog();rH();
  });
}

let fdIdx=null;
function openFd(i){
  const item=log[i];if(!item)return;
  HFX.light(); SFX.play('card_tap');
  fdIdx=i;
  // Show current qty
  const qtyEl=document.getElementById('fdQty');
  if(qtyEl) qtyEl.textContent=item.qty||1;
  // Image or emoji. Built with DOM APIs rather than an inline onerror
  // handler — the old template produced `class='fd-nophoto'` *inside* a
  // single-quoted attribute, i.e. broken markup that never recovered.
  const wrap=document.getElementById('fdImgWrap');
  const _em=emo(item.food||'');
  const _fallback=()=>{ wrap.innerHTML=`<div class="fd-nophoto">${_em}</div>`; };
  _fallback();
  resolveEntryImage(item).then(src=>{
    if(!src||fdIdx!==i) return;
    const im=document.createElement('img');
    im.className='fd-img';
    im.alt='';
    im.onerror=_fallback;
    im.src=src;
    wrap.innerHTML='';
    wrap.appendChild(im);
  }).catch(()=>{});
  document.getElementById('fdName').textContent=item.food||t('h_dish');
  document.getElementById('fdPortion').textContent=item.portion||'';
  document.getElementById('fdKcal').textContent=item.kcal||0;
  document.getElementById('fdProt').textContent=Math.round(item.prot||0)+t('unit_g');
  document.getElementById('fdCarb').textContent=Math.round(item.carb||0)+t('unit_g');
  document.getElementById('fdFat').textContent=Math.round(item.fat||0)+t('unit_g');
  document.getElementById('fdDesc').textContent=item.desc||'';
  // Show ingredients if available
  const ingrEl=document.getElementById('fdIngr');
  if(ingrEl){
    if(item.ingr&&item.ingr.length>0){
      ingrEl.innerHTML=`<div class="ingr-hdr">${t('detail_ingr')}</div>`+item.ingr.map(i=>`<div class="ingr-i"><span class="ingr-n">${esc(i.name)}</span><span class="ingr-c">${Number(i.calories)||0} ${t('unit_kcal')}</span></div>`).join('');
      ingrEl.style.display='block';
    } else {
      ingrEl.style.display='none';
    }
  }
  document.getElementById('fdTime').textContent=tf('fd_added_at',{date:fmtDate(item.date,{day:'numeric',month:'long',year:'numeric'}),time:item.time||''});
  document.getElementById('fdOv').classList.add('on');
  lockScroll(true);
}
function editFd(){
  if(fdIdx===null)return;
  const item=log[fdIdx];if(!item)return;
  HFX.light(); SFX.play('sheet_open');
  document.getElementById('ef_name').value=item.food||'';
  document.getElementById('ef_portion').value=item.portion||'';
  document.getElementById('ef_kcal').value=item.kcal||0;
  document.getElementById('ef_prot').value=Math.round((item.prot||0)*10)/10;
  document.getElementById('ef_carb').value=Math.round((item.carb||0)*10)/10;
  document.getElementById('ef_fat').value=Math.round((item.fat||0)*10)/10;
  document.getElementById('ef_time').value=item.time||tnow();
  // Set meal type chip
  const _mt = item.mealType || getMealType(item.time);
  document.querySelectorAll('.ef-meal-chip').forEach(c => {
    c.classList.toggle('on', c.dataset.m === _mt);
  });
  document.getElementById('editFoodOv').classList.add('on');
  lockScroll(true);
}
function closeEditFd(){
  HFX.light(); SFX.play('sheet_close');
  document.getElementById('editFoodOv').classList.remove('on');
  lockScroll(false);
}
function efPickMeal(el){
  document.querySelectorAll('.ef-meal-chip').forEach(c=>c.classList.remove('on'));
  el.classList.add('on');
}
function saveEditFd(){
  if(fdIdx===null)return;
  const item=log[fdIdx];if(!item)return;
  const name=document.getElementById('ef_name').value.trim();
  const portion=document.getElementById('ef_portion').value.trim();
  const kcal=parseFloat(document.getElementById('ef_kcal').value)||0;
  const prot=parseFloat(document.getElementById('ef_prot').value)||0;
  const carb=parseFloat(document.getElementById('ef_carb').value)||0;
  const fat=parseFloat(document.getElementById('ef_fat').value)||0;
  const time=document.getElementById('ef_time').value||item.time;
  const mealChip=document.querySelector('.ef-meal-chip.on');
  const mealType=mealChip?mealChip.dataset.m:null;
  if(name) item.food=name;
  if(portion) item.portion=portion;
  item.kcal=kcal; item.prot=prot; item.carb=carb; item.fat=fat; item.time=time;
  if(mealType) item.mealType=mealType;
  // Reset qty base values if edited
  item.baseKcal=kcal; item.baseProt=prot; item.baseCarb=carb; item.baseFat=fat;
  item.qty=1;
  saveLog();
  rH();
  closeEditFd();
  // Update detail sheet
  document.getElementById('fdName').textContent=item.food||t('h_dish');
  document.getElementById('fdKcal').textContent=item.kcal;
  document.getElementById('fdProt').textContent=Math.round(item.prot)+t('unit_g');
  document.getElementById('fdCarb').textContent=Math.round(item.carb)+t('unit_g');
  document.getElementById('fdFat').textContent=Math.round(item.fat)+t('unit_g');
  showToast(t('toast_record_updated'));
}
function closeFd(){HFX.light();SFX.play('sheet_close');document.getElementById('fdOv').classList.remove('on');lockScroll(false);fdIdx=null;}
function delFd(){
  if(fdIdx===null)return;
  const item=log[fdIdx];
  showConfirm('🗑️',t('confirm_delete_diary_title'),`«${item?.food||t('food_default_label')}» (${item?.kcal||0} ${t('food_kcal_short')})`,t('btn_delete'),()=>{
    HFX.heavy();SFX.play('delete');
    releaseEntryImage(item);
    unlinkWaterForEntry(item);
    log.splice(fdIdx,1);saveLog();
    closeFd();rH();
  });
}

// Update fav button state in food detail


// Calendar strip
let selDay=null; // null = today
function rCal(){
  const el=document.getElementById('cals'),n=new Date(),dns=[t('wd_sun'),t('wd_mon'),t('wd_tue'),t('wd_wed'),t('wd_thu'),t('wd_fri'),t('wd_sat')],g=U?.kcal||2000;
  let h='';
  for(let i=13;i>=0;i--){
    const d=new Date(n);d.setDate(d.getDate()-i);
    const dateStr=ds(d);
    const today=d.toDateString()===n.toDateString();
    const selected=selDay===dateStr||(!selDay&&today);
    const es=dlog(dateStr);const tk=tot(es).k;
    let c=today?'today':'';
    if(es.length&&!today)c+=tk>g*1.05?' over':' has';
    if(selected&&!today)c+=' sel';
    h+=`<div class="cd ${c}" onclick="selectDay('${dateStr}')"><span class="cn">${dns[d.getDay()]}</span><span class="cv">${d.getDate()}</span><span class="cdot"></span></div>`;
  }
  el.innerHTML=h;
  // Scroll the selected day into view (today lives at the far right).
  setTimeout(()=>{
    const sel=el.querySelector('.cd.sel')||el.querySelector('.cd.today');
    if(sel&&sel.scrollIntoView) sel.scrollIntoView({block:'nearest',inline:'center'});
    else el.parentElement.scrollLeft=9999;
  },30);
}
let _qtyHoldTimer=null;
function _qtyHold(d){_qtyClear();_qtyHoldTimer=setTimeout(()=>{_qtyHoldTimer=setInterval(()=>{changeQty(d);},120);},400);}
function _qtyClear(){if(_qtyHoldTimer){clearTimeout(_qtyHoldTimer);clearInterval(_qtyHoldTimer);_qtyHoldTimer=null;}}
function changeQty(delta){
  const item=log[fdIdx];if(!item)return;
  HFX.tick(); SFX.play('drum_tick');
  const base=item.baseKcal||item.kcal;
  const baseProt=item.baseProt||item.prot;
  const baseCarb=item.baseCarb||item.carb;
  const baseFat=item.baseFat||item.fat;
  // Store base values first time
  if(!item.baseKcal){item.baseKcal=item.kcal;item.baseProt=item.prot;item.baseCarb=item.carb;item.baseFat=item.fat;}
  const newQty=Math.max(1,(item.qty||1)+delta);
  item.qty=newQty;
  item.kcal=Math.round(item.baseKcal*newQty);
  item.prot=Math.round(item.baseProt*newQty*10)/10;
  item.carb=Math.round(item.baseCarb*newQty*10)/10;
  item.fat=Math.round(item.baseFat*newQty*10)/10;
  saveLog();
  // Update UI in detail sheet
  const qtyEl=document.getElementById('fdQty');
  if(qtyEl){
    qtyEl.textContent=newQty;
    qtyEl.style.transition='transform .15s cubic-bezier(.36,.66,.04,1)';
    qtyEl.style.transform='scale(1.35)';
    setTimeout(()=>{if(qtyEl){qtyEl.style.transform='scale(1)';}},180);
  }
  document.getElementById('fdKcal').textContent=item.kcal;
  document.getElementById('fdProt').textContent=Math.round(item.prot)+t('unit_g');
  document.getElementById('fdCarb').textContent=Math.round(item.carb)+t('unit_g');
  document.getElementById('fdFat').textContent=Math.round(item.fat)+t('unit_g');
  HFX.light();
  rH();
}


function selectDay(dateStr){
  HFX.tick(); SFX.play('btn_tap');
  const n=new Date();
  selDay=dateStr===ds(n)?null:dateStr;
  rH();
}

// PROGRESS
function rP(){
  if(!U)return;
  // Update month in header
  const _pgMonth=document.getElementById('pgMonth');
  if(_pgMonth)_pgMonth.textContent=new Date().toLocaleDateString(_localeTag(),{month:'long',year:'numeric'});
  const s=streak();
  document.getElementById('pstr').textContent=s;
  const _sbl=document.querySelector('.sbc-lbl');
  if(_sbl)_sbl.textContent=tf('streak_label_tpl',{days:fmtDaysWord(s)});
  // Week
  const n=new Date(),dns=[t('wd_mon'),t('wd_tue'),t('wd_wed'),t('wd_thu'),t('wd_fri'),t('wd_sat'),t('wd_sun')];
  document.getElementById('wkd').innerHTML=Array.from({length:7},(_,i)=>{
    const d=new Date(n);d.setDate(d.getDate()-(6-i));
    const today=d.toDateString()===n.toDateString();
    const has=dlog(ds(d)).length>0;
    return `<div class="wd ${has?'done':today?'today':''}" style="animation-delay:${i*45}ms">${dns[(d.getDay()+6)%7]}</div>`;
  }).join('');
  // Stats
  const l7=Array.from({length:7},(_,i)=>{const d=new Date(n);d.setDate(d.getDate()-i);return dlog(ds(d));});
  const active=l7.filter(d=>d.length);
  const avg=active.length?Math.round(active.reduce((s,d)=>s+tot(d).k,0)/active.length):0;
  document.getElementById('pavg').textContent=avg||'—';
  const g=U.kcal||2000;
  let bd='—',bd2=Infinity;
  for(let i=0;i<30;i++){const d=new Date(n);d.setDate(d.getDate()-i);const es=dlog(ds(d));if(!es.length)continue;const diff=Math.abs(tot(es).k-g);if(diff<bd2){bd2=diff;bd=d.toLocaleDateString(_localeTag(),{day:'numeric',month:'short'});}}
  document.getElementById('pbest').textContent=bd;
  document.getElementById('ptot').textContent=log.length;
  let td=0;for(let i=0;i<30;i++){const d=new Date(n);d.setDate(d.getDate()-i);if(dlog(ds(d)).length)td++;}
  document.getElementById('pdays').textContent=td;
  // Heatmap — with overeating severity colors
  const hg=document.getElementById('hgrid');
  hg.innerHTML=Array.from({length:28},(_,i)=>{
    const d=new Date(n);d.setDate(d.getDate()-(27-i));
    const tk=tot(dlog(ds(d))).k,r=g>0?tk/g:0;
    // 90–110% counts as "on target": a 1% overshoot used to flip the day from
    // the strongest accent straight to a red, which read as a failure and made
    // the whole month harder to scan.
    let c='';
    if(tk>0){
      if(r>1.8)       c='o4';   // way over
      else if(r>1.5)  c='o3';
      else if(r>1.25) c='o2';
      else if(r>1.1)  c='o1';   // slightly over
      else if(r>0.9)  c='c4';   // on target
      else if(r>0.6)  c='c3';
      else if(r>0.3)  c='c2';
      else            c='c1';
    }
    // Diagonal-ish stagger: the grid fills in as a wave instead of all at once.
    const pct=g>0?Math.round(r*100):0;
    return `<div class="hcell ${c}" style="animation-delay:${i*11}ms" title="${d.toLocaleDateString(_localeTag())}: ${tk} ${t('unit_kcal')}${tk?' · '+pct+'%':''}"></div>`;
  }).join('');
  // Weight chart
  rWChart();
  // Water balance
  rWater();
  // Weight pace
  _updatePaceCard();
  // BMI
  rBMI();
  // Load cached weekly analysis
  const wkKey = 'week_'+new Date().toISOString().slice(0,7)+'_'+Math.floor(new Date().getDate()/7);
  const cached = G(wkKey);
  if(cached) { try{ renderWeekAnalysis(JSON.parse(cached)); }catch(e){} }
}

let _wlogVal=70.0;
function logW(){
  // Initialize value from last recorded or U.w
  _wlogVal=wts.length>0?wts[0].v:(U?.w||70);
  _wlogVal=Math.round(_wlogVal*10)/10;
  document.getElementById('wlogVal').textContent=_wlogVal.toFixed(1);
  // Show trend
  const trendEl=document.getElementById('wlogTrend');
  if(wts.length>0&&trendEl){
    const diff=Math.round((_wlogVal-wts[0].v)*10)/10;
    if(diff>0){trendEl.className='wlog-trend up';trendEl.textContent=tf('toast_weight_up',{n:diff});}
    else if(diff<0){trendEl.className='wlog-trend down';trendEl.textContent=tf('toast_weight_down',{n:diff});}
    else{trendEl.className='wlog-trend same';trendEl.textContent=t('toast_weight_no_change_full');}
  } else if(trendEl){trendEl.textContent=t('toast_weight_first');}
  document.getElementById('wlogOv').classList.add('on');
  SFX.play('sheet_open');
  lockScroll(true);
}
let _wlogHoldTimer=null;
function _wlogHold(btn,d){
  _wlogClear();
  // Start repeating after 500ms hold
  _wlogHoldTimer=setTimeout(()=>{
    _wlogHoldTimer=setInterval(()=>{wlogStep(d);},80);
  },400);
}
function _wlogClear(){
  if(_wlogHoldTimer){clearTimeout(_wlogHoldTimer);clearInterval(_wlogHoldTimer);_wlogHoldTimer=null;}
}
function wlogStep(d){
  _wlogVal=Math.round((_wlogVal+d)*10)/10;
  if(_wlogVal<20)_wlogVal=20;
  if(_wlogVal>300)_wlogVal=300;
  const el=document.getElementById('wlogVal');
  if(el){
    el.textContent=_wlogVal.toFixed(1);
    el.style.transform='scale(1.18)';
    setTimeout(()=>{if(el)el.style.transform='';},150);
  }
  // Update trend vs previous
  const trendEl=document.getElementById('wlogTrend');
  if(trendEl&&wts.length>0){
    const diff=Math.round((_wlogVal-wts[0].v)*10)/10;
    if(diff>0){trendEl.className='wlog-trend up';trendEl.textContent=tf('toast_weight_up',{n:diff});}
    else if(diff<0){trendEl.className='wlog-trend down';trendEl.textContent=tf('toast_weight_down',{n:diff});}
    else{trendEl.className='wlog-trend same';trendEl.textContent=t('toast_weight_no_change');}
  }
  HFX.tick();
}
function closeWlog(){HFX.light();SFX.play('sheet_close');document.getElementById('wlogOv').classList.remove('on');lockScroll(false);}
function saveWlog(){
  const v=_wlogVal;
  if(isNaN(v)||v<=0)return;
  HFX.success(); SFX.play('weight_log');
  wts.unshift({v,d:ds(),t:tnow()});
  S('wts',JSON.stringify(wts));
  // Update user weight and recalculate
  if(U){
    U.w=v;
    rcalc();
    S('u',JSON.stringify(U));
    rH();rSet();
  }
  closeWlog();
  rWChart();
  // Show brief success feedback
  const btn=document.querySelector('.wt-btn');
  if(btn){const orig=btn.textContent;btn.textContent=t('toast_weight_saved');btn.style.background='var(--ok)';btn.style.color='#fff';setTimeout(()=>{btn.textContent=orig;btn.style.background='';btn.style.color='';},2000);}
}

function rWChart(){
  const cv=document.getElementById('wc'),em=document.getElementById('wempty');
  if(wts.length<2){em.style.display='block';cv.style.display='none';return;}
  em.style.display='none';cv.style.display='block';
  
  const dpr=window.devicePixelRatio||1;
  const pts=wts.slice(0,30).reverse();
  const parent=cv.parentElement;
  const W=parent.offsetWidth-40;
  const H=140;
  const padL=42,padR=16,padT=16,padB=32;
  const cW=W, cH=H;
  
  cv.style.width=cW+'px'; cv.style.height=cH+'px';
  cv.width=cW*dpr; cv.height=cH*dpr;
  
  const ctx=cv.getContext('2d');
  ctx.scale(dpr,dpr);
  ctx.clearRect(0,0,cW,cH);
  
  const vs=pts.map(p=>p.v);
  const mn=Math.min(...vs), mx=Math.max(...vs);
  const range=mx-mn||1;
  const mnP=mn-range*0.15, mxP=mx+range*0.15;
  
  const pW=cW-padL-padR, pH=cH-padT-padB;
  const xi=i=>padL+(i/(pts.length-1))*pW;
  const yv=v=>padT+pH-(v-mnP)/(mxP-mnP)*pH;
  
  // Chart ink. This used to read `--primary`, a custom property that does not
  // exist in this stylesheet, so it always fell back to near-black #0A0A0A —
  // invisible on the dark card. Read the real tokens instead.
  const css=getComputedStyle(document.documentElement);
  const pick=(name,fb)=>{const v=css.getPropertyValue(name).trim();return v||fb;};
  const isDark=document.documentElement.getAttribute('data-theme')==='dark';
  const lineColor=pick('--t0', isDark?'#F4F2EE':'#141210');
  const gridColor=isDark?'rgba(255,255,255,.08)':'rgba(0,0,0,.06)';
  const labelColor=isDark?'rgba(244,242,238,.48)':'rgba(20,18,16,.46)';
  const cardBg=pick('--bg1', isDark?'#1A1916':'#FFFFFF');
  
  // Grid Y lines + Y axis labels
  const steps=4;
  ctx.font=`500 10px -apple-system,BlinkMacSystemFont,sans-serif`;
  ctx.textAlign='right';
  for(let i=0;i<=steps;i++){
    const v=mnP+(mxP-mnP)*i/steps;
    const yy=yv(v);
    ctx.strokeStyle=gridColor; ctx.lineWidth=1;
    ctx.setLineDash([3,4]);
    ctx.beginPath(); ctx.moveTo(padL,yy); ctx.lineTo(cW-padR,yy); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle=labelColor;
    ctx.fillText(Math.round(v)+t('unit_kg'), padL-5, yy+3.5);
  }
  
  // Smooth curve path (catmull-rom spline)
  function cmR(pts,t=0.5){
    if(pts.length<2) return [];
    const path=[];
    for(let i=0;i<pts.length-1;i++){
      const p0=pts[Math.max(0,i-1)], p1=pts[i], p2=pts[i+1], p3=pts[Math.min(pts.length-1,i+2)];
      for(let s=0;s<=20;s++){
        const st=s/20;
        const st2=st*st, st3=st2*st;
        const x=0.5*((2*p1[0])+(-p0[0]+p2[0])*st+(2*p0[0]-5*p1[0]+4*p2[0]-p3[0])*st2+(-p0[0]+3*p1[0]-3*p2[0]+p3[0])*st3);
        const y=0.5*((2*p1[1])+(-p0[1]+p2[1])*st+(2*p0[1]-5*p1[1]+4*p2[1]-p3[1])*st2+(-p0[1]+3*p1[1]-3*p2[1]+p3[1])*st3);
        path.push([x,y]);
      }
    }
    return path;
  }
  
  const coords=pts.map((_,i)=>[xi(i),yv(vs[i])]);
  const curve=coords.length>2?cmR(coords):coords;
  
  // Gradient fill
  const grad=ctx.createLinearGradient(0,padT,0,cH-padB);
  grad.addColorStop(0, isDark?'rgba(244,242,238,0.14)':'rgba(20,18,16,0.09)');
  grad.addColorStop(1, isDark?'rgba(244,242,238,0)':'rgba(20,18,16,0)');
  
  ctx.beginPath();
  ctx.moveTo(curve[0][0],curve[0][1]);
  curve.forEach(([x,y])=>ctx.lineTo(x,y));
  ctx.lineTo(coords[coords.length-1][0],cH-padB);
  ctx.lineTo(coords[0][0],cH-padB);
  ctx.closePath();
  ctx.fillStyle=grad; ctx.fill();
  
  // Line
  ctx.beginPath();
  ctx.moveTo(curve[0][0],curve[0][1]);
  curve.forEach(([x,y])=>ctx.lineTo(x,y));
  ctx.strokeStyle=lineColor;
  ctx.lineWidth=2.5; ctx.lineJoin='round'; ctx.lineCap='round';
  ctx.setLineDash([]); ctx.stroke();
  
  // Dots
  pts.forEach((p,i)=>{
    const dotX=xi(i), dotY=yv(vs[i]);
    // Outer ring
    ctx.beginPath(); ctx.arc(dotX,dotY,5,0,Math.PI*2);
    ctx.fillStyle=cardBg; ctx.fill();
    // Inner fill
    ctx.beginPath(); ctx.arc(dotX,dotY,3.5,0,Math.PI*2);
    ctx.fillStyle=lineColor; ctx.fill();
    
    // Label above/below first and last dot
    if(i===0||i===pts.length-1){
      const above=dotY>padT+20;
      ctx.font=`600 11px -apple-system,BlinkMacSystemFont,sans-serif`;
      ctx.textAlign='center';
      ctx.fillStyle=labelColor;
      ctx.fillText(p.v+t('unit_kg'), dotX, above?dotY-10:dotY+18);
      // Date label
      const d=new Date(p.d);
      const dLbl=d.toLocaleDateString(_localeTag(),{day:'numeric',month:'short'});
      ctx.font=`400 9px -apple-system,BlinkMacSystemFont,sans-serif`;
      ctx.fillStyle=isDark?'rgba(244,242,238,.34)':'rgba(20,18,16,.34)';
      ctx.fillText(dLbl, dotX, cH-padB+14);
    }
  });
}

// AI
// Conversation memory — opt-in (Settings → toggle), OFF by default. Tracks
// the visible chat turns in-memory only (not persisted across reloads,
// matching how the visible chat itself already resets on reload). Only
// included in the Gemini request payload when the user has explicitly
// enabled it, since sending prior turns costs meaningfully more tokens.
// ══════════════════════════════════════════════════════════════════
// AI CHAT
// ══════════════════════════════════════════════════════════════════
// Conversation memory — opt-in (Settings → toggle), OFF by default. Controls
// whether prior turns are *sent* to Gemini. The visible transcript is a
// separate thing and is always kept, so reopening the screen does not wipe the
// conversation the user was in the middle of.
let aiConvo = []; // {role:'user'|'model', text}

const AI_CHAT_KEY = 'ai_chat';
const AI_CHAT_MAX = 40;          // rendered + persisted turns
let aiChat = [];                 // {role:'user'|'ai'|'err', text, at, imgId?}
let _aiBusy = false;
let _aiToken = 0;                // bumped to abandon an in-flight reply
let _aiPhoto = null;             // {dataUrl} pending attachment

function _aiLoadChat(){
  try {
    const raw = JSON.parse(G(AI_CHAT_KEY, '[]'));
    aiChat = Array.isArray(raw) ? raw.slice(-AI_CHAT_MAX) : [];
  } catch(e) { aiChat = []; }
  // Rebuild the model-facing history from the transcript so turning memory on
  // mid-conversation immediately has something to work with.
  aiConvo = aiChat.filter(m => m.role === 'user' || m.role === 'ai')
    .map(m => ({ role: m.role === 'user' ? 'user' : 'model', text: m.text }));
}
function _aiSaveChat(){
  if (aiChat.length > AI_CHAT_MAX) aiChat = aiChat.slice(-AI_CHAT_MAX);
  S(AI_CHAT_KEY, JSON.stringify(aiChat));
}

const AI_SUGGESTIONS = ['ai_sug_norm','ai_sug_eat','ai_sug_diet','ai_sug_bulk','ai_sug_snack','ai_sug_cut'];

// ── Header status ────────────────────────────────────────────────
function aiSetStatus(state, text){
  const wrap = document.getElementById('aiStatus');
  const dot  = document.getElementById('aiDot');
  const txt  = document.getElementById('aiStatusText');
  if (wrap) { wrap.classList.toggle('busy', state === 'busy'); wrap.classList.toggle('off', state === 'off'); }
  if (dot)  { dot.classList.toggle('busy', state === 'busy'); dot.classList.toggle('off', state === 'off'); }
  if (txt)  txt.textContent = text || (state === 'busy' ? t('ai_typing') : state === 'off' ? t('queue_offline') : t('ai_online'));
}

// ── Rendering ────────────────────────────────────────────────────
function initAi(){
  aiReady = true;
  if (!aiChat.length) _aiLoadChat();
  aiRender();
  aiSetStatus(navigator.onLine ? (_aiBusy ? 'busy' : 'on') : 'off');
  _aiSyncSendBtn();
}

function _aiHeroHtml(){
  const tl = tlog(), tt = tot(tl);
  const goal = U?.kcal || 2000;
  const left = Math.max(0, goal - (tt.k || 0));
  const stats = [
    { v: `${tt.k || 0}`, l: t('word_today') },
    { v: `${left}`,      l: t('word_left') },
    { v: `${streak()}`,  l: fmtDaysWord(streak()) },
  ];
  if (isWaterOn()) {
    const ml = getWaterToday().reduce((a, e) => a + (e.ml || 0), 0);
    stats.push({ v: `${ml}`, l: t('water_ml') });
  }
  return `<div class="ai-hero">
      <div class="ai-hero-ava">🤖</div>
      <div class="ai-hero-title">${esc(t('ai_welcome_hi'))}, ${esc(U?.name || '')}!</div>
      <div class="ai-hero-sub">${esc(tf('ai_hero_sub', { goal: esc(GL[U?.goal] || '—') }))}</div>
      <div class="ai-hero-stats">
        ${stats.map(s2 => `<div class="ai-stat"><div class="ai-stat-v">${esc(s2.v)}</div><div class="ai-stat-l">${esc(s2.l)}</div></div>`).join('')}
      </div>
    </div>
    <div class="ai-chips-label">${esc(t('ai_chips_label'))}</div>
    <div class="ai-chips">
      ${AI_SUGGESTIONS.map(k => `<button class="ai-chip" onclick="aiSug(this)">${esc(t(k))}</button>`).join('')}
    </div>`;
}

function _aiMsgHtml(m, i, prev){
  const time = m.at || '';
  if (m.role === 'user') {
    const img = m.imgId ? `<img class="bbl-img" data-img-id="${esc(m.imgId)}" alt="">` : '';
    return `<div class="msg msg-user" data-i="${i}">
      <div class="bbl">${img}${m.text ? fmt(m.text) : ''}</div>
      <div class="msg-meta"><span>${esc(time)}</span></div>
    </div>`;
  }
  const isErr = m.role === 'err';
  const actions = isErr
    ? `<button class="msg-retry" onclick="aiRetry()">↻ ${esc(t('retry'))}</button>`
    : `<button class="msg-copy" onclick="aiCopy(this,${i})">⧉ ${esc(t('ai_copy'))}</button>`;
  return `<div class="msg msg-ai${isErr ? ' msg-err' : ''}" data-i="${i}">
    <div class="msg-ai-wrap">
      <div class="msg-ai-ava">🤖</div>
      <div class="bbl">${fmt(m.text)}</div>
    </div>
    <div class="msg-meta"><span>${esc(time)}</span>${actions}</div>
  </div>`;
}

function aiRender(keepScroll){
  const c = document.getElementById('aimsg');
  if (!c) return;
  const atEnd = !keepScroll || _aiNearBottom();
  c.innerHTML = aiChat.length
    ? aiChat.map((m, i) => _aiMsgHtml(m, i, aiChat[i - 1])).join('')
    : _aiHeroHtml();
  hydrateImages(c);
  if (_aiBusy) _aiAppendTyping();
  if (atEnd) aiScrollToEnd(false);
  _aiSyncJump();
}

function _aiAppendTyping(){
  const c = document.getElementById('aimsg');
  if (!c || c.querySelector('#aiTyping')) return;
  const el = document.createElement('div');
  el.className = 'msg msg-ai';
  el.id = 'aiTyping';
  el.innerHTML = '<div class="msg-ai-wrap"><div class="msg-ai-ava">🤖</div><div class="typing-indicator"><div class="typing-dot"></div><div class="typing-dot"></div><div class="typing-dot"></div></div></div>';
  c.appendChild(el);
}
function _aiRemoveTyping(){ document.getElementById('aiTyping')?.remove(); }

function _aiNearBottom(){
  const c = document.getElementById('aimsg');
  if (!c) return true;
  return c.scrollHeight - c.scrollTop - c.clientHeight < 120;
}
function aiScrollToEnd(smooth){
  const c = document.getElementById('aimsg');
  if (!c) return;
  if (smooth) { HFX.light(); c.scrollTo({ top: c.scrollHeight, behavior: 'smooth' }); }
  else c.scrollTop = c.scrollHeight;
  _aiSyncJump();
}
function _aiSyncJump(){
  const b = document.getElementById('aiJump');
  if (b) b.classList.toggle('on', !_aiNearBottom());
}

// ── Message helpers ──────────────────────────────────────────────
function aiPush(role, text, extra){
  aiChat.push({ role, text: text || '', at: tnow(), ...(extra || {}) });
  _aiSaveChat();
  aiRender(true);
}

function aiCopy(btn, i){
  const m = aiChat[i];
  if (!m) return;
  const done = () => {
    HFX.light(); SFX.play('copy');
    btn.classList.add('done');
    const orig = btn.innerHTML;
    btn.innerHTML = '✓ ' + esc(t('saved'));
    setTimeout(() => { btn.classList.remove('done'); btn.innerHTML = orig; }, 1600);
  };
  try {
    navigator.clipboard.writeText(m.text).then(done).catch(() => {
      const ta = document.createElement('textarea');
      ta.value = m.text; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      document.execCommand('copy'); ta.remove(); done();
    });
  } catch(e) {}
}

function clearAiChat(){
  if (!aiChat.length) { HFX.light(); return; }
  showConfirm('💬', t('confirm_clear_chat_title'), t('confirm_clear_chat_body'), t('confirm_clear_chat_btn'), () => {
    // Drop the attached images too, so they do not linger in IndexedDB.
    aiChat.forEach(m => { if (m.imgId) IMG.del(m.imgId); });
    aiChat = [];
    aiConvo.length = 0;
    _aiSaveChat();
    aiClearPhoto();
    aiRender();
  });
}

function aiSug(el){
  const inp = document.getElementById('aiinp');
  if (inp) { inp.value = el.textContent.trim(); aiGrowInput(inp); }
  HFX.light();
  aiSend();
}

// ── Wiring ───────────────────────────────────────────────────────
// The jump-to-latest button appears only when the user has scrolled away, so
// reading history is never yanked back down by an incoming message.
document.addEventListener('DOMContentLoaded', () => {
  const c = document.getElementById('aimsg');
  if (c) c.addEventListener('scroll', _aiSyncJump, { passive: true });
}, { once: true });
window.addEventListener('online',  () => { if (!_aiBusy) aiSetStatus('on'); });
window.addEventListener('offline', () => { if (!_aiBusy) aiSetStatus('off'); });

// ── Composer ─────────────────────────────────────────────────────
function aiGrowInput(el){
  if (!el) return;
  el.style.height = 'auto';
  el.style.height = Math.min(el.scrollHeight, 132) + 'px';
  _aiSyncSendBtn();
}
function _aiSyncSendBtn(){
  const btn = document.getElementById('aiSendBtn');
  if (!btn) return;
  const inp = document.getElementById('aiinp');
  const hasText = !!(inp && inp.value.trim());
  btn.classList.toggle('busy', _aiBusy);
  btn.disabled = !_aiBusy && !hasText && !_aiPhoto;
}

function aiPickPhoto(){
  HFX.light(); SFX.play('btn_tap');
  document.getElementById('aiPhotoInput')?.click();
}
async function aiOnPhoto(ev){
  const file = ev.target.files?.[0];
  ev.target.value = '';
  if (!file) return;
  SFX.play('photo_snap'); HFX.light();
  try {
    const b = await b64(file);                      // resized to 1024px
    _aiPhoto = { dataUrl: 'data:image/jpeg;base64,' + b };
    const wrap = document.getElementById('aiAttach');
    const img = document.getElementById('aiAttachImg');
    if (img) img.src = _aiPhoto.dataUrl;
    if (wrap) wrap.hidden = false;
    _aiSyncSendBtn();
    document.getElementById('aiinp')?.focus();
  } catch(e) {
    HFX.error(); SFX.play('error');
    showToast(t('err_file_open'));
  }
}
function aiClearPhoto(){
  const had = !!_aiPhoto;
  _aiPhoto = null;
  const wrap = document.getElementById('aiAttach');
  if (wrap) wrap.hidden = true;
  const img = document.getElementById('aiAttachImg');
  if (img) img.removeAttribute('src');
  if (had) { HFX.light(); SFX.play('sheet_close'); }
  _aiSyncSendBtn();
}

// Re-send the last user turn after a failure.
function aiRetry(){
  for (let i = aiChat.length - 1; i >= 0; i--) {
    if (aiChat[i].role === 'user') {
      const m = aiChat[i];
      // Drop the error bubble(s) that followed it.
      aiChat = aiChat.slice(0, i);
      _aiSaveChat();
      const inp = document.getElementById('aiinp');
      if (inp) { inp.value = m.text; aiGrowInput(inp); }
      if (m.imgId) {
        IMG.get(m.imgId).then(src => {
          if (src) {
            _aiPhoto = { dataUrl: src };
            const img = document.getElementById('aiAttachImg');
            if (img) img.src = src;
            const wrap = document.getElementById('aiAttach');
            if (wrap) wrap.hidden = false;
          }
          aiRender(); aiSend();
        });
        return;
      }
      aiRender();
      aiSend();
      return;
    }
  }
}


// Voice input via Web Speech API (Chrome desktop/Android — webkit-prefixed in some)
let _voiceRec = null, _voiceListening = false;
function aiVoiceToggle(){
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) {
    HFX.error(); SFX.play('error');
    showToast(t('toast_no_voice'));
    return;
  }
  if (_voiceListening) { try { _voiceRec && _voiceRec.stop(); } catch(e){} return; }
  if (!_voiceRec) {
    _voiceRec = new SR();
    _voiceRec.interimResults = true;
    _voiceRec.continuous = false;
    _voiceRec.maxAlternatives = 1;
  }
  _voiceRec.lang = LANG === 'en' ? 'en-US' : 'ru-RU';
  const inp = document.getElementById('aiinp');
  const btn = document.getElementById('aiMicBtn');
  let baseText = (inp?.value || '').trim();
  if (baseText) baseText += ' ';
  _voiceRec.onstart = () => {
    _voiceListening = true;
    btn?.classList.add('listening');
    HFX.light(); SFX.play('btn_tap');
    showToast(t('toast_voice_listen'), 1500);
  };
  _voiceRec.onresult = (ev) => {
    let final = '', interim = '';
    for (let i = ev.resultIndex; i < ev.results.length; i++) {
      const r = ev.results[i];
      if (r.isFinal) final += r[0].transcript;
      else interim += r[0].transcript;
    }
    if (inp) inp.value = baseText + final + interim;
  };
  _voiceRec.onerror = (e) => {
    _voiceListening = false;
    btn?.classList.remove('listening');
    if (e.error !== 'no-speech' && e.error !== 'aborted') {
      HFX.error(); SFX.play('error');
    }
  };
  _voiceRec.onend = () => {
    _voiceListening = false;
    btn?.classList.remove('listening');
    HFX.light();
    if (inp && inp.value.trim()) {
      // Auto-send when voice transcript is non-trivial
      // Comment out to disable auto-send
    }
  };
  try { _voiceRec.start(); } catch(e) { /* already started */ }
}

// ── AI chat ───────────────────────────────────────────────────────
// The whole prompt (persona, section headings, instructions) is built in the
// UI language. Previously it was hard-coded Russian and ended with
// "Отвечай по-русски", so the assistant kept replying in Russian even after
// the user switched the app to English.
function _aiBuildSystemPrompt(){
  const isEn = LANG === 'en';
  const tl = tlog(), tt = tot(tl);
  const waterEnabled = isWaterOn();
  const waterToday = getWaterToday();
  const totalWaterMl = waterToday.reduce((s2,e)=>s2+e.ml,0);
  const waterGoal = getWaterGoal().adjusted;
  const bmi = U?.w && U?.h ? ((U.w/((U.h/100)**2)).toFixed(1)) : '—';
  const streakDays = streak();
  const loc = _localeTag();
  const KC = isEn ? 'kcal' : 'ккал';
  const G_ = isEn ? 'g' : 'г';
  const ML = isEn ? 'ml' : 'мл';
  const KG = isEn ? 'kg' : 'кг';
  const P_ = isEn ? 'P' : 'Б';
  const C_ = isEn ? 'C' : 'У';
  const F_ = isEn ? 'F' : 'Ж';
  const NONE = isEn ? 'no data' : 'нет данных';

  const week7 = [];
  for(let i=1;i<=7;i++){
    const d=new Date(); d.setDate(d.getDate()-i);
    const dl=dlog(ds(d));
    if(dl.length){ const t2=tot(dl); week7.push(`${d.toLocaleDateString(loc,{weekday:'short'})}: ${t2.k}${KC}`); }
  }

  const foodLog = tl.length
    ? tl.map((item,i)=>`  ${i+1}. ${item.food||(isEn?'Dish':'Блюдо')}${item.portion?' ('+item.portion+')':''}: ${item.kcal||0}${KC}, ${P_}${Math.round(item.prot||0)}${G_} ${C_}${Math.round(item.carb||0)}${G_} ${F_}${Math.round(item.fat||0)}${G_} — ${item.time||''}`).join('\n')
    : (isEn ? '  (nothing logged today yet)' : '  (сегодня ещё ничего не добавлено)');

  const prefsStr  = U?.prefs?.length ? (isEn?'\n• Preferences: ':'\n• Предпочтения: ') + U.prefs.map(pk=>t('pref_'+pk, pk)).join(', ') : '';
  const allergStr = U?.allerg ? (isEn?'\n• Allergies / restrictions: ':'\n• Аллергии/ограничения: ') + U.allerg : '';

  const waterTodayLine = waterEnabled
    ? (isEn ? `Water today: ${totalWaterMl} ml of ${waterGoal} ml` : `Вода сегодня: ${totalWaterMl}мл из ${waterGoal}мл`)
      + (waterToday.length ? ' ('+waterToday.map(e=>e.ml+ML+(isEn?' at ':' в ')+e.t).join(', ')+')' : '') + '\n'
    : '';

  const water7d = (()=>{
    const r=[];
    for(let i=1;i<=7;i++){
      const d=new Date(); d.setDate(d.getDate()-i);
      try{
        const w=JSON.parse(G('water_'+ds(d),'[]'));
        const sum=w.reduce((a,x)=>a+(x.ml||0),0);
        if(sum>0) r.push(d.toLocaleDateString(loc,{weekday:'short'})+': '+sum+ML);
      }catch(e){}
    }
    return r.length?r.join(', '):NONE;
  })();
  const water7dLine = waterEnabled ? (isEn?`WATER (last 7 days): ${water7d}\n`:`ВОДА (последние 7 дней): ${water7d}\n`) : '';
  const waterInstruction = waterEnabled ? ''
    : (isEn ? '\n- The user has water tracking disabled — do NOT mention water or hydration unless they ask'
            : '\n- Трекинг воды у пользователя отключён — НЕ упоминай воду и питьевой режим, если пользователь сам не спросит');

  const weights = wts.slice(0,5).map(w=>new Date(w.d).toLocaleDateString(loc,{day:'numeric',month:'short'})+': '+w.v+KG).join(', ') || NONE;
  const goalLabel = GL[U?.goal] || '—';
  const todayLabel = new Date().toLocaleDateString(loc,{weekday:'long',day:'numeric',month:'long'});
  const gender = U?.gen==='m' ? (isEn?'male':'мужчина') : (isEn?'female':'женщина');

  if (isEn) {
    return `You are the CalSnap personal AI nutritionist. You are smart, attentive and motivating.

USER DATA:
• Name: ${U?.name||'friend'}, sex: ${gender}, age: ${U?.age||'?'}
• Height: ${U?.h||'?'} cm, weight: ${U?.w||'?'} kg, BMI: ${bmi}
• Goal: ${goalLabel} | Calorie target: ${U?.kcal||2000} kcal/day${prefsStr}${allergStr}
• Activity factor: ${U?.act||1.375} | Streak: ${streakDays} days

TODAY (${todayLabel}):
${foodLog}
Total: ${tt.k||0} kcal of ${U?.kcal||2000} (${Math.round((tt.k||0)/(U?.kcal||2000)*100)}%)
Macros: P${Math.round(tt.p||0)}g C${Math.round(tt.c||0)}g F${Math.round(tt.f||0)}g
Remaining: ${Math.max(0,(U?.kcal||2000)-(tt.k||0))} kcal
${waterTodayLine}
THIS WEEK: ${week7.length?week7.join(', '):NONE}
${water7dLine}WEIGHT (latest entries): ${weights}

INSTRUCTIONS:
- Reply in English, concretely and in a friendly tone
- Use the user's own data in the answer (name, calories, facts)
- Give precise advice (specific dishes, gram amounts, timing)
- If asked what to eat, suggest real dishes with calorie figures
- Up to 180 words, use emoji sparingly
- Do NOT repeat data the user already sees${waterInstruction}`;
  }

  return `Ты персональный AI-нутрициолог CalSnap. Ты умный, внимательный, мотивирующий.

ДАННЫЕ ПОЛЬЗОВАТЕЛЯ:
• Имя: ${U?.name||'друг'}, пол: ${gender}, возраст: ${U?.age||'?'}л
• Рост: ${U?.h||'?'}см, вес: ${U?.w||'?'}кг, ИМТ: ${bmi}
• Цель: ${goalLabel} | Норма калорий: ${U?.kcal||2000}ккал/день${prefsStr}${allergStr}
• Активность: ${U?.act||1.375} | Серия дней: ${streakDays}

СЕГОДНЯ (${todayLabel}):
${foodLog}
Итого: ${tt.k||0}ккал из ${U?.kcal||2000} (${Math.round((tt.k||0)/(U?.kcal||2000)*100)}%)
Макро: Б${Math.round(tt.p||0)}г У${Math.round(tt.c||0)}г Ж${Math.round(tt.f||0)}г
Осталось: ${Math.max(0,(U?.kcal||2000)-(tt.k||0))}ккал
${waterTodayLine}
ИСТОРИЯ НЕДЕЛИ: ${week7.length?week7.join(', '):NONE}
${water7dLine}ВЕС (последние записи): ${weights}

ИНСТРУКЦИИ:
- Отвечай по-русски, конкретно, дружески
- Используй данные пользователя в ответе (имя, калории, факты)
- Давай точные советы (конкретные блюда, граммовки, время)
- Если спрашивают что съесть — предлагай реальные блюда с калориями
- До 180 слов, используй эмодзи умеренно
- НЕ повторяй данные которые пользователь уже знает${waterInstruction}`;
}

// Map a Gemini failure onto a localised, actionable message.
function _aiErrorText(e){
  const msg = String(e?.message || e || '');
  if(/quota|429|exceeded|limit/i.test(msg)) return t('ai_err_quota');
  if(/API key|invalid|ключ/i.test(msg))     return t('ai_err_key');
  if(/Failed to fetch|TypeError/i.test(msg)){
    const isLocal = location.protocol==='file:' || location.protocol==='content:' || !location.hostname;
    return isLocal ? t('ai_err_local') : t('ai_err_server');
  }
  if(/GitHub Pages/i.test(msg)) return '🌐 '+msg;
  if(/network|Нет соединения|No connection/i.test(msg)) return t('ai_err_net');
  return t('ai_err_generic');
}

async function aiSend(){
  // While a reply is in flight the send button becomes a stop button.
  if (_aiBusy) { aiCancel(); return; }
  const inp = document.getElementById('aiinp');
  const txt = (inp?.value || '').trim();
  const photo = _aiPhoto;
  if (!txt && !photo) return;
  if (!hasApiKey()) { openApi(); return; }

  if (inp) { inp.value = ''; aiGrowInput(inp); }
  HFX.medium(); SFX.play('ai_send');

  // Persist the attached photo so the transcript survives a reload.
  let imgId = null;
  if (photo) {
    try {
      const ref = await storeFoodImage(photo.dataUrl);
      imgId = ref.imgId || null;
    } catch(e) {}
  }
  aiClearPhoto();
  aiPush('user', txt, imgId ? { imgId } : undefined);

  const sys = _aiBuildSystemPrompt();
  // Conversation memory — only include prior turns when the user has opted in,
  // since this meaningfully increases token usage per request.
  const history = isChatMemoryOn()
    ? aiConvo.map(m => ({ role: m.role, parts: [{ text: m.text }] }))
    : [];

  const parts = [];
  if (photo) {
    parts.push({ inline_data: { mime_type: 'image/jpeg', data: photo.dataUrl.split(',')[1] } });
    // With an image but no question, ask the obvious thing.
    parts.push({ text: txt || t('ai_photo_default_q') });
  } else {
    parts.push({ text: txt });
  }

  const token = ++_aiToken;
  _aiBusy = true;
  _aiSyncSendBtn();
  aiSetStatus('busy');
  _aiAppendTyping();
  aiScrollToEnd(false);

  try {
    const r = await gem(parts, sys, {}, history);
    if (token !== _aiToken) return;            // cancelled or superseded
    HFX.double(); SFX.play('ai_reply');
    aiPush('ai', r);
    aiConvo.push({ role: 'user', text: txt || t('ai_photo_default_q') });
    aiConvo.push({ role: 'model', text: r });
    if (aiConvo.length > AI_CHAT_MAX) aiConvo.splice(0, aiConvo.length - AI_CHAT_MAX);
  } catch(e) {
    if (token !== _aiToken) return;
    HFX.error(); SFX.play('ai_error');
    aiPush('err', _aiErrorText(e));
  } finally {
    if (token === _aiToken) {
      _aiBusy = false;
      _aiRemoveTyping();
      _aiSyncSendBtn();
      aiSetStatus(navigator.onLine ? 'on' : 'off');
    }
  }
}

// Abandon the in-flight reply. The request itself cannot be aborted (an
// AbortSignal cannot be structured-cloned through the Service Worker), so the
// response is discarded instead — the user gets their input back immediately.
function aiCancel(){
  if (!_aiBusy) return;
  _aiToken++;
  _aiBusy = false;
  _aiRemoveTyping();
  _aiSyncSendBtn();
  aiSetStatus(navigator.onLine ? 'on' : 'off');
  HFX.light(); SFX.play('back');
  showToast(t('ai_cancelled'));
}

// ── Markdown-ish rendering ───────────────────────────────────────
// Escapes first, so a model that emits raw tags (or a user pasting markup)
// can never inject anything into the transcript.
function fmt(src){
  const lines = esc(String(src == null ? '' : src)).split(/\r?\n/);
  const out = [];
  let list = null;                                  // 'ul' | 'ol' | null
  const inline = (s2) => s2
    .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/(^|[\s(])\*([^*\n]+)\*(?=[\s.,!?)]|$)/g, '$1<i>$2</i>');
  const closeList = () => { if (list) { out.push(`</${list}>`); list = null; } };
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) { closeList(); continue; }
    const bullet = line.match(/^(?:[-*•]|&bull;)\s+(.*)$/);
    const numbered = line.match(/^\d+[.)]\s+(.*)$/);
    if (bullet) {
      if (list !== 'ul') { closeList(); out.push('<ul>'); list = 'ul'; }
      out.push('<li>' + inline(bullet[1]) + '</li>');
      continue;
    }
    if (numbered) {
      if (list !== 'ol') { closeList(); out.push('<ol>'); list = 'ol'; }
      out.push('<li>' + inline(numbered[1]) + '</li>');
      continue;
    }
    closeList();
    out.push(inline(line));
    out.push('<br>');
  }
  closeList();
  // Drop a trailing line break so bubbles do not gain empty space.
  while (out.length && out[out.length - 1] === '<br>') out.pop();
  return out.join('');
}


// ADD FOOD
// The diary itself works fully offline and without an API key (favourites,
// manual edit, barcode lookup via OpenFoodFacts). Only the AI-backed tabs
// need a key, and they surface that themselves — so opening the sheet must
// not be blocked. It used to bounce straight to the API-key modal, which made
// the app unusable without a key despite the offline screen promising
// otherwise.
function openAdd(){HFX.medium();SFX.play('sheet_open');document.getElementById('addOv').classList.add('on');lockScroll(true);
  setTimeout(()=>{const _fi=document.querySelector('#addOv .add-inp');if(_fi)_fi.focus();},350);
  setTimeout(()=>_initPill('addTabPill','addTabs'),60);}
function closeAdd(){HFX.light();SFX.play('sheet_close');document.getElementById('addOv').classList.remove('on');lockScroll(false);}
// NB: the parameter is deliberately *not* called `t` — that identifier is the
// global translator, and shadowing it here made every future edit a trap.
function swTab(name, btn){
  HFX.tick(); SFX.play('btn_tap');
  document.querySelectorAll('#addTabs .tab').forEach(b=>b.classList.remove('on'));
  btn.classList.add('on');
  _movePill('addTabPill', btn);
  // Crossfade panels — no height jump
  const panels = document.querySelectorAll('#addOv .panel');
  const next = document.getElementById('tp-'+name);
  panels.forEach(p=>{
    if(p === next) return;
    p.classList.remove('on');
  });
  if(name==='favs') renderFavs();
  if(next && !next.classList.contains('on')){
    next.style.opacity = '0';
    next.style.transform = 'translateY(6px)';
    next.classList.add('in');
    requestAnimationFrame(()=>{
      next.classList.add('on');
      next.classList.remove('in');
      requestAnimationFrame(()=>{
        next.style.opacity = '';
        next.style.transform = '';
      });
    });
  }
}

// Photo
let phFile=null;
let phDataUrl=null; // store dataURL once, reuse everywhere
function onPhoto(e){
  const file=e.target.files[0];if(!file)return;
  SFX.play('photo_snap'); HFX.light();
  phFile=file;
  phDataUrl=null;
  document.getElementById('pherr').classList.remove('on');
  document.getElementById('phres').classList.remove('on');
  document.getElementById('phAddbtn').style.display='none';
  // Read file ONCE via FileReader
  const fr=new FileReader();
  fr.onload=()=>{
    phDataUrl=fr.result; // full data:image/jpeg;base64,XXX
    document.getElementById('previmg').src=phDataUrl;
    document.getElementById('prevw').style.display='block';
    document.getElementById('upz').style.display='none';
    document.getElementById('phDescWrap').style.display='block';
    document.getElementById('phAbtn').style.display='block';
    _updatePhotoButtons();
  };
  fr.onerror=()=>{ showErr('pherr',t('err_file_open')); };
  fr.readAsDataURL(file);
}
function rstPhoto(){
  phFile=null;phDataUrl=null;
  const c=document.getElementById('phinp_cam');if(c)c.value='';
  const g=document.getElementById('phinp_gal');if(g)g.value='';
  document.getElementById('prevw').style.display='none';
  document.getElementById('upz').style.display='block';
  document.getElementById('phAbtn').style.display='none';
  document.getElementById('phDescWrap').style.display='none';
  document.getElementById('phDesc').value='';
  document.getElementById('phres').classList.remove('on');
  document.getElementById('phAddbtn').style.display='none';
}
// Reflect connectivity in the photo tab's buttons: offline (or with every key
// on cooldown) the primary action parks the photo instead of failing.
function _updatePhotoButtons(){
  const wait=photoMustWait();
  const main=document.getElementById('phAnalyzeBtn');
  const note=document.getElementById('phOfflineNote');
  const later=document.getElementById('phQueueBtn');
  if(main) main.textContent=wait?t('photo_queue'):t('photo_analyze');
  if(note) note.style.display=wait?'block':'none';
  if(later) later.style.display='none';
}
window.addEventListener('online',()=>{ try{_updatePhotoButtons();}catch(e){} });
window.addEventListener('offline',()=>{ try{_updatePhotoButtons();}catch(e){} });

// Shared photo-analysis call. Extracted from doPhoto() so the offline queue
// can replay the exact same prompt later without duplicating it.
// Accepts a data URL or bare base64 and returns the parsed result object.
async function analyzePhotoData(imgOrDataUrl, userDesc){
  const imgData = String(imgOrDataUrl || '').startsWith('data:')
    ? String(imgOrDataUrl).split(',')[1]
    : String(imgOrDataUrl || '');
  if (!imgData) throw new Error(t('err_file_open'));
  const descHint = userDesc ? `\nUser hint: "${userDesc}" — use this to clarify the dish name and portion.` : '';
  // Names/descriptions must come back in the UI language, otherwise an
  // English user gets Russian dish names in their diary.
  const outLang = LANG === 'en' ? 'English' : 'Russian';
  const p = `Analyze this food photo.${descHint}\nAll human-readable text in your answer (food, portion, description, ingredient names) MUST be written in ${outLang}.\nReturn ONLY JSON, no other text:\n{"food":"name in ${outLang}","portion":"amount","calories":200,"protein":10,"fat":8,"carbs":20,"description":"brief description in ${outLang}","ingredients":[{"name":"ingredient in ${outLang}","calories":50}]}`;
  const part = { inline_data: { mime_type: 'image/jpeg', data: imgData } };
  let raw = await gem([{ text: p }, part], '', { json: true, maxOutputTokens: 2048 });
  try { return pj(raw); }
  catch(e) {
    // One retry without JSON mode in case the model misbehaves with structured output.
    raw = await gem([{ text: p + '\nReturn ONLY raw JSON, no markdown.' }, part], '', { maxOutputTokens: 2048 });
    try { return pj(raw); }
    catch(e2) { throw new Error(t('photo_parse_error')); }
  }
}

// True when an immediate analysis cannot succeed, so the photo should be
// queued instead of failing in the user's face.
function photoMustWait(){
  return !navigator.onLine || !hasUsableApiKey();
}

// Park the currently picked photo for later analysis.
async function queuePhoto(){
  if(!phFile) return;
  const btnWrap=document.getElementById('phAbtn');
  if(btnWrap) btnWrap.style.display='none';
  document.getElementById('pherr').classList.remove('on');
  document.getElementById('phldr').classList.add('on');
  try{
    const imgData=await b64(phFile);
    const n=await enqueuePhoto('data:image/jpeg;base64,'+imgData, document.getElementById('phDesc').value.trim());
    if(n<0){ HFX.error(); if(btnWrap) btnWrap.style.display='block'; return; }
    HFX.success(); SFX.play('save');
    showToast(t('queue_added'));
    rstPhoto(); closeAdd();
    try{ rH(); }catch(e){}
  }catch(e){
    HFX.error(); SFX.play('error');
    showErr('pherr', String(e.message||e||t('err_unknown')));
    if(btnWrap) btnWrap.style.display='block';
  }finally{
    document.getElementById('phldr').classList.remove('on');
  }
}

async function doPhoto(){
  if(!phFile)return;
  // Offline, or every key on cooldown: queue instead of failing. The photo is
  // analysed automatically as soon as the app can reach Gemini again.
  if(photoMustWait()) return queuePhoto();
  document.getElementById('phAbtn').style.display='none';
  document.getElementById('pherr').classList.remove('on');
  document.getElementById('phldr').classList.add('on');
  try{
    const imgData=await b64(phFile);
    const _srcUrl='data:image/jpeg;base64,'+imgData;
    document.getElementById('previmg').src=_srcUrl;
    const userDesc=document.getElementById('phDesc').value.trim();
    const r=await analyzePhotoData(imgData,userDesc);
    // The full-size analysis image is NOT what gets persisted — a 480px
    // thumbnail goes to IndexedDB instead. Keeping the 1024px base64 blob in
    // localStorage is what used to blow the 5 MB quota after about a week and
    // silently stop saving new entries.
    const _imgRef=await storeFoodImage(_srcUrl);
    const _g=t('unit_g');
    cur.photo={food:r.food,portion:r.portion,kcal:r.calories||0,prot:r.protein||0,fat:r.fat||0,carb:r.carbs||0,..._imgRef,time:tnow(),date:ds(),desc:r.description||'',ingr:r.ingredients||[]};
    document.getElementById('rn').textContent=r.food||t('h_dish');
    document.getElementById('rp').textContent=r.portion||'';
    document.getElementById('rk').innerHTML=(r.calories||0)+' <small>'+esc(t('unit_kcal'))+'</small>';
    document.getElementById('rpr').textContent=(r.protein||0)+_g;
    document.getElementById('rcr').textContent=(r.carbs||0)+_g;
    document.getElementById('rfr').textContent=(r.fat||0)+_g;
    document.getElementById('rd').textContent=r.description||'';
    document.getElementById('resimg').src=_srcUrl;
    document.getElementById('resimg').classList.add('on');
    if(r.ingredients?.length){
      document.getElementById('ringrlist').innerHTML=`<div class="ingr-hdr">${t('detail_ingr')}</div>`+r.ingredients.slice(0,6).map(i=>`<div class="ingr-i"><span class="ingr-n">${esc(i.name)}</span><span class="ingr-c">${Number(i.calories)||0} ${t('unit_kcal')}</span></div>`).join('');
    } else {
      document.getElementById('ringrlist').innerHTML='';
    }
    document.getElementById('prevw').style.display='none'; // hide preview when result shown
    document.getElementById('phres').classList.add('on');
    document.getElementById('phAddbtn').style.display='block';
    HFX.success();SFX.play('scan_success');
  }catch(e){const _em=String(e.message||e||t('err_unknown'));
    const _msg=/quota|exceeded|429/.test(_em)?t('err_gem_limit'):_em;
    HFX.error();SFX.play('error');
    showErr('pherr',_msg);document.getElementById('phAbtn').style.display='block';
    // If the failure was connectivity-shaped, offer the queue instead of a dead end.
    const q=document.getElementById('phQueueBtn');
    if(q&&/fetch|соединени|connection|network|интернет|GitHub Pages/i.test(_em)) q.style.display='block';
  }
  finally{document.getElementById('phldr').classList.remove('on');}
}

// Text
function fillTx(el){document.getElementById('txinp').value=el.textContent;}
function rstText(){document.getElementById('txinp').value='';document.getElementById('txres').classList.remove('on');document.getElementById('txAddbtn').style.display='none';document.getElementById('txAbtn').style.display='block';}
async function doText(){
  const inp=document.getElementById('txinp');
  const txt=inp?.value.trim()||'';
  if(!txt){
    HFX.error(); SFX.play('error');
    if(inp){
      inp.style.borderColor='var(--err)';
      inp.focus();
      setTimeout(()=>{ inp.style.borderColor=''; }, 1600);
    }
    showToast(t('text_required'));
    return;
  }
  document.getElementById('txAbtn').style.display='none';
  document.getElementById('txerr').classList.remove('on');
  document.getElementById('txldr').classList.add('on');
  try{
    const outLang=LANG==='en'?'English':'Russian';
    const sample=LANG==='en'
      ? '{"food":"Buckwheat with chicken","portion":"250 g","calories":320,"protein":28,"fat":8,"carbs":35,"description":"Buckwheat porridge with chicken breast. A balanced, high-protein meal."}'
      : '{"food":"Гречка с курицей","portion":"250г","calories":320,"protein":28,"fat":8,"carbs":35,"description":"Гречневая каша с куриной грудкой. Сбалансированное блюдо с высоким содержанием белка."}';
    const p=`You are a nutrition expert. The user ate: "${txt}". Calculate calories and macros.
All human-readable text in your answer (food, portion, description) MUST be written in ${outLang}.
Respond with ONLY a valid JSON object. No text before or after. No markdown. Example format:
${sample}
Now calculate for what the user ate and return JSON in same format:`;
    const raw=await gem([{text:p}],'',{json:true,maxOutputTokens:2048});
    const r=pj(raw);
    const _g=t('unit_g');
    cur.text={food:r.food,portion:r.portion,kcal:r.calories||0,prot:r.protein||0,fat:r.fat||0,carb:r.carbs||0,time:tnow(),date:ds(),desc:r.description||'',ingr:r.ingredients||[]};
    document.getElementById('trn').textContent=r.food||txt;
    document.getElementById('trp').textContent=r.portion||'';
    document.getElementById('trk').innerHTML=(r.calories||0)+' <small>'+esc(t('unit_kcal'))+'</small>';
    document.getElementById('trpr').textContent=(r.protein||0)+_g;
    document.getElementById('trcr').textContent=(r.carbs||0)+_g;
    document.getElementById('trfr').textContent=(r.fat||0)+_g;
    document.getElementById('trd').textContent=r.description||'';
    document.getElementById('txres').classList.add('on');
    document.getElementById('txAddbtn').style.display='block';
    HFX.success();SFX.play('scan_success');
  }catch(e){HFX.error();SFX.play('ai_error');showErr('txerr', (()=>{
      const m=String(e.message||e||'');
      const isLocal=location.protocol==='file:'||location.protocol==='content:'||!location.hostname;
      if(m==='Failed to fetch'&&isLocal) return t('err_open_pages');
      if(m==='Failed to fetch') return t('err_no_gemini');
      if(/quota|exceeded|429/.test(m)) return t('err_gem_limit');
      return m||t('err_analyze');
    })());document.getElementById('txAbtn').style.display='block';}
  finally{document.getElementById('txldr').classList.remove('on');}
}

// Barcode

// OpenFoodFacts lookup — free, no API key needed
async function _offLookup(barcode){
  try {
    const lang = LANG === 'en' ? 'en' : 'ru';
    const url = `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(barcode)}.json?lc=${lang}&fields=product_name,product_name_ru,product_name_en,brands,quantity,serving_size,nutriments,image_front_small_url`;
    const ctrl = new AbortController();
    const tm = setTimeout(() => ctrl.abort(), 6000);
    const res = await fetch(url, { signal: ctrl.signal });
    clearTimeout(tm);
    if (!res.ok) return null;
    const data = await res.json();
    if (!data || data.status !== 1 || !data.product) return null;
    const p = data.product;
    const n = p.nutriments || {};
    const name = (lang === 'ru' ? p.product_name_ru : p.product_name_en) || p.product_name || p.brands || t('product_default');
    const portionRaw = p.serving_size || (n['energy-kcal_serving'] ? (LANG==='en'?'1 serving':'1 порция') : (p.quantity || (LANG==='en'?'100 g':'100г')));
    // Per-serving where available, else per-100g
    const perServing = (n['energy-kcal_serving'] != null);
    const get = (k) => perServing ? (n[k+'_serving'] ?? n[k+'_100g'] ?? 0) : (n[k+'_100g'] ?? n[k+'_serving'] ?? 0);
    const kcal = Math.round(get('energy-kcal') || 0);
    const prot = Math.round((get('proteins') || 0) * 10) / 10;
    const fat  = Math.round((get('fat') || 0) * 10) / 10;
    const carb = Math.round((get('carbohydrates') || 0) * 10) / 10;
    if (!kcal && !prot && !fat && !carb) return null;
    return {
      food: (p.brands ? p.brands.split(',')[0].trim() + ' ' : '') + name,
      portion: portionRaw,
      calories: kcal, protein: prot, fat: fat, carbs: carb,
      description: p.brands ? `${p.brands}` : '',
      image_url: p.image_front_small_url || '',
      _source: 'openfoodfacts',
    };
  } catch(e) { return null; }
}

// Try to extract barcode digits from Gemini OCR (used as a faster path before nutrition lookup)
async function _ocrBarcode(b, mime){
  try {
    const p = 'Read the barcode digits on this product photo. Reply with ONLY the digits (8-14 digit EAN/UPC). If unreadable reply NONE.';
    const raw = await gem([{ text: p }, { inline_data: { mime_type: mime, data: b } }]);
    const digits = (raw || '').replace(/\D+/g, '');
    if (digits.length >= 8 && digits.length <= 14) return digits;
  } catch(e) {}
  return null;
}

function _renderBarcodeResult(r){
  cur.barcode = { food: r.food, portion: r.portion, kcal: r.calories||0, prot: r.protein||0, fat: r.fat||0, carb: r.carbs||0, time: tnow(), date: ds() };
  const _g = t('unit_g');
  document.getElementById('brn').textContent = r.food || t('product_default');
  document.getElementById('brp').textContent = r.portion || '';
  document.getElementById('brk').innerHTML = (r.calories || 0) + ' <small>' + esc(t('unit_kcal')) + '</small>';
  document.getElementById('brpr').textContent = (r.protein || 0) + _g;
  document.getElementById('brcr').textContent = (r.carbs || 0) + _g;
  document.getElementById('brfr').textContent = (r.fat || 0) + _g;
  document.getElementById('brd').textContent = (r._source === 'openfoodfacts' ? '🌍 OpenFoodFacts · ' : '') + (r.description || '');
  document.getElementById('bcres').classList.add('on');
  document.getElementById('bcAddbtn').style.display = 'block';
  HFX.success(); SFX.play('scan_success');
}

async function doBarcodeManual(){
  const inp = document.getElementById('bc_manual');
  const code = (inp?.value || '').replace(/\D+/g,'');
  if (code.length < 8 || code.length > 14) {
    HFX.error(); SFX.play('error');
    if (inp) {
      inp.style.borderColor = 'var(--err)';
      setTimeout(()=>{ inp.style.borderColor=''; }, 1600);
    }
    showToast(t('bc_ean_hint'));
    return;
  }
  HFX.light(); SFX.play('barcode_scan');
  document.getElementById('bcerr').classList.remove('on');
  document.getElementById('bcldr').classList.add('on');
  try {
    const r = await _offLookup(code);
    if (r) { _renderBarcodeResult(r); return; }
    showErr('bcerr', t('bc_not_found'));
  } catch(e) {
    HFX.error(); SFX.play('ai_error');
    showErr('bcerr', String(e.message || e || t('err_analyze')));
  } finally {
    document.getElementById('bcldr').classList.remove('on');
  }
}

async function doBarcode(e){
  const file=e.target.files[0];if(!file)return;
  HFX.light(); SFX.play('barcode_scan');
  document.getElementById('bcerr').classList.remove('on');
  document.getElementById('bcldr').classList.add('on');
  try{
    const b=await b64(file),mime=file.type||'image/jpeg';
    // 1) Try fast path: OCR digits → OpenFoodFacts
    const code = await _ocrBarcode(b, mime);
    if (code) {
      const r = await _offLookup(code);
      if (r) { _renderBarcodeResult(r); return; }
    }
    // 2) Fallback: Gemini full vision analysis
    const outLang=LANG==='en'?'English':'Russian';
    const sample=LANG==='en'
      ? `{"food":"Lay's Sour Cream chips","portion":"30 g","calories":165,"protein":2,"fat":11,"carbs":15,"description":"Potato chips. A calorie-dense snack."}`
      : `{"food":"Чипсы Lay's Сметана","portion":"30г","calories":165,"protein":2,"fat":11,"carbs":15,"description":"Картофельные чипсы. Высококалорийный снек."}`;
    const p=`You are a nutrition expert. This photo shows a product barcode or packaging. Identify the product and its nutrition info per serving or per 100g.
All human-readable text in your answer MUST be written in ${outLang}.
Respond with ONLY a valid JSON object. No text before or after. No markdown. Example:
${sample}
Return JSON for the product in this photo:`;
    const raw=await gem([{text:p},{inline_data:{mime_type:mime,data:b}}],'',{json:true,maxOutputTokens:2048});
    const r=pj(raw);
    _renderBarcodeResult(r);
  }catch(e){HFX.error();SFX.play('ai_error');showErr('bcerr', String(e.message||e||t('err_analyze')));}
  finally{document.getElementById('bcldr').classList.remove('on');
    // Reset file inputs so the same file can be selected again
    try { document.getElementById('bc_cam').value=''; document.getElementById('bc_gal').value=''; } catch(e){}
  }
}

// Detect if food item is a beverage and estimate ml
function _detectBeverage(item) {
  const f = (item.food||'').toLowerCase();
  const p = (item.portion||'').toLowerCase();
  const beverageWords = ['вода','чай','кофе','сок','молоко','кефир','компот','морс','лимонад','напиток','смузи','коктейль','газировка','пепси','кола','sprite','fanta','нектар','какао','цикорий','матча',
    'water','tea','coffee','juice','milk','kefir','lemonade','soda','drink','smoothie','shake','cocoa','latte','cappuccino','espresso','americano','matcha','cola','pepsi','beverage','kombucha','ayran'];
  const isBeverage = beverageWords.some(w => _hasNeedle(f, w));
  if (!isBeverage) return null;
  // Estimate ml from portion
  let ml = 200; // default
  const mlMatch = p.match(/(\d+)\s*(?:мл|ml)/);
  const gMatch = p.match(/(\d+)\s*(?:г|g)\b/);
  const lMatch = p.match(/(\d+(?:[.,]\d+)?)\s*(?:л|l)\b/);
  if (mlMatch) ml = parseInt(mlMatch[1]);
  else if (lMatch) ml = Math.round(parseFloat(lMatch[1].replace(',','.')) * 1000);
  else if (gMatch) ml = parseInt(gMatch[1]);
  // Cap reasonable values
  ml = Math.max(50, Math.min(1500, ml));
  // Match to DRINKS for hydration factor
  let drinkId = 'other';
  const has = (...ws) => ws.some(w => _hasNeedle(f, w));
  if (has('вода','water')) drinkId = 'water';
  else if (has('чай','tea','матча','matcha')) drinkId = 'tea';
  else if (has('кофе','coffee','латте','latte','cappuccino','капучино','espresso','americano')) drinkId = 'coffee';
  else if (has('сок','нектар','juice','nectar')) drinkId = 'juice';
  else if (has('молоко','кефир','какао','milk','kefir','cocoa','ayran')) drinkId = 'milk';
  return { ml, drinkId };
}

function rstBarcode(){
  document.getElementById('bcres').classList.remove('on');
  document.getElementById('bcAddbtn').style.display='none';
  document.getElementById('bcerr').classList.remove('on');
}
// `kind` is one of 'photo' | 'text' | 'barcode'. (It used to be named `t`,
// shadowing the global translator inside this function.)
function addRes(kind){
  const item=cur[kind];if(!item)return;
  HFX.success(); SFX.play('add_food');
  log.unshift(item);
  // If the write failed (out of quota) roll the entry back out of memory so
  // the UI never shows a record that will vanish on the next reload.
  if(!saveLog()){ log.shift(); HFX.error(); return; }
  cur[kind]=null;
  // Auto-detect beverage → add to water tracker (background bookkeeping only;
  // the toast + widget refresh are gated behind the water-tracking toggle so
  // the feature stays invisible while it's off).
  const bev = _detectBeverage(item);
  if (bev) {
    const arr = getWaterToday();
    arr.push({ id: bev.drinkId, ml: bev.ml, t: item.time || tnow(), fromFood: true });
    S('water_'+ds(), JSON.stringify(arr));
    if (isWaterOn()) {
      rWater();
      showToast(tf('water_added_toast',{ml:bev.ml}));
    }
  }
  rH(); closeAdd();
  if(kind==='photo') rstPhoto();
  if(kind==='text')  rstText();
  if(kind==='barcode') rstBarcode();
}
