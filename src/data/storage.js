// src/data/storage.js
import { SCHEMA_VERSION } from './schema.js';
import { makeDefaultState } from './defaults.js';

const STORAGE_KEY = 'god-strength-v1';

/** Load app state from localStorage. If absent, write defaults and return them. */
export function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      const defaults = makeDefaultState();
      saveState(defaults);
      return defaults;
    }
    const parsed = JSON.parse(raw);
    return migrateIfNeeded(parsed);
  } catch (err) {
    console.error('[storage] loadState failed, falling back to defaults', err);
    return makeDefaultState();
  }
}

/** Persist app state to localStorage. */
export function saveState(state) {
  try {
    const toSave = { ...state, updatedAt: new Date().toISOString() };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave));
    return true;
  } catch (err) {
    console.error('[storage] saveState failed', err);
    return false;
  }
}

/** Wipe stored state. Used by Replace All import. */
export function clearState() {
  localStorage.removeItem(STORAGE_KEY);
}

/** Trigger a JSON download of current state. */
export function exportJSON(state) {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const stamp = new Date().toISOString().slice(0, 10);
  a.download = `god-strength-v1_${stamp}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/** Import state from a JSON file. Returns parsed state or throws. */
export async function importJSON(file) {
  const text = await file.text();
  const parsed = JSON.parse(text);
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Invalid JSON: not an object');
  }
  if (!Array.isArray(parsed.accounts) || !Array.isArray(parsed.trades) || !Array.isArray(parsed.transactions)) {
    throw new Error('Invalid JSON: missing accounts/trades/transactions arrays');
  }
  return migrateIfNeeded(parsed);
}

/** Forward-compat: handle older schema versions if we ever bump SCHEMA_VERSION. */
function migrateIfNeeded(state) {
  if (!state.version || state.version < SCHEMA_VERSION) {
    // No migrations yet — just stamp the version.
    return { ...state, version: SCHEMA_VERSION };
  }
  return state;
}
