// Shared seating metadata. Chairs and benches already placed in a blueprint
// become ordinary E-key affordances; the simulation still decides whether
// resting there changes either player meter.

const SEAT_MODEL = /(chair|bench|sofa|settee|couch)/i;

function seatKind(model = '') {
  if (/bench/i.test(model)) return 'bench';
  if (/sofa|settee|couch/i.test(model)) return 'sofa';
  return 'chair';
}

/** Add a sitting affordance to a catalog chair or bench that has no action. */
export function withSeatAffordance(item) {
  if (item.affordance || !SEAT_MODEL.test(item.model ?? '')) return item;
  const kind = seatKind(item.model);
  return {
    ...item,
    affordance: {
      kind: 'seat',
      verb: 'Sit on',
      name: `the ${kind}`,
    },
  };
}

/** First-person eye and facing from a model's floor-contact pose. */
export function seatFraming(item) {
  const yaw = item.yaw ?? 0;
  // Converted furniture faces +z at yaw 0.
  const facingX = Math.sin(yaw);
  const facingZ = Math.cos(yaw);
  const height = Math.max(0.38, Math.min(0.52, (item.size?.[1] ?? 1) * 0.42));
  const eyeY = item.position[1] + height + 0.72;
  const eyeX = item.position[0] + facingX * 0.08;
  const eyeZ = item.position[2] + facingZ * 0.08;
  return {
    position: [eyeX, eyeY, eyeZ],
    target: [eyeX + facingX * 2, eyeY - 0.06, eyeZ + facingZ * 2],
    fov: 58,
  };
}
