import { calendarWeeks } from './calendar.js';

const month = document.getElementById('onlineMonth');
const button = document.getElementById('onlineBtn');
const summary = document.getElementById('onlineSummary');
const calendar = document.getElementById('onlineCalendar');
month.value = new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 7);

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
  calendar.hidden = false;
}

button.addEventListener('click', async () => {
  if (!month.reportValidity()) return;
  const sn = document.getElementById('snInput').value.trim();
  const vin = document.getElementById('vinInput').value.trim();
  if (!sn && !vin) {
    summary.textContent = 'Enter an SN or VIN above.';
    calendar.hidden = true;
    return;
  }
  const params = new URLSearchParams({ month: month.value,
    source: document.getElementById('sourceSelect').value });
  if (sn) params.set('sn', sn);
  if (vin) params.set('vin', vin);
  button.disabled = true;
  calendar.hidden = true;
  summary.textContent = 'Checking cloud activity… This can take several minutes.';
  try {
    const response = await fetch(`/api/online?${params}`);
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Status query failed');
    render(result);
    summary.textContent = `${result.sn} · ${result.source.toUpperCase()} · ${result.onlineDays} / ${result.elapsedDays} elapsed days online (today may be incomplete).${result.warning ? ` ${result.warning}` : ''}`;
  } catch (err) {
    summary.textContent = err.message;
  } finally {
    button.disabled = false;
  }
});
