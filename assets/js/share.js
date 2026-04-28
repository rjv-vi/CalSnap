// ══════════════════════════════════════════════════
// SHARE TARGET / HASH SHORTCUT
// ══════════════════════════════════════════════════
function _handleShareTarget(){
  try {
    const params = new URLSearchParams(location.search);
    const text = params.get('share_text') || params.get('share_title') || '';
    if (!text) return;
    // Open Add modal in text tab and prefill
    setTimeout(() => {
      try {
        if (typeof openAdd === 'function') openAdd();
        const tab2 = document.getElementById('addTab1');
        if (tab2) tab2.click();
        const inp = document.getElementById('txinp');
        if (inp) { inp.value = text; inp.focus(); }
      } catch(e) {}
      // Clear params from URL
      try { history.replaceState(null, '', location.pathname); } catch(e){}
    }, 600);
  } catch(e){}
}
function _handleHashShortcut(){
  try {
    const h = (location.hash || '').toLowerCase();
    if (!h) return;
    if (h === '#add') setTimeout(() => { typeof openAdd === 'function' && openAdd(); history.replaceState(null,'',location.pathname); }, 500);
    else if (h === '#scan') setTimeout(() => {
      typeof openAdd === 'function' && openAdd();
      const tab = document.getElementById('addTab2');
      if (tab) tab.click();
      history.replaceState(null,'',location.pathname);
    }, 500);
  } catch(e){}
}

