import test from 'node:test';
import assert from 'node:assert/strict';
import { facadeWindowAt } from '../src/world/projectileImpacts.js';
import {
  facadeEntranceLayout,
  facadeLayout,
  facadeLayoutForFace,
  facadeWidth,
  FACES,
} from '../src/world/facade.js';
import { streetItems } from '../src/world/streetGrid.js';

const ROWS = [
  ['fifth-east-a', 'x', '-x'],
  ['cps-south-b', 'z', '-z'],
  ['fifty-eighth-s', 'z', '-z'],
  ['madison-west', 'x', '+x'],
  ['madison-east', 'x', '-x'],
  ['sixty-first-south', 'z', '-z'],
  ['fifty-seventh-n-central', 'z', '+z'],
  ['cps-north-east', 'z', '+z'],
];

const NAMED_BUILDINGS = new Map([
  ['hotel-new-netherland', 'New Netherland Hotel'],
  ['hotel-savoy', 'Hotel Savoy'],
  ['bolkenhayn-apartments', 'The Bolkenhayn Apartments'],
  ['plaza-hotel-1890', 'The Plaza Hotel (1890)'],
  ['metropolitan-club', 'Metropolitan Club'],
  ['vanderbilt-mansion', 'Cornelius Vanderbilt II Mansion'],
  ['marble-row', 'Marble Row'],
  ['huntington-mansion', 'Collis P. Huntington Mansion'],
  ['gerry-mansion', 'Elbridge T. Gerry Mansion'],
  ['navarro-flats-a', 'Navarro Flats'],
  ['navarro-flats-b', 'Navarro Flats'],
  ['navarro-flats-c', 'Navarro Flats'],
]);

function rowBuildings(prefix) {
  return streetItems
    .filter((item) => item.kind === 'backdrop'
      && item.id.startsWith(`${prefix}-`)
      && /^\d+$/.test(item.id.slice(prefix.length + 1)))
    .sort((a, b) => Number(a.id.slice(prefix.length + 1)) - Number(b.id.slice(prefix.length + 1)));
}

function windowCenter(building, token, win) {
  const face = FACES[token];
  const [cx, cy, cz] = building.position;
  const [sx, sy, sz] = building.size;
  const width = facadeWidth(building.size, token);
  const layout = facadeLayoutForFace(building, token);
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

test('procedural entrances vary by parcel but remain deterministic', () => {
  const buildings = streetItems.filter(
    (item) => item.kind === 'backdrop' && item.frontageFamily && !item.landmarkModel,
  );
  const entrances = buildings.map((building) => facadeEntranceLayout(building));

  assert.ok(buildings.length > 100, 'the full procedural frontage participates');
  buildings.forEach((building, index) => {
    assert.deepEqual(entrances[index], facadeEntranceLayout(building), `${building.id} is repeatable`);
  });
  assert.deepEqual(new Set(entrances.map((entry) => entry.railStyle)), new Set(['none', 'iron', 'stone']));
  assert.deepEqual(new Set(entrances.map((entry) => entry.surround)), new Set(['plain', 'corniced', 'transom']));
  assert.deepEqual(new Set(entrances.map((entry) => entry.stepCount)), new Set([1, 2, 4, 5, 6]));
  assert.ok(new Set(entrances.map((entry) => entry.doorColor)).size >= 4, 'painted doors vary');
  assert.ok(entrances.some((entry) => entry.bootScraper), 'some raised entries get boot scrapers');
  assert.ok(entrances.some((entry) => entry.hood), 'some low entries get projecting hoods');

  const sideBayCount = entrances.filter(
    (entry) => entry.door.col === 0 || entry.door.col === entry.layout.cols - 1,
  ).length;
  assert.ok(sideBayCount > buildings.length / 2, 'attached-house doors usually occupy a side bay');
});

function rotateByQuaternion([x, y, z], [qx, qy, qz, qw]) {
  const ix = qw * x + qy * z - qz * y;
  const iy = qw * y + qz * x - qx * z;
  const iz = qw * z + qx * y - qy * x;
  const iw = -qx * x - qy * y - qz * z;
  return [
    ix * qw + iw * -qx + iy * -qz - iz * -qy,
    iy * qw + iw * -qy + iz * -qx - ix * -qz,
    iz * qw + iw * -qz + ix * -qy - iy * -qx,
  ];
}

test('stoop collision uses one smooth ramp and at most two side blockers', () => {
  const buildings = streetItems.filter(
    (item) => item.kind === 'backdrop' && item.frontageFamily && !item.landmarkModel,
  );
  const colliderItems = streetItems.filter((item) => item.kind === 'entrance-collider');

  assert.ok(colliderItems.length <= buildings.length * 3, 'collision stays bounded');
  for (const building of buildings) {
    const entrance = facadeEntranceLayout(building);
    const colliders = colliderItems.filter((item) => item.entranceBuildingId === building.id);
    assert.equal(colliders.length, entrance.colliders.length, `${building.id} shares the visual layout`);
    assert.equal(colliders.filter((item) => item.entranceColliderRole === 'ramp').length, 1);
    assert.equal(colliders.length, entrance.raised ? 3 : 1);

    for (const collider of colliders) {
      assert.equal(collider.render, false);
      assert.equal(collider.cameraOccluder, false, 'fixed stoops avoid the per-frame camera scan');
      assert.ok(collider.size.every((value) => Number.isFinite(value) && value > 0));
      const length = Math.hypot(...collider.colliderQuaternion);
      assert.ok(Math.abs(length - 1) < 1e-8, 'collider rotation is normalized');
    }

    const ramp = colliders.find((item) => item.entranceColliderRole === 'ramp');
    const outward = rotateByQuaternion([0, 0, 1], ramp.colliderQuaternion);
    const horizontalDot = outward[0] * entrance.face.normal[0]
      + outward[2] * entrance.face.normal[2];
    assert.ok(horizontalDot > 0.7, `${building.id} ramp descends out from its door`);
    assert.ok(outward[1] < 0, `${building.id} ramp falls toward the pavement`);
  }
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
    const landmark = streetItems.find((item) => item.id === id);
    assert.equal(landmark?.landmarkLabel, label);
    assert.ok(landmark?.landmarkLocation, `${id} has a cross-street location`);
  }
  for (const [prefix] of ROWS) {
    for (const building of rowBuildings(prefix)) assert.equal(building.landmarkLabel, undefined);
  }
});

