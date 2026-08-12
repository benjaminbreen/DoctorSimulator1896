const queued = new Map();

export function queueCarriageProjectileHit(id, velocity, power = 1) {
  queued.set(id, {
    velocity: [velocity.x ?? velocity[0], velocity.y ?? velocity[1], velocity.z ?? velocity[2]],
    power,
  });
}

export function takeCarriageProjectileHit(id) {
  const hit = queued.get(id) ?? null;
  queued.delete(id);
  return hit;
}

export function resetCarriageProjectileHitsForTests() {
  queued.clear();
}
