import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { APRON_W, localToWorld, walkY } from '../src/world/gapstow.js';
import { pondDepth } from '../src/world/terrain.js';
import {
  SAILOR_BOY_ANIMATIONS,
  SAILOR_BOY_BEHAVIOR_SECONDS,
  SAILOR_BOY_ROUTE,
  sailorBoyBehaviorState,
  sailorBoyGroundY,
  sailorBoyRouteLength,
  sailorBoyRoutePoint,
} from '../src/world/sailorBoy.js';

function glbJson(bytes) {
  const jsonLength = bytes.readUInt32LE(12);
  return JSON.parse(bytes.subarray(20, 20 + jsonLength).toString('utf8').replace(/\0+$/, ''));
}

test('the sailor boy cycles through dancing, running, pointing, kneeling, and play-boxing', () => {
  const sampled = [];
  for (let second = 0; second < SAILOR_BOY_BEHAVIOR_SECONDS; second += 0.25) {
    sampled.push(sailorBoyBehaviorState(second));
  }
  for (const animation of ['ChickenDance', 'Running', 'Pointing', 'KneelingDown', 'PlayPunching']) {
    assert.ok(sampled.some((state) => state.animation === animation), animation);
  }
  assert.ok(sampled.some((state) => state.holdPose));
  assert.ok(sampled.some((state) => state.reverse));
});

test('his itinerary crosses Gapstow in both directions and loiters at both destinations', () => {
  const length = sailorBoyRouteLength();
  const bridgeCenter = localToWorld(0, 0);
  const outbound = [];
  const inbound = [];
  const pondStops = [];
  const carouselStops = [];
  for (let second = 0; second < SAILOR_BOY_BEHAVIOR_SECONDS; second += 0.05) {
    const state = sailorBoyBehaviorState(second);
    const [x, z] = sailorBoyRoutePoint(state.distance);
    if (state.direction === 1) outbound.push({ ...state, x, z });
    if (state.direction === -1) inbound.push({ ...state, x, z });
    if (!state.moving && state.distance === length) pondStops.push(state);
    if (!state.moving && state.distance === 0) carouselStops.push(state);
  }
  assert.ok(outbound.length > 0);
  assert.ok(inbound.length > 0);
  assert.ok(outbound.some(({ x, z }) => Math.hypot(x - bridgeCenter[0], z - bridgeCenter[1]) < 0.2));
  assert.ok(inbound.some(({ x, z }) => Math.hypot(x - bridgeCenter[0], z - bridgeCenter[1]) < 0.2));
  assert.ok(pondStops.some((state) => state.phase === 'loitering-by-pond'));
  assert.ok(carouselStops.some((state) => state.phase === 'dancing-at-carousel'));
});

test('his route crosses the authored Gapstow deck and stays out of Pond water', () => {
  const length = sailorBoyRouteLength();
  assert.ok(length > 65);
  const bridgeCenter = localToWorld(0, 0);
  assert.ok(SAILOR_BOY_ROUTE.some(([x, z]) => Math.hypot(x - bridgeCenter[0], z - bridgeCenter[1]) < 1e-9));
  for (let distance = 0; distance <= length; distance += 0.25) {
    const [x, z] = sailorBoyRoutePoint(distance);
    const onBridge = Math.hypot(x - bridgeCenter[0], z - bridgeCenter[1]) <= APRON_W + 2;
    assert.ok(onBridge || pondDepth(x, z) >= 0, `wet route point ${x}, ${z}`);
    assert.ok(Number.isFinite(sailorBoyGroundY(x, z)));
  }
  assert.ok(Math.abs(sailorBoyGroundY(...bridgeCenter) - (walkY(0) + 0.02)) < 1e-9);
});

test('the shipped sailor boy and motions use one opaque compatible Mixamo rig', async () => {
  const [modelBytes, motionBytes] = await Promise.all([
    readFile(new URL('../public/models/sailorsuit-boy.glb', import.meta.url)),
    readFile(new URL('../public/models/sailorsuit-boy-motions.glb', import.meta.url)),
  ]);
  const model = glbJson(modelBytes);
  const motions = glbJson(motionBytes);
  assert.equal(model.skins[0].joints.length, 65);
  assert.equal(motions.skins[0].joints.length, 65);
  assert.deepEqual(
    new Set([...model.animations, ...motions.animations].map((entry) => entry.name)),
    new Set(SAILOR_BOY_ANIMATIONS),
  );
  for (const material of model.materials) {
    assert.equal(material.alphaMode ?? 'OPAQUE', 'OPAQUE', material.name);
  }
});
