import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { formatRecord } from '../src/formatter.js';

const DICT = new Map([
  [2004, { paramCount: 1, paramType: 'int', description: 'Ble send pkt len: %d to mcu' }],
  [2008, { paramCount: 2, paramType: 'int', description: 'Ble connection %d disconnect because of %d reason' }],
  [2015, { paramCount: 1, paramType: 'str', description: 'Ble auth failed, the digital key id is: %s' }],
  [2000, { paramCount: 6, paramType: 'array', description: 'Ble connected, dev mac is: ' }],
  [2075, { paramCount: 0, paramType: 'none', description: 'celluar network working' }],
]);

test('formatRecord formats int with single placeholder', () => {
  const r = formatRecord({ rawTimestamp: 1777815062, eventId: 2004, params: ['128'] }, DICT);
  assert.equal(r.eventId, 2004);
  assert.equal(r.message, 'Ble send pkt len: 128 to mcu');
});

test('formatRecord formats int with two placeholders', () => {
  const r = formatRecord({ rawTimestamp: 1777815358, eventId: 2008, params: ['0', '8'] }, DICT);
  assert.equal(r.message, 'Ble connection 0 disconnect because of 8 reason');
});

test('formatRecord formats str placeholder', () => {
  const r = formatRecord({ rawTimestamp: 1777815294, eventId: 2015, params: ['a67c8b9d102c5f04'] }, DICT);
  assert.equal(r.message, 'Ble auth failed, the digital key id is: a67c8b9d102c5f04');
});

test('formatRecord formats array as comma-separated 2-digit hex bytes', () => {
  const r = formatRecord({ rawTimestamp: 1777815141, eventId: 2000, params: ['247', '128', '37', '20', '176', '29'] }, DICT);
  assert.equal(r.message, 'Ble connected, dev mac is: F7,80,25,14,B0,1D');
});

test('formatRecord formats none with no params', () => {
  const r = formatRecord({ rawTimestamp: 1777815382, eventId: 2075, params: [] }, DICT);
  assert.equal(r.message, 'celluar network working');
});

test('formatRecord renders unknown event with raw params', () => {
  const r = formatRecord({ rawTimestamp: 1777815062, eventId: 9999, params: ['1', '2', '3'] }, DICT);
  assert.equal(r.eventId, 9999);
  assert.equal(r.message, '[unknown event 9999]: 1, 2, 3');
});

test('formatRecord with too few int params leaves placeholder literal', () => {
  const r = formatRecord({ rawTimestamp: 1777815358, eventId: 2008, params: ['5'] }, DICT);
  assert.equal(r.message, 'Ble connection 5 disconnect because of %d reason');
});

test('formatRecord with too many int params appends extras', () => {
  const r = formatRecord({ rawTimestamp: 1777815062, eventId: 2004, params: ['128', '99', '7'] }, DICT);
  assert.equal(r.message, 'Ble send pkt len: 128 to mcu (+ extra: 99, 7)');
});

test('formatRecord with too many none params appends extras', () => {
  const r = formatRecord({ rawTimestamp: 1777815382, eventId: 2075, params: ['junk'] }, DICT);
  assert.equal(r.message, 'celluar network working (+ extra: junk)');
});

test('formatRecord converts UTC timestamp to YYYY-MM-DD HH:mm:ss', () => {
  // 1777815062 UTC = 2026-05-03 13:31:02 UTC
  const r = formatRecord({ rawTimestamp: 1777815062, eventId: 2004, params: ['128'] }, DICT);
  assert.equal(r.time, '2026-05-03 13:31:02');
});

test('formatRecord renders [invalid time] for non-numeric timestamp', () => {
  const r = formatRecord({ rawTimestamp: NaN, eventId: 2004, params: ['128'] }, DICT);
  assert.equal(r.time, '[invalid time]');
});

test('formatRecord int with non-numeric param falls back to raw string', () => {
  const r = formatRecord({ rawTimestamp: 1777815062, eventId: 2004, params: ['notanumber'] }, DICT);
  assert.equal(r.message, 'Ble send pkt len: notanumber to mcu');
});
