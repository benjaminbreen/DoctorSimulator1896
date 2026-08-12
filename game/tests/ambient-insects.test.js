import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BUTTERFLY_COUNT,
  BUTTERFLY_PATCHES,
  buildButterflies,
  butterflyActivity,
  butterflyStateAt,
} from '../src/world/butterflies.js';
import {
  FIREFLY_COUNT,
  FIREFLY_PATCHES,
  buildFireflies,
  fireflyActivity,
} from '../src/world/fireflies.js';
import { buildButterflyGeometry } from '../src/scene/butterflyGeometry.js';

test('butterflies peak from nine through four and taper toward dusk', () => {
  assert.equal(butterflyActivity(7), 0);
  assert.equal(butterflyActivity(9), 1);
  assert.equal(butterflyActivity(12), 1);
  assert.equal(butterflyActivity(16), 1);
  assert.ok(butterflyActivity(17) > 0 && butterflyActivity(17) < 1);
  assert.equal(butterflyActivity(19), 0);
});

test('butterflies are deterministic and remain near flowering cover', () => {
  const first = buildButterflies();
  assert.deepEqual(first, buildButterflies());
  assert.notDeepEqual(first, buildButterflies(1897));
  assert.equal(first.length, BUTTERFLY_COUNT);
  assert.ok(BUTTERFLY_PATCHES.length > 0);
  for (const butterfly of first) {
    const state = butterflyStateAt(butterfly, 25);
    assert.ok(Number.isFinite(state.x) && Number.isFinite(state.y) && Number.isFinite(state.z));
    assert.ok(state.distanceFromFlower < 6, `${butterfly.id} wandered ${state.distanceFromFlower}m`);
  }
});

test('one butterfly remains within its ambient-fauna triangle budget', () => {
  const geometry = buildButterflyGeometry();
  const positions = geometry.getAttribute('position');
  assert.equal(geometry.getAttribute('aWingSide').count, positions.count);
  assert.equal(geometry.getAttribute('aPart').count, positions.count);
  assert.ok(positions.count / 3 <= 12);
  geometry.dispose();
});

test('fireflies replace butterflies at dusk and stay active at night', () => {
  assert.equal(fireflyActivity(16), 0);
  assert.equal(fireflyActivity(18), 0);
  assert.ok(fireflyActivity(19) > 0 && fireflyActivity(19) < 1);
  assert.ok(fireflyActivity(19.5) > 0.9);
  assert.equal(fireflyActivity(21), 1);
});

test('firefly point data is deterministic and covers every flower patch', () => {
  const first = buildFireflies();
  assert.deepEqual(first, buildFireflies());
  assert.notDeepEqual(first, buildFireflies(1897));
  assert.equal(first.length, FIREFLY_COUNT);
  assert.ok(FIREFLY_PATCHES.length > 0);
  assert.deepEqual(
    new Set(first.map((firefly) => firefly.patch)),
    new Set(FIREFLY_PATCHES.map((_, index) => index)),
  );
});
