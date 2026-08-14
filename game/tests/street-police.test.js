import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { HORSE_DRAWN_ROSTER } from '../src/world/horseDrawnTraffic.js';
import { ROUTES, sampleRoute } from '../src/world/horselessCarriage.js';
import {
  latestMajorStreetEventId,
  majorStreetEventsSince,
  reportMajorStreetEvent,
  resetMajorStreetEventsForTests,
} from '../src/world/majorStreetEvents.js';
import {
  POLICE_BUMP_SEQUENCE,
  POLICE_SPEECH_AUDIENCE,
  STREET_POLICEMAN_ANIMATIONS,
  STREET_POLICE_POSTS,
  isApproachingFemalePedestrian,
  isPassingTraffic,
  majorEventForPolice,
  policeFidgetInterval,
  policeFacingForEvent,
  policeSidestepOffset,
  policeSpeechAudienceState,
  policeTurnInterval,
  policeTurnMotion,
  policeVehicleGesture,
} from '../src/world/streetPolice.js';

function glbJson(bytes) {
  const jsonLength = bytes.readUInt32LE(12);
  return JSON.parse(bytes.subarray(20, 20 + jsonLength).toString('utf8').replace(/\0+$/, ''));
}

test('two policemen occupy the marked Central Park South posts', () => {
  assert.equal(STREET_POLICE_POSTS.length, 2);
  assert.deepEqual(STREET_POLICE_POSTS.map((post) => post.position[0]), [-50, 92]);
  for (const post of STREET_POLICE_POSTS) {
    assert.equal(post.position[2], 91);
    assert.ok(post.position[0] >= -100 && post.position[0] <= 99);
  }
});

test('two additional policemen watch the Cop Cot speech while traffic posts remain assigned', () => {
  assert.equal(POLICE_SPEECH_AUDIENCE.length, 2);
  assert.equal(STREET_POLICE_POSTS.length, 2);
  assert.equal(policeSpeechAudienceState(0, 9.49), null);
  const audience = [0, 1].map((index) => policeSpeechAudienceState(index, 9.5));
  assert.ok(audience.every(Boolean));
  assert.ok(audience.every((state) => Math.hypot(
    state.position[0] + 34,
    state.position[2] - 73,
  ) < 8));
  assert.equal(policeSpeechAudienceState(0, 10), null);
  assert.equal(policeSpeechAudienceState(1, 15), null);
});

test('passing vehicles cycle through the requested traffic gestures', () => {
  assert.deepEqual(
    Array.from({ length: 5 }, (_, index) => policeVehicleGesture(index)),
    ['Waving', 'MildlyAnnoyed', 'StandingArguing', 'Acknowledging', 'Waving'],
  );
  for (const name of ['Waving', 'MildlyAnnoyed', 'StandingArguing', 'Acknowledging']) {
    assert.ok(STREET_POLICEMAN_ANIMATIONS.includes(name));
  }
});

test('police turn on a deterministic lightly-randomized cadence and sometimes fidget', () => {
  for (let post = 0; post < 2; post += 1) {
    const turns = Array.from({ length: 12 }, (_, event) => policeTurnInterval(post, event));
    assert.ok(turns.every((seconds) => seconds >= 10 && seconds <= 30));
    assert.ok(new Set(turns.map((seconds) => seconds.toFixed(3))).size > 8);
    assert.ok(Array.from({ length: 12 }, (_, event) => policeTurnMotion(post, event)).includes('LeftTurn'));
    assert.ok(Array.from({ length: 12 }, (_, event) => policeTurnMotion(post, event)).includes('RightTurn'));
    assert.ok(policeFidgetInterval(post, 0) >= 34);
  }
  for (const name of ['ArmsCrossedFidget', 'LeftTurn', 'RightTurn']) {
    assert.ok(STREET_POLICEMAN_ANIMATIONS.includes(name));
  }
});

test('an incoming vehicle makes a posted officer step out of its line and return afterward', () => {
  const position = [92, 1.16, 91];
  const eastbound = { trafficId: 'car', x: 84, z: 91.3, speed: 3, yaw: Math.PI / 2, r: 1.7 };
  const offset = policeSidestepOffset([eastbound], position);
  assert.ok(Math.abs(offset) >= 0.4, `sidestep=${offset}`);
  assert.ok(Math.abs(position[2] + offset - eastbound.z) > Math.abs(position[2] - eastbound.z));
  assert.equal(policeSidestepOffset([], position), 0);
});

