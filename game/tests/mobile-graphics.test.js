import test from 'node:test';
import assert from 'node:assert/strict';
import {
  graphicsSettingsForDevice,
  isSafariUserAgent,
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
  assert.ok(MOBILE_CONTEXT_RECYCLE_DELAY_MS >= 1500);
});

test('constrained mobile graphics avoid the destination allocation spike', () => {
  const authored = {
    antialias: true,
    postEnabled: true,
    pixelRatioCap: 2,
    shadowMapSize: '2048',
  };

  assert.deepEqual(graphicsSettingsForDevice(authored, true), {
    antialias: false,
    postEnabled: false,
    pixelRatioCap: 1.25,
    maxShadowMapSize: 1024,
    maxOutdoorShadowDistance: 30,
    deferIdleActors: true,
  });
  assert.deepEqual(graphicsSettingsForDevice(authored, false), {
    antialias: true,
    postEnabled: true,
    pixelRatioCap: 2,
    maxShadowMapSize: Infinity,
    maxOutdoorShadowDistance: Infinity,
    deferIdleActors: false,
  });
});

test('desktop Safari caps Retina rendering without disabling effects', () => {
  const authored = {
    antialias: true,
    postEnabled: true,
    pixelRatioCap: 2,
  };

  assert.deepEqual(graphicsSettingsForDevice(authored, false, true), {
    antialias: true,
    postEnabled: true,
    pixelRatioCap: 1.5,
    maxShadowMapSize: 2048,
    maxOutdoorShadowDistance: Infinity,
    deferIdleActors: false,
  });
  assert.equal(isSafariUserAgent(
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/18.6 Safari/605.1.15',
  ), true);
  assert.equal(isSafariUserAgent(
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/139.0.0.0 Safari/537.36',
  ), false);
  assert.equal(isSafariUserAgent(
    'Mozilla/5.0 (iPhone) AppleWebKit/605.1.15 FxiOS/141.0 Mobile/15E148 Safari/605.1.15',
  ), false);
});
