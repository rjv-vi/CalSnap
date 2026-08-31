// Применяем тему и язык сразу — до загрузки CSS/CSS, чтобы не было мигания
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
    // Theme-color мета должен соответствовать актуальной теме
    var tcm=document.getElementById('tc-meta');
    if(tcm) tcm.setAttribute('content', t==='dark' ? '#0F0E0C' : '#F2F0EB');
  }catch(e){}
})();
