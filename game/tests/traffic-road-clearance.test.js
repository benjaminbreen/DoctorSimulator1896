import test from 'node:test';
import assert from 'node:assert/strict';
import { ROADS, WORLD_BOUNDS, streetItems } from '../src/world/streetGrid.js';
import {
  HORSELESS_TRAFFIC_ROSTER,
  ROUTES,
  createCarriageState,
  sampleRoute,
} from '../src/world/horselessCarriage.js';
import {
  createHorseDrawnRoster,
  horseDrawnCollider,
  horseDrawnTrafficConfig,
  stepHorseDrawnState,
} from '../src/world/horseDrawnTraffic.js';

const buildings = streetItems.filter((item) => item.kind === 'backdrop' && item.collider !== false);

function onRoad(x, z) {
  return ROADS.some((road) => (
    road.axis === 'x'
      ? x >= road.lo && x <= road.hi && z >= road.from && z <= road.to
      : z >= road.lo && z <= road.hi && x >= road.from && x <= road.to
  ));
}

function buildingDistance(x, z, building) {
  const dx = Math.max(Math.abs(x - building.position[0]) - building.size[0] / 2, 0);
  const dz = Math.max(Math.abs(z - building.position[2]) - building.size[2] / 2, 0);
  return Math.hypot(dx, dz);
}

function assertDiscClear(x, z, radius, label) {
  for (const building of buildings) {
    assert.ok(
      buildingDistance(x, z, building) >= radius,
      `${label} intersects ${building.id} at ${x.toFixed(2)},${z.toFixed(2)}`,
    );
  }
  // The through-route's turnaround is deliberately hidden beyond the world.
  // Treat a centre within one vehicle radius of the edge as portal space.
  if (x < WORLD_BOUNDS.minX + radius || x > WORLD_BOUNDS.maxX - radius) return;
  for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 4) {
    assert.ok(
      onRoad(x + Math.cos(angle) * radius, z + Math.sin(angle) * radius),
      `${label} leaves the carriageway at ${x.toFixed(2)},${z.toFixed(2)}`,
    );
  }
}

test('every playable traffic lane keeps a vehicle envelope out of buildings', () => {
  for (const [routeIndex, route] of ROUTES.entries()) {
    const lanes = routeIndex === 4 ? [0.18] : [-1.75, 1.75];
    for (const lane of lanes) {
      for (let distance = 0; distance < route.total; distance += 0.25) {
        const [x, z, tx, tz] = sampleRoute(route, distance);
        const px = x - tz * lane;
        const pz = z + tx * lane;
        assertDiscClear(px, pz, routeIndex === 4 ? 0.72 : 0.9, `${route.id} lane ${lane}`);
      }
    }
  }
});

test('opening traffic starts on clear roads and is spread across the district', () => {
  const states = HORSELESS_TRAFFIC_ROSTER.map((entry) => createCarriageState(
    entry.route,
    entry.start,
    entry.route === 4 ? 0.18 : 1.55,
  ));
  for (const state of states) assertDiscClear(state.x, state.z, 0.9, 'horseless spawn');
  assert.ok(states.some((state) => state.x < 96 && state.z >= 86 && state.z <= 96));

  for (const unit of createHorseDrawnRoster()) {
    const collider = horseDrawnCollider(unit.type);
    assertDiscClear(unit.state.horseX, unit.state.horseZ, collider.horseHalf[2], `${unit.type} horse spawn`);
    assertDiscClear(unit.state.coachX, unit.state.coachZ, collider.coachHalf[2], `${unit.type} coach spawn`);
  }
});

test('complete horse rigs stay on clear carriageways for five simulated minutes', () => {
  for (const unit of createHorseDrawnRoster()) {
    const collider = horseDrawnCollider(unit.type);
    const traffic = horseDrawnTrafficConfig(unit);
    let state = unit.state;
    for (let tick = 0; tick < 300 * 30; tick += 1) {
      state = stepHorseDrawnState(state, 1 / 30, [], {
        type: unit.type,
        cruise: unit.cruise,
        lane: unit.lane,
      }, {
        cruise: unit.cruise,
        lane: unit.lane,
        traffic: state.traffic,
      });
      if (tick % 6 !== 0) continue;
      assertDiscClear(state.horseX, state.horseZ, collider.horseHalf[2], `${unit.type} horse`);
      assertDiscClear(state.coachX, state.coachZ, collider.coachHalf[2], `${unit.type} coach`);
    }
    assert.ok(traffic.length > 5, `${unit.type} publishes its complete rig length`);
  }
});
