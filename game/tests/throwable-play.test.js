import test from 'node:test';
import assert from 'node:assert/strict';
import {
  THROWABLE_RELEASE_DELAY,
  advanceThrowableThrow,
  beginThrowableCharge,
  chargeThrowable,
  findReachableThrowable,
  getThrowablePlay,
  pickUpThrowable,
  queueThrowableThrow,
  reportThrowableSource,
  resetThrowablePlayForTests,
  throwAimDirection,
  throwableSpeed,
  throwableVelocity,
} from '../src/world/throwablePlay.js';
import { THROWABLE_TYPES } from '../src/world/throwables.js';

test.afterEach(resetThrowablePlayForTests);

test('finds nearby registered objects and retains their throwable type', () => {
  reportThrowableSource('front', 'cabbage', [0.2, 1, -1.1], () => true);
  reportThrowableSource('back', 'apple', [0, 1, 0.8], () => true);
  reportThrowableSource('far', 'apple', [0, 1, -3], () => true);
  assert.equal(findReachableThrowable([0, 0, 0], 0)?.id, 'front');
  assert.equal(findReachableThrowable([0, 0, 0], 0)?.type, 'cabbage');
  assert.equal(findReachableThrowable([0, 0, 0], Math.PI)?.type, 'apple');
  assert.equal(reportThrowableSource('unknown', 'brick', [0, 1, -1], () => true), false);
});

test('pickup, hold, release, and delayed launch preserve object identity', () => {
  let taken = 0;
  reportThrowableSource('cart:apple:2', 'apple', [0, 1, -1], () => {
    taken += 1;
    return true;
  });
  assert.equal(pickUpThrowable('cart:apple:2'), true);
  assert.equal(taken, 1);
  assert.equal(getThrowablePlay().heldType, 'apple');

  assert.equal(beginThrowableCharge(), true);
  chargeThrowable(0.575);
  assert.ok(Math.abs(getThrowablePlay().charge - 0.5) < 1e-9);
  assert.equal(queueThrowableThrow([0, 0, -1]), true);
  assert.equal(advanceThrowableThrow(THROWABLE_RELEASE_DELAY / 2, [2, 3, 4]), null);

  const launch = advanceThrowableThrow(THROWABLE_RELEASE_DELAY, [2, 3, 4]);
  assert.deepEqual(launch.origin, [2, 3, 4]);
  assert.equal(launch.sourceId, 'cart:apple:2');
  assert.equal(launch.type, 'apple');
  assert.equal(getThrowablePlay().phase, 'empty');
});

test('each type owns its throw speed while sharing the same camera aim', () => {
  const cabbage = THROWABLE_TYPES.cabbage;
  const apple = THROWABLE_TYPES.apple;
  assert.equal(throwableSpeed(0, 'cabbage'), cabbage.throwMin);
  assert.equal(throwableSpeed(1, 'cabbage'), cabbage.throwMax);
  assert.equal(throwableSpeed(1, 'apple'), apple.throwMax);
  assert.ok(throwableSpeed(0.5, 'apple') > throwableSpeed(0.5, 'cabbage'));

  const aimed = throwAimDirection([0, -0.9, -1]);
  assert.ok(aimed[1] >= 0.14, `upward aim ${aimed[1]}`);
  assert.ok(Math.abs(Math.hypot(...aimed) - 1) < 1e-9);
  const velocity = throwableVelocity([1, 0, 0], 1, 'apple');
  assert.ok(velocity[0] > 19);
  assert.ok(velocity[1] > 6);
  assert.ok(Math.abs(Math.hypot(...velocity) - apple.throwMax) < 1e-9);
});

test('throwable definitions contain the data needed by UI and physics', () => {
  assert.deepEqual(Object.keys(THROWABLE_TYPES).sort(), ['apple', 'cabbage']);
  for (const [id, definition] of Object.entries(THROWABLE_TYPES)) {
    assert.equal(definition.id, id);
    assert.ok(definition.label);
    assert.ok(definition.colliderRadius > 0);
    assert.ok(definition.throwMax > definition.throwMin);
    assert.ok(definition.impactColor.startsWith('#'));
    assert.ok(definition.aimColor.startsWith('#'));
  }
});
