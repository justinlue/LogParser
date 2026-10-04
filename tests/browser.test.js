import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { chromeLaunchCommand } from '../src/browser.js';

const URL = 'http://localhost:3000';

test('on Windows the page is opened in Chrome through the shell `start` command', () => {
  assert.deepEqual(chromeLaunchCommand('win32', URL), {
    command: 'cmd',
    args: ['/c', 'start', '', 'chrome', URL],
  });
});

test('on macOS the page is opened in the Google Chrome app', () => {
  assert.deepEqual(chromeLaunchCommand('darwin', URL), {
    command: 'open',
    args: ['-a', 'Google Chrome', URL],
  });
});

test('on Linux the google-chrome binary is launched with the page', () => {
  assert.deepEqual(chromeLaunchCommand('linux', URL), {
    command: 'google-chrome',
    args: [URL],
  });
});
