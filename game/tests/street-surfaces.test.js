import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ROAD_TOP,
  ROADS,
  STREET_LAMP_SITES,
  STREET_SURFACES,
  WALK_TOP,
  streetItems,
} from '../src/world/streetGrid.js';
import { parkItems } from '../src/world/centralPark.js';
import {
  GRAND_ARMY_APRON,
  insideGrandArmyConstruction,
  pointInPolygon,
} from '../src/world/heroStreetLayout.js';
import { constructedSurfaceAt } from '../src/world/constructedSurfaces.js';

function overlapArea(a, b) {
  const x = Math.min(a.x + a.sx / 2, b.x + b.sx / 2) - Math.max(a.x - a.sx / 2, b.x - b.sx / 2);
  const z = Math.min(a.z + a.sz / 2, b.z + b.sz / 2) - Math.max(a.z - a.sz / 2, b.z - b.sz / 2);
  return Math.max(0, x) * Math.max(0, z);
}

test('street top planes partition crossings without coplanar overlap', () => {
  const roadTop = [...STREET_SURFACES.roads, ...STREET_SURFACES.intersections];
  for (let first = 0; first < roadTop.length; first += 1) {
    for (let second = first + 1; second < roadTop.length; second += 1) {
      assert.ok(
        overlapArea(roadTop[first], roadTop[second]) < 1e-6,
        `${roadTop[first].id} overlaps ${roadTop[second].id}`,
      );
    }
  }
});

test('sidewalks stay out of roadbeds and do not double-cover corners', () => {
  const roadTop = [...STREET_SURFACES.roads, ...STREET_SURFACES.intersections];
  for (const sidewalk of STREET_SURFACES.sidewalks) {
    for (const road of roadTop) {
      assert.ok(overlapArea(sidewalk, road) < 1e-6, `${sidewalk.id} overlaps ${road.id}`);
    }
  }
  for (let first = 0; first < STREET_SURFACES.sidewalks.length; first += 1) {
    for (let second = first + 1; second < STREET_SURFACES.sidewalks.length; second += 1) {
      assert.ok(
        overlapArea(STREET_SURFACES.sidewalks[first], STREET_SURFACES.sidewalks[second]) < 1e-6,
        `${STREET_SURFACES.sidewalks[first].id} overlaps ${STREET_SURFACES.sidewalks[second].id}`,
      );
    }
  }
});

test('every crossing has one surface and street collision follows the partition', () => {
  const horizontal = ROADS.filter((road) => road.axis === 'z');
  const vertical = ROADS.filter((road) => road.axis === 'x');
  const expected = horizontal.reduce((sum, road) => sum + vertical.filter((other) => {
    const x = (other.lo + other.hi) / 2;
    const z = (road.lo + road.hi) / 2;
    return x >= road.from && x <= road.to && z >= other.from && z <= other.to;
  }).length, 0);
  assert.equal(STREET_SURFACES.intersections.length, expected);

  const collisions = streetItems.filter((item) => item.id.startsWith('collision-'));
  assert.equal(
    collisions.length,
    STREET_SURFACES.roads.length + STREET_SURFACES.intersections.length + STREET_SURFACES.sidewalks.length,
  );
  assert.ok(collisions.every((item) => item.render === false));
  assert.ok(streetItems.every((item) => !item.id.includes('-rut')));
  assert.ok(WALK_TOP > ROAD_TOP, 'sidewalk retains a physical curb height');
});

test('every intersection has four rounded, tangent curb returns', () => {
  assert.equal(STREET_SURFACES.corners.length, STREET_SURFACES.intersections.length * 4);
  for (const corner of STREET_SURFACES.corners) {
    assert.ok(corner.sidewalk.length >= 8, `${corner.id} has a resolved arc`);
    const [cx, cz] = corner.center;
    const radii = corner.sidewalk.slice(1).map(([x, z]) => Math.hypot(x - cx, z - cz));
    const spread = Math.max(...radii) - Math.min(...radii);
    assert.ok(spread < 1e-6, `${corner.id} stays circular`);
    assert.equal(corner.road[0], corner.streetCorner);
  }
});

test('the Grand Army apron is mostly carriage paving and reaches the street', () => {
  assert.equal(GRAND_ARMY_APRON.outer.length, GRAND_ARMY_APRON.inner.length);
  assert.ok(pointInPolygon(85, 72, GRAND_ARMY_APRON.inner), 'center is carriage paving');
  assert.ok(pointInPolygon(96, 83, GRAND_ARMY_APRON.streetMouth), 'mouth crosses the old lawn strip');
  assert.equal(constructedSurfaceAt(85, 72), 1);
  assert.equal(constructedSurfaceAt(96, 83), 1);
  assert.equal(constructedSurfaceAt(103, 91), 1);
  assert.equal(constructedSurfaceAt(65, 72), 0, 'nearby park lawn stays lawn');

  const retired = parkItems.find((item) => item.id === 'plaza-paving');
  assert.equal(retired.render, false);
  assert.equal(retired.collider, false);
});

test('street lamps occupy clear sidewalk runs instead of corners or lawn', () => {
  assert.equal(new Set(STREET_LAMP_SITES.map((site) => site.id)).size, STREET_LAMP_SITES.length);
  for (const site of STREET_LAMP_SITES) {
    const onStraightWalk = STREET_SURFACES.sidewalks.some((walk) => (
      Math.abs(site.x - walk.x) <= walk.sx / 2
      && Math.abs(site.z - walk.z) <= walk.sz / 2
    ));
    const onCorner = STREET_SURFACES.corners.some((corner) => pointInPolygon(site.x, site.z, corner.sidewalk));
    const onPlaza = insideGrandArmyConstruction(site.x, site.z);
    assert.ok(onStraightWalk || onCorner || onPlaza, `${site.id} stands on paving`);
    assert.equal(constructedSurfaceAt(site.x, site.z), 1, `${site.id} has no grass underfoot`);
  }
});

test('waiting carriages sit on the carriageway', () => {
  const bodies = streetItems.filter((item) => item.id.startsWith('carriage-') && item.id.endsWith('-body'));
  for (const body of bodies) {
    const [x, , z] = body.position;
    const onRoad = ROADS.some((road) => (
      road.axis === 'z'
        ? z >= road.lo && z <= road.hi && x >= road.from && x <= road.to
        : x >= road.lo && x <= road.hi && z >= road.from && z <= road.to
    ));
    assert.ok(onRoad, `${body.id} is on a road`);
  }
});
