import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CARRIAGE_TUNING,
  ROUTES,
  applyCarriageProjectileHit,
  carriageDriverKind,
  createCarriageState,
  HORSELESS_TRAFFIC_ROSTER,
  sampleRoute,
  STRAWHAT_DRIVER_RATE,
  stepCarriage,
} from '../src/world/horselessCarriage.js';
import { shortestArc } from '../src/movement/mathUtils.js';

const DT = 1 / 60;

function run(state, seconds, obstacles = []) {
  let current = state;
  for (let i = 0; i < seconds * 60; i += 1) {
    current = stepCarriage(current, DT, obstacles);
  }
  return current;
}

// World position of a point on route 0 offset laterally from the centerline.
function loopPoint(dist, lat) {
  const [x, z, tx, tz] = sampleRoute(ROUTES[0], dist);
  return { x: x + -tz * lat, z: z + tx * lat };
}

test('routes are closed and deterministic', () => {
  assert.equal(ROUTES.length, 7);
  for (const route of ROUTES) {
    assert.ok(route.total > 150, `route length ${route.total}`);
    assert.deepEqual(sampleRoute(route, 37.5), sampleRoute(route, 37.5 + route.total));
  }
  const a = run(createCarriageState(0, 10), 5);
  const b = run(createCarriageState(0, 10), 5);
  assert.deepEqual(a, b);
});

test('the opening fleet is distributed across district and park-front routes', () => {
  assert.equal(HORSELESS_TRAFFIC_ROSTER.length, 3);
  assert.equal(new Set(HORSELESS_TRAFFIC_ROSTER.map((entry) => entry.route)).size, 3);
  assert.ok(HORSELESS_TRAFFIC_ROSTER.some((entry) => entry.route === 4));
  const starts = HORSELESS_TRAFFIC_ROSTER.map((entry) => createCarriageState(
    entry.route,
    entry.start,
    entry.route === 4 ? 0.18 : 1.55,
  ));
  assert.ok(starts.some((state) => state.x < 96 && state.z > 86 && state.z < 96));
});

test('one quarter of uniform driver rolls select the Strawhat woman', () => {
  assert.equal(STRAWHAT_DRIVER_RATE, 0.25);
  assert.equal(carriageDriverKind(0), 'strawhat-woman');
  assert.equal(carriageDriverKind(0.249999), 'strawhat-woman');
  assert.equal(carriageDriverKind(0.25), 'coated-man');
  assert.equal(carriageDriverKind(0.999999), 'coated-man');
  const sample = Array.from({ length: 1000 }, (_, index) => carriageDriverKind((index + 0.5) / 1000));
  assert.equal(sample.filter((kind) => kind === 'strawhat-woman').length, 250);
});

test('route tangents remain continuous through every corner', () => {
  for (const route of ROUTES) {
    let previous = sampleRoute(route, 0);
    for (let s = 0.1; s <= route.total; s += 0.1) {
      const current = sampleRoute(route, s);
      const turn = Math.abs(shortestArc(
        Math.atan2(previous[2], previous[3]),
        Math.atan2(current[2], current[3]),
      ));
      assert.ok(turn < 0.11, `route tangent jumped ${turn} rad at ${s}`);
      previous = current;
    }
  }
});

test('reaches cruise on an open road and holds its lane', () => {
  const state = run(createCarriageState(0, 5), 8);
  assert.ok(state.speed > CARRIAGE_TUNING.cruise * 0.9, `speed ${state.speed}`);
  assert.ok(Math.abs(state.lat - CARRIAGE_TUNING.lane) < 0.1, `lat ${state.lat}`);
});

test('swerves around a figure standing in its lane', () => {
  const blocker = { ...loopPoint(35, CARRIAGE_TUNING.lane), r: 0.5 };
  let state = createCarriageState(0, 5);
  let minDist = Infinity;
  for (let i = 0; i < 20 * 60; i += 1) {
    state = stepCarriage(state, DT, [blocker]);
    minDist = Math.min(minDist, Math.hypot(state.x - blocker.x, state.z - blocker.z));
  }
  assert.ok(state.s > 45, `passed the blocker, s=${state.s}`);
  assert.ok(minDist > 1.0, `kept clear, min distance ${minDist}`);
});

