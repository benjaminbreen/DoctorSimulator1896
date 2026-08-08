// Blueprint helpers, framework-free. Walls are authored with openings; this
// module derives the boxes that meshes, physics colliders, and the camera
// occlusion ray all share. Never author colliders separately.

const EPS = 1e-4;

// Boxes are {id, position: [x,y,z] center, size: [w,h,d] full extents, yaw}.
function makeBox(id, wall, axis, alongCenter, alongSize, yCenter, ySize) {
  const thickness = wall.size[axis === 0 ? 2 : 0];
  const position = [...wall.position];
  position[axis] += alongCenter;
  position[1] = yCenter;
  const size = axis === 0 ? [alongSize, ySize, thickness] : [thickness, ySize, alongSize];
  return { id, position, size, yaw: 0 };
}

// One wall -> solid render/collider boxes around its openings, collider-only
// blockers for blocked doors, and window holes for light placement.
export function deriveWallBoxes(wall) {
  const axis = wall.size[0] >= wall.size[2] ? 0 : 2;
  const perpAxis = axis === 0 ? 2 : 0;
  const length = wall.size[axis];
  const bottom = wall.position[1] - wall.size[1] / 2;
  const top = wall.position[1] + wall.size[1] / 2;
  const outward = Math.sign(wall.position[perpAxis]) || 1;

  const boxes = [];
  const blockers = [];
  const holes = [];
  const openings = [...(wall.openings ?? [])].sort((a, b) => a.center[0] - b.center[0]);

  let cursor = -length / 2;
  for (const opening of openings) {
    const [along, heightCenter] = opening.center;
    const [width, height] = opening.size;
    const left = along - width / 2;
    const right = along + width / 2;
    const openingBottom = heightCenter - height / 2;
    const openingTop = heightCenter + height / 2;

    if (left - cursor > EPS) {
      boxes.push(makeBox(`${wall.id}:${cursor.toFixed(2)}`, wall, axis, (cursor + left) / 2, left - cursor, wall.position[1], wall.size[1]));
    }
    if (top - openingTop > EPS) {
      boxes.push(makeBox(`${wall.id}:${opening.id}:header`, wall, axis, along, width, (openingTop + top) / 2, top - openingTop));
    }
    if (openingBottom - bottom > EPS) {
      boxes.push(makeBox(`${wall.id}:${opening.id}:sill`, wall, axis, along, width, (bottom + openingBottom) / 2, openingBottom - bottom));
    }
    if (opening.blocked) {
      blockers.push(makeBox(`${wall.id}:${opening.id}:blocker`, wall, axis, along, width, heightCenter, height));
    }
    const holePosition = [...wall.position];
    holePosition[axis] += along;
    holePosition[1] = heightCenter;
    holes.push({
      id: opening.id,
      type: opening.type,
      blocked: Boolean(opening.blocked),
      position: holePosition,
      width,
      height,
      thickness: wall.size[axis === 0 ? 2 : 0],
      normal: axis === 0 ? [0, 0, outward] : [outward, 0, 0],
    });
    cursor = right;
  }
  if (length / 2 - cursor > EPS) {
    boxes.push(makeBox(`${wall.id}:${cursor.toFixed(2)}`, wall, axis, (cursor + length / 2) / 2, length / 2 - cursor, wall.position[1], wall.size[1]));
  }
  return { boxes, blockers, holes };
}

function outlineBounds(outline) {
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const [x, z] of outline) {
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minZ = Math.min(minZ, z);
    maxZ = Math.max(maxZ, z);
  }
  return { minX, maxX, minZ, maxZ, cx: (minX + maxX) / 2, cz: (minZ + maxZ) / 2 };
}

// Invisible boundary colliders around an exterior zone's edges. Exterior
// outlines need not be centered on the origin.
function perimeterBlockers(bounds, floorY) {
  const height = 5;
  const y = floorY + height / 2;
  const width = bounds.maxX - bounds.minX;
  const depth = bounds.maxZ - bounds.minZ;
  return [
    { id: 'bounds-north', position: [bounds.cx, y, bounds.minZ - 0.5], size: [width + 2, height, 1], yaw: 0 },
    { id: 'bounds-south', position: [bounds.cx, y, bounds.maxZ + 0.5], size: [width + 2, height, 1], yaw: 0 },
    { id: 'bounds-west', position: [bounds.minX - 0.5, y, bounds.cz], size: [1, height, depth + 2], yaw: 0 },
    { id: 'bounds-east', position: [bounds.maxX + 0.5, y, bounds.cz], size: [1, height, depth + 2], yaw: 0 },
  ];
}

