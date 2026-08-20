import test from 'node:test';
import assert from 'node:assert/strict';
import {
  settingsSchema,
  schemaParameters,
  STARTING_TIME,
  STARTING_ZONE,
} from '../src/tuning/settingsSchema.js';
import {
  applyGameStart,
  createTuningRuntime,
  migrateStoredTuning,
} from '../src/tuning/runtime.js';

const parameters = schemaParameters(settingsSchema);

test('parameter ids are globally unique', () => {
  const ids = parameters.map((parameter) => parameter.id);
  assert.equal(new Set(ids).size, ids.length);
});

test('range parameters have sane bounds and defaults in range', () => {
  for (const parameter of parameters.filter((p) => p.type === 'range')) {
    assert.ok(parameter.min < parameter.max, parameter.id);
    assert.ok(parameter.step > 0, parameter.id);
    assert.ok(parameter.default >= parameter.min && parameter.default <= parameter.max, parameter.id);
  }
});

test('select parameters include their default', () => {
  for (const parameter of parameters.filter((p) => p.type === 'select')) {
    assert.ok(parameter.options.includes(parameter.default), parameter.id);
  }
});

test('player graphics quality defaults to Auto and rebuilds render targets', () => {
  const definition = parameters.find((parameter) => parameter.id === 'graphicsQuality');
  assert.equal(definition.default, 'auto');
  assert.deepEqual(definition.options, ['auto', 'performance', 'quality']);
  assert.equal(definition.mode, 'rebuild');
});

test('a game session starts in Central Park at 9:30 am', () => {
  const runtime = createTuningRuntime(settingsSchema);
  runtime.set('zone', 'consulting-office');
  runtime.set('timeOfDay', 15.5);

  applyGameStart(runtime);

  assert.equal(STARTING_ZONE, 'central-park');
  assert.equal(STARTING_TIME, 9.5);
  assert.equal(runtime.values.zone, STARTING_ZONE);
  assert.equal(runtime.values.timeOfDay, STARTING_TIME);

  runtime.set('zone', 'consulting-office');
  assert.equal(runtime.values.timeOfDay, STARTING_TIME, 'travel preserves the game clock');
});

test('interior ambient occlusion uses the approved defaults', () => {
  const byId = new Map(parameters.map((parameter) => [parameter.id, parameter]));
  assert.equal(byId.get('aoEnabled').default, true);
  assert.equal(byId.get('aoIntensity').default, 3.7);
  assert.equal(byId.get('aoRadius').default, 1.75);
});

test('ambient occlusion stays off outdoors', () => {
  const runtime = createTuningRuntime(settingsSchema);
  assert.equal(runtime.values.zone, 'central-park');
  assert.equal(runtime.values.aoEnabled, false);

  runtime.set('zone', 'consulting-office');
  assert.equal(runtime.values.aoEnabled, true);

  runtime.set('zone', 'central-park');
  assert.equal(runtime.values.aoEnabled, false);
});

test('Central Park starts with the approved outdoor art direction', () => {
  const runtime = createTuningRuntime(settingsSchema);
  assert.equal(runtime.values.ambientIntensity, 0.28);
  assert.equal(runtime.values.sunIntensity, 1.25);
  assert.equal(runtime.values.skyTurbidity, 6.45);
  assert.equal(runtime.values.skySaturation, 0.75);
  assert.equal(runtime.values.skyFill, 1.4);
  assert.equal(runtime.values.groundBounce, 0.3);
  assert.equal(runtime.values.outdoorShadowDistance, 50);
  assert.equal(runtime.values.exposure, 1.0);
  assert.equal(runtime.values.toneMapping, 'ACESFilmic');
});

test('reset restores the outdoor preset without changing the game clock', () => {
  const runtime = createTuningRuntime(settingsSchema);
  runtime.set('toneMapping', 'AgX');
  runtime.set('sunIntensity', 2);
  runtime.set('skyFill', 2);
  runtime.set('groundBounce', 2);
  runtime.set('outdoorShadowDistance', 70);
  runtime.set('exposure', 2);
  runtime.set('timeOfDay', 12.3);

  runtime.resetToDefaults();

  assert.equal(runtime.values.toneMapping, 'ACESFilmic');
  assert.equal(runtime.values.sunIntensity, 1.25);
  assert.equal(runtime.values.skyFill, 1.4);
  assert.equal(runtime.values.groundBounce, 0.3);
  assert.equal(runtime.values.outdoorShadowDistance, 50);
  assert.equal(runtime.values.exposure, 1.0);
  assert.equal(runtime.values.timeOfDay, 12.3);
});

