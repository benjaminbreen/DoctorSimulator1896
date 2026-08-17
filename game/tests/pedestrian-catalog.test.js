import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  CROWD_CAST_AGES,
  currentPedestrianCast,
  PEDESTRIAN_ARCHETYPES,
  PEDESTRIAN_BENCH_SITTERS,
  PEDESTRIAN_FULL_MIXAMO_CLIPS,
  PEDESTRIAN_STANDERS,
  PEDESTRIAN_STRAWHAT_MOTION_FILE,
  pedestrianScheduleActive,
} from '../src/world/pedestrianCatalog.js';
import { CROWD_SLOT_ARCHETYPES } from '../src/world/crowdScheduler.js';
import { parkItems } from '../src/world/centralPark.js';
import { streetItems } from '../src/world/streetGrid.js';

test('the shipped Strawhat body material is opaque', async () => {
  const bytes = await readFile(new URL('../public/models/strawhat-pedestrian.glb', import.meta.url));
  const jsonLength = bytes.readUInt32LE(12);
  const gltf = JSON.parse(bytes.subarray(20, 20 + jsonLength).toString('utf8').replace(/\0+$/, ''));
  assert.ok(gltf.materials.length > 0);
  for (const material of gltf.materials) {
    assert.equal(material.alphaMode ?? 'OPAQUE', 'OPAQUE', material.name);
  }
});

test('the review catalog describes every current game-world pedestrian', () => {
  const cast = currentPedestrianCast();
  assert.equal(cast.length, 23 + CROWD_SLOT_ARCHETYPES.length);
  assert.equal(new Set(cast.map((entry) => entry.id)).size, cast.length);
  assert.deepEqual(new Set(cast.map((entry) => entry.archetype)), new Set(['m', 'w', 'd', 's', 'f', 'h', 'n', 'l', 'r', 'o', 'p', 'y', 'hm', 'bh']));
  assert.equal(cast.filter((entry) => entry.role === 'Ambient crowd').length, CROWD_SLOT_ARCHETYPES.length);
  assert.equal(cast.find((entry) => entry.id === 'green-bench-strawhat-sitter')?.animation, 'SittingIdle');
  assert.equal(cast.filter((entry) => entry.role === 'Pushing a stroller').length, 2);
  assert.equal(cast.filter((entry) => entry.role === 'Doorman').length, 2);
  assert.equal(cast.filter((entry) => entry.role === 'Policeman').length, 2);
  assert.equal(cast.filter((entry) => entry.archetype === 'y').length, 4);
  assert.equal(CROWD_CAST_AGES.length, CROWD_SLOT_ARCHETYPES.length);
});

test('two bowler-hat men attend the Cop Cot speech only from 9:30 to 10:00', () => {
  const audience = PEDESTRIAN_STANDERS.filter((entry) => entry.id.startsWith('roosevelt-speech-bowler-'));
  assert.equal(audience.length, 2);
  assert.ok(audience.every((entry) => entry.who === 'm' && entry.clip === 'Idle'));
  assert.ok(audience.every((entry) => pedestrianScheduleActive(entry.schedule, 9.5)));
  assert.ok(audience.every((entry) => pedestrianScheduleActive(entry.schedule, 9.99)));
  assert.ok(audience.every((entry) => !pedestrianScheduleActive(entry.schedule, 10)));
});

test('full Mixamo women share the expanded behavior library', () => {
  for (const key of ['w', 'd', 'f']) {
    const archetype = PEDESTRIAN_ARCHETYPES[key];
    assert.ok(archetype.animationSources.includes(PEDESTRIAN_STRAWHAT_MOTION_FILE));
    for (const clip of PEDESTRIAN_FULL_MIXAMO_CLIPS) {
      assert.ok(archetype.animations.includes(clip), `${key}: ${clip}`);
    }
  }
});

