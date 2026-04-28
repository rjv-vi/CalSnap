// ═══════════════════════════════════════════════════
// UX HELPERS — count-up tween, skeleton, micro-anims
// ═══════════════════════════════════════════════════

// Animate the textContent of an element from its current numeric value to `target`
// over `duration` ms with a smooth ease-out curve. Skips animation if user prefers
// reduced motion or if the delta is small enough to not be perceptible.
//
// Usage:
//   tweenNumber(el, 1240);                      // default 380ms, integer formatting
//   tweenNumber(el, 1240, { suffix: ' kcal' }); // appends suffix
//   tweenNumber(el, 12.5, { decimals: 1 });     // 1 decimal
//   tweenNumber(el, 1240, { format: v => Math.round(v) + 'г' }); // custom formatter
function tweenNumber(el, target, opts) {
  if (!el) return;
  opts = opts || {};
  const duration = opts.duration != null ? opts.duration : 380;
  const decimals = opts.decimals != null ? opts.decimals : 0;
  const suffix = opts.suffix || '';
  const prefix = opts.prefix || '';
  const format = opts.format || (v => prefix + v.toFixed(decimals) + suffix);
  const reducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  // Read current value from data attribute (set by us) or parse from text
  const fromRaw = el.dataset._tweenVal != null ? parseFloat(el.dataset._tweenVal) : parseFloat((el.textContent||'0').replace(/[^\d.\-]/g,'')) || 0;
  const from = isFinite(fromRaw) ? fromRaw : 0;
  // Cancel any running animation on this element
  if (el._tweenRaf) cancelAnimationFrame(el._tweenRaf);
  // No animation needed
  if (reducedMotion || Math.abs(target - from) < 0.5) {
    el.textContent = format(target);
    el.dataset._tweenVal = target;
    return;
  }
  const start = performance.now();
  // ease-out cubic — fast start, soft settle
  const ease = t => 1 - Math.pow(1 - t, 3);
  const step = now => {
    const t = Math.min(1, (now - start) / duration);
    const v = from + (target - from) * ease(t);
    el.textContent = format(v);
    if (t < 1) {
      el._tweenRaf = requestAnimationFrame(step);
    } else {
      el.textContent = format(target);
      el.dataset._tweenVal = target;
      el._tweenRaf = null;
    }
  };
  el._tweenRaf = requestAnimationFrame(step);
}

// Show or hide a skeleton placeholder inside `el`. When show=true the element
// gets a `.skel-on` class which the CSS uses to render a shimmer placeholder.
function setSkeleton(el, show) {
  if (!el) return;
  el.classList.toggle('skel-on', !!show);
}
