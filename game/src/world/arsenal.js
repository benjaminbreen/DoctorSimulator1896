// The Arsenal (Martin Thompson, 1848-51) as it stood in 1896, framework-free.
// Its battlements and corner bastions were replaced by low hipped roofs in
// the late 1860s and only put back in 1924, so the 1896 building has plain
// cornices, octagonal towers under low caps, ivy over most of its walls, and
// the Weather Bureau's instrument tower on the roof (1869-1918). References:
// photographs of c. 1900 and 1914, and Dennis collection stereoviews.
//
// Local frame: x east, y up from the base, z south. The park front (with the
// entrance stoop) faces west, toward the East Drive. Colliders come out in
// world coordinates.

export const ARSENAL = { x: 87.5, z: -44, base: 1.2 };

export const WIDTH = 11; // x
export const LENGTH = 17; // z, along Fifth Avenue
export const PLINTH = 1.0;
const STOREY = 2.6;
const FLOORS = 4;
export const WALL_TOP = PLINTH + FLOORS * STOREY;
export const TOWER_TOP = WALL_TOP + 2.4;
export const CORNER_R = 1.9; // octagon circumradius
export const GATE_R = 1.4;
export const GATE_Z = 2.4;

// Octagonal towers: four at the corners, and a pair flanking the entrance on
// each long front, the "fortified gatehouse" of the descriptions.
export const TOWERS = [
  ...[-1, 1].flatMap((sx) => [-1, 1].map((sz) => ({ x: (sx * WIDTH) / 2, z: (sz * LENGTH) / 2, r: CORNER_R, out: [sx, sz] }))),
  ...[-1, 1].flatMap((sx) => [-1, 1].map((sz) => ({ x: (sx * WIDTH) / 2, z: sz * GATE_Z, r: GATE_R, out: [sx, 0] }))),
];

// Window bays on the body faces, as offsets along each face.
const LONG_BAYS = [-5.6, -4.4, 0, 4.4, 5.6];
const SHORT_BAYS = [-2.2, 0, 2.2];

// Every wall window as { face, along, y, w, h }. `face` is 'w', 'e', 'n' or
// 's'; 'along' runs +z on the long faces and +x on the short ones.
export function bodyWindows() {
  const windows = [];
  for (const face of ['w', 'e', 'n', 's']) {
    const bays = face === 'w' || face === 'e' ? LONG_BAYS : SHORT_BAYS;
    for (const along of bays) {
      // Basement lights sit low in the plinth.
      windows.push({ face, along, y: 0.25, w: 0.8, h: 0.5 });
      for (let floor = 0; floor < FLOORS; floor += 1) {
        // The west door takes the centre bay on the ground floor.
        if (face === 'w' && along === 0 && floor === 0) continue;
        const h = floor === FLOORS - 1 ? 1.25 : 1.65;
        windows.push({ face, along, y: PLINTH + floor * STOREY + 0.55, w: 0.85, h });
      }
    }
  }
  return windows;
}

// Tower windows, one per storey on each face that looks away from the body.
// Faces follow CylinderGeometry's layout: face i is centred on angle
// (i + 0.5) * PI / 4, with outward normal (sin, cos).
export function towerWindows(tower) {
  const windows = [];
  for (let i = 0; i < 8; i += 1) {
    const angle = (i + 0.5) * Math.PI / 4;
    const facing = Math.sin(angle) * tower.out[0] + Math.cos(angle) * tower.out[1];
    if (facing < 0.6) continue;
    for (let floor = 1; floor <= FLOORS; floor += 1) {
      const top = floor === FLOORS;
      windows.push({ face: i, y: PLINTH + floor * STOREY - (top ? 0.2 : 0) + 0.55, w: 0.55, h: top ? 1.1 : 1.3 });
    }
  }
  return windows;
}

export function arsenalColliders() {
  const { x, z, base } = ARSENAL;
  const height = TOWER_TOP;
  // The body's own box is the 'arsenal' item in centralPark.js.
  const colliders = [
    ...TOWERS.map((tower) => ({ type: 'cylinder', p: [x + tower.x, base + height / 2 - 1, z + tower.z], radius: tower.r * 0.95, height: height + 2 })),
  ];
  // The entrance stoop: a landing at the door sill and steps down to the walk.
  // Each riser stays under the 0.32 autostep.
  const steps = STOOP_STEPS;
  for (let i = 0; i <= steps; i += 1) {
    const top = PLINTH - (i * PLINTH) / (steps + 1);
    const depth = i === 0 ? 1.3 : 0.32;
    const outX = -WIDTH / 2 - (i === 0 ? 0.65 : 1.3 + (i - 0.5) * 0.32);
    colliders.push({ type: 'box', p: [x + outX, base + top / 2 - 0.3, z], size: [depth, top + 0.6, 2.4] });
  }
  return colliders;
}

export const STOOP_STEPS = 4;
