// Filter shortcuts: up to SLOT_COUNT saved filter-bar texts, each bound to a
// hotkey. Pure logic with the storage injected, so it runs under node:test.
export const SLOT_COUNT = 6;
export const STORAGE_KEY = 'logparse.shortcuts';

const NAME_MAX = 24;

function cleanName(name) {
  return typeof name === 'string' ? name.trim().slice(0, NAME_MAX) : '';
}

// What a slot's button shows: the user's name, or the filter text until named.
export function shortcutLabel(slot) {
  if (!slot) return '';
  return slot.name || slot.filter;
}

// Alt+1..6 → slot index 0..5, anything else → null. Matches on the physical
// key (`code`) so it is layout-independent; Numpad digits stay free for Alt codes.
export function slotForKey(e) {
  if (!e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return null;
  const m = /^Digit([1-9])$/.exec(e.code || '');
  if (!m) return null;
  const index = parseInt(m[1], 10) - 1;
  return index < SLOT_COUNT ? index : null;
}

// Untrusted value (stored JSON, a request body) → exactly SLOT_COUNT slots,
// each null or { name, filter }. Anything malformed becomes an empty slot.
export function normalizeSlots(value) {
  const slots = new Array(SLOT_COUNT).fill(null);
  if (!Array.isArray(value)) return slots;
  for (let i = 0; i < SLOT_COUNT; i++) {
    const s = value[i];
    if (s && typeof s.filter === 'string' && s.filter.trim()) {
      slots[i] = { name: cleanName(s.name), filter: s.filter.trim() };
    }
  }
  return slots;
}

function load(storage) {
  try {
    return normalizeSlots(JSON.parse(storage.getItem(STORAGE_KEY)));
  } catch {
    /* storage unavailable or corrupt — start empty */
    return normalizeSlots(null);
  }
}

function save(storage, slots) {
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(slots));
  } catch {
    /* storage unavailable or full — ignore */
  }
}

// `storage` is localStorage-like, or null when the browser blocks storage — the
// slots then live in memory for the page's lifetime.
export function createShortcuts(storage) {
  let slots = load(storage);
  // Re-read before each change so a second tab's slots are not overwritten
  // with this tab's stale copy.
  const refresh = () => { if (storage) slots = load(storage); };
  const valid = i => Number.isInteger(i) && i >= 0 && i < SLOT_COUNT;

  return {
    list() {
      return slots.map(s => (s ? { ...s } : null));
    },
    assign(index, filter) {
      const f = (filter || '').trim();
      if (!valid(index) || !f) return false;
      refresh();
      // keep the user's name: re-assigning is usually a tweak of the same filter
      slots[index] = { name: slots[index] ? slots[index].name : '', filter: f };
      save(storage, slots);
      return true;
    },
    rename(index, name) {
      if (!valid(index)) return false;
      refresh();
      if (!slots[index]) return false;
      slots[index] = { ...slots[index], name: cleanName(name) };
      save(storage, slots);
      return true;
    },
    clear(index) {
      if (!valid(index)) return false;
      refresh();
      slots[index] = null;
      save(storage, slots);
      return true;
    },
  };
}
