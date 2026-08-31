# Contributing to CalSnap

Thanks for wanting to help. This is a small personal project, so the rules are
short.

> By opening a Pull Request you agree that your contribution is provided under
> the project's licence (all rights belong to RJV) and may be used, modified or
> removed at the author's discretion.

## Reporting a bug

1. Check that it isn't already in [Issues](https://github.com/rjv-vi/CalSnap/issues).
2. Open a new issue with reproduction steps, expected vs. actual behaviour, a
   screenshot, and your browser / OS.
3. If you can, attach the logs from the built-in dev panel (five quick taps on
   the 🍎 logo in the "About" sheet → `📋 Copy logs`).

## Suggesting a feature

Open an issue tagged `enhancement` and describe the user scenario: *who needs it,
in what situation, and why*. UI mock-ups are welcome.

## Sending a PR

1. Fork the repo and branch off `main` (`feat/short-name` or `fix/short-name`).
2. Do not add npm dependencies and do not introduce a bundler — the stack is
   deliberately plain: HTML/CSS/JS served from GitHub Pages as-is.
3. Serve `index.html` over HTTP (`python3 -m http.server 8080`); `file://` breaks
   the Service Worker and the AI features.
4. Follow the existing conventions:
   - two-space indentation in HTML, CSS and JS;
   - short names for the frequently used helpers (`G/S/U/log/key/…`);
   - don't comment on *what* the code does — comment on *why*, and only when it
     isn't obvious.
5. Every UI string goes through `data-i18n` / `t()` / `tf()`. The English
   translation is mandatory: add the key to **both** branches of `I18N` in
   `assets/js/i18n.js`.
6. Service Worker: when you change a cached asset, bump the `CACHE` version in
   `sw.js` (for example `calsnap-v14` → `calsnap-v15`).
7. Run the checks before opening the PR:

   ```bash
   npm install
   npm run lint          # syntax-check every module
   npm run test:contrast # theme contrast audit — no white-on-white
   npm test              # audit + smoke tests
   ```

8. Verify the app still works offline (DevTools → Network → Offline) and that
   onboarding completes with a clean console.

## Commit style

No strict scheme, but [Conventional Commits](https://www.conventionalcommits.org/)
is preferred:

```
feat(water): add 1L bottle preset
fix(sw): bump cache version after icon swap
docs: clarify Gemini API key setup
```

## Releasing the Android build

Full instructions live in [ANDROID.md](./ANDROID.md). In short: push a semver tag
`vX.Y.Z` and GitHub Actions builds the APK + AAB and publishes a Release.
