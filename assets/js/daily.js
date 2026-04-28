// ══════════════════════════════════════════════════
// DAILY TIP (compact)
//════════════════════════════════════════════════
// WEEKLY ANALYSIS
// ══════════════════════════════════════════════════
let _weekLoading = false;

async function loadWeekAnalysis(force=false) {
  if(!key) { document.getElementById('weekAiBody').innerHTML=`<div class="week-ai-empty">${t('week_ai_no_key')}</div>`; return; }

  const wkKey = 'week_'+new Date().toISOString().slice(0,7)+'_'+Math.floor(new Date().getDate()/7);
  const cached = G(wkKey);
  if(cached && !force) { renderWeekAnalysis(JSON.parse(cached)); return; }
  if(_weekLoading) return;
  _weekLoading = true;

  const btn = document.getElementById('weekAiBtn');
  if(btn){ btn.disabled=true; btn.textContent='...'; }
  document.getElementById('weekAiBody').innerHTML=
    `<div class="skeleton-line" style="width:88%"></div>`+
    `<div class="skeleton-line" style="width:74%;margin-top:10px"></div>`+
    `<div class="skeleton-line" style="width:60%;margin-top:10px"></div>`+
    `<div class="week-ai-empty" style="margin-top:14px;font-size:12px;opacity:.6">${t('week_ai_loading')}</div>`;
  document.getElementById('weekAiSub').textContent=t('week_ai_analyzing');

  // Собираем данные за 7 дней
  const days7 = [];
  for(let i=0;i<7;i++){
    const d=new Date(); d.setDate(d.getDate()-i);
    const dl=dlog(ds(d)), tt=tot(dl);
    if(dl.length) days7.push({day:d.toLocaleDateString('ru',{weekday:'short',day:'numeric',month:'short'}), kcal:tt.k, prot:Math.round(tt.p), carb:Math.round(tt.c), fat:Math.round(tt.f), count:dl.length});
  }
  if(days7.length<2){ document.getElementById('weekAiBody').innerHTML=`<div class="week-ai-empty">${t('week_ai_min_days')}</div>`; if(btn){btn.disabled=false;btn.textContent=t('week_ai_btn');} _weekLoading=false; return; }

  // Add water data per day
  const days7water = [];
  for(let i=0;i<7;i++){
    const d=new Date(); d.setDate(d.getDate()-i);
    try{const w=JSON.parse(localStorage.getItem('water_'+ds(d))||'[]');const wml=w.reduce((s,x)=>s+x.ml,0);if(wml>0)days7water.push(d.toLocaleDateString('ru',{weekday:'short'})+': '+wml+'мл');}catch(e){}
  }
  const daysSummary = days7.map(d=>`${d.day}: ${d.kcal}ккал (Б${d.prot}г У${d.carb}г Ж${d.fat}г, ${d.count} приёмов)`).join('\n');
  const waterSummary = days7water.length ? days7water.join(', ') : 'нет данных';
  const sys=`Ты персональный нутрициолог. Данные пользователя: ${U?.name}, цель: ${GL[U?.goal]||'—'}, норма: ${U?.kcal||2000}ккал.\nВода за 7 дней: ${waterSummary}\nВес (последние записи): ${wts.slice(0,5).map(w=>w.v+'кг').join(' → ')||'нет данных'}\nДанные за последние дни:\n${daysSummary}\n\nДай анализ в формате JSON:\n{"good":"что хорошо (1-2 предложения)","warn":"что стоит улучшить (1-2 предложения)","tip":"конкретный совет на следующую неделю (1-2 предложения)"}\nТолько JSON, по-русски, кратко.`;

  try {
    const raw = await gem([{text:'Анализ питания за неделю'}], sys, {json:true,maxOutputTokens:1024});
    let r; try{r=pj(raw);}catch(e){r={good:'Стабильное питание.',warn:'Старайся записывать все приёмы пищи.',tip:'Добавь больше белка в рацион.'};}
    const data = {good:r.good||'',warn:r.warn||'',tip:r.tip||'', date:ds()};
    S(wkKey, JSON.stringify(data));
    renderWeekAnalysis(data);
    HFX.success();
  } catch(e) {
    document.getElementById('weekAiBody').innerHTML=`<div class="week-ai-empty">${t('week_ai_load_error')}</div>`;
  }
  _weekLoading=false;
  if(btn){btn.disabled=false;btn.textContent=t('week_ai_refresh');}
  document.getElementById('weekAiSub').textContent=t('week_ai_default_sub');
}