export function deriveRoom(blueprint) {
  const { width, depth, ceiling, floorY } = blueprint.dimensions;
  const exterior = blueprint.kind === 'exterior';
  const wallBoxes = [];
  const blockerBoxes = [];
  const windowHoles = [];
  for (const wall of blueprint.walls ?? []) {
    const derived = deriveWallBoxes(wall);
    wallBoxes.push(...derived.boxes);
    blockerBoxes.push(...derived.blockers);
    windowHoles.push(...derived.holes);
  }
  const bounds = outlineBounds(blueprint.outline);
  const centerX = exterior ? bounds.cx : 0;
  const centerZ = exterior ? bounds.cz : 0;
  if (exterior) blockerBoxes.push(...perimeterBlockers(bounds, floorY));
  return {
    exterior,
    floor: { id: 'floor', position: [centerX, floorY - 0.05, centerZ], size: [width, 0.1, depth], yaw: 0 },
    ceiling: exterior
      ? null
      : { id: 'ceiling', position: [0, floorY + ceiling + 0.05, 0], size: [width, 0.1, depth], yaw: 0 },
    wallBoxes,
    blockerBoxes,
    openingHoles: windowHoles,
    windowHoles: windowHoles.filter((hole) => hole.type === 'window'),
    furnitureBoxes: blueprint.furniture,
    lightMarkers: (blueprint.props ?? []).filter((prop) => prop.kind === 'lightMarker'),
    // Visible burner glows, separate from the lights themselves: a fixture
    // may show six flames while pooling its output into one source.
    flameMarkers: (blueprint.props ?? []).filter((prop) => prop.kind === 'flame'),
    transitions: blueprint.transitions ?? [],
    spawn: blueprint.navigation.defaultSpawn,
  };
}

function pointInPolygon([x, z], polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const [xi, zi] = polygon[i];
    const [xj, zj] = polygon[j];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

export function validateBlueprint(blueprint) {
  const errors = [];
  const { dimensions, outline, walls, furniture, navigation } = blueprint;

  const exterior = blueprint.kind === 'exterior';
  if (!(dimensions?.width > 0 && dimensions?.depth > 0 && (exterior || dimensions?.ceiling > 0))) {
    errors.push('dimensions must be positive');
  }
  if (!Array.isArray(outline) || outline.length < 3) {
    errors.push('outline needs at least 3 points');
  } else if (exterior) {
    // Exterior outlines may sit off-center; dimensions must cover the extent.
    const bounds = outlineBounds(outline);
    if (bounds.maxX - bounds.minX > dimensions.width + EPS || bounds.maxZ - bounds.minZ > dimensions.depth + EPS) {
      errors.push('outline extent exceeds dimensions');
    }
  } else {
    for (const [x, z] of outline) {
      if (Math.abs(x) > dimensions.width / 2 + EPS || Math.abs(z) > dimensions.depth / 2 + EPS) {
        errors.push(`outline point [${x}, ${z}] falls outside dimensions`);
      }
    }
  }

  for (const wall of walls ?? []) {
    if (wall.yaw !== 0) errors.push(`${wall.id}: only yaw 0 walls are supported`);
    if (wall.size.some((value) => value <= 0)) errors.push(`${wall.id}: size must be positive`);
    const axis = wall.size[0] >= wall.size[2] ? 0 : 2;
    const length = wall.size[axis];
    const bottom = wall.position[1] - wall.size[1] / 2;
    const top = wall.position[1] + wall.size[1] / 2;
    for (const opening of wall.openings ?? []) {
      const [along, heightCenter] = opening.center;
      const [width, height] = opening.size;
      if (Math.abs(along) + width / 2 > length / 2 + EPS) {
        errors.push(`${wall.id}/${opening.id}: opening exceeds wall length`);
      }
      if (heightCenter - height / 2 < bottom - EPS || heightCenter + height / 2 > top + EPS) {
        errors.push(`${wall.id}/${opening.id}: opening exceeds wall height`);
      }
    }
  }

  for (const item of furniture ?? []) {
    if (item.size.some((value) => value <= 0)) errors.push(`${item.id}: size must be positive`);
  }

  const spawn = navigation?.defaultSpawn;
  if (!spawn || !pointInPolygon([spawn[0], spawn[2]], outline ?? [])) {
    errors.push('defaultSpawn must sit inside the outline');
  }

  for (const transition of blueprint.transitions ?? []) {
    if (!(transition.radius > 0)) errors.push(`${transition.id}: radius must be positive`);
    if (!pointInPolygon(transition.position, outline ?? [])) {
      errors.push(`${transition.id}: trigger must sit inside the outline`);
    }
    if (!transition.to?.zone || !transition.to?.spawn) {
      errors.push(`${transition.id}: needs to.zone and to.spawn`);
    }
  }

  return errors;
}
