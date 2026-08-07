import test from 'node:test';
import assert from 'node:assert/strict';
import { requestTravel, takeArrival } from '../src/world/travel.js';

function fakeRuntime() {
  const calls = [];
  return { calls, set: (id, value) => calls.push([id, value]) };
}

const TRANSITION = {
  id: 'to-park',
  to: { zone: 'central-park', spawn: [0, 0, 24.5], facing: [0, -1] },
};

test('travel sets the zone and stores the arrival once', () => {
  const runtime = fakeRuntime();
  requestTravel(runtime, TRANSITION);
  assert.deepEqual(runtime.calls, [['zone', 'central-park']]);
  const arrival = takeArrival('central-park');
  assert.deepEqual(arrival.spawn, [0, 0, 24.5]);
  assert.equal(takeArrival('central-park'), null, 'consumed exactly once');
});

test('arrival for the wrong zone is not consumed', () => {
  requestTravel(fakeRuntime(), TRANSITION);
  assert.equal(takeArrival('waiting-room'), null);
  assert.notEqual(takeArrival('central-park'), null, 'still waiting for the right zone');
});
