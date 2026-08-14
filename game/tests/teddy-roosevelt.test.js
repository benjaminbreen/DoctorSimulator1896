import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  ROOSEVELT_CLUB_DEPARTURE_HOUR,
  ROOSEVELT_PARK_DEPARTURE_HOUR,
  ROOSEVELT_SPEECH_END_HOUR,
  ROOSEVELT_SPEECH_SITE,
  ROOSEVELT_SPEECH_START_HOUR,
  TEDDY_ROOSEVELT_ANIMATIONS,
  rooseveltRoutePoint,
  rooseveltScheduleState,
  rooseveltSpeechMotion,
  rooseveltSpeechPause,
} from '../src/world/teddyRoosevelt.js';

function glbJson(bytes) {
  const jsonLength = bytes.readUInt32LE(12);
  return JSON.parse(bytes.subarray(20, 20 + jsonLength).toString('utf8').replace(/\0+$/, ''));
}

test('Roosevelt follows the requested civil-time itinerary', () => {
  assert.equal(ROOSEVELT_SPEECH_START_HOUR, 9.5);
  assert.equal(ROOSEVELT_SPEECH_END_HOUR, 10);
  assert.equal(ROOSEVELT_CLUB_DEPARTURE_HOUR, 15);
  assert.equal(ROOSEVELT_PARK_DEPARTURE_HOUR, 18);
  assert.equal(rooseveltScheduleState(9.49, 'central-park').phase, 'talking-with-dandy');
  assert.equal(rooseveltScheduleState(9.5, 'central-park').phase, 'cop-cot-speech');
  assert.equal(rooseveltScheduleState(10, 'metropolitan-club-lobby').phase, 'metropolitan-club');
  assert.equal(rooseveltScheduleState(15, 'central-park').phase, 'walking-in-central-park');
  assert.equal(rooseveltScheduleState(18, 'central-park').phase, 'departed');
});

test('the speech occupies the authored Cop Cot shelter marked by the player', () => {
  assert.equal(ROOSEVELT_SPEECH_SITE.zone, 'central-park');
  assert.equal(ROOSEVELT_SPEECH_SITE.shelterId, 'cop-cot');
  assert.deepEqual(ROOSEVELT_SPEECH_SITE.position.slice(0, 1), [-34]);
  assert.equal(ROOSEVELT_SPEECH_SITE.position[2], 73);
});

test('Roosevelt alternates both speech motions and follows a continuous park loop', () => {
  assert.equal(rooseveltSpeechMotion(0), 'GesticulatingSpeech');
  assert.equal(rooseveltSpeechMotion(1), 'GivingSpeech');
  assert.ok(rooseveltSpeechPause('cop-cot-speech', 0) < rooseveltSpeechPause('metropolitan-club', 0));
  for (const distance of [0, 50, 150, 400, 900]) {
    const state = rooseveltRoutePoint(distance);
    assert.ok(state.position.every(Number.isFinite));
    assert.ok(Number.isFinite(state.yaw));
  }
});

test('the shipped Roosevelt assets use one compatible 65-bone rig', async () => {
  const [modelBytes, motionBytes] = await Promise.all([
    readFile(new URL('../public/models/teddy-roosevelt.glb', import.meta.url)),
    readFile(new URL('../public/models/teddy-roosevelt-motions.glb', import.meta.url)),
  ]);
  const model = glbJson(modelBytes);
  const motions = glbJson(motionBytes);
  assert.equal(model.skins[0].joints.length, 65);
  assert.equal(motions.skins[0].joints.length, 65);
  assert.deepEqual(
    new Set([...model.animations, ...motions.animations].map((entry) => entry.name)),
    new Set(TEDDY_ROOSEVELT_ANIMATIONS),
  );
  for (const material of model.materials) {
    assert.equal(material.alphaMode ?? 'OPAQUE', 'OPAQUE', material.name);
  }
});
