# CalSnap — Android (TWA) build

CalSnap ships as a single PWA hosted on GitHub Pages. The Android build is a
[Trusted Web Activity](https://developer.chrome.com/docs/android/trusted-web-activity/)
(TWA) wrapper produced by [Bubblewrap](https://github.com/GoogleChromeLabs/bubblewrap)
in CI. The TWA loads the GitHub Pages site fullscreen with no browser chrome,
so users get a native-feeling app from the same codebase as the website.

## How to publish a new APK release

1. **Bump the PWA** as usual (commit changes to `main`, GitHub Pages updates
   automatically).
2. **Tag the commit** with a semver tag prefixed `v`:
   ```
   git tag v1.0.1
   git push origin v1.0.1
   ```
3. The `Build Android APK` workflow runs automatically on tag pushes. It:
   - decodes the signing keystore from repo Secrets,
   - patches the version into `twa-manifest.json`,
   - runs `bubblewrap update` + `bubblewrap build`,
   - uploads `calsnap-<version>.apk` and `calsnap-<version>.aab` to a new
     GitHub Release for that tag.
4. On Android, install the APK by downloading it from the release page.
   The first install requires *Settings → Apps → Install unknown apps* for
   your browser/file manager.

You can also run the workflow manually from the *Actions* tab
(*Run workflow* → optionally pass `version_name` and `version_code`). Manual
runs upload artifacts to the workflow run instead of a Release.

## Required GitHub repo Secrets

The workflow reads four Secrets (Settings → Secrets and variables → Actions):

| Name | Value |
| ---- | ----- |
| `ANDROID_KEYSTORE_BASE64` | base64-encoded `android.keystore` file |
| `ANDROID_KEYSTORE_PASSWORD` | keystore password |
| `ANDROID_KEY_ALIAS` | `android` |
| `ANDROID_KEY_PASSWORD` | key password (same as keystore password if generated together) |

If you ever lose the keystore, you cannot publish updates that existing
installs can upgrade to — Android tracks identity by signing key. Keep the
keystore backup in a password manager.

## Asset Links — what `.well-known/assetlinks.json` is for

For Chrome to render the website fullscreen (no URL bar), the website must
declare which APK is allowed to host it. That declaration lives at
[`/.well-known/assetlinks.json`](.well-known/assetlinks.json) and contains the
SHA256 fingerprint of the keystore that signed the APK. Without this file,
the TWA still works but Chrome shows the URL bar at the top.

If you ever rotate the keystore, regenerate the fingerprint and update
`assetlinks.json` accordingly:

```
keytool -list -v -keystore android.keystore -alias android | grep SHA256
```

## Bubblewrap config

[`twa-manifest.json`](./twa-manifest.json) is the source of truth for
Bubblewrap. It points at the PWA manifest at
`https://rjv-vi.github.io/CalSnap/manifest.json`, so any icon / theme /
shortcut change made there flows into the next APK build automatically.

The fields most likely to need editing later:

- `appVersionName` / `appVersion` / `appVersionCode` — automatically
  patched by the workflow from the git tag, but you can hard-pin them here
  if needed.
- `themeColor` / `backgroundColor` — these drive the splash screen. The
  PWA's `manifest.json` is the live source for in-app colors.
- `packageId` — `com.rjv.calsnap`. Do **not** change this after the first
  release: existing installs cannot upgrade across packageId changes.
