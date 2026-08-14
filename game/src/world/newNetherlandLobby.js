// Architectural dressing for the New Netherland Hotel's lobby: a Romanesque
// palm court after the hotel's postcard and press descriptions — clustered
// columns with circular ottomans, round-arched walls, Dutch blue tile dados
// over dark oak, a Numidian red marble stair, and the lobby's great harbour
// painting. Electric light throughout: globes, no flames.

const PI = Math.PI;

const CREAM = { finish: 'metclub:marble', tint: '#ddd0b6' };
const RED_MARBLE = { finish: 'metclub:marble', tint: '#9c4438' };
const ONYX = { finish: 'metclub:marble', tint: '#c9a86a' };
const OAK = { finish: 'mahogany' };
const DELFT = { finish: 'netherland:delft' };
const VELVET = { finish: 'metclub:carpet', tint: '#8a1f24' };

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

// Clustered columns on square pedestals, each ringed by a circular ottoman.
function columns() {
  const items = [];
  for (const s of [-1, 1]) {
    const side = s < 0 ? 'n' : 's';
    const z = s * 3.6;
    items.push(box(`nn-pedestal-${side}`, [0, 0.275, z], [1.5, 0.55, 1.5], {
      ...RED_MARBLE,
      collider: true,
    }));
    for (const [index, [dx, dz]] of [[-0.33, -0.33], [0.33, -0.33], [-0.33, 0.33], [0.33, 0.33]].entries()) {
      items.push(cylinder(`nn-shaft-${side}-${index}`, [dx, 3.3, z + dz], 0.36, 5.5, CREAM));
    }
    items.push(box(`nn-capital-${side}`, [0, 6.3, z], [1.35, 0.5, 1.35], { finish: 'brassDull' }));
    items.push(box(`nn-impost-${side}`, [0, 6.72, z], [1.6, 0.32, 1.6], RED_MARBLE));
    // Circular ottoman around the base, with a tufted roll back.
    items.push(cylinder(`nn-ottoman-${side}`, [0, 0.225, z], 2.5, 0.45, {
      ...VELVET,
      collider: true,
    }));
    // Tufted back pads against each pedestal face.
    for (const [index, [dx, dz, sx, sz]] of [
      [0.89, 0, 0.28, 1.4],
      [-0.89, 0, 0.28, 1.4],
      [0, 0.89, 1.4, 0.28],
      [0, -0.89, 1.4, 0.28],
    ].entries()) {
      items.push(box(`nn-ottoman-pad-${side}-${index}`, [dx, 0.7, z + dz], [sx, 0.5, sz], {
        shape: 'roundedBox',
        ...VELVET,
      }));
    }
  }
  return items;
}

// A blind round arch: recess, head disc, and gilt and red archivolt rings.
// The rings are shallow cylinders face-on to the wall, the medallion trick.
function archUnit(prefix, alongX, along, face, inward) {
  const position = (depth, y) =>
    alongX ? [along, y, face + inward * depth] : [face + inward * depth, y, along];
  const flat = (diameter, depth, y, options) =>
    box(`${prefix}-ring-${diameter}`, position(depth, y), [diameter, diameter, 0.04], {
      shape: 'cylinder',
      radialSegments: 36,
      rotation: alongX ? [PI / 2, 0, 0] : [0, 0, PI / 2],
      size: [diameter, 0.04, diameter],
      ...options,
    });
  return [
    box(`${prefix}-recess`, position(0.03, 2.1), alongX ? [1.7, 1.8, 0.05] : [0.05, 1.8, 1.7], {
      color: '#d5c6a8',
      roughness: 0.8,
    }),
    flat(2.24, 0.02, 3.0, RED_MARBLE),
    flat(2.0, 0.03, 3.0, { finish: 'brassDull' }),
    flat(1.7, 0.045, 3.0, { color: '#d5c6a8', roughness: 0.8 }),
  ];
}

