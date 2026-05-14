const fileInput = document.getElementById('fileInput');
const parseBtn = document.getElementById('parseBtn');
const errorMsg = document.getElementById('errorMsg');
const snBanner = document.getElementById('snBanner');
const search = document.getElementById('search');
const resultsBody = document.getElementById('resultsBody');

let allRecords = [];

parseBtn.addEventListener('click', async () => {
  const file = fileInput.files[0];
  if (!file) {
    showError('Please choose a file first.');
    return;
  }
  parseBtn.disabled = true;
  parseBtn.textContent = 'Parsing…';
  errorMsg.hidden = true;
  snBanner.hidden = true;

  const formData = new FormData();
  formData.append('logfile', file);

  try {
    const res = await fetch('/api/parse', { method: 'POST', body: formData });
    const json = await res.json();
    if (!res.ok) {
      showError(json.error || `HTTP ${res.status}`);
      return;
    }
    allRecords = json.records;
    snBanner.textContent = `Device SN: ${json.sn}`;
    snBanner.hidden = false;
    search.disabled = false;
    render(allRecords);
  } catch (err) {
    showError(err.message);
  } finally {
    parseBtn.disabled = false;
    parseBtn.textContent = 'Parse';
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
    terms.some(t =>
      r.time.toLowerCase().includes(t) ||
      String(r.eventId).includes(t) ||
      r.message.toLowerCase().includes(t)
    )
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

function render(records) {
  const fragment = document.createDocumentFragment();
  for (const r of records) {
    const tr = document.createElement('tr');
    const tdTime = document.createElement('td');
    tdTime.textContent = r.time;
    const tdId = document.createElement('td');
    tdId.textContent = String(r.eventId);
    const tdMsg = document.createElement('td');
    tdMsg.textContent = r.message;
    tr.appendChild(tdTime);
    tr.appendChild(tdId);
    tr.appendChild(tdMsg);
    fragment.appendChild(tr);
  }
  resultsBody.innerHTML = '';
  resultsBody.appendChild(fragment);
}

function showError(msg) {
  errorMsg.textContent = msg;
  errorMsg.hidden = false;
}
