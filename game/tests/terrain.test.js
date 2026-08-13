import test from 'node:test';
import assert from 'node:assert/strict';
import { terrainHeight, pathsDistance, pondDepth, rockiness, sampleHeights } from '../src/world/terrain.js';
import { POND_OUTLINE, WATER_LEVEL, GATE, parkItems } from '../src/world/centralPark.js';
import { streetItems, STREET_LEVEL } from '../src/world/streetGrid.js';
import { feetAreInWater } from '../src/world/waterContact.js';

test('terrain is deterministic', () => {
  assert.equal(terrainHeight(3.7, -12.2), terrainHeight(3.7, -12.2));
  assert.notEqual(terrainHeight(3.7, -12.2), terrainHeight(-48.1, 24.4));
});

test('the Drive is graded and the Plaza sits level at its height', () => {
  assert.ok(pathsDistance(76, 40) < 0.1, 'point on the Center Drive');
  assert.ok(Math.abs(terrainHeight(76, 40)) < 0.8, 'Drive stays near grade');
  assert.ok(Math.abs(terrainHeight(86, 70) - GATE.height) < 0.25, 'Plaza apron holds its elevation');
});

test('the Pond is carved below water level and its banks stay dry', () => {
  assert.ok(pondDepth(0, 54) < -0.4, 'inside the main lobe');
  assert.ok(terrainHeight(0, 54) < WATER_LEVEL - 0.3, 'lobe bottom sits under the surface');
  assert.ok(pondDepth(22, 30) < -0.4, 'inside the north arm');
  assert.ok(terrainHeight(70, 38) > WATER_LEVEL, 'east bank toward the gate stays dry');
});

test('water contact uses both the authored outline and the player foot height', () => {
  const pond = { outline: POND_OUTLINE, level: WATER_LEVEL };
  assert.equal(feetAreInWater(pond, 0, terrainHeight(0, 54), 54), true);
  assert.equal(feetAreInWater(pond, 0, WATER_LEVEL + 1, 54), false, 'a bridge stays dry');
  assert.equal(feetAreInWater(pond, 70, WATER_LEVEL - 1, 38), false, 'outside the Pond');
});

test('Hallett knoll rises on the peninsula', () => {
  assert.ok(rockiness(2, 28) > 0.6);
  assert.ok(terrainHeight(2, 28) > 0.8);
});

test('park layout is deterministic and populated', () => {
  const trees = parkItems.filter((item) => item.kind === 'tree');
  assert.ok(trees.length > 50, `expected a real tree stock, got ${trees.length}`);
  for (const tree of trees) assert.ok(tree.tree?.trunkH > 0, `${tree.id} carries tree data`);
  for (const id of ['gapstow-deck', 'arsenal', 'dairy-body', 'rail-east-0', 'rail-south-west-0']) {
    assert.ok(parkItems.some((item) => item.id === id), `missing ${id}`);
  }
  const ids = [...parkItems, ...streetItems].map((item) => item.id);
  assert.equal(new Set(ids).size, ids.length, 'item ids are unique across park and streets');
});

test('the street grid is walkable and carries the landmarks', () => {
  assert.ok(Math.abs(terrainHeight(150, 110) - (STREET_LEVEL - 0.03)) < 0.08, 'street grade is level');
  assert.ok(Math.abs(terrainHeight(120, 160) - (STREET_LEVEL - 0.03)) < 0.08, 'south blocks are level');
  for (const id of ['hotel-new-netherland', 'hotel-savoy', 'plaza-hotel-1890', 'metropolitan-club', 'vanderbilt-mansion', 'navarro-flats-a']) {
    assert.ok(streetItems.some((item) => item.id === id), `missing ${id}`);
  }
  const walkable = streetItems.filter((item) => item.kind === 'ground');
  assert.ok(walkable.length >= 18, 'road beds and sidewalks exist');
  for (const id of ['el-station-house', 'el-deck', 'el-stair-1', 'sixth-pole-0-pole']) {
    assert.ok(streetItems.some((item) => item.id === id), `missing ${id}`);
  }
  const stair = streetItems.find((item) => item.id === 'el-stair-1');
  const grade = Math.abs(stair.rotation[2]);
  assert.ok(grade > 0.5 && grade < 0.74, 'El stairs stay inside the climbable slope');
});

test('pond outline is a sane polygon inside the zone', () => {
  assert.ok(POND_OUTLINE.length >= 20);
  for (const [x, z] of POND_OUTLINE) {
    assert.ok(Math.abs(x) <= 100 && Math.abs(z) <= 85, 'outline stays in the zone');
  }
});

test('sampled grid has the expected size', () => {
  assert.equal(sampleHeights(60, 8).length, 81);
});