function arches(blueprint) {
  const { width, depth } = blueprint.dimensions;
  const northFace = -depth / 2 + 0.2;
  const southFace = depth / 2 - 0.2;
  return [
    ...archUnit('nn-arch-n-w', true, -5.2, northFace, 1),
    ...archUnit('nn-arch-n-e', true, 5.2, northFace, 1),
    ...archUnit('nn-arch-s-w', true, -6.4, southFace, -1),
    ...archUnit('nn-arch-s-m', true, -3.2, southFace, -1),
    ...archUnit('nn-arch-s-e', true, 6.3, southFace, -1),
  ];
}

// The lobby's immense painting on the north wall, in a gilt frame.
function mural() {
  const z = -8.74;
  return [
    box('nn-mural', [0, 3.4, z], [6.4, 3.0, 0.07], { finish: 'netherland:mural' }),
    box('nn-mural-frame-top', [0, 5.02, z - 0.01], [6.72, 0.24, 0.1], { finish: 'brassDull' }),
    box('nn-mural-frame-bottom', [0, 1.78, z - 0.01], [6.72, 0.24, 0.1], { finish: 'brassDull' }),
    box('nn-mural-frame-w', [-3.24, 3.4, z - 0.01], [0.24, 3.5, 0.1], { finish: 'brassDull' }),
    box('nn-mural-frame-e', [3.24, 3.4, z - 0.01], [0.24, 3.5, 0.1], { finish: 'brassDull' }),
  ];
}

// Dutch blue tile dado over an oak skirt, capped in oak. Segments per wall
// leave room for the openings, the stair, and the fireplace.
function dado() {
  const items = [];
  const band = (id, alongX, center, length, face) => {
    const position = alongX ? [center, 0.62, face] : [face, 0.62, center];
    const size = alongX ? [length, 1.0, 0.05] : [0.05, 1.0, length];
    items.push(box(`nn-dado-${id}`, position, size, DELFT));
    const capPosition = alongX ? [center, 1.16, face] : [face, 1.16, center];
    const capSize = alongX ? [length, 0.08, 0.07] : [0.07, 0.08, length];
    items.push(box(`nn-dado-${id}-cap`, capPosition, capSize, OAK));
    const skirtPosition = alongX ? [center, 0.07, face] : [face, 0.07, center];
    const skirtSize = alongX ? [length, 0.14, 0.06] : [0.06, 0.14, length];
    items.push(box(`nn-dado-${id}-skirt`, skirtPosition, skirtSize, OAK));
  };
  band('north', true, 0, 15.2, -8.77);
  band('south-w', true, -2.625, 9.95, 8.77);
  band('south-e', true, 6.025, 3.15, 8.77);
  band('east-n', false, -6.9, 1.4, 7.77);
  band('east-m', false, 0.875, 6.15, 7.77);
  band('east-s', false, 6.625, 1.95, 7.77);
  band('west-n', false, -6.525, 2.15, -7.77);
  band('west-nm', false, -2.45, 2.6, -7.77);
  band('west-sm', false, 2.45, 2.6, -7.77);
  band('west-s', false, 6.525, 2.15, -7.77);
  // Delft chimney panel above the fireplace, framed in oak.
  items.push(box('nn-chimney-delft', [3.4, 2.6, 8.76], [2.2, 1.3, 0.06], DELFT));
  items.push(box('nn-chimney-frame-top', [3.4, 3.3, 8.75], [2.36, 0.1, 0.08], OAK));
  items.push(box('nn-chimney-frame-bottom', [3.4, 1.92, 8.75], [2.36, 0.1, 0.08], OAK));
  items.push(box('nn-chimney-frame-w', [2.28, 2.6, 8.75], [0.1, 1.48, 0.08], OAK));
  items.push(box('nn-chimney-frame-e', [4.52, 2.6, 8.75], [0.1, 1.48, 0.08], OAK));
  return items;
}

