// ══════════════════════════════════════════════════════════════════
// Theme contrast audit
// ══════════════════════════════════════════════════════════════════
// Walks every CSS rule (and inline style) that sets BOTH a background and a
// text colour, resolves the custom properties for each theme, and computes the
// WCAG contrast ratio. This is what catches "white text on a white background":
// `--acc` is near-black in the light theme and near-WHITE in the dark theme, so
// a hard-coded `color:#fff` on an `--acc` surface is invisible in one of them.
//
//   node tests/contrast.mjs

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CSS = ['base.css', 'components.css', 'screens.css', 'polish.css']
  .map(f => readFileSync(path.join(ROOT, 'assets/css', f), 'utf8'));
const HTML = readFileSync(path.join(ROOT, 'index.html'), 'utf8');

const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '');
const ALL_CSS = CSS.map(stripComments).join('\n');

// ── Token tables per theme ────────────────────────────────────────
function tokensFor(theme) {
  const out = {};
  // :root first, then the theme block, so the theme wins.
  const blocks = [/:root\s*\{([\s\S]*?)\}/g, new RegExp(`\\[data-theme="${theme}"\\]\\s*\\{([\\s\\S]*?)\\}`, 'g')];
  for (const re of blocks) {
    let m;
    while ((m = re.exec(ALL_CSS))) {
      for (const decl of m[1].split(';')) {
        const d = decl.match(/^\s*(--[\w-]+)\s*:\s*(.+?)\s*$/);
        if (d) out[d[1]] = d[2];
      }
    }
  }
  return out;
}

// ── Colour parsing ────────────────────────────────────────────────
function parseColor(v) {
  v = String(v || '').trim();
  const hex = v.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (hex) {
    let h = hex[1];
    if (h.length === 3) h = h.split('').map(c => c + c).join('');
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16), 1];
  }
  const rgba = v.match(/^rgba?\(([^)]+)\)$/i);
  if (rgba) {
    const p = rgba[1].split(/[,\s/]+/).filter(Boolean).map(Number);
    return [p[0], p[1], p[2], p[3] == null ? 1 : p[3]];
  }
  if (/^white$/i.test(v)) return [255, 255, 255, 1];
  if (/^black$/i.test(v)) return [0, 0, 0, 1];
  if (/^transparent$/i.test(v)) return [0, 0, 0, 0];
  return null;
}

