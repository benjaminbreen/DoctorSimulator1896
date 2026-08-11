import test from 'node:test';
import assert from 'node:assert/strict';
import {
  settingsSchema,
  schemaParameters,
  STARTING_TIME,
  STARTING_ZONE,
} from '../src/tuning/settingsSchema.js';
import { applyGameStart, createTuningRuntime } from '../src/tuning/runtime.js';

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