// The hotel office: an oak counter with a Mexican onyx top, key rack, and a
// shaded desk lamp. Sits against the east wall.
function frontDesk() {
  const items = [
    box('nn-desk-body', [5.85, 0.55, 0], [0.62, 1.1, 3.6], { ...OAK, collider: true }),
    box('nn-desk-top', [5.85, 1.13, 0], [0.78, 0.07, 3.75], ONYX),
    cylinder('nn-desk-rail', [5.48, 0.25, 0], 0.05, 3.5, {
      rotation: [PI / 2, 0, 0],
      radialSegments: 10,
      finish: 'brassAged',
    }),
    box('nn-desk-back', [7.55, 0.5, 0], [0.4, 1.0, 3.2], { ...OAK, collider: true }),
    box('nn-desk-rack', [7.72, 2.05, 0], [0.1, 1.35, 2.6], OAK),
    // Ledger and bell on the counter.
    box('nn-desk-ledger', [5.85, 1.185, -0.9], [0.34, 0.04, 0.46], { color: '#4a2c1a', roughness: 0.6 }),
    box('nn-desk-bell', [5.85, 1.22, 0.7], [0.11, 0.09, 0.11], {
      shape: 'sphere',
      finish: 'brass',
    }),
  ];
  for (let row = 0; row < 4; row += 1) {
    for (let column = 0; column < 8; column += 1) {
      items.push(box(`nn-key-slot-${row}-${column}`, [7.66, 1.6 + row * 0.3, -1.085 + column * 0.31], [0.02, 0.06, 0.24], {
        finish: 'brassAged',
      }));
    }
  }
  // Shaded electric desk lamp under the marker at [6.1, 1.62, 0].
  items.push(
    cylinder('nn-desk-lamp-stem', [6.1, 1.33, 0], 0.04, 0.34, { finish: 'brass' }),
    box('nn-desk-lamp-shade', [6.1, 1.56, 0], [0.32, 0.17, 0.32], {
      shape: 'frustum',
      topDiameter: 0.14,
      glass: true,
      color: '#3f6b52',
      opacity: 0.55,
    }),
    box('nn-desk-lamp-core', [6.1, 1.53, 0], [0.09, 0.09, 0.09], {
      shape: 'sphere',
      color: '#ffe3ba',
      emissive: '#ffd9a0',
    }),
  );
  return items;
}

// The Numidian marble stair rising along the east wall to the blocked
// first-floor door, with a red runner.
function stair() {
  const items = [];
  for (let k = 1; k <= 8; k += 1) {
    const top = 0.2 * k;
    const z = -2.4 - (k - 0.5) * 0.3;
    items.push(box(`nn-stair-${k}`, [7.05, top / 2, z], [1.4, top, 0.3], {
      ...RED_MARBLE,
      collider: true,
    }));
    items.push(box(`nn-stair-parapet-${k}`, [6.44, (top + 0.8) / 2, z], [0.18, top + 0.8, 0.3], {
      ...RED_MARBLE,
      collider: true,
    }));
  }
  items.push(box('nn-stair-landing', [7.05, 0.8, -5.475], [1.4, 1.6, 1.35], {
    ...RED_MARBLE,
    collider: true,
  }));
  items.push(box('nn-stair-landing-parapet', [6.44, 1.2, -5.475], [0.18, 2.4, 1.35], {
    ...RED_MARBLE,
    collider: true,
  }));
  items.push(cylinder('nn-stair-newel', [6.45, 0.55, -2.25], 0.4, 1.1, RED_MARBLE));
  items.push(box('nn-stair-newel-cap', [6.45, 1.18, -2.25], [0.2, 0.2, 0.2], {
    shape: 'sphere',
    finish: 'brassAged',
  }));
  const railAngle = Math.atan(1.4 / 2.1);
  items.push(box('nn-stair-rail', [6.44, 1.75, -3.6], [0.08, 0.08, 2.7], {
    rotation: [railAngle, 0, 0],
    finish: 'brassAged',
  }));
  const runnerAngle = Math.atan(1.4 / 2.4);
  items.push(box('nn-stair-runner', [7.08, 0.93, -3.6], [1.05, 0.022, 2.85], {
    rotation: [runnerAngle, 0, 0],
    finish: 'metclub:carpet',
    tint: '#7c2128',
  }));
  items.push(box('nn-stair-landing-runner', [7.08, 1.612, -5.45], [1.05, 0.02, 1.2], {
    finish: 'metclub:carpet',
    tint: '#7c2128',
  }));
  return items;
}

