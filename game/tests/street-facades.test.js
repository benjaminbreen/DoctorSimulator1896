import test from 'node:test';
import assert from 'node:assert/strict';
import { facadeWindowAt } from '../src/world/projectileImpacts.js';
import { facadeLayout, facadeWidth, FACES } from '../src/world/facade.js';
import { streetItems } from '../src/world/streetGrid.js';

const ROWS = [
  ['fifth-east-a', 'x', '-x'],
  ['fifth-east-b', 'x', '-x'],
  ['cps-south-a', 'z', '-z'],
  ['cps-south-b', 'z', '-z'],
  ['fifty-eighth-n', 'z', '+z'],
  ['fifty-eighth-s', 'z', '-z'],
  ['madison-west', 'x', '+x'],
  ['madison-east', 'x', '-x'],
  ['sixth-west', 'x', '+x'],
  ['block-a-inner', 'z', '-z'],
  ['sixtieth-south-block', 'z', '-z'],
];

const NAMED_BUILDINGS = new Map([
  ['hotel-new-netherland', 'New Netherland Hotel'],
  ['hotel-savoy', 'Hotel Savoy'],
  ['plaza-hotel-1890', 'The Plaza Hotel (1890)'],
  ['metropolitan-club', 'Metropolitan Club'],
  ['vanderbilt-mansion', 'Cornelius Vanderbilt II Mansion'],
  ['navarro-flats-a', 'Navarro Flats'],
  ['navarro-flats-b', 'Navarro Flats'],
  ['navarro-flats-c', 'Navarro Flats'],
]);

function rowBuildings(prefix) {
  return streetItems
    .filter((item) => item.kind === 'backdrop' && item.id.startsWith(`${prefix}-`))
    .sort((a, b) => Number(a.id.slice(prefix.length + 1)) - Number(b.id.slice(prefix.length + 1)));
}

function windowCenter(building, token, win) {
  const face = FACES[token];
  const [cx, cy, cz] = building.position;
  const [sx, sy, sz] = building.size;
  const width = facadeWidth(building.size, token);
  const layout = facadeLayout(width, sy);
  const halfDepth = face.normal[2] !== 0 ? sz / 2 : sx / 2;
  const u = (win.x + win.w / 2) / layout.texW;
  return [
    cx + face.right[0] * (u - 0.5) * width + face.normal[0] * halfDepth,
    cy + sy / 2 - ((win.y + win.h / 2) / layout.texH) * sy,
    cz + face.right[2] * (u - 0.5) * width + face.normal[2] * halfDepth,
  ];
}

test('procedural sash openings keep period proportions and a raised street sill', () => {
  const layout = facadeLayout(7.5, 14);
  const upper = layout.upper[0];
  const ground = layout.ground.find((entry) => !entry.isDoor);

  assert.deepEqual([upper.w, upper.h], [18, 28]);
  assert.deepEqual([ground.w, ground.h], [18, 28]);
  assert.equal(ground.y + ground.h, layout.texH - 20);
  assert.equal(layout.ground.find((entry) => entry.isDoor).doorW, 24);
});

test('parcel rows detail exposed ends but retain plain internal party walls', () => {
  let exposedEnds = 0;
  for (const [prefix, axis, streetFace] of ROWS) {
    const row = rowBuildings(prefix);
    assert.ok(row.length >= 2, `${prefix} has a real row`);
    const rearFace = { '+x': '-x', '-x': '+x', '+z': '-z', '-z': '+z' }[streetFace];
    const [startFace, endFace] = axis === 'z' ? ['-x', '+x'] : ['-z', '+z'];
    assert.deepEqual(row[0].windowFaces, [streetFace, rearFace, startFace], `${prefix} start end`);
    assert.deepEqual(row.at(-1).windowFaces, [streetFace, rearFace, endFace], `${prefix} finish end`);
    for (const parcel of row.slice(1, -1)) {
      assert.deepEqual(parcel.windowFaces, [streetFace, rearFace], `${parcel.id} keeps party walls blank`);
    }
    exposedEnds += row[0].windowFaces.length - 2;
    exposedEnds += row.at(-1).windowFaces.length - 2;
  }
  assert.equal(exposedEnds, ROWS.length * 2);
});

