# Double-Click Jump from Filtered View — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Double-clicking any row in the log table clears the search input, restores the full unfiltered view, and scrolls to that row with a highlight — equivalent to typing `G<lineNum>` and pressing Enter.

**Architecture:** Two surgical additions to the existing vanilla JS frontend: one CSS rule (`cursor: pointer` on `#resultsBody tr`) and one event-delegation `dblclick` listener on `resultsBody` that calls the already-existing `jumpToLine()` function. No server changes, no new functions, no new files.

**Tech Stack:** Vanilla HTML/CSS/JS. No build step. Server: Node.js + Express (untouched).

---

### Task 1: Add pointer cursor for table rows

**Files:**
- Modify: `public/styles.css`

- [ ] **Step 1: Add the CSS rule**

Open `public/styles.css`. At the end of the file (after all existing rules), add:

```css
#resultsBody tr { cursor: pointer; }
```

- [ ] **Step 2: Verify visually**

Start the server (`npm start`), open `http://localhost:3000`, load any log file, hover over any row — the cursor should change to a hand/pointer.

- [ ] **Step 3: Commit**

```bash
git add public/styles.css
git commit -m "style: pointer cursor on log table rows"
```

---

### Task 2: Add double-click jump listener

**Files:**
- Modify: `public/app.js`

- [ ] **Step 1: Add the listener**

Open `public/app.js`. At the very end of the file (after the `clearError` function definition), add:

```js
resultsBody.addEventListener('dblclick', (e) => {
  const row = e.target.closest('tr[data-line]');
  if (!row) return;
  const lineNum = parseInt(row.dataset.line, 10);
  search.value = '';
  jumpToLine(lineNum);
});
```

No other changes. `jumpToLine` (defined at line 136) already calls `render(allRecords)`, scrolls the row into view, and applies `.jump-highlight`.

- [ ] **Step 2: Manual smoke test — filtered view**

1. `npm start`, open `http://localhost:3000`.
2. Load a log file with enough records to produce multiple lines (any `.txt`/`.log` matching `raw_<15-char SN>.txt`).
3. Type any filter term in the search box (e.g. an event ID like `3025`) — the table should show fewer rows.
4. Double-click any result row.
5. Verify:
   - The search input is now **empty**.
   - The full log is rendered (record count shows `N / N RECORDS`).
   - The target row is **visible** (scrolled into view) and has a highlighted style (`.jump-highlight` adds a glow/accent border per existing CSS).

- [ ] **Step 3: Manual smoke test — unfiltered view**

1. With no filter active (search box empty), double-click any row.
2. Verify: the row scrolls into view and gets the `.jump-highlight` highlight; search input stays empty; record count is unchanged.

- [ ] **Step 4: Verify existing G+number flow is unaffected**

1. Type `G42` in the search box and press Enter.
2. Verify: full view renders, row 42 is highlighted and scrolled into view — same as before.

- [ ] **Step 5: Commit**

```bash
git add public/app.js
git commit -m "feat: double-click row jumps to line in full log view"
```
