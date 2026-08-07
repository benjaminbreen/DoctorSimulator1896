import test from 'node:test';
import assert from 'node:assert/strict';
import { terrainHeight, pathsDistance, pondDepth, sampleHeights } from '../src/world/terrain.js';
import { POND_OUTLINE, WATER_LEVEL, parkItems } from '../src/world/centralPark.js';

test('terrain is deterministic', () => {
  assert.equal(terrainHeight(3.7, -12.2), terrainHeight(3.7, -12.2));
  assert.notEqual(terrainHeight(3.7, -12.2), terrainHeight(-48.1, 24.4));
});

test('the Drive and the gate apron are graded level', () => {
  assert.ok(pathsDistance(62, 26) < 0.1, 'point on the Drive');
  assert.ok(Math.abs(terrainHeight(62, 26)) < 0.15, 'Drive is level');
  assert.ok(Math.abs(terrainHeight(64, 56)) < 0.15, 'gate apron is level');
});

test('the Pond is carved below water level', () => {
  assert.ok(pondDepth(-30, 24) < -0.5, 'deep in the west lobe');
  assert.ok(terrainHeight(-30, 24) < WATER_LEVEL - 0.3, 'bottom sits under the surface');
  assert.ok(terrainHeight(24, 40) > WATER_LEVEL, 'south bank stays dry');
});

test('park layout is deterministic and populated', () => {
  const trees = parkItems.filter((item) => item.kind === 'tree');
  assert.ok(trees.length > 40, `expected a real tree stock, got ${trees.length}`);
  assert.ok(parkItems.some((item) => item.id === 'gapstow-deck'));
  assert.ok(parkItems.some((item) => item.id === 'arsenal'));
  const ids = parkItems.map((item) => item.id);
  assert.equal(new Set(ids).size, ids.length, 'item ids are unique');
});

test('pond outline is a sane polygon', () => {
  assert.ok(POND_OUTLINE.length >= 12);
  for (const [x, z] of POND_OUTLINE) {
    assert.ok(Math.abs(x) <= 80 && Math.abs(z) <= 70, 'outline stays in the zone');
  }
});

test('sampled grid has the expected size', () => {
  assert.equal(sampleHeights(60, 8).length, 81);
});