test('the summer-dress woman is seated or on the timed carousel itinerary only', () => {
  const summerDress = currentPedestrianCast().filter((entry) => entry.archetype === 'd');
  assert.equal(summerDress.length, 2);
  assert.deepEqual(new Set(summerDress.map((entry) => entry.role)), new Set(['Seated', 'Scheduled visitor']));
  assert.ok(summerDress.some((entry) => /^Sitting/.test(entry.animation)));
  assert.ok(summerDress.some((entry) => entry.id === 'pond-walk-visitor'));
  assert.equal(CROWD_SLOT_ARCHETYPES.includes('d'), false);
});

test('pedestrian rigs expose a startle but no fall or prone actions', () => {
  const removedActions = ['FallShoulder', 'FallGeneric', 'FallenIdle', 'RiseFromFall'];
  for (const archetype of Object.values(PEDESTRIAN_ARCHETYPES)) {
    for (const action of removedActions) {
      assert.equal(archetype.animations.includes(action), false, `${archetype.id}: ${action}`);
    }
    assert.equal(
      archetype.animationSources.some((source) => source.includes('humanoid-reactions')),
      false,
      archetype.id,
    );
  }
  for (const key of ['w', 'd', 'f', 'h']) {
    assert.ok(PEDESTRIAN_ARCHETYPES[key].animations.includes('Collision Reaction'));
    assert.ok(PEDESTRIAN_ARCHETYPES[key].animationSources.includes(PEDESTRIAN_STRAWHAT_MOTION_FILE));
  }
});

test('every current pedestrian action is valid for that rig', () => {
  for (const entry of currentPedestrianCast()) {
    const archetype = PEDESTRIAN_ARCHETYPES[entry.archetype];
    assert.ok(archetype, `missing archetype ${entry.archetype}`);
    assert.ok(archetype.animations.includes(entry.animation), `${entry.id}: ${entry.animation}`);
    assert.ok(entry.location);
  }
});

test('the Strawhat bench sitter uses a real park bench', () => {
  const sitter = PEDESTRIAN_BENCH_SITTERS.find((entry) => entry.id === 'green-bench-strawhat-sitter');
  assert.ok(sitter);
  const bench = parkItems.find((entry) => entry.id === sitter.benchId);
  assert.ok(bench, `missing bench ${sitter.benchId}`);
  assert.match(bench.model, /bench/i);
});

test('two pedestrians lean just outside authored building walls', () => {
  const leaners = PEDESTRIAN_STANDERS.filter((entry) => entry.clip === 'StandingLeaningWall');
  assert.equal(leaners.length, 2);
  for (const leaner of leaners) {
    const wall = streetItems.find((entry) => entry.id === leaner.wallId);
    assert.ok(wall, `missing wall ${leaner.wallId}`);
    const dx = Math.max(Math.abs(leaner.x - wall.position[0]) - wall.size[0] / 2, 0);
    const dz = Math.max(Math.abs(leaner.z - wall.position[2]) - wall.size[2] / 2, 0);
    const outsideDistance = Math.hypot(dx, dz);
    assert.ok(outsideDistance >= 0.25 && outsideDistance <= 0.75, `${leaner.id}: ${outsideDistance}`);
  }
});

test('the Center Drive conversation occupies opposite ends of one real bench', () => {
  const talkers = PEDESTRIAN_BENCH_SITTERS.filter((entry) => entry.id.startsWith('center-drive-bench-conversation-'));
  assert.equal(talkers.length, 2);
  assert.equal(new Set(talkers.map((entry) => entry.benchId)).size, 1);
  assert.ok(talkers.some((entry) => entry.along < 0));
  assert.ok(talkers.some((entry) => entry.along > 0));
  for (const talker of talkers) {
    assert.equal(talker.clip, 'SittingIdle');
    assert.ok(talker.ambientClips.some((clip) => /Talking|Gesticulating/.test(clip)));
    assert.ok(parkItems.some((entry) => entry.id === talker.benchId));
  }
});
