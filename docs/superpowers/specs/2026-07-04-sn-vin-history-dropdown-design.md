# SN / VIN Search History Dropdowns — Design

**Date:** 2026-07-04
**Scope:** Frontend only (`public/index.html`, `public/app.js`, `public/styles.css`)
**Status:** Approved for planning

## Goal

Turn the two REMOTE_FETCH search inputs — `#snInput` and `#vinInput` — into
dropdown menus that remember previously used values, so the user can pick a
recent SN/VIN instead of retyping it.

## Requirements

- Each field keeps an independent history (a VIN never appears in the SN
  dropdown and vice versa).
- Each history stores up to **50** entries. Adding a new unique entry when the
  history is full drops the oldest entry ("new entries overwrite the oldest").
- History persists across page reloads and browser sessions.
- An entry is recorded only after a **successful** FETCH (results returned),
  not on failed or empty queries.

## Non-Goals

- No changes to the server, parser, API, or the file-upload / EVENT_LOG search
  (`#search`) fields.
- No cross-device sync; history is local to the browser.
- No automated tests (the frontend has no test harness; server-only Node tests
  are unaffected).

## Storage

- Persistence: `localStorage`.
- Keys: `logparse.history.sn`, `logparse.history.vin`.
- Value: a JSON array of strings, **newest-first**, length capped at 50.
- Eviction: when a new entry pushes length past 50, the last (oldest) element
  is removed.
- De-duplication: adding a value already present removes the existing copy and
  re-inserts it at the front (most-recently-used ordering). Comparison is
  exact-string (values are already trimmed before storage).
- Empty/whitespace values are never stored.
- Defensive load: if a key is missing or its JSON is unparseable, treat the
  history as empty (never throw).

## History Module (inline in `app.js`)

A single object isolates all storage logic from the DOM. Kept inline in
`app.js` to match the no-bundler single-file frontend.

```
const history = {
  MAX: 50,
  load(key),            // → string[] (defensive; [] on error)
  save(key, arr),       // writes JSON.stringify(arr.slice(0, MAX))
  add(key, value),      // trim; ignore empty; dedup-to-front; cap; save; → new list
  remove(key, value),   // drop exact match; save; → new list
  list(key),            // alias of load
};
```

`key` is one of the two constants `HIST_SN` / `HIST_VIN`.

## Markup

Each input is wrapped in a combo container. Ids/placeholders/aria labels on the
inputs are unchanged so existing `app.js` references keep working.

```html
<div class="combo" data-history="sn">
  <input id="snInput" placeholder="SN e.g. NSBB22100D59F7B" aria-label="Device SN" autocomplete="off">
  <button type="button" class="combo-toggle" aria-label="Show SN history" tabindex="-1">▼</button>
  <ul class="combo-list" role="listbox" hidden></ul>
</div>
```

Same structure for VIN with `data-history="vin"`, `#vinInput`, its placeholder,
and aria labels. The `.combo-list` is populated dynamically; each row is a
`<li role="option">` containing the value text plus a `×` delete button.

## Behavior

- **Open:** clicking the input or the `▼` toggle opens the panel showing that
  field's history. Empty history → panel shows a single muted "NO HISTORY" row
  (non-selectable) rather than staying invisible, so the control is discoverable.
- **Filter:** typing in the input filters the visible list to entries containing
  the typed text (case-insensitive substring). No matches → muted "NO MATCH" row.
- **Select:** clicking a row (or Enter on a highlighted row) fills the input with
  that value and closes the panel.
- **Delete:** the `×` on a row calls `history.remove(...)` and re-renders the
  list; the input value is untouched and the panel stays open.
- **Keyboard:** `↓`/`↑` move the highlight through visible rows, `Enter` selects
  the highlighted row, `Esc` closes the panel. When the panel is closed, `Enter`
  falls through to the existing FETCH-on-Enter behavior (see below).
- **Dismiss:** clicking outside the combo, or blurring away, closes the panel.
- Only one panel is open at a time; opening one closes the other.

## Recording an entry

In the existing `queryBtn` click handler, the request already chooses VIN or SN:

```
if (vin) params.set('vin', vin);
else     params.set('sn', sn);
```

After a successful response (in the success path, alongside `clearError()`), add
the value that was actually used to its own history:

```
if (vin) history.add(HIST_VIN, vin);
else     history.add(HIST_SN, sn);
```

Recording happens only on the success path, so failed/HTTP-error fetches leave
history unchanged.

## Styling (`styles.css`)

- `.combo` — `position: relative` wrapper so the panel anchors to the input.
- `.combo-toggle` — chevron button inside the field's right edge; rotates 180°
  when the panel is open (`.combo.open .combo-toggle`).
- `.combo-list` — absolutely-positioned panel below the input, reusing existing
  terminal variables (border, glow, mono font, background) so it reads as part
  of the theme; `max-height` with scroll for long lists; `z-index` above sibling
  fields.
- `.combo-option` rows with a hover/highlight state matching the terminal accent;
  `.combo-option .del` for the `×`; a muted `.combo-empty` row style.

## Testing / Verification

Manual, in the browser (no frontend test harness exists):

1. Perform successful fetches with several distinct SNs and VINs; confirm each
   appears in the correct dropdown and not the other.
2. Reload the page; confirm history persists.
3. Add >50 entries to one field; confirm length stays at 50 and the oldest is
   gone while the newest is present.
4. Re-use an existing value; confirm it moves to the top with no duplicate.
5. Filter-as-you-type narrows the list; `×` deletes a single entry; keyboard
   nav (↑/↓/Enter/Esc) works; click-outside closes.
6. Confirm FETCH-on-Enter still works when the dropdown is closed, and the
   upload / EVENT_LOG search are unaffected.

## Files Changed

- `public/index.html` — wrap the two inputs in `.combo` markup.
- `public/app.js` — history module, combo wiring, record-on-success.
- `public/styles.css` — combo/dropdown styles.
