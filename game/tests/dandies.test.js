import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  DANDY_ANIMATIONS,
  DANDY_PLACEMENTS,
  dandiesForZone,
  dandyConversationActive,
  dandyGroundY,
  dandyRouteLength,
  dandyRoutePoint,
} from '../src/world/dandies.js';
import { buildWalkingStick } from '../src/scene/walkingStick.js';

function glbJson(bytes) {
  const jsonLength = bytes.readUInt32LE(12);
  return JSON.parse(bytes.subarray(20, 20 + jsonLength).toString('utf8').replace(/\0+$/, ''));
}

test('three lobby dandies and one Central Park South walker are placed', () => {
  assert.equal(DANDY_PLACEMENTS.length, 4);
  assert.equal(dandiesForZone('foyer').length, 1);
  assert.equal(dandiesForZone('new-netherland-lobby').length, 1);
  assert.equal(dandiesForZone('metropolitan-club-lobby').length, 1);
  const street = dandiesForZone('central-park')[0];
  assert.ok(street.route);
  assert.equal(dandyConversationActive(street, 9.49), true);
  assert.equal(dandyConversationActive(street, 9.5), true);
  assert.equal(dandyConversationActive(street, 9.99), true);
  assert.equal(dandyConversationActive(street, 10), false);
  assert.ok(street.route.points.slice(9).every(([, z]) => z === 97.6));
  assert.ok(dandyRouteLength(street.route.points) > 140);
});

test('the dandy route samples continuously in both directions', () => {
  const route = dandiesForZone('central-park')[0].route;
  const length = dandyRouteLength(route.points);
  assert.deepEqual(dandyRoutePoint(route.points, 0).slice(0, 2), route.points[0]);
  const end = dandyRoutePoint(route.points, length);
  assert.ok(Math.hypot(end[0] - route.points.at(-1)[0], end[1] - route.points.at(-1)[1]) < 1e-9);
  const middle = dandyRoutePoint(route.points, length * 0.7);
  assert.ok(Number.isFinite(middle[0]) && Number.isFinite(middle[1]));
  assert.ok(Number.isFinite(middle[2]) && Number.isFinite(middle[3]));
});

test('the walking dandy follows terrain in the park and drops to city sidewalk grade', () => {
  const route = dandiesForZone('central-park')[0].route;
  const parkY = dandyGroundY(...route.points[0]);
  const streetY = dandyGroundY(...route.points.at(-1));
  assert.ok(Number.isFinite(parkY));
  assert.ok(Number.isFinite(streetY));
  assert.ok(Math.abs(parkY - streetY) > 0.1, 'route does not retain one elevated knoll height');
  assert.equal(dandyGroundY(36, 97.6), streetY);
});

test('the code-built walking stick is a compact disposable four-part prop', () => {
  const stick = buildWalkingStick();
  assert.equal(stick.meshes.length, 4);
  assert.equal(stick.group.name, 'walking-stick');
  assert.ok(stick.meshes.every((mesh) => mesh.geometry.attributes.position.count > 0));
  stick.dispose();
});

test('the shipped dandy has the matching full Mixamo rig and approved motions', async () => {
  const [modelBytes, motionBytes] = await Promise.all([
    readFile(new URL('../public/models/tophat-dandy.glb', import.meta.url)),
    readFile(new URL('../public/models/tophat-dandy-motions.glb', import.meta.url)),
  ]);
  const model = glbJson(modelBytes);
  const motions = glbJson(motionBytes);
  assert.equal(model.skins[0].joints.length, 65);
  assert.equal(motions.skins[0].joints.length, 65);
  assert.deepEqual(model.animations.map((entry) => entry.name), ['DandyIdle']);
  assert.deepEqual(
    new Set([...model.animations, ...motions.animations].map((entry) => entry.name)),
    new Set(DANDY_ANIMATIONS),
  );
  for (const material of model.materials) {
    assert.equal(material.alphaMode ?? 'OPAQUE', 'OPAQUE', material.name);
  }
});
