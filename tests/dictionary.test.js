import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { parseDictionaryCsv, loadDictionary } from '../src/dictionary.js';

const SAMPLE_CSV = `Version:1.0.1,,,,
ID_VALUE,ID_NAME,TYPE,Parameters Number,Original Format
2008,,INT32,2,"""Ble connection %d disconnect because of %d reason"""
2004,,INT32,1,"""Ble send pkt len: %d to mcu"""
2015,,STRING,1,"""Ble auth failed, the digital key id is: %s"""
2075,,NONE,0,"""celluar network working"""
2000,,BYTES,6,"""Ble connected, dev mac is: """
`;

test('parseDictionaryCsv parses all rows', () => {
  const dict = parseDictionaryCsv(SAMPLE_CSV);
  assert.equal(dict.size, 5);
});

test('parseDictionaryCsv keys are numeric event ids', () => {
  const dict = parseDictionaryCsv(SAMPLE_CSV);
  assert.ok(dict.has(2008));
  assert.ok(dict.has(2000));
  assert.equal(dict.has('2008'), false);
});

test('parseDictionaryCsv extracts paramCount, paramType, description', () => {
  const dict = parseDictionaryCsv(SAMPLE_CSV);
  const e2008 = dict.get(2008);
  assert.equal(e2008.paramCount, 2);
  assert.equal(e2008.paramType, 'INT32');
  assert.equal(e2008.description, 'Ble connection %d disconnect because of %d reason');
});

test('parseDictionaryCsv handles description with embedded comma', () => {
  const dict = parseDictionaryCsv(SAMPLE_CSV);
  const e2015 = dict.get(2015);
  assert.equal(e2015.description, 'Ble auth failed, the digital key id is: %s');
});

test('parseDictionaryCsv handles BYTES type with description prefix', () => {
  const dict = parseDictionaryCsv(SAMPLE_CSV);
  const e2000 = dict.get(2000);
  assert.equal(e2000.paramType, 'BYTES');
  assert.equal(e2000.description, 'Ble connected, dev mac is: ');
});

test('parseDictionaryCsv handles NONE type', () => {
  const dict = parseDictionaryCsv(SAMPLE_CSV);
  const e2075 = dict.get(2075);
  assert.equal(e2075.paramType, 'NONE');
  assert.equal(e2075.paramCount, 0);
});

test('parseDictionaryCsv skips version/header rows and ignores blank trailing lines', () => {
  const csv = SAMPLE_CSV + '\n\n   \n';
  const dict = parseDictionaryCsv(csv);
  assert.equal(dict.size, 5);
});

test('loadDictionary reads from disk', () => {
  const dict = loadDictionary('./event_trace.csv');
  assert.ok(dict.size >= 1, 'should load at least one event');
  assert.ok(dict.has(1041), 'should contain known event 1041 from project event_trace.csv');
});
