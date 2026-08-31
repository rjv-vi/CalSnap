// ══════════════════════════════════════════════════
// DAILY TIP (compact)
//════════════════════════════════════════════════
// WEEKLY ANALYSIS
// ══════════════════════════════════════════════════
let _weekLoading = false;

async function loadWeekAnalysis(force=false) {
  if(!hasApiKey()) { document.getElementById('weekAiBody').innerHTML=`<div class="week-ai-empty">${t('week_ai_no_key')}</div>`; return; }

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

  // Collect the last 7 days
  const _loc = _localeTag();
  const _isEn = LANG === 'en';
  const days7 = [];
  for(let i=0;i<7;i++){
    const d=new Date(); d.setDate(d.getDate()-i);
    const dl=dlog(ds(d)), tt=tot(dl);
    if(dl.length) days7.push({day:d.toLocaleDateString(_loc,{weekday:'short',day:'numeric',month:'short'}), kcal:tt.k, prot:Math.round(tt.p), carb:Math.round(tt.c), fat:Math.round(tt.f), count:dl.length});
  }
  if(days7.length<2){ document.getElementById('weekAiBody').innerHTML=`<div class="week-ai-empty">${t('week_ai_min_days')}</div>`; if(btn){btn.disabled=false;btn.textContent=t('week_ai_btn');} _weekLoading=false; return; }

  // Add water data per day — only when the user has water tracking enabled.
  // The AI must not mention water at all when the feature is turned off.
  let waterLine = '';
  if (isWaterOn()) {
    const days7water = [];
    for(let i=0;i<7;i++){
      const d=new Date(); d.setDate(d.getDate()-i);
      try{const w=JSON.parse(G('water_'+ds(d),'[]'));const wml=w.reduce((s2,x)=>s2+(x.ml||0),0);if(wml>0)days7water.push(d.toLocaleDateString(_loc,{weekday:'short'})+': '+wml+(_isEn?'ml':'мл'));}catch(e){}
    }
    const NONE_W = _isEn ? 'no data' : 'нет данных';
    const waterSummary = days7water.length ? days7water.join(', ') : NONE_W;
    waterLine = (_isEn ? `Water over 7 days: ${waterSummary}\n` : `Вода за 7 дней: ${waterSummary}\n`);
  }
  const NONE = _isEn ? 'no data' : 'нет данных';
  const KC = _isEn ? 'kcal' : 'ккал';
  const G_ = _isEn ? 'g' : 'г';
  const KG = _isEn ? 'kg' : 'кг';
  const daysSummary = _isEn
    ? days7.map(d=>`${d.day}: ${d.kcal}kcal (P${d.prot}g C${d.carb}g F${d.fat}g, ${d.count} meals)`).join('\n')
    : days7.map(d=>`${d.day}: ${d.kcal}ккал (Б${d.prot}г У${d.carb}г Ж${d.fat}г, ${d.count} приёмов)`).join('\n');
  const weightsLine = wts.slice(0,5).map(w=>w.v+KG).join(' → ') || NONE;
  const noWater = isWaterOn() ? '' : (_isEn ? ' Do not mention water or hydration.' : ' Не упоминай воду и питьевой режим.');
  const sys = _isEn
    ? `You are a personal nutritionist. User: ${U?.name}, goal: ${GL[U?.goal]||'—'}, target: ${U?.kcal||2000} kcal.\n${waterLine}Weight (latest entries): ${weightsLine}\nRecent days:\n${daysSummary}\n\nReturn the analysis as JSON:\n{"good":"what is going well (1-2 sentences)","warn":"what to improve (1-2 sentences)","tip":"one concrete tip for next week (1-2 sentences)"}\nJSON only, in English, concise.${noWater}`
    : `Ты персональный нутрициолог. Данные пользователя: ${U?.name}, цель: ${GL[U?.goal]||'—'}, норма: ${U?.kcal||2000}ккал.\n${waterLine}Вес (последние записи): ${weightsLine}\nДанные за последние дни:\n${daysSummary}\n\nДай анализ в формате JSON:\n{"good":"что хорошо (1-2 предложения)","warn":"что стоит улучшить (1-2 предложения)","tip":"конкретный совет на следующую неделю (1-2 предложения)"}\nТолько JSON, по-русски, кратко.${noWater}`;

  try {
    const raw = await gem([{text:_isEn?'Analyse my nutrition for the week':'Анализ питания за неделю'}], sys, {json:true,maxOutputTokens:1024});
    let r; try{r=pj(raw);}catch(e){r={good:t('week_fb_good'),warn:t('week_fb_warn'),tip:t('week_fb_tip')};}
    const data = {good:r.good||'',warn:r.warn||'',tip:r.tip||'', date:ds(), at:tnow()};
    S(wkKey, JSON.stringify(data));
    renderWeekAnalysis(data);
    HFX.success(); SFX.play('scan_success');
  } catch(e) {
    HFX.error(); SFX.play('ai_error');
    document.getElementById('weekAiBody').innerHTML=`<div class="week-ai-empty">${esc(String(e?.message||t('week_ai_load_error')))}</div>`;
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
  const PW = t('unit_per_week');   // "кг/нед" | "kg/wk"
  const KG = t('unit_kg');

  // If user has a target weight set, show goal-reach prediction (overrides default messaging)
  if (U.targetW && U.targetW > 0 && wts.length >= 3) {
    const _curW = wts[0].v;
    const _diff = _curW - U.targetW;
    if (Math.abs(_diff) < 0.3) {
      iconEl.textContent = '🎉'; titleEl.textContent = t('wgoal_already');
      subEl.textContent = `${_curW} → ${U.targetW} ${KG}`;
      return;
    }
    // Linear trend over the last 14 entries for stability
    const recent = wts.slice(0, Math.min(wts.length, 14));
    const oldest = recent[recent.length - 1], newest = recent[0];
    const days = Math.max(1, (new Date(newest.d) - new Date(oldest.d)) / 86400000);
    const wPerDay = (newest.v - oldest.v) / days;
    const correctDir = (U.goal === 'lose' && wPerDay < -0.005) || (U.goal === 'gain' && wPerDay > 0.005);
    const daysToGoal = correctDir ? Math.abs(_diff / wPerDay) : Infinity;
    if (!correctDir || !isFinite(daysToGoal) || daysToGoal > 365 * 3) {
      iconEl.textContent = '🎯'; titleEl.textContent = t('wgoal_label');
      subEl.textContent = t('wgoal_unknown');
      return;
    }
    const goalDate = new Date(); goalDate.setDate(goalDate.getDate() + Math.round(daysToGoal));
    const dateStr = goalDate.toLocaleDateString(_localeTag(), { day: 'numeric', month: 'long', year: 'numeric' });
    const wkStr = (wPerDay * 7).toFixed(2);
    iconEl.textContent = '🎯'; titleEl.textContent = t('wgoal_label');
    // The unit comes from a dedicated key. It previously reused the
    // "streak days" key with a kg fallback, which rendered "0.25 дней/нед"
    // because that key exists and the fallback was never reached.
    subEl.textContent = `~ ${dateStr} · ${wkStr} ${PW}`;
    return;
  }

  const goal = U.goal || 'maintain';
  const curW = wts[0].v;
  const targetW = U.targetW || null;

  // Weekly pace from the last handful of entries
  const recent = wts.slice(0, Math.min(wts.length, 8));
  const oldest = recent[recent.length - 1];
  const newest = recent[0];
  const daysDiff = Math.max(1, (new Date(newest.d) - new Date(oldest.d)) / 86400000 || 7);
  const totalChange = newest.v - oldest.v;
  const weeklyChange = (totalChange / daysDiff) * 7;

  if (goal === 'maintain') {
    const drift = Math.abs(weeklyChange);
    if (drift < 0.1) {
      iconEl.textContent = '⚖️'; titleEl.textContent = t('pace_stable_t');
      subEl.textContent = tf('pace_stable_s', { n: drift.toFixed(1) });
    } else if (weeklyChange > 0) {
      iconEl.textContent = '📈'; titleEl.textContent = t('pace_gain_t');
      subEl.textContent = tf('pace_gain_s', { n: weeklyChange.toFixed(1) });
    } else {
      iconEl.textContent = '📉'; titleEl.textContent = t('pace_drop_t');
      subEl.textContent = tf('pace_drop_s', { n: weeklyChange.toFixed(1) });
    }
  } else if (goal === 'lose') {
    if (weeklyChange >= -0.05) {
      iconEl.textContent = '⚠️'; titleEl.textContent = t('pace_noprog_t');
      subEl.textContent = t('goal_lose_sub');
    } else {
      const targetLoss = targetW ? curW - targetW : Math.max(curW - 5, curW * 0.9);
      const remaining = curW - targetLoss;
      const weeksNeeded = remaining > 0 ? Math.ceil(remaining / Math.abs(weeklyChange)) : 0;
      iconEl.textContent = '🎯';
      titleEl.textContent = weeksNeeded > 0 ? tf('pace_weeks_t', { n: weeksNeeded }) : t('pace_goal_reached');
      subEl.textContent = tf('pace_rate_s', { n: weeklyChange.toFixed(1), w: curW });
    }
  } else if (goal === 'gain') {
    if (weeklyChange <= 0.05) {
      iconEl.textContent = '⚠️'; titleEl.textContent = t('pace_nogain_t');
      subEl.textContent = t('goal_gain_sub');
    } else {
      iconEl.textContent = '💪'; titleEl.textContent = t('pace_gaining_t');
      const quality = weeklyChange < 0.5 ? t('pace_gain_ok') : t('pace_gain_fast');
      subEl.textContent = tf('pace_gain_s2', { n: weeklyChange.toFixed(2), q: quality });
    }
  }
}

function renderWeekAnalysis(data) {
  const btn = document.getElementById('weekAiBtn');
  if(btn){btn.disabled=false;btn.textContent=t('week_ai_refresh');}
  const sub = document.getElementById('weekAiSub');
  if(sub) sub.textContent = tf('week_updated',{time:data.at || fmtDate(data.date,{day:'numeric',month:'short'})});
  document.getElementById('weekAiBody').innerHTML=`
    <div class="week-ai-sections">
      ${data.good?`<div class="week-ai-section good"><div class="week-ai-section-title">${t('week_good')}</div><div class="week-ai-section-text">${esc(data.good)}</div></div>`:''}
      ${data.warn?`<div class="week-ai-section warn"><div class="week-ai-section-title">${t('week_warn')}</div><div class="week-ai-section-text">${esc(data.warn)}</div></div>`:''}
      ${data.tip?`<div class="week-ai-section tip"><div class="week-ai-section-title">${t('week_tip')}</div><div class="week-ai-section-text">${esc(data.tip)}</div></div>`:''}
    </div>`;
}
