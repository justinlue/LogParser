# SN / VIN Search History Dropdowns Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the REMOTE_FETCH `#snInput` and `#vinInput` fields into themed dropdown menus that remember previously used values (separate SN and VIN histories, 50 entries each, oldest evicted first, recorded only on a successful FETCH).

**Architecture:** A small `history` object inline in `public/app.js` owns all `localStorage` read/write logic. Each input is wrapped in a `.combo` container (input + chevron toggle + `<ul>` panel). A `setupCombo` function wires open/filter/select/delete/keyboard/dismiss behavior per combo. The existing FETCH success path records the used value.

**Tech Stack:** Vanilla HTML/CSS/JS, no framework or bundler. `localStorage` for persistence. Node's `node:test` covers server modules only — the frontend has no test harness, so verification is manual in the browser (`npm start` → http://localhost:3000).

## Global Constraints

- Frontend only. Do NOT touch the server, parser, API, or `#search`/upload flows.
- SN and VIN histories are independent (`logparse.history.sn`, `logparse.history.vin`); a value only ever appears in its own dropdown.
- Each history caps at **50** entries, newest-first; adding past 50 drops the oldest.
- Record a value ONLY after a successful FETCH.
- Reuse existing terminal CSS variables (`--bg2`, `--accent3`, `--border`, `--text-b`, `--text-d`, `--err`, `--font-m`); the dropdown must read as part of the theme.
- Keep input ids, placeholders, and aria-labels unchanged so existing `app.js` references keep working.

---

### Task 1: History storage module

**Files:**
- Modify: `public/app.js` (add near the top, after the `const … = document.getElementById(...)` block, around line 19)

**Interfaces:**
- Produces:
  - `const HIST_SN = 'logparse.history.sn'`
  - `const HIST_VIN = 'logparse.history.vin'`
  - `const history` with methods:
    - `list(key: string) → string[]` (newest-first; `[]` on missing/corrupt)
    - `add(key: string, value: string) → string[]` (trim; ignore empty; dedup-to-front; cap 50; persists; returns new list)
    - `remove(key: string, value: string) → string[]` (drops exact match; persists; returns new list)

- [ ] **Step 1: Add the module**

Insert after line 19 (`const zoomSlider = document.getElementById('zoomSlider');`):

```js
// --- Search history (SN / VIN) -------------------------------------------
const HIST_SN  = 'logparse.history.sn';
const HIST_VIN = 'logparse.history.vin';

const history = {
  MAX: 50,
  load(key) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return [];
      const arr = JSON.parse(raw);
      return Array.isArray(arr) ? arr.filter(v => typeof v === 'string') : [];
    } catch {
      return [];
    }
  },
  save(key, arr) {
    try {
      localStorage.setItem(key, JSON.stringify(arr.slice(0, this.MAX)));
    } catch {
      /* storage unavailable or full — ignore */
    }
  },
  add(key, value) {
    const v = (value || '').trim();
    if (!v) return this.load(key);
    const arr = this.load(key).filter(x => x !== v);
    arr.unshift(v);
    const capped = arr.slice(0, this.MAX);
    this.save(key, capped);
    return capped;
  },
  remove(key, value) {
    const arr = this.load(key).filter(x => x !== value);
    this.save(key, arr);
    return arr;
  },
  list(key) {
    return this.load(key);
  },
};
```

- [ ] **Step 2: Verify in the browser console**

Run `npm start`, open http://localhost:3000, open DevTools console and run:

```js
history.list(HIST_SN);                 // → []
history.add(HIST_SN, '  ABC123  ');    // → ["ABC123"]  (trimmed)
history.add(HIST_SN, 'DEF456');        // → ["DEF456","ABC123"]  (newest-first)
history.add(HIST_SN, 'ABC123');        // → ["ABC123","DEF456"]  (dedup-to-front)
history.add(HIST_SN, '');              // → ["ABC123","DEF456"]  (empty ignored)
for (let i = 0; i < 55; i++) history.add(HIST_SN, 'X' + i);
history.list(HIST_SN).length;          // → 50  (capped)
history.list(HIST_SN)[0];              // → "X54" (newest kept)
history.list(HIST_SN).includes('X0'); // → false (oldest evicted)
history.remove(HIST_SN, 'X54');        // removes it
localStorage.removeItem(HIST_SN);      // clean up
```

