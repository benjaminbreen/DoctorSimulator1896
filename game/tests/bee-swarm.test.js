import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BEE_COUNT,
  BEE_FLOWER_PATCHES,
  beeStateAt,
  buildBeeSwarm,
} from '../src/world/beeSwarm.js';
import { floweringCoverItems } from '../src/world/groundCover.js';
import { buildBeeGeometry } from '../src/scene/beeGeometry.js';

test('bee swarm is deterministic and visits every flowering patch', () => {
  const first = buildBeeSwarm();
  assert.deepEqual(first, buildBeeSwarm());
  assert.notDeepEqual(first, buildBeeSwarm(1897));
  assert.equal(first.length, BEE_COUNT);
  assert.equal(BEE_FLOWER_PATCHES.length, floweringCoverItems.length);
  assert.ok(BEE_FLOWER_PATCHES.length > 0);
  assert.deepEqual(
    new Set(first.map((bee) => bee.patch)),
    new Set(BEE_FLOWER_PATCHES.map((_, index) => index)),
  );
});

test('bees remain close to their assigned flowers and repeatedly approach', () => {
  for (const bee of buildBeeSwarm()) {
    let closest = Infinity;
    for (let seconds = 0; seconds <= 160; seconds += 2) {
      const state = beeStateAt(bee, seconds, 1.5);
      assert.ok(Number.isFinite(state.x) && Number.isFinite(state.y) && Number.isFinite(state.z));
      assert.ok(state.distanceFromFlower < 3.3, `${bee.id} wandered ${state.distanceFromFlower}m`);
      closest = Math.min(closest, state.distanceFromFlower);
    }
    assert.ok(closest < 0.7, `${bee.id} never approached its flower`);
  }
});

test('one low-poly bee stays within the ambient-fauna triangle budget', () => {
  const geometry = buildBeeGeometry();
  const positions = geometry.getAttribute('position');
  assert.equal(geometry.getAttribute('aPart').count, positions.count);
  assert.equal(geometry.getAttribute('aWingSide').count, positions.count);
  assert.ok(geometry.getAttribute('aWingSide').array.some((value) => value !== 0));
  assert.ok(positions.count / 3 <= 40);
  geometry.dispose();
});
