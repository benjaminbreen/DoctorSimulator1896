import test from 'node:test';
import assert from 'node:assert/strict';
import { blueprintMouldings, friezeBand, ceilingPanel, pictureRailHeight, mix } from '../src/world/mouldings.js';
import consulting from '../src/world/consulting-office.blueprint.json' with { type: 'json' };
import waiting from '../src/world/waiting-room.blueprint.json' with { type: 'json' };

const idsOf = (items) => new Set(items.map((item) => item.id.split('-').slice(0, 2).join('-')));

test('every wall gets skirting, picture rail and cornice', () => {
  const items = blueprintMouldings(consulting);
  const kinds = idsOf(items);
  for (const kind of ['skirting-cap', 'picture-rail', 'picture-bead', 'cornice-bed']) {
    assert.ok(kinds.has(kind), `missing ${kind}`);
  }
  assert.ok(items.length > 20);
});

test('the dado is opt-in', () => {
  assert.ok(!idsOf(blueprintMouldings(consulting)).has('chair-rail'));
  assert.ok(idsOf(blueprintMouldings(consulting, { dado: true })).has('chair-rail'));
});

test('a moulding breaks at any opening it would run into', () => {
  const items = blueprintMouldings(waiting, { dado: true });
  for (const wall of waiting.walls) {
    const onWall = items.filter((item) => item.id.includes(`-${wall.id}-`));
    for (const item of onWall) {
      const low = item.position[1] - item.size[1] / 2;
      const high = item.position[1] + item.size[1] / 2;
      for (const opening of wall.openings ?? []) {
        const bottom = opening.center[1] - opening.size[1] / 2;
        const top = opening.center[1] + opening.size[1] / 2;
        if (high <= bottom || low >= top) continue;
        const left = item.position[0] - item.size[0] / 2;
        const right = item.position[0] + item.size[0] / 2;
        assert.ok(
          right <= opening.center[0] - opening.size[0] / 2 + 1e-6 ||
            left >= opening.center[0] + opening.size[0] / 2 - 1e-6,
          `${item.id} crosses ${opening.id}`,
        );
      }
    }
  }
});

test('the picture rail is hung above the window heads', () => {
  const items = blueprintMouldings(waiting);
  const heads = waiting.walls.flatMap((wall) =>
    (wall.openings ?? [])
      .filter((opening) => opening.type === 'window')
      .map((opening) => opening.center[1] + opening.size[1] / 2),
  );
  const rail = items.find((item) => item.id.startsWith('picture-rail-'));
  assert.ok(rail.position[1] > Math.max(...heads));
  assert.ok(rail.position[1] < waiting.dimensions.ceiling - 0.4);
});

test('skirting clears a window with a raised sill but not a door', () => {
  const items = blueprintMouldings(consulting);
  const south = consulting.walls.find((wall) => wall.id === 'south-wall');
  const doors = south.openings.filter((opening) => opening.type === 'door');
  const skirting = items.filter((item) => item.id.startsWith('skirting-south-wall'));
  // The window's sill is at 0.8m, well above the skirting, so the run is
  // unbroken there; a door reaches the floor and must break it.
  for (const board of skirting) {
    const left = board.position[0] - board.size[0] / 2;
    const right = board.position[0] + board.size[0] / 2;
    for (const door of doors) {
      assert.ok(
        right <= door.center[0] - door.size[0] / 2 + 1e-6 || left >= door.center[0] + door.size[0] / 2 - 1e-6,
        'skirting runs through the door',
      );
    }
  }
  // Two doors — waiting room and study — cut the wall into three runs.
  assert.equal(skirting.length, doors.length + 1);
});

test('trim stands inside the room, not inside the wall', () => {
  const items = blueprintMouldings(waiting);
  const { width, depth } = waiting.dimensions;
  for (const item of items) {
    assert.ok(Math.abs(item.position[0]) < width / 2, `${item.id} outside the room in x`);
    assert.ok(Math.abs(item.position[2]) < depth / 2, `${item.id} outside the room in z`);
  }
});

test('the cornice sits just under the ceiling', () => {
  const items = blueprintMouldings(consulting);
  const cornice = items.filter((item) => item.id.startsWith('cornice-'));
  assert.ok(cornice.length > 0);
  for (const item of cornice) {
    assert.ok(item.position[1] > consulting.dimensions.ceiling - 0.4);
    assert.ok(item.position[1] < consulting.dimensions.ceiling);
  }
});

test('nothing collides', () => {
  for (const item of blueprintMouldings(waiting, { dado: true })) {
    assert.equal(item.collider, false);
  }
});

test('the frieze fills the wall between picture rail and cornice', () => {
  const band = friezeBand(waiting, { wall: '#94836a', ceiling: '#f2f3f0' });
  assert.ok(band.length >= waiting.walls.length);
  const rail = pictureRailHeight(waiting);
  for (const item of band) {
    const low = item.position[1] - item.size[1] / 2;
    const high = item.position[1] + item.size[1] / 2;
    assert.ok(low >= rail, 'frieze starts below the picture rail');
    assert.ok(high < waiting.dimensions.ceiling, 'frieze runs into the ceiling');
  }
});

test('the frieze is lighter than the wall it sits above', () => {
  const [band] = friezeBand(waiting, { wall: '#3a3a2a', ceiling: '#f2f3f0' });
  const value = (hex) => parseInt(hex.slice(1, 3), 16) + parseInt(hex.slice(3, 5), 16) + parseInt(hex.slice(5), 16);
  assert.ok(value(band.color) > value('#3a3a2a'));
});

test('the ceiling panel is a border, not a slab', () => {
  const runs = ceilingPanel(waiting, { ceiling: '#f2f3f0', inset: 2.2 });
  assert.equal(runs.length, 4);
  for (const run of runs) {
    // One run is long and thin, never both dimensions at once.
    const thin = Math.min(run.size[0], run.size[2]);
    assert.ok(thin < 0.3, `${run.id} is not a moulding run`);
    assert.ok(run.position[1] < waiting.dimensions.ceiling);
  }
});

test('a room too small for a border gets none', () => {
  assert.deepEqual(ceilingPanel(waiting, { inset: 9 }), []);
});

test('mix walks from one colour to the other', () => {
  assert.equal(mix('#000000', '#ffffff', 0), '#000000');
  assert.equal(mix('#000000', '#ffffff', 1), '#ffffff');
  assert.equal(mix('#000000', '#ffffff', 0.5), '#808080');
});
