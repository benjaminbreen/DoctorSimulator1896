import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  PEDESTRIAN_STROLLER_CIRCUITS,
  strollerScheduleState,
} from '../src/world/strollerPedestrians.js';
import { pathsDistance } from '../src/world/terrain.js';
import {
  buildPeriodStroller,
  STROLLER_WHEEL_RADIUS,
} from '../src/scene/strollerModel.js';

test('two stroller women have distinct closed park itineraries', () => {
  assert.equal(PEDESTRIAN_STROLLER_CIRCUITS.length, 2);
  assert.deepEqual(new Set(PEDESTRIAN_STROLLER_CIRCUITS.map((entry) => entry.who)), new Set(['h', 'w']));
  assert.equal(new Set(PEDESTRIAN_STROLLER_CIRCUITS.map((entry) => entry.label)).size, 2);
  assert.equal(new Set(PEDESTRIAN_STROLLER_CIRCUITS.map((entry) => entry.points.length)).size, 2);
  assert.equal(PEDESTRIAN_STROLLER_CIRCUITS.find((entry) => entry.who === 'w')?.labelOverride, 'Middle-aged nursemaid');

  for (const circuit of PEDESTRIAN_STROLLER_CIRCUITS) {
    assert.equal(circuit.loop, true);
    assert.deepEqual(circuit.points[0], circuit.points.at(-1), `${circuit.id} closes`);
    assert.ok(circuit.speed > 0 && circuit.speed < 1.2);
    for (const [x, z] of circuit.points) {
      assert.ok(pathsDistance(x, z) < 0.05, `${circuit.id} leaves a park walk at ${x},${z}`);
    }
  }
});

test('each stroller schedule deterministically alternates walking and pauses', () => {
  const schedules = PEDESTRIAN_STROLLER_CIRCUITS.map((entry) => entry.schedule);
  assert.notDeepEqual(schedules[0], schedules[1]);
  for (const schedule of schedules) {
    assert.equal(strollerScheduleState(schedule, 0).paused, false, 'both start the scene in motion');
    const pauseAt = schedule.walkSeconds - schedule.phaseSeconds + 0.1;
    assert.equal(strollerScheduleState(schedule, pauseAt).paused, true);
    const resumeAt = schedule.walkSeconds + schedule.pauseSeconds - schedule.phaseSeconds + 0.1;
    assert.equal(strollerScheduleState(schedule, resumeAt).paused, false);
    assert.deepEqual(strollerScheduleState(schedule, pauseAt), strollerScheduleState(schedule, pauseAt));
  }
});

test('the period stroller has four rolling wheels and a bounded human-scale body', () => {
  const stroller = buildPeriodStroller('green');
  try {
    assert.equal(stroller.wheels.length, 4);
    assert.equal(stroller.wheelRadius, STROLLER_WHEEL_RADIUS);
    assert.ok(stroller.meshes.length >= 20);
    const bounds = new THREE.Box3().setFromObject(stroller.group);
    const size = bounds.getSize(new THREE.Vector3());
    assert.ok(bounds.min.y >= -0.02, `lowest point ${bounds.min.y}`);
    assert.ok(size.x > 0.7 && size.x < 1.1, `width ${size.x}`);
    assert.ok(size.y > 1 && size.y < 1.5, `height ${size.y}`);
    assert.ok(size.z > 1.1 && size.z < 1.7, `length ${size.z}`);
  } finally {
    stroller.dispose();
  }
});
