import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PARK_VISITOR_ITINERARY,
  parkVisitorItineraryState,
} from '../src/world/parkVisitorItinerary.js';

test('the nearby visitor waits until 9:34 before walking to the carousel', () => {
  for (const hour of [9.5, 9 + 33 / 60]) {
    const state = parkVisitorItineraryState(hour);
    assert.equal(state.phase, 'waiting-near-pond');
    assert.equal(state.moving, false);
    assert.equal(state.distance, 0);
  }
  const departure = parkVisitorItineraryState(9 + 34 / 60);
  assert.equal(departure.phase, 'walking-to-carousel');
  assert.equal(departure.distance, 0);
  assert.equal(departure.moving, true);
});

test('she loiters after arrival until noon, then uses the perimeter itinerary', () => {
  assert.equal(
    parkVisitorItineraryState(PARK_VISITOR_ITINERARY.carouselArrivalHour).phase,
    'loitering-at-carousel',
  );
  assert.equal(parkVisitorItineraryState(11 + 59 / 60).phase, 'loitering-at-carousel');
  assert.equal(parkVisitorItineraryState(12).phase, 'walking-to-road-perimeter');
  assert.equal(parkVisitorItineraryState(12.5).phase, 'circling-road-perimeter');
  assert.deepEqual(
    PARK_VISITOR_ITINERARY.perimeter.points[0],
    PARK_VISITOR_ITINERARY.perimeter.points.at(-1),
  );
});
