# Double-Click Jump from Filtered View

**Date:** 2026-05-24
**Status:** Approved

## Goal

When the user is viewing filtered search results, double-clicking any row jumps directly to that row in the original (unfiltered) log view — equivalent to typing `G<lineNum>` and pressing Enter, with the additional step of clearing the search input so the full view is visible.

## Behaviour

1. User applies a filter in the search box; `render(filtered)` shows a subset of records.
2. User double-clicks any row in the filtered table.
3. The search input is cleared (`search.value = ''`).
4. `jumpToLine(lineNum)` is called with the row's `data-line` value.
   - `jumpToLine` calls `render(allRecords)` — restores the full unfiltered view.
   - Scrolls the target row into view (smooth, centered).
   - Applies the `.jump-highlight` CSS class to the row.
5. Result: user sees the full log, positioned at and highlighted on the target line.

The feature also works from the unfiltered view (double-click scrolls to and highlights the row), though the primary use case is filtered → full.

## Changes

### `public/app.js`

Add one event-delegation listener at the bottom of the file:

```js
resultsBody.addEventListener('dblclick', (e) => {
  const row = e.target.closest('tr[data-line]');
  if (!row) return;
  const lineNum = parseInt(row.dataset.line, 10);
  search.value = '';
  jumpToLine(lineNum);
});
```

No changes to `render()`, `jumpToLine()`, or any other function.

### `public/styles.css`

Add one rule to signal rows are interactive:

```css
#resultsBody tr { cursor: pointer; }
```

## Files Not Changed

`index.html`, `server.js`, `src/`, `tests/` — no changes needed.

## Testing

Manual only (no JS unit tests for DOM interaction):

1. Load a log file and apply a filter so fewer rows are shown.
2. Double-click any result row.
3. Verify: search input is cleared, full log is rendered, target row is visible and highlighted.
4. Double-click a row in unfiltered view — verify it scrolls to and highlights that row.
5. Verify existing `G<number>` keyboard flow is unaffected.