// Resolve var()/color-mix()/gradients down to a single colour where possible.
function resolve(expr, tokens, depth = 0) {
  if (!expr || depth > 8) return null;
  let v = String(expr).trim();
  // Gradients: take the first colour stop as representative.
  const grad = v.match(/gradient\([^)]*?((?:#[0-9a-f]{3,6})|rgba?\([^)]*\)|var\(--[\w-]+\))/i);
  if (/gradient\(/i.test(v) && grad) return resolve(grad[1], tokens, depth + 1);
  // color-mix(in srgb, X n%, transparent) → X at alpha n%.
  const mix = v.match(/color-mix\(\s*in\s+srgb\s*,\s*(.+?)\s+(\d+)%\s*,\s*transparent\s*\)/i);
  if (mix) {
    const base = resolve(mix[1], tokens, depth + 1);
    if (!base) return null;
    return [base[0], base[1], base[2], base[3] * (Number(mix[2]) / 100)];
  }
  const varm = v.match(/^var\(\s*(--[\w-]+)\s*(?:,\s*(.+))?\)$/);
  if (varm) {
    const t = tokens[varm[1]];
    if (t != null) return resolve(t, tokens, depth + 1);
    return varm[2] ? resolve(varm[2], tokens, depth + 1) : null;
  }
  return parseColor(v);
}

const over = (fg, bg) => {
  const a = fg[3];
  return [fg[0] * a + bg[0] * (1 - a), fg[1] * a + bg[1] * (1 - a), fg[2] * a + bg[2] * (1 - a), 1];
};
const lum = (c) => {
  const f = (x) => { x /= 255; return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); };
  return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]);
};
const ratio = (a, b) => {
  const l1 = lum(a), l2 = lum(b);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
};

// ── Collect (selector, bg, fg) triples ────────────────────────────
// (FIXED_REGIONS / FIXED_SELECTORS are hoisted consts declared below.)
function cssPairs() {
  const pairs = [];
  const re = /([^{}@]+)\{([^{}]*)\}/g;
  let m;
  while ((m = re.exec(ALL_CSS))) {
    const sel = m[1].trim().replace(/\s+/g, ' ');
    if (!sel || sel.startsWith('@') || sel.includes('%')) continue;
    const body = m[2];
    const bg = body.match(/(?:^|;)\s*background(?:-color)?\s*:\s*([^;]+)/i);
    const fg = body.match(/(?:^|;)\s*color\s*:\s*([^;]+)/i);
    if (!bg || !fg) continue;
    const fixed = FIXED_SELECTORS.find(f => f.test.test(sel.split(/[ ,]/).pop() || '') || f.test.test(sel));
    if (fixed?.skip) continue;
    pairs.push({
      where: sel + (fixed ? ' [' + fixed.name + ']' : ''),
      bg: bg[1].replace(/!important/i, '').trim(),
      fg: fg[1].replace(/!important/i, '').trim(),
      backdrop: fixed ? fixed.backdrop : null,
    });
  }
  return pairs;
}

// Second pass: rules that set only a text colour, checked against the page and
// card surfaces. This is what catches a hard-coded dark blue that disappears on
// a dark card.
//
// The cascade matters here: a base rule is only in force for a theme that has
// no `[data-theme="…"]`-scoped override of the same selector, so build the
// effective colour per theme instead of testing every declaration blindly.
function textOnlyRules(theme) {
  const base = new Map();     // normalised selector -> literal colour
  const scoped = new Map();   // "theme|selector"    -> literal colour
  const re = /([^{}@]+)\{([^{}]*)\}/g;
  let m;
  while ((m = re.exec(ALL_CSS))) {
    let sel = m[1].trim().replace(/\s+/g, ' ');
    if (!sel || sel.startsWith('@') || sel.includes('%')) continue;
    const body = m[2];
    // `background:none` / `transparent` still means "whatever is behind me".
    const bgDecl = body.match(/(?:^|;)\s*background(?:-color|-image)?\s*:\s*([^;]+)/i);
    if (bgDecl && !/^\s*(none|transparent)\s*!?/i.test(bgDecl[1])) continue;
    const fg = body.match(/(?:^|;)\s*color\s*:\s*([^;]+)/i);
    if (!fg) continue;
    const v = fg[1].replace(/!important/i, '').trim();
    // Tokens are theme-aware by construction; only literals can be wrong.
    if (!/^#|^rgba?\(/.test(v)) continue;
    // Selector lists share one declaration block — record each part.
    for (let part of sel.split(',')) {
      part = part.trim();
      if (!part) continue;
      const scope = part.match(/^\[data-theme="(\w+)"\]\s*(.+)$/);
      if (scope) scoped.set(scope[1] + '|' + scope[2], v);
      else base.set(part, v);
    }
  }
  const out = [];
  const seen = new Set();
  const consider = (selector, value) => {
    if (seen.has(selector)) return;
    seen.add(selector);
    const fixed = FIXED_SELECTORS.find(f => f.test.test(selector.split(' ').pop() || '') || f.test.test(selector));
    if (fixed) return;   // sits on a fixed surface, covered by pass one
    out.push({ where: selector, fg: value });
  };
  for (const [k, v] of scoped) {
    const [t, selector] = k.split('|');
    if (t === theme) consider(selector, v);
  }
  for (const [selector, v] of base) {
    if (scoped.has(theme + '|' + selector)) continue;   // overridden in this theme
    consider(selector, v);
  }
  return out;
}

// Regions of the page that sit on a fixed backdrop of their own, regardless of
// theme (the always-dark offline sheet, the no-JS splash). Anything inside them
// is composited over that colour instead of --bg0.
const FIXED_REGIONS = [
  { name: 'offline bar', from: '<!-- OFFLINE STATUS BAR -->', to: '<!-- SPLASH SCREEN -->', backdrop: '#2E2621' },
  { name: 'noscript', from: '<noscript>', to: '</noscript>', backdrop: '#0F0E0C' },
  { name: 'update banner', from: '<div id="updateBanner"', to: '<!-- WEIGHT LOG MODAL -->', backdrop: '#BE3A00' },
].map(r => ({ ...r, start: HTML.indexOf(r.from), end: HTML.indexOf(r.to) }));

// Selectors that live inside an always-orange card (the streak hero).
const FIXED_SELECTORS = [
  { test: /^\.(wd|sbc-)/, backdrop: 'var(--streak)', name: 'streak card' },
  { test: /^(\.banner-x|#updateBtn|#updateBanner)/, backdrop: '#BE3A00', name: 'update banner' },
  { test: /^\.splash-/, backdrop: 'var(--t0)', name: 'splash' },
  { test: /^\.about-ava-box/, backdrop: '#26221E', name: 'author avatar' },
  { test: /^\.prev-change/, backdrop: 'rgb(56,54,52)', name: 'photo preview' },
  // Tag pills inside the *selected* model row sit on the accent surface.
  { test: /^\.mdl-row\.on /, backdrop: 'var(--acc)', name: 'model row (selected)' },
  // The favourite toggle renders the ⭐ / ☆ glyph, which the font colours
  // itself; `color` only tints the hollow outline character.
  { test: /^\.li-star/, backdrop: 'var(--bg1)', name: 'star glyph', skip: true },
];

function htmlPairs() {
  const pairs = [];
  const re = /style="([^"]*)"/g;
  let m;
  while ((m = re.exec(HTML))) {
    const st = m[1];
    const bg = st.match(/(?:^|;)\s*background(?:-color)?\s*:\s*([^;]+)/i);
    const fg = st.match(/(?:^|;)\s*color\s*:\s*([^;]+)/i);
    if (!bg || !fg) continue;
    // Identify the element for the report.
    const tagStart = HTML.lastIndexOf('<', m.index);
    const tag = HTML.slice(tagStart, m.index).match(/^<([\w-]+)/);
    const id = HTML.slice(tagStart, HTML.indexOf('>', m.index)).match(/\bid="([^"]+)"/);
    const region = FIXED_REGIONS.find(r => r.start >= 0 && m.index > r.start && m.index < r.end);
    pairs.push({
      where: `inline <${tag ? tag[1] : '?'}${id ? ' #' + id[1] : ''}>${region ? ' [' + region.name + ']' : ''}`,
      bg: bg[1].trim(), fg: fg[1].trim(),
      backdrop: region ? region.backdrop : null,
    });
  }
  return pairs;
}

// Surfaces whose backdrop is fixed by design (always-dark sheets, the orange
// streak card, coloured settings icons) — their own background is opaque, so
// resolution handles them; nothing to exclude. Selectors we cannot evaluate
// (unresolvable values) are reported separately, not as failures.
const MIN_RATIO = 3.0;   // these are ≥14px semibold / large UI text
const pairs = [...cssPairs(), ...htmlPairs()];

let fail = 0, checked = 0;
const skipped = [];
const problems = [];

for (const theme of ['light', 'dark']) {
  const tokens = tokensFor(theme);
  const pageBg = resolve('var(--bg0)', tokens) || [255, 255, 255, 1];
  for (const p of pairs) {
    const bg = resolve(p.bg, tokens);
    const fg = resolve(p.fg, tokens);
    if (!bg || !fg || bg[3] === 0) { skipped.push(`${theme} ${p.where} (bg=${p.bg} fg=${p.fg})`); continue; }
    const base = (p.backdrop ? resolve(p.backdrop, tokens) : null) || pageBg;
    const bgFlat = over(bg, base);
    const fgFlat = over(fg, bgFlat);
    const r = ratio(fgFlat, bgFlat);
    checked++;
    if (r < MIN_RATIO) {
      fail++;
      problems.push(`${theme.padEnd(5)} ${r.toFixed(2)}:1  ${p.where}\n            background: ${p.bg}\n            color:      ${p.fg}`);
    }
  }
}

// ── Pass two ──────────────────────────────────────────────────────
for (const theme of ['light', 'dark']) {
  const tokens = tokensFor(theme);
  const surfaces = [['--bg0', resolve('var(--bg0)', tokens)], ['--bg1', resolve('var(--bg1)', tokens)]];
  for (const r of textOnlyRules(theme)) {
    const fg = resolve(r.fg, tokens);
    if (!fg) { skipped.push(`${theme} ${r.where} (fg=${r.fg})`); continue; }
    for (const [name, surf] of surfaces) {
      if (!surf) continue;
      checked++;
      const ratioVal = ratio(over(fg, surf), surf);
      if (ratioVal < MIN_RATIO) {
        fail++;
        problems.push(`${theme.padEnd(5)} ${ratioVal.toFixed(2)}:1  ${r.where} on ${name}\n            color: ${r.fg}`);
      }
    }
  }
}

console.log(`Theme contrast audit — ${checked} colour checks across both themes`);
if (problems.length) {
  console.log(`\n${problems.length} pair(s) below ${MIN_RATIO}:1\n`);
  problems.forEach(p => console.log('  ✗ ' + p));
} else {
  console.log(`All pairs are at least ${MIN_RATIO}:1 in both themes.`);
}
if (process.env.CONTRAST_VERBOSE && skipped.length) {
  console.log(`\nNot evaluated (${skipped.length}):`);
  [...new Set(skipped)].forEach(s => console.log('  · ' + s));
}
process.exit(fail ? 1 : 0);
