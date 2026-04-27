// ═══════════════════════════════════════════════════
// CALSNAP SERVICE WORKER v5
// • Precache all sounds + icons + manifest
// • Stale-while-revalidate for HTML/JSON
// • Background notifications via Periodic Sync
// • Push handler ready for future server push
// • Notification click focuses existing tab
// ═══════════════════════════════════════════════════

const CACHE = 'calsnap-v6';
const NOTIF_CACHE = 'calsnap-notif';

const ICONS = [
  './icons/icon-72.png',  './icons/icon-96.png',
  './icons/icon-128.png', './icons/icon-144.png',
  './icons/icon-152.png', './icons/icon-192.png',
  './icons/icon-384.png', './icons/icon-512.png',
];

const SOUNDS = [
  'add_food','ai_error','ai_reply','ai_send','back','btn_tap','card_tap','copy',
  'delete','drum_confirm','drum_tick','error','export_done','goal_reached',
  'import_done','install','notif_ring','notif_save','ob_finish','ob_next',
  'onboard_skip','photo_snap','reset_confirm','save','scan_success','select',
  'sheet_close','sheet_open','splash','streak_up','tab_switch','toggle',
  'water_add','water_goal','water_undo','weight_log','welcome',
].map(n => `./sounds/${n}.mp3`);

const STATIC_ASSETS = [
  './',
  './index.html',
  './widget.html',
  './manifest.json',
  ...ICONS,
  ...SOUNDS,
];

// ── Install ──────────────────────────────────────
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => Promise.allSettled(STATIC_ASSETS.map(url => c.add(url).catch(() => {}))))
      .then(() => self.skipWaiting())
  );
});

// ── Activate ─────────────────────────────────────
self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys
      .filter(k => k.startsWith('calsnap-') && k !== CACHE && k !== NOTIF_CACHE)
      .map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

// ── Fetch ─────────────────────────────────────────
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = req.url;

  // Gemini API — network-only, graceful offline JSON
  if (url.includes('generativelanguage.googleapis.com')) {
    e.respondWith(fetch(req).catch(() =>
      new Response('{"error":{"message":"Нет интернета","code":503}}',
        { headers: { 'Content-Type': 'application/json' }, status: 503 })
    ));
    return;
  }

  // OpenFoodFacts — network with cache fallback (read-only public API)
  if (url.includes('world.openfoodfacts.org') || url.includes('openfoodfacts.org')) {
    e.respondWith((async () => {
      try {
        const res = await fetch(req);
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(req, copy).catch(() => {}));
        }
        return res;
      } catch {
        const cached = await caches.match(req);
        return cached || new Response('{"status":0}', {
          headers: { 'Content-Type': 'application/json' }, status: 503,
        });
      }
    })());
    return;
  }

  // Connectivity check — pass-through
  if (url.includes('connectivitycheck.gstatic.com')) {
    e.respondWith(fetch(req).catch(() => new Response('', { status: 408 })));
    return;
  }

  // Google Fonts — stale-while-revalidate
  if (url.includes('fonts.googleapis.com') || url.includes('fonts.gstatic.com')) {
    e.respondWith((async () => {
      const cached = await caches.match(req);
      const fetchP = fetch(req).then(res => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(req, copy).catch(() => {}));
        }
        return res;
      }).catch(() => cached);
      return cached || fetchP;
    })());
    return;
  }

  // HTML / manifest — network-first (always get latest), fallback to cache
  if (req.mode === 'navigate' || url.endsWith('.html') || url.endsWith('manifest.json')) {
    e.respondWith((async () => {
      try {
        const res = await fetch(req);
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(req, copy).catch(() => {}));
        }
        return res;
      } catch {
        return (await caches.match(req)) || (await caches.match('./index.html'));
      }
    })());
    return;
  }

  // Everything else — cache-first
  e.respondWith((async () => {
    const cached = await caches.match(req);
    if (cached) return cached;
    try {
      const res = await fetch(req);
      if (res.ok) {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(req, copy).catch(() => {}));
      }
      return res;
    } catch {
      return (await caches.match('./index.html')) || new Response('', { status: 504 });
    }
  })());
});

// ── Messages from page ────────────────────────────
self.addEventListener('message', async e => {
  if (e.data === 'skipWaiting') { self.skipWaiting(); return; }

  if (e.data?.type === 'SAVE_NOTIF_SCHEDULE') {
    try {
      const cache = await caches.open(NOTIF_CACHE);
      await cache.put('schedule', new Response(JSON.stringify(e.data.schedule), {
        headers: { 'Content-Type': 'application/json' }
      }));
    } catch(err) {}
    return;
  }

  if (e.data?.type === 'SHOW_NOTIF') {
    try {
      await self.registration.showNotification(e.data.title, {
        body: e.data.body, icon: 'icons/icon-192.png',
        badge: 'icons/icon-72.png', vibrate: [100, 50, 100],
        tag: e.data.tag || 'calsnap', renotify: true,
      });
    } catch(err) {}
    return;
  }
});

