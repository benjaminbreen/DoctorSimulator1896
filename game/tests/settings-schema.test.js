import test from 'node:test';
import assert from 'node:assert/strict';
import { settingsSchema, schemaParameters } from '../src/tuning/settingsSchema.js';
import { createTuningRuntime } from '../src/tuning/runtime.js';

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
