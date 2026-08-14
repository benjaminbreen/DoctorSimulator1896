// Architectural dressing for the Metropolitan Club's main hall: a marble
// double stair rising to a central balcony, stained glass above it, and a
// coffered walnut ceiling. Forms first; ornament comes later.

const PI = Math.PI;

const MARBLE = { finish: 'metclub:marble' };
const WALNUT = { finish: 'metclub:walnut' };
const CARPET = { finish: 'metclub:carpet', tint: '#7c2128' };

// Stair layout. Both flights leave the central landing, drop to a quarter
// landing in the west corner, then turn east along the side wall to the floor.
const LANDING_TOP = 4.2;
const CORNER_TOP = 2.3;
const UPPER_RISE = 0.19;
const UPPER_RUN = 0.36;
const LOWER_RISE = 0.1917;
const LOWER_RUN = 0.3;

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

// One side of the double stair. `s` is -1 for the north flight, +1 south.
function stairFlight(s) {
  const side = s < 0 ? 'n' : 's';
  const items = [];

  // Upper flight: solid stepped marble from the landing edge to the corner.
  for (let k = 1; k <= 10; k += 1) {
    const top = LANDING_TOP - UPPER_RISE * k;
    const z = s * (1.9 + (k - 0.5) * UPPER_RUN);
    items.push(box(`stair-${side}-upper-${k}`, [-7.55, top / 2, z], [1.9, top, UPPER_RUN], {
      ...MARBLE,
      collider: true,
    }));
    // Stepped parapet wall on the open side, per tread so the line follows
    // the flight down.
    items.push(box(`stair-${side}-upper-parapet-${k}`, [-6.71, (top + 0.85) / 2, z], [0.22, top + 0.85, UPPER_RUN], {
      ...MARBLE,
      collider: true,
    }));
  }

  // Quarter landing in the corner.
  items.push(box(`stair-${side}-corner`, [-7.55, CORNER_TOP / 2, s * 6.65], [1.9, CORNER_TOP, 2.3], {
    ...MARBLE,
    collider: true,
  }));
  items.push(box(`stair-${side}-corner-post`, [-6.71, (CORNER_TOP + 0.9) / 2, s * 5.7], [0.22, CORNER_TOP + 0.9, 0.4], {
    ...MARBLE,
    collider: true,
  }));

  // Lower flight turns east along the side wall.
  for (let j = 1; j <= 11; j += 1) {
    const top = CORNER_TOP - LOWER_RISE * j;
    const x = -6.6 + (j - 0.5) * LOWER_RUN;
    const flare = j >= 10;
    items.push(box(`stair-${side}-lower-${j}`, [x, top / 2, s * (flare ? 6.6 : 6.85)], [LOWER_RUN, top, flare ? 2.4 : 1.9], {
      ...MARBLE,
      collider: true,
    }));
    if (j <= 9) {
      items.push(box(`stair-${side}-lower-parapet-${j}`, [x, (top + 0.85) / 2, s * 5.99], [LOWER_RUN, top + 0.85, 0.22], {
        ...MARBLE,
        collider: true,
      }));
    }
  }

  // Round curtail steps at the foot, and a volute post ending the parapet.
  // Visual only; the straight treads keep the collision.
  items.push(cylinder(`stair-${side}-curtail-a`, [-2.95, 0.095, s * 6.75], 2.3, 0.19, MARBLE));
  items.push(cylinder(`stair-${side}-curtail-b`, [-3.15, 0.285, s * 6.8], 1.75, 0.19, MARBLE));
  items.push(cylinder(`stair-${side}-volute`, [-3.85, 0.8, s * 5.99], 0.42, 1.6, MARBLE));
  items.push(box(`stair-${side}-volute-cap`, [-3.85, 1.68, s * 5.99], [0.22, 0.22, 0.22], {
    shape: 'sphere',
    finish: 'brassAged',
  }));

  // Brass stair rods pinning the runner at every nose.
  for (let k = 1; k <= 10; k += 1) {
    const top = LANDING_TOP - UPPER_RISE * k;
    const nose = s * (1.9 + (k - 1) * UPPER_RUN + 0.02);
    items.push(cylinder(`stair-${side}-rod-upper-${k}`, [-7.55, top + 0.025, nose], 0.035, 1.2, {
      rotation: [0, 0, PI / 2],
      radialSegments: 8,
      finish: 'brass',
    }));
  }
  for (let j = 1; j <= 11; j += 1) {
    const top = CORNER_TOP - LOWER_RISE * j;
    const nose = -6.6 + (j - 1) * LOWER_RUN + 0.02;
    items.push(cylinder(`stair-${side}-rod-lower-${j}`, [nose, top + 0.025, s * 6.85], 0.035, 1.2, {
      rotation: [PI / 2, 0, 0],
      radialSegments: 8,
      finish: 'brass',
    }));
  }

  // Sloped brass rails seated on the stepped parapet tops. Visual only.
  // Both lines run corner to corner over the steps they cover.
  const upperAngle = Math.atan(1.71 / 3.24);
  items.push(box(`stair-${side}-upper-rail`, [-6.71, 4.05, s * 3.52], [0.09, 0.09, 3.85], {
    rotation: [s * upperAngle, 0, 0],
    finish: 'brassAged',
  }));
  const lowerAngle = Math.atan(1.535 / 2.4);
  items.push(box(`stair-${side}-lower-rail`, [-5.4, 2.24, s * 5.99], [3.0, 0.09, 0.09], {
    rotation: [0, 0, -lowerAngle],
    finish: 'brassAged',
  }));

  // Red runner draped down both flights and across the quarter landing.
  items.push(box(`stair-${side}-upper-carpet`, [-7.55, 3.19, s * 3.7], [1.15, 0.025, 4.05], {
    rotation: [s * upperAngle, 0, 0],
    ...CARPET,
  }));
  items.push(box(`stair-${side}-corner-carpet`, [-7.5, CORNER_TOP + 0.012, s * 6.65], [1.5, 0.02, 1.9], CARPET));
  items.push(box(`stair-${side}-lower-carpet`, [-4.875, 1.18, s * 6.85], [3.55, 0.025, 1.15], {
    rotation: [0, 0, -lowerAngle],
    ...CARPET,
  }));

  return items;
}

