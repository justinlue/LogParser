import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { markEntries } from '../public/marks.js';

const records = [
  { lineNum: 1, time: '2026-10-01 08:00:01', eventId: 140,  message: 'boot' },
  { lineNum: 2, time: '2026-10-01 08:00:02', eventId: 3025, message: 'speed: 0; gear: P;' },
  { lineNum: 3, time: '2026-10-01 08:00:03', eventId: 150,  message: 'door open' },
  { lineNum: 4, time: '2026-10-01 08:00:04', eventId: 150,  message: 'door closed' },
];

test('marks are listed in line order, not in the order they were clicked', () => {
  const entries = markEntries(new Set([4, 1, 3]), records);
  assert.deepEqual(entries.map(e => e.lineNum), [1, 3, 4]);
});

test('each entry shows the padded line number, time, event ID and message', () => {
  const [entry] = markEntries(new Set([2]), records);
  assert.equal(entry.label, '0002 │ 2026-10-01 08:00:02 │ 3025 │ speed: 0; gear: P;');
});

test('a long message is cut short with an ellipsis', () => {
  const long = [{ lineNum: 7, time: 't', eventId: 1, message: 'x'.repeat(100) }];
  const [entry] = markEntries(new Set([7]), long, 10);
  assert.equal(entry.label, '0007 │ t │ 1 │ xxxxxxxxxx…');
});

test('a mark whose line is not among the loaded records is left out', () => {
  assert.deepEqual(markEntries(new Set([2, 99]), records).map(e => e.lineNum), [2]);
});

test('no marks gives an empty list', () => {
  assert.deepEqual(markEntries(new Set(), records), []);
});
