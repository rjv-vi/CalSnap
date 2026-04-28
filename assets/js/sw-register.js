// ── АВТО-ОБНОВЛЕНИЕ ЧЕРЕЗ ETAG ──
// Ничего не нужно менять вручную — система сама обнаруживает изменения на GitHub
(function() {
  // Защита от SW reload loop: если страница перезагрузилась < 4с назад — прячем сплэш
  try {
    var last = parseInt(sessionStorage.getItem('_sl') || '0');
    var now = Date.now();
    sessionStorage.setItem('_sl', now);
    if (now - last < 4000) {
      document.addEventListener('DOMContentLoaded', function() {
        var s = document.getElementById('splashOv');
        if (s) s.style.display = 'none';
      });
    }
  } catch(e) {}

  // ETag проверка — только если онлайн
  if (!navigator.onLine) return;

  try {
    var savedEtag = localStorage.getItem('_etag');
    var headers = {'Cache-Control': 'no-cache'};
    if (savedEtag) headers['If-None-Match'] = savedEtag;

    fetch(location.pathname, {method: 'HEAD', headers: headers, cache: 'no-store'})
      .then(function(res) {
        var newEtag = res.headers.get('ETag') || res.headers.get('Last-Modified');
        if (!newEtag) return; // сервер не вернул ETag — пропускаем

        if (res.status === 200 && savedEtag && newEtag !== savedEtag) {
          // Файл изменился! Чистим всё и перезагружаемся
          localStorage.setItem('_etag', newEtag);
          var kills = [];
          if ('serviceWorker' in navigator) {
            kills.push(
              navigator.serviceWorker.getRegistrations().then(function(regs) {
                return Promise.all(regs.map(function(r){ return r.unregister(); }));
              })
            );
          }
          if ('caches' in window) {
            kills.push(caches.keys().then(function(ks){
              return Promise.all(ks.map(function(k){ return caches.delete(k); }));
            }));
          }
          Promise.all(kills).then(function() {
            window.location.replace(location.pathname + '?_=' + Date.now());
          });
        } else if (newEtag) {
          // Сохраняем ETag для следующей проверки
          localStorage.setItem('_etag', newEtag);
        }
      })
      .catch(function(){}); // тихо игнорируем ошибки сети
  } catch(e) {}
})();