// Free-standing torchères by the side walls, clear of the stair approaches.
// Positions match the blueprint's torchère light markers.
function torcheres() {
  const items = [];
  for (const s of [-1, 1]) {
    const side = s < 0 ? 'n' : 's';
    items.push(cylinder(`torchere-${side}-plinth`, [-0.5, 0.5, s * 7.0], 0.5, 1.0, {
      ...MARBLE,
      collider: true,
    }));
    items.push(cylinder(`torchere-${side}-post`, [-0.5, 1.425, s * 7.0], 0.09, 0.85, { finish: 'brassAged' }));
    items.push(box(`torchere-${side}-globe`, [-0.5, 1.95, s * 7.0], [0.32, 0.32, 0.32], {
      shape: 'sphere',
      glass: true,
      color: '#ffe7c2',
      opacity: 0.4,
    }));
  }
  return items;
}

// Central balcony landing over the inner door, with piers forming the recess.
function landing() {
  return [
    box('landing-slab', [-7.55, 4.075, 0], [1.9, 0.25, 3.8], { ...MARBLE, collider: true }),
    box('landing-pier-n', [-7.55, 1.975, -1.7], [1.9, 3.95, 0.4], { ...MARBLE, collider: true }),
    box('landing-pier-s', [-7.55, 1.975, 1.7], [1.9, 3.95, 0.4], { ...MARBLE, collider: true }),
    box('landing-parapet', [-6.72, 4.65, 0], [0.22, 0.9, 3.8], { ...MARBLE, collider: true }),
    box('landing-rail', [-6.72, 5.13, 0], [0.12, 0.07, 3.9], { finish: 'brassAged' }),
    box('landing-carpet', [-7.52, LANDING_TOP + 0.012, 0], [1.55, 0.02, 3.5], CARPET),
    cylinder('landing-candelabrum-n', [-6.72, 5.32, -1.6], 0.07, 0.38, { finish: 'brassAged' }),
    cylinder('landing-candelabrum-s', [-6.72, 5.32, 1.6], 0.07, 0.38, { finish: 'brassAged' }),
    // Gilt panel and medallion on the parapet face.
    box('landing-panel-top', [-6.595, 4.95, 0], [0.025, 0.05, 3.2], { finish: 'brassAged' }),
    box('landing-panel-bottom', [-6.595, 4.35, 0], [0.025, 0.05, 3.2], { finish: 'brassAged' }),
    box('landing-panel-n', [-6.595, 4.65, -1.6], [0.025, 0.65, 0.05], { finish: 'brassAged' }),
    box('landing-panel-s', [-6.595, 4.65, 1.6], [0.025, 0.65, 0.05], { finish: 'brassAged' }),
    cylinder('landing-medallion-ring', [-6.6, 4.65, 0], 0.5, 0.04, {
      rotation: [0, 0, PI / 2],
      finish: 'brassAged',
    }),
    cylinder('landing-medallion', [-6.58, 4.65, 0], 0.4, 0.04, {
      rotation: [0, 0, PI / 2],
      ...MARBLE,
    }),
    // Pediment and bead over the door in the recess.
    box('inner-door-pediment', [-8.18, 3.0, 0], [0.2, 0.45, 2.1], MARBLE),
    box('inner-door-bead', [-8.18, 2.72, 0], [0.14, 0.09, 1.7], { finish: 'brassAged' }),
  ];
}

