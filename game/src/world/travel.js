// Pending arrival for zone transitions. Set when the player travels through a
// door, consumed once by the new zone's mount so spawn and facing carry over.

let pending = null;

export function requestTravel(runtime, transition) {
  pending = {
    zone: transition.to.zone,
    spawn: transition.to.spawn,
    facing: transition.to.facing ?? null,
  };
  runtime.set('zone', transition.to.zone);
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
