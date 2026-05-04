import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { parseRawText } from '../src/parser.js';

const SAMPLE = `1777815062,2004,128
1777815141,2000,247,128,37,20,176,29
1777815294,2015,a67c8b9d102c5f04
1777815358,2008,0,8
1777815382,2075`;

test('parseRawText returns one record per non-empty line', () => {
  const records = parseRawText(SAMPLE);
  assert.equal(records.length, 5);
});

test('parseRawText extracts numeric timestamp and eventId', () => {
  const records = parseRawText(SAMPLE);
  assert.equal(records[0].rawTimestamp, 1777815062);
  assert.equal(records[0].eventId, 2004);
});

test('parseRawText extracts variable-length params as strings', () => {
  const records = parseRawText(SAMPLE);
  assert.deepEqual(records[0].params, ['128']);
  assert.deepEqual(records[1].params, ['247', '128', '37', '20', '176', '29']);
  assert.deepEqual(records[2].params, ['a67c8b9d102c5f04']);
  assert.deepEqual(records[3].params, ['0', '8']);
  assert.deepEqual(records[4].params, []);
});

test('parseRawText skips blank lines', () => {
  const text = '1777815062,2004,128\n\n   \n1777815382,2075';
  const records = parseRawText(text);
  assert.equal(records.length, 2);
});

test('parseRawText skips lines with fewer than 2 fields', () => {
  const text = '1777815062\n1777815062,2004,128';
  const records = parseRawText(text);
  assert.equal(records.length, 1);
  assert.equal(records[0].eventId, 2004);
});

test('parseRawText handles CRLF line endings', () => {
  const text = '1777815062,2004,128\r\n1777815382,2075\r\n';
  const records = parseRawText(text);
  assert.equal(records.length, 2);
});
