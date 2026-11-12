export function monthDateRange(month) {
  if (typeof month !== 'string' || !/^[1-9]\d{3}-(0[1-9]|1[0-2])$/.test(month)) {
    throw new Error('month must be YYYY-MM');
  }
  const [year, m] = month.split('-').map(Number);
  const last = new Date(Date.UTC(year, m, 0)).getUTCDate();
  return { start: `${month}-01`, end: `${month}-${last}` };
}

const localTime = seconds => new Date(seconds * 1000 + 8 * 3600000).toISOString().slice(0, 19).replace('T', ' ');

// Cloud receive times are epoch seconds. Every calendar day uses UTC+8.
export function dailyPresence(receiveTimes, month, now = new Date()) {
  const { end } = monthDateRange(month);
  const today = localTime(now.getTime() / 1000).slice(0, 10);
  const days = Array.from({ length: Number(end.slice(-2)) }, (_, i) => {
    const date = `${month}-${String(i + 1).padStart(2, '0')}`;
    return { date, status: date > today ? 'future' : 'offline', count: 0, first: null, last: null };
  });
  for (const value of receiveTimes) {
    const seconds = Number(value);
    if (!Number.isFinite(seconds) || seconds <= 0 || seconds * 1000 > now.getTime()) continue;
    let time;
    try { time = localTime(seconds); } catch { continue; }
    if (time.slice(0, 7) !== month) continue;
    const day = days[Number(time.slice(8, 10)) - 1];
    day.status = 'online';
    day.count++;
    if (!day.first || time < day.first) day.first = time;
    if (!day.last || time > day.last) day.last = time;
  }
  return { month, timezone: 'UTC+8', days,
    onlineDays: days.filter(d => d.status === 'online').length,
    elapsedDays: days.filter(d => d.status !== 'future').length };
}
