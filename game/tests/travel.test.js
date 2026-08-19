import test from 'node:test';
import assert from 'node:assert/strict';
import {
  availableFastTravelDestinations,
  FAST_TRAVEL_DESTINATIONS,
  requestFastTravel,
  travelMinutesBetween,
  requestTravel,
  takeArrival,
} from '../src/world/travel.js';

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

test('fast travel costs time without charging for staying put', () => {
  assert.equal(travelMinutesBetween('consulting-office', 'waiting-room'), 4);
  assert.equal(travelMinutesBetween('central-park', 'consulting-office'), 40);
  assert.equal(travelMinutesBetween('central-park', 'central-park'), 0);
});

test('arrival for the wrong zone is not consumed', () => {
  requestTravel(fakeRuntime(), TRANSITION);
  assert.equal(takeArrival('waiting-room'), null);
  assert.notEqual(takeArrival('central-park'), null, 'still waiting for the right zone');
});

test('fast travel knows the park and three indoor destinations', () => {
  assert.deepEqual(
    FAST_TRAVEL_DESTINATIONS.map(({ id }) => id),
    ['central-park', 'cattell-lab', 'waiting-room', 'consulting-office'],
  );
});

test('Central Park is offered everywhere except Central Park', () => {
  assert.deepEqual(
    availableFastTravelDestinations('consulting-office').map(({ id }) => id),
    ['central-park', 'cattell-lab', 'waiting-room', 'consulting-office'],
  );
  assert.deepEqual(
    availableFastTravelDestinations('central-park').map(({ id }) => id),
    ['cattell-lab', 'waiting-room', 'consulting-office'],
  );
});

test('fast travel uses the destination spawn and facing', () => {
  const runtime = fakeRuntime();
  const destination = requestFastTravel(runtime, 'cattell-lab');
  assert.equal(destination.id, 'cattell-lab');
  assert.deepEqual(runtime.calls, [['zone', 'cattell-lab']]);
  assert.deepEqual(takeArrival('cattell-lab'), {
    zone: 'cattell-lab',
    spawn: [1.2, 0, 4.4],
    facing: [0, 0, -1],
  });
});

test('unknown fast travel destination does nothing', () => {
  const runtime = fakeRuntime();
  assert.equal(requestFastTravel(runtime, 'somewhere-else'), null);
  assert.deepEqual(runtime.calls, []);
});
