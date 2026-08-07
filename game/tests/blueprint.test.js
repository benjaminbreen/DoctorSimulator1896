import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { deriveRoom, deriveWallBoxes, validateBlueprint } from '../src/world/blueprint.js';

function loadBlueprint(id) {
  return JSON.parse(readFileSync(new URL(`../src/world/${id}.blueprint.json`, import.meta.url), 'utf8'));
}

const ZONE_IDS = ['consulting-office', 'waiting-room', 'central-park'];
const blueprint = loadBlueprint('consulting-office');

test('every zone blueprint validates', () => {
  for (const id of ZONE_IDS) {
    assert.deepEqual(validateBlueprint(loadBlueprint(id)), [], id);
  }
});

test('exterior zone derives ground, boundary, and no ceiling', () => {
  const park = deriveRoom(loadBlueprint('central-park'));
  assert.equal(park.exterior, true);
  assert.equal(park.ceiling, null);
  assert.equal(park.wallBoxes.length, 0);
  assert.equal(park.blockerBoxes.length, 4);
  assert.equal(park.windowHoles.length, 0);
  const bounds = park.blockerBoxes.map((box) => box.id).sort();
  assert.deepEqual(bounds, ['bounds-east', 'bounds-north', 'bounds-south', 'bounds-west']);
});

test('transitions point at real zones and land inside them', () => {
  const outlines = Object.fromEntries(ZONE_IDS.map((id) => [id, loadBlueprint(id).outline]));
  for (const id of ZONE_IDS) {
    for (const transition of loadBlueprint(id).transitions ?? []) {
      assert.ok(ZONE_IDS.includes(transition.to.zone), `${id}/${transition.id}: unknown target zone`);
      const [x, , z] = transition.to.spawn;
      const target = outlines[transition.to.zone];
      const inside =
        x >= Math.min(...target.map((p) => p[0])) &&
        x <= Math.max(...target.map((p) => p[0])) &&
        z >= Math.min(...target.map((p) => p[1])) &&
        z <= Math.max(...target.map((p) => p[1]));
      assert.ok(inside, `${id}/${transition.id}: spawn lands outside ${transition.to.zone}`);
    }
  }
});

test('arrival spawns land outside the target zone triggers', () => {
  // A spawn inside a reciprocal trigger lets a double-tapped E bounce the
  // player straight back through the door.
  for (const id of ZONE_IDS) {
    for (const transition of loadBlueprint(id).transitions ?? []) {
      const [x, , z] = transition.to.spawn;
      for (const target of loadBlueprint(transition.to.zone).transitions ?? []) {
        const distance = Math.hypot(x - target.position[0], z - target.position[1]);
        assert.ok(
          distance > target.radius,
          `${id}/${transition.id}: spawn sits inside ${transition.to.zone}/${target.id}`,
        );
      }
    }
  }
});

test('every zone with a way in has a way back', () => {
  const reachable = new Set();
  for (const id of ZONE_IDS) {
    for (const transition of loadBlueprint(id).transitions ?? []) reachable.add(transition.to.zone);
  }
  for (const id of ZONE_IDS) {
    if (!reachable.has(id)) continue;
    const exits = loadBlueprint(id).transitions ?? [];
    assert.ok(exits.length > 0, `${id} can be entered but not left`);
  }
});

test('interior zones keep their ceiling and walls', () => {
  const waiting = deriveRoom(loadBlueprint('waiting-room'));
  assert.equal(waiting.exterior, false);
  assert.ok(waiting.ceiling);
  assert.ok(waiting.wallBoxes.length > 0);
  assert.equal(waiting.windowHoles.length, 11);
  assert.equal(waiting.blockerBoxes.length, 2);
});

test('derived wall segments tile the full wall length', () => {
  for (const wall of blueprint.walls) {
    const axis = wall.size[0] >= wall.size[2] ? 0 : 2;
    const { boxes } = deriveWallBoxes(wall);
    const fullHeight = boxes.filter((box) => box.size[1] === wall.size[1]);
    const segmentTotal = fullHeight.reduce((sum, box) => sum + box.size[axis], 0);
    const openingTotal = (wall.openings ?? []).reduce((sum, opening) => sum + opening.size[0], 0);
    assert.ok(
      Math.abs(segmentTotal + openingTotal - wall.size[axis]) < 1e-6,
      `${wall.id}: segments + openings should equal wall length`,
    );
  }
});

test('openings produce headers, sills, holes, and blockers', () => {
  const room = deriveRoom(blueprint);
  const windows = blueprint.walls.flatMap((wall) => wall.openings.filter((o) => o.type === 'window'));
  const doors = blueprint.walls.flatMap((wall) => wall.openings.filter((o) => o.type === 'door'));
  assert.equal(room.windowHoles.length, windows.length);
  assert.equal(room.blockerBoxes.length, doors.filter((door) => door.blocked).length);
  const headers = room.wallBoxes.filter((box) => box.id.endsWith(':header'));
  assert.equal(headers.length, windows.length + doors.length);
  const sills = room.wallBoxes.filter((box) => box.id.endsWith(':sill'));
  assert.equal(sills.length, windows.length);
});

test('window normals point out of the room', () => {
  const room = deriveRoom(blueprint);
  const north = room.windowHoles.find((hole) => hole.id === 'window-north-1');
  const west = room.windowHoles.find((hole) => hole.id === 'window-west-1');
  assert.deepEqual(north.normal, [0, 0, -1]);
  assert.deepEqual(west.normal, [-1, 0, 0]);
});

test('validation rejects an opening wider than its wall', () => {
  const broken = structuredClone(blueprint);
  broken.walls[0].openings[0].size = [9, 1.95];
  assert.ok(validateBlueprint(broken).some((error) => error.includes('exceeds wall length')));
});

test('validation rejects a spawn outside the outline', () => {
  const broken = structuredClone(blueprint);
  broken.navigation.defaultSpawn = [12, 0, 0];
  assert.ok(validateBlueprint(broken).some((error) => error.includes('defaultSpawn')));
});
