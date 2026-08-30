# CalSnap

[![Live demo](https://img.shields.io/badge/live-rjv--vi.github.io%2FCalSnap-FF7A30?style=flat-square&logo=googlechrome&logoColor=white)](https://rjv-vi.github.io/CalSnap/)
[![PWA](https://img.shields.io/badge/PWA-installable-5A0FC8?style=flat-square&logo=pwa&logoColor=white)](https://rjv-vi.github.io/CalSnap/)
[![Android TWA](https://img.shields.io/badge/Android-TWA-3DDC84?style=flat-square&logo=android&logoColor=white)](./ANDROID.md)
[![License: Proprietary](https://img.shields.io/badge/License-Proprietary-red.svg?style=flat-square)](./LICENSE)

> AI-калькулятор калорий, который помещается в одну вкладку браузера. Снимаешь
> еду — Gemini оценивает калории, БЖУ и порцию. Дневник, графики веса и
> уведомления работают офлайн.

**Live:** https://rjv-vi.github.io/CalSnap/

---

## Возможности

- **AI-анализ еды по фото / тексту / штрихкоду** через Gemini API + OpenFoodFacts
- **Пул API-ключей** — можно добавить до 10 ключей; при исчерпании лимита (429)
  ключ уходит на растущий кулдаун, а запрос уходит следующему по кругу
- **Отложенный анализ** — фото, снятое без интернета, встаёт в очередь и
  анализируется автоматически, как только связь появится
- **Дневник питания** с группировкой по приёмам пищи (завтрак / обед / перекус / ужин)
- **Цели и норма калорий** — расчёт BMR (Mifflin-St Jeor) c учётом активности
- **Прогресс**: стрик с авто-фризом, BMI, тепловая карта 28 дней, динамика веса
- **Водный баланс** с напоминаниями каждые 1–3 ч
- **Офлайн-база продуктов** (117 позиций, RU/EN) — добавление еды без API-ключа
  и без интернета: вкладка «Избранное» → «База продуктов»
- **AI-нутрициолог** — отдельный экран с чатом и быстрыми подсказками
- **Локальные уведомления** через Service Worker + Periodic Background Sync
- **Виджет «Калории сегодня»** ([widget.html](./widget.html))
- **Импорт / экспорт** в JSON и CSV (Excel)
- **PWA**: устанавливается на главный экран, работает офлайн (всё, кроме AI)
- **Полноэкранный режим** — `display: fullscreen` в манифесте + Fullscreen API
  в обычной вкладке браузера; переключатель в Настройки → Внешний вид
- **Android-приложение** через Trusted Web Activity ([ANDROID.md](./ANDROID.md))
- **i18n** — русский и английский, автоопределение по браузеру
- **Тёмная тема** + системный режим, haptics, звуковая обратная связь

## Tech stack

- **Pure HTML / CSS / vanilla JS** — без бандлеров, без фреймворков
- **Service Worker v12** — кэш + offline + push + periodic sync
- **localStorage** для состояния (с in-memory кэшем поверх для горячего пути
  рендера и защитой от переполнения квоты)
- **IndexedDB** для фото блюд — в `localStorage` лежат только ссылки, поэтому
  квота в 5 МБ больше не заканчивается через неделю использования
- **Gemini 2.0/2.5/3.x** — модели подгружаются из API динамически
- **Google Fonts** (DM Sans) с preconnect
- **GitHub Pages** хостинг + GitHub Actions для сборки Android APK через
  [Bubblewrap](https://github.com/GoogleChromeLabs/bubblewrap)

## Локальный запуск

```bash
# Любой статический сервер подойдёт. Например:
python3 -m http.server 8080
# или
npx serve .
```

Открой `http://localhost:8080`. Всё, что нужно для AI — это бесплатный
API-ключ Gemini ([получить за 1 минуту](https://aistudio.google.com/app/apikey)),
вводится в Настройки → API.

> ⚠️ Открытие через `file://` отключает Service Worker и AI-функции — всегда
> запускай через HTTP-сервер.

## Приватность

- **Все данные** (дневник, вес, профиль) хранятся локально в `localStorage`
  браузера. На сервер ничего не отправляется.
- **AI-запросы** (фото, описание блюда) уходят напрямую в Google Gemini —
  ключи хранятся только у тебя в браузере (в UI всегда показаны замаскированными).
- **Фото из офлайн-очереди** лежат в IndexedDB на устройстве до анализа.
- **Штрихкоды** ищутся в открытой базе [OpenFoodFacts](https://world.openfoodfacts.org/).
- **Уведомления** работают локально через Service Worker, ничего не пушится с сервера.

## Структура проекта

```
.
├── index.html            # Single-page UI (онбординг + 4 экрана)
├── widget.html           # Standalone-виджет «Калории сегодня»
├── manifest.json         # PWA manifest
├── sw.js                 # Service Worker (cache + push + periodic sync)
├── twa-manifest.json     # Bubblewrap config для Android TWA
├── assets/
│   ├── css/              # 4 CSS-файла: base / components / screens / polish
│   └── js/               # 24 JS-модуля: state, store, keys, queue, ui, ...
│       ├── store.js      # IndexedDB-хранилище фото + защита квоты
│       ├── keys.js       # Пул Gemini-ключей с ротацией и кулдаунами
│       ├── queue.js      # Очередь офлайн-фото для отложенного анализа
│       └── fullscreen.js # Полноэкранный режим (Fullscreen API + манифест)
├── icons/                # PWA-иконки 72…512
├── sounds/               # 26 интерфейсных мини-звуков
├── tests/
│   └── smoke.mjs         # jsdom-тесты: i18n, персистентность, UI-потоки
├── package.json          # Только для запуска тестов (сайт статический)
├── .well-known/
│   └── assetlinks.json   # Digital Asset Links для Android TWA
├── .github/workflows/
│   ├── android.yml       # CI для сборки APK + AAB через Bubblewrap
│   ├── lighthouse.yml    # Lighthouse-аудит
│   └── tests.yml         # CI для smoke-тестов
└── ANDROID.md            # Инструкция по релизу Android-сборки
```

## Тесты

Smoke-тесты поднимают `index.html` в jsdom, прогоняют реальные модули и
проверяют то, что исторически ломалось: полноту словарей i18n, отсутствие
русского текста в EN-режиме, сохранение дневника при переполнении квоты
`localStorage`, группировку по приёмам пищи, стрик, экспорт/импорт, склонения,
ротацию API-ключей при 429 и очередь офлайн-анализа.

```bash
npm install     # единственная зависимость — jsdom
npm run lint    # синтаксическая проверка всех модулей
npm test        # 246 проверок
```

## Авторы

- **RJV** — разработка, дизайн, идея
- **Rizan** — идеи и обратная связь

## Лицензия

Все права защищены. См. [LICENSE](./LICENSE) — код не MIT, копирование,
изменение и распространение без письменного разрешения автора запрещены.