Expected: each line matches the comment. Then clean up: `localStorage.removeItem(HIST_SN)`.

- [ ] **Step 3: Commit**

```bash
git add public/app.js
git commit -m "feat: add SN/VIN localStorage history module"
```

---

### Task 2: Record value on successful FETCH

**Files:**
- Modify: `public/app.js` — the `queryBtn` click handler success path (currently lines 82-87, right after `render(allRecords); clearError();`)

**Interfaces:**
- Consumes: `history.add`, `HIST_SN`, `HIST_VIN` (Task 1); the handler's existing `sn` and `vin` locals (lines 48-49).

- [ ] **Step 1: Add recording after a successful fetch**

In the `queryBtn` handler, find the success block:

```js
    // expected response: { sn, records }
    allRecords = (json.records || []).map((r, i) => ({ ...r, lineNum: i + 1 }));
    snValue.textContent = json.sn || sn;
    snBanner.hidden = false;
    search.disabled = false;
    render(allRecords);
    clearError();
```

Add the recording lines immediately after `clearError();`, mirroring the request's VIN-or-SN choice (lines 62-64):

```js
    render(allRecords);
    clearError();
    if (vin) history.add(HIST_VIN, vin);
    else     history.add(HIST_SN, sn);
```

- [ ] **Step 2: Verify in the browser**

Run `npm start`. In REMOTE_FETCH, enter a known-good SN and click FETCH. When records load, open DevTools console:

```js
history.list(HIST_SN);   // → contains the SN you fetched
history.list(HIST_VIN);  // → []  (VIN untouched)
```

Then fetch with a VIN and confirm it lands in `HIST_VIN` only. Trigger a failing fetch (bad SN) and confirm the failed value is NOT added. Clean up: `localStorage.removeItem(HIST_SN); localStorage.removeItem(HIST_VIN)`.

- [ ] **Step 3: Commit**

```bash
git add public/app.js
git commit -m "feat: record SN/VIN in history on successful fetch"
```

---

### Task 3: Combo markup and dropdown styles

**Files:**
- Modify: `public/index.html:38-39` (the two inputs in `.fetch-area`)
- Modify: `public/styles.css` (append combo styles after the `.fetch-area` rules, i.e. after line 233)

**Interfaces:**
- Produces DOM structure consumed by Task 4: `.combo[data-history="sn"|"vin"]` each containing the original `input`, a `button.combo-toggle`, and a `ul.combo-list[hidden]`.

- [ ] **Step 1: Wrap the inputs**

Replace `public/index.html` lines 38-39:

```html
          <input id="snInput" placeholder="SN e.g. NSBB22100D59F7B" aria-label="Device SN">
          <input id="vinInput" placeholder="VIN e.g. LSV2BDDG6SN016885" aria-label="Vehicle VIN">
```

with:

```html
          <div class="combo" data-history="sn">
            <input id="snInput" placeholder="SN e.g. NSBB22100D59F7B" aria-label="Device SN" autocomplete="off">
            <button type="button" class="combo-toggle" aria-label="Show SN history" tabindex="-1">▼</button>
            <ul class="combo-list" role="listbox" hidden></ul>
          </div>
          <div class="combo" data-history="vin">
            <input id="vinInput" placeholder="VIN e.g. LSV2BDDG6SN016885" aria-label="Vehicle VIN" autocomplete="off">
            <button type="button" class="combo-toggle" aria-label="Show VIN history" tabindex="-1">▼</button>
            <ul class="combo-list" role="listbox" hidden></ul>
          </div>
```

- [ ] **Step 2: Add styles**

Append to `public/styles.css` after line 233 (end of the `#startInput/#endInput` picker rule):

