import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PING_PONG_PHASE,
  createPingPongRouteState,
  interpolateRouteTurnYaw,
  routeEndpointPauseSeconds,
  routeEndpointTurnSeconds,
  routeTurnProgress,
  stepPingPongRoute,
} from '../src/world/pingPongRoute.js';

test('a route walker pauses, turns smoothly, then walks away from an endpoint', () => {
  const state = createPingPongRouteState({ distance: 9.8, seed: 4 });
  let result = stepPingPongRoute(state, { delta: 0.2, now: 1, length: 10, speed: 2 });
  assert.equal(result.phase, PING_PONG_PHASE.PAUSING);
  assert.equal(state.distance, 10);
  assert.equal(state.direction, 1);

  result = stepPingPongRoute(state, {
    delta: 0.1, now: state.phaseUntil - 0.01, length: 10, speed: 2,
  });
  assert.equal(result.phase, PING_PONG_PHASE.PAUSING);

  result = stepPingPongRoute(state, {
    delta: 0.1, now: state.phaseUntil, length: 10, speed: 2,
  });
  assert.equal(result.phase, PING_PONG_PHASE.TURNING);
  assert.equal(state.direction, -1);
  const halfway = (state.phaseStartedAt + state.phaseUntil) / 2;
  assert.ok(Math.abs(routeTurnProgress(state, halfway) - 0.5) < 1e-9);

  result = stepPingPongRoute(state, {
    delta: 0.1, now: state.phaseUntil, length: 10, speed: 2,
  });
  assert.equal(result.phase, PING_PONG_PHASE.WALKING);
  stepPingPongRoute(state, { delta: 0.25, now: state.phaseStartedAt + 0.25, length: 10, speed: 2 });
  assert.ok(state.distance < 10);
});

test('endpoint timing is restrained, deterministic, and lightly varied', () => {
  const pauses = Array.from({ length: 8 }, (_, index) => routeEndpointPauseSeconds(3, index));
  const turns = Array.from({ length: 8 }, (_, index) => routeEndpointTurnSeconds(3, index));
  assert.ok(pauses.every((seconds) => seconds >= 0.9 && seconds <= 2.2));
  assert.ok(turns.every((seconds) => seconds >= 0.58 && seconds <= 0.92));
  assert.ok(new Set(pauses.map((seconds) => seconds.toFixed(3))).size > 5);
});

test('turn interpolation takes the shortest path across the angle seam', () => {
  const from = Math.PI - 0.1;
  const to = -Math.PI + 0.1;
  const midpoint = interpolateRouteTurnYaw(from, to, 0.5);
  assert.ok(Math.abs(Math.abs(midpoint) - Math.PI) < 1e-9);
});