function _updatePaceCard() {
  const card = document.getElementById('paceCard');
  const titleEl = document.getElementById('paceTitle');
  const subEl = document.getElementById('paceSub');
  const iconEl = document.getElementById('paceIcon');
  if (!card || !U) return;
  if (wts.length < 2) { card.style.display = 'none'; return; }
  card.style.display = '';

  // If user has a target weight set, show goal-reach prediction (overrides default messaging)
  if (U.targetW && U.targetW > 0 && wts.length >= 3) {
    const _curW = wts[0].v;
    const _diff = _curW - U.targetW;
    if (Math.abs(_diff) < 0.3) {
      iconEl.textContent = '🎉'; titleEl.textContent = t('wgoal_already', 'Цель достигнута 🎉');
      subEl.textContent = `${_curW} → ${U.targetW} кг`;
      return;
    }
    // Linear regression on last 14 days for stability
    const recent = wts.slice(0, Math.min(wts.length, 14));
    const oldest = recent[recent.length - 1], newest = recent[0];
    const days = Math.max(1, (new Date(newest.d) - new Date(oldest.d)) / 86400000);
    const wPerDay = (newest.v - oldest.v) / days;
    // Trend in correct direction?
    const correctDir = (U.goal === 'lose' && wPerDay < -0.005) || (U.goal === 'gain' && wPerDay > 0.005);
    if (!correctDir) {
      iconEl.textContent = '🎯'; titleEl.textContent = t('wgoal_label', 'Прогноз достижения цели');
      subEl.textContent = t('wgoal_unknown', 'Недостаточно данных для прогноза');
      return;
    }
    const daysToGoal = Math.abs(_diff / wPerDay);
    if (!isFinite(daysToGoal) || daysToGoal > 365 * 3) {
      iconEl.textContent = '🎯'; titleEl.textContent = t('wgoal_label', 'Прогноз достижения цели');
      subEl.textContent = t('wgoal_unknown', 'Недостаточно данных для прогноза');
      return;
    }
    const goalDate = new Date(); goalDate.setDate(goalDate.getDate() + Math.round(daysToGoal));
    const dateStr = goalDate.toLocaleDateString(LANG === 'en' ? 'en-US' : 'ru', { day: 'numeric', month: 'long', year: 'numeric' });
    const wkStr = (wPerDay * 7).toFixed(2);
    iconEl.textContent = '🎯'; titleEl.textContent = t('wgoal_label', 'Прогноз достижения цели');
    subEl.textContent = `~ ${dateStr} · ${wkStr} ${t('streak_days', 'кг')}/нед`;
    return;
  }

  const goal = U.goal || 'maintain';
  const curW = wts[0].v;
  const targetW = U.targetW || null;

  // Calculate weekly pace from last 2-4 weeks
  const recent = wts.slice(0, Math.min(wts.length, 8));
  const oldest = recent[recent.length - 1];
  const newest = recent[0];
  const daysDiff = Math.max(1, (new Date(newest.d) - new Date(oldest.d)) / 86400000 || 7);
  const totalChange = newest.v - oldest.v;
  const weeklyChange = (totalChange / daysDiff) * 7;

  if (goal === 'maintain') {
    const drift = Math.abs(weeklyChange);
    if (drift < 0.1) {
      iconEl.textContent = '⚖️'; titleEl.textContent = 'Вес стабилен';
      subEl.textContent = `Изменение за неделю: ±${drift.toFixed(1)} кг — отлично!`;
    } else if (weeklyChange > 0) {
      iconEl.textContent = '📈'; titleEl.textContent = 'Небольшой набор';
      subEl.textContent = `+${weeklyChange.toFixed(1)} кг/нед — следи за калориями`;
    } else {
      iconEl.textContent = '📉'; titleEl.textContent = 'Небольшое снижение';
      subEl.textContent = `${weeklyChange.toFixed(1)} кг/нед — возможно дефицит`;
    }
  } else if (goal === 'lose') {
    if (weeklyChange >= -0.05) {
      iconEl.textContent = '⚠️'; titleEl.textContent = 'Нет прогресса';
      subEl.textContent = t('goal_lose_sub');
    } else {
      const targetLoss = targetW ? curW - targetW : Math.max(curW - 5, curW * 0.9);
      const remaining = curW - targetLoss;
      const weeksNeeded = remaining > 0 ? Math.ceil(remaining / Math.abs(weeklyChange)) : 0;
      iconEl.textContent = '🎯';
      titleEl.textContent = weeksNeeded > 0 ? `~${weeksNeeded} нед до цели` : 'Цель достигнута!';
      subEl.textContent = `Темп: ${weeklyChange.toFixed(1)} кг/нед · Текущий вес: ${curW} кг`;
    }
  } else if (goal === 'gain') {
    if (weeklyChange <= 0.05) {
      iconEl.textContent = '⚠️'; titleEl.textContent = 'Нет набора';
      subEl.textContent = t('goal_gain_sub');
    } else {
      iconEl.textContent = '💪'; titleEl.textContent = 'Набор идёт!';
      const rate = weeklyChange.toFixed(2);
      const quality = weeklyChange < 0.5 ? '👍 Качественный набор' : '⚡ Быстрый набор';
      subEl.textContent = `+${rate} кг/нед · ${quality}`;
    }
  }
}

function renderWeekAnalysis(data) {
  const btn = document.getElementById('weekAiBtn');
  if(btn){btn.disabled=false;btn.textContent='Обновить';}
  document.getElementById('weekAiSub').textContent='Обновлено '+data.date;
  document.getElementById('weekAiBody').innerHTML=`
    <div class="week-ai-sections">
      ${data.good?`<div class="week-ai-section good"><div class="week-ai-section-title">✓ Хорошо</div><div class="week-ai-section-text">${data.good}</div></div>`:''}
      ${data.warn?`<div class="week-ai-section warn"><div class="week-ai-section-title">⚠ Стоит улучшить</div><div class="week-ai-section-text">${data.warn}</div></div>`:''}
      ${data.tip?`<div class="week-ai-section tip"><div class="week-ai-section-title">💡 Совет на неделю</div><div class="week-ai-section-text">${data.tip}</div></div>`:''}
    </div>`;
}