test('only verified landmark articles are mapped to Wikipedia titles', () => {
  const mapped = streetItems
    .filter((item) => item.wikipediaTitle)
    .map((item) => item.id)
    .sort();
  assert.deepEqual(mapped, [
    'gerry-mansion',
    'hotel-new-netherland',
    'metropolitan-club',
    'plaza-hotel-1890',
    'vanderbilt-mansion',
  ]);
});

test('the Fifth Avenue mansion blocks use authored parcels instead of generic frontage rows', () => {
  assert.equal(rowBuildings('fifth-east-b').length, 0);
  assert.equal(rowBuildings('fifty-eighth-s-east').length, 0);
  assert.equal(rowBuildings('fifty-seventh-n-east').length, 0);

  const marble = streetItems.find((item) => item.id === 'marble-row');
  const huntington = streetItems.find((item) => item.id === 'huntington-mansion');
  const gerry = streetItems.find((item) => item.id === 'gerry-mansion');
  assert.equal(marble.landmarkModel, 'marble-row');
  assert.equal(marble.rowCount, 4);
  assert.equal(huntington.landmarkModel, 'huntington-mansion');
  assert.equal(gerry.landmarkModel, 'gerry-mansion');
  assert.ok(marble.size[2] + huntington.size[2] >= 27, 'authored parcels close the 57th-to-58th frontage');
});

test('East 60th separates the club from a continuous south frontage with rear courts', () => {
  const club = streetItems.find((item) => item.id === 'metropolitan-club');
  const hotel = streetItems.find((item) => item.id === 'hotel-new-netherland');
  const neighbours = rowBuildings('sixtieth-south-block');

  assert.equal(club.position[2], 42);
  assert.ok(club.position[2] + club.size[2] / 2 <= 50, 'club ends north of 60th sidewalk');
  assert.ok(hotel.size[2] >= 17, 'corner building regains full block depth');
  assert.ok(neighbours.length >= 1, 'corner building has an attached frontage');
  assert.ok(neighbours.every((entry) => entry.frontageFamily === 'apartment'));
  // Parcel meshes are inset 15cm from each authored party-wall edge.
  assert.ok(Math.abs(neighbours[0].position[0] - neighbours[0].size[0] / 2 - 132.15) < 0.01);
  assert.ok(Math.abs(neighbours.at(-1).position[0] + neighbours.at(-1).size[0] / 2 - 148.35) < 0.01);
  assert.ok(streetItems.some((item) => item.id === 'new-netherland-east-court-court'));
});
