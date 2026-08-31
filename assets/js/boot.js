/*!
 * CalSnap — © 2024–2026 RJV. All rights reserved.
 * Proprietary. Reviews, videos and screenshots are welcome; copying,
 * redistributing or republishing this code is not. See LICENSE.
 * https://github.com/rjv-vi/CalSnap
 */
// Apply the theme and language before the stylesheets load, so there is no flash
(function(){
  try{
    // 'light' | 'dark' | 'system' (or absent, which means system).
    var t=localStorage.getItem('theme');
    if(t!=='light' && t!=='dark'){
      try { t = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'; }
      catch(e){ t='light'; }
    }
    document.documentElement.setAttribute('data-theme',t);
    var l=localStorage.getItem('lang');
    if(!l){
      var nl=(navigator.language||'ru').toLowerCase();
      l = nl.startsWith('ru') || nl.startsWith('uk') || nl.startsWith('be') || nl.startsWith('kk') ? 'ru' : 'en';
    }
    document.documentElement.setAttribute('lang', l);
    // The theme-color meta has to match the resolved theme
    var tcm=document.getElementById('tc-meta');
    if(tcm) tcm.setAttribute('content', t==='dark' ? '#0F0E0C' : '#F2F0EB');
  }catch(e){}
})();
