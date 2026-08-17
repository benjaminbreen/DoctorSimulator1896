import test from 'node:test';
import assert from 'node:assert/strict';
import { buildWalkGraph } from '../src/world/walkGraph.js';
import {
  activeSlotCount,
  createCrowdState,
  CROWD_SLOT_ARCHETYPES,
  crowdPopulationLevel,
  crowdSlotLogical,
  crowdSpawnNodes,
  ensureSlotCoverage,
} from '../src/world/crowdScheduler.js';

const graph = buildWalkGraph();
const NOON = 12 * 3600;

test('population follows the day: busy at noon, thin at 3 am', () => {
  assert.ok(crowdPopulationLevel(12) > 0.8);
  assert.ok(crowdPopulationLevel(3) < 0.1);
  assert.ok(activeSlotCount(12) > activeSlotCount(22));
  assert.equal(activeSlotCount(12, 0), 0);
});

test('assignment chains are deterministic and continuous', () => {
  const first = createCrowdState(1896);
  const second = createCrowdState(1896);
  for (const state of [first, second]) {
    for (let slot = 0; slot < state.slots.length; slot += 1) {
      ensureSlotCoverage(state, slot, graph, NOON + 1800);
    }
  }
  assert.deepEqual(
    first.slots.map((slot) => slot.assignments.map(({ index, from, to, role }) => ({ index, from, to, role }))),
    second.slots.map((slot) => slot.assignments.map(({ index, from, to, role }) => ({ index, from, to, role }))),
  );
  for (const slot of first.slots) {
    for (let i = 1; i < slot.assignments.length; i += 1) {
      assert.equal(
        slot.assignments[i].from,
        slot.assignments[i - 1].to,
        'each walk starts where the last ended',
      );
      assert.ok(slot.assignments[i].startSeconds >= slot.assignments[i - 1].startSeconds);
    }
  }
  const seeds = new Set(first.slots.flatMap((slot) => slot.assignments.map((entry) => entry.seed)));
  assert.ok(seeds.size > first.slots.length, 'assignments draw distinct seeds');
});

test('different day seeds produce different days', () => {
  const a = createCrowdState(100);
  const b = createCrowdState(101);
  ensureSlotCoverage(a, 0, graph, NOON + 1800);
  ensureSlotCoverage(b, 0, graph, NOON + 1800);
  const shape = (state) => state.slots[0].assignments.map(({ from, to }) => `${from}>${to}`).join('|');
  assert.notEqual(shape(a), shape(b));
});

test('a clock jump re-derives the same logical position as living through it', () => {
  const lived = createCrowdState(7);
  // Live through the afternoon in ten-minute strides.
  for (let seconds = NOON; seconds <= NOON + 4 * 3600; seconds += 600) {
    crowdSlotLogical(lived, 2, graph, seconds);
  }
  const jumped = createCrowdState(7);
  const target = NOON + 4 * 3600;
  const livedPose = crowdSlotLogical(lived, 2, graph, target);
  const jumpedPose = crowdSlotLogical(jumped, 2, graph, target);
  assert.equal(livedPose.assignment.index, jumpedPose.assignment.index);
  assert.equal(livedPose.assignment.from, jumpedPose.assignment.from);
  assert.equal(livedPose.assignment.to, jumpedPose.assignment.to);
  assert.ok(Math.abs(livedPose.distance - jumpedPose.distance) < 1e-6);
});

test('logical distance walks the route then dwells', () => {
  const state = createCrowdState(3);
  // Find a routed (non-degenerate) assignment near noon.
  const spec = ensureSlotCoverage(state, 0, graph, NOON);
  const walking = spec.path
    ? spec
    : state.slots[0].assignments.find((entry) => entry.path);
  assert.ok(walking, 'the morning produced at least one routed walk');
  const early = crowdSlotLogical(state, 0, graph, walking.startSeconds + 2);
  if (early.assignment === walking) {
    assert.ok(early.distance > 0 && early.distance < walking.length);
    assert.equal(early.dwelling, false);
    assert.ok(walking.polyline, 'the walked assignment resolved its polyline');
  }
  const late = crowdSlotLogical(
    state, 0, graph, walking.startSeconds + walking.walkSeconds + 0.5,
  );
  if (late.assignment === walking) {
    assert.equal(late.dwelling, true);
    assert.equal(late.distance, walking.length);
  }
});

test('spawn nodes are world edges and gates; archetypes are walk-capable', () => {
  const spawns = crowdSpawnNodes(graph);
  assert.ok(spawns.length >= 8);
  for (const index of spawns) {
    assert.ok(graph.nodes[index], 'spawn indexes are valid');
  }
  for (const archetype of CROWD_SLOT_ARCHETYPES) {
    assert.ok(['m', 'w', 'h', 'l', 'r', 'hm', 'bh'].includes(archetype), 'walk-capable; never the summer-dress visitor or the forties woman');
  }
});

