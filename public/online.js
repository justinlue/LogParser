import { calendarIsStale, calendarWeeks } from './calendar.js';
import { RECORDS_LOADED_EVENT } from './events.js';

const month = document.getElementById('onlineMonth');
const button = document.getElementById('onlineBtn');
const hideButton = document.getElementById('onlineHideBtn');
const summary = document.getElementById('onlineSummary');
const calendar = document.getElementById('onlineCalendar');
// The hint in index.html is the single copy; a reset restores it unchanged.
const HINT = summary.textContent.trim();
month.value = new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 7);

// SN of the result on screen; null when the panel is empty.
let shownSn = null;
// SN of the logs app.js currently displays; null when none are loaded.
let loadedSn = null;

function setCalendarVisible(visible) {
  calendar.hidden = !visible;
  hideButton.textContent = visible ? 'HIDE' : 'SHOW';
  const label = visible
    ? 'Hide the online status calendar'
    : 'Show the online status calendar';
  hideButton.title = label;
  hideButton.setAttribute('aria-label', label);
}

function resetStatusPanel() {
  setCalendarVisible(false);
  calendar.replaceChildren();
  summary.textContent = HINT;
  hideButton.hidden = true;
  shownSn = null;
}

// HIDE collapses the calendar but keeps its summary, so the result can be
// shown again without repeating a query that can take minutes.
hideButton.addEventListener('click', () => setCalendarVisible(calendar.hidden));

// Logs for another device are now on screen; a result for the old one would
// sit above the wrong logs, so it goes.
document.addEventListener(RECORDS_LOADED_EVENT, (event) => {
  loadedSn = (event.detail && event.detail.sn) || null;
  if (calendarIsStale(shownSn, loadedSn)) resetStatusPanel();
});

function presenceSummary(result) {
  return `${result.sn} · ${result.source.toUpperCase()} · ${result.onlineDays} / ${result.elapsedDays} elapsed days online (today may be incomplete).${result.warning ? ` ${result.warning}` : ''}`;
}

function render(result) {
  calendar.replaceChildren();
  const table = document.createElement('table');
  const caption = table.createCaption();
  caption.textContent = `${result.sn} · ${result.month} · UTC+8`;
  const header = table.createTHead().insertRow();
  for (const name of ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']) {
    const cell = document.createElement('th');
    cell.scope = 'col';
    cell.textContent = name;
    header.append(cell);
  }
  const body = table.createTBody();
  for (const week of calendarWeeks(result.month)) {
    const row = body.insertRow();
    for (const number of week) {
      const cell = row.insertCell();
      if (!number) continue;
      const day = result.days[number - 1];
      cell.className = `presence-${day.status}`;
      const title = document.createElement('strong');
      title.textContent = `${number} · ${day.status === 'future' ? 'UPCOMING' : day.status.toUpperCase()}`;
      cell.append(title);
      if (day.count) {
        const count = document.createElement('div');
        count.textContent = `${day.count.toLocaleString()} logs`;
        const times = document.createElement('small');
        times.textContent = `${day.first.slice(11)} –\n${day.last.slice(11)}`;
        cell.append(count, times);
      } else if (day.status === 'offline') {
        const label = document.createElement('div');
        label.textContent = 'No logs';
        cell.append(label);
      }
    }
  }
  calendar.append(table);
  setCalendarVisible(true);
  hideButton.hidden = false;
  shownSn = result.sn;
}

button.addEventListener('click', async () => {
  if (!month.reportValidity()) return;
  const sn = document.getElementById('snInput').value.trim();
  const vin = document.getElementById('vinInput').value.trim();
  if (!sn && !vin) {
    resetStatusPanel();
    summary.textContent = 'Enter an SN or VIN above.';
    return;
  }
  const params = new URLSearchParams({ month: month.value,
    source: document.getElementById('sourceSelect').value });
  if (sn) params.set('sn', sn);
  if (vin) params.set('vin', vin);
  button.disabled = true;
  resetStatusPanel();
  summary.textContent = 'Checking cloud activity… This can take several minutes.';
  // Which device's logs are on screen now; if that changes while the query
  // runs, its result must not paint over the new ones.
  const contextAtStart = loadedSn;
  try {
    const response = await fetch(`/api/online?${params}`);
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Status query failed');
    summary.textContent = presenceSummary(result);
    if (loadedSn !== contextAtStart && calendarIsStale(result.sn, loadedSn)) return;
    render(result);
  } catch (err) {
    summary.textContent = err.message;
  } finally {
    button.disabled = false;
  }
});
