// ═══════════════════════════════════════════════════
// CALSNAP SERVICE WORKER — БЕЗ РУЧНОГО ВЕРСИОНИРОВАНИЯ
//
// Логика:
//   index.html, widget.html → всегда с сервера (network-first)
//   sounds/, icons/ → кэш навсегда (они не меняются)
//   Gemini API → всегда сеть, без кэша
//   Шрифты → сеть, потом кэш
//
// Менять этот файл НЕ НУЖНО никогда.
// ═══════════════════════════════════════════════════

const CACHE = 'calsnap-static-v1';

// Только статика которая никогда не меняется
const STATIC_ASSETS = [
  './icons/icon-72.png',
  './icons/icon-96.png',
  './icons/icon-128.png',
  './icons/icon-144.png',
  './icons/icon-152.png',
  './icons/icon-192.png',
  './icons/icon-384.png',
  './icons/icon-512.png',
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
      Promise.allSettled(STATIC_ASSETS.map(url => c.add(url).catch(() => {})))
    ).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  // Удаляем старые кэши с версиями (v1, v2, v3...)
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

  // Gemini API — всегда сеть, без кэша
  if (url.includes('generativelanguage.googleapis.com')) {
    e.respondWith(
      fetch(e.request).catch(() =>
        new Response('{"error":{"message":"Нет интернета","code":503}}',
          { headers: { 'Content-Type': 'application/json' } })
      )
    );
    return;
  }

  // Connectivity check — всегда сеть
  if (url.includes('connectivitycheck.gstatic.com')) {
    e.respondWith(fetch(e.request).catch(() => new Response('', { status: 408 })));
    return;
  }

  // Шрифты — сеть, потом кэш
  if (url.includes('fonts.googleapis.com') || url.includes('fonts.gstatic.com')) {
    e.respondWith(
      fetch(e.request).then(res => {
        const clone = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, clone));
        return res;
      }).catch(() => caches.match(e.request))
    );
    return;
  }

  // HTML страницы — ВСЕГДА сеть первая, кэш только если офлайн
  // Так index.html всегда свежий — никакого ручного версионирования не нужно
  if (e.request.mode === 'navigate' ||
      url.endsWith('/') ||
      url.endsWith('.html') ||
      url.endsWith('manifest.json')) {
    e.respondWith(
      fetch(e.request).then(res => {
        const clone = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, clone));
        return res;
      }).catch(() => caches.match(e.request) || caches.match('./index.html'))
    );
    return;
  }

  // Иконки и звуки — кэш навсегда (они не меняются)
  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;
      return fetch(e.request).then(res => {
        if (res.ok && e.request.method === 'GET') {
          const clone = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone));
        }
        return res;
      }).catch(() => caches.match('./index.html'));
    })
  );
});

self.addEventListener('message', e => {
  if (e.data === 'skipWaiting') self.skipWaiting();
});
