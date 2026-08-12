import test from 'node:test';
import assert from 'node:assert/strict';
import {
  HORSELESS_TRAFFIC_ROSTER,
  createCarriageState,
  stepCarriage,
} from '../src/world/horselessCarriage.js';
import {
  createHorseDrawnRoster,
  horseDrawnCollider,
  horseDrawnTrafficConfig,
  stepHorseDrawnState,
} from '../src/world/horseDrawnTraffic.js';
import { streetTrafficAdvice, trafficAgentDetails } from '../src/world/streetTraffic.js';
import {
  applyTrafficImpacts,
  beginTrafficFrame,
  reportTrafficBody,
  resetTrafficContacts,
  takeTrafficImpacts,
  trafficCircleChain,
} from '../src/world/trafficContacts.js';

const DT = 1 / 30;

test.afterEach(resetTrafficContacts);

function horselessUnits() {
  return HORSELESS_TRAFFIC_ROSTER.map((entry, index) => {
    const lane = entry.route === 4 ? 0.18 : 1.55;
    const cruise = 3.8 + index * 0.35;
    return {
      kind: 'horseless',
      id: `carriage-${index}`,
      route: entry.route,
      lane,
      cruise,
      state: createCarriageState(entry.route, entry.start, lane),
      config: {
        id: `carriage-${index}`,
        lane,
        cruise,
        minGap: 2.8,
        length: 2.4,
        priority: 10 + index,
      },
    };
  });
}

function horseUnits() {
  return createHorseDrawnRoster().map((unit) => ({
    ...unit,
    kind: 'horse-drawn',
    id: `horse-drawn-${unit.id}`,
    config: horseDrawnTrafficConfig(unit),
  }));
}

function trafficBody(unit) {
  const state = unit.state;
  if (unit.kind === 'horseless') {
    return {
      id: unit.id,
      circles: trafficCircleChain(state.x, state.z, state.yaw, [-0.82, 0.82], 0.9),
      vx: Math.sin(state.yaw) * state.speed,
      vz: Math.cos(state.yaw) * state.speed,
      mass: 680,
      priority: unit.config.priority,
    };
  }

  const collider = horseDrawnCollider(unit.type);
  const coachReach = Math.max(0.25, collider.coachHalf[0] - collider.coachHalf[2]);
  const gearRadius = unit.team === 'pair' ? 0.7 : 0.5;
  return {
    id: unit.id,
    circles: [
      ...trafficCircleChain(
        state.horseX,
        state.horseZ,
        state.horseYaw,
        [-0.48, 0.48],
        collider.horseHalf[2],
      ),
      ...[0.34, 0.68].map((mix) => ({
        x: state.horseX + (state.socketX - state.horseX) * mix,
        z: state.horseZ + (state.socketZ - state.horseZ) * mix,
        r: gearRadius,
      })),
      ...trafficCircleChain(
        state.coachX,
        state.coachZ,
        state.coachYaw,
        [-coachReach, coachReach],
        collider.coachHalf[2],
      ),
    ],
    vx: Math.sin(state.horseYaw) * state.speed,
    vz: Math.cos(state.horseYaw) * state.speed,
    mass: unit.type === 'omnibus' ? 1550 : unit.type === 'brougham' ? 900 : 620,
    priority: unit.config.priority,
  };
}

function circleClearance(a, b) {
  let clearance = Infinity;
  for (const ac of a.circles) for (const bc of b.circles) {
    clearance = Math.min(clearance, Math.hypot(ac.x - bc.x, ac.z - bc.z) - ac.r - bc.r);
  }
  return clearance;
}

test('the complete traffic fleet cannot settle into a collision loop', () => {
  resetTrafficContacts();
  let units = [...horselessUnits(), ...horseUnits()];
  let agents = units.map((unit) => ({
    id: unit.id,
    x: unit.state.x,
    z: unit.state.z,
    r: 2,
    ...trafficAgentDetails(unit.state, unit.config),
  }));
  const distance = units.map(() => 0);
  const entangledTime = new Map();
  let maxEntangledTime = 0;
  let significantImpacts = 0;

  for (let tick = 1; tick <= 300 / DT; tick += 1) {
    beginTrafficFrame(tick);
    units = units.map((unit, index) => {
      const impacts = takeTrafficImpacts(unit.id);
      significantImpacts += impacts.filter((impact) => impact.closingSpeed > 0).length;
      const impacted = applyTrafficImpacts(unit.state, impacts);
      const advice = streetTrafficAdvice(impacted, agents, unit.config, DT);
      const state = unit.kind === 'horseless'
        ? {
          ...stepCarriage(impacted, DT, [], {
            ...unit.config,
            cruise: Math.min(unit.config.cruise, advice.cruise),
            lane: advice.lane,
            swerveLambda: advice.laneLambda,
          }),
          traffic: advice.traffic,
          intersection: advice.intersection,
        }
        : stepHorseDrawnState(impacted, DT, [], {
          type: unit.type,
          cruise: unit.cruise,
          lane: unit.lane,
        }, advice);
      assert.ok(Number.isFinite(state.x) && Number.isFinite(state.z) && Number.isFinite(state.speed));
      distance[index] += state.speed * DT;
      return { ...unit, state };
    });

    agents = units.map((unit) => ({
      id: unit.id,
      x: unit.state.x,
      z: unit.state.z,
      r: 2,
      ...trafficAgentDetails(unit.state, unit.config),
    }));
    const bodies = units.map(trafficBody);
    for (const body of bodies) reportTrafficBody(body, tick);

    for (let a = 0; a < bodies.length; a += 1) for (let b = a + 1; b < bodies.length; b += 1) {
      const key = `${a}|${b}`;
      const nearlyTouching = circleClearance(bodies[a], bodies[b]) < 0.25;
      const bothStopped = units[a].state.speed < 0.08 && units[b].state.speed < 0.08;
      const duration = nearlyTouching && bothStopped ? (entangledTime.get(key) ?? 0) + DT : 0;
      entangledTime.set(key, duration);
      maxEntangledTime = Math.max(maxEntangledTime, duration);
    }
  }

  assert.ok(significantImpacts > 0, 'endurance run exercises real vehicle impacts');
  assert.ok(maxEntangledTime < 8, `no stopped pair remains entangled, max=${maxEntangledTime}`);
  distance.forEach((travelled, index) => {
    assert.ok(travelled > 250, `${units[index].id} travelled only ${travelled.toFixed(1)} m`);
  });
});
