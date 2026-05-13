import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { extractSn } from '../src/sn.js';

test('extractSn returns SN for valid .txt filename', () => {
  assert.equal(extractSn('raw_NSB023567819006.txt'), 'NSB023567819006');
});

test('extractSn returns SN for valid .log filename', () => {
  assert.equal(extractSn('raw_ABC123456789012.log'), 'ABC123456789012');
});

test('extractSn returns SN for valid .csv filename', () => {
  assert.equal(extractSn('raw_NSBB22100D59F7B.csv'), 'NSBB22100D59F7B');
});

test('extractSn rejects filename without raw_ prefix', () => {
  assert.throws(() => extractSn('log_NSB023567819006.txt'), /filename must match/);
});

test('extractSn rejects too-short SN', () => {
  assert.throws(() => extractSn('raw_NSB02356.txt'), /filename must match/);
});

test('extractSn rejects too-long SN', () => {
  assert.throws(() => extractSn('raw_NSB023567819006XXXX.txt'), /filename must match/);
});

test('extractSn rejects wrong extension', () => {
  assert.throws(() => extractSn('raw_NSB023567819006.json'), /filename must match/);
});

test('extractSn rejects non-alphanumeric SN', () => {
  assert.throws(() => extractSn('raw_NSB-23567819006.txt'), /filename must match/);
});

test('extractSn rejects empty filename', () => {
  assert.throws(() => extractSn(''), /filename must match/);
});
