export function calendarWeeks(month) {
  const [year, m] = month.split('-').map(Number);
  const first = (new Date(Date.UTC(year, m - 1, 1)).getUTCDay() + 6) % 7;
  const length = new Date(Date.UTC(year, m, 0)).getUTCDate();
  const cells = Array(first).fill(null);
  for (let day = 1; day <= length; day++) cells.push(day);
  while (cells.length % 7) cells.push(null);
  return Array.from({ length: cells.length / 7 }, (_, i) => cells.slice(i * 7, i * 7 + 7));
}
