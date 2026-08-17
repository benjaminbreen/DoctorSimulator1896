// Mutable tuning store. The panel writes values; useFrame code reads them
// directly, so slider changes show on the next frame with no React state.

import { schemaParameters, STARTING_TIME, STARTING_ZONE } from './settingsSchema.js';
import { isOutdoorZone } from './zoneCategory.js';
import outdoorPreset from './presets/outdoor.json' with { type: 'json' };
import indoorPreset from './presets/indoor.json' with { type: 'json' };

const STORAGE_KEY = 'ghosts-game.tuning.v1';
const storage = typeof localStorage === 'undefined' ? null : localStorage;

// One step per schema version, applied in order. Each preserves every authored
// or imported setting and rewrites only values that still equal the previous
// default: a slider Ben has already moved is a decision, not a stale default.
const MIGRATIONS = {
  // Ambient fauna.
  2: (values) => {
    const replacements = {
      pigeonSize: [1.5, 1.3],
      pigeonSpeed: [1, 0.7],
      pigeonAltitude: [-3, -0.5],
      pigeonContinuous: [false, true],
      beeSpread: [1, 1.5],
    };
    for (const [id, [before, after]] of Object.entries(replacements)) {
      if (values[id] === before) values[id] = after;
    }
    if (values.beeSize === 1.4 || values.beeSize === 0.5) values.beeSize = 0.4;
  },
  // Half-size shadow maps for framerate, and a slightly warmer, richer grade.
  // Contrast stays at 1. A key absent here was never stored, so it simply
  // picks up the new schema default.
  3: (values) => {
    if (values.shadowMapSize === '2048') values.shadowMapSize = '1024';
    if (values.gradeWarmth === 1) values.gradeWarmth = 1.2;
    if (values.saturation === 1) values.saturation = 1.08;
  },
  // A slower run. Indoors it is refused outright, in PlayerRig.
  4: (values) => {
    if (values.runSpeed === 12.9) values.runSpeed = 8;
  },
  // Taller lawn tufts. The count is unchanged; each clump is bigger.
  5: (values) => {
    if (values.tuftSize === 1) values.tuftSize = 2;
  },
};

export function migrateStoredTuning(stored, schema) {
  if (!stored?.values || typeof stored.schemaVersion !== 'number') return stored;
  if (stored.schemaVersion >= schema.version) return stored;
  const values = { ...stored.values };
  for (let version = stored.schemaVersion + 1; version <= schema.version; version += 1) {
    MIGRATIONS[version]?.(values);
  }
  return { ...stored, schemaVersion: schema.version, values };
}

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

  // Indoors and outdoors are tuned as different places: light, camera, and
  // movement all change. Crossing the boundary swaps the category preset in
  // the same update, so the zone rebuild that follows sees the new values.
  let outdoorNow = false;

  function applyCategoryPreset(preset) {
    for (const [id, value] of Object.entries(preset.values)) {
      // Location tuning may change light and camera, never simulation time.
      if (id === 'timeOfDay') continue;
      const definition = byId.get(id);
      if (!definition) continue;
      values[id] = coerce(definition, value);
      for (const listener of changeListeners) listener(id, values[id]);
    }
  }

  function set(id, value) {
    const definition = byId.get(id);
    if (!definition) return;
    values[id] = coerce(definition, value);
    if (id === 'zone' && isOutdoorZone(values.zone) !== outdoorNow) {
      outdoorNow = !outdoorNow;
      applyCategoryPreset(outdoorNow ? outdoorPreset : indoorPreset);
    }
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
    const zone = values.zone;
    const timeOfDay = values.timeOfDay;
    const categoryPreset = isOutdoorZone(zone) ? outdoorPreset : indoorPreset;
    applyPreset({
      values: {
        ...Object.fromEntries(definitions.map((definition) => [definition.id, definition.default])),
        ...categoryPreset.values,
        // Zone and clock belong to the running game, not the tuning preset.
        zone,
        timeOfDay,
      },
    });
  }

  function toPreset() {
    return { schemaVersion: schema.version, values: { ...values } };
  }

  function loadStored() {
    if (!storage) return;
    try {
      const stored = migrateStoredTuning(JSON.parse(storage.getItem(STORAGE_KEY)), schema);
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
  // A fresh profile starts from the category preset of the starting zone;
  // stored values then win where present.
  if (isOutdoorZone(values.zone)) {
    for (const [id, value] of Object.entries(outdoorPreset.values)) {
      const definition = byId.get(id);
      if (definition) values[id] = coerce(definition, value);
    }
  }
  loadStored();
  outdoorNow = isOutdoorZone(values.zone);
  return runtime;
}

// Zone and clock are game-session state, not remembered tuning. Apply these
// after stored development values so every launch begins in the same place.
export function applyGameStart(runtime) {
  runtime.set('zone', STARTING_ZONE);
  runtime.set('timeOfDay', STARTING_TIME);
  return runtime;
}
