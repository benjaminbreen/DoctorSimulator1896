import test from 'node:test';
import assert from 'node:assert/strict';
import { withSeatAffordance, seatFraming } from '../src/world/seating.js';
import { parkProp } from '../src/world/parkCatalog.js';

test('catalog chairs and benches become E-key seating affordances', () => {
  const chair = withSeatAffordance({
    id: 'chair',
    model: 'chair_big_01',
    position: [1, 0, 2],
    size: [0.8, 1.1, 0.8],
    yaw: 0,
  });
  assert.deepEqual(chair.affordance, { kind: 'seat', verb: 'Sit on', name: 'the chair' });

  const bench = parkProp('bench', 'small_park_bench', 4, 5, Math.PI);
  assert.deepEqual(bench.affordance, { kind: 'seat', verb: 'Sit on', name: 'the bench' });
});

test('an authored action is not replaced by generic seating', () => {
  const affordance = { kind: 'act', verb: 'Examine', name: 'the chair' };
  const item = withSeatAffordance({ model: 'ChairSmall2', affordance });
  assert.equal(item.affordance, affordance);
});

test('seat framing follows the furniture yaw from seated eye height', () => {
  const framing = seatFraming({
    position: [1, 0, 2],
    size: [1, 1, 1],
    yaw: 0,
  });
  assert.deepEqual(framing.position, [1, 1.14, 2.08]);
  assert.ok(framing.target[2] > framing.position[2], 'yaw zero should look along +z');
});
