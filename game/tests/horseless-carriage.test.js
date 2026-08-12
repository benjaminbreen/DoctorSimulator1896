import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CARRIAGE_TUNING,
  ROUTES,
  applyCarriageProjectileHit,
  createCarriageState,
  sampleRoute,
  stepCarriage,
} from '../src/world/horselessCarriage.js';

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
  assert.equal(ROUTES.length, 3);
  for (const route of ROUTES) {
    assert.ok(route.total > 150, `route length ${route.total}`);
    assert.deepEqual(sampleRoute(route, 37.5), sampleRoute(route, 37.5 + route.total));
  }
  const a = run(createCarriageState(0, 10), 5);
  const b = run(createCarriageState(0, 10), 5);
  assert.deepEqual(a, b);
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

test('stops short of a line it cannot swerve around', () => {
  const wall = [-2.4, -1.2, 0, 1.2, 2.4].map((lat) => ({ ...loopPoint(30, lat), r: 0.5 }));
  const state = run(createCarriageState(0, 5), 25, wall);
  assert.ok(state.speed < 0.05, `stopped, speed ${state.speed}`);
  assert.ok(state.s < 30, `held short of the wall, s=${state.s}`);
  assert.ok(30 - state.s > CARRIAGE_TUNING.minGap - 1, `gap ${30 - state.s}`);
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
