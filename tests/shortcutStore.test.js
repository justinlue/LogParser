import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { loadShortcutFile, saveShortcutFile } from '../src/shortcutStore.js';

function tempFile() {
  return path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'logparse-shortcuts-')), 'shortcuts.json');
}

test('shortcuts saved to the file come back after a server restart', () => {
  const file = tempFile();
  saveShortcutFile(file, [{ name: 'Doors', filter: '140 , 150' }, null, { name: '', filter: 'G1104' }]);
  assert.deepEqual(loadShortcutFile(file), [
    { name: 'Doors', filter: '140 , 150' }, null, { name: '', filter: 'G1104' }, null, null, null,
  ]);
});

test('before anything was ever saved there is nothing to load', () => {
  assert.equal(loadShortcutFile(tempFile()), null);
});

test('a corrupt file reads as never saved rather than crashing', () => {
  const file = tempFile();
  fs.writeFileSync(file, '{ not json', 'utf8');
  assert.equal(loadShortcutFile(file), null);
});

test('junk from the client is cleaned before it reaches the file', () => {
  const file = tempFile();
  const seven = Array.from({ length: 7 }, (_, i) => ({ name: '', filter: String(i) }));
  seven[1] = { name: 5, filter: '   ' };
  seven[2] = 'nonsense';
  const saved = saveShortcutFile(file, seven);
  assert.equal(saved.length, 6);
  assert.deepEqual(saved.slice(0, 4), [{ name: '', filter: '0' }, null, null, { name: '', filter: '3' }]);
  assert.deepEqual(JSON.parse(fs.readFileSync(file, 'utf8')), saved);
});

test('something that is not a slot list is rejected and the file is left alone', () => {
  const file = tempFile();
  saveShortcutFile(file, [{ name: 'Doors', filter: '140' }]);
  assert.throws(() => saveShortcutFile(file, { slots: 'nope' }));
  assert.equal(loadShortcutFile(file)[0].filter, '140');
});
