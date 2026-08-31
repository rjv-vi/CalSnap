# CalSnap

[![Live demo](https://img.shields.io/badge/live-rjv--vi.github.io%2FCalSnap-FF7A30?style=flat-square&logo=googlechrome&logoColor=white)](https://rjv-vi.github.io/CalSnap/)
[![PWA](https://img.shields.io/badge/PWA-installable-5A0FC8?style=flat-square&logo=pwa&logoColor=white)](https://rjv-vi.github.io/CalSnap/)
[![Android TWA](https://img.shields.io/badge/Android-TWA-3DDC84?style=flat-square&logo=android&logoColor=white)](./ANDROID.md)
[![License: Proprietary](https://img.shields.io/badge/License-Proprietary-red.svg?style=flat-square)](./LICENSE)

> An AI calorie tracker that fits in a single browser tab. Photograph your food
> and Gemini estimates the calories, macros and portion size. The diary, weight
> charts and reminders all work offline.

**Live:** https://rjv-vi.github.io/CalSnap/

---

## Features

- **AI food analysis from a photo, text or barcode** — Gemini API + OpenFoodFacts
- **API key pool** — store up to 10 keys; a key that hits its rate limit (429)
  goes on an escalating cooldown while the request rotates to the next one
- **Deferred analysis** — a photo, a typed meal or a barcode captured offline is
  queued and resolved automatically the moment connectivity returns
- **Food diary** grouped by meal (breakfast / lunch / snack / dinner), with the
  four window start times editable in Settings → Food — nobody eats on the same
  schedule, and a 21:00 dinner should not be filed as a snack
- **Goals and calorie targets** — BMR (Mifflin-St Jeor) adjusted for activity
- **Progress** — streak with an automatic freeze, BMI, 28-day heat map, weight trend
- **Water balance** with reminders every 1–3 hours
- **AI nutritionist** — multiple conversations (switch, auto-expire after 30 days,
  delete by hand), up to 6 photos per message from the camera or the gallery,
  copyable answers, request cancellation and rich formatting (lists, emphasis)
- **AI usage stats** — requests and token counts, per day and per model, in Settings
- **Local notifications** via Service Worker + Periodic Background Sync
- **"Calories today" widget** ([widget.html](./widget.html))
- **Import / export** as JSON and CSV (Excel)
- **PWA** — installs to the home screen and works offline (everything except AI)
- **Fullscreen mode** — `display: fullscreen` in the manifest plus the Fullscreen
  API in a plain browser tab; toggle in Settings → Appearance
- **Android app** via Trusted Web Activity ([ANDROID.md](./ANDROID.md))
- **i18n** — Russian and English, auto-detected from the browser
- **Theme** — light / dark / system (follows the OS setting live)
- **Data safety** — every `localStorage` write is verified by reading it back, and
  the whole diary is mirrored into IndexedDB, so entries survive storage eviction
- Haptics and sound feedback
- **Hardware back and Esc** peel open sheets one layer at a time instead of
  leaving the app
- **Sound without binaries** — every event has a Web Audio fallback, so a missing
  mp3 never turns into silence

## Tech stack

- **Plain HTML / CSS / vanilla JS** — no bundlers, no frameworks
- **Service Worker v16** — caching + offline + push + periodic sync
- **localStorage** for state, behind a small in-memory cache for the hot render
  path, with quota-exhaustion handling
- **IndexedDB** for food photos and the state mirror — `localStorage` only holds
  references, so the 5 MB quota no longer runs out after a week of use and
  storage eviction no longer loses the diary
- **Gemini 2.0 / 2.5 / 3.x** — the model list is fetched from the API at runtime
- **Google Fonts** (DM Sans) with preconnect
- **GitHub Pages** hosting + GitHub Actions to build the Android APK with
  [Bubblewrap](https://github.com/GoogleChromeLabs/bubblewrap)

## Running locally

```bash
# Any static server will do. For example:
python3 -m http.server 8080
# or
npx serve .
```

Open `http://localhost:8080`. The only thing the AI features need is a free
Gemini API key ([takes a minute](https://aistudio.google.com/app/apikey)),
entered in Settings → API.

> ⚠️ Opening the page over `file://` disables the Service Worker and the AI
> features — always serve it over HTTP.

## Privacy

- **All data** (diary, weight, profile) lives locally in the browser's
  `localStorage`. Nothing is sent to a server.
- **AI requests** (photos, meal descriptions) go straight to Google Gemini. Keys
  are stored only in your browser and are always masked in the UI.
- **Photos in the offline queue** stay in IndexedDB on the device until analysed.
- **Barcodes** are looked up in the open [OpenFoodFacts](https://world.openfoodfacts.org/) database.
- **Notifications** are generated locally by the Service Worker; nothing is
  pushed from a server.

## Project layout

```
.
├── index.html            # Single-page UI (onboarding + 4 screens)
├── widget.html           # Standalone "Calories today" widget
├── manifest.json         # PWA manifest
├── sw.js                 # Service Worker (cache + push + periodic sync)
├── twa-manifest.json     # Bubblewrap config for the Android TWA
├── assets/
│   ├── css/              # 4 stylesheets: base / components / screens / polish
│   └── js/               # 24 modules: state, store, keys, queue, ui, ...
│       ├── store.js      # IndexedDB photo store + quota safety
│       ├── keys.js       # Gemini key pool with rotation and cooldowns
│       ├── usage.js      # Local token / request accounting
│       ├── queue.js      # Offline photo queue for deferred analysis
│       └── fullscreen.js # Fullscreen mode (Fullscreen API + manifest)
├── icons/                # PWA icons, 72…512
├── sounds/               # 26 short interface sounds
├── tests/
│   ├── smoke.mjs         # jsdom tests: i18n, persistence, UI flows
│   └── contrast.mjs      # theme contrast audit (catches white-on-white)
├── package.json          # Only used to run the tests; the site is static
├── TASKS.md              # Current work list
├── .well-known/
│   └── assetlinks.json   # Digital Asset Links for the Android TWA
├── .github/workflows/
│   ├── android.yml       # CI: build APK + AAB with Bubblewrap
│   ├── lighthouse.yml    # Lighthouse audit
│   └── tests.yml         # CI: smoke tests
└── ANDROID.md            # Android release guide
```

## Tests

The smoke tests load `index.html` in jsdom, run the real modules and check the
things that have actually broken before: i18n dictionary coverage, the absence of
Russian text in EN mode, the diary surviving a full `localStorage` quota, meal
grouping, streaks, export/import, plural agreement, API key rotation on 429, the
offline analysis queue, sheets closing on Back, and sound coverage.

The contrast audit parses the stylesheets and inline styles, resolves the custom
properties for each theme and computes the WCAG contrast of every
background/text pair. That is what catches "white text on a white background":
`--acc` is near-black in the light theme and near-**white** in the dark one, so a
hard-coded `color:#fff` on top of it disappears in one of them.

```bash
npm install           # the only dependency is jsdom
npm run lint          # syntax-check every module
npm run test:contrast # theme contrast audit
npm test              # audit + 496 smoke checks
```

## Author

- **RJV** — engineering, design, idea

## License

**Proprietary.** © 2024–2026 RJV, all rights reserved — see [LICENSE](./LICENSE).
The repository is public so the app can be hosted, inspected and discussed, not
so that it can be copied.

**Allowed without asking:** using the app, reading the code, taking screenshots
and screen recordings, publishing reviews (including negative ones), streams,
tutorials, articles and posts — monetised content included. No approval and no
revenue share required. Coverage will never be the subject of a takedown request.

**Not allowed:** copying, forking or mirroring the code, creating derivative
works, distributing or selling it, publishing it to app stores or package
registries, claiming authorship, removing author credits, replacing the branding
with your own, or using the code as training data for models.

Any violation terminates every permission automatically. The author may file
DMCA and equivalent notices, contact hosting providers, stores and platforms, and
request strikes or suspensions. Anything beyond the list above requires a written
agreement.