// Red marble pilasters, a string course, and the two-step cornice.
function wallWork(blueprint) {
  const { width, depth } = blueprint.dimensions;
  const items = [];
  const pilaster = (id, x, z, alongX) => {
    items.push(box(`nn-pilaster-${id}`, [x, 2.15, z], alongX ? [0.42, 4.3, 0.26] : [0.26, 4.3, 0.42], RED_MARBLE));
    items.push(box(`nn-pilaster-${id}-cap`, [x, 4.32, z], alongX ? [0.48, 0.18, 0.3] : [0.3, 0.18, 0.48], {
      finish: 'brassDull',
    }));
  };
  for (const [index, x] of [-6.35, -3.65, 3.65, 6.35].entries()) {
    pilaster(`n-${index}`, x, -depth / 2 + 0.33, true);
  }
  for (const [index, x] of [-4.8, -1.6, 5.5].entries()) {
    pilaster(`s-${index}`, x, depth / 2 - 0.33, true);
  }
  for (const [index, z] of [-2.9, 2.9].entries()) {
    pilaster(`w-${index}`, -width / 2 + 0.33, z, false);
  }
  items.push(
    box('nn-string-north', [0, 4.75, -depth / 2 + 0.27], [width - 0.5, 0.45, 0.14], CREAM),
    box('nn-string-south', [0, 4.75, depth / 2 - 0.27], [width - 0.5, 0.45, 0.14], CREAM),
    box('nn-string-west', [-width / 2 + 0.27, 4.75, 0], [0.14, 0.45, depth - 0.5], CREAM),
    box('nn-string-east', [width / 2 - 0.27, 4.75, 0], [0.14, 0.45, depth - 0.5], CREAM),
    box('nn-bead-north', [0, 4.48, -depth / 2 + 0.25], [width - 0.5, 0.06, 0.09], { finish: 'brassAged' }),
    box('nn-bead-south', [0, 4.48, depth / 2 - 0.25], [width - 0.5, 0.06, 0.09], { finish: 'brassAged' }),
    box('nn-bead-west', [-width / 2 + 0.25, 4.48, 0], [0.09, 0.06, depth - 0.5], { finish: 'brassAged' }),
    box('nn-bead-east', [width / 2 - 0.25, 4.48, 0], [0.09, 0.06, depth - 0.5], { finish: 'brassAged' }),
  );
  const plaster = '#ded0b4';
  for (const [id, inset, drop, thickness] of [
    ['upper', 0.16, 0.12, 0.2],
    ['lower', 0.24, 0.3, 0.12],
  ]) {
    items.push(
      box(`nn-cornice-${id}-north`, [0, 7.4 - drop, -depth / 2 + inset], [width, thickness, 0.18], { color: plaster }),
      box(`nn-cornice-${id}-south`, [0, 7.4 - drop, depth / 2 - inset], [width, thickness, 0.18], { color: plaster }),
      box(`nn-cornice-${id}-west`, [-width / 2 + inset, 7.4 - drop, 0], [0.18, thickness, depth], { color: plaster }),
      box(`nn-cornice-${id}-east`, [width / 2 - inset, 7.4 - drop, 0], [0.18, thickness, depth], { color: plaster }),
    );
  }
  return items;
}

// Gilt beam grid with deep red coffer fields and rosettes.
function ceilingWork(blueprint) {
  const { width, depth } = blueprint.dimensions;
  const items = [];
  const zBeams = [-7.2, -4.8, -2.4, 0, 2.4, 4.8, 7.2];
  const xBeams = [-6, -4, -2, 0, 2, 4, 6];
  for (const [index, z] of zBeams.entries()) {
    items.push(box(`nn-beam-cross-${index}`, [0, 7.08, z], [width - 0.6, 0.35, 0.24], { finish: 'brassDull' }));
  }
  for (const [index, x] of xBeams.entries()) {
    items.push(box(`nn-beam-long-${index}`, [x, 7.08, 0], [0.24, 0.35, depth - 0.6], { finish: 'brassDull' }));
  }
  for (const [ix, x] of [-5, -3, -1, 1, 3, 5].entries()) {
    for (const [iz, z] of [-6, -3.6, -1.2, 1.2, 3.6, 6].entries()) {
      items.push(box(`nn-field-${ix}-${iz}`, [x, 7.33, z], [1.7, 0.05, 2.1], {
        color: '#5e1d16',
        roughness: 0.55,
      }));
      items.push(cylinder(`nn-rosette-${ix}-${iz}`, [x, 7.3, z], 0.16, 0.05, { finish: 'brassDull' }));
    }
  }
  return items;
}

