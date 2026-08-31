// ══════════════════════════════════════════════════════
// DRUM DATE PICKER
// ══════════════════════════════════════════════════════
const MONTHS_RU=['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'];
const MONTHS_EN=['January','February','March','April','May','June','July','August','September','October','November','December'];
function MONTHS(){ return (typeof LANG!=='undefined' && LANG==='en') ? MONTHS_EN : MONTHS_RU; }
// Rebuild the drum columns when the language changes while the app is open.
function refreshDrumLabels(){
  try { if(document.getElementById('drumOv')?.classList.contains('on')) buildDrumCols(); } catch(e) {}
}
let _drumCtx='ob'; // 'ob' = onboarding, 'ed' = settings
let _drumDay=1,_drumMonth=1,_drumYear=new Date().getFullYear()-20;
let _drumScrolling=false;

function openDrum(ctx){
  _drumCtx=ctx;
  const n=new Date();
  const existingDob=ctx==='ob'
    ?(document.getElementById('ob_dob_btn')?.dataset.dob||'')
    :(U?.dob||'');
  if(existingDob){
    const d=new Date(existingDob);
    _drumDay=d.getDate();_drumMonth=d.getMonth()+1;_drumYear=d.getFullYear();
  } else {
    // Start on today's date: the year wheel is the one people scroll anyway,
    // and a pre-set day/month means two fewer wheels to touch.
    _drumDay=n.getDate();_drumMonth=n.getMonth()+1;_drumYear=n.getFullYear();
  }
  buildDrumCols();
  SFX.play('sheet_open');
  document.getElementById('drumOv').classList.add('on');
  lockScroll(true);
  // After layout is done, snap scroll to selected — requestAnimationFrame x2 ensures paint
  const minY=n.getFullYear()-120,maxY=n.getFullYear();
  requestAnimationFrame(()=>requestAnimationFrame(()=>{
    const dCol=document.getElementById('drum_d');
    const mCol=document.getElementById('drum_m');
    const yCol=document.getElementById('drum_y');
    if(dCol){ dCol.scrollTop=(_drumDay-1)*ITEM_H; _updateSelClass('drum_d',_drumDay-1); }
    if(mCol){ mCol.scrollTop=(_drumMonth-1)*ITEM_H; _updateSelClass('drum_m',_drumMonth-1); }
    if(yCol){ const yi=maxY-_drumYear; yCol.scrollTop=yi*ITEM_H; _updateSelClass('drum_y',yi); }
  }));
}
function closeDrum(){
  document.getElementById('drumOv').classList.remove('on');
  lockScroll(false);
}
function buildDrumCols(){
  const n=new Date();
  const minY=n.getFullYear()-120, maxY=n.getFullYear();
  function fillCol(col, items, selFn){
    col.innerHTML='';
    const wrap=document.createElement('div');
    wrap.className='drum-wrap';
    // Top spacer (centers first item)
    const top=document.createElement('div');
    top.className='drum-spacer';
    wrap.appendChild(top);
    items.forEach((txt,i)=>{
      const el=document.createElement('div');
      el.className='drum-item'+(selFn(i)?' sel':'');
      el.textContent=txt;
      wrap.appendChild(el);
    });
    // Bottom spacer (centers last item)
    const bot=document.createElement('div');
    bot.className='drum-spacer';
    wrap.appendChild(bot);
    col.appendChild(wrap);
  }
  const days=Array.from({length:31},(_,i)=>String(i+1).padStart(2,'0'));
  fillCol(document.getElementById('drum_d'),days,i=>i+1===_drumDay);
  fillCol(document.getElementById('drum_m'),MONTHS(),i=>i+1===_drumMonth);
  const years=[];for(let y=maxY;y>=minY;y--)years.push(String(y));
  fillCol(document.getElementById('drum_y'),years,i=>maxY-i===_drumYear);
  attachDrumScroll('drum_d','d',1,31);
  attachDrumScroll('drum_m','m',1,12);
  attachDrumScroll('drum_y','y',minY,maxY);
  _syncDrumDays();
}
// ── DRUM PICKER — native scroll-snap (compositor thread) ──
const ITEM_H = 44;

