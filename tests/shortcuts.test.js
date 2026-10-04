import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { createShortcuts, shortcutLabel, slotForKey } from '../public/shortcuts.js';

// Minimal stand-in for window.localStorage.
function fakeStorage(initial = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem: key => (data.has(key) ? data.get(key) : null),
    setItem: (key, value) => { data.set(key, String(value)); },
  };
}

test('a filter assigned to a slot is still there after a page reload', () => {
  const storage = fakeStorage();
  createShortcuts(storage).assign(1, '140 , 150');

  const afterReload = createShortcuts(storage).list();
  assert.equal(afterReload.length, 3);
  assert.equal(afterReload[0], null);
  assert.equal(afterReload[1].filter, '140 , 150');
  assert.equal(afterReload[2], null);
});

test('a shortcut is labelled by its filter text until the user renames it', () => {
  const storage = fakeStorage();
  const shortcuts = createShortcuts(storage);
  shortcuts.assign(0, '140 , 150');
  assert.equal(shortcutLabel(shortcuts.list()[0]), '140 , 150');

  shortcuts.rename(0, '  Door events ');
  assert.equal(shortcutLabel(shortcuts.list()[0]), 'Door events');
  assert.equal(shortcutLabel(createShortcuts(storage).list()[0]), 'Door events');
  assert.equal(createShortcuts(storage).list()[0].filter, '140 , 150');
});

test('renaming to blank falls back to the filter text', () => {
  const shortcuts = createShortcuts(fakeStorage());
  shortcuts.assign(0, 'G1104');
  shortcuts.rename(0, 'Jump');
  shortcuts.rename(0, '   ');
  assert.equal(shortcutLabel(shortcuts.list()[0]), 'G1104');
});

test('re-assigning a renamed slot keeps the name and replaces the filter', () => {
  const shortcuts = createShortcuts(fakeStorage());
  shortcuts.assign(2, '140 , 150');
  shortcuts.rename(2, 'Doors');
  shortcuts.assign(2, '140 , 150 , 160');
  assert.deepEqual(shortcuts.list()[2], { name: 'Doors', filter: '140 , 150 , 160' });
});

test('an empty slot cannot be renamed', () => {
  const shortcuts = createShortcuts(fakeStorage());
  assert.equal(shortcuts.rename(0, 'Ghost'), false);
  assert.equal(shortcuts.list()[0], null);
});

test('clearing a slot empties it for good and leaves the others alone', () => {
  const storage = fakeStorage();
  const shortcuts = createShortcuts(storage);
  shortcuts.assign(0, '140');
  shortcuts.assign(1, '150');
  shortcuts.clear(0);
  assert.equal(createShortcuts(storage).list()[0], null);
  assert.equal(createShortcuts(storage).list()[1].filter, '150');
});

test('there are exactly three slots; a fourth cannot be created', () => {
  const shortcuts = createShortcuts(fakeStorage());
  assert.equal(shortcuts.assign(3, '140'), false);
  assert.equal(shortcuts.assign(-1, '140'), false);
  assert.deepEqual(shortcuts.list(), [null, null, null]);
});

test('a blank filter cannot be saved and does not wipe the slot', () => {
  const shortcuts = createShortcuts(fakeStorage());
  shortcuts.assign(0, '140');
  assert.equal(shortcuts.assign(0, '   '), false);
  assert.equal(shortcuts.list()[0].filter, '140');
});

test('corrupt or foreign stored data yields three empty slots', () => {
  for (const raw of ['not json', '{"a":1}', '[1,"x",{"filter":5}]']) {
    const shortcuts = createShortcuts(fakeStorage({ 'logparse.shortcuts': raw }));
    assert.deepEqual(shortcuts.list(), [null, null, null]);
  }
});

test('Alt+1..3 select slots 0..2', () => {
  const key = (code, mods = {}) => ({ code, altKey: true, ctrlKey: false, metaKey: false, shiftKey: false, ...mods });
  assert.equal(slotForKey(key('Digit1')), 0);
  assert.equal(slotForKey(key('Digit2')), 1);
  assert.equal(slotForKey(key('Digit3')), 2);
});

test('other key combinations are not shortcuts', () => {
  const key = (code, mods = {}) => ({ code, altKey: true, ctrlKey: false, metaKey: false, shiftKey: false, ...mods });
  assert.equal(slotForKey(key('Digit4')), null);
  assert.equal(slotForKey(key('Digit1', { altKey: false })), null);
  // AltGr reports as Ctrl+Alt on Windows and types a character on some layouts
  assert.equal(slotForKey(key('Digit1', { ctrlKey: true })), null);
  assert.equal(slotForKey(key('Digit1', { metaKey: true })), null);
  assert.equal(slotForKey(key('Digit1', { shiftKey: true })), null);
  assert.equal(slotForKey(key('Numpad1')), null);
});

test('a change made in one tab does not wipe a slot saved in another tab', () => {
  const storage = fakeStorage();
  const tabA = createShortcuts(storage);
  const tabB = createShortcuts(storage);
  tabA.assign(0, '140');
  tabB.assign(1, '150');
  const afterReload = createShortcuts(storage).list();
  assert.equal(afterReload[0].filter, '140');
  assert.equal(afterReload[1].filter, '150');
});

test('shortcuts still work for the session when storage is unavailable', () => {
  const shortcuts = createShortcuts(null);
  assert.equal(shortcuts.assign(0, '140 , 150'), true);
  shortcuts.rename(0, 'Doors');
  assert.deepEqual(shortcuts.list()[0], { name: 'Doors', filter: '140 , 150' });
});
