import { createShortcuts, shortcutLabel, slotForKey } from './shortcuts.js';

const fileInput  = document.getElementById('fileInput');
const parseBtn   = document.getElementById('parseBtn');
const btnLabel   = document.getElementById('btnLabel');
const queryBtn   = document.getElementById('queryBtn');
const queryLabel = document.getElementById('queryLabel');
const snInput    = document.getElementById('snInput');
const vinInput   = document.getElementById('vinInput');
const sourceSelect = document.getElementById('sourceSelect');
const startInput = document.getElementById('startInput');
const endInput   = document.getElementById('endInput');
const errorMsg   = document.getElementById('errorMsg');
const errorText  = document.getElementById('errorText');
const snBanner   = document.getElementById('snBanner');
const snValue    = document.getElementById('snValue');
const fileText   = document.getElementById('fileText');
const search     = document.getElementById('search');
const resultsBody = document.getElementById('resultsBody');
const recCount   = document.getElementById('recCount');
const scanLine   = document.getElementById('scanLine');
const zoomSlider = document.getElementById('zoomSlider');

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

zoomSlider.addEventListener('input', () => {
  document.documentElement.style.setProperty('--table-fs', zoomSlider.value + 'px');
});

let allRecords = [];

// --- User line marks -------------------------------------------------------
// Line numbers the user highlighted by clicking the # cell. Kept apart from the
// DOM so marks survive filter/jump re-renders; reset when new logs are loaded.
const clearMarksBtn   = document.getElementById('clearMarksBtn');
const clearMarksLabel = document.getElementById('clearMarksLabel');
const markedLines = new Set();

function updateMarksUi() {
  clearMarksBtn.disabled = markedLines.size === 0;
  clearMarksLabel.textContent = markedLines.size
    ? `CLEAR MARKS (${markedLines.size})`
    : 'CLEAR MARKS';
}

function clearMarks() {
  markedLines.clear();
  resultsBody.querySelectorAll('tr.marked').forEach(tr => tr.classList.remove('marked'));
  updateMarksUi();
}

clearMarksBtn.addEventListener('click', clearMarks);

// Live UTC clock
function updateClock() {
  const t = new Date().toISOString().slice(11, 19);
  const h = document.getElementById('headerClock');
  const f = document.getElementById('footerClock');
  if (h) h.textContent = t;
  if (f) f.textContent = t + ' UTC';
}
updateClock();
setInterval(updateClock, 1000);

// INPUT_STREAM (local file upload) is rarely used: collapsed until toggled
const uploadToggle = document.getElementById('uploadToggle');
const uploadModule = document.getElementById('uploadModule');
uploadToggle.addEventListener('click', () => {
  uploadModule.hidden = !uploadModule.hidden;
  uploadToggle.setAttribute('aria-expanded', String(!uploadModule.hidden));
});

// Show chosen filename in the drop zone
fileInput.addEventListener('change', () => {
  const f = fileInput.files[0];
  fileText.textContent = f
    ? f.name.toUpperCase()
    : 'SELECT LOG FILE  (.TXT  .LOG  .CSV)';
});

// Remote fetch button: query by sn and optional date range
queryBtn.addEventListener('click', async () => {
  const sn = (snInput.value || '').trim();
  const vin = (vinInput.value || '').trim();
  if (!sn && !vin) {
    showError('Please enter a device SN or a VIN');
    return;
  }

  queryBtn.disabled = true;
  queryLabel.textContent = 'FETCHING...';
  document.body.classList.add('parsing');
  errorMsg.hidden = true;
  snBanner.hidden = true;
  clearRecCount();

  const params = new URLSearchParams();
  if (vin) params.set('vin', vin);
  else params.set('sn', sn);
  const source = (sourceSelect.value || 'both').trim();
  if (source && source !== 'both') params.set('source', source);
  let endVal = endInput.value;
  if (startInput.value && endVal && startInput.value === endVal) {
    const d = new Date(endVal + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() + 1);
    endVal = d.toISOString().slice(0, 10);
  }
  if (startInput.value) params.set('start', startInput.value);
  if (endVal) params.set('end', endVal);

  try {
    const res = await fetch(`api/query?${params.toString()}`);
    const json = await res.json();
    if (!res.ok) {
      showError(json.error || `HTTP ${res.status}`);
      return;
    }
    // expected response: { sn, records }
    allRecords = (json.records || []).map((r, i) => ({ ...r, lineNum: i + 1 }));
    snValue.textContent = json.sn || sn;
    snBanner.hidden = false;
    search.disabled = false;
    clearMarks();
    render(allRecords);
    clearError();
    if (vin) history.add(HIST_VIN, vin);
    else     history.add(HIST_SN, sn);
  } catch (err) {
    showError(err.message);
  } finally {
    queryBtn.disabled = false;
    queryLabel.textContent = 'FETCH';
    document.body.classList.remove('parsing');
  }
});

