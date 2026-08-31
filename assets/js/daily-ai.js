// ══════════════════════════════════════════════════
// DAILY AI SUMMARY — shown in the evening, after 18:00
// ══════════════════════════════════════════════════
function dismissDailyAi(){
  HFX.light(); SFX.play('sheet_close');
  const c = document.getElementById('dailyAiCard');
  if(c) c.style.display = 'none';
  try { localStorage.setItem('daily_ai_dismissed_'+ds(), '1'); } catch(e){}
}
async function _maybeShowDailySummary(){
  if (!U || !hasApiKey()) return;
  const today = ds();
  // Show only after 18:00 local time
  const hr = new Date().getHours();
  if (hr < 18) return;
  // Already shown today?
  if (G('daily_ai_'+today)) {
    _renderDailyAi(JSON.parse(G('daily_ai_'+today)));
    return;
  }
  if (G('daily_ai_dismissed_'+today)) return;
  // Need at least 1 logged item today
  const todayLog = log.filter(e => e.date === today);
  if (todayLog.length < 2) return;
  const card = document.getElementById('dailyAiCard');
  if (!card) return;
  card.style.display = '';
  const body = document.getElementById('dailyAiBody');
  if (body) body.innerHTML = '<div class="skel" style="width:90%"></div><div class="skel" style="width:75%"></div><div class="skel" style="width:60%"></div>';
  document.getElementById('dailyAiSub').textContent = t('daily_summary_loading');
  try {
    const tot_ = tot(todayLog);
    // Water tracking is opt-in — only feed water data to the AI, and only
    // let it appear in the prompt, when the user has it enabled.
    const waterEnabled = isWaterOn();
    const water = waterEnabled ? ((getWaterToday().reduce((s,e)=>s+e.ml,0)) || 0) : null;
    const norm = U.kcal || 2000;
    const goal = U.goal || 'maintain';
    const isEn = LANG === 'en';
    const waterSegEn = water!=null ? ` Water: ${water} ml.` : '';
    const waterSegRu = water!=null ? ` Вода: ${water} мл.` : '';
    const noWaterNote = waterEnabled ? '' : (isEn ? ' Do not mention water or hydration.' : ' Не упоминай воду и питьевой режим.');
    const prompt = isEn
      ? `Summarize the user's day in 2-3 friendly sentences (max ~250 chars). Goal: ${goal}. Today's intake: ${tot_.k} kcal of target ${norm}, P ${tot_.p}g, F ${tot_.f}g, C ${tot_.c}g.${waterSegEn} Items: ${todayLog.map(e=>e.food).slice(0,8).join(', ')}. Be specific, mention 1 strength and 1 thing to improve. No markdown, no JSON.${noWaterNote}`
      : `Подведи итог дня для пользователя в 2-3 дружелюбных предложениях (~250 симв). Цель: ${goal}. Съедено: ${tot_.k} ккал из ${norm}, Б ${tot_.p}г, Ж ${tot_.f}г, У ${tot_.c}г.${waterSegRu} Блюда: ${todayLog.map(e=>e.food).slice(0,8).join(', ')}. Будь конкретным, отметь 1 плюс и 1 что улучшить. Без markdown, без JSON.${noWaterNote}`;
    const raw = await gem([{ text: prompt }]);
    const txt = (raw || '').replace(/^[\s\S]*?\n\n/, '').trim().slice(0, 400) || raw;
    const data = { text: txt, date: new Date().toLocaleTimeString(LANG==='en'?'en-US':'ru',{hour:'2-digit',minute:'2-digit'}) };
    try { localStorage.setItem('daily_ai_'+today, JSON.stringify(data)); } catch(e){}
    _renderDailyAi(data);
  } catch(e) {
    document.getElementById('dailyAiSub').textContent = '—';
    if (body) body.innerHTML = `<p style="color:var(--t1);font-size:13px">${t('ai_offline')}</p>`;
  }
}
function _renderDailyAi(data){
  const card = document.getElementById('dailyAiCard');
  if (!card) return;
  card.style.display = '';
  document.getElementById('dailyAiSub').textContent = data.date || '';
  const body = document.getElementById('dailyAiBody');
  if (body) body.innerHTML = `<p>${(data.text||'').replace(/</g,'&lt;')}</p>`;
}
