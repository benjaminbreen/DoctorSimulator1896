import test from 'node:test';
import assert from 'node:assert/strict';
import {
  HORSE_DRAWN_MAX_ACTIVE,
  HORSE_DRAWN_ROSTER,
  HORSE_RIG_CONFIG,
  createHorseDrawnState,
  createHorseDrawnRoster,
  horseDrawnCollider,
  horseDrawnTrafficConfig,
  horseTeamOffsets,
  horseTeamPoses,
  interpolateHorseDrawnState,
  stepHorseDrawnState,
} from '../src/world/horseDrawnTraffic.js';
import { assetBuildStats } from '../src/world/proceduralAssets.js';
import { shortestArc } from '../src/movement/mathUtils.js';
import { ROUTES, sampleRoute } from '../src/world/horselessCarriage.js';

test('street roster is deterministic, bounded, and uses distinct routes', () => {
  const first = createHorseDrawnRoster();
  const second = createHorseDrawnRoster();
  assert.deepEqual(first, second);
  assert.equal(first.length, HORSE_DRAWN_MAX_ACTIVE);
  assert.ok(first.length <= 6, 'the street pass keeps at most six active rigs');
  // The Belt Line horsecar shares Central Park South with the omnibus:
  // both used the street in fact, and the car keeps to its own rails.
  assert.ok(new Set(first.map((unit) => unit.route)).size >= first.length - 1);
  assert.equal(new Set(first.map((unit) => unit.start)).size, first.length);
});

test('street roster reuses coachworks presets within its render budget', () => {
  for (const unit of createHorseDrawnRoster()) {
    assert.equal(unit.coach.coachworkType, unit.type);
    assert.equal(unit.coach.team, unit.team);
    assert.ok(assetBuildStats([unit.coach]).parts <= 140, `${unit.id} part budget`);
    assert.deepEqual(horseTeamOffsets(unit.team).length, unit.team === 'pair' ? 2 : 1);
  }
});

test('vehicle colliders cover coach and horse team without unbounded hulls', () => {
  for (const entry of HORSE_DRAWN_ROSTER) {
    const collider = horseDrawnCollider(entry.type);
    const longest = entry.type === 'horsecar' ? 3.2 : 2.3;
    assert.ok(collider.coachHalf[0] >= 1.4 && collider.coachHalf[0] <= longest);
    assert.ok(collider.coachHalf[2] >= 0.9 && collider.coachHalf[2] <= 1.2);
    assert.ok(collider.horseHalf[0] >= 1 && collider.horseHalf[0] <= 1.2);
  }
});

test('every horse rig completes a loop as a bounded two-link chain', () => {
  for (const unit of createHorseDrawnRoster()) {
    let state = unit.state;
    let travelled = 0;
    let peakCoachTurn = 0;
    let peakHorseJoint = 0;
    let peakCoachJoint = 0;
    let previousYaw = state.coachYaw;
    const rig = HORSE_RIG_CONFIG[unit.type];
    const route = ROUTES[unit.route];

    for (let i = 0; i < 360 * 60 && travelled <= route.total + 10; i += 1) {
      state = stepHorseDrawnState(state, 1 / 60, [], {
        type: unit.type, cruise: unit.cruise, lane: unit.lane,
      }, { cruise: unit.cruise, lane: unit.lane, laneLambda: 0.9, traffic: state.traffic });
      travelled += state.speed / 60;
      peakCoachTurn = Math.max(peakCoachTurn, Math.abs(shortestArc(previousYaw, state.coachYaw)));
      peakHorseJoint = Math.max(
        peakHorseJoint,
        Math.abs(shortestArc(state.drawYaw, state.horseYaw)),
      );
      peakCoachJoint = Math.max(
        peakCoachJoint,
        Math.abs(shortestArc(state.coachYaw, state.drawYaw)),
      );
      previousYaw = state.coachYaw;

      const harnessX = state.horseX - Math.sin(state.horseYaw) * 0.05;
      const harnessZ = state.horseZ - Math.cos(state.horseYaw) * 0.05;
      const drawbar = Math.hypot(harnessX - state.socketX, harnessZ - state.socketZ);
      const wheelbase = Math.hypot(
        state.frontAxleX - state.rearAxleX,
        state.frontAxleZ - state.rearAxleZ,
      );
      assert.ok(Math.abs(drawbar - rig.drawbarLength) < 1e-6);
      assert.ok(Math.abs(wheelbase - (rig.frontAxle - rig.rearAxle)) < 1e-6);
    }

    assert.ok(travelled > route.total, `${unit.type} completed its full route`);
    assert.ok(peakHorseJoint <= rig.maxHorseAngle + 1e-6, `${unit.type} horse joint ${peakHorseJoint}`);
    assert.ok(peakCoachJoint <= rig.maxSteer + 1e-6, `${unit.type} coach joint ${peakCoachJoint}`);
    assert.ok(
      peakHorseJoint + peakCoachJoint < Math.PI / 2,
      `${unit.type} never folds across the road`,
    );
    assert.ok(peakCoachTurn < 0.03, `${unit.type} coach heading changes continuously, ${peakCoachTurn}`);
  }
});

test('paired horses have separate poses and fixed states interpolate across angle seams', () => {
  const previous = createHorseDrawnState(2, 244, 1.55, 'omnibus');
  const current = {
    ...previous,
    horseX: previous.horseX + 1,
    horseYaw: Math.PI - 0.02,
    coachYaw: Math.PI - 0.03,
    drawYaw: Math.PI - 0.01,
    axleYaw: Math.PI - 0.01,
  };
  const render = interpolateHorseDrawnState({
    ...previous,
    horseYaw: -Math.PI + 0.02,
    coachYaw: -Math.PI + 0.03,
    drawYaw: -Math.PI + 0.01,
    axleYaw: -Math.PI + 0.01,
  }, current, 0.5);
  const poses = horseTeamPoses(render, 'pair');
  assert.equal(poses.length, 2);
  assert.ok(Math.hypot(poses[0].x - poses[1].x, poses[0].z - poses[1].z) > 1.2);
  assert.ok(Math.abs(Math.abs(render.horseYaw) - Math.PI) < 0.04, 'angle takes the short seam');
});

test('horse-drawn traffic keeps moving through a soft produce-cart obstruction', () => {
  const unit = createHorseDrawnRoster().find((entry) => entry.type === 'brougham');
  const config = horseDrawnTrafficConfig(unit);
  let state = createHorseDrawnState(0, 5, 1.5, 'brougham');
  const [x, z, tx, tz] = sampleRoute(ROUTES[0], 35);
  const obstacle = [{
    x: x - tz * 1.5,
    z: z + tx * 1.5,
    r: 0.52,
    trafficPolicy: 'soft',
  }];
  for (let i = 0; i < 22 * 60; i += 1) {
    state = stepHorseDrawnState(state, 1 / 60, obstacle, {
      type: 'brougham', cruise: unit.cruise, lane: 1.5,
    }, {
      cruise: unit.cruise,
      lane: 1.5,
      laneLambda: 0.9,
      traffic: state.traffic,
    });
  }
  assert.ok(state.s > 37, `wagon cleared the soft obstacle, s=${state.s}`);
  assert.ok(state.speed > 1.2, `wagon kept moving, speed=${state.speed}`);
  assert.ok(config.trafficSOffset < -1.5, 'traffic reference accounts for the coach behind the horse');
});
