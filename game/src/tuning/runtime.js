// Mutable tuning store. The panel writes values; useFrame code reads them
// directly, so slider changes show on the next frame with no React state.

import { schemaParameters } from './settingsSchema.js';

const STORAGE_KEY = 'ghosts-game.tuning.v1';
const storage = typeof localStorage === 'undefined' ? null : localStorage;

function coerce(definition, value) {
  if (definition.type === 'toggle') return Boolean(value);
  if (definition.type === 'select') {
    return definition.options.includes(value) ? value : definition.default;
  }
  if (definition.type === 'color') {
    return typeof value === 'string' ? value : definition.default;
  }
  const number = Number(value);
  if (!Number.isFinite(number)) return definition.default;
  return Math.min(definition.max, Math.max(definition.min, number));
}

export function createTuningRuntime(schema) {
  const definitions = schemaParameters(schema);
  const byId = new Map(definitions.map((definition) => [definition.id, definition]));
  const values = {};
  for (const definition of definitions) values[definition.id] = definition.default;

  const changeListeners = new Set();
  const rebuildListeners = new Set();
  let saveTimer = null;

  function persist() {
    if (!storage) return;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      storage.setItem(STORAGE_KEY, JSON.stringify({ schemaVersion: schema.version, values }));
    }, 250);
  }

  function set(id, value) {
    const definition = byId.get(id);
    if (!definition) return;
    values[id] = coerce(definition, value);
    for (const listener of changeListeners) listener(id, values[id]);
    if (definition.mode === 'rebuild') for (const listener of rebuildListeners) listener(id);
    persist();
  }

  function applyPreset(preset) {
    if (!preset || typeof preset.values !== 'object') return;
    let rebuildNeeded = false;
    for (const [id, value] of Object.entries(preset.values)) {
      const definition = byId.get(id);
      if (!definition) continue;
      values[id] = coerce(definition, value);
      if (definition.mode === 'rebuild') rebuildNeeded = true;
      for (const listener of changeListeners) listener(id, values[id]);
    }
    if (rebuildNeeded) for (const listener of rebuildListeners) listener('preset');
    persist();
  }

  function resetToDefaults() {
    applyPreset({ values: Object.fromEntries(definitions.map((d) => [d.id, d.default])) });
  }

  function toPreset() {
    return { schemaVersion: schema.version, values: { ...values } };
  }

  function loadStored() {
    if (!storage) return;
    try {
      const stored = JSON.parse(storage.getItem(STORAGE_KEY));
      if (stored?.schemaVersion === schema.version) applyPreset(stored);
    } catch {
      storage.removeItem(STORAGE_KEY);
    }
  }

  const runtime = {
    schema,
    definitions,
    values,
    set,
    applyPreset,
    resetToDefaults,
    toPreset,
    onChange: (listener) => (changeListeners.add(listener), () => changeListeners.delete(listener)),
    onRebuild: (listener) => (rebuildListeners.add(listener), () => rebuildListeners.delete(listener)),
  };
  loadStored();
  return runtime;
}