test('a player bump always produces two angry gestures in order', () => {
  assert.deepEqual(POLICE_BUMP_SEQUENCE, ['MildlyAnnoyed', 'StandingArguing']);
});

test('both police can observe one nearby major impact and face its location', () => {
  resetMajorStreetEventsForTests();
  const cursor = latestMajorStreetEventId();
  const event = reportMajorStreetEvent({
    sourceId: 'carriage-1', targetId: 'player', targetKind: 'player', x: 84, z: 94,
  });
  const firstRead = majorStreetEventsSince(cursor);
  const secondRead = majorStreetEventsSince(cursor);
  assert.deepEqual(firstRead, [event]);
  assert.deepEqual(secondRead, [event], 'one observer does not consume the event');
  const post = STREET_POLICE_POSTS[1].position;
  assert.equal(majorEventForPolice(firstRead, post), event);
  assert.ok(
    Math.abs(policeFacingForEvent(event, post) - Math.atan2(event.x - post[0], event.z - post[2])) < 1e-9,
  );
  assert.equal(majorEventForPolice(firstRead, STREET_POLICE_POSTS[0].position), null);
});

test('a kiss requires a female pedestrian moving toward the policeman', () => {
  const position = STREET_POLICE_POSTS[0].position;
  const approaching = { kind: 'pedestrian', gender: 'female', x: -50, z: 87, velocity: [0, 1], r: 0.45 };
  assert.equal(isApproachingFemalePedestrian(approaching, position), true);
  assert.equal(isApproachingFemalePedestrian({ ...approaching, gender: 'male' }, position), false);
  assert.equal(isApproachingFemalePedestrian({ ...approaching, velocity: [0, -1] }, position), false);
  assert.equal(isApproachingFemalePedestrian({ ...approaching, z: 70 }, position), false);
});

test('only nearby moving traffic triggers a traffic gesture', () => {
  const position = STREET_POLICE_POSTS[1].position;
  assert.equal(isPassingTraffic({ trafficId: 'wagon', x: 92, z: 94, speed: 2, r: 2 }, position), true);
  assert.equal(isPassingTraffic({ trafficId: 'wagon', x: 92, z: 94, speed: 0, r: 2 }, position), false);
  assert.equal(isPassingTraffic({ x: 92, z: 94, speed: 2, r: 2 }, position), false);
  assert.equal(isPassingTraffic({ trafficId: 'wagon', x: 120, z: 94, speed: 2, r: 2 }, position), false);
});

test('the added delivery wagons open on the two marked underused streets', () => {
  const eastSixtieth = HORSE_DRAWN_ROSTER.find((entry) => entry.id === 'east-sixtieth-delivery');
  const westFiftyEighth = HORSE_DRAWN_ROSTER.find((entry) => entry.id === 'west-fifty-eighth-delivery');
  assert.equal(eastSixtieth?.type, 'utility');
  assert.equal(westFiftyEighth?.type, 'utility');
  const [eastX, eastZ] = sampleRoute(ROUTES[eastSixtieth.route], eastSixtieth.start);
  const [westX, westZ] = sampleRoute(ROUTES[westFiftyEighth.route], westFiftyEighth.start);
  assert.ok(Math.hypot(eastX - 140, eastZ - 56) < 0.5, `${eastX}, ${eastZ}`);
  assert.ok(Math.hypot(westX + 65, westZ - 137.25) < 0.5, `${westX}, ${westZ}`);
});

test('the shipped policeman motion pack uses one matching 57-bone rig', async () => {
  const [modelBytes, motionBytes] = await Promise.all([
    readFile(new URL('../public/models/street-policeman.glb', import.meta.url)),
    readFile(new URL('../public/models/street-policeman-motions.glb', import.meta.url)),
  ]);
  const model = glbJson(modelBytes);
  const motions = glbJson(motionBytes);
  assert.equal(model.skins[0].joints.length, 57);
  assert.equal(motions.skins[0].joints.length, 57);
  assert.deepEqual(model.animations.map((entry) => entry.name), ['PolicemanIdle']);
  assert.deepEqual(
    motions.animations.map((entry) => entry.name),
    ['ArmsCrossedFidget', 'BlowAKiss', 'LeftTurn', 'RightTurn'],
  );
  for (const material of model.materials) {
    assert.equal(material.alphaMode ?? 'OPAQUE', 'OPAQUE', material.name);
  }
});