```css
/* --- SN/VIN history combo dropdowns ------------------------------------- */
.combo {
  position: relative;
  display: flex;
}
.combo[data-history="sn"]  { flex: 1; }
.combo[data-history="vin"] { width: 220px; }

.fetch-area .combo input {
  width: 100%;
  padding-right: 30px;   /* room for the chevron */
}

.combo-toggle {
  position: absolute;
  right: 1px;
  top: 1px;
  bottom: 1px;
  width: 26px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: none;
  color: var(--text-d);
  font-family: var(--font-m);
  font-size: 10px;
  cursor: pointer;
  transition: transform .2s, color .2s;
}
.combo-toggle:hover { color: var(--accent3); }
.combo.open .combo-toggle { transform: rotate(180deg); color: var(--accent3); }

.combo-list {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  right: 0;
  margin: 0;
  padding: 4px 0;
  list-style: none;
  max-height: 240px;
  overflow-y: auto;
  background: var(--bg2);
  border: 1px solid var(--border);
  box-shadow: 0 0 16px rgba(0,200,255,.15);
  z-index: 20;
}
.combo-list[hidden] { display: none; }

.combo-option {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 6px 12px;
  font-family: var(--font-m);
  font-size: 12.5px;
  letter-spacing: 1px;
  color: var(--text-b);
  cursor: pointer;
}
.combo-option:hover,
.combo-option.active {
  background: rgba(0,200,255,.10);
  color: var(--accent3);
}
.combo-option .val {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.combo-option .del {
  flex: 0 0 auto;
  background: transparent;
  border: none;
  color: var(--text-d);
  font-family: var(--font-m);
  font-size: 13px;
  line-height: 1;
  cursor: pointer;
  padding: 0 2px;
}
.combo-option .del:hover { color: var(--err); }

.combo-empty {
  padding: 6px 12px;
  font-family: var(--font-m);
  font-size: 12px;
  letter-spacing: 1px;
  color: var(--text-d);
  cursor: default;
}
```

- [ ] **Step 3: Verify layout**

Run `npm start`, open http://localhost:3000. Confirm:
- SN and VIN fields look unchanged in size (SN grows to fill, VIN ~220px), each now showing a `▼` chevron at its right edge.
- Temporarily remove the `hidden` attribute from one `.combo-list` in DevTools (Elements panel) and confirm a bordered panel appears below the input, themed like the rest of the terminal (dark bg, cyan glow). Re-add `hidden`.
- The date fields, FETCH button, and file upload are visually unchanged.

- [ ] **Step 4: Commit**

```bash
git add public/index.html public/styles.css
git commit -m "feat: add combo markup and themed dropdown styles for SN/VIN"
```

---

### Task 4: Combo behavior wiring

**Files:**
- Modify: `public/app.js` (append the combo functions at the end of the file, after line 297, and call `initCombos()`)

**Interfaces:**
- Consumes: `history` (`list`/`add`/`remove`), `HIST_SN`, `HIST_VIN` (Task 1); the `.combo` DOM from Task 3.
- Produces: no exports; self-contained UI wiring invoked once via `initCombos()`.

- [ ] **Step 1: Append the wiring**

Add at the end of `public/app.js`:

```js
// --- SN/VIN history combo dropdown behavior ------------------------------
function closeAllCombos() {
  document.querySelectorAll('.combo.open').forEach(c => {
    c.classList.remove('open');
    c.querySelector('.combo-list').hidden = true;
  });
}

function setupCombo(combo) {
  const input  = combo.querySelector('input');
  const toggle = combo.querySelector('.combo-toggle');
  const listEl = combo.querySelector('.combo-list');
  const key    = combo.dataset.history === 'vin' ? HIST_VIN : HIST_SN;
  let activeIndex = -1;

  const options = () => Array.from(listEl.querySelectorAll('.combo-option'));
  const isOpen  = () => !listEl.hidden;

  function renderList() {
    const all    = history.list(key);
    const filter = input.value.trim().toLowerCase();
    const items  = all.filter(v => v.toLowerCase().includes(filter));
    listEl.innerHTML = '';
    activeIndex = -1;

    if (all.length === 0 || items.length === 0) {
      const li = document.createElement('li');
      li.className = 'combo-empty';
      li.textContent = all.length === 0 ? 'NO HISTORY' : 'NO MATCH';
      listEl.appendChild(li);
      return;
    }

    items.forEach(value => {
      const li = document.createElement('li');
      li.className = 'combo-option';
      li.setAttribute('role', 'option');

      const label = document.createElement('span');
      label.className = 'val';
      label.textContent = value;

      const del = document.createElement('button');
      del.type = 'button';
      del.className = 'del';
      del.textContent = '×';
      del.setAttribute('aria-label', 'Remove ' + value);

      li.append(label, del);
      listEl.appendChild(li);

      // mousedown (not click) so the input never blurs/closes before we act
      label.addEventListener('mousedown', (e) => {
        e.preventDefault();
        selectValue(value);
      });
      del.addEventListener('mousedown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        history.remove(key, value);
        renderList();
      });
    });
  }

  function open() {
    closeAllCombos();
    renderList();
    combo.classList.add('open');
    listEl.hidden = false;
  }

  function close() {
    combo.classList.remove('open');
    listEl.hidden = true;
    activeIndex = -1;
  }

  function selectValue(value) {
    input.value = value;
    close();
    input.focus();
  }

  function setActive(idx) {
    const opts = options();
    if (opts.length === 0) return;
    activeIndex = (idx + opts.length) % opts.length;
    opts.forEach((el, i) => el.classList.toggle('active', i === activeIndex));
    opts[activeIndex].scrollIntoView({ block: 'nearest' });
  }

  toggle.addEventListener('mousedown', (e) => {
    e.preventDefault();
    if (isOpen()) close();
    else { open(); input.focus(); }
  });

  input.addEventListener('focus', open);
  input.addEventListener('click', () => { if (!isOpen()) open(); });
  input.addEventListener('input', () => { if (!isOpen()) open(); else renderList(); });

  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') {
      if (!isOpen()) { open(); return; }
      e.preventDefault();
      setActive(activeIndex + 1);
    } else if (e.key === 'ArrowUp') {
      if (!isOpen()) return;
      e.preventDefault();
      setActive(activeIndex - 1);
    } else if (e.key === 'Enter') {
      const opts = options();
      if (isOpen() && activeIndex >= 0 && opts[activeIndex]) {
        e.preventDefault();
        selectValue(opts[activeIndex].querySelector('.val').textContent);
      } else {
        close();
      }
    } else if (e.key === 'Escape') {
      if (isOpen()) { e.preventDefault(); close(); }
    }
  });
}

function initCombos() {
  document.querySelectorAll('.combo').forEach(setupCombo);
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.combo')) closeAllCombos();
  });
}
initCombos();
```

