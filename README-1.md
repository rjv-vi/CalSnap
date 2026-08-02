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
- **Дневник питания** с группировкой по приёмам пищи (завтрак / обед / перекус / ужин)
- **Цели и норма калорий** — расчёт BMR (Mifflin-St Jeor) c учётом активности
- **Прогресс**: стрик с авто-фризом, BMI, тепловая карта 28 дней, динамика веса
- **Водный баланс** с напоминаниями каждые 1–3 ч
- **AI-нутрициолог** — отдельный экран с чатом и быстрыми подсказками
- **Локальные уведомления** через Service Worker + Periodic Background Sync
- **Виджет «Калории сегодня»** ([widget.html](./widget.html))
- **Импорт / экспорт** в JSON и CSV (Excel)
- **PWA**: устанавливается на главный экран, работает офлайн (всё, кроме AI)
- **Android-приложение** через Trusted Web Activity ([ANDROID.md](./ANDROID.md))
- **i18n** — русский и английский, автоопределение по браузеру
- **Тёмная тема** + системный режим, haptics, звуковая обратная связь

## Tech stack

- **Pure HTML / CSS / vanilla JS** — без бандлеров, без фреймворков, ~2500 строк
- **Service Worker v8** — кэш + offline + push + periodic sync
- **localStorage** для состояния (с in-memory кэшем поверх для горячего пути рендера)
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
  ключ хранится только у тебя в браузере.
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
│   └── js/               # 20 JS-модулей: state, ui, ai, water, drum, ...
├── icons/                # PWA-иконки 72…512
├── sounds/                # 37 интерфейсных мини-звуков
├── .well-known/
│   └── assetlinks.json   # Digital Asset Links для Android TWA
├── .github/workflows/
│   └── android.yml       # CI для сборки APK + AAB через Bubblewrap
└── ANDROID.md            # Инструкция по релизу Android-сборки
```

## Авторы

- **RJV** — разработка, дизайн, идея
- **Rizan** — идеи и обратная связь

## Лицензия

Все права защищены. См. [LICENSE](./LICENSE) — код не MIT, копирование,
изменение и распространение без письменного разрешения автора запрещены.
