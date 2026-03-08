// ═══════════════════════════════════════════════════
// CALSNAP SERVICE WORKER v2
// ⚠️ Меняй CACHE_VERSION при каждом обновлении!
// ═══════════════════════════════════════════════════

const CACHE_VERSION = 'v3';
const CACHE = `calsnap-${CACHE_VERSION}`;

const ASSETS = [
  './',
  './index.html',
  './widget.html',
  './manifest.json',
  './icons/icon-72.png',
  './icons/icon-96.png',
  './icons/icon-128.png',
  './icons/icon-144.png',
  './icons/icon-152.png',
  './icons/icon-192.png',
  './icons/icon-384.png',
  './icons/icon-512.png',
  // Звуки — кэшируем для оффлайн
  './sounds/splash.mp3',
  './sounds/welcome.mp3',
  './sounds/tab_switch.mp3',
  './sounds/sheet_open.mp3',
  './sounds/sheet_close.mp3',
  './sounds/drum_tick.mp3',
  './sounds/drum_confirm.mp3',
  './sounds/ob_next.mp3',
  './sounds/ob_finish.mp3',
  './sounds/add_food.mp3',
  './sounds/scan_success.mp3',
  './sounds/btn_tap.mp3',
  './sounds/toggle.mp3',
  './sounds/save.mp3',
  './sounds/error.mp3',
  './sounds/ai_send.mp3',
  './sounds/ai_reply.mp3',
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c =>
      // allSettled — не падаем если звуков ещё нет
      Promise.allSettled(ASSETS.map(url => c.add(url).catch(() => {})))
    ).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(k => k.startsWith('calsnap-') && k !== CACHE).map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const url = e.request.url;

  // Gemini API — всегда сеть, при ошибке возвращаем JSON ошибки
  if(url.includes('generativelanguage.googleapis.com')){
    e.respondWith(
      fetch(e.request).catch(() =>
        new Response('{"error":{"message":"Нет интернета","code":503}}',
          {headers:{'Content-Type':'application/json'}})
      )
    );
    return;
  }

  // Шрифты — сеть первая, потом кэш
  if(url.includes('fonts.googleapis.com') || url.includes('fonts.gstatic.com')){
    e.respondWith(
      fetch(e.request).then(res => {
        const clone = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, clone));
        return res;
      }).catch(() => caches.match(e.request))
    );
    return;
  }

  // Навигация (index.html, widget.html) — сеть первая
  if(e.request.mode === 'navigate' || url.endsWith('/') || url.includes('.html')){
    e.respondWith(
      fetch(e.request).then(res => {
        const clone = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, clone));
        return res;
      }).catch(() => caches.match(e.request) || caches.match('./index.html'))
    );
    return;
  }

  // Всё остальное (иконки, звуки) — кэш первый
  e.respondWith(
    caches.match(e.request).then(cached => {
      if(cached) return cached;
      return fetch(e.request).then(res => {
        if(res.ok && e.request.method === 'GET'){
          const clone = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone));
        }
        return res;
      }).catch(() => caches.match('./index.html'));
    })
  );
});

// Получаем skipWaiting от страницы
self.addEventListener('message', e => {
  if(e.data === 'skipWaiting') self.skipWaiting();
});
