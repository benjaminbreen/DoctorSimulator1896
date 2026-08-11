import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { hasModel, modelSize, modelUrl, modelCredit, packModels, packEntry } from '../src/world/modelPacks.js';
import { parkItems, POND_OUTLINE, WATER_LEVEL } from '../src/world/centralPark.js';
import { terrainHeight, pathsDistance } from '../src/world/terrain.js';
import { groundCoverItems } from '../src/world/groundCover.js';
import { generateInterior } from '../src/world/interiors.js';
import { INTERIOR_BUILDINGS } from '../src/world/streetGrid.js';
import { zones } from '../src/world/zones.js';
import { bookcase } from '../src/world/furnishings.js';

const ZONE_BLUEPRINTS = ['consulting-office', 'waiting-room', 'central-park'];

function loadBlueprint(id) {
  return JSON.parse(readFileSync(new URL(`../src/world/${id}.blueprint.json`, import.meta.url)));
}

// Every placement anywhere in the game, from every source of items: authored
// blueprints, the built pieces a zone adds, and the generated interiors.
function allPlacements() {
  const items = [...parkItems];
  for (const id of ZONE_BLUEPRINTS) {
    items.push(...loadBlueprint(id).furniture, ...(zones[id]?.extraItems ?? []));
  }
  for (const building of INTERIOR_BUILDINGS) {
    items.push(...generateInterior(building).blueprint.furniture);
  }
  return items.filter((item) => item.model);
}

test('every placed model resolves to a pack', () => {
  for (const item of allPlacements()) {
    assert.ok(hasModel(item.model), `${item.id}: no pack holds ${item.model}`);
    assert.ok(modelUrl(item.model).endsWith('.glb'), `${item.id}: ${item.model} has a url`);
  }
});

test('placement sizes match the measured model', () => {
  for (const item of allPlacements()) {
    const scale = item.modelScale ?? 1;
    const measured = modelSize(item.model).map(
      (value, axis) => value * (Array.isArray(scale) ? scale[axis] : scale),
    );
    for (const [axis, value] of measured.entries()) {
      // Hand-authored blueprints repeat the size, so drift is worth catching.
      assert.ok(
        Math.abs(item.size[axis] - value) < 0.02,
        `${item.id}: size ${item.size} does not match ${item.model} ${measured}`,
      );
    }
  }
});

// A piece may be enlarged for presence, but never quietly: the manifest has to
// keep the real measurement beside the shipped one.
test('enlarged models record what they really measure', () => {
  for (const pack of ['park', 'props']) {
    for (const name of packModels(pack)) {
      const entry = packEntry(name);
      if (entry.presence === undefined) {
        assert.equal(entry.measured, undefined, `${name}: measured without a presence factor`);
        continue;
      }
      assert.ok(entry.presence > 1, `${name}: presence is an enlargement`);
      assert.ok(Array.isArray(entry.measured), `${name}: enlarged, so it must record its true size`);
      entry.measured.forEach((value, axis) => {
        assert.ok(
          Math.abs(value * entry.presence - entry.size[axis]) < 0.01,
          `${name}: ${value} x ${entry.presence} does not give ${entry.size[axis]}`,
        );
      });
    }
  }
});

// CC-BY needs a credit to travel with the build. A source with no licence, or
// one that reserves rights, must not be converted in the first place.
//
// Non-commercial terms pass: this is a non-commercial educational project, so
// CC-BY-NC is as usable here as CC-BY (see docs/credits.md). Only the absence
// of a redistribution right rules a piece out.
test('converted models carry a redistributable credit', () => {
  const BLOCKED = /copyright|all rights/i;
  for (const pack of ['park', 'props']) {
    for (const name of packModels(pack)) {
      const credit = modelCredit(name);
      assert.ok(credit?.author, `${pack}/${name} has no credit`);
      assert.ok(credit.license, `${pack}/${name} has no licence`);
      assert.ok(!BLOCKED.test(credit.license), `${pack}/${name}: ${credit.license} forbids shipping`);
    }
  }
});

function insidePond(x, z) {
  let inside = false;
  for (let i = 0, j = POND_OUTLINE.length - 1; i < POND_OUTLINE.length; j = i, i += 1) {
    const [xi, zi] = POND_OUTLINE[i];
    const [xj, zj] = POND_OUTLINE[j];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

test('park dressing stands on dry ground', () => {
  const props = parkItems.filter((item) => item.model);
  assert.ok(props.length >= 20, `expected a dressed park, got ${props.length}`);
  for (const item of props) {
    const [x, , z] = item.position;
    assert.equal(item.position[1], 0, `${item.id} sits on the ground`);
    assert.ok(!insidePond(x, z), `${item.id} stands in the water`);
    assert.ok(terrainHeight(x, z) > WATER_LEVEL, `${item.id} sits below water level`);
  }
});

// The scatter reads the terrain masks rather than a hand-placed list, so what
// needs guarding is that it keeps off the water and the walks, and stays decor.
test('ground cover keeps off the walks and out of the pond', () => {
  assert.ok(groundCoverItems.length > 400, `expected a planted park, got ${groundCoverItems.length}`);
  for (const item of groundCoverItems) {
    const [x, , z] = item.position;
    assert.equal(item.collider, false, `${item.id} is decor, not something to bump into`);
    assert.ok(!insidePond(x, z), `${item.id} grows in the water`);
    assert.ok(terrainHeight(x, z) > WATER_LEVEL, `${item.id} sits below water level`);
    assert.ok(pathsDistance(x, z) >= 1.9, `${item.id} stands in a walk`);
  }
});

test('a bookcase shelves its books, on the boards and inside the carcass', () => {
  const width = 2;
  const depth = 0.45;
  const items = bookcase('case', 0, 0, 0, { width, height: 2.5, depth });
  const boards = items.filter((item) => !item.model);
  const books = items.filter((item) => item.model);
  assert.ok(boards.length >= 8, `carcass and shelves, got ${boards.length}`);
  assert.ok(books.length > 40, `shelves filled, got ${books.length}`);

  const shelfTops = boards
    .filter((item) => /-(plinth|shelf-)/.test(item.id))
    .map((item) => item.position[1] + item.size[1] / 2);
  for (const book of books) {
    // Standing on a board, not floating between them.
    assert.ok(
      shelfTops.some((top) => Math.abs(book.position[1] - top) < 0.01),
      `${book.id} stands on a shelf`,
    );
    // Inside the carcass, front to back and end to end.
    const [sx, , sz] = modelSize(book.model);
    assert.ok(Math.abs(book.position[0]) + sz / 2 <= width / 2, `${book.id} within the width`);
    assert.ok(Math.abs(book.position[2]) + sx / 2 <= depth / 2, `${book.id} within the depth`);
  }
});

test('the perimeter railing closes its runs without gaps', () => {
  const section = modelSize('metal_and_concrete_guardrail_8_MB')[0];
  for (const prefix of ['rail-east', 'rail-south-east', 'rail-south-west']) {
    const run = parkItems.filter((item) => item.id.startsWith(`${prefix}-`));
    assert.ok(run.length >= 3, `${prefix} has sections`);
    // Neighbours must be no further apart than one section is long.
    for (let i = 1; i < run.length; i += 1) {
      const [ax, , az] = run[i - 1].position;
      const [bx, , bz] = run[i].position;
      assert.ok(Math.hypot(bx - ax, bz - az) <= section + 0.01, `${prefix}: gap at ${i}`);
    }
  }
});