// Stained glass: one leaded-glass canvas per window, glowing as its own
// emissive map. The window portals still light the room through the same
// openings.
function stainedGlass() {
  const items = [];
  for (const [index, z] of [-4.6, -2.3, 0, 2.3, 4.6].entries()) {
    items.push(box(`stained-pane-${index}`, [-8.5, 7.0, z], [0.05, 2.4, 1.35], {
      finish: 'metclub:stainedglass',
      seed: index + 1,
    }));
  }
  return items;
}

// Coffered walnut ceiling: a beam grid with gilt studs at the crossings.
function cofferedCeiling(blueprint) {
  const { width, depth } = blueprint.dimensions;
  const y = 8.7;
  const items = [];
  const xBeams = [-6.3, -4.2, -2.1, 0, 2.1, 4.2, 6.3];
  const zBeams = [-6, -4, -2, 0, 2, 4, 6];
  for (const [index, x] of xBeams.entries()) {
    items.push(box(`coffer-long-${index}`, [x, y, 0], [0.32, 0.5, depth - 0.6], WALNUT));
  }
  for (const [index, z] of zBeams.entries()) {
    items.push(box(`coffer-cross-${index}`, [0, y, z], [width - 0.8, 0.5, 0.32], WALNUT));
  }
  for (const [ix, x] of xBeams.entries()) {
    for (const [iz, z] of zBeams.entries()) {
      items.push(box(`coffer-stud-${ix}-${iz}`, [x, 8.42, z], [0.1, 0.06, 0.1], { finish: 'brassAged' }));
    }
  }
  // Gilt: a gold fillet along every beam soffit and a rosette in each field.
  for (const [index, x] of xBeams.entries()) {
    items.push(box(`coffer-gilt-long-${index}`, [x, 8.44, 0], [0.12, 0.04, depth - 0.6], { finish: 'brassAged' }));
  }
  for (const [index, z] of zBeams.entries()) {
    items.push(box(`coffer-gilt-cross-${index}`, [0, 8.44, z], [width - 0.8, 0.04, 0.12], { finish: 'brassAged' }));
  }
  for (const [ix, x] of [-5.25, -3.15, -1.05, 1.05, 3.15, 5.25].entries()) {
    for (const [iz, z] of [-5, -3, -1, 1, 3, 5].entries()) {
      items.push(cylinder(`coffer-rosette-${ix}-${iz}`, [x, 8.96, z], 0.18, 0.06, { finish: 'brassAged' }));
      // A darker inset panel per field, so the coffers read as recessed
      // rather than painted on the slab.
      items.push(box(`coffer-field-${ix}-${iz}`, [x, 8.97, z], [1.74, 0.05, 1.64], {
        ...WALNUT,
        tint: '#6b5138',
      }));
    }
  }
  // Two-step cornice around the ceiling.
  const plaster = '#d9cfc0';
  for (const [id, inset, drop, thickness] of [
    ['upper', 0.18, 0.14, 0.22],
    ['lower', 0.26, 0.32, 0.13],
  ]) {
    items.push(
      box(`cornice-${id}-north`, [0, 9.0 - drop, -depth / 2 + inset], [width, thickness, 0.2], { color: plaster }),
      box(`cornice-${id}-south`, [0, 9.0 - drop, depth / 2 - inset], [width, thickness, 0.2], { color: plaster }),
      box(`cornice-${id}-west`, [-width / 2 + inset, 9.0 - drop, 0], [0.2, thickness, depth], { color: plaster }),
      box(`cornice-${id}-east`, [width / 2 - inset, 9.0 - drop, 0], [0.2, thickness, depth], { color: plaster }),
    );
  }
  return items;
}

