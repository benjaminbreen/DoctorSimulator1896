import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MOBILE_CONTEXT_RECYCLE_DELAY_MS,
  shouldRecycleWebGLContextOnTravel,
  webGLContextKey,
} from '../src/scene/mobileGraphics.js';

test('phones and touch-first tablets recycle the WebGL context on travel', () => {
  assert.equal(shouldRecycleWebGLContextOnTravel({
    maxTouchPoints: 5,
    coarsePointer: true,
    screenWidth: 393,
    screenHeight: 852,
  }), true);
  assert.equal(shouldRecycleWebGLContextOnTravel({
    maxTouchPoints: 5,
    coarsePointer: true,
    screenWidth: 1376,
    screenHeight: 1032,
  }), true);
});

test('MacBooks and narrow desktop windows keep the persistent context', () => {
  assert.equal(shouldRecycleWebGLContextOnTravel({
    maxTouchPoints: 0,
    coarsePointer: false,
    screenWidth: 1512,
    screenHeight: 982,
  }), false);
  assert.equal(shouldRecycleWebGLContextOnTravel({
    maxTouchPoints: 0,
    coarsePointer: false,
    screenWidth: 393,
    screenHeight: 852,
  }), false);
});

test('only the mobile context key changes between zones', () => {
  const park = { antialias: true, postEnabled: true, zone: 'central-park' };
  const office = { ...park, zone: 'consulting-office' };

  assert.equal(webGLContextKey(park, false), webGLContextKey(office, false));
  assert.notEqual(webGLContextKey(park, true), webGLContextKey(office, true));
});

test('the mobile handoff waits for React Three Fiber context cleanup', () => {
  assert.ok(MOBILE_CONTEXT_RECYCLE_DELAY_MS > 500);
});
