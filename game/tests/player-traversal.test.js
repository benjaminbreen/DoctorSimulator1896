import test from 'node:test';
import assert from 'node:assert/strict';
import { isRunningGait, locomotionBlend } from '../src/movement/playerLocomotion.js';
import { movementStep } from '../src/movement/movementStep.js';
import { findTraversal, beginTraversal, advanceTraversal } from '../src/movement/traversal.js';
import { PARK_TRAVERSAL } from '../src/world/parkTraversal.js';
import outdoor from '../src/tuning/presets/outdoor.json' with { type: 'json' };

test('the default sprint settles into the running clip and brakes to idle', () => {
  const tunables = outdoor.values;
  let state = { velocity: [0, 0, 0], yaw: 0, grounded: true, coyoteTimer: 0, jumpBufferTimer: 0 };
  const step = (z) => {
    state = movementStep({ input: { x: 0, z, run: true }, lookYaw: 0, state, dt: 1 / 60, tunables }).state;
    return Math.hypot(state.velocity[0], state.velocity[2]);
  };
  assert.ok(step(1) < tunables.walkSpeed, 'starts from a planted stance');
  for (let i = 0; i < 40; i += 1) step(1);
  const speed = step(1);
  assert.ok(isRunningGait(speed, tunables));
  assert.ok(locomotionBlend(speed, tunables.walkSpeed, tunables.runSpeed).run > 0.95);
  assert.ok(step(0) > 2, 'retains momentum for the first braking step');
  for (let i = 0; i < 50; i += 1) step(0);
  assert.ok(step(0) < 0.01);
});

test('the ladder has a usable approach at both ends and lands on the deck', () => {
  const [ladder] = PARK_TRAVERSAL;
  const base = [ladder.low[0], ladder.low[1], ladder.low[2] + 0.6];
  assert.equal(findTraversal([ladder], base, Math.PI), null, 'cannot mount facing away');
  const up = findTraversal([ladder], base, 0);
  assert.equal(up.down, false);
  const end = advanceTraversal(beginTraversal(up, base, 0), 10);
  assert.equal(end.done, true);
  assert.deepEqual(end.position, ladder.top);
  const down = findTraversal([ladder], end.position, Math.PI);
  assert.equal(down.down, true);
  assert.deepEqual(advanceTraversal(beginTraversal(down, end.position, Math.PI), 10).position, ladder.low);
});

test('the vault keeps the capsule above the crate while crossing it', () => {
  const [, crate] = PARK_TRAVERSAL;
  for (const approach of [1.05, 1.47]) {
    const [x, y, z] = crate.position;
    const start = [x, y + 0.05, z + approach];
    let motion = beginTraversal(findTraversal([crate], start, 0), start, 0);
    let next;
    do {
      next = advanceTraversal(motion, 1 / 120);
      motion = next.motion;
      if (Math.abs(next.position[2] - z) < 0.375 + 0.28) {
        assert.ok(next.position[1] > y + crate.height + 0.035, 'feet clear the crate');
      }
    } while (!next.done);
    assert.ok(next.position[2] < z - 0.9);
  }
});