test('an exposed end uses its centered ground bay as a window, not a second door', () => {
  const building = rowBuildings('cps-south-b').at(-1);
  const token = building.windowFaces.at(-1);
  const layout = facadeLayout(facadeWidth(building.size, token), building.size[1]);
  const centerBay = layout.ground.find((entry) => entry.isDoor);
  const pane = facadeWindowAt(windowCenter(building, token, centerBay), [building]);
  assert.ok(pane);
  assert.equal(pane.id, `${building.id}:${token}:ground:${centerBay.col}`);
});

function wallFaces(building) {
  const [x, y, z] = building.position;
  const [sx, sy, sz] = building.size;
  const y0 = y - sy / 2;
  const y1 = y + sy / 2;
  return [
    { axis: 'x', plane: x - sx / 2, lo: z - sz / 2, hi: z + sz / 2, y0, y1 },
    { axis: 'x', plane: x + sx / 2, lo: z - sz / 2, hi: z + sz / 2, y0, y1 },
    { axis: 'z', plane: z - sz / 2, lo: x - sx / 2, hi: x + sx / 2, y0, y1 },
    { axis: 'z', plane: z + sz / 2, lo: x - sx / 2, hi: x + sx / 2, y0, y1 },
  ];
}

test('separate building masses do not render overlapping coplanar walls', () => {
  const buildings = streetItems.filter((item) => item.kind === 'backdrop');
  for (let first = 0; first < buildings.length; first += 1) {
    for (let second = first + 1; second < buildings.length; second += 1) {
      for (const wallA of wallFaces(buildings[first])) {
        for (const wallB of wallFaces(buildings[second])) {
          if (wallA.axis !== wallB.axis || Math.abs(wallA.plane - wallB.plane) > 1e-5) continue;
          const sharedRun = Math.min(wallA.hi, wallB.hi) - Math.max(wallA.lo, wallB.lo);
          const sharedHeight = Math.min(wallA.y1, wallB.y1) - Math.max(wallA.y0, wallB.y0);
          assert.ok(
            sharedRun <= 1e-5 || sharedHeight <= 1e-5,
            `${buildings[first].id} and ${buildings[second].id} overlap on a coplanar wall`,
          );
        }
      }
    }
  }
});

test('authored landmarks carry click labels while procedural rows remain anonymous', () => {
  for (const [id, label] of NAMED_BUILDINGS) {
    assert.equal(streetItems.find((item) => item.id === id)?.landmarkLabel, label);
  }
  for (const [prefix] of ROWS) {
    for (const building of rowBuildings(prefix)) assert.equal(building.landmarkLabel, undefined);
  }
});

test('East 60th separates the club from a full-depth, continuous south block', () => {
  const club = streetItems.find((item) => item.id === 'metropolitan-club');
  const hotel = streetItems.find((item) => item.id === 'hotel-new-netherland');
  const neighbours = rowBuildings('sixtieth-south-block');

  assert.equal(club.position[2], 42);
  assert.ok(club.position[2] + club.size[2] / 2 <= 50, 'club ends north of 60th sidewalk');
  assert.ok(hotel.size[2] >= 17, 'corner building regains full block depth');
  assert.ok(neighbours.length >= 4, 'corner building has a substantial attached row');
  // Parcel meshes are inset 15cm from each authored party-wall edge.
  assert.ok(Math.abs(neighbours[0].position[0] - neighbours[0].size[0] / 2 - 129.6) < 0.01);
  assert.ok(Math.abs(neighbours.at(-1).position[0] + neighbours.at(-1).size[0] / 2 - 159.5) < 0.01);
});
