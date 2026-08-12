import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ROUTES,
  createCarriageState,
  sampleRoute,
  stepCarriage,
} from '../src/world/horselessCarriage.js';
import { streetTrafficAdvice, trafficAgentDetails } from '../src/world/streetTraffic.js';

const DT = 1 / 20;

function unit(id, route, start, lane, cruise, priority) {
  return {
    config: { id, lane, cruise, minGap: 3, length: 3, priority },
    state: { ...createCarriageState(route, start, lane), traffic: { mode: 'lane', lane, wait: 0 } },
  };
}

function simulate(units, seconds) {
  let maxStopped = 0;
  for (let tick = 0; tick < seconds / DT; tick += 1) {
    const agents = units.map((entry) => ({
      id: entry.config.id,
      x: entry.state.x,
      z: entry.state.z,
      r: 1.7,
      ...trafficAgentDetails(entry.state, entry.config),
    }));
    for (const entry of units) {
      const advice = streetTrafficAdvice(entry.state, agents, entry.config, DT);
      entry.state = {
        ...stepCarriage(entry.state, DT, [], {
          ...entry.config,
          cruise: advice.cruise,
          lane: advice.lane,
          swerveLambda: advice.laneLambda,
        }),
        traffic: advice.traffic,
        intersection: advice.intersection,
      };
      maxStopped = Math.max(maxStopped, entry.state.traffic.wait);
    }
  }
  return maxStopped;
}

test('intersection arbitration is deterministic and prevents permanent pileups', () => {
  const build = () => [
    unit('northbound', 0, 193, 1.5, 2.8, 20),
    unit('westbound', 2, 347, 1.5, 2.5, 22),
    unit('following', 0, 184, 1.5, 2.7, 24),
  ];
  const first = build();
  const second = build();
  const wait = simulate(first, 90);
  simulate(second, 90);
  assert.deepEqual(first.map((entry) => entry.state), second.map((entry) => entry.state));
  assert.ok(wait < 12, `no vehicle holds an intersection indefinitely, wait=${wait}`);
  assert.ok(first.every((entry) => entry.state.s > entry.config.priority), 'all vehicles made progress');
});

test('a faster vehicle uses a passing state only on a clear straight', () => {
  const follower = unit('follower', 0, 20, 1.5, 3.2, 20);
  const leader = unit('leader', 0, 28, 1.5, 1.0, 10);
  const agents = [leader, follower].map((entry) => ({
    id: entry.config.id,
    x: entry.state.x,
    z: entry.state.z,
    r: 1.7,
    ...trafficAgentDetails(entry.state, entry.config),
  }));
  const advice = streetTrafficAdvice(follower.state, agents, follower.config, DT);
  assert.equal(advice.traffic.mode, 'passing');
  assert.equal(advice.lane, -1.5);
});

function nearestSample(route, targetX, xDirection) {
  let best = null;
  for (let s = 0; s < route.total; s += 0.1) {
    const [x, z, tx, tz] = sampleRoute(route, s);
    if (Math.sign(tx) !== xDirection || Math.abs(tx) < 0.98) continue;
    const error = Math.abs(x - targetX);
    if (!best || error < best.error) best = { s, x, z, tx, tz, error };
  }
  return best;
}

test('Central Park South through traffic uses the right-hand lanes', () => {
  const westThrough = nearestSample(ROUTES[4], 20, -1);
  const eastThrough = nearestSample(ROUTES[4], 20, 1);
  const westLocal = nearestSample(ROUTES[3], 20, -1);
  assert.ok(westThrough && eastThrough && westLocal);

  const throughWestState = createCarriageState(4, westThrough.s, 0.18);
  const throughEastState = createCarriageState(4, eastThrough.s, 0.18);
  const localWestState = createCarriageState(3, westLocal.s, 1.55);
  assert.ok(throughEastState.z > 91, 'eastbound traffic keeps to the south half');
  assert.ok(throughWestState.z < 91, 'westbound traffic keeps to the north half');
  assert.ok(
    Math.abs(throughWestState.z - localWestState.z) < 1,
    'through and local westbound traces remain one traffic lane apart',
  );
});

test('vehicles follow nearby leaders belonging to another route family', () => {
  const followerSample = nearestSample(ROUTES[4], 20, -1);
  const leaderSample = nearestSample(ROUTES[3], 10, -1);
  const follower = {
    ...createCarriageState(4, followerSample.s, 0.18),
    speed: 3,
    traffic: { mode: 'lane', lane: 0.18, targetId: null, wait: 0 },
  };
  const leader = {
    ...createCarriageState(3, leaderSample.s, 1.55),
    speed: 0.8,
  };
  const followerConfig = {
    id: 'through-follower', lane: 0.18, cruise: 4, minGap: 2.8, length: 2.4, priority: 10,
  };
  const leaderConfig = {
    id: 'local-leader', lane: 1.55, cruise: 2, minGap: 2.8, length: 2.4, priority: 11,
  };
  const advice = streetTrafficAdvice(follower, [{
    id: leaderConfig.id,
    x: leader.x,
    z: leader.z,
    r: 1.7,
    ...trafficAgentDetails(leader, leaderConfig),
  }], followerConfig, DT);
  assert.ok(advice.cruise < followerConfig.cruise, `cross-route leader limits speed to ${advice.cruise}`);
  assert.equal(advice.traffic.mode, 'lane', 'cross-route following does not start an unsafe pass');
});

test('an articulated rig reports traffic from its true longitudinal centre', () => {
  const state = createCarriageState(0, 40, 1.5);
  const config = {
    id: 'horse-team', lane: 1.5, cruise: 2.2, minGap: 4, length: 6.5,
    priority: 20, trafficSOffset: -2.1,
  };
  const details = trafficAgentDetails(state, config);
  assert.ok(Math.abs(details.s - 37.9) < 1e-9);

  const follower = unit('follower', 0, 30, 1.5, 3, 10);
  const advice = streetTrafficAdvice(follower.state, [{
    id: config.id,
    x: state.x,
    z: state.z,
    r: 2,
    ...details,
  }, {
    id: 'oncoming', trafficId: 'oncoming', route: 2, s: 20, lane: 1.5,
    x: follower.state.x, z: follower.state.z, speed: 2, length: 3, priority: 30,
  }], follower.config, DT);
  assert.ok(advice.cruise < follower.config.cruise, 'follower sees the coach rear, not only the horse');
});

test('an articulated rig stops its front, not its centre, at an intersection', () => {
  const intersection = ROUTES[0].intersections.find((entry) => entry.id === '103,91');
  const crossing = ROUTES[2].intersections.find((entry) => entry.id === intersection.id);
  const length = 6.5;
  const state = {
    ...createCarriageState(0, intersection.s - 6.35, 1.5),
    speed: 1.8,
    traffic: { mode: 'lane', lane: 1.5, targetId: null, wait: 0 },
  };
  const advice = streetTrafficAdvice(state, [{
    id: 'crossing',
    trafficId: 'crossing',
    route: 2,
    s: crossing.s - 1,
    lane: 1.5,
    speed: 2,
    length: 3,
    priority: 1,
    trafficWait: 0,
  }], {
    id: 'long-rig', lane: 1.5, cruise: 2.2, minGap: 4, length, priority: 50,
  }, DT);
  assert.equal(advice.cruise, 0, 'front axle has reached the stop line');
});