parseBtn.addEventListener('click', async () => {
  const file = fileInput.files[0];
  if (!file) {
    showError('No file selected. Choose a log file to proceed.');
    return;
  }

  parseBtn.disabled = true;
  btnLabel.textContent = 'PARSING...';
  document.body.classList.add('parsing');
  errorMsg.hidden = true;
  snBanner.hidden = true;
  clearRecCount();

  const formData = new FormData();
  formData.append('logfile', file);

  try {
    const res  = await fetch('api/parse', { method: 'POST', body: formData });
    const json = await res.json();
    if (!res.ok) {
      showError(json.error || `HTTP ${res.status}`);
      return;
    }
    allRecords = json.records.map((r, i) => ({ ...r, lineNum: i + 1 }));
    snValue.textContent = json.sn;
    snBanner.hidden = false;
    search.disabled = false;
    clearMarks();
    render(allRecords);
    clearError();
  } catch (err) {
    showError(err.message);
  } finally {
    parseBtn.disabled = false;
    btnLabel.textContent = 'EXECUTE';
    document.body.classList.remove('parsing');
  }
});

let searchDebounceTimer = null;

// `G<number>` is a jump command (e.g. G1104 → scroll to line 1104), not a filter.
function getJumpLine(value) {
  const m = /^G(\d+)$/i.exec(value.trim());
  return m ? parseInt(m[1], 10) : null;
}

function jumpToLine(lineNum) {
  render(allRecords);
  const row = resultsBody.querySelector(`tr[data-line="${lineNum}"]`);
  if (!row) {
    showError(`Line ${lineNum} not found (${allRecords.length} records loaded).`);
    return;
  }
  clearError();
  row.scrollIntoView({ behavior: 'smooth', block: 'center' });
  resultsBody.querySelectorAll('.jump-highlight').forEach(el => el.classList.remove('jump-highlight'));
  row.classList.add('jump-highlight');
}

function applyFilter() {
  const q = search.value.trim().toLowerCase();
  if (!q) {
    render(allRecords);
    return;
  }
  const terms = q.split(',').map(t => t.trim()).filter(t => t.length > 0);
  const filtered = allRecords.filter(r =>
    terms.some(t => {
      // A number wrapped in quotes ("259", “259”) searches the message only.
      const unquoted = t.replace(/^["“”]+|["“”]+$/g, '');
      if (unquoted !== t && /^\d+$/.test(unquoted)) {
        return r.message.toLowerCase().includes(unquoted);
      }
      if (/^\d+$/.test(t)) return String(r.eventId).includes(t);
      return (
        r.time.toLowerCase().includes(t) ||
        String(r.eventId).includes(t) ||
        r.message.toLowerCase().includes(t)
      );
    })
  );
  render(filtered);
}

search.addEventListener('input', () => {
  clearTimeout(searchDebounceTimer);
  // Defer jump commands to Enter so partial input (G1 → line 1) doesn't fire early.
  if (getJumpLine(search.value) !== null) return;
  searchDebounceTimer = setTimeout(applyFilter, 300);
});

