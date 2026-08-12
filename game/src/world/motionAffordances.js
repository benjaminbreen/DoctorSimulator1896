// Pure queries for spatial movement affordances. Geometry builders author the
// reliable edge normal and safe side; the player controller supplies pose.

export function ledgeCandidate(affordances, { position, yaw, speed = 0 }) {
  if (speed > 0.7) return null;
  const facing = [-Math.sin(yaw), -Math.cos(yaw)];
  let best = null;
  let bestDistance = Infinity;
  for (const affordance of affordances ?? []) {
    if (affordance.type !== 'ledge') continue;
    const dx = position[0] - affordance.position[0];
    const dz = position[2] - affordance.position[2];
    const distance = Math.hypot(dx, dz);
    if (distance > (affordance.radius ?? 0.65) || distance >= bestDistance) continue;
    if (Math.abs(position[1] - affordance.position[1]) > (affordance.heightTolerance ?? 0.8)) continue;
    const outward = affordance.outward;
    const outwardLength = Math.hypot(outward?.[0] ?? 0, outward?.[1] ?? 0) || 1;
    const alignment = (facing[0] * outward[0] + facing[1] * outward[1]) / outwardLength;
    if (alignment < (affordance.facing ?? 0.58)) continue;
    best = affordance;
    bestDistance = distance;
  }
  return best;
}

