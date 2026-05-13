import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { handleParseRequest } from '../src/routes.js';

const DICT = new Map([
  [2004, { paramCount: 1, paramType: 'INT32', description: 'Ble send pkt len: %d to mcu' }],
  [2075, { paramCount: 0, paramType: 'NONE', description: 'celluar network working' }],
]);

test('handleParseRequest returns 200 with sn and records on valid input', () => {
  const buffer = Buffer.from('FG_log_0\n"1777815062 6 2004 2 1 128\n1777815382 6 2075 0 0\n"');
  const result = handleParseRequest('raw_NSB023567819006.csv', buffer, DICT);
  assert.equal(result.status, 200);
  assert.equal(result.body.sn, 'NSB023567819006');
  assert.equal(result.body.records.length, 2);
  assert.equal(result.body.records[0].message, 'Ble send pkt len: 128 to mcu');
  assert.equal(result.body.records[1].message, 'celluar network working');
});

test('handleParseRequest returns 400 for invalid filename', () => {
  const buffer = Buffer.from('FG_log_0\n"1777815062 6 2004 2 1 128\n"');
  const result = handleParseRequest('badname.csv', buffer, DICT);
  assert.equal(result.status, 400);
  assert.match(result.body.error, /filename must match/);
});

test('handleParseRequest handles empty body with valid filename', () => {
  const buffer = Buffer.from('');
  const result = handleParseRequest('raw_NSB023567819006.csv', buffer, DICT);
  assert.equal(result.status, 200);
  assert.equal(result.body.sn, 'NSB023567819006');
  assert.deepEqual(result.body.records, []);
});

test('handleParseRequest passes unknown events through to formatter', () => {
  const buffer = Buffer.from('FG_log_0\n"1777815062 6 9999 2 2 a b\n"');
  const result = handleParseRequest('raw_NSB023567819006.csv', buffer, DICT);
  assert.equal(result.status, 200);
  assert.match(result.body.records[0].message, /\[unknown event 9999\]/);
});
