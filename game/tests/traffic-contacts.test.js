import test from 'node:test';
import assert from 'node:assert/strict';
import { createCarriageState } from '../src/world/horselessCarriage.js';
import {
  applyTrafficImpacts,
  beginTrafficFrame,
  reportTrafficBody,
  resetTrafficContacts,
  takeTrafficImpacts,
  trafficCircleChain,
  trafficContactBetween,
} from '../src/world/trafficContacts.js';
import {
  OPENING_CHAOS_CART_ID,
  PUSHCART_SPECS,
  pushcartStartsAsTrafficObstacle,
} from '../src/world/pushcarts.js';

test.afterEach(resetTrafficContacts);

test('the opening cabbage cart joins avoidance only after its authored strike', () => {
  assert.equal(pushcartStartsAsTrafficObstacle(OPENING_CHAOS_CART_ID), false);
  assert.ok(PUSHCART_SPECS.filter((cart) => cart.id !== OPENING_CHAOS_CART_ID)
    .every((cart) => pushcartStartsAsTrafficObstacle(cart.id)));
  const cart = PUSHCART_SPECS.find((entry) => entry.id === OPENING_CHAOS_CART_ID);
  assert.equal(cart.trafficFootprint.centers.length, 2);
  assert.ok(cart.trafficFootprint.radius >= 0.5);
});

test('circle chains follow vehicle heading and find plan-view overlap', () => {
  const a = { circles: trafficCircleChain(0, 0, 0, [-0.5, 0.5], 0.6), vx: 0, vz: 2 };
  const b = { circles: trafficCircleChain(0, 1.8, Math.PI, [-0.5, 0.5], 0.6), vx: 0, vz: -2 };
  const contact = trafficContactBetween(a, b);
  assert.ok(contact);
  assert.ok(contact.penetration > 0);
  assert.ok(contact.closingSpeed > 3.9);
});

test('a hard traffic contact queues opposite deflections and a crash hold', () => {
  reportTrafficBody({
    id: 'electric', circles: [{ x: -0.5, z: 0, r: 0.7 }], vx: 2, vz: 0, mass: 680,
  }, 1);
  reportTrafficBody({
    id: 'wagon', circles: [{ x: 0.5, z: 0, r: 0.7 }], vx: -2, vz: 0, mass: 900,
  }, 1);
  beginTrafficFrame(2);
  const electricImpacts = takeTrafficImpacts('electric');
  const wagonImpacts = takeTrafficImpacts('wagon');
  assert.equal(electricImpacts.length, 1);
  assert.equal(wagonImpacts.length, 1);
  assert.equal(electricImpacts[0].hard, true);
  assert.equal(electricImpacts[0].yield, false);
  assert.equal(wagonImpacts[0].yield, true);
  assert.ok(electricImpacts[0].nx < 0);
  assert.ok(wagonImpacts[0].nx > 0);

  const electric = applyTrafficImpacts({ ...createCarriageState(0, 0), speed: 2 }, electricImpacts);
  const wagon = applyTrafficImpacts({ ...createCarriageState(1, 0), speed: 2 }, wagonImpacts);
  assert.ok(electric.knockX < 0);
  assert.ok(wagon.knockX > 0);
  assert.ok(electric.speed < 2 && wagon.speed < 2);
  assert.ok(electric.crashTime >= 1.4 && wagon.crashTime >= 1.4);
  assert.equal(electric.collisionRecovery.role, 'proceed');
  assert.equal(wagon.collisionRecovery.role, 'yield');
  assert.ok(wagon.collisionRecovery.hold > 1);
});

test('one clear frame does not turn a settling pair into a new collision', () => {
  const overlappingA = { id: 'a', circles: [{ x: -0.5, z: 0, r: 0.7 }], vx: 2, vz: 0, mass: 680 };
  const overlappingB = { id: 'b', circles: [{ x: 0.5, z: 0, r: 0.7 }], vx: -2, vz: 0, mass: 680 };
  reportTrafficBody(overlappingA, 1);
  reportTrafficBody(overlappingB, 1);
  beginTrafficFrame(2);
  assert.ok(takeTrafficImpacts('a')[0].closingSpeed > 3.9);
  takeTrafficImpacts('b');

  reportTrafficBody({ ...overlappingA, circles: [{ x: -2, z: 0, r: 0.7 }] }, 2);
  reportTrafficBody({ ...overlappingB, circles: [{ x: 2, z: 0, r: 0.7 }] }, 2);
  beginTrafficFrame(3);
  reportTrafficBody(overlappingA, 3);
  reportTrafficBody(overlappingB, 3);
  beginTrafficFrame(4);

  const settling = takeTrafficImpacts('a');
  assert.equal(settling.length, 1);
  assert.equal(settling[0].closingSpeed, 0, 'brief separation remains part of the original contact');
  assert.equal(settling[0].hard, false);
});

test('numerical velocity dust cannot refresh the crash timer', () => {
  reportTrafficBody({
    id: 'a', circles: [{ x: 0, z: 0, r: 0.8 }], vx: 1e-12, vz: 0, mass: 600,
  }, 1);
  reportTrafficBody({
    id: 'b', circles: [{ x: 1.2, z: 0, r: 0.8 }], vx: 0, vz: 0, mass: 600,
  }, 1);
  beginTrafficFrame(2);
  const impacts = takeTrafficImpacts('a');
  assert.equal(impacts[0].closingSpeed, 0);
  const state = applyTrafficImpacts(createCarriageState(0, 0), impacts);
  assert.equal(state.crashTime ?? 0, 0);
  assert.equal(state.collisionRecovery, null);
});

test('resting overlap receives separation without repeatedly creating a crash', () => {
  const a = { id: 'a', circles: [{ x: 0, z: 0, r: 0.8 }], vx: 0, vz: 0, mass: 600 };
  const b = { id: 'b', circles: [{ x: 1.2, z: 0, r: 0.8 }], vx: 0, vz: 0, mass: 600 };
  reportTrafficBody(a, 1);
  reportTrafficBody(b, 1);
  beginTrafficFrame(2);
  takeTrafficImpacts('a');
  takeTrafficImpacts('b');
  reportTrafficBody(a, 2);
  reportTrafficBody(b, 2);
  beginTrafficFrame(3);
  const correction = takeTrafficImpacts('a');
  assert.equal(correction.length, 1);
  assert.ok(correction[0].separation > 0);
  assert.equal(correction[0].closingSpeed, 0);
  assert.equal(correction[0].hard, false);
});

test('batched contacts are independent of vehicle report order', () => {
  const a = { id: 'a', circles: [{ x: -0.5, z: 0, r: 0.7 }], vx: 2, vz: 0, mass: 680 };
  const b = { id: 'b', circles: [{ x: 0.5, z: 0, r: 0.7 }], vx: -2, vz: 0, mass: 900 };
  const run = (first, second) => {
    resetTrafficContacts();
    reportTrafficBody(first, 1);
    reportTrafficBody(second, 1);
    beginTrafficFrame(2);
    return {
      a: takeTrafficImpacts('a'),
      b: takeTrafficImpacts('b'),
    };
  };
  assert.deepEqual(run(a, b), run(b, a));
});