test('the incident budget rations lapses in civil time', async () => {
  const { createIncidentBudget, incidentAllowed, recordIncident } = await import('../src/world/crowdScheduler.js');
  const budget = createIncidentBudget(480);
  assert.equal(incidentAllowed(budget, 1000), true);
  recordIncident(budget, 1000);
  assert.equal(incidentAllowed(budget, 1200), false);
  assert.equal(incidentAllowed(budget, 1480), true);
});

test('backward dev-dial jumps rebuild instead of wedging', () => {
  const state = createCrowdState(11);
  ensureSlotCoverage(state, 0, graph, NOON + 3600);
  const back = ensureSlotCoverage(state, 0, graph, NOON - 7200);
  assert.ok(back.startSeconds <= NOON - 7200 + 3600);
  const pose = crowdSlotLogical(state, 0, graph, NOON - 7200);
  assert.ok(pose.distance >= 0);
});

test('a full day includes rests at real spots and trips through doors', () => {
  const state = createCrowdState(42);
  const dayEnd = 24 * 3600 - 1;
  for (let slot = 0; slot < state.slots.length; slot += 1) {
    ensureSlotCoverage(state, slot, graph, dayEnd);
  }
  // Regenerate the pruned history to inspect the whole day.
  const fresh = createCrowdState(42);
  const all = [];
  for (let slot = 0; slot < fresh.slots.length; slot += 1) {
    ensureSlotCoverage(fresh, slot, graph, dayEnd);
    all.push(...fresh.slots[slot].assignments.map((entry) => ({ slot, ...entry })));
  }
  const rests = all.filter((entry) => entry.occupy);
  assert.ok(rests.length > 0, 'someone sat down during the day');
  for (const rest of rests) {
    assert.ok(rest.occupy.clip, `${rest.occupy.spotId} has a clip for ${fresh.slots[rest.slot].archetype}`);
    assert.ok(rest.dwellSeconds >= 600, 'a sit is a real rest, not a pause');
  }
  const doorTrips = all.filter((entry) => entry.insideDoor);
  assert.ok(doorTrips.length > 0, 'someone went indoors during the day');
  for (const trip of doorTrips) {
    const next = all.find((entry) => entry.slot === trip.slot && entry.index === trip.index + 1);
    if (next) {
      assert.equal(next.from, trip.to, 'they come back out of the same door');
      assert.equal(next.fromDoor, true);
    }
  }
});

test('no two slots hold the same rest spot at once', () => {
  for (const daySeed of [42, 1896, 7]) {
    const state = createCrowdState(daySeed);
    // Walk the day in strides and collect as we go: chains prune to the last
    // two assignments, so a single jump to midnight loses the day's rests.
    const rests = new Map();
    for (let seconds = 0; seconds < 24 * 3600; seconds += 600) {
      for (let slot = 0; slot < state.slots.length; slot += 1) {
        ensureSlotCoverage(state, slot, graph, seconds);
        for (const entry of state.slots[slot].assignments) {
          if (entry.occupy) rests.set(`${slot}/${entry.index}`, { slot, ...entry });
        }
      }
    }
    const seated = [...rests.values()];
    assert.ok(seated.length > 0, 'someone sat down');
    for (const a of seated) {
      for (const b of seated) {
        if (a === b || a.occupy.spotId !== b.occupy.spotId) continue;
        assert.ok(
          a.startSeconds >= b.endSeconds || a.endSeconds <= b.startSeconds,
          `${a.occupy.spotId} double-booked by slots ${a.slot} and ${b.slot}`,
        );
      }
    }
  }
});

test('the schedule advances at the civil pace, matching real-time legs', async () => {
  const { DEFAULT_CLOCK_RATE } = await import('../src/world/clock.js');
  const state = createCrowdState(9);
  const spec = ensureSlotCoverage(state, 0, graph, NOON);
  const walking = spec.path ? spec : state.slots[0].assignments.find((entry) => entry.path);
  assert.ok(walking);
  const early = crowdSlotLogical(state, 0, graph, walking.startSeconds + 40);
  if (early.assignment === walking && !early.dwelling) {
    const expected = 40 * (walking.pace / DEFAULT_CLOCK_RATE);
    assert.ok(Math.abs(early.distance - expected) < 1e-9,
      `distance ${early.distance} vs ${expected}`);
  }
  // A figure walking at `pace` real metres per real second keeps up exactly.
  assert.ok(Math.abs(walking.walkSeconds - walking.length / walking.civilPace) < 1e-9);
});
