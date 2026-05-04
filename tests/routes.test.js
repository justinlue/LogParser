import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { handleParseRequest } from '../src/routes.js';

const DICT = new Map([
  [2004, { paramCount: 1, paramType: 'int', description: 'Ble send pkt len: %d to mcu' }],
  [2075, { paramCount: 0, paramType: 'none', description: 'celluar network working' }],
]);

test('handleParseRequest returns 200 with sn and records on valid input', () => {
  const buffer = Buffer.from('1777815062,2004,128\n1777815382,2075\n');
  const result = handleParseRequest('raw_NSB023567819006.txt', buffer, DICT);
  assert.equal(result.status, 200);
  assert.equal(result.body.sn, 'NSB023567819006');
  assert.equal(result.body.records.length, 2);
  assert.equal(result.body.records[0].message, 'Ble send pkt len: 128 to mcu');
  assert.equal(result.body.records[1].message, 'celluar network working');
});

test('handleParseRequest returns 400 for invalid filename', () => {
  const buffer = Buffer.from('1777815062,2004,128');
  const result = handleParseRequest('badname.txt', buffer, DICT);
  assert.equal(result.status, 400);
  assert.match(result.body.error, /filename must match/);
});

test('handleParseRequest handles empty body with valid filename', () => {
  const buffer = Buffer.from('');
  const result = handleParseRequest('raw_NSB023567819006.txt', buffer, DICT);
  assert.equal(result.status, 200);
  assert.equal(result.body.sn, 'NSB023567819006');
  assert.deepEqual(result.body.records, []);
});

test('handleParseRequest passes unknown events through to formatter', () => {
  const buffer = Buffer.from('1777815062,9999,a,b');
  const result = handleParseRequest('raw_NSB023567819006.txt', buffer, DICT);
  assert.equal(result.status, 200);
  assert.match(result.body.records[0].message, /\[unknown event 9999\]/);
});
