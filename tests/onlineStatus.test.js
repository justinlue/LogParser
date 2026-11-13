import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { dailyPresence, monthDateRange } from '../src/onlineStatus.js';
import { calendarIsStale, calendarWeeks } from '../public/calendar.js';
import { buildQueryArgs } from '../src/remoteQuery.js';

const epoch = s => Date.parse(s) / 1000;
test('receive times use UTC+8 boundaries, preserve counts and first/last, and ignore other months', () => {
  const result = dailyPresence([
    epoch('2026-09-30T15:59:59Z'), epoch('2026-09-30T16:00:00Z'),
    epoch('2026-10-01T15:59:59Z'), epoch('2026-10-31T16:00:00Z'), 'invalid', null,
  ], '2026-10', new Date('2026-11-02T00:00:00Z'));
  assert.equal(result.days.length, 31);
  assert.deepEqual(result.days[0], { date: '2026-10-01', status: 'online', count: 2,
    first: '2026-10-01 00:00:00', last: '2026-10-01 23:59:59' });
  assert.equal(result.days[1].status, 'offline');
  assert.equal(result.onlineDays, 1);
  assert.equal(result.elapsedDays, 31);
});
test('future days are excluded from elapsed-day summary, including at UTC+8 midnight', () => {
  const result = dailyPresence([], '2026-10', new Date('2026-10-02T16:00:00Z'));
  assert.equal(result.elapsedDays, 3);
  assert.equal(result.days[2].status, 'offline');
  assert.equal(result.days[3].status, 'future');
});
test('month validation and leap years', () => {
  assert.deepEqual(monthDateRange('2024-02'), { start: '2024-02-01', end: '2024-02-29' });
  assert.equal(monthDateRange('2026-02').end, '2026-02-28');
  for (const bad of ['', undefined, '2026-13', '2026-00', '2026-1', ['2026-10']]) {
    assert.throws(() => monthDateRange(bad), /month must be YYYY-MM/);
  }
});
test('calendar weeks are Monday first with leading and trailing blank cells', () => {
  const weeks = calendarWeeks('2026-10');
  assert.equal(weeks.length, 5);
  assert.deepEqual(weeks[0], [null, null, null, 1, 2, 3, 4]);
  assert.deepEqual(weeks[4], [26, 27, 28, 29, 30, 31, null]);
  assert.equal(calendarWeeks('2027-02').length, 4);
});
test('a calendar is stale once another SN is on screen, and only then', () => {
  // Same device, including the case-insensitive SN comparison used elsewhere.
  assert.equal(calendarIsStale('NSBB22100D59F7B', 'NSBB22100D59F7B'), false);
  assert.equal(calendarIsStale('NSBB22100D59F7B', 'nsbb22100d59f7b'), false);
  // Logs of another device replace the ones the calendar was shown beside.
  assert.equal(calendarIsStale('NSBB22100D59F7B', 'NSBB22100D59F7C'), true);
  // No calendar, or no SN reported for the loaded logs: nothing to clear.
  assert.equal(calendarIsStale(null, 'NSBB22100D59F7B'), false);
  assert.equal(calendarIsStale('', 'NSBB22100D59F7B'), false);
  assert.equal(calendarIsStale('NSBB22100D59F7B', null), false);
  assert.equal(calendarIsStale('NSBB22100D59F7B', undefined), false);
  assert.equal(calendarIsStale('NSBB22100D59F7B', ''), false);
});

test('online query requests only cloud receive times', () => {
  assert.deepEqual(buildQueryArgs({ sn: 'NSBB22100D59F7B', timesOnly: true }),
    ['query.py', '--sn', 'NSBB22100D59F7B', '--times-only']);
});
