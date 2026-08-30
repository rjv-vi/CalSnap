// ══════════════════════════════════════════════════
// BMI
// ══════════════════════════════════════════════════
function rBMI() {
  if(!U || !U.w || !U.h) return;
  const h = (U.h||170) / 100;
  const bmi = Math.round((U.w / (h*h)) * 10) / 10;
  const el  = document.getElementById('bmiVal');
  const cat = document.getElementById('bmiCat');
  const needle = document.getElementById('bmiNeedle');
  if(!el) return;

  // Animated counter
  const duration = 800;
  const start = performance.now();
  const startVal = parseFloat(el.dataset.val || '0') || 0;
  el.dataset.val = bmi;
  el.textContent = bmi;
  const reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if(!reduced && startVal && Math.abs(bmi - startVal) > 0.05){
    const tick = (now) => {
      const p = Math.min((now - start) / duration, 1);
      const ease = 1 - Math.pow(1 - p, 3);
      el.textContent = (startVal + (bmi - startVal) * ease).toFixed(1);
      if(p < 1) requestAnimationFrame(tick);
      else el.textContent = bmi;
    };
    requestAnimationFrame(tick);
  }

  // Category
  let label, cls;
  if(bmi < 18.5)      { label=t('bmi_under','Недовес'); cls='under'; }
  else if(bmi < 25)   { label=t('bmi_norm','Норма ✓'); cls='norm'; }
  else if(bmi < 30)   { label=t('bmi_over','Избыток'); cls='over'; }
  else                { label=t('bmi_obese','Ожирение'); cls='obese'; }
  cat.textContent = label;
  cat.className = 'bmi-cat '+cls;

  // Needle (scale 16–40)
  const pct = Math.max(0, Math.min(96, (bmi - 16) / (40 - 16) * 100));
  if(needle) needle.style.left = pct+'%';
}