test('hero camera has an independent follow profile', () => {
  const byId = new Map(parameters.map((parameter) => [parameter.id, parameter]));
  assert.equal(byId.get('heroSide').default, 0.25);
  assert.equal(byId.get('heroUp').default, 2.05);
  assert.equal(byId.get('heroBack').default, 4.2);
  assert.equal(byId.get('heroFov').default, 60);
  assert.equal(byId.get('heroFollowRate').default, 3.5);
  assert.equal(byId.get('heroRecenterDelay').default, 0.9);
  assert.equal(byId.get('heroCollisionRadius').default, 0.22);
});

test('outdoor shadow distance is live and defaults to the current coverage', () => {
  const definition = parameters.find((parameter) => parameter.id === 'outdoorShadowDistance');
  assert.equal(definition.default, 25);
  assert.equal(definition.min, 10);
  assert.equal(definition.max, 80);
  assert.notEqual(definition.mode, 'rebuild');
});

test('pigeon visibility controls are live outdoor tuning', () => {
  const byId = new Map(parameters.map((parameter) => [parameter.id, parameter]));
  assert.equal(byId.get('pigeonCount').default, 14);
  assert.equal(byId.get('pigeonSize').default, 1.3);
  assert.equal(byId.get('pigeonSpeed').default, 0.7);
  assert.equal(byId.get('pigeonAltitude').default, -0.5);
  assert.equal(byId.get('pigeonContinuous').default, true);
  assert.equal(byId.get('pigeonSoloCount').default, 2);
  assert.equal(byId.get('beeCount').default, 33);
  assert.equal(byId.get('beeSize').default, 0.4);
  assert.equal(byId.get('beeSpread').default, 1.5);
  assert.equal(byId.get('butterflyCount').default, 18);
  assert.equal(byId.get('fireflyCount').default, 55);
  for (const id of [
    'pigeonCount',
    'pigeonSize',
    'pigeonSpeed',
    'pigeonAltitude',
    'pigeonContinuous',
    'pigeonSoloCount',
    'beeCount',
    'beeSize',
    'beeSpeed',
    'beeSpread',
    'butterflyCount',
    'butterflySize',
    'butterflySpeed',
    'butterflySpread',
    'fireflyCount',
    'fireflySize',
    'fireflySpeed',
    'fireflySpread',
  ]) {
    assert.notEqual(byId.get(id).mode, 'rebuild', `${id} should update live`);
  }
});

test('version-one fauna defaults migrate without overwriting custom tuning', () => {
  const migrated = migrateStoredTuning({
    schemaVersion: 1,
    values: {
      pigeonSize: 1.5,
      beeSize: 0.5,
      beeSpread: 1,
      beeSpeed: 1.75,
    },
  }, settingsSchema);
  // Every step runs in order, so a version-one profile lands on the current one.
  assert.equal(migrated.schemaVersion, settingsSchema.version);
  assert.equal(migrated.values.pigeonSize, 1.3);
  assert.equal(migrated.values.beeSize, 0.4);
  assert.equal(migrated.values.beeSpread, 1.5);
  assert.equal(migrated.values.beeSpeed, 1.75);
});

test('version-three migration replaces stale defaults but keeps moved sliders', () => {
  const migrated = migrateStoredTuning({
    schemaVersion: 2,
    values: { shadowMapSize: '2048', saturation: 1, contrast: 1, gradeWarmth: 1.6 },
  }, settingsSchema);
  assert.equal(migrated.schemaVersion, settingsSchema.version);
  assert.equal(migrated.values.shadowMapSize, '1024');
  assert.equal(migrated.values.saturation, 1.08);
  assert.equal(migrated.values.contrast, 1, 'contrast is deliberately unchanged');
  // Already moved off the old default, so it is a decision and must survive.
  assert.equal(migrated.values.gradeWarmth, 1.6);
});

test('an up-to-date profile is returned untouched', () => {
  const stored = { schemaVersion: settingsSchema.version, values: { shadowMapSize: '2048' } };
  assert.equal(migrateStoredTuning(stored, settingsSchema).values.shadowMapSize, '2048');
});

test('runtime clamps out-of-range writes and ignores unknown ids', () => {
  const runtime = createTuningRuntime(settingsSchema);
  runtime.set('walkSpeed', 999);
  assert.equal(runtime.values.walkSpeed, 14);
  runtime.set('nonsense', 5);
  assert.equal(runtime.values.nonsense, undefined);
});

test('preset round-trips through export and apply', () => {
  const runtime = createTuningRuntime(settingsSchema);
  runtime.set('walkSpeed', 6);
  const preset = runtime.toPreset();
  const second = createTuningRuntime(settingsSchema);
  second.applyPreset(preset);
  assert.equal(second.values.walkSpeed, 6);
});
