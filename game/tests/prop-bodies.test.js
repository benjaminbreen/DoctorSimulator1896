import test from 'node:test';
import assert from 'node:assert/strict';
import { itemBoxes, boxDensity, rotateOffset } from '../src/physics/propBodies.js';
import { modelSize, looseMass } from '../src/world/victorianCatalog.js';
import { generateInterior } from '../src/world/interiors.js';
import { INTERIOR_BUILDINGS } from '../src/world/streetGrid.js';

test('a placeholder box gets one collider at its own centre', () => {
  const boxes = itemBoxes({ id: 'desk', size: [1.6, 0.76, 0.9] });
  assert.equal(boxes.length, 1);
  assert.deepEqual(boxes[0].center, [0, 0, 0]);
  assert.deepEqual(boxes[0].half, [0.8, 0.38, 0.45]);
});

test('a table gets a slab and four legs inside its footprint', () => {
  const [sx, sy, sz] = modelSize('Table_02');
  const boxes = itemBoxes({ id: 't', model: 'Table_02', size: [sx, sy, sz] });
  assert.equal(boxes.length, 5);
  for (const box of boxes) {
    assert.ok(Math.abs(box.center[0]) + box.half[0] <= sx / 2 + 1e-6, 'inside width');
    assert.ok(Math.abs(box.center[2]) + box.half[2] <= sz / 2 + 1e-6, 'inside depth');
    assert.ok(box.center[1] - box.half[1] >= -1e-6, 'above the floor');
    assert.ok(box.center[1] + box.half[1] <= sy + 1e-6, 'below the top');
  }
  // The slab reaches the top; the space under it is open.
  const slab = boxes[0];
  assert.ok(Math.abs(slab.center[1] + slab.half[1] - sy) < 1e-6);
});

test('a model without a compound falls back to its footprint, base at the floor', () => {
  const boxes = itemBoxes({ id: 'f', model: 'Fireplace', size: [2.04, 1.96, 0.79] });
  assert.equal(boxes.length, 1);
  assert.ok(Math.abs(boxes[0].center[1] - 0.98) < 1e-6);
});

test('density scales to the intended mass', () => {
  const boxes = [{ center: [0, 0, 0], half: [0.5, 0.5, 0.5] }];
  assert.equal(boxDensity(boxes, 10), 10);
  assert.equal(boxDensity([], 10), 1);
});

test('offsets rotate with the item', () => {
  const [x, y, z] = rotateOffset([1, 0, 2], [1, 0.5, 0], Math.PI / 2);
  assert.ok(Math.abs(x - 1) < 1e-9);
  assert.equal(y, 0.5);
  assert.ok(Math.abs(z - 1) < 1e-9);
});

test('generated interiors make loose seating dynamic and nothing raised', () => {
  let dynamic = 0;
  for (const building of INTERIOR_BUILDINGS) {
    const { blueprint } = generateInterior(building);
    for (const item of blueprint.furniture) {
      if (!item.dynamic) continue;
      dynamic += 1;
      assert.ok(item.mass > 0, `${item.id} has a mass`);
      assert.equal(item.mass, looseMass(item.model), `${item.id} takes the catalog mass`);
      assert.equal(item.position[1], 0, `${item.id} stands on the floor`);
      assert.notEqual(item.collider, false, `${item.id} is solid`);
    }
  }
  assert.ok(dynamic > 0, 'some pieces are loose');
});

test('nothing is left standing on a loose piece', () => {
  for (const building of INTERIOR_BUILDINGS) {
    const { blueprint } = generateInterior(building);
    const loose = blueprint.furniture.filter((item) => item.dynamic);
    for (const item of blueprint.furniture) {
      if (item.position[1] < 0.2) continue;
      for (const base of loose) {
        // Resting on it, not merely above it: a chandelier over the table is
        // hung from the ceiling.
        const resting =
          Math.abs(item.position[0] - base.position[0]) < 0.3 &&
          Math.abs(item.position[2] - base.position[2]) < 0.3 &&
          Math.abs(item.position[1] - base.size[1]) < 0.25;
        assert.ok(!resting, `${building.id}/${item.id} rests on loose ${base.id}`);
      }
    }
  }
});