// ── Periodic Background Sync ──────────────────────
self.addEventListener('periodicsync', e => {
  if (e.tag === 'calsnap-notifs') {
    e.waitUntil(checkScheduledNotifs());
  }
});

// ── Push (server-driven future use) ───────────────
self.addEventListener('push', e => {
  let data = {};
  try { data = e.data ? e.data.json() : {}; } catch {}
  e.waitUntil(self.registration.showNotification(data.title || '🍎 CalSnap', {
    body: data.body || '',
    icon: 'icons/icon-192.png',
    badge: 'icons/icon-72.png',
    vibrate: [100, 50, 100],
    tag: data.tag || 'calsnap-push',
    data: { url: data.url || './' },
  }));
});

// ── Core: check if any notification is due ────────
async function checkScheduledNotifs() {
  try {
    const cache = await caches.open(NOTIF_CACHE);
    const res = await cache.match('schedule');
    if (!res) return;

    const schedule = await res.json();
    if (!schedule?.enabled) return;

    const allClients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const appFocused = allClients.some(c => c.visibilityState === 'visible');

    const now = new Date();
    const todayStr = now.toDateString();
    const nowMin = now.getHours() * 60 + now.getMinutes();
    let changed = false;

    // Choose locale-appropriate strings
    const lang = schedule.lang || 'ru';
    const MSGS = lang === 'en' ? {
      breakfast: { title: '🌅 Good morning!', body: 'Time for breakfast — log it now!' },
      lunch:     { title: '☀️ Lunch time',     body: 'Quick — log what you had (10s)' },
      dinner:    { title: '🌙 Evening',        body: 'How was your day? Log dinner in CalSnap.' },
      water:     { title: '💧 Drink some water', body: 'A glass of water helps reach your goal! 💪' },
    } : {
      breakfast: { title: '🌅 Доброе утро!',   body: 'Время завтрака — не забудь записать!' },
      lunch:     { title: '☀️ Обед',           body: 'Запиши что ел на обед — 10 секунд!' },
      dinner:    { title: '🌙 Вечер',          body: 'Как прошёл день? Запиши ужин в CalSnap.' },
      water:     { title: '💧 Пора пить воды', body: 'Стакан воды помогает достичь цели! 💪' },
    };

    const meals = [
      { key: 'breakfast', time: schedule.breakfast || '08:30', on: schedule.breakfast_on !== false },
      { key: 'lunch',     time: schedule.lunch     || '13:00', on: schedule.lunch_on     !== false },
      { key: 'dinner',    time: schedule.dinner    || '19:00', on: schedule.dinner_on    !== false },
    ];

    for (const meal of meals) {
      if (!meal.on) continue;
      const [hh, mm] = meal.time.split(':').map(Number);
      const targetMin = hh * 60 + mm;
      const diff = Math.abs(nowMin - targetMin);
      const lastKey = `last_${meal.key}_${todayStr}`;

      if (diff <= 30 && !schedule[lastKey]) {
        if (!appFocused) {
          const m = MSGS[meal.key];
          await self.registration.showNotification(m.title, {
            body: m.body, icon: 'icons/icon-192.png', badge: 'icons/icon-72.png',
            vibrate: [100, 50, 100], tag: `calsnap-${meal.key}`, renotify: false,
          });
        }
        schedule[lastKey] = true;
        changed = true;
      }
    }

    if (schedule.water_on !== false) {
      const waterH = parseInt(schedule.waterInterval || '2');
      if (waterH > 0) {
        const slot = Math.floor(nowMin / (waterH * 60));
        const lastWaterKey = `last_water_${todayStr}_${slot}`;

        if (!schedule[lastWaterKey]) {
          if (!appFocused) {
            const m = MSGS.water;
            await self.registration.showNotification(m.title, {
              body: m.body, icon: 'icons/icon-192.png', badge: 'icons/icon-72.png',
              vibrate: [100, 50, 100], tag: 'calsnap-water', renotify: true,
            });
          }
          schedule[lastWaterKey] = true;
          changed = true;
        }
      }
    }

    // Cleanup stale per-day flags
    for (const key of Object.keys(schedule)) {
      if (key.startsWith('last_') && !key.includes(todayStr)) {
        delete schedule[key];
        changed = true;
      }
    }

    if (changed) {
      await cache.put('schedule', new Response(JSON.stringify(schedule), {
        headers: { 'Content-Type': 'application/json' }
      }));
    }
  } catch(err) {
    // silent
  }
}

// ── Notification click — focus existing tab or open new one ─
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const targetUrl = e.notification.data?.url || './';
  e.waitUntil((async () => {
    const cs = await clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of cs) {
      if ('focus' in c) return c.focus();
    }
    if (clients.openWindow) return clients.openWindow(targetUrl);
  })());
});
