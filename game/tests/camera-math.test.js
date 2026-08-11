import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computeEyeTarget,
  occlusionLimit,
  rayVsBox,
  heroFollowYaw,
  heroLookAhead,
} from '../src/camera/cameraMath.js';

test('eye sits behind and beside the player at yaw 0', () => {
  const eye = computeEyeTarget({ playerPos: [0, 0, 0], yaw: 0, pitch: 0, side: 1, up: 2, back: 3 });
  assert.deepEqual(eye.map((v) => Math.round(v * 1e6) / 1e6), [1, 2, 3]);
});

test('positive pitch raises the eye', () => {
  const flat = computeEyeTarget({ playerPos: [0, 0, 0], yaw: 0, pitch: 0, side: 0, up: 2, back: 3 });
  const pitched = computeEyeTarget({ playerPos: [0, 0, 0], yaw: 0, pitch: 0.5, side: 0, up: 2, back: 3 });
  assert.ok(pitched[1] > flat[1]);
});

test('ray hits an axis-aligned box at the expected distance', () => {
  const hit = rayVsBox([0, 1, 0], [0, 0, -1], { position: [0, 1, -5], size: [2, 2, 1], yaw: 0 });
  assert.ok(Math.abs(hit - 4.5) < 1e-9);
});

test('ray misses a box off to the side', () => {
  assert.equal(rayVsBox([0, 1, 0], [0, 0, -1], { position: [5, 1, -5], size: [2, 2, 1], yaw: 0 }), null);
});

test('yawed box still blocks the ray', () => {
  const hit = rayVsBox([0, 1, 0], [0, 0, -1], { position: [0, 1, -5], size: [2, 2, 1], yaw: Math.PI / 4 });
  assert.ok(hit !== null && hit > 3 && hit < 5);
});

test('camera radius catches an obstruction beside the centre ray', () => {
  const box = { position: [0, 1, -5], size: [2, 2, 1], yaw: 0 };
  assert.equal(rayVsBox([1.15, 1, 0], [0, 0, -1], box), null);
  assert.ok(Math.abs(rayVsBox([1.15, 1, 0], [0, 0, -1], box, 0.2) - 4.3) < 1e-9);
});

test('occlusion shortens the boom and respects the floor distance', () => {
  const boxes = [{ position: [0, 1, 2], size: [4, 2, 0.2], yaw: 0 }];
  const limited = occlusionLimit([0, 1, 0], [0, 1, 4], boxes, { padding: 0.25, minDistance: 1.15 });
  assert.ok(Math.abs(limited - 1.65) < 1e-9);
  const clamped = occlusionLimit([0, 1, 0], [0, 1, 4], boxes, { padding: 3, minDistance: 1.15 });
  assert.equal(clamped, 1.15);
});

test('clear path returns the full boom length', () => {
  assert.equal(occlusionLimit([0, 1, 0], [0, 1, 4], [], { padding: 0.25, minDistance: 1.15 }), 4);
});

test('a wall closer than minDistance beats the comfort floor', () => {
  const boxes = [{ position: [0, 1, 0.6], size: [4, 2, 0.2], yaw: 0 }];
  const limited = occlusionLimit([0, 1, 0], [0, 1, 4], boxes, { padding: 0.25, minDistance: 1.15 });
  assert.ok(Math.abs(limited - 0.44) < 1e-9, `camera must stay out of the wall, got ${limited}`);
});

test('manual hero orbit holds until moving recenter begins', () => {
  const manual = heroFollowYaw({
    cameraYaw: 0,
    playerYaw: 1,
    manualDelta: 0.5,
    idleSeconds: 0,
    moving: true,
    followRate: 3.5,
    recenterDelay: 0.9,
    dt: 1 / 60,
  });
  assert.equal(manual, 0.5);

  const waiting = heroFollowYaw({
    cameraYaw: manual,
    playerYaw: 1,
    idleSeconds: 0.5,
    moving: true,
    followRate: 3.5,
    recenterDelay: 0.9,
    dt: 1 / 60,
  });
  assert.equal(waiting, manual);

  const following = heroFollowYaw({
    cameraYaw: waiting,
    playerYaw: 1,
    idleSeconds: 1,
    moving: true,
    followRate: 3.5,
    recenterDelay: 0.9,
    dt: 1 / 60,
  });
  assert.ok(following > waiting && following < 1);
});

test('hero camera does not recenter while the player stands still', () => {
  const yaw = heroFollowYaw({
    cameraYaw: -1,
    playerYaw: 1,
    idleSeconds: 10,
    moving: false,
    followRate: 3.5,
    recenterDelay: 0.9,
    dt: 1,
  });
  assert.equal(yaw, -1);
});

test('hero look-ahead follows horizontal velocity and stays bounded', () => {
  assert.deepEqual(heroLookAhead([2, 3, 4], [0, 0, 0], 0.65, 4), [2, 3, 4]);
  assert.deepEqual(heroLookAhead([2, 3, 4], [0, 0, -8], 0.65, 4), [2, 3, 3.35]);
});
