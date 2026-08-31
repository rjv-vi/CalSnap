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

## Round 2 — placement and animation bugs
- [x] Model search: the focus ring hugged the bare `<input>` (a text line inset
      inside the pill) instead of the pill itself
- [x] Focus rings everywhere: the global rule forced `border-radius:6px`, drawing a
      rounded *square* around circular buttons; rings inside `overflow:hidden`
      cards were clipped
- [x] Queue thumbnail spinner: a rotating rounded *square* swept its corners
      through the frame and read as wobbling off-centre — now a circle over a
      dimmed thumbnail
- [x] Entrance animations replayed on every state re-render (queue rows, the
      count badge, the streak dots, the heat map, the model list while typing)
- [x] `el.hidden` did nothing on anything styled `display:flex`
- [x] A disabled primary button looked pressable
- [x] Attach strip clipped the remove ✕ when scrolled to either end
- [x] Nav pill: tapping a tab and dragging it used different padding (8% vs 10%),
      so the same tab left the pill in two places; it also animated `left`
      instead of `transform` and lagged behind the tab it was chasing

## AI chat
- [x] Reply in the language of the message, not the app's language setting
