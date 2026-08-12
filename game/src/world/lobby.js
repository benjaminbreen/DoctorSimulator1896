// Architectural dressing for the office-building lobby. The room is a
// composite, not a claim about one surviving address: stone dados, a porter,
// and a rear elevator bank are the period office-building grammar.

const PI = Math.PI;

function box(id, position, size, options = {}) {
  return {
    id,
    kind: 'furniture',
    position,
    size,
    yaw: 0,
    collider: false,
    ...options,
  };
}

function cylinder(id, position, diameter, height, options = {}) {
  return box(id, position, [diameter, height, diameter], {
    shape: 'cylinder',
    radialSegments: 24,
    ...options,
  });
}

function openingSpans(wall, low, high) {
  const alongX = wall.size[0] >= wall.size[2];
  const length = alongX ? wall.size[0] : wall.size[2];
  const openings = (wall.openings ?? [])
    .filter((opening) => {
      const bottom = opening.center[1] - opening.size[1] / 2;
      const top = opening.center[1] + opening.size[1] / 2;
      return high > bottom && low < top;
    })
    .map((opening) => [opening.center[0] - opening.size[0] / 2, opening.center[0] + opening.size[0] / 2])
    .sort((a, b) => a[0] - b[0]);
  const spans = [];
  let cursor = -length / 2;
  for (const [from, to] of openings) {
    if (from > cursor) spans.push([cursor, from]);
    cursor = Math.max(cursor, to);
  }
  if (cursor < length / 2) spans.push([cursor, length / 2]);
  return spans;
}

function stoneDado(blueprint) {
  const items = [];
  const panelHeight = 1.28;
  const palette = ['#767c73', '#7f8379', '#6f766f', '#878a80'];

  for (const wall of blueprint.walls) {
    const alongX = wall.size[0] >= wall.size[2];
    const wallAt = wall.position[alongX ? 2 : 0];
    const inward = -Math.sign(wallAt) || 1;
    const halfThickness = wall.size[alongX ? 2 : 0] / 2;
    const face = wallAt + inward * (halfThickness + 0.018);
    const offset = wall.position[alongX ? 0 : 2];

    for (const [from, to] of openingSpans(wall, 0, panelHeight + 0.1)) {
      // Separate slabs leave real joints. One long grey box still reads as a
      // placeholder; metre-wide courses catch the light like cut stone.
      const count = Math.max(1, Math.ceil((to - from) / 1.15));
      const width = (to - from) / count;
      for (let index = 0; index < count; index += 1) {
        const start = from + width * index;
        const centre = start + width / 2 + offset;
        const position = alongX ? [centre, panelHeight / 2 + 0.12, face] : [face, panelHeight / 2 + 0.12, centre];
        const size = alongX ? [width - 0.012, panelHeight, 0.035] : [0.035, panelHeight, width - 0.012];
        items.push(box(`lobby-dado-${wall.id}-${index}-${start.toFixed(2)}`, position, size, {
          color: palette[(index + wall.id.length) % palette.length],
          roughness: 0.34,
          metalness: 0.02,
        }));
      }
      const centre = (from + to) / 2 + offset;
      const capPosition = alongX ? [centre, 1.45, face + inward * 0.025] : [face + inward * 0.025, 1.45, centre];
      const capSize = alongX ? [to - from, 0.105, 0.09] : [0.09, 0.105, to - from];
      items.push(box(`lobby-dado-cap-${wall.id}-${from.toFixed(2)}`, capPosition, capSize, {
        color: '#5d645e',
        roughness: 0.28,
      }));
    }
  }

  return items;
}

