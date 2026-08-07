import test from 'node:test';
import assert from 'node:assert/strict';
import { movementStep, applySlide } from '../src/movement/movementStep.js';

const tunables = {
  walkSpeed: 4.45,
  runSpeed: 7.45,
  gravity: 16.5,
  groundAcceleration: 38,
  groundDeceleration: 22,
  turnDamping: 20,
  jumpVelocity: 6.8,
  coyoteTime: 0.2,
  jumpBufferTime: 0.16,
  fallGravityMultiplier: 1.28,
  jumpReleaseGravityMultiplier: 2.05,
};

const DT = 1 / 60;
const IDLE = { x: 0, z: 0, run: false, jump: false };
const FORWARD = { x: 0, z: 1, run: false, jump: false };

function freshState() {
  return {
    velocity: [0, 0, 0],
    yaw: 0,
    grounded: true,
    coyoteTimer: 0,
    jumpBufferTimer: 0,
    jumpHeldLast: false,
  };
}

function run(state, input, lookYaw, steps) {
  let current = state;
  for (let i = 0; i < steps; i += 1) {
    current = movementStep({ input, lookYaw, state: current, dt: DT, tunables }).state;
  }
  return current;
}

test('held forward input converges to walk speed', () => {
  const state = run(freshState(), FORWARD, 0, 240);
  const speed = Math.hypot(state.velocity[0], state.velocity[2]);
  assert.ok(Math.abs(speed - tunables.walkSpeed) < 0.01, `speed ${speed}`);
  assert.ok(state.velocity[2] < 0, 'forward at yaw 0 moves toward -Z');
});

test('run flag converges to run speed', () => {
  const state = run(freshState(), { ...FORWARD, run: true }, 0, 240);
  const speed = Math.hypot(state.velocity[0], state.velocity[2]);
  assert.ok(Math.abs(speed - tunables.runSpeed) < 0.01);
});

test('zero input decays to rest', () => {
  const state = freshState();
  state.velocity = [3, 0, -3];
  const settled = run(state, IDLE, 0, 240);
  assert.ok(Math.hypot(settled.velocity[0], settled.velocity[2]) < 0.01);
});

test('identical inputs produce identical trajectories', () => {
  const a = run(freshState(), { x: 1, z: 1, run: false, jump: false }, 0.7, 120);
  const b = run(freshState(), { x: 1, z: 1, run: false, jump: false }, 0.7, 120);
  assert.deepEqual(a, b);
});

test('yaw crosses the +-PI seam by the short arc', () => {
  const state = freshState();
  state.yaw = Math.PI - 0.05;
  const turned = run(state, FORWARD, -Math.PI + 0.05, 30);
  assert.ok(Math.abs(turned.yaw) > Math.PI - 0.11, `yaw ${turned.yaw} should stay near the seam`);
});

test('diagonal input is normalized, not faster', () => {
  const state = run(freshState(), { x: 1, z: 1, run: false, jump: false }, 0, 240);
  const speed = Math.hypot(state.velocity[0], state.velocity[2]);
  assert.ok(speed <= tunables.walkSpeed + 0.01);
});

test('jump press while grounded launches at jump velocity', () => {
  const result = movementStep({
    input: { ...IDLE, jump: true },
    lookYaw: 0,
    state: freshState(),
    dt: DT,
    tunables,
  });
  assert.equal(result.state.velocity[1], tunables.jumpVelocity);
  assert.equal(result.state.grounded, false);
});

test('a grounded jump works with coyote and buffer sliders at zero', () => {
  const zeroed = { ...tunables, coyoteTime: 0, jumpBufferTime: 0 };
  const result = movementStep({
    input: { ...IDLE, jump: true },
    lookYaw: 0,
    state: freshState(),
    dt: DT,
    tunables: zeroed,
  });
  assert.equal(result.state.velocity[1], tunables.jumpVelocity);
});

test('holding jump does not re-trigger without a fresh press', () => {
  let state = freshState();
  state = movementStep({ input: { ...IDLE, jump: true }, lookYaw: 0, state, dt: DT, tunables }).state;
  // Land again but keep the key held: no second jump.
  state.grounded = true;
  state = movementStep({ input: { ...IDLE, jump: true }, lookYaw: 0, state, dt: DT, tunables }).state;
  assert.equal(state.velocity[1], -0.5);
});

test('coyote time allows a jump just after walking off a ledge', () => {
  let state = freshState();
  state = movementStep({ input: IDLE, lookYaw: 0, state, dt: DT, tunables }).state;
  state.grounded = false; // walked off the edge
  state = movementStep({ input: IDLE, lookYaw: 0, state, dt: DT, tunables }).state;
  state = movementStep({ input: { ...IDLE, jump: true }, lookYaw: 0, state, dt: DT, tunables }).state;
  assert.equal(state.velocity[1], tunables.jumpVelocity);
});

test('a buffered jump fires on landing', () => {
  let state = freshState();
  state.grounded = false;
  state.coyoteTimer = 0;
  state.velocity = [0, -3, 0];
  state = movementStep({ input: { ...IDLE, jump: true }, lookYaw: 0, state, dt: DT, tunables }).state;
  assert.ok(state.velocity[1] < 0, 'still falling; jump only buffered');
  state.grounded = true; // controller reports landing
  state = movementStep({ input: { ...IDLE, jump: true }, lookYaw: 0, state, dt: DT, tunables }).state;
  assert.equal(state.velocity[1], tunables.jumpVelocity);
});

test('releasing jump early falls faster than holding it', () => {
  const launch = () => {
    let state = freshState();
    state = movementStep({ input: { ...IDLE, jump: true }, lookYaw: 0, state, dt: DT, tunables }).state;
    return state;
  };
  let held = launch();
  let released = launch();
  for (let i = 0; i < 20; i += 1) {
    held = movementStep({ input: { ...IDLE, jump: true }, lookYaw: 0, state: held, dt: DT, tunables }).state;
    released = movementStep({ input: IDLE, lookYaw: 0, state: released, dt: DT, tunables }).state;
  }
  assert.ok(released.velocity[1] < held.velocity[1], 'early release bleeds upward speed faster');
});

test('slide removes the into-wall component and keeps the tangent', () => {
  const slid = applySlide([-2, -1, 3], [1, 0, 0]);
  assert.ok(Math.abs(slid[0]) < 1e-9, 'into-wall component removed');
  assert.equal(slid[1], -1, 'vertical untouched');
  assert.ok(slid[2] > 2.6, 'tangent mostly kept');
});

test('slide leaves velocity moving away from the wall alone', () => {
  const velocity = [2, 0, 3];
  assert.deepEqual(applySlide(velocity, [1, 0, 0]), velocity);
});
