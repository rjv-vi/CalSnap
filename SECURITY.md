# Security Policy

## Supported versions

Only the latest version of CalSnap deployed to
[GitHub Pages](https://rjv-vi.github.io/CalSnap/) is supported. Older APK builds
do not update themselves — install updates manually from
[Releases](https://github.com/rjv-vi/CalSnap/releases).

## Reporting a vulnerability

Please don't open a public issue for security problems. Use one of:

1. **GitHub Security Advisories** —
   [private report](https://github.com/rjv-vi/CalSnap/security/advisories/new)
   (preferred).
2. A direct message via the [@rjv-vi](https://github.com/rjv-vi) profile.

I aim to respond within **7 days** and to fix critical issues within **30 days**.

## In scope

- XSS or injection anywhere in the UI or in a Gemini response that leads to code
  execution in the app's context.
- Leaking user data (food log, weight, profile) anywhere other than the Gemini
  API and OpenFoodFacts.
- Bypassing the Service Worker checks so that stale content keeps being served
  long after a release.
- Any vulnerability in the Android TWA wrapper, other than known Bubblewrap
  behaviour.

## Out of scope

- Hypothetical issues that only occur when CalSnap is opened over `file://` or
  with the Service Worker blocked.
- A third-party browser extension interfering with the UI.
- Social engineering that requires the victim to hand over their own Gemini API
  key.
