import test from 'node:test';
import assert from 'node:assert/strict';
import { createKeyboard } from '../src/input/keyboard.js';
import { movementStep } from '../src/movement/movementStep.js';

const tunables = {
  walkSpeed: 4,
  runSpeed: 7,
  groundAcceleration: 100,
  groundDeceleration: 100,
  turnDamping: 20,
  coyoteTime: 0.1,
  jumpBufferTime: 0.1,
  jumpVelocity: 5,
  gravity: 9.8,
  fallGravityMultiplier: 1.8,
  jumpReleaseGravityMultiplier: 2.2,
};

const grounded = {
  velocity: [0, 0, 0],
  yaw: 0,
  grounded: true,
  coyoteTimer: 0,
  jumpBufferTimer: 0,
  jumpHeldLast: false,
};

test('virtual controls expose analogue movement and held actions', () => {
  const input = createKeyboard();
  input.setVirtualMove(0.35, 0.6, true);
  input.setVirtualAction('jump', true);
  input.setVirtualAction('interact', true);

  assert.deepEqual(input.moveInput(), { x: 0.35, z: 0.6, run: true, jump: true });
  assert.equal(input.state.interact, true);

  input.clearVirtualInput();
  assert.deepEqual(input.moveInput(), { x: 0, z: 0, run: false, jump: false });
  assert.equal(input.state.interact, false);
});

test('analogue joystick distance controls walking speed', () => {
  const half = movementStep({
    input: { x: 0, z: 0.5, run: false, jump: false },
    lookYaw: 0,
    state: grounded,
    dt: 1,
    tunables,
  });
  const full = movementStep({
    input: { x: 0, z: 1, run: false, jump: false },
    lookYaw: 0,
    state: grounded,
    dt: 1,
    tunables,
  });

  assert.ok(Math.abs(half.state.velocity[2]) < Math.abs(full.state.velocity[2]));
  assert.ok(Math.abs(half.state.velocity[2] + 2) < 0.001);
  assert.ok(Math.abs(full.state.velocity[2] + 4) < 0.001);
});
