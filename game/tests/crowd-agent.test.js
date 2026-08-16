import test from 'node:test';
import assert from 'node:assert/strict';
import {
  avoidanceOffset,
  createCrowdAgentState,
  crossingLapse,
  crossingThreat,
  polylineTotal,
  samplePolyline,
  stepCrowdAgent,
} from '../src/world/crowdAgent.js';

const STRAIGHT = [[0, 0], [10, 0], [20, 0]];

function assignment(overrides = {}) {
  return {
    index: 1,
    polyline: STRAIGHT,
    segments: [
      { surface: 'walk', roadId: null, crossesGapstow: false, kind: 'sidewalk' },
      { surface: 'road', roadId: 'cps', crossesGapstow: false, kind: 'crossing' },
    ],
    length: polylineTotal(STRAIGHT),
    pace: 1.4,
    traits: { attention: 0.9, hurry: 0.2 },
    ...overrides,
  };
}

test('polyline sampling matches arc distance', () => {
  const [x, z, tx, tz, seg] = samplePolyline(STRAIGHT, 12);
  assert.ok(Math.abs(x - 12) < 1e-9);
  assert.equal(z, 0);
  assert.equal(tx, 1);
  assert.equal(tz, 0);
  assert.equal(seg, 1);
  const [endX, , , , endSeg] = samplePolyline(STRAIGHT, 999);
  assert.equal(endX, 20);
  assert.equal(endSeg, 1);
});

test('an agent catches up to the logical position at a bounded pace', () => {
  const agent = createCrowdAgentState();
  const spec = assignment();
  let pose = null;
  for (let i = 0; i < 60; i += 1) {
    pose = stepCrowdAgent(agent, {
      dt: 1 / 30,
      now: i / 30,
      logicalDistance: 6,
      dwelling: false,
      assignment: spec,
    });
  }
  assert.ok(agent.distance > 2.5, `made progress: ${agent.distance}`);
  assert.ok(agent.distance <= 6.01, 'never overtakes the logical position');
  assert.ok(pose.moving);
  // Speed never exceeded pace times the catch-up factor.
  const agent2 = createCrowdAgentState();
  stepCrowdAgent(agent2, {
    dt: 1, now: 0, logicalDistance: 20, dwelling: false, assignment: spec,
  });
  assert.ok(agent2.distance <= spec.pace * 1.2 + 1e-9);
});

test('avoidance pushes finitely and weakens with low attention', () => {
  const neighbours = [{ x: 1, z: 0.2 }];
  const attentive = avoidanceOffset(0, 0, 1, 0, neighbours, 1);
  const distracted = avoidanceOffset(0, 0, 1, 0, neighbours, 0);
  assert.ok(attentive < 0, 'pushes away from a neighbour on the left-of-heading side');
  assert.ok(Math.abs(attentive) <= 0.55);
  assert.ok(Math.abs(distracted) < Math.abs(attentive));
  const empty = avoidanceOffset(0, 0, 1, 0, [], 1);
  assert.equal(empty, 0);
});

test('a vehicle bearing down on the crossing is a threat; a distant one is not', () => {
  // Crossing points +x; vehicle driving -z toward the corridor.
  const near = crossingThreat(0, 0, 1, 0, [{ x: 2, z: 6, yaw: Math.PI, speed: 3, r: 1.5 }]);
  assert.ok(near);
  const far = crossingThreat(0, 0, 1, 0, [{ x: 2, z: 60, yaw: Math.PI, speed: 3, r: 1.5 }]);
  assert.equal(far, null);
  const parallel = crossingThreat(0, 0, 1, 0, [{ x: -30, z: 30, yaw: 0, speed: 3, r: 1.5 }]);
  assert.equal(parallel, null);
});

