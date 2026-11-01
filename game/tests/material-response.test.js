import test from 'node:test';
import assert from 'node:assert/strict';
import { capsuleTouchesPoint, curtainContactOffset, stepMaterialSpring } from '../src/world/materialResponse.js';

test('cloth follows entry direction and stays fixed at its attachments', () => {
  const height = 2.52;
  const sample = (y, z, direction) => curtainContactOffset(0, y, 0, [0, -height / 2, z], 1.68, 0.32, direction, 0.44, height);
  assert.ok(sample(-0.5, -0.12, 1) > 0);
  assert.ok(sample(-0.5, 0.12, -1) < 0);
  assert.equal(sample(height / 2, -0.12, 1), 0);
  assert.ok(Math.abs(sample(height * (0.44 - 0.5), -0.12, 1)) < 1e-12);
  assert.equal(sample(-0.5, 1, -1), 0, 'no response outside contact');
});

test('a shade above a standing head is reached by jumping, not walking nearby', () => {
  const shade = [0, 2.16, 0];
  assert.equal(capsuleTouchesPoint(shade, [0, 0, 0], 1.68, 0.28, 0.13), false);
  assert.equal(capsuleTouchesPoint(shade, [0, 0.5, 0], 1.68, 0.28, 0.13), true);
  assert.equal(capsuleTouchesPoint(shade, [0.7, 0.5, 0], 1.68, 0.28, 0.13), false);
});

test('released material settles without depending on frame rate', () => {
  const settle = (fps) => {
    const spring = { value: 0.3, velocity: 1.2 };
    for (let i = 0; i < fps * 4; i += 1) stepMaterialSpring(spring, 0, 1 / fps);
    return spring;
  };
  for (const fps of [30, 60, 144]) {
    const spring = settle(fps);
    assert.equal(spring.value, 0);
    assert.equal(spring.velocity, 0);
  }
  const spike = { value: 0, velocity: 100 };
  stepMaterialSpring(spike, 0, 30, 115, 6, 0.22);
  assert.ok(Number.isFinite(spike.value) && Math.abs(spike.value) <= 0.22);
});
