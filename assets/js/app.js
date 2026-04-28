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

// Debounced render utility — coalesces rapid state-change re-renders
// so that many fast LS writes only trigger one DOM rebuild per ~80ms tick.
const _rDebounce = {};
function debouncedRender(name, fn, wait){
  wait = wait || 80;
  clearTimeout(_rDebounce[name]);
  _rDebounce[name] = setTimeout(() => { try { fn(); } catch(e) { console.warn(name, e); } }, wait);
}
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
  document.getElementById('abar').style.display=key?'none':'flex';
  const _sk=streak();
  const _psk=parseInt(sessionStorage.getItem('_sk')||'0');
  if(_sk>_psk&&_psk>=0&&_sk>0){sessionStorage.setItem('_sk',_sk);if(_psk>0)SFX.play('streak_up');}
  document.getElementById('snum').textContent=_sk;
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
  ring.style.stroke=tt.k>g*1.05?'var(--err)':'var(--acc)';
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

  // Mini water — always refresh
  _updateMiniWater();
  const logEl=document.getElementById('hlog');
  if(!tl.length){logEl.innerHTML=`<div class="empty"><span class="ei">🥗</span><p>${t('h_tap_plus')}</p></div>`;return;}

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
  mealOrder.forEach(mealKey => {
    const items = groups[mealKey];
    if (!items.length) return;
    const meta = MEAL_META[mealKey];
    const mealKcal = items.reduce((s,i) => s + (i.kcal||0), 0);
    html += `<div class="meal-group" data-meal="${mealKey}">
      <div class="meal-group-hdr">
        <span class="meal-group-icon">${meta.icon}</span>
        <span class="meal-group-name">${meta.label}</span>
        <span class="meal-group-kcal">${mealKcal} ${t('unit_kcal')}</span>
      </div>`;
    items.forEach(item => {
      const idx = log.indexOf(item);
      const em = emo(item.food||'');
      const qty = item.qty||1;
      html += `<div class="logitem" onclick="openFd(${idx})">
        ${item.img?`<img class="li-img" src="${item.img}" onerror="this.outerHTML='<div class=\\'li-img\\'>${em}</div>'">`:`<div class="li-img">${em}</div>`}
        <div class="li-info">
          <div class="li-name">${item.food||t('h_dish')}${qty>1?`<span class="li-qty">${qty} ${t('unit_pcs')}</span>`:''}${item.isDrink?'<span class="li-drink-tag">💧</span>':''}</div>
          <div class="li-sub">${item.time}${item.portion?' · '+item.portion:''}</div>
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
  logEl.innerHTML = html;
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
    const fav={food:item.food,portion:item.portion,kcal:item.kcal,prot:item.prot,fat:item.fat,carb:item.carb,img:item.img||null};
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
  el.innerHTML=favs.map((f,fi)=>`<div class="fav-item">
    <div class="fav-icon">${f.img?`<img src="${f.img}" style="width:40px;height:40px;border-radius:12px;object-fit:cover">`:emo(f.food||'')}</div>
    <div class="fav-info">
      <div class="fav-name">${f.food||t('h_dish')}</div>
      <div class="fav-kcal">${f.kcal} ${t('unit_kcal')}${f.portion?' · '+f.portion:''}</div>
    </div>
    <button class="fav-del-btn" onclick="removeFav(${fi})" title="${t('delete_action')}">✕</button>
    <button class="fav-add-btn" onclick="addFavToLog(${fi})">${t('fav_add_btn')}</button>
  </div>`).join('');
}
function addFavToLog(fi){
  const favs=getFavs();
  const f=favs[fi];if(!f)return;
  const entry={...f,time:tnow(),date:ds(),qty:1};
  log.unshift(entry);S('log',JSON.stringify(log));
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


// ── FOOD DATABASE ──
const FOOD_DB = [
  // Зерновые и крупы
  {n:'Гречка варёная',p:'200г',k:132,pr:5,ft:1,cb:26},{n:'Рис варёный',p:'200г',k:260,pr:5,ft:0,cb:57},
  {n:'Овсянка на воде',p:'200г',k:88,pr:3,ft:2,cb:15},{n:'Овсянка на молоке',p:'200г',k:140,pr:6,ft:4,cb:21},
  {n:'Перловка варёная',p:'200г',k:160,pr:4,ft:1,cb:34},{n:'Пшено варёное',p:'200г',k:188,pr:5,ft:1,cb:40},
  {n:'Спагетти варёные',p:'200г',k:280,pr:10,ft:1,cb:56},{n:'Макароны варёные',p:'200г',k:264,pr:9,ft:1,cb:53},
  {n:'Хлеб белый',p:'1 кусок 30г',k:79,pr:2,ft:1,cb:15},{n:'Хлеб ржаной',p:'1 кусок 30г',k:66,pr:2,ft:1,cb:13},
  {n:'Батон нарезной',p:'1 кусок 25г',k:63,pr:2,ft:1,cb:12},{n:'Лаваш',p:'1 шт 60г',k:165,pr:5,ft:2,cb:32},
  // Мясо и птица
  {n:'Куриная грудка варёная',p:'150г',k:165,pr:34,ft:3,cb:0},{n:'Куриная грудка жареная',p:'150г',k:200,pr:32,ft:7,cb:0},
  {n:'Куриное бедро варёное',p:'150г',k:222,pr:26,ft:13,cb:0},{n:'Говядина варёная',p:'150г',k:255,pr:29,ft:15,cb:0},
  {n:'Свинина жареная',p:'150г',k:360,pr:24,ft:28,cb:0},{n:'Фарш говяжий жареный',p:'150г',k:345,pr:26,ft:26,cb:0},
  {n:'Котлета домашняя',p:'1 шт 100г',k:235,pr:15,ft:17,cb:7},{n:'Сосиски молочные',p:'2 шт 80г',k:208,pr:9,ft:18,cb:2},
  {n:'Колбаса докторская',p:'100г',k:260,pr:13,ft:22,cb:2},{n:'Бекон жареный',p:'50г',k:243,pr:9,ft:22,cb:0},
  // Рыба и морепродукты
  {n:'Лосось запечённый',p:'150г',k:280,pr:33,ft:16,cb:0},{n:'Тунец в собственном соку',p:'1 банка 100г',k:96,pr:22,ft:1,cb:0},
  {n:'Горбуша варёная',p:'150г',k:175,pr:31,ft:5,cb:0},{n:'Минтай запечённый',p:'150г',k:126,pr:28,ft:1,cb:0},
  {n:'Скумбрия запечённая',p:'150г',k:317,pr:27,ft:22,cb:0},{n:'Креветки варёные',p:'150г',k:142,pr:29,ft:2,cb:1},
  {n:'Красная икра',p:'1 ч.л. 15г',k:36,pr:4,ft:2,cb:0},
  // Молочные продукты
  {n:'Творог 5%',p:'200г',k:190,pr:27,ft:10,cb:6},{n:'Творог 0%',p:'200г',k:142,pr:28,ft:0,cb:8},
  {n:'Йогурт натуральный',p:'200г',k:122,pr:8,ft:3,cb:14},{n:'Кефир 1%',p:'250мл',k:73,pr:8,ft:3,cb:10},
  {n:'Молоко 2.5%',p:'250мл',k:153,pr:8,ft:6,cb:15},{n:'Молоко 3.2%',p:'250мл',k:160,pr:8,ft:8,cb:12},
  {n:'Сыр твёрдый',p:'30г',k:114,pr:8,ft:9,cb:0},{n:'Сыр Пармезан',p:'30г',k:132,pr:11,ft:9,cb:1},
  {n:'Сыр Адыгейский',p:'100г',k:264,pr:19,ft:20,cb:0},{n:'Масло сливочное',p:'10г',k:74,pr:0,ft:8,cb:0},
  {n:'Сметана 15%',p:'2 ст.л. 40г',k:62,pr:1,ft:6,cb:2},{n:'Мороженое',p:'1 шарик 80г',k:160,pr:3,ft:8,cb:20},
  // Яйца
  {n:'Яйцо варёное',p:'1 шт 55г',k:78,pr:6,ft:5,cb:1},{n:'Яичница из 2 яиц',p:'120г',k:190,pr:13,ft:14,cb:1},
  {n:'Омлет 2 яйца',p:'150г',k:205,pr:14,ft:15,cb:3},
  // Овощи
  {n:'Картофель варёный',p:'200г',k:166,pr:4,ft:0,cb:38},{n:'Картофель жареный',p:'200г',k:380,pr:4,ft:18,cb:50},
  {n:'Картофельное пюре',p:'200г',k:194,pr:4,ft:7,cb:28},{n:'Морковь сырая',p:'1 шт 100г',k:41,pr:1,ft:0,cb:10},
  {n:'Свёкла варёная',p:'100г',k:49,pr:2,ft:0,cb:11},{n:'Брокколи варёная',p:'200г',k:70,pr:6,ft:1,cb:13},
  {n:'Капуста тушёная',p:'200г',k:90,pr:3,ft:4,cb:12},{n:'Огурец',p:'1 шт 120г',k:18,pr:1,ft:0,cb:4},
  {n:'Помидор',p:'1 шт 120г',k:22,pr:1,ft:0,cb:5},{n:'Болгарский перец',p:'1 шт 130г',k:39,pr:1,ft:0,cb:9},
  {n:'Лук репчатый',p:'1 шт 100г',k:41,pr:1,ft:0,cb:10},{n:'Чеснок',p:'2 зубчика 10г',k:15,pr:1,ft:0,cb:3},
  {n:'Баклажан жареный',p:'150г',k:105,pr:2,ft:7,cb:9},{n:'Кабачок тушёный',p:'200г',k:54,pr:2,ft:2,cb:7},
  // Бобовые
  {n:'Чечевица варёная',p:'200г',k:230,pr:18,ft:1,cb:40},{n:'Фасоль красная варёная',p:'200г',k:228,pr:15,ft:1,cb:41},
  {n:'Нут варёный',p:'200г',k:364,pr:20,ft:6,cb:60},{n:'Горох варёный',p:'200г',k:196,pr:13,ft:1,cb:36},
  // Фрукты
  {n:'Яблоко',p:'1 шт 180г',k:94,pr:0,ft:0,cb:25},{n:'Банан',p:'1 шт 130г',k:119,pr:1,ft:0,cb:31},
  {n:'Апельсин',p:'1 шт 180г',k:86,pr:2,ft:0,cb:22},{n:'Мандарин',p:'2 шт 120г',k:62,pr:1,ft:0,cb:15},
  {n:'Груша',p:'1 шт 160г',k:88,pr:1,ft:0,cb:23},{n:'Виноград',p:'150г',k:103,pr:1,ft:0,cb:27},
  {n:'Арбуз',p:'300г',k:90,pr:2,ft:0,cb:21},{n:'Клубника',p:'150г',k:48,pr:1,ft:0,cb:11},
  {n:'Черника',p:'100г',k:57,pr:1,ft:0,cb:14},{n:'Авокадо',p:'½ шт 80г',k:128,pr:2,ft:12,cb:7},
  // Орехи и семена
  {n:'Грецкий орех',p:'30г',k:196,pr:5,ft:20,cb:4},{n:'Миндаль',p:'30г',k:175,pr:6,ft:15,cb:6},
  {n:'Арахис',p:'30г',k:176,pr:8,ft:14,cb:6},{n:'Кешью',p:'30г',k:174,pr:5,ft:14,cb:9},
  {n:'Семена чиа',p:'1 ст.л. 15г',k:72,pr:2,ft:5,cb:6},{n:'Льняное семя',p:'1 ст.л. 15г',k:83,pr:3,ft:6,cb:4},
  // Соусы и масла
  {n:'Оливковое масло',p:'1 ст.л. 15г',k:135,pr:0,ft:15,cb:0},{n:'Подсолнечное масло',p:'1 ст.л. 15г',k:135,pr:0,ft:15,cb:0},
  {n:'Майонез',p:'1 ст.л. 25г',k:173,pr:0,ft:19,cb:1},{n:'Кетчуп',p:'2 ст.л. 40г',k:50,pr:1,ft:0,cb:12},
  {n:'Соевый соус',p:'1 ст.л. 15г',k:13,pr:2,ft:0,cb:1},{n:'Мёд',p:'1 ст.л. 20г',k:64,pr:0,ft:0,cb:17},
  // Готовые блюда
  {n:'Борщ',p:'300г',k:165,pr:8,ft:6,cb:22},{n:'Щи',p:'300г',k:126,pr:6,ft:4,cb:17},
  {n:'Пельмени варёные',p:'200г',k:420,pr:19,ft:17,cb:47},{n:'Вареники с картошкой',p:'200г',k:280,pr:9,ft:6,cb:48},
  {n:'Пицца Маргарита',p:'2 куска 200г',k:500,pr:20,ft:18,cb:64},{n:'Бургер',p:'1 шт 200г',k:480,pr:24,ft:24,cb:44},
  {n:'Шаурма',p:'1 шт 350г',k:700,pr:32,ft:35,cb:62},{n:'Роллы Калифорния',p:'8 шт 200г',k:340,pr:14,ft:8,cb:52},
  {n:'Хачапури',p:'1 порция 200г',k:580,pr:20,ft:28,cb:60},{n:'Хинкали',p:'3 шт 180г',k:450,pr:22,ft:18,cb:50},
  {n:'Шашлык из свинины',p:'200г',k:500,pr:30,ft:40,cb:0},{n:'Блины',p:'3 шт 150г',k:363,pr:9,ft:14,cb:52},
  {n:'Овсяноблин',p:'1 шт 150г',k:195,pr:13,ft:6,cb:22},{n:'Сырники',p:'3 шт 180г',k:430,pr:22,ft:18,cb:44},
  {n:'Ленивые вареники',p:'200г',k:310,pr:14,ft:9,cb:44},{n:'Плов',p:'300г',k:450,pr:16,ft:14,cb:62},
  // Снеки и сладкое
  {n:'Шоколад молочный',p:'1 плитка 40г',k:216,pr:3,ft:13,cb:24},{n:'Шоколад тёмный 70%',p:'2 кусочка 20г',k:110,pr:2,ft:7,cb:10},
  {n:'Печенье овсяное',p:'3 шт 60г',k:270,pr:4,ft:11,cb:38},{n:'Чипсы Лайс',p:'1/2 пачки 30г',k:165,pr:1,ft:11,cb:16},
  {n:'Гречневые хлебцы',p:'4 шт 30г',k:107,pr:3,ft:1,cb:23},{n:'Протеиновый батончик',p:'1 шт 60г',k:220,pr:20,ft:7,cb:22},
  // Напитки (caloric)
  {n:'Кофе латте 200мл',p:'200мл',k:120,pr:6,ft:5,cb:12,isDrink:true,drinkId:'coffee',ml:200},
  {n:'Кофе американо',p:'200мл',k:10,pr:0,ft:0,cb:2,isDrink:true,drinkId:'coffee',ml:200},
  {n:'Капучино 200мл',p:'200мл',k:90,pr:5,ft:4,cb:9,isDrink:true,drinkId:'coffee',ml:200},
  {n:'Чай с сахаром',p:'250мл',k:45,pr:0,ft:0,cb:11,isDrink:true,drinkId:'tea',ml:250},
  {n:'Апельсиновый сок',p:'250мл',k:113,pr:2,ft:0,cb:26,isDrink:true,drinkId:'juice',ml:250},
  {n:'Кефир 1%',p:'250мл',k:73,pr:8,ft:3,cb:10,isDrink:true,drinkId:'milk',ml:250},
  {n:'Молочный коктейль',p:'400мл',k:400,pr:9,ft:10,cb:66,isDrink:true,drinkId:'milk',ml:400},
  {n:'Кока-Кола 330мл',p:'330мл',k:139,pr:0,ft:0,cb:35,isDrink:true,drinkId:'other',ml:330},
  {n:'Вода 250мл',p:'250мл',k:0,pr:0,ft:0,cb:0,isDrink:true,drinkId:'water',ml:250},
  {n:'Смузи фруктовый',p:'300мл',k:180,pr:2,ft:1,cb:42,isDrink:true,drinkId:'juice',ml:300},
  {n:'Протеиновый коктейль',p:'400мл',k:280,pr:30,ft:5,cb:28,isDrink:true,drinkId:'milk',ml:400},
];

function searchDB(q){renderSearchDB(q);}
function renderSearchDB(q){
  const el=document.getElementById('searchResults');
  if(!el)return;
  const query=(q||'').trim().toLowerCase();
  const results=query?FOOD_DB.filter(f=>f.n.toLowerCase().includes(query)):FOOD_DB.slice(0,30);
  if(!results.length){
    el.innerHTML='<div style="text-align:center;padding:24px;color:var(--t2);font-size:14px">Ничего не найдено</div>';
    return;
  }
  el.innerHTML=results.map((f,i)=>{
    const fIdx=FOOD_DB.indexOf(f);
    return `<div class="db-item" onclick="addDBItem(${fIdx})">
      <div class="db-ico">${emo(f.n)}</div>
      <div class="db-info">
        <div class="db-name">${f.n}</div>
        <div class="db-kcal">${f.k} ккал · ${f.p}</div>
      </div>
      <div class="db-macs">Б${f.pr} У${f.cb} Ж${f.ft}</div>
    </div>`;
  }).join('');
}
function addDBItem(idx){
  const f=FOOD_DB[idx]; if(!f) return;
  const entry={food:f.n,portion:f.p,kcal:f.k,prot:f.pr,fat:f.ft,carb:f.cb,time:tnow(),date:ds()};
  log.unshift(entry); S('log',JSON.stringify(log));
  // If drink — add to water too
  if(f.isDrink && f.ml){
    const arr=getWaterToday();
    arr.push({id:f.drinkId||'other',ml:f.ml,t:tnow(),fromFood:true});
    S('water_'+ds(),JSON.stringify(arr));
    rWater();
  }
  HFX.success(); SFX.play('add_food');
  showToast('✅ ' + f.n + ' добавлено');
  rH(); closeAdd();
}

function emo(f){
  f=f.toLowerCase();
  if(f.includes('яблок'))return'🍎';if(f.includes('банан'))return'🍌';if(f.includes('курица')||f.includes('куриц'))return'🍗';
  if(f.includes('рыб')||f.includes('лосос'))return'🐟';if(f.includes('салат'))return'🥗';if(f.includes('хлеб')||f.includes('бутерброд'))return'🍞';
  if(f.includes('суп'))return'🍲';if(f.includes('пицц'))return'🍕';if(f.includes('гречк')||f.includes('рис')||f.includes('кашa'))return'🍚';
  if(f.includes('яиц')||f.includes('яйц'))return'🥚';if(f.includes('молок')||f.includes('кефир')||f.includes('творог'))return'🥛';
  if(f.includes('кофе')||f.includes('чай'))return'☕';if(f.includes('чипс'))return'🍟';if(f.includes('шоколад')||f.includes('торт'))return'🍫';
  if(f.includes('овощ'))return'🥦';if(f.includes('фрукт'))return'🍑';return'🍽️';
}

function delL(i){
  const item=log[i];if(!item)return;
  showConfirm('🗑️',t('confirm_delete_title'),`«${item.food||t('food_default_label')}» (${item.kcal||0} ${t('food_kcal_short')})`,t('btn_delete'),()=>{
    HFX.heavy();SFX.play('delete');
    log.splice(i,1);S('log',JSON.stringify(log));rH();
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
  // Image or emoji
  const wrap=document.getElementById('fdImgWrap');
  if(item.img) wrap.innerHTML=`<img class="fd-img" src="${item.img}" onerror="this.outerHTML='<div class=\'fd-nophoto\'>${emo(item.food||'')}</div>'">`;
  else wrap.innerHTML=`<div class="fd-nophoto">${emo(item.food||'')}</div>`;
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
      ingrEl.innerHTML=`<div class="ingr-hdr">${t('detail_ingr')}</div>`+item.ingr.map(i=>`<div class="ingr-i"><span class="ingr-n">${i.name}</span><span class="ingr-c">${i.calories} ${t('unit_kcal')}</span></div>`).join('');
      ingrEl.style.display='block';
    } else {
      ingrEl.style.display='none';
    }
  }
  document.getElementById('fdTime').textContent='Добавлено: '+item.date+' в '+item.time;
  document.getElementById('fdOv').classList.add('on');
  document.body.style.overflow='hidden';
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
  document.body.style.overflow='hidden';
}
function closeEditFd(){
  HFX.light(); SFX.play('sheet_close');
  document.getElementById('editFoodOv').classList.remove('on');
  document.body.style.overflow='';
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
  S('log',JSON.stringify(log));
  rH();
  closeEditFd();
  // Update detail sheet
  document.getElementById('fdName').textContent=item.food||t('h_dish');
  document.getElementById('fdKcal').textContent=item.kcal;
  document.getElementById('fdProt').textContent=Math.round(item.prot)+t('unit_g');
  document.getElementById('fdCarb').textContent=Math.round(item.carb)+t('unit_g');
  document.getElementById('fdFat').textContent=Math.round(item.fat)+t('unit_g');
  showToast(t('toast_record_updated','✏️ Запись обновлена'));
}
function closeFd(){HFX.light();SFX.play('sheet_close');document.getElementById('fdOv').classList.remove('on');document.body.style.overflow='';fdIdx=null;}
function delFd(){
  if(fdIdx===null)return;
  const item=log[fdIdx];
  showConfirm('🗑️',t('confirm_delete_diary_title'),`«${item?.food||t('food_default_label')}» (${item?.kcal||0} ${t('food_kcal_short')})`,t('btn_delete'),()=>{
    HFX.heavy();SFX.play('delete');
    log.splice(fdIdx,1);S('log',JSON.stringify(log));
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
  el.innerHTML=h;setTimeout(()=>el.parentElement.scrollLeft=9999,30);
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
  S('log',JSON.stringify(log));
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
  // Week
  const n=new Date(),dns=[t('wd_mon'),t('wd_tue'),t('wd_wed'),t('wd_thu'),t('wd_fri'),t('wd_sat'),t('wd_sun')];
  document.getElementById('wkd').innerHTML=Array.from({length:7},(_,i)=>{
    const d=new Date(n);d.setDate(d.getDate()-(6-i));
    const today=d.toDateString()===n.toDateString();
    const has=dlog(ds(d)).length>0;
    return `<div class="wd ${has?'done':today?'today':''}">${dns[(d.getDay()+6)%7]}</div>`;
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
    const tk=tot(dlog(ds(d))).k,r=tk/g;
    let c='';
    if(tk>0){
      if(r>1.5) c='ov3';   // severe: darkest red
      else if(r>1.25) c='ov2'; // high
      else if(r>1.1) c='ov1';  // moderate
      else if(r>1.0) c='ov';   // slight over
      else if(r>0.9) c='c4';
      else if(r>0.6) c='c3';
      else if(r>0.3) c='c2';
      else c='c1';
    }
    return `<div class="hcell ${c}" title="${d.toLocaleDateString(_localeTag())}: ${tk} ${t('unit_kcal')}"></div>`;
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
  document.body.style.overflow='hidden';
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
function closeWlog(){HFX.light();SFX.play('sheet_close');document.getElementById('wlogOv').classList.remove('on');document.body.style.overflow='';}
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
  
  // Get computed color for chart
  const orangeColor=getComputedStyle(document.documentElement).getPropertyValue('--primary').trim()||'#0A0A0A';
  const isDark=document.documentElement.getAttribute('data-theme')==='dark';
  const gridColor=isDark?'rgba(255,255,255,.06)':'rgba(0,0,0,.05)';
  const labelColor=isDark?'rgba(255,255,255,.35)':'rgba(10,10,10,.38)';
  const cardBg=isDark?'#1A1A1A':'#FFFFFF';
  
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
    ctx.fillText(Math.round(v)+'кг', padL-5, yy+3.5);
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
  const orangeAlpha=isDark?'rgba(250,250,250,0.10)':'rgba(10,10,10,0.07)';
  const orangeAlpha0=isDark?'rgba(250,250,250,0)':'rgba(10,10,10,0)';
  grad.addColorStop(0,orangeAlpha); grad.addColorStop(1,orangeAlpha0);
  
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
  ctx.strokeStyle=orangeColor.indexOf('#')===-1?'#0A0A0A':orangeColor;
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
    ctx.fillStyle=orangeColor.indexOf('#')===-1?'#0A0A0A':orangeColor; ctx.fill();
    
    // Label above/below first and last dot
    if(i===0||i===pts.length-1){
      const above=dotY>padT+20;
      ctx.font=`600 11px -apple-system,BlinkMacSystemFont,sans-serif`;
      ctx.textAlign='center';
      ctx.fillStyle=labelColor;
      ctx.fillText(p.v+'кг', dotX, above?dotY-10:dotY+18);
      // Date label
      const d=new Date(p.d);
      const dLbl=d.toLocaleDateString('ru',{day:'numeric',month:'short'});
      ctx.font=`400 9px -apple-system,BlinkMacSystemFont,sans-serif`;
      ctx.fillStyle=isDark?'rgba(255,255,255,.2)':'rgba(60,60,67,.3)';
      ctx.fillText(dLbl, dotX, cH-padB+14);
    }
  });
}

// AI
function initAi(){
  aiReady=true;
  const chatHistory=document.getElementById('aimsg')?.children?.length;
  const tl=tlog(),tt=tot(tl);
  const _wArr=getWaterToday();
  const waterNow=_wArr.reduce((s,e)=>s+e.ml,0);
  const waterTarget=getWaterGoal().adjusted;
  const waterTimeline=_wArr.length?_wArr.slice(-3).map(e=>e.ml+'мл '+e.t).join(', '):'';
  const c=document.getElementById('aimsg');
  // Only clear and show welcome if no messages yet
  if(!chatHistory||chatHistory<=2){
  c.innerHTML='';
  // Welcome card
  const wcard=document.createElement('div');
  wcard.className='ai-welcome';
  const _kcalUnit=t('unit_kcal');
  const _mlUnit=t('water_ml');
  const _ofWord=LANG==='en'?'of':'из';
  const _goalWord=LANG==='en'?'Goal':'Цель';
  const _leftWord=LANG==='en'?'left':'Осталось';
  const _todayWord=LANG==='en'?'Today':'Сегодня';
  wcard.innerHTML=`
    <span class="ai-welcome-icon">🤖</span>
    <div class="ai-welcome-title">${t('ai_welcome_hi')}, ${U?.name||''}!</div>
    <div class="ai-welcome-sub">${_todayWord}: <b style="color:#FF8C00">${tt.k} ${_kcalUnit}</b> ${_ofWord} ${U?.kcal||2000} · 💧 <b style="color:#3b82f6">${waterNow}${_mlUnit}</b> ${_ofWord} ${waterTarget}${_mlUnit}${waterTimeline ? '<br><span style="font-size:11px;color:var(--t2)">' + waterTimeline + '</span>' : ''}<br>${_goalWord}: «${GL[U?.goal]||'—'}» · ${_leftWord} <b>${Math.max(0,(U?.kcal||2000)-tt.k)}</b> ${_kcalUnit}</div>
  `;
  c.appendChild(wcard);
  const lbl=document.createElement('div');
  lbl.className='ai-chips-label';
  lbl.textContent=t('ai_chips_label');
  c.appendChild(lbl);
  } // end if no chat history
}
function clearAiChat(){
  showConfirm('💬',t('confirm_clear_chat_title'),t('confirm_clear_chat_body'),t('confirm_clear_chat_btn'),()=>{
    initAi();
  });
}
function aiSug(el){document.getElementById('aiinp').value=el.textContent;aiSend();}

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

async function aiSend(){
  const inp=document.getElementById('aiinp'),txt=inp.value.trim();
  if(!txt)return;if(!key){openApi();return;}
  inp.value='';HFX.medium();SFX.play('ai_send'); _aiThinkStart();aiMsg(txt,'user');

  // Rich context for AI
  const tl=tlog(),tt=tot(tl);
  const waterToday=getWaterToday();
  const totalWaterMl=waterToday.reduce((s,e)=>s+e.ml,0);
  const waterGoal=getWaterGoal().adjusted;
  const bmi=U?.w&&U?.h?((U.w/((U.h/100)**2)).toFixed(1)):'—';
  const streakDays=streak();

  // Last 7 days calories
  const week7=[];
  for(let i=1;i<=7;i++){const d=new Date();d.setDate(d.getDate()-i);const dl=dlog(ds(d));if(dl.length){const t2=tot(dl);week7.push(`${d.toLocaleDateString('ru',{weekday:'short'})}: ${t2.k}ккал`);}}

  const foodLog=tl.length
    ?tl.map((item,i)=>`  ${i+1}. ${item.food||'Блюдо'}${item.portion?' ('+item.portion+')':''}: ${item.kcal||0}ккал, Б${Math.round(item.prot||0)}г У${Math.round(item.carb||0)}г Ж${Math.round(item.fat||0)}г — ${item.time||''}`).join('\n')
    :'  (сегодня ещё ничего не добавлено)';

  const prefsStr = U?.prefs?.length ? '\n• Предпочтения: ' + U.prefs.join(', ') : '';
  const allergStr = U?.allerg ? '\n• Аллергии/ограничения: ' + U.allerg : '';
  const sys=`Ты персональный AI-нутрициолог CalSnap. Ты умный, внимательный, мотивирующий.

ДАННЫЕ ПОЛЬЗОВАТЕЛЯ:
• Имя: ${U?.name||'друг'}, пол: ${U?.gen==='m'?'мужчина':'женщина'}, возраст: ${U?.age||'?'}л
• Рост: ${U?.h||'?'}см, вес: ${U?.w||'?'}кг, ИМТ: ${bmi}
• Цель: ${GL[U?.goal]||'—'} | Норма калорий: ${U?.kcal||2000}ккал/день${prefsStr}${allergStr}
• Активность: ${U?.act||1.375} | Серия дней: ${streakDays}

СЕГОДНЯ (${new Date().toLocaleDateString('ru',{weekday:'long',day:'numeric',month:'long'})}):
${foodLog}
Итого: ${tt.k||0}ккал из ${U?.kcal||2000} (${Math.round((tt.k||0)/(U?.kcal||2000)*100)}%)
Макро: Б${Math.round(tt.p||0)}г У${Math.round(tt.c||0)}г Ж${Math.round(tt.f||0)}г
Осталось: ${Math.max(0,(U?.kcal||2000)-(tt.k||0))}ккал
Вода сегодня: ${totalWaterMl}мл из ${waterGoal}мл${waterToday.length ? ' ('+waterToday.map(e=>e.ml+'мл в '+e.t).join(', ')+')' : ''}

ИСТОРИЯ НЕДЕЛИ: ${week7.length?week7.join(', '):'нет данных'}
ВОДА (последние 7 дней): ${(()=>{const r=[];for(let i=1;i<=7;i++){const d=new Date();d.setDate(d.getDate()-i);try{const w=JSON.parse(localStorage.getItem('water_'+d.toDateString())||'[]');const tot=w.reduce((s,x)=>s+x.ml,0);if(tot>0)r.push(d.toLocaleDateString('ru',{weekday:'short'})+': '+tot+'мл');}catch(e){}}return r.length?r.join(', '):'нет данных';})()}
ВЕС (последние записи): ${wts.slice(0,5).map(w=>new Date(w.d).toLocaleDateString('ru',{day:'numeric',month:'short'})+': '+w.v+'кг').join(', ')||'нет данных'}

ИНСТРУКЦИИ:
- Отвечай по-русски, конкретно, дружески
- Используй данные пользователя в ответе (имя, калории, факты)
- Давай точные советы (конкретные блюда, граммовки, время)
- Если спрашивают что съесть — предлагай реальные блюда с калориями
- До 180 слов, используй эмодзи умеренно
- НЕ повторяй данные которые пользователь уже знает`;

  // Show typing indicator
  const lm=document.createElement('div');lm.className='msg msg-ai';
  lm.innerHTML='<div class="msg-ai-wrap"><div class="msg-ai-ava">🤖</div><div class="typing-indicator"><div class="typing-dot"></div><div class="typing-dot"></div><div class="typing-dot"></div></div></div>';
  const _c=document.getElementById('aimsg');_c.appendChild(lm);_c.scrollTop=_c.scrollHeight;
  try{
    const r=await gem([{text:txt}],sys);
    HFX.double();_aiThinkStop();
    SFX.play('ai_reply');
    const _bbl=document.createElement('div');_bbl.className='bbl';_bbl.innerHTML=fmt(r);
    lm.innerHTML='<div class="msg-ai-wrap"><div class="msg-ai-ava">🤖</div></div>';
    lm.querySelector('.msg-ai-wrap').appendChild(_bbl);
    _c.scrollTop=_c.scrollHeight;
  }
  catch(e){
    HFX.error();SFX.play('error');
    const msg=e.message||'';
    let errTxt='⚠️ Ошибка. Проверь API ключ.';
    if(msg.includes('quota')||msg.includes('429'))errTxt='⏳ Лимит запросов. Подожди минуту.';
    else if(msg.includes('API key')||msg.includes('invalid'))errTxt='🔑 Неверный API ключ → Настройки.';
    else if(msg.includes('Failed to fetch')||msg.includes('TypeError')){
      const isLocal=location.protocol==='file:'||location.protocol==='content:'||!location.hostname;
      errTxt=isLocal?'🌐 Открой через GitHub Pages\n(не как локальный файл)':'📡 Нет связи с сервером.';
    }
    else if(msg.includes('GitHub Pages'))errTxt='🌐 '+msg;
    else if(msg.includes('network'))errTxt='📡 Нет связи. Проверь интернет.';
    _aiThinkStop();
    lm.innerHTML=`<div class="msg-ai-wrap"><div class="msg-ai-ava">🤖</div><div class="bbl">${errTxt}</div></div>`;
  }
}
function aiMsg(txt,r){
  const el=document.createElement('div');el.className='msg msg-'+r;
  if(r==='ai'){
    el.innerHTML=`<div class="msg-ai-wrap"><div class="msg-ai-ava">🤖</div><div class="bbl">${fmt(txt)}</div></div>`;
  } else {
    el.innerHTML=`<div class="bbl">${txt}</div>`;
  }
  const c=document.getElementById('aimsg');c.appendChild(el);c.scrollTop=c.scrollHeight;return el;
}
function fmt(t){return t.replace(/\*\*(.*?)\*\*/g,'<b>$1</b>').replace(/\n/g,'<br>')}

// ADD FOOD
function openAdd(){if(!key){openApi();return;}HFX.medium();SFX.play('sheet_open');document.getElementById('addOv').classList.add('on');document.body.style.overflow='hidden';
  setTimeout(()=>{const _fi=document.querySelector('#addOv .add-inp');if(_fi)_fi.focus();},350);
  setTimeout(()=>_initPill('addTabPill','addTabs'),60);}
function closeAdd(){HFX.light();SFX.play('sheet_close');document.getElementById('addOv').classList.remove('on');document.body.style.overflow='';}
function swTab(t, btn){
  HFX.tick(); SFX.play('btn_tap');
  document.querySelectorAll('#addTabs .tab').forEach(b=>b.classList.remove('on'));
  btn.classList.add('on');
  _movePill('addTabPill', btn);
  // Crossfade panels — no height jump
  const panels = document.querySelectorAll('.panel');
  const next = document.getElementById('tp-'+t);
  panels.forEach(p=>{
    if(p === next) return;
    p.classList.remove('on');
  });
  if(t==='favs') renderFavs();
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
  };
  fr.onerror=()=>{ showErr('pherr','Не удалось открыть файл'); };
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
async function doPhoto(){
  if(!phFile)return;
  document.getElementById('phAbtn').style.display='none';
  document.getElementById('pherr').classList.remove('on');
  document.getElementById('phldr').classList.add('on');
  try{
    const imgData=await b64(phFile);
    const mime='image/jpeg';
    const previewSrc='data:image/jpeg;base64,'+imgData;
    document.getElementById('previmg').src=previewSrc;
    const userDesc=document.getElementById('phDesc').value.trim();
    const descHint=userDesc?`\nUser hint: "${userDesc}" — use this to clarify the dish name and portion.`:'';
    const p=`Analyze this food photo.${descHint}\nReturn ONLY JSON, no other text:\n{"food":"name in Russian","portion":"amount","calories":200,"protein":10,"fat":8,"carbs":20,"description":"brief description","ingredients":[{"name":"ingredient","calories":50}]}`;
    let raw='';
    try{ raw=await gem([{text:p},{inline_data:{mime_type:mime,data:imgData}}],'',{json:true,maxOutputTokens:2048}); }
    catch(e){ throw new Error('Gemini API: '+(e.message||e)); }
    let r;
    try{ r=pj(raw); }
    catch(e){
      // One retry without JSON mode in case the model misbehaves with structured output.
      try{
        raw=await gem([{text:p+'\nReturn ONLY raw JSON, no markdown.'},{inline_data:{mime_type:mime,data:imgData}}],'',{maxOutputTokens:2048});
        r=pj(raw);
      } catch(e2){
        throw new Error(t('photo_parse_error','Не удалось разобрать ответ AI. Попробуй ещё раз или опиши блюдо вручную.'));
      }
    }
    cur.photo={food:r.food,portion:r.portion,kcal:r.calories||0,prot:r.protein||0,fat:r.fat||0,carb:r.carbs||0,img:'data:image/jpeg;base64,'+imgData,time:tnow(),date:ds(),desc:r.description||'',ingr:r.ingredients||[]};
    document.getElementById('rn').textContent=r.food||'Блюдо';
    document.getElementById('rp').textContent=r.portion||'';
    document.getElementById('rk').innerHTML=(r.calories||0)+' <small>ккал</small>';
    document.getElementById('rpr').textContent=(r.protein||0)+'г';
    document.getElementById('rcr').textContent=(r.carbs||0)+'г';
    document.getElementById('rfr').textContent=(r.fat||0)+'г';
    document.getElementById('rd').textContent=r.description||'';
    document.getElementById('resimg').src=document.getElementById('previmg').src;
    document.getElementById('resimg').classList.add('on');
    if(r.ingredients?.length){
      document.getElementById('ringrlist').innerHTML='<div class="ingr-hdr">СОСТАВ</div>'+r.ingredients.slice(0,6).map(i=>`<div class="ingr-i"><span class="ingr-n">${i.name}</span><span class="ingr-c">${i.calories}ккал</span></div>`).join('');
    }
    document.getElementById('prevw').style.display='none'; // hide preview when result shown
    document.getElementById('phres').classList.add('on');
    document.getElementById('phAddbtn').style.display='block';
    HFX.success();SFX.play('scan_success');
  }catch(e){const _em=String(e.message||e||'Ошибка');
    const _msg=_em.includes('quota')||_em.includes('exceeded')||_em.includes('429')?'Превышен лимит Gemini API. Подожди 1-2 мин и попробуй снова.':_em;
    HFX.error();SFX.play('error');
    showErr('pherr',_msg);document.getElementById('phAbtn').style.display='block';}
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
    showToast(t('text_required','Напиши что съел'));
    return;
  }
  document.getElementById('txAbtn').style.display='none';
  document.getElementById('txerr').classList.remove('on');
  document.getElementById('txldr').classList.add('on');
  try{
    const p=`You are a nutrition expert. The user ate: "${txt}". Calculate calories and macros.
Respond with ONLY a valid JSON object. No text before or after. No markdown. Example format:
{"food":"Гречка с курицей","portion":"250г","calories":320,"protein":28,"fat":8,"carbs":35,"description":"Гречневая каша с куриной грудкой. Сбалансированное блюдо с высоким содержанием белка."}
Now calculate for what the user ate and return JSON in same format:`;
    const raw=await gem([{text:p}],'',{json:true,maxOutputTokens:2048});
    const r=pj(raw);
    cur.text={food:r.food,portion:r.portion,kcal:r.calories||0,prot:r.protein||0,fat:r.fat||0,carb:r.carbs||0,time:tnow(),date:ds(),desc:r.description||'',ingr:r.ingredients||[]};
    document.getElementById('trn').textContent=r.food||txt;
    document.getElementById('trp').textContent=r.portion||'';
    document.getElementById('trk').innerHTML=(r.calories||0)+' <small>ккал</small>';
    document.getElementById('trpr').textContent=(r.protein||0)+'г';
    document.getElementById('trcr').textContent=(r.carbs||0)+'г';
    document.getElementById('trfr').textContent=(r.fat||0)+'г';
    document.getElementById('trd').textContent=r.description||'';
    document.getElementById('txres').classList.add('on');
    document.getElementById('txAddbtn').style.display='block';
    HFX.success();SFX.play('scan_success');
  }catch(e){HFX.error();SFX.play('ai_error');showErr('txerr', (()=>{
      const m=String(e.message||e||'');
      const isLocal=location.protocol==='file:'||location.protocol==='content:'||!location.hostname;
      if(m==='Failed to fetch'&&isLocal) return 'Открой через GitHub Pages, не как файл';
      if(m==='Failed to fetch') return 'Нет соединения с Gemini API';
      return m||'Ошибка анализа';
    })());document.getElementById('txAbtn').style.display='block';}
  finally{document.getElementById('txldr').classList.remove('on');}
}

// Barcode

// OpenFoodFacts lookup — бесплатно, без ключа
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
    const name = (lang === 'ru' ? p.product_name_ru : p.product_name_en) || p.product_name || p.brands || 'Продукт';
    const portionRaw = p.serving_size || (n['energy-kcal_serving'] ? '1 порция' : (p.quantity || '100г'));
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
  document.getElementById('brn').textContent = r.food || 'Продукт';
  document.getElementById('brp').textContent = r.portion || '';
  document.getElementById('brk').innerHTML = (r.calories || 0) + ' <small>ккал</small>';
  document.getElementById('brpr').textContent = (r.protein || 0) + 'г';
  document.getElementById('brcr').textContent = (r.carbs || 0) + 'г';
  document.getElementById('brfr').textContent = (r.fat || 0) + 'г';
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
    showToast('EAN: 8-14 цифр');
    return;
  }
  HFX.light(); SFX.play('barcode_scan');
  document.getElementById('bcerr').classList.remove('on');
  document.getElementById('bcldr').classList.add('on');
  try {
    const r = await _offLookup(code);
    if (r) { _renderBarcodeResult(r); return; }
    showErr('bcerr', 'Продукт не найден в OpenFoodFacts. Попробуй фото.');
  } catch(e) {
    HFX.error(); SFX.play('ai_error');
    showErr('bcerr', String(e.message || e || 'Ошибка анализа'));
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
    const p=`You are a nutrition expert. This photo shows a product barcode or packaging. Identify the product and its nutrition info per serving or per 100g.
Respond with ONLY a valid JSON object. No text before or after. No markdown. Example:
{"food":"Чипсы Lay's Сметана","portion":"30г","calories":165,"protein":2,"fat":11,"carbs":15,"description":"Картофельные чипсы. Высококалорийный снек."}
Return JSON for the product in this photo:`;
    const raw=await gem([{text:p},{inline_data:{mime_type:mime,data:b}}],'',{json:true,maxOutputTokens:2048});
    const r=pj(raw);
    _renderBarcodeResult(r);
  }catch(e){HFX.error();SFX.play('ai_error');showErr('bcerr', String(e.message||e||'Ошибка анализа'));}
  finally{document.getElementById('bcldr').classList.remove('on');
    // Reset file inputs so the same file can be selected again
    try { document.getElementById('bc_cam').value=''; document.getElementById('bc_gal').value=''; } catch(e){}
  }
}

// Detect if food item is a beverage and estimate ml
function _detectBeverage(item) {
  const f = (item.food||'').toLowerCase();
  const p = (item.portion||'').toLowerCase();
  const beverageWords = ['вода','чай','кофе','сок','молоко','кефир','компот','морс','лимонад','напиток','смузи','коктейль','газировка','пепси','кола','sprite','fanta','нектар','какао','цикорий','матча'];
  const isBeverage = beverageWords.some(w => f.includes(w));
  if (!isBeverage) return null;
  // Estimate ml from portion
  let ml = 200; // default
  const mlMatch = p.match(/(\d+)\s*мл/);
  const gMatch = p.match(/(\d+)\s*г/);
  const lMatch = p.match(/(\d+(?:[.,]\d+)?)\s*л/);
  if (mlMatch) ml = parseInt(mlMatch[1]);
  else if (lMatch) ml = Math.round(parseFloat(lMatch[1].replace(',','.')) * 1000);
  else if (gMatch) ml = parseInt(gMatch[1]);
  // Cap reasonable values
  ml = Math.max(50, Math.min(1500, ml));
  // Match to DRINKS for hydration factor
  let drinkId = 'other';
  if (f.includes('вода')) drinkId = 'water';
  else if (f.includes('чай')) drinkId = 'tea';
  else if (f.includes('кофе')) drinkId = 'coffee';
  else if (f.includes('сок')||f.includes('нектар')) drinkId = 'juice';
  else if (f.includes('молоко')||f.includes('кефир')||f.includes('какао')) drinkId = 'milk';
  return { ml, drinkId };
}

function rstBarcode(){
  document.getElementById('bcres').classList.remove('on');
  document.getElementById('bcAddbtn').style.display='none';
  document.getElementById('bcerr').classList.remove('on');
}
function addRes(t){
  const item=cur[t];if(!item)return;
  HFX.success(); SFX.play('add_food');
  log.unshift(item); S('log',JSON.stringify(log));
  // Auto-detect beverage → add to water tracker
  const bev = _detectBeverage(item);
  if (bev) {
    const arr = getWaterToday();
    arr.push({ id: bev.drinkId, ml: bev.ml, t: item.time || tnow(), fromFood: true });
    S('water_'+ds(), JSON.stringify(arr));
    rWater();
    showToast(tf('water_added_toast',{ml:bev.ml}));
  }
  rH(); closeAdd();
  if(t==='photo') rstPhoto();
  if(t==='text')  rstText();
  if(t==='barcode'){document.getElementById('bcres').classList.remove('on');document.getElementById('bcAddbtn').style.display='none';}
}

