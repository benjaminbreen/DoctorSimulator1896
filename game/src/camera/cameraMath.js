// Pure camera math: shoulder target, pitch clamp, and the occlusion ray
// against blueprint boxes. No three.js, unit-tested.

import { clamp } from '../movement/mathUtils.js';

// Rotate the shoulder offset (side, up, back) by pitch then yaw and add to the
// player position. Positive pitch raises the eye. yaw=0 faces -Z, so the
// camera sits at +Z behind the player.
export function computeEyeTarget({ playerPos, yaw, pitch, side, up, back }) {
  const cp = Math.cos(pitch);
  const sp = Math.sin(pitch);
  const y1 = up * cp + back * sp;
  const z1 = back * cp - up * sp;
  const cy = Math.cos(yaw);
  const sy = Math.sin(yaw);
  return [
    playerPos[0] + side * cy + z1 * sy,
    playerPos[1] + y1,
    playerPos[2] - side * sy + z1 * cy,
  ];
}

export function clampPitch(pitch, tunables) {
  return clamp(pitch, tunables.pitchMin, tunables.pitchMax);
}

// Ray vs yawed box (center position, full extents). Returns hit distance or null.
export function rayVsBox(origin, direction, box) {
  const yaw = box.yaw || 0;
  const cos = Math.cos(-yaw);
  const sin = Math.sin(-yaw);
  const ox = origin[0] - box.position[0];
  const oz = origin[2] - box.position[2];
  const localOrigin = [ox * cos - oz * sin, origin[1] - box.position[1], ox * sin + oz * cos];
  const localDirection = [
    direction[0] * cos - direction[2] * sin,
    direction[1],
    direction[0] * sin + direction[2] * cos,
  ];

  let tMin = 0;
  let tMax = Infinity;
  for (let axis = 0; axis < 3; axis += 1) {
    const half = box.size[axis] / 2;
    if (Math.abs(localDirection[axis]) < 1e-9) {
      if (Math.abs(localOrigin[axis]) > half) return null;
      continue;
    }
    const inverse = 1 / localDirection[axis];
    let t1 = (-half - localOrigin[axis]) * inverse;
    let t2 = (half - localOrigin[axis]) * inverse;
    if (t1 > t2) [t1, t2] = [t2, t1];
    tMin = Math.max(tMin, t1);
    tMax = Math.min(tMax, t2);
    if (tMin > tMax) return null;
  }
  return tMin;
}

// Longest allowed boom distance from anchor toward eyeTarget before a box
// would occlude the camera.
export function occlusionLimit(anchor, eyeTarget, boxes, { padding, minDistance }) {
  const dx = eyeTarget[0] - anchor[0];
  const dy = eyeTarget[1] - anchor[1];
  const dz = eyeTarget[2] - anchor[2];
  const full = Math.hypot(dx, dy, dz);
  if (full < 1e-6) return full;
  const direction = [dx / full, dy / full, dz / full];

  let nearest = Infinity;
  for (const box of boxes) {
    const hit = rayVsBox(anchor, direction, box);
    if (hit !== null && hit > 0 && hit < nearest) nearest = hit;
  }
  if (nearest === Infinity || nearest >= full) return full;
  // minDistance is a comfort floor, but never park the camera inside the wall.
  const padded = Math.max(minDistance, nearest - padding);
  return Math.min(padded, Math.max(nearest - 0.06, 0.25));
}
