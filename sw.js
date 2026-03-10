// ═══════════════════════════════════════════════════
// CALSNAP SERVICE WORKER v4
// Background notifications when app is closed:
//   • Periodic Background Sync (Chrome Android PWA)
//   • Stored timestamps so SW fires at exact times
// ═══════════════════════════════════════════════════

const CACHE = 'calsnap-v4';
const NOTIF_CACHE = 'calsnap-notif';

const STATIC_ASSETS = [
  './icons/icon-72.png',  './icons/icon-96.png',
  './icons/icon-128.png', './icons/icon-144.png',
  './icons/icon-152.png', './icons/icon-192.png',
  './icons/icon-384.png', './icons/icon-512.png',
  './sounds/splash.mp3',  './sounds/welcome.mp3',
  './sounds/tab_switch.mp3', './sounds/sheet_open.mp3',
  './sounds/sheet_close.mp3', './sounds/drum_tick.mp3',
  './sounds/drum_confirm.mp3', './sounds/ob_next.mp3',
  './sounds/ob_finish.mp3', './sounds/add_food.mp3',
  './sounds/scan_success.mp3', './sounds/btn_tap.mp3',
  './sounds/toggle.mp3', './sounds/save.mp3',
  './sounds/error.mp3', './sounds/ai_send.mp3',
  './sounds/ai_reply.mp3',
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
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k.startsWith('calsnap-') && k !== CACHE && k !== NOTIF_CACHE)
            .map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

// ── Fetch ─────────────────────────────────────────
self.addEventListener('fetch', e => {
  const url = e.request.url;

  if (url.includes('generativelanguage.googleapis.com')) {
    e.respondWith(fetch(e.request).catch(() =>
      new Response('{"error":{"message":"Нет интернета","code":503}}',
        { headers: { 'Content-Type': 'application/json' } })
    ));
    return;
  }

  if (url.includes('connectivitycheck.gstatic.com')) {
    e.respondWith(fetch(e.request).catch(() => new Response('', { status: 408 })));
    return;
  }

  if (url.includes('fonts.googleapis.com') || url.includes('fonts.gstatic.com')) {
    e.respondWith(
      fetch(e.request).then(res => {
        caches.open(CACHE).then(c => c.put(e.request, res.clone()));
        return res;
      }).catch(() => caches.match(e.request))
    );
    return;
  }

  if (e.request.mode === 'navigate' || url.endsWith('.html') || url.endsWith('manifest.json')) {
    e.respondWith(
      fetch(e.request).then(res => {
        caches.open(CACHE).then(c => c.put(e.request, res.clone()));
        return res;
      }).catch(() => caches.match(e.request) || caches.match('./index.html'))
    );
    return;
  }

  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;
      return fetch(e.request).then(res => {
        if (res.ok && e.request.method === 'GET') {
          caches.open(CACHE).then(c => c.put(e.request, res.clone()));
        }
        return res;
      }).catch(() => caches.match('./index.html'));
    })
  );
});

// ── Messages from page ────────────────────────────
self.addEventListener('message', async e => {
  if (e.data === 'skipWaiting') { self.skipWaiting(); return; }

  // Page saves schedule so SW can fire when app is closed
  if (e.data?.type === 'SAVE_NOTIF_SCHEDULE') {
    try {
      const cache = await caches.open(NOTIF_CACHE);
      await cache.put('schedule', new Response(JSON.stringify(e.data.schedule), {
        headers: { 'Content-Type': 'application/json' }
      }));
    } catch(err) {}
    return;
  }

  // Page asks SW to show notification immediately (app open but backgrounded)
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
// Fires even when app is closed (Chrome Android, installed PWA)
self.addEventListener('periodicsync', async e => {
  if (e.tag === 'calsnap-notifs') {
    e.waitUntil(checkScheduledNotifs());
  }
});

// ── Push (future) ─────────────────────────────────
self.addEventListener('push', e => {
  const data = e.data ? e.data.json() : {};
  e.waitUntil(self.registration.showNotification(data.title || '🍎 CalSnap', {
    body: data.body || '', icon: 'icons/icon-192.png', badge: 'icons/icon-72.png',
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

    // Don't show notifications if app is open and focused
    const allClients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const appFocused = allClients.some(c => c.visibilityState === 'visible');

    const now = new Date();
    const todayStr = now.toDateString();
    const nowMin = now.getHours() * 60 + now.getMinutes();
    let changed = false;

    const MSGS = {
      breakfast: { title: '🌅 Доброе утро!',  body: 'Время завтрака — не забудь записать!' },
      lunch:     { title: '☀️ Обед',           body: 'Запиши что ел на обед — 10 секунд!' },
      dinner:    { title: '🌙 Вечер',           body: 'Как прошёл день? Запиши ужин в CalSnap.' },
      water:     { title: '💧 Пора пить воды', body: 'Стакан воды помогает достичь цели! 💪' },
    };

    // Meal reminders — fire within ±30 min window (covers hourly sync gaps)
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

      // Fire if within ±30 min and not already shown today
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

    // Water reminder — every N hours
    if (schedule.water_on !== false) {
      const waterH = parseInt(schedule.waterInterval || '2');
      if (waterH > 0) {
        // Slot = which Nth hour block we're in today
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

    // Cleanup: remove last_ keys older than today to prevent cache bloat
    for (const key of Object.keys(schedule)) {
      if (key.startsWith('last_') && !key.includes(todayStr)) {
        delete schedule[key];
        changed = true;
      }
    }

    // Persist updated schedule
    if (changed) {
      await cache.put('schedule', new Response(JSON.stringify(schedule), {
        headers: { 'Content-Type': 'application/json' }
      }));
    }
  } catch(err) {
    // Silently ignore
  }
}

// ── Notification click ────────────────────────────
self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(cs => {
      for (const c of cs) if (c.url && 'focus' in c) return c.focus();
      if (clients.openWindow) return clients.openWindow('./');
    })
  );
});
