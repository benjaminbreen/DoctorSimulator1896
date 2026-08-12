// Pending arrival for zone transitions. Set when the player travels through a
// door, consumed once by the new zone's mount so spawn and facing carry over.

let pending = null;

const PRACTICE_ZONES = new Set(['consulting-office', 'waiting-room', 'foyer']);

// Fast travel represents the omitted walk or carriage ride. Moving between
// rooms in the practice is brief; crossing the city consumes part of the day.
export function travelMinutesBetween(fromZone, toZone) {
  if (!fromZone || !toZone || fromZone === toZone) return 0;
  if (PRACTICE_ZONES.has(fromZone) && PRACTICE_ZONES.has(toZone)) return 2;
  return 20;
}

// Fast travel uses the same one-shot arrival contract as doors. Keeping the
// destinations here makes the simulation path testable without mounting HUD.
export const FAST_TRAVEL_DESTINATIONS = Object.freeze([
  {
    id: 'central-park',
    label: 'Central Park — Southeast Corner',
    detail: 'Fifth Avenue at 59th Street',
    noticeLabel: 'Central Park’s southeast corner',
    to: { zone: 'central-park', spawn: [82, 1.25, 68], facing: [-0.7, 0, -0.7] },
  },
  {
    id: 'cattell-lab',
    label: 'Cattell’s Psychology Lab',
    detail: 'Columbia College',
    noticeLabel: 'Cattell’s psychology laboratory',
    to: { zone: 'cattell-lab', spawn: [1.2, 0, 4.4], facing: [0, 0, -1] },
  },
  {
    id: 'waiting-room',
    label: 'Your Waiting Room',
    detail: 'The practice',
    noticeLabel: 'your waiting room',
    to: { zone: 'waiting-room', spawn: [0, 0, 4.6], facing: [0, 0, -1] },
  },
  {
    id: 'consulting-office',
    label: 'Your Consulting Room',
    detail: 'The practice',
    noticeLabel: 'your consulting room',
    to: { zone: 'consulting-office', spawn: [1.2, 0, 1.2], facing: [0, 0, -1] },
  },
]);

export function availableFastTravelDestinations(zoneId) {
  return FAST_TRAVEL_DESTINATIONS.filter(
    ({ id }) => id !== 'central-park' || zoneId !== 'central-park',
  );
}

export function requestTravel(runtime, transition) {
  pending = {
    zone: transition.to.zone,
    spawn: transition.to.spawn,
    facing: transition.to.facing ?? null,
  };
  runtime.set('zone', transition.to.zone);
}

export function requestFastTravel(runtime, destinationId) {
  const destination = FAST_TRAVEL_DESTINATIONS.find(({ id }) => id === destinationId);
  if (!destination) return null;
  requestTravel(runtime, destination);
  return destination;
}

// Non-travel rebuilds (capsule size, antialias, ...) keep the player where
// they stand instead of snapping back to the zone spawn.
export function preservePose(zone, position, yaw) {
  pending = { zone, spawn: [...position], yaw };
}

export function takeArrival(zoneId) {
  if (!pending || pending.zone !== zoneId) return null;
  const arrival = pending;
  pending = null;
  return arrival;
}
