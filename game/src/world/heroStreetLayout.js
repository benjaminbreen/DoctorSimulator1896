// Authored paving at the southeast park entrance. The street grid remains
// reusable, but this landmark needs a deliberate outline and a carriage
// apron instead of a rectangular ground box.

function radialInset(points, center, amount) {
  return points.map(([x, z]) => {
    const dx = x - center[0];
    const dz = z - center[1];
    const distance = Math.hypot(dx, dz) || 1;
    const scale = Math.max(0, distance - amount) / distance;
    return [center[0] + dx * scale, center[1] + dz * scale];
  });
}

export const GRAND_ARMY_APRON = {
  id: 'grand-army-apron',
  center: [85, 71.5],
  // The southeast and east edges meet the north sidewalk of Central Park
  // South and the west sidewalk of Fifth Avenue at their property lines.
  outer: [
    [95.8, 82.8],
    [82.4, 82.8],
    [77.2, 81.0],
    [73.5, 77.2],
    [72.4, 72.5],
    [73.8, 67.4],
    [77.4, 62.7],
    [82.8, 59.6],
    [88.7, 59.8],
    [92.9, 62.8],
    [95.1, 67.5],
    [95.8, 72.5],
  ],
  driveThroat: [
    [80.0, 61.4],
    [79.2, 55.0],
    [84.8, 52.9],
    [87.0, 59.9],
  ],
  // A carriage entrance crosses the pedestrian edge and reaches the
  // northwest curb return. This is the missing constructed link that left a
  // lawn strip between the former plaza slab and the street.
  streetMouth: [
    [88.0, 77.7],
    [90.0, 76.9],
    [92.4, 75.8],
    [94.0, 78.1],
    [96.2, 80.8],
    [99.0, 83.9],
    [99.0, 88.1],
    [96.4, 85.8],
    [94.3, 83.9],
    [91.8, 82.7],
    [87.2, 82.2],
  ],
};

// The promenade is deliberately narrow. Most of the footprint is a dark
// carriage apron, matching the visual hierarchy of the approved paint-over.
GRAND_ARMY_APRON.inner = radialInset(
  GRAND_ARMY_APRON.outer,
  GRAND_ARMY_APRON.center,
  1.55,
);
GRAND_ARMY_APRON.edgeInner = radialInset(
  GRAND_ARMY_APRON.outer,
  GRAND_ARMY_APRON.center,
  0.22,
);

export function pointInPolygon(x, z, points) {
  let inside = false;
  for (let index = 0, previous = points.length - 1; index < points.length; previous = index, index += 1) {
    const [xi, zi] = points[index];
    const [xj, zj] = points[previous];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

export function insideGrandArmyConstruction(x, z) {
  return [
    GRAND_ARMY_APRON.outer,
    GRAND_ARMY_APRON.driveThroat,
    GRAND_ARMY_APRON.streetMouth,
  ].some((polygon) => pointInPolygon(x, z, polygon));
}
