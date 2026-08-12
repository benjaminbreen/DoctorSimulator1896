import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PIGEON_ACTIVE_SECONDS,
  PIGEON_COUNT,
  SOLO_PIGEON_COUNT,
  SOLO_PIGEON_ROUTES,
  buildPigeonFlock,
  buildSoloPigeons,
  pigeonCycleState,
  pigeonStateAt,
  soloPigeonStateAt,
} from '../src/world/pigeonFlock.js';
import { buildPigeonGeometry } from '../src/scene/pigeonGeometry.js';

test('pigeon formation is deterministic, bounded, and uses both routes', () => {
  const first = buildPigeonFlock(1896);
  const second = buildPigeonFlock(1896);
  assert.deepEqual(first, second);
  assert.notDeepEqual(first, buildPigeonFlock(1897));
  assert.equal(first.length, PIGEON_COUNT);
  assert.deepEqual(new Set(first.map((bird) => bird.route)), new Set([0, 1]));
  for (const bird of first) {
    assert.ok(Math.abs(bird.offsetX) < 6);
    assert.ok(bird.offsetZ <= 0 && bird.offsetZ > -5);
    assert.ok(bird.scale >= 0.7 && bird.scale <= 1);
  }
});

test('the two flights alternate with a short quiet interval', () => {
  assert.equal(pigeonCycleState(4, 0).active, true);
  assert.equal(pigeonCycleState(4, 1).active, false);
  assert.equal(pigeonCycleState(32, 0).active, false);
  assert.equal(pigeonCycleState(32, 1).active, false);
  assert.equal(pigeonCycleState(40, 0).active, false);
  assert.equal(pigeonCycleState(40, 1).active, true);
});

test('continuous preview keeps both routes active', () => {
  for (const time of [0, 28, 55, 1000]) {
    assert.equal(pigeonCycleState(time, 0, true).active, true);
    assert.equal(pigeonCycleState(time, 1, true).active, true);
  }
});

test('active pigeons cross the playable park at a safe sky height', () => {
  const birds = buildPigeonFlock();
  for (const route of [0, 1]) {
    const bird = birds.find((candidate) => candidate.route === route);
    const routeStart = route === 0 ? 0 : 36;
    const state = pigeonStateAt(bird, routeStart + PIGEON_ACTIVE_SECONDS / 2);
    assert.equal(state.active, true);
    assert.ok(Number.isFinite(state.x) && Number.isFinite(state.y) && Number.isFinite(state.z));
    assert.ok(state.x > -100 && state.x < 100, `route ${route} x ${state.x}`);
    assert.ok(state.z > -85 && state.z < 85, `route ${route} z ${state.z}`);
    assert.ok(state.y > 25 && state.y < 50, `route ${route} y ${state.y}`);
  }
});

test('two solo pigeons take independent lower routes', () => {
  const birds = buildSoloPigeons();
  assert.equal(birds.length, SOLO_PIGEON_COUNT);
  assert.deepEqual(new Set(birds.map((bird) => bird.route)), new Set([0, 1]));
  for (const bird of birds) {
    const route = SOLO_PIGEON_ROUTES[bird.route];
    const state = soloPigeonStateAt(bird, route.duration / 2 - route.offset);
    assert.equal(state.active, true);
    assert.ok(state.x > -100 && state.x < 100, `solo ${bird.route} x ${state.x}`);
    assert.ok(state.z > -85 && state.z < 85, `solo ${bird.route} z ${state.z}`);
    assert.ok(state.y > 10 && state.y < 25, `solo ${bird.route} y ${state.y}`);
  }
});

test('one low-poly pigeon stays within the ambient-fauna triangle budget', () => {
  const geometry = buildPigeonGeometry();
  assert.equal(geometry.getAttribute('aWingSide').count, geometry.getAttribute('position').count);
  assert.ok(geometry.getAttribute('aWingSide').array.some((value) => value !== 0));
  assert.ok(geometry.getAttribute('position').count / 3 <= 20);
  geometry.dispose();
});
