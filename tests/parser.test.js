import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { parseRawText } from '../src/parser.js';

const SAMPLE = `FG_log_0,extra
"1777815062 6 2004 2 1 128
1777815141 6 2000 3 6 f7802514b01d
1777815294 6 2015 1 1 a67c8b9d102c5f04
1777815358 6 2008 2 2 0 8
1777815382 6 2075 0 0
",10.230.201.117`;

test('parseRawText returns one record per non-empty log line', () => {
  const records = parseRawText(SAMPLE);
  assert.equal(records.length, 5);
});

test('parseRawText extracts numeric timestamp and eventId', () => {
  const records = parseRawText(SAMPLE);
  assert.equal(records[0].rawTimestamp, 1777815062);
  assert.equal(records[0].eventId, 2004);
});

test('parseRawText extracts params by type code', () => {
  const records = parseRawText(SAMPLE);
  assert.deepEqual(records[0].params, ['128']);              // INT32
  assert.deepEqual(records[1].params, ['f7802514b01d']);     // BYTES
  assert.deepEqual(records[2].params, ['a67c8b9d102c5f04']); // STRING
  assert.deepEqual(records[3].params, ['0', '8']);           // INT32, count 2
  assert.deepEqual(records[4].params, []);                   // NONE
});

test('parseRawText skips blank lines inside FG_log_0 cell', () => {
  const text = 'FG_log_0\n"1777815062 6 2004 2 1 128\n\n   \n1777815382 6 2075 0 0\n"';
  const records = parseRawText(text);
  assert.equal(records.length, 2);
});

test('parseRawText skips lines with fewer than 5 fields', () => {
  const text = 'FG_log_0\n"1777815062\n1777815062 6 2004 2 1 128\n"';
  const records = parseRawText(text);
  assert.equal(records.length, 1);
  assert.equal(records[0].eventId, 2004);
});

test('parseRawText handles CRLF line endings', () => {
  const text = 'FG_log_0\r\n"1777815062 6 2004 2 1 128\r\n1777815382 6 2075 0 0\r\n"\r\n';
  const records = parseRawText(text);
  assert.equal(records.length, 2);
});
