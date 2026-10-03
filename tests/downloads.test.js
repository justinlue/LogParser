import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { saveConvertedCsv } from '../src/downloads.js';

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'logparse-downloads-'));
}

test('saveConvertedCsv overwrites the existing file when the same SN is fetched again', () => {
  const dir = tempDir();
  const first = saveConvertedCsv(dir, 'NSB023567819006', 'first fetch');
  const second = saveConvertedCsv(dir, 'NSB023567819006', 'second fetch');
  assert.equal(second, first);
  assert.deepEqual(fs.readdirSync(dir), ['raw_NSB023567819006_converted.csv']);
  assert.equal(fs.readFileSync(second, 'utf8'), 'second fetch');
});

test('saveConvertedCsv keeps a separate file per SN and creates the directory', () => {
  const dir = path.join(tempDir(), 'downloads');
  saveConvertedCsv(dir, 'NSB023567819006', 'a');
  saveConvertedCsv(dir, 'NSBB22100D59F7B', 'b');
  assert.deepEqual(fs.readdirSync(dir).sort(), [
    'raw_NSB023567819006_converted.csv',
    'raw_NSBB22100D59F7B_converted.csv',
  ]);
});