function ceilingWork(blueprint) {
  const { width, depth, ceiling } = blueprint.dimensions;
  const y = ceiling - 0.035;
  const plaster = '#e5ded1';
  const items = [
    box('lobby-ceiling-long-w', [-width / 2 + 0.72, y, 0], [0.16, 0.07, depth - 1.15], { color: plaster }),
    box('lobby-ceiling-long-e', [width / 2 - 0.72, y, 0], [0.16, 0.07, depth - 1.15], { color: plaster }),
  ];
  for (const [index, z] of [-5.2, -2.35, 0.55, 3.45, 6.1].entries()) {
    items.push(box(`lobby-ceiling-cross-${index}`, [0, y, z], [width - 1.25, 0.07, 0.16], { color: plaster }));
  }
  // A two-step cornice throws a readable shadow line around the ceiling.
  for (const [id, inset, drop, thickness] of [
    ['upper', 0.17, 0.11, 0.2],
    ['lower', 0.24, 0.24, 0.12],
  ]) {
    items.push(
      box(`lobby-cornice-${id}-north`, [0, ceiling - drop, -depth / 2 + inset], [width, thickness, 0.18], { color: plaster }),
      box(`lobby-cornice-${id}-south`, [0, ceiling - drop, depth / 2 - inset], [width, thickness, 0.18], { color: plaster }),
      box(`lobby-cornice-${id}-west`, [-width / 2 + inset, ceiling - drop, 0], [0.18, thickness, depth], { color: plaster }),
      box(`lobby-cornice-${id}-east`, [width / 2 - inset, ceiling - drop, 0], [0.18, thickness, depth], { color: plaster }),
    );
  }
  return items;
}

function elevatorBank() {
  const items = [];
  const frontZ = -7.53;
  const stone = '#777e77';
  const iron = '#242728';
  const brass = '#9d7d3f';

  for (const [index, centreX] of [-1.22, 1.22].entries()) {
    const prefix = `elevator-${index + 1}`;
    // Deep shadow behind the grille makes the cage read as an opening rather
    // than a decorative fence fixed to the wall.
    items.push(box(`${prefix}-shaft`, [centreX, 1.44, frontZ + 0.02], [1.82, 2.88, 0.08], {
      color: '#111516',
      roughness: 0.94,
    }));
    items.push(
      box(`${prefix}-portal-west`, [centreX - 1.0, 1.5, frontZ + 0.12], [0.18, 3.0, 0.24], { color: stone, roughness: 0.3 }),
      box(`${prefix}-portal-east`, [centreX + 1.0, 1.5, frontZ + 0.12], [0.18, 3.0, 0.24], { color: stone, roughness: 0.3 }),
      box(`${prefix}-portal-head`, [centreX, 2.93, frontZ + 0.12], [2.18, 0.22, 0.24], { color: stone, roughness: 0.3 }),
      box(`${prefix}-iron-west`, [centreX - 0.82, 1.39, frontZ + 0.26], [0.06, 2.72, 0.08], { finish: 'iron' }),
      box(`${prefix}-iron-east`, [centreX + 0.82, 1.39, frontZ + 0.26], [0.06, 2.72, 0.08], { finish: 'iron' }),
      box(`${prefix}-iron-head`, [centreX, 2.72, frontZ + 0.26], [1.7, 0.06, 0.08], { finish: 'iron' }),
    );
    for (let bar = -6; bar <= 6; bar += 1) {
      items.push(box(`${prefix}-bar-${bar}`, [centreX + bar * 0.116, 1.38, frontZ + 0.3], [0.022, 2.58, 0.035], {
        color: iron,
        metal: true,
        roughness: 0.42,
      }));
    }
    for (const [railIndex, y] of [0.42, 1.35, 2.28].entries()) {
      items.push(box(`${prefix}-rail-${railIndex}`, [centreX, y, frontZ + 0.31], [1.56, 0.055, 0.045], {
        color: brass,
        metal: true,
        roughness: 0.36,
      }));
    }
    items.push(
      box(`${prefix}-gate-seam`, [centreX, 1.38, frontZ + 0.33], [0.055, 2.58, 0.055], { finish: 'brassAged' }),
      cylinder(`${prefix}-indicator`, [centreX, 3.32, frontZ + 0.2], 0.38, 0.045, {
        rotation: [PI / 2, 0, 0],
        finish: 'brassAged',
      }),
      box(`${prefix}-indicator-face`, [centreX, 3.32, frontZ + 0.228], [0.28, 0.28, 0.018], {
        shape: 'roundedBox',
        color: '#e4d7b8',
        roughness: 0.72,
      }),
      box(`${prefix}-indicator-hand`, [centreX, 3.32, frontZ + 0.242], [0.16, 0.018, 0.018], {
        rotation: [0, 0, index ? -0.55 : 0.42],
        color: '#33261b',
        roughness: 0.45,
      }),
    );
  }

  // Shared call fixture between the two cages.
  items.push(
    box('elevator-call-plate', [0, 1.28, frontZ + 0.36], [0.18, 0.32, 0.04], { finish: 'brassAged' }),
    cylinder('elevator-call-button', [0, 1.28, frontZ + 0.39], 0.07, 0.04, {
      rotation: [PI / 2, 0, 0],
      color: '#242424',
      metal: true,
    }),
  );
  return items;
}