test('a posted centre-line officer leaves both established traffic lanes flowing', () => {
  const officer = { x: 92, z: 91, r: 0.42, trafficClearance: 0.72 };
  for (const route of [2, 3]) {
    let state = createCarriageState(route, route === 2 ? 302 : 30, 1.55);
    let blockedFrames = 0;
    let distance = 0;
    for (let i = 0; i < 120 * 60; i += 1) {
      state = stepCarriage(state, DT, [officer], { lane: 1.55 });
      distance += state.speed * DT;
      if (state.blocked) blockedFrames += 1;
    }
    assert.equal(blockedFrames, 0, `route ${route} never queues at the officer`);
    assert.ok(distance > 300, `route ${route} keeps circulating, distance=${distance}`);
  }
});

test('commits to a side and passes a multi-circle fallen cart without crawling', () => {
  const cart = [-0.8, 0, 0.8].map((offset) => ({
    ...loopPoint(35 + offset, CARRIAGE_TUNING.lane),
    r: 0.62,
  }));
  let state = createCarriageState(0, 5);
  let sawCommittedPass = false;
  let slowestCommittedSpeed = Infinity;
  for (let i = 0; i < 24 * 60; i += 1) {
    state = stepCarriage(state, DT, cart);
    if (state.avoidTarget !== null) {
      sawCommittedPass = true;
      slowestCommittedSpeed = Math.min(slowestCommittedSpeed, state.speed);
    }
  }
  assert.equal(sawCommittedPass, true);
  assert.ok(state.s > 48, `cleared the fallen cart, s=${state.s}`);
  assert.ok(slowestCommittedSpeed > 0.7, `kept a deliberate pass speed, min=${slowestCommittedSpeed}`);
  assert.equal(state.avoidTarget, null, 'released the passing side after clearing the cart');
});

test('a long rig holds its passing line until its rear has cleared', () => {
  const obstacle = { ...loopPoint(36, CARRIAGE_TUNING.lane), r: 0.55 };
  const state = {
    ...createCarriageState(0, 40, -1.5),
    speed: 2,
    avoidTarget: -1.5,
  };
  const next = stepCarriage(state, DT, [obstacle], {
    lane: CARRIAGE_TUNING.lane,
    rearClearance: 6,
  });
  assert.equal(next.avoidTarget, -1.5, 'coach rear is still beside the obstruction');
  assert.ok(next.lat < -1.4, `did not cut back early, lat=${next.lat}`);
});

test('stops short of a line it cannot swerve around', () => {
  const wall = [-2.4, -1.2, 0, 1.2, 2.4].map((lat) => ({ ...loopPoint(30, lat), r: 0.5 }));
  const state = run(createCarriageState(0, 5), 25, wall);
  assert.ok(state.speed < 0.05, `stopped, speed ${state.speed}`);
  assert.ok(state.s < 30, `held short of the wall, s=${state.s}`);
  assert.ok(30 - state.s > CARRIAGE_TUNING.minGap - 1, `gap ${30 - state.s}`);
});

test('soft street debris never turns into a road closure', () => {
  const debris = [-2.4, -1.2, 0, 1.2, 2.4].map((lat) => ({
    ...loopPoint(30, lat),
    r: 0.55,
    trafficPolicy: 'soft',
  }));
  const state = run(createCarriageState(0, 5), 16, debris);
  assert.ok(state.s > 42, `drove through the soft obstruction, s=${state.s}`);
  assert.ok(state.speed > 1, `kept moving through debris, speed=${state.speed}`);
  assert.equal(state.blocked, false);
});

test('holds still while someone stands against the hull', () => {
  let state = run(createCarriageState(0, 5), 8);
  const hugger = { x: state.x, z: state.z, r: 0.5 };
  state = run(state, 6, [hugger]);
  assert.ok(state.speed < 0.05, `held, speed ${state.speed}`);
});