// Pilasters, the string course at balcony level, and wall medallions.
function wallWork(blueprint) {
  const { width, depth } = blueprint.dimensions;
  const items = [];

  // Ground-floor pilasters clear of the stair runs.
  for (const s of [-1, 1]) {
    const side = s < 0 ? 'n' : 's';
    for (const [index, x] of [-2.4, 1.6, 5.6].entries()) {
      const z = s * (depth / 2 - 0.35);
      items.push(box(`pilaster-${side}-${index}`, [x, 2.15, z], [0.55, 4.3, 0.3], MARBLE));
      items.push(box(`pilaster-${side}-${index}-cap`, [x, 4.2, z], [0.62, 0.2, 0.36], { finish: 'brassAged' }));
      items.push(box(`pilaster-${side}-${index}-base`, [x, 0.14, z], [0.62, 0.28, 0.36], MARBLE));
    }
  }
  for (const [index, z] of [-2.6, 2.6].entries()) {
    items.push(box(`pilaster-e-${index}`, [8.15, 2.15, z], [0.3, 4.3, 0.55], MARBLE));
    items.push(box(`pilaster-e-${index}-cap`, [8.15, 4.2, z], [0.36, 0.2, 0.62], { finish: 'brassAged' }));
  }
  // Upper pilasters between the stained-glass windows.
  for (const [index, z] of [-3.45, -1.15, 1.15, 3.45].entries()) {
    items.push(box(`pilaster-upper-${index}`, [-8.2, 7.05, z], [0.26, 3.1, 0.5], MARBLE));
  }

  // A darker marble dado grounds the walls, clear of the stair runs and
  // the east door.
  const dado = { ...MARBLE, tint: '#cec3b0' };
  for (const s of [-1, 1]) {
    const side = s < 0 ? 'n' : 's';
    items.push(box(`dado-${side}`, [2.95, 0.575, s * 7.77], [11.1, 1.15, 0.055], dado));
    items.push(box(`dado-${side}-cap`, [2.95, 1.2, s * 7.76], [11.1, 0.09, 0.08], dado));
    items.push(box(`dado-e-${side}`, [8.27, 0.575, s * 4.35], [0.055, 1.15, 6.3], dado));
    items.push(box(`dado-e-${side}-cap`, [8.26, 1.2, s * 4.35], [0.08, 0.09, 6.3], dado));
  }

  // String course at balcony level, with a gilt bead beneath.
  items.push(
    box('string-north', [0, 4.72, -depth / 2 + 0.28], [width - 0.5, 0.55, 0.16], MARBLE),
    box('string-south', [0, 4.72, depth / 2 - 0.28], [width - 0.5, 0.55, 0.16], MARBLE),
    box('string-west', [-width / 2 + 0.28, 4.72, 0], [0.16, 0.55, depth - 0.5], MARBLE),
    box('string-east', [width / 2 - 0.28, 4.72, 0], [0.16, 0.55, depth - 0.5], MARBLE),
    box('string-bead-north', [0, 4.42, -depth / 2 + 0.26], [width - 0.5, 0.07, 0.1], { finish: 'brassAged' }),
    box('string-bead-south', [0, 4.42, depth / 2 - 0.26], [width - 0.5, 0.07, 0.1], { finish: 'brassAged' }),
    box('string-bead-west', [-width / 2 + 0.26, 4.42, 0], [0.1, 0.07, depth - 0.5], { finish: 'brassAged' }),
    box('string-bead-east', [width / 2 - 0.26, 4.42, 0], [0.1, 0.07, depth - 0.5], { finish: 'brassAged' }),
  );

  // Corbels seating the balcony columns on the string course.
  for (const s of [-1, 1]) {
    const side = s < 0 ? 'n' : 's';
    for (const [index, x] of [-2.4, 1.6, 5.6].entries()) {
      items.push(box(`corbel-${side}-${index}`, [x, 4.86, s * (depth / 2 - 0.45)], [0.6, 0.32, 0.5], MARBLE));
    }
  }
  for (const [index, z] of [-2.6, 2.6].entries()) {
    items.push(box(`corbel-e-${index}`, [width / 2 - 0.75, 4.86, z], [0.5, 0.32, 0.6], MARBLE));
  }

  // Blind medallions over the busts flanking the door recess.
  for (const s of [-1, 1]) {
    const side = s < 0 ? 'n' : 's';
    items.push(cylinder(`medallion-ring-${side}`, [-8.26, 3.05, s * 3.1], 1.12, 0.05, {
      rotation: [0, 0, PI / 2],
      finish: 'brassAged',
    }));
    items.push(cylinder(`medallion-${side}`, [-8.22, 3.05, s * 3.1], 1.0, 0.06, {
      rotation: [0, 0, PI / 2],
      ...MARBLE,
    }));
  }
  return items;
}