function transformLocal(originX, originZ, localX, localZ, yaw) {
  return [
    originX + localX * Math.cos(yaw) + localZ * Math.sin(yaw),
    originZ - localX * Math.sin(yaw) + localZ * Math.cos(yaw),
  ];
}

function doorLeaf(id, hingeX, z, direction, yaw) {
  const items = [];
  const width = 0.8;
  const height = 2.5;
  const centreLocal = direction * width / 2;
  const [centreX, centreZ] = transformLocal(hingeX, z, centreLocal, 0, yaw);
  items.push(box(`${id}-glass`, [centreX, height / 2 + 0.08, centreZ], [width - 0.14, height - 0.22, 0.025], {
    rotation: [0, yaw, 0],
    glass: true,
    color: '#b8c9c5',
    opacity: 0.2,
  }));
  for (const [part, localX, y, sx, sy] of [
    ['hinge', 0, height / 2 + 0.08, 0.08, height],
    ['meeting', direction * width, height / 2 + 0.08, 0.08, height],
    ['base', centreLocal, 0.14, width, 0.16],
    ['rail', centreLocal, 1.0, width, 0.11],
    ['head', centreLocal, height + 0.02, width, 0.12],
  ]) {
    const [x, worldZ] = transformLocal(hingeX, z, localX, 0, yaw);
    items.push(box(`${id}-${part}`, [x, y, worldZ], [sx, sy, 0.07], {
      rotation: [0, yaw, 0],
      finish: 'mahogany',
    }));
  }
  return items;
}

function vestibule() {
  const items = [];
  const wood = { finish: 'mahogany' };
  const glass = { glass: true, color: '#c0d1ce', opacity: 0.18 };
  const innerZ = 5.55;
  const outerZ = 7.48;

  // Glazed side walls form a real draught lobby instead of an unexplained
  // door in the outside wall.
  for (const side of [-1, 1]) {
    const x = side * 1.78;
    items.push(
      box(`vestibule-side-glass-${side}`, [x, 1.38, 6.52], [0.025, 2.48, 1.72], glass),
      box(`vestibule-side-sill-${side}`, [x, 0.16, 6.52], [0.08, 0.18, 1.88], wood),
      box(`vestibule-side-rail-${side}`, [x, 1.08, 6.52], [0.08, 0.11, 1.88], wood),
      box(`vestibule-side-head-${side}`, [x, 2.65, 6.52], [0.09, 0.16, 1.88], wood),
    );
    for (const [index, z] of [innerZ, (innerZ + outerZ) / 2, outerZ].entries()) {
      items.push(box(`vestibule-side-post-${side}-${index}`, [x, 1.38, z], [0.1, 2.62, 0.1], wood));
    }
  }

  // Fixed glazed panels flank the open inner pair.
  for (const side of [-1, 1]) {
    items.push(
      box(`vestibule-front-glass-${side}`, [side * 1.3, 1.38, innerZ], [0.82, 2.48, 0.025], glass),
      box(`vestibule-front-post-outer-${side}`, [side * 1.78, 1.38, innerZ], [0.1, 2.62, 0.1], wood),
      box(`vestibule-front-post-inner-${side}`, [side * 0.84, 1.38, innerZ], [0.1, 2.62, 0.1], wood),
    );
  }
  items.push(
    box('vestibule-front-head', [0, 2.68, innerZ], [3.64, 0.16, 0.11], wood),
    ...doorLeaf('vestibule-door-left', -0.84, innerZ, 1, 0.62),
    ...doorLeaf('vestibule-door-right', 0.84, innerZ, -1, -0.62),
  );
  return items;
}

