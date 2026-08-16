import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  HOTEL_DOORMAN_ANIMATIONS,
  HOTEL_DOORMAN_PLACEMENTS,
  doormanBumpMotion,
  hotelDoormenForZone,
  isPassingPedestrian,
} from '../src/world/hotelDoormen.js';
import { buildWalkGraph } from '../src/world/walkGraph.js';

function glbJson(bytes) {
  const jsonLength = bytes.readUInt32LE(12);
  return JSON.parse(bytes.subarray(20, 20 + jsonLength).toString('utf8').replace(/\0+$/, ''));
}

function pointToSegmentDistance(point, start, end) {
  const dx = end[0] - start[0];
  const dz = end[1] - start[1];
  const length2 = dx * dx + dz * dz;
  const t = length2 === 0
    ? 0
    : Math.max(0, Math.min(1, ((point[0] - start[0]) * dx + (point[1] - start[1]) * dz) / length2));
  return Math.hypot(point[0] - (start[0] + dx * t), point[1] - (start[1] + dz * t));
}

test('the two doormen occupy the hotel exterior and lobby without blocking travel spawns', () => {
  assert.equal(HOTEL_DOORMAN_PLACEMENTS.length, 2);
  assert.equal(hotelDoormenForZone('central-park').length, 1);
  assert.equal(hotelDoormenForZone('new-netherland-lobby').length, 1);

  const exterior = hotelDoormenForZone('central-park')[0];
  assert.ok(Math.hypot(exterior.position[0] - 109.2, exterior.position[2] - 70.9) > 1.7);
  const lobby = hotelDoormenForZone('new-netherland-lobby')[0];
  assert.ok(Math.hypot(lobby.position[0] + 5.4, lobby.position[2]) > 1.2);
  assert.ok(lobby.position[0] > -8 && lobby.position[0] < 8);
  assert.ok(lobby.position[2] > -9 && lobby.position[2] < 9);
});

test('repeated doorman bumps escalate and then remain argumentative', () => {
  assert.equal(doormanBumpMotion(0), 'Acknowledging');
  assert.equal(doormanBumpMotion(1), 'MildlyAnnoyed');
  assert.equal(doormanBumpMotion(2), 'StandingArguing');
  assert.equal(doormanBumpMotion(8), 'StandingArguing');
});

test('only nearby moving pedestrians qualify for an exterior nod', () => {
  const position = HOTEL_DOORMAN_PLACEMENTS[0].position;
  assert.equal(isPassingPedestrian({ kind: 'pedestrian', x: 107.2, z: 73, velocity: [0, 1], r: 0.45 }, position), true);
  assert.equal(isPassingPedestrian({ kind: 'pedestrian', x: 107.2, z: 73, velocity: [0, 0], r: 0.45 }, position), false);
  assert.equal(isPassingPedestrian({ kind: 'carriage', x: 107.2, z: 73, velocity: [0, 1], r: 0.45 }, position), false);
  assert.equal(isPassingPedestrian({ kind: 'pedestrian', x: 95, z: 73, velocity: [0, 1], r: 0.45 }, position), false);
});

test('a crowd sidewalk edge actually passes the exterior doorman', () => {
  const graph = buildWalkGraph();
  const point = [HOTEL_DOORMAN_PLACEMENTS[0].position[0], HOTEL_DOORMAN_PLACEMENTS[0].position[2]];
  const nearest = Math.min(...graph.edges
    .filter((edge) => edge.kind === 'sidewalk')
    .flatMap((edge) => edge.points.slice(1).map((end, index) =>
      pointToSegmentDistance(point, edge.points[index], end))));
  assert.ok(nearest < 1.6, `nearest sidewalk distance ${nearest}`);
});

test('the shipped doorman assets contain the full approved motion library', async () => {
  const [modelBytes, motionBytes] = await Promise.all([
    readFile(new URL('../public/models/hotel-doorman.glb', import.meta.url)),
    readFile(new URL('../public/models/hotel-doorman-motions.glb', import.meta.url)),
  ]);
  const model = glbJson(modelBytes);
  const motions = glbJson(motionBytes);
  assert.deepEqual(model.animations.map((entry) => entry.name), ['DoormanIdle']);
  assert.deepEqual(
    new Set([...model.animations, ...motions.animations].map((entry) => entry.name)),
    new Set(HOTEL_DOORMAN_ANIMATIONS),
  );
  for (const material of model.materials) {
    assert.equal(material.alphaMode ?? 'OPAQUE', 'OPAQUE', material.name);
  }
});
