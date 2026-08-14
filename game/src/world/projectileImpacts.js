import {
  facadeFaceRole,
  facadeLayoutForFace,
  facadeWidth,
  facadeWindowEntries,
  FACES,
} from './facade.js';

const WINDOW_SLOP = 0.13;

function clampMagnitude(vector, maximum) {
  const speed = Math.hypot(vector[0], vector[1], vector[2]);
  if (speed <= maximum || speed === 0) return vector;
  const scale = maximum / speed;
  return vector.map((component) => component * scale);
}

// Rapier supplies a contact normal, but its sign depends on collider order.
// Orient it against the incoming velocity so reflection always exits contact.
export function impactNormal(normal, velocity) {
  const length = Math.hypot(normal?.x ?? normal?.[0] ?? 0, normal?.y ?? normal?.[1] ?? 0, normal?.z ?? normal?.[2] ?? 0) || 1;
  const result = [
    (normal?.x ?? normal?.[0] ?? 0) / length,
    (normal?.y ?? normal?.[1] ?? 0) / length,
    (normal?.z ?? normal?.[2] ?? 0) / length,
  ];
  const dot = result[0] * velocity[0] + result[1] * velocity[1] + result[2] * velocity[2];
  return dot > 0 ? result.map((component) => -component) : result;
}

export function resolvedImpactVelocity(velocity, normal, definition) {
  const n = impactNormal(normal, velocity);
  const incoming = velocity[0] * n[0] + velocity[1] * n[1] + velocity[2] * n[2];
  const floorLike = n[1] > 0.55;
  const bounce = floorLike ? definition.groundBounce : definition.wallBounce;
  const tangentKeep = floorLike
    ? (definition.groundMomentum ?? 0.45)
    : (definition.wallMomentum ?? 0.6);
  const tangent = velocity.map((component, axis) => component - n[axis] * incoming);
  const reflected = tangent.map(
    (component, axis) => component * tangentKeep - n[axis] * incoming * bounce,
  );
  if (floorLike && Math.abs(reflected[1]) < 0.9) reflected[1] = 0;
  return clampMagnitude(reflected, definition.impactSpeedCap);
}

export function projectilePushOut(position, normal, distance = 0.025) {
  const length = Math.hypot(normal[0], normal[1], normal[2]) || 1;
  return position.map(
    (component, axis) => component + (normal[axis] / length) * Math.max(0.012, distance),
  );
}

// Window panes on the procedural street facades share facadeLayout. This
// keeps hit testing aligned with the same records used to paint and instance
// the windows, without adding hundreds of glass physics bodies.
export function facadeWindowAt(position, buildings = [], margin = WINDOW_SLOP) {
  for (const building of buildings) {
    if (building.kind !== 'backdrop' || !building.windowFaces?.length) continue;
    const [cx, cy, cz] = building.position;
    const [sx, sy, sz] = building.size;
    for (const [faceIndex, token] of building.windowFaces.entries()) {
      const face = FACES[token];
      if (!face) continue;
      const faceWidth = facadeWidth(building.size, token);
      const layout = facadeLayoutForFace(building, token);
      const halfDepth = (face.normal[2] !== 0 ? sz : sx) / 2;
      const planeX = cx + face.normal[0] * halfDepth;
      const planeZ = cz + face.normal[2] * halfDepth;
      const fromPlane = (position[0] - planeX) * face.normal[0]
        + (position[2] - planeZ) * face.normal[2];
      if (Math.abs(fromPlane) > margin) continue;
      const along = (position[0] - cx) * face.right[0] + (position[2] - cz) * face.right[2];
      const u = along / faceWidth + 0.5;
      const vPx = ((cy + sy / 2 - position[1]) / sy) * layout.texH;
      const windows = facadeWindowEntries(layout, facadeFaceRole(building, token, faceIndex));
      for (const win of windows) {
        const u0 = win.x / layout.texW;
        const u1 = (win.x + win.w) / layout.texW;
        if (u < u0 || u > u1 || vPx < win.y || vPx > win.y + win.h) continue;
        return {
          id: `${building.id}:${token}:${win.floor ?? 'ground'}:${win.col}`,
          position: [
            cx + face.right[0] * ((win.x + win.w / 2) / layout.texW - 0.5) * faceWidth
              + face.normal[0] * (halfDepth + 0.04),
            cy + sy / 2 - ((win.y + win.h / 2) / layout.texH) * sy,
            cz + face.right[2] * ((win.x + win.w / 2) / layout.texW - 0.5) * faceWidth
              + face.normal[2] * (halfDepth + 0.04),
          ],
          width: (win.w / layout.texW) * faceWidth,
          height: (win.h / layout.texH) * sy,
          normal: [...face.normal],
          yaw: face.yaw,
        };
      }
    }
  }
  return null;
}