function porterDetails() {
  const items = [];
  const rackX = -4.01;
  const rackZ = -4.65;
  items.push(box('porter-mail-rack', [rackX, 2.15, rackZ], [0.11, 1.55, 2.05], { finish: 'mahogany' }));
  for (let row = 0; row < 5; row += 1) {
    for (let column = 0; column < 4; column += 1) {
      items.push(box(`porter-mail-slot-${row}-${column}`, [rackX + 0.07, 1.6 + row * 0.25, rackZ - 0.72 + column * 0.48], [0.025, 0.05, 0.36], {
        finish: 'brassAged',
      }));
    }
  }

  // Brass umbrella stand and a few dark canes beside the entrance.
  items.push(
    cylinder('umbrella-stand-base', [-2.75, 0.08, 5.95], 0.5, 0.14, { finish: 'brassAged' }),
    cylinder('umbrella-stand-rim', [-2.75, 0.72, 5.95], 0.5, 0.08, { finish: 'brassAged' }),
  );
  for (let index = 0; index < 7; index += 1) {
    const angle = (index / 7) * PI * 2;
    items.push(cylinder(`umbrella-cane-${index}`, [
      -2.75 + Math.cos(angle) * 0.13,
      0.65 + (index % 3) * 0.05,
      5.95 + Math.sin(angle) * 0.13,
    ], 0.025, 1.22 + (index % 3) * 0.1, {
      color: index % 2 ? '#30241b' : '#1f2325',
      roughness: 0.55,
      rotation: [index % 2 ? 0.04 : -0.05, 0, index % 3 ? 0.035 : -0.04],
    }));
  }
  return items;
}

function floorBorders(blueprint) {
  const { width, depth } = blueprint.dimensions;
  const y = 0.011;
  const color = '#3d4541';
  return [
    box('lobby-floor-border-n', [0, y, -depth / 2 + 0.42], [width - 0.75, 0.018, 0.12], { color, roughness: 0.52 }),
    box('lobby-floor-border-s', [0, y, depth / 2 - 0.42], [width - 0.75, 0.018, 0.12], { color, roughness: 0.52 }),
    box('lobby-floor-border-w', [-width / 2 + 0.42, y, 0], [0.12, 0.018, depth - 0.75], { color, roughness: 0.52 }),
    box('lobby-floor-border-e', [width / 2 - 0.42, y, 0], [0.12, 0.018, depth - 0.75], { color, roughness: 0.52 }),
    box('lobby-floor-spine-w', [-1.25, y, 0.1], [0.07, 0.018, depth - 2.6], { color: '#7c4b3c', roughness: 0.58 }),
    box('lobby-floor-spine-e', [1.25, y, 0.1], [0.07, 0.018, depth - 2.6], { color: '#7c4b3c', roughness: 0.58 }),
  ];
}

export function lobbyItems(blueprint) {
  return [
    ...floorBorders(blueprint),
    ...stoneDado(blueprint),
    ...ceilingWork(blueprint),
    ...vestibule(),
    ...elevatorBank(),
    ...porterDetails(),
  ];
}