function attachDrumScroll(colId, axis, min, max) {
  const col = document.getElementById(colId);
  if (!col) return;
  const count = col.querySelectorAll('.drum-item').length;
  let lastIdx = -1;

  col.addEventListener('scroll', () => {
    const idx = Math.max(0, Math.min(count - 1, Math.round(col.scrollTop / ITEM_H)));
    if (idx !== lastIdx) {
      lastIdx = idx;
      _updateSelClass(colId, idx);
      HFX.tick(); SFX.play('drum_tick');
      updateDrumVal(colId, axis, min, max, idx);
    }
  }, { passive: true });
}

function _updateSelClass(colId, idx) {
  const col = document.getElementById(colId);
  if (!col) return;
  col.querySelectorAll('.drum-item').forEach((el, i) => el.classList.toggle('sel', i === idx));
}

// Days in the month currently on the wheels — February and the 31-day months
// are not the same wheel, and the picker used to pretend they were.
function _drumMaxDays(){
  return new Date(_drumYear, _drumMonth, 0).getDate();
}

// Grey out the days this month does not have, and pull the selection back if it
// is sitting on one of them (31 March → 30 April rather than a silent clamp at
// confirm time).
function _syncDrumDays(){
  const col=document.getElementById('drum_d');
  if(!col) return;
  const maxDays=_drumMaxDays();
  col.querySelectorAll('.drum-item').forEach((el,i)=>el.classList.toggle('off', i+1>maxDays));
  if(_drumDay>maxDays){
    _drumDay=maxDays;
    _updateSelClass('drum_d',maxDays-1);
    col.scrollTo ? col.scrollTo({top:(maxDays-1)*ITEM_H, behavior:'smooth'})
                 : (col.scrollTop=(maxDays-1)*ITEM_H);
    HFX.tick();
  }
}

function updateDrumVal(colId,axis,min,max,idx){
  const val=axis==='y'?(max-idx):min+idx;
  if(axis==='d')_drumDay=Math.max(min,Math.min(max,val));
  if(axis==='m')_drumMonth=Math.max(min,Math.min(max,val));
  if(axis==='y')_drumYear=Math.max(min,Math.min(max,val));
  if(axis!=='d') _syncDrumDays();
  else if(_drumDay>_drumMaxDays()) _syncDrumDays();
}
function confirmDrum(){
  // Clamp day to valid range for month/year
  const maxDays=new Date(_drumYear,_drumMonth,0).getDate();
  _drumDay=Math.min(_drumDay,maxDays);
  const dob=`${_drumYear}-${String(_drumMonth).padStart(2,'0')}-${String(_drumDay).padStart(2,'0')}`;
  // Only a date in the future (or absurdly far back) is rejected; the year
  // wheel now runs right up to today, so any real birthday is valid.
  const age=calcAgeFromDob(dob);
  if(age==null||age<0||age>120){
    HFX.error(); SFX.play('error');
    const sheet=document.querySelector('.drum-sheet');
    if(sheet){ sheet.style.animation='none'; void sheet.offsetWidth; sheet.style.animation='offlShake .4s ease'; }
    return;
  }
  const dispStr=`${String(_drumDay).padStart(2,'0')}.${String(_drumMonth).padStart(2,'0')}.${_drumYear}`;
  if(_drumCtx==='ob'){
    const btn=document.getElementById('ob_dob_btn');
    if(btn){btn.dataset.dob=dob;btn.innerHTML=`<span class="dob-value">${dispStr}</span><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>`;btn.classList.add('filled');}
    const hint=document.getElementById('dob_hint');
    if(hint)hint.textContent=tf('dob_age_ok',{age:age,years:fmtYears(age)});
  } else {
    // settings
    const btn=document.getElementById('ed_dob_btn');
    if(btn){btn.dataset.dob=dob;btn.innerHTML=`<span class="dob-value">${dispStr}</span><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>`;btn.classList.add('filled');}
    const hint=document.getElementById('ed_dob_hint');
    if(hint){hint.style.opacity='1';hint.textContent=tf('age_label',{age:age,years:fmtYears(age)});}
  }
  closeDrum();
  HFX.success();SFX.play('drum_confirm');
  HFX.medium();
}

