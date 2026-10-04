import fs from 'fs';
import { normalizeSlots } from '../public/shortcuts.js';

// Filter shortcuts live in one JSON file beside the server so they outlast the
// browser: another browser, another port or cleared site data all see the same
// slots. Returns null when nothing has been saved yet (or the file is unreadable).
export function loadShortcutFile(file) {
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    return Array.isArray(parsed) ? normalizeSlots(parsed) : null;
  } catch {
    return null;
  }
}

// Cleans what the client sent, writes it, and returns what was written.
export function saveShortcutFile(file, slots) {
  if (!Array.isArray(slots)) throw new Error('slots must be an array');
  const clean = normalizeSlots(slots);
  fs.writeFileSync(file, JSON.stringify(clean, null, 2), 'utf8');
  return clean;
}