// The hall's gilt lantern, hung low into the double-height space.
function lantern() {
  const items = [
    cylinder('lantern-rod', [0, 7.775, 0], 0.05, 2.45, { finish: 'brassAged' }),
    cylinder('lantern-crown', [0, 6.5, 0], 0.55, 0.18, { finish: 'brassAged' }),
    cylinder('lantern-top', [0, 6.42, 0], 1.2, 0.12, { finish: 'brassAged' }),
    cylinder('lantern-glass', [0, 5.62, 0], 1.05, 1.6, {
      radialSegments: 6,
      glass: true,
      color: '#f5e3b8',
      opacity: 0.35,
    }),
    // A warm core so the lantern reads lit from every distance.
    cylinder('lantern-core', [0, 5.62, 0], 0.5, 1.15, {
      color: '#ffd9a0',
      emissive: '#ffc07a',
      roughness: 0.6,
    }),
    cylinder('lantern-base', [0, 4.82, 0], 1.2, 0.14, { finish: 'brassAged' }),
    cylinder('lantern-finial', [0, 4.62, 0], 0.28, 0.3, { finish: 'brassAged' }),
  ];
  // Gilt ribs on the hexagonal corners, and scroll arms bracing the rod.
  for (let k = 0; k < 6; k += 1) {
    const angle = (k / 6) * PI * 2;
    items.push(box(`lantern-rib-${k}`, [Math.cos(angle) * 0.525, 5.62, Math.sin(angle) * 0.525], [0.05, 1.62, 0.05], {
      rotation: [0, -angle, 0],
      finish: 'brassAged',
    }));
  }
  for (let k = 0; k < 4; k += 1) {
    const yaw = (k / 4) * PI * 2;
    items.push(box(`lantern-arm-${k}`, [Math.cos(yaw) * 0.33, 6.78, -Math.sin(yaw) * 0.33], [0.55, 0.05, 0.05], {
      rotation: [0, yaw, 0.55],
      finish: 'brassAged',
    }));
  }
  return items;
}

function floorDressing() {
  return [
    box('hall-runner', [2.6, 0.01, 0], [10.6, 0.02, 1.9], CARPET),
    box('entrance-mat', [7.55, 0.015, 0], [1.9, 0.03, 1.1], {
      color: '#403a2e',
      roughness: 0.96,
    }),
  ];
}

export function metClubLobbyItems(blueprint) {
  return [
    ...stairFlight(-1),
    ...stairFlight(1),
    ...torcheres(),
    ...landing(),
    ...stainedGlass(),
    ...cofferedCeiling(blueprint),
    ...wallWork(blueprint),
    ...lantern(),
    ...floorDressing(),
  ];
}
