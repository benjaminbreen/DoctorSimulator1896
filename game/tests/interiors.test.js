import test from 'node:test';
import assert from 'node:assert/strict';
import { generateInterior, interiorSpec, interiorEntryTransitions, SIZE_CLASSES } from '../src/world/interiors.js';
import { INTERIOR_BUILDINGS } from '../src/world/streetGrid.js';
import { validateBlueprint } from '../src/world/blueprint.js';

test('interior-enabled block exists and spans the classes', () => {
  assert.ok(INTERIOR_BUILDINGS.length >= 4, `expected a block of buildings, got ${INTERIOR_BUILDINGS.length}`);
  const wealths = new Set(INTERIOR_BUILDINGS.map((b) => interiorSpec(b).wealth));
  assert.ok(wealths.has('grand'), 'the Navarro sample provides a grand atrium');
  assert.ok(wealths.has('middling') || wealths.has('humble'), 'the row provides modest houses');
});

test('every generated interior validates and is deterministic', () => {
  for (const building of INTERIOR_BUILDINGS) {
    const a = generateInterior(building);
    const b = generateInterior(building);
    assert.deepEqual(a, b, `${building.id} regenerates identically`);
    const errors = validateBlueprint(a.blueprint);
    assert.deepEqual(errors, [], `${building.id}: ${errors.join('; ')}`);
    assert.ok(a.blueprint.transitions.length === 1, 'one exit back to the street');
    assert.ok(a.lighting.gaslights.length >= 1, 'at least one gaslight');
    assert.ok(a.lighting.windowPortals.length >= 2, 'window light portals exist');
  }
});

test('size scale slider resizes rooms without refactoring', () => {
  const building = INTERIOR_BUILDINGS[0];
  const { size } = interiorSpec(building);
  const base = generateInterior(building).blueprint.dimensions;
  const bigger = generateInterior(building, { [`interiorScale${size}`]: 1.2 }).blueprint.dimensions;
  assert.ok(Math.abs(bigger.width / base.width - 1.2) < 0.02, 'width scales by the slider');
  assert.ok(Math.abs(bigger.depth / base.depth - 1.2) < 0.02, 'depth scales by the slider');
});

// Axis-aligned extent of a yaw-rotated footprint.
function extents(item) {
  const [sx, , sz] = item.size;
  const c = Math.abs(Math.cos(item.yaw ?? 0));
  const s = Math.abs(Math.sin(item.yaw ?? 0));
  return [c * sx + s * sz, s * sx + c * sz];
}

test('furniture stays inside the room and off the door path', () => {
  for (const building of INTERIOR_BUILDINGS) {
    const { blueprint } = generateInterior(building);
    const { width, depth } = blueprint.dimensions;
    const [doorAlong] = blueprint.navigation.defaultSpawn;
    for (const item of blueprint.furniture) {
      const [x, , z] = item.position;
      const [sx, sz] = extents(item);
      assert.ok(Math.abs(x) + sx / 2 <= width / 2 + 0.05, `${building.id}/${item.id} inside width`);
      assert.ok(Math.abs(z) + sz / 2 <= depth / 2 + 0.05, `${building.id}/${item.id} inside depth`);
      // Nothing solid blocks the strip from the door to the spawn point.
      if (item.collider === false) continue;
      const nearDoor = Math.abs(x - doorAlong) < 0.9 + sx / 2 && z > depth / 2 - 3.0;
      assert.ok(!nearDoor, `${building.id}/${item.id} clear of the entry`);
    }
  }
});

test('mouldings stop at openings instead of running through them', () => {
  for (const building of INTERIOR_BUILDINGS) {
    const { blueprint } = generateInterior(building);
    const { depth } = blueprint.dimensions;
    const south = blueprint.walls.find((wall) => wall.id === 'south-wall');
    const trim = blueprint.furniture.filter((item) => /^(skirting|picture|chair|cornice)/.test(item.id));
    assert.ok(trim.length > 0, 'the room is trimmed at all');

    for (const item of trim) {
      // Only members on the street wall can collide with its openings.
      if (Math.abs(item.position[2] - (depth / 2 - 0.14)) > 0.2) continue;
      const [lo, hi] = [item.position[1] - item.size[1] / 2, item.position[1] + item.size[1] / 2];
      const [left, right] = [item.position[0] - item.size[0] / 2, item.position[0] + item.size[0] / 2];
      for (const opening of south.openings) {
        const bottom = opening.center[1] - opening.size[1] / 2;
        const top = opening.center[1] + opening.size[1] / 2;
        if (hi <= bottom || lo >= top) continue;
        const oLeft = opening.center[0] - opening.size[0] / 2;
        const oRight = opening.center[0] + opening.size[0] / 2;
        assert.ok(
          right <= oLeft + 0.01 || left >= oRight - 0.01,
          `${building.id}/${item.id} runs through ${opening.id}`,
        );
      }
    }
  }
});

test('entry triggers sit at the building doors on the street side', () => {
  const transitions = interiorEntryTransitions(INTERIOR_BUILDINGS);
  assert.equal(transitions.length, INTERIOR_BUILDINGS.length);
  for (const [index, transition] of transitions.entries()) {
    const building = INTERIOR_BUILDINGS[index];
    const dx = transition.position[0] - building.position[0];
    const dz = transition.position[1] - building.position[2];
    const reach = Math.hypot(dx, dz);
    assert.ok(reach > 1 && reach < Math.max(building.size[0], building.size[2]) / 2 + 3, `${transition.id} near its building`);
    assert.equal(transition.to.zone, `interior:${building.id}`);
  }
});

test('size classes cover the ladder', () => {
  assert.deepEqual(Object.keys(SIZE_CLASSES), ['S', 'M', 'L', 'XL']);
});
