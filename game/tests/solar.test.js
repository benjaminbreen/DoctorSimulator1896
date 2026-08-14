import test from 'node:test';
import assert from 'node:assert/strict';

import { directionAtAzimuth, solarRamps } from '../src/world/solar.js';

test('shot azimuth rotates the sun horizontally without changing altitude', () => {
  const physical = solarRamps(16, 216);
  const north = solarRamps(16, 216, 0);
  const east = solarRamps(16, 216, 90);

  assert.ok(Math.abs(north.direction[1] - physical.direction[1]) < 1e-12);
  assert.ok(Math.abs(east.direction[1] - physical.direction[1]) < 1e-12);
  assert.ok(Math.abs(north.direction[0]) < 1e-12);
  assert.ok(north.direction[2] < 0);
  assert.ok(east.direction[0] > 0);
  assert.ok(Math.abs(east.direction[2]) < 1e-12);
  assert.equal(north.altitude, physical.altitude);
  assert.equal(north.daylight, physical.daylight);
});

test('an absent azimuth override leaves a direction unchanged', () => {
  const direction = [0.25, 0.8, -0.54313902456];
  assert.equal(directionAtAzimuth(direction, null), direction);
});
