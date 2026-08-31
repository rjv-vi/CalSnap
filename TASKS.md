# Task list

Updated as work progresses. `[ ]` — queued, `[~]` — in progress, `[x]` — done.

## Bugs
- [x] Some images (screenshots, non-food pictures) still fail to load
      → re-encoded payloads were declared with the *original* MIME type, which the
        API refuses; the canvas result was also rejected below 512 chars, and only
        four of a multi-pick made it in.
- [x] Date-of-birth year list stops at 2021 instead of the current year

## Model picker
- [x] Mark `gemini-pro-latest` as recommended too
- [x] Badge every model: fast / accurate / slow / paid / legacy …

## Settings
- [x] Editable meal windows (breakfast / lunch / snack / dinner start times)

## Offline
- [x] Better look, UX and animations for the pending list and offline mode overall

## Polish
- [x] Model picker: sticky search field, grouped list, empty state
- [x] Birthday wheel: day column follows the month (no 30 February)
- [x] Accessible names for the icon-only close / quantity / dismiss buttons
- [x] Diary group headers show their window once the meal times are customised
- [x] Reduced-motion coverage for every new animation
- [x] Tests + contrast audit — 575 smoke checks, 272 contrast pairs
