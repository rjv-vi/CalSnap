/*!
 * CalSnap — © 2024–2026 RJV. All rights reserved.
 * Proprietary. See LICENSE.
 */
// ══════════════════════════════════════════════════════════════════
// AI USAGE STATS
// ══════════════════════════════════════════════════════════════════
// Gemini reports token counts on every response (`usageMetadata`). Recording
// them locally is the only way to answer "how much of my free quota did this
// app spend?", which matters a lot when the whole point of the key pool is
// working around rate limits.
//
// Shape: { req, in, out, cached, since, days: { '<toDateString>': {req,in,out} },
//          models: { '<id>': {req,in,out} } }

const USAGE_KEY = 'ai_usage';
const USAGE_DAYS_KEPT = 60;

function getUsage(){
  try {
    const u = JSON.parse(G(USAGE_KEY, 'null'));
    if (u && typeof u === 'object') {
      u.days = u.days || {}; u.models = u.models || {};
      return u;
    }
  } catch(e) {}
  return { req: 0, in: 0, out: 0, cached: 0, since: Date.now(), days: {}, models: {} };
}

function _saveUsage(u){
  // Keep the daily history bounded.
  const keys = Object.keys(u.days);
  if (keys.length > USAGE_DAYS_KEPT) {
    keys.map(k => [k, new Date(k).getTime() || 0])
        .sort((a, b) => a[1] - b[1])
        .slice(0, keys.length - USAGE_DAYS_KEPT)
        .forEach(([k]) => delete u.days[k]);
  }
  S(USAGE_KEY, JSON.stringify(u));
}

// Called from gem() for every successful response.
function recordUsage(model, meta){
  const inTok  = Number(meta?.promptTokenCount) || 0;
  const outTok = Number(meta?.candidatesTokenCount) || 0;
  const cached = Number(meta?.cachedContentTokenCount) || 0;
  const u = getUsage();
  const day = ds();
  u.req++; u.in += inTok; u.out += outTok; u.cached += cached;
  const d = u.days[day] || (u.days[day] = { req: 0, in: 0, out: 0 });
  d.req++; d.in += inTok; d.out += outTok;
  const m = u.models[model] || (u.models[model] = { req: 0, in: 0, out: 0 });
  m.req++; m.in += inTok; m.out += outTok;
  _saveUsage(u);
}

function resetUsage(){
  showConfirm('📈', t('usage_reset_title'), t('usage_reset_body'), t('btn_reset'), () => {
    S(USAGE_KEY, JSON.stringify({ req: 0, in: 0, out: 0, cached: 0, since: Date.now(), days: {}, models: {} }));
    SFX.play('reset_confirm');
    renderUsage(); rSet();
  });
}

// 12 345 → "12.3k" so the numbers stay readable in a narrow row.
function fmtCount(n){
  n = Number(n) || 0;
  if (n < 1000) return String(n);
  if (n < 1e6) return (n / 1000).toFixed(n < 10000 ? 1 : 0).replace(/\.0$/, '') + 'k';
  return (n / 1e6).toFixed(1).replace(/\.0$/, '') + 'M';
}

function _usageLastDays(u, n){
  const out = [];
  for (let i = 0; i < n; i++) {
    const d = new Date(); d.setDate(d.getDate() - i);
    const k = ds(d);
    out.push({ key: k, label: d.toLocaleDateString(_localeTag(), { day: 'numeric', month: 'short' }), ...(u.days[k] || { req: 0, in: 0, out: 0 }) });
  }
  return out;
}

function openUsage(){
  HFX.light(); SFX.play('sheet_open');
  renderUsage();
  document.getElementById('usageOv')?.classList.add('on');
  lockScroll(true);
}
function closeUsage(){
  const ov = document.getElementById('usageOv');
  if (!ov || !ov.classList.contains('on')) return;
  HFX.light(); SFX.play('sheet_close');
  ov.classList.remove('on');
  lockScroll(false);
}

function renderUsage(){
  const el = document.getElementById('usageBody');
  if (!el) return;
  const u = getUsage();
  const total = u.in + u.out;
  const today = u.days[ds()] || { req: 0, in: 0, out: 0 };
  const week = _usageLastDays(u, 7);
  const weekTok = week.reduce((a, d) => a + d.in + d.out, 0);
  const weekReq = week.reduce((a, d) => a + d.req, 0);
  const peak = Math.max(1, ...week.map(d => d.in + d.out));

  if (!u.req) {
    el.innerHTML = `<div class="usage-empty">${esc(t('usage_empty'))}</div>`;
    return;
  }

  const tiles = [
    { v: fmtCount(u.req),   l: t('usage_requests') },
    { v: fmtCount(total),   l: t('usage_tokens') },
    { v: fmtCount(u.in),    l: t('usage_in') },
    { v: fmtCount(u.out),   l: t('usage_out') },
  ];

  const models = Object.entries(u.models)
    .sort((a, b) => (b[1].in + b[1].out) - (a[1].in + a[1].out))
    .slice(0, 6);

  el.innerHTML = `
    <div class="usage-grid">
      ${tiles.map(x => `<div class="usage-tile"><div class="usage-v">${esc(x.v)}</div><div class="usage-l">${esc(x.l)}</div></div>`).join('')}
    </div>

    <div class="usage-sec-lbl">${esc(t('usage_last7'))}</div>
    <div class="usage-bars">
      ${week.slice().reverse().map(d => {
        const tok = d.in + d.out;
        return `<div class="usage-bar" title="${esc(d.label)}: ${esc(fmtCount(tok))}">
          <div class="usage-bar-fill" style="height:${Math.max(3, Math.round(tok / peak * 100))}%"></div>
          <div class="usage-bar-l">${esc(d.label.split(' ')[0])}</div>
        </div>`;
      }).join('')}
    </div>
    <div class="usage-row"><span>${esc(t('word_today'))}</span><b>${esc(fmtCount(today.in + today.out))} · ${esc(fmtCount(today.req))} ${esc(t('usage_req_short'))}</b></div>
    <div class="usage-row"><span>${esc(t('usage_last7'))}</span><b>${esc(fmtCount(weekTok))} · ${esc(fmtCount(weekReq))} ${esc(t('usage_req_short'))}</b></div>
    ${u.cached ? `<div class="usage-row"><span>${esc(t('usage_cached'))}</span><b>${esc(fmtCount(u.cached))}</b></div>` : ''}
    <div class="usage-row"><span>${esc(t('usage_since'))}</span><b>${esc(fmtDate(new Date(u.since).toDateString(), { day: 'numeric', month: 'long', year: 'numeric' }))}</b></div>

    ${models.length ? `<div class="usage-sec-lbl">${esc(t('usage_by_model'))}</div>
      ${models.map(([id, m]) => `<div class="usage-row"><span class="usage-model">${esc(ALL_MODELS.find(x => x.id === id)?.name || id)}</span><b>${esc(fmtCount(m.in + m.out))} · ${esc(fmtCount(m.req))} ${esc(t('usage_req_short'))}</b></div>`).join('')}` : ''}

    <div class="usage-note">${esc(t('usage_note'))}</div>`;
}
