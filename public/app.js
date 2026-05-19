const fileInput  = document.getElementById('fileInput');
const parseBtn   = document.getElementById('parseBtn');
const btnLabel   = document.getElementById('btnLabel');
const queryBtn   = document.getElementById('queryBtn');
const queryLabel = document.getElementById('queryLabel');
const snInput    = document.getElementById('snInput');
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

let allRecords = [];

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
  if (!sn) {
    showError('Please enter device SN (e.g. NSBB22100D59F7B)');
    return;
  }

  queryBtn.disabled = true;
  queryLabel.textContent = 'FETCHING...';
  document.body.classList.add('parsing');
  errorMsg.hidden = true;
  snBanner.hidden = true;
  recCount.textContent = '';

  const params = new URLSearchParams();
  params.set('sn', sn);
  let endVal = endInput.value;
  if (startInput.value && endVal && startInput.value === endVal) {
    const d = new Date(endVal + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() + 1);
    endVal = d.toISOString().slice(0, 10);
  }
  if (startInput.value) params.set('start', startInput.value);
  if (endVal) params.set('end', endVal);

  try {
    const res = await fetch(`/api/query?${params.toString()}`);
    const json = await res.json();
    if (!res.ok) {
      showError(json.error || `HTTP ${res.status}`);
      return;
    }
    // expected response: { sn, records }
    allRecords = json.records || [];
    snValue.textContent = json.sn || sn;
    snBanner.hidden = false;
    search.disabled = false;
    render(allRecords);
    clearError();
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
  recCount.textContent = '';

  const formData = new FormData();
  formData.append('logfile', file);

  try {
    const res  = await fetch('/api/parse', { method: 'POST', body: formData });
    const json = await res.json();
    if (!res.ok) {
      showError(json.error || `HTTP ${res.status}`);
      return;
    }
    allRecords = json.records;
    snValue.textContent = json.sn;
    snBanner.hidden = false;
    search.disabled = false;
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

function applyFilter() {
  const q = search.value.trim().toLowerCase();
  if (!q) {
    render(allRecords);
    return;
  }
  const terms = q.split(',').map(t => t.trim()).filter(t => t.length > 0);
  const filtered = allRecords.filter(r =>
    terms.some(t => {
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
  searchDebounceTimer = setTimeout(applyFilter, 300);
});

search.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    clearTimeout(searchDebounceTimer);
    applyFilter();
  }
});

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

function render(records) {
  const fragment = document.createDocumentFragment();
  let lastVehicleStatus = null;

  for (let i = 0; i < records.length; i++) {
    const r  = records[i];
    const tr = document.createElement('tr');

    const tdNum  = document.createElement('td');
    tdNum.className = 'col-num';
    tdNum.textContent = String(i + 1).padStart(4, '0');

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

  recCount.textContent = `${records.length} / ${allRecords.length} RECORDS`;
}

function showError(msg) {
  errorText.textContent = msg;
  errorMsg.hidden = false;
}

function clearError() {
  errorMsg.hidden = true;
  errorText.textContent = '';
}