// Run whatever is in the filter bar right now: a jump command or a filter.
function runSearch() {
  clearTimeout(searchDebounceTimer);
  const jumpLine = getJumpLine(search.value);
  if (jumpLine !== null) {
    jumpToLine(jumpLine);
  } else {
    applyFilter();
  }
}

search.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') runSearch();
});

// One-click clear for the filter bar; only shown while there is text to clear.
const clearSearchBtn = document.getElementById('clearSearchBtn');

function updateClearSearchBtn() {
  clearSearchBtn.hidden = search.value.length === 0;
}

clearSearchBtn.addEventListener('click', () => {
  search.value = '';
  runSearch();
  search.focus();
});
search.addEventListener('input', updateClearSearchBtn);

// --- Filter shortcuts (Alt+1..3) -------------------------------------------
// Three slots, each holding a filter-bar text under a user-chosen name.
// Pressing the hotkey (or clicking the slot) puts the text back and runs it.
const shortcutRow = document.getElementById('shortcutRow');
function shortcutStorage() {
  try {
    return window.localStorage;
  } catch {
    return null;   // storage blocked — shortcuts last until the page closes
  }
}
const shortcuts = createShortcuts(shortcutStorage());
let renamingSlot = null;

// Returns whether the shortcut ran (the slot is set and logs are loaded).
function applyShortcut(index) {
  const slot = shortcuts.list()[index];
  if (!slot || search.disabled) return false;
  search.value = slot.filter;
  runSearch();
  return true;
}

// Commit a rename that is still open; the slot buttons call this first.
function commitRename() {
  const input = shortcutRow.querySelector('.sc-rename-input');
  if (input) finishRename(renamingSlot, input.value);
}

function finishRename(index, name) {
  if (renamingSlot !== index) return;   // already committed or cancelled
  renamingSlot = null;
  if (name !== null) shortcuts.rename(index, name);
  renderShortcuts();
}

function scButton(className, text, title) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = className;
  btn.textContent = text;
  btn.title = title;
  return btn;
}

function renderShortcuts() {
  const current = search.value.trim();
  // The row is rebuilt wholesale; remember which button had focus to restore it.
  const focused = shortcutRow.contains(document.activeElement)
    ? Array.from(shortcutRow.querySelectorAll('button')).indexOf(document.activeElement)
    : -1;
  shortcutRow.innerHTML = '';

  shortcuts.list().forEach((slot, i) => {
    const hotkey = `ALT+${i + 1}`;
    const wrap = document.createElement('div');
    wrap.className = 'shortcut';
    wrap.classList.toggle('empty', !slot);
    wrap.classList.toggle('active', !!slot && slot.filter === current);

    const key = document.createElement('span');
    key.className = 'sc-key';
    key.textContent = hotkey;

    if (renamingSlot === i) {
      const input = document.createElement('input');
      input.className = 'sc-rename-input';
      input.value = slot.name;
      input.placeholder = slot.filter;
      input.maxLength = 24;
      input.setAttribute('aria-label', `Name for shortcut ${hotkey}`);
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') finishRename(i, input.value);
        else if (e.key === 'Escape') finishRename(i, null);
      });
      input.addEventListener('blur', () => finishRename(i, input.value));
      wrap.append(key, input);
      shortcutRow.appendChild(wrap);
      input.focus();
      input.select();
      return;
    }

    const apply = scButton('sc-apply', '', slot ? `${hotkey} — filter: ${slot.filter}` : `${hotkey} — empty`);
    const name = document.createElement('span');
    name.className = 'sc-name';
    name.textContent = slot ? shortcutLabel(slot) : 'EMPTY';
    apply.append(key, name);
    apply.disabled = !slot || search.disabled;
    apply.addEventListener('click', () => {
      commitRename();
      applyShortcut(i);
    });

    const set = scButton('sc-tool', 'SET', `Save the current filter text to ${hotkey}`);
    set.disabled = current.length === 0;
    set.addEventListener('click', () => {
      commitRename();
      shortcuts.assign(i, search.value);
      renderShortcuts();
    });

    const rename = scButton('sc-tool', '✎', `Rename ${hotkey}`);
    rename.setAttribute('aria-label', `Rename shortcut ${hotkey}`);
    rename.disabled = !slot;
    rename.addEventListener('click', () => {
      commitRename();
      renamingSlot = i;
      renderShortcuts();
    });

    const clear = scButton('sc-tool', '×', `Clear ${hotkey}`);
    clear.setAttribute('aria-label', `Clear shortcut ${hotkey}`);
    clear.disabled = !slot;
    clear.addEventListener('click', () => {
      commitRename();
      shortcuts.clear(i);
      renderShortcuts();
    });

    wrap.append(apply, set, rename, clear);
    shortcutRow.appendChild(wrap);
  });

  if (focused !== -1 && renamingSlot === null) {
    const btn = shortcutRow.querySelectorAll('button')[focused];
    if (btn && !btn.disabled) btn.focus();
  }
}