test('another carriage against the hull does not freeze it', () => {
  let state = run(createCarriageState(0, 5), 8);
  // A vehicle-sized obstacle beside it: brake logic applies, not the
  // person-hold, so traffic jams clear instead of locking.
  const other = { x: state.x + 2, z: state.z, r: 1.7 };
  const held = run(state, 4, [other]);
  const freed = run(held, 8, []);
  assert.ok(freed.speed > 1.0, `moves again, speed ${freed.speed}`);
});

test('follows slow traffic that blocks the whole road', () => {
  // Two slow wagons abreast ahead: no lane clears, so it keeps station
  // behind them instead of shoving through.
  let state = run(createCarriageState(0, 5), 6);
  let wagonS = state.s + 9;
  for (let i = 0; i < 15 * 60; i += 1) {
    wagonS += 0.8 * DT;
    const convoy = [1.5, -1.5].map((lat) => ({ ...loopPoint(wagonS, lat), r: 1.7 }));
    state = stepCarriage(state, DT, convoy);
  }
  const gap = wagonS - state.s;
  assert.ok(state.speed < 2.0, `matched the crawl, speed ${state.speed}`);
  assert.ok(gap > CARRIAGE_TUNING.minGap - 1 && gap < 15, `kept station, gap ${gap}`);
});

test('overtakes a single slow wagon when there is room', () => {
  let state = run(createCarriageState(0, 5), 6);
  let wagonS = state.s + 9;
  for (let i = 0; i < 20 * 60; i += 1) {
    wagonS += 0.8 * DT;
    const wagon = { ...loopPoint(wagonS, CARRIAGE_TUNING.lane), r: 1.7 };
    state = stepCarriage(state, DT, [wagon]);
  }
  assert.ok(state.s > wagonS + 2, `passed it, s=${state.s} wagon=${wagonS}`);
});

test('reports why it slows: avoiding, then blocked', () => {
  const open = run(createCarriageState(0, 5), 8);
  assert.equal(open.avoiding, false);
  assert.equal(open.blocked, false);
  const wall = [-2.4, -1.2, 0, 1.2, 2.4].map((lat) => ({ ...loopPoint(30, lat), r: 0.5 }));
  const held = run(createCarriageState(0, 5), 25, wall);
  assert.equal(held.avoiding, true);
  assert.equal(held.blocked, true, 'held at a stop reads as blocked');
});

test('resumes once the way clears', () => {
  const wall = [-2.4, -1.2, 0, 1.2, 2.4].map((lat) => ({ ...loopPoint(30, lat), r: 0.5 }));
  let state = run(createCarriageState(0, 5), 25, wall);
  let peak = 0;
  for (let i = 0; i < 8 * 60; i += 1) {
    state = stepCarriage(state, DT, []);
    peak = Math.max(peak, state.speed);
  }
  // Speed is sampled at the peak: the run may end inside a corner slowdown.
  assert.ok(peak > CARRIAGE_TUNING.cruise * 0.9, `peak speed ${peak}`);
  assert.ok(state.s > 35, `moving again, s=${state.s}`);
});

test('a fast projectile shoves and rocks a carriage, then the route recentres it', () => {
  const moving = run(createCarriageState(0, 5), 5);
  const hit = applyCarriageProjectileHit(moving, [14, 1, 3], 1);
  assert.ok(hit.knockX > 0.5, `horizontal shove ${hit.knockX}`);
  assert.ok(Math.abs(hit.knockRoll) > 0.02, `body roll ${hit.knockRoll}`);
  assert.ok(hit.speed < moving.speed, `speed ${moving.speed} -> ${hit.speed}`);

  const recovered = run(hit, 2);
  assert.ok(Math.abs(recovered.knockX) < 0.01, `recentered ${recovered.knockX}`);
  assert.ok(Math.abs(recovered.knockRoll) < 0.001, `settled ${recovered.knockRoll}`);
});

test('lighter throwable types deliver proportionally less carriage knockback', () => {
  const moving = run(createCarriageState(0, 5), 5);
  const cabbage = applyCarriageProjectileHit(moving, [14, 1, 3], 1);
  const apple = applyCarriageProjectileHit(moving, [14, 1, 3], 0.32);
  assert.ok(apple.knockX < cabbage.knockX * 0.4);
  assert.ok(apple.speed > cabbage.speed);
});