// Electric fixtures: ring chandeliers, column globes, and wall brackets.
// Positions match the blueprint's light markers; no flames — this hotel is
// wired.
function electricLights() {
  const items = [];
  const globe = (id, position, diameter = 0.26) => {
    items.push(box(`${id}-glass`, position, [diameter, diameter, diameter], {
      shape: 'sphere',
      glass: true,
      color: '#fff2dc',
      opacity: 0.45,
    }));
    items.push(box(`${id}-core`, position, [diameter * 0.55, diameter * 0.55, diameter * 0.55], {
      shape: 'sphere',
      color: '#ffe3ba',
      emissive: '#ffd9a0',
    }));
  };
  for (const [side, x] of [['w', -4.2], ['e', 4.2]]) {
    items.push(cylinder(`nn-chandelier-${side}-rod`, [x, 6.58, 0], 0.05, 1.5, { finish: 'brassDull' }));
    items.push(box(`nn-chandelier-${side}-ring`, [x, 5.8, 0], [1.15, 0.07, 1.15], {
      shape: 'torus',
      finish: 'brassDull',
    }));
    for (let k = 0; k < 6; k += 1) {
      const angle = (k / 6) * PI * 2;
      globe(`nn-chandelier-${side}-${k}`, [x + Math.cos(angle) * 0.5, 5.64, Math.sin(angle) * 0.5], 0.22);
    }
  }
  for (const s of [-1, 1]) {
    const side = s < 0 ? 'n' : 's';
    for (let k = 0; k < 4; k += 1) {
      const angle = (k / 4) * PI * 2 + PI / 4;
      const dx = Math.cos(angle) * 0.62;
      const dz = Math.sin(angle) * 0.62;
      items.push(box(`nn-column-arm-${side}-${k}`, [dx * 0.6, 5.0, s * 3.6 + dz * 0.6], [0.4, 0.04, 0.04], {
        rotation: [0, -angle, 0],
        finish: 'brassDull',
      }));
      globe(`nn-column-globe-${side}-${k}`, [dx, 5.0, s * 3.6 + dz], 0.22);
    }
  }
  for (const [id, x, z] of [
    ['nw', -4.5, -8.7],
    ['ne', 3.0, -8.7],
    ['sw', -4.5, 8.7],
    ['se', 3.0, 8.7],
  ]) {
    const inward = z < 0 ? 1 : -1;
    items.push(box(`nn-bracket-${id}`, [x, 3.0, z + inward * 0.12], [0.05, 0.05, 0.24], { finish: 'brassDull' }));
    globe(`nn-globe-${id}`, [x, 3.1, z + inward * 0.24]);
  }
  return items;
}

// Terracotta jardinières under the potted palms, and the entrance mat.
function floorDressing() {
  const items = [
    box('nn-entrance-mat', [-7.25, 0.015, 0], [1.0, 0.03, 2.4], { color: '#3d372c', roughness: 0.96 }),
  ];
  for (const [id, x, z] of [
    ['entrance-n', -6.7, -7.5],
    ['entrance-s', -6.7, 7.5],
    ['column-n', 1.8, -5.1],
    ['column-s', 1.8, 5.1],
    ['desk-n', 6.8, -2.7],
    ['desk-s', 6.8, 2.7],
  ]) {
    items.push(box(`nn-urn-${id}`, [x, 0.25, z], [0.5, 0.5, 0.5], {
      shape: 'frustum',
      topDiameter: 0.72,
      radialSegments: 20,
      color: '#8a4a30',
      roughness: 0.8,
      collider: true,
      colliderSize: [0.7, 0.5, 0.7],
    }));
  }
  return items;
}

export function newNetherlandLobbyItems(blueprint) {
  return [
    ...columns(),
    ...arches(blueprint),
    ...mural(),
    ...dado(),
    ...frontDesk(),
    ...stair(),
    ...wallWork(blueprint),
    ...ceilingWork(blueprint),
    ...electricLights(),
    ...floorDressing(),
  ];
}