// Keep focus in an open rename input while a slot button is pressed: a blur
// would rebuild the row mid-click and the click would be lost.
shortcutRow.addEventListener('mousedown', (e) => {
  if (renamingSlot !== null && e.target.closest('button')) e.preventDefault();
});

document.addEventListener('keydown', (e) => {
  const index = slotForKey(e);
  if (index === null || e.repeat) return;
  if (applyShortcut(index)) e.preventDefault();
});

// SET availability and the active marker track the filter bar as it is typed.
search.addEventListener('input', () => {
  if (renamingSlot === null) renderShortcuts();
});
renderShortcuts();

function parseVehicleStatusMessage(msg) {
  const map = {};
  msg.split(';').forEach(part => {
    const idx = part.indexOf(':');
    if (idx === -1) return;
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    if (k) map[k] = v;
  });
  return map;
}

function buildVehicleStatusCell(msg, lastParsed) {
  const td = document.createElement('td');
  td.className = 'col-msg';
  const parts = [];
  msg.split(';').forEach(part => {
    const idx = part.indexOf(':');
    if (idx === -1) {
      const k = part.trim();
      if (k) parts.push({ k, v: null });
      return;
    }
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    if (k) parts.push({ k, v });
  });

  parts.forEach((part, i) => {
    if (i > 0) td.appendChild(document.createTextNode('; '));
    const text = part.v !== null ? `${part.k}: ${part.v}` : part.k;
    const changed = lastParsed !== null && part.k in lastParsed && lastParsed[part.k] !== part.v;
    if (changed) {
      const span = document.createElement('span');
      span.className = 'changed-field';
      span.textContent = text;
      td.appendChild(span);
    } else {
      td.appendChild(document.createTextNode(text));
    }
  });
  return td;
}

// Events whose message is a filled-in `%d` template with no uniform separator
// (2152 has none: "intelligence en 1 peps en 0 ..."). Each number is a field;
// its label is the text before it, back to the nearest comma.
const NUMERIC_DIFF_EVENTS = new Set([1380, 2152]);

function splitNumericFields(msg) {
  const fields = [];
  const re = /-?\d+/g;
  let last = 0;
  let m;
  while ((m = re.exec(msg)) !== null) {
    const chunk = msg.slice(last, m.index);
    const cut = Math.max(chunk.lastIndexOf(','), chunk.lastIndexOf(';')) + 1;
    const labelStart = cut + (chunk.slice(cut).match(/^\s*/)[0].length);
    fields.push({
      prefix: chunk.slice(0, labelStart),
      label: chunk.slice(labelStart),
      value: m[0],
    });
    last = re.lastIndex;
  }
  return { fields, tail: msg.slice(last) };
}

function buildNumericDiffCell({ fields, tail }, lastFields) {
  const td = document.createElement('td');
  td.className = 'col-msg';
  fields.forEach((f, i) => {
    td.appendChild(document.createTextNode(f.prefix));
    const text = f.label + f.value;
    const prev = lastFields !== null ? lastFields[i] : undefined;
    const changed = prev !== undefined && prev.label === f.label && prev.value !== f.value;
    if (changed) {
      const span = document.createElement('span');
      span.className = 'changed-field';
      span.textContent = text;
      td.appendChild(span);
    } else {
      td.appendChild(document.createTextNode(text));
    }
  });
  td.appendChild(document.createTextNode(tail));
  return td;
}