- [ ] **Step 2: Verify full behavior in the browser**

Run `npm start`, open http://localhost:3000. First seed some history (successful fetches, or in console: `['NSBB22100D59F7B','NSBB22100D59A21','NSBB22100D59C03'].forEach(v => history.add(HIST_SN, v))`). Then confirm:

1. Clicking `#snInput` (or its `▼`) opens a themed panel listing the SN history; the VIN dropdown shows only VIN history (independent).
2. Empty history shows a muted `NO HISTORY` row; typing text with no match shows `NO MATCH`.
3. Typing filters the list (case-insensitive substring).
4. Clicking a row fills the input and closes the panel; clicking `×` removes just that entry and leaves the input unchanged, panel open.
5. Keyboard: `↓`/`↑` move the highlight, `Enter` selects the highlighted row, `Esc` closes.
6. Clicking outside the combo closes the panel; opening one dropdown closes the other.
7. Reload the page — history persists.
8. The file upload and EVENT_LOG `#search` still work normally.

- [ ] **Step 3: Commit**

```bash
git add public/app.js
git commit -m "feat: wire SN/VIN history dropdown open/filter/select/delete/keyboard"
```

---

## Self-Review

**Spec coverage:**
- Independent SN/VIN histories → Task 1 (two keys), Task 2 (VIN-or-SN branch), Task 4 (`key` per combo). ✓
- 50-entry cap, oldest evicted → Task 1 `add`/`save` slice(0, MAX), Task 1 Step 2 verification. ✓
- Persistence across reloads → `localStorage`, Task 4 Step 2 item 7. ✓
- Record only on success → Task 2 (inside success path after `clearError()`). ✓
- Custom themed dropdown, per-entry delete, filter, keyboard, dismiss → Tasks 3-4. ✓
- No server/parser/API/upload changes → Global Constraints; only `public/*` touched. ✓

**Placeholder scan:** No TBD/TODO/"handle edge cases"; all code is complete and concrete. ✓

**Type consistency:** `history.list/add/remove`, `HIST_SN`, `HIST_VIN`, `.combo`/`.combo-toggle`/`.combo-list`/`.combo-option`/`.val`/`.del`/`.combo-empty`, `closeAllCombos`/`setupCombo`/`initCombos` used identically across tasks. ✓

**Spec correction:** The spec mentioned preserving "FETCH-on-Enter" on these inputs; in fact `#snInput`/`#vinInput` have no existing Enter handler (FETCH is a button click), so Task 4 simply closes the panel on Enter when no option is highlighted — nothing to preserve.