test('an agent holds at the curb for a threat, and only lapses under the budget', () => {
  const spec = assignment({ traits: { attention: 0.2, hurry: 0.9 } });
  const vehicles = [{ x: 12, z: 5, yaw: Math.PI, speed: 3, r: 1.5 }];
  const hold = () => {
    const agent = createCrowdAgentState();
    agent.distance = 8.6; // just short of the road segment at 10
    agent.assignmentIndex = spec.index;
    return stepCrowdAgent(agent, {
      dt: 1 / 30,
      now: 1,
      logicalDistance: 20,
      dwelling: false,
      assignment: spec,
      vehicles,
      crossingRoll: 0.99,
      incidentAllowed: true,
    });
  };
  const held = hold();
  assert.equal(held.moving, false, 'waits at the curb');
  assert.equal(held.lapse, false);

  const agent = createCrowdAgentState();
  agent.distance = 8.6;
  agent.assignmentIndex = spec.index;
  const lapsed = stepCrowdAgent(agent, {
    dt: 1 / 30,
    now: 1,
    logicalDistance: 20,
    dwelling: false,
    assignment: spec,
    vehicles,
    crossingRoll: 0,
    incidentAllowed: true,
  });
  assert.equal(lapsed.lapse, true, 'a distracted, hurried walker can step out');
  assert.ok(lapsed.moving);

  const gated = stepCrowdAgent(Object.assign(createCrowdAgentState(), {
    distance: 8.6,
    assignmentIndex: spec.index,
  }), {
    dt: 1 / 30,
    now: 1,
    logicalDistance: 20,
    dwelling: false,
    assignment: spec,
    vehicles,
    crossingRoll: 0,
    incidentAllowed: false,
  });
  assert.equal(gated.lapse, false, 'the incident budget always wins');
  assert.equal(gated.moving, false);
});

test('attentive walkers essentially never lapse; the gate is required', () => {
  const careful = { attention: 0.95, hurry: 0.1 };
  const careless = { attention: 0.1, hurry: 0.9 };
  assert.equal(crossingLapse(careful, 0.02, true), false);
  assert.equal(crossingLapse(careless, 0.02, true), true);
  assert.equal(crossingLapse(careless, 0.02, false), false);
});

test('a walker yields to someone blocking the path and faces them', () => {
  const spec = assignment();
  const agent = createCrowdAgentState();
  agent.assignmentIndex = spec.index;
  agent.distance = 4;
  const step = stepCrowdAgent(agent, {
    dt: 1 / 30,
    now: 1,
    logicalDistance: 20,
    dwelling: false,
    assignment: spec,
    intruder: { x: 4.9, z: 0.1 },
  });
  assert.equal(step.moving, false, 'stops rather than walking into them');
  assert.equal(step.yielding, true);
  assert.ok(Math.abs(step.faceYaw - Math.atan2(0.9, 0.1)) < 1e-9, 'faces the intruder');
});

test('a walker leans aside for an approach and detours around a persistent blocker', () => {
  const spec = assignment();
  const agent = createCrowdAgentState();
  agent.assignmentIndex = spec.index;
  agent.distance = 4;
  const dodge = stepCrowdAgent(agent, {
    dt: 1 / 30,
    now: 1,
    logicalDistance: 20,
    dwelling: false,
    assignment: spec,
    intruder: { x: 6, z: 0.4 },
  });
  assert.equal(dodge.moving, true, 'keeps walking while dodging');
  assert.ok(agent.lateral < 0, `pushed away from the intruder side: ${agent.lateral}`);

  // Stand in the way until patience runs out, then confirm the detour.
  agent.lateral = 0;
  agent.yieldTime = 0;
  for (let i = 0; i < 30 * 4; i += 1) {
    stepCrowdAgent(agent, {
      dt: 1 / 30,
      now: 1 + i / 30,
      logicalDistance: 20,
      dwelling: false,
      assignment: spec,
      intruder: { x: agent.distance + 0.9, z: 0 },
    });
  }
  assert.ok(agent.yieldTime > 2.4, `patience ran out: ${agent.yieldTime}`);
  const detour = stepCrowdAgent(agent, {
    dt: 1 / 30,
    now: 6,
    logicalDistance: 20,
    dwelling: false,
    assignment: spec,
    intruder: { x: agent.distance + 0.9, z: 0 },
  });
  assert.equal(detour.moving, true, 'steps around instead of waiting forever');
  assert.equal(detour.yielding, false);

  // Someone standing behind provokes nothing.
  const calm = createCrowdAgentState();
  calm.assignmentIndex = spec.index;
  calm.distance = 4;
  const unbothered = stepCrowdAgent(calm, {
    dt: 1 / 30,
    now: 1,
    logicalDistance: 20,
    dwelling: false,
    assignment: spec,
    intruder: { x: 2, z: 0 },
  });
  assert.equal(unbothered.yielding, false);
  assert.equal(unbothered.moving, true);
});