// The count doubles as the filter indicator: the `x / y` form appears only
// while a filter is narrowing the table. A `G<n>` jump renders every record,
// so it reads as unfiltered.
function updateRecCount(shown) {
  const q = search.value.trim();
  const filtering = q.length > 0 && getJumpLine(q) === null;
  const total = allRecords.length;

  if (!filtering) {
    recCount.textContent = `${total} RECORDS`;
  } else if (shown === 0) {
    recCount.textContent = `NO MATCH 0 / ${total} RECORDS`;
  } else {
    recCount.textContent = `MATCHED ${shown} / ${total} RECORDS`;
  }
  recCount.classList.toggle('filtering', filtering && shown > 0);
  recCount.classList.toggle('no-match', filtering && shown === 0);
  if (renamingSlot === null) renderShortcuts();
  updateClearSearchBtn();
}

function clearRecCount() {
  recCount.textContent = '';
  recCount.classList.remove('filtering', 'no-match');
}

function render(records) {
  const fragment = document.createDocumentFragment();
  let lastVehicleStatus = null;
  const lastFieldsByEvent = new Map();

  for (let i = 0; i < records.length; i++) {
    const r  = records[i];
    const tr = document.createElement('tr');
    tr.dataset.line = String(r.lineNum);
    if (markedLines.has(r.lineNum)) tr.classList.add('marked');

    const tdNum  = document.createElement('td');
    tdNum.className = 'col-num';
    tdNum.textContent = String(r.lineNum).padStart(4, '0');

    const tdTime = document.createElement('td');
    tdTime.className = 'col-time';
    tdTime.textContent = r.time;

    const tdId = document.createElement('td');
    tdId.className = 'col-id';
    tdId.textContent = String(r.eventId);

    let tdMsg;
    if (r.eventId === 3025) {
      const parsed = parseVehicleStatusMessage(r.message);
      tdMsg = buildVehicleStatusCell(r.message, lastVehicleStatus);
      lastVehicleStatus = parsed;
    } else if (NUMERIC_DIFF_EVENTS.has(r.eventId)) {
      const split = splitNumericFields(r.message);
      tdMsg = buildNumericDiffCell(split, lastFieldsByEvent.get(r.eventId) || null);
      lastFieldsByEvent.set(r.eventId, split.fields);
    } else {
      tdMsg = document.createElement('td');
      tdMsg.className = 'col-msg';
      tdMsg.textContent = r.message;
    }

    tr.append(tdNum, tdTime, tdId, tdMsg);
    fragment.appendChild(tr);
  }
  resultsBody.innerHTML = '';
  resultsBody.appendChild(fragment);

  updateRecCount(records.length);
}

function showError(msg) {
  errorText.textContent = msg;
  errorMsg.hidden = false;
}

function clearError() {
  errorMsg.hidden = true;
  errorText.textContent = '';
}

// Click a line number to toggle that line's highlight.
resultsBody.addEventListener('click', (e) => {
  const cell = e.target.closest('td.col-num');
  if (!cell) return;
  const row = cell.parentElement;
  const lineNum = parseInt(row.dataset.line, 10);
  if (markedLines.has(lineNum)) markedLines.delete(lineNum);
  else markedLines.add(lineNum);
  row.classList.toggle('marked', markedLines.has(lineNum));
  updateMarksUi();
});

resultsBody.addEventListener('dblclick', (e) => {
  // the # cell is the mark toggle; a fast double toggle must not also jump
  if (e.target.closest('td.col-num')) return;
  const row = e.target.closest('tr[data-line]');
  if (!row) return;
  const lineNum = parseInt(row.dataset.line, 10);
  search.value = '';
  jumpToLine(lineNum);
});

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
      const opts = options();
      if (opts.length === 0) return;
      setActive(activeIndex <= 0 ? opts.length - 1 : activeIndex - 1);
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