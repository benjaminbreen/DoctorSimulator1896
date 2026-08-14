import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  PARK_GARDENER_ANIMATIONS,
  PARK_GARDENER_CLIP_SECONDS,
  PARK_GARDENER_DAY,
  PARK_GARDENER_WORK_CYCLE_SECONDS,
  gardenerOneShotGameSeconds,
  parkGardenerScheduleState,
} from '../src/world/parkGardener.js';
import { buildWateringCan } from '../src/scene/wateringCan.js';

function glbJson(bytes) {
  const jsonLength = bytes.readUInt32LE(12);
  return JSON.parse(bytes.subarray(20, 20 + jsonLength).toString('utf8').replace(/\0+$/, ''));
}

test('the gardener works all day, watches Roosevelt, and leaves in the evening', () => {
  assert.equal(parkGardenerScheduleState(PARK_GARDENER_DAY.startHour - 0.01).active, false);
  assert.equal(parkGardenerScheduleState(8).active, true);
  const speech = parkGardenerScheduleState(9.5);
  assert.equal(speech.phase, 'watching-roosevelt-speech');
  assert.equal(speech.animation, 'GardenerIdle');
  assert.equal(speech.carryingCan, false);
  assert.equal(parkGardenerScheduleState(PARK_GARDENER_DAY.endHour).active, false);
});

test('one gardener cycle includes walking, two watering jobs, digging, kneeling, and a bench rest', () => {
  const sampled = [];
  for (let second = 0; second < PARK_GARDENER_WORK_CYCLE_SECONDS; second += 2) {
    sampled.push(parkGardenerScheduleState(7 + second / 3600));
  }
  assert.ok(sampled.some((state) => state.animation === 'WalkingCarry'));
  assert.ok(sampled.filter((state) => state.animation === 'WalkingCarry').every((state) => (
    state.carryingCan && state.moving
  )));
  assert.ok(sampled.filter((state) => state.animation === 'Watering').length > 2);
  assert.ok(sampled.some((state) => state.animation === 'KneelingDown'));
  assert.ok(sampled.some((state) => state.animation === 'DigAndPlantSeeds'));
  assert.ok(sampled.some((state) => state.animation === 'BenchRest'));
});

test('kneeling and standing schedule slots cannot cut the one-shot clip short', () => {
  const realSeconds = gardenerOneShotGameSeconds('KneelingDown') / 4;
  assert.ok(realSeconds >= PARK_GARDENER_CLIP_SECONDS.KneelingDown + 0.25);
});

test('the code-built watering can is a shiny galvanized six-part prop', () => {
  const can = buildWateringCan();
  assert.equal(can.group.name, 'galvanized-watering-can');
  assert.equal(can.meshes.length, 6);
  assert.ok(can.meshes.every((mesh) => mesh.material.metalness >= 0.8));
  can.dispose();
});

test('the shipped gardener assets use the full compatible Mixamo animation set', async () => {
  const [modelBytes, motionBytes] = await Promise.all([
    readFile(new URL('../public/models/central-park-gardener.glb', import.meta.url)),
    readFile(new URL('../public/models/central-park-gardener-motions.glb', import.meta.url)),
  ]);
  const model = glbJson(modelBytes);
  const motions = glbJson(motionBytes);
  assert.equal(model.skins[0].joints.length, 65);
  assert.equal(motions.skins[0].joints.length, 65);
  assert.deepEqual(
    new Set([...model.animations, ...motions.animations].map((entry) => entry.name)),
    new Set(PARK_GARDENER_ANIMATIONS),
  );
  for (const material of model.materials) {
    assert.equal(material.alphaMode ?? 'OPAQUE', 'OPAQUE', material.name);
  }
});
