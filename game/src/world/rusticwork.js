// Rustic timberwork for the park's summerhouses, framework-free and
// deterministic: the Kinderberg (the great octagonal children's shelter on
// its rock), Cop Cot above the Pond's southwest shore, a small arbor on
// the Hallett peninsula, and the swan boat landing. Unbarked cedar posts,
// branch railings, shingle roofs — the Vaux rustic vocabulary.

import { terrainHeight } from './terrain.js';

// The swan boat landing: a plank stage on cedar piles from the Pond's south
// bank, with an open shelter at its head modelled on Vaux's Lake landings.
// `s` runs out from the bank along DIR; `side` runs across it.
export const LANDING_ROOT = [1.86, 63.16];
const DIR = [-0.41, -0.912];
const WALK_TO = 2.8;
const HEAD_TO = 6.4;
const HEAD_W = 3.6;
const WALK_W = 2.2;
const DECK_Y = -0.18; // just above the boat's own deck, for stepping across
const landingPoint = (s, side = 0) => [
  LANDING_ROOT[0] + DIR[0] * s - DIR[1] * side,
  LANDING_ROOT[1] + DIR[1] * s + DIR[0] * side,
];
const HEAD = landingPoint((WALK_TO + HEAD_TO) / 2);
// SwanBoat.jsx holds the boat here, broadside to the head, bow to the east.
export const LANDING_BERTH = { point: landingPoint(HEAD_TO + 1.38), heading: [-DIR[1], DIR[0]] };

// Yaws point each shelter's first entry bay at its approach path.
export const SHELTERS = [
  { id: 'kinderberg', x: 44, z: -56, yaw: 2.75, sides: 8, radius: 6.2, postH: 3.1, postR: 0.24, roofRise: 3.4, overhang: 1.1, entries: [0, 4], inner: true, lantern: true },
  { id: 'cop-cot', x: -34, z: 73, yaw: -1.85, sides: 6, radius: 3.1, postH: 2.75, postR: 0.16, roofRise: 2.1, overhang: 0.85, entries: [0] },
  { id: 'hallett-arbor', x: 2, z: 39, yaw: -2.5, sides: 4, radius: 2.3, postH: 2.2, postR: 0.13, roofRise: 1.3, overhang: 0.9, entries: [0, 2] },
  // Belt Line waiting shelter at the Scholars' Gate stop, after the pavilion
  // in the 1886 Magnus print of this corner. yaw π/4 puts the entry bay flat
  // toward the street; the plank deck keeps waiting feet off the lawn.
  { id: 'belt-line-stop', x: 66, z: 81.2, yaw: Math.PI / 4, sides: 4, radius: 2.0, postH: 2.5, postR: 0.13, roofRise: 1.35, overhang: 0.85, entries: [0], platform: 3.55 },
  // Bay 0 opens to the walk, bay 2 to the berth; benches on the other two.
  { id: 'boat-landing', x: HEAD[0], z: HEAD[1], yaw: Math.atan2(-DIR[1], -DIR[0]) - Math.PI / 4, sides: 4, radius: 2.3, postH: 2.3, postR: 0.12, roofRise: 1.2, overhang: 0.6, entries: [0, 2], floor: DECK_Y },
];

function hash01(seed) {
  const value = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return value - Math.floor(value);
}

// Cedar: grey-brown, jittered per pole. Multiplies the bark texture.
function cedarTint(seed) {
  const t = hash01(seed) * 0.3;
  return [0.78 + t, 0.72 + t, 0.62 + t * 0.9];
}

// Quaternion rotating +y onto `dir` (unit). Poles are y-up cylinders.
// Axis is cross((0,1,0), dir) = (dz, 0, -dx); the sign matters — flipped,
// every diagonal pole mirrors away from where it should lean.
export function quatFromUp([dx, dy, dz]) {
  if (dy > 0.9999) return [0, 0, 0, 1];
  if (dy < -0.9999) return [1, 0, 0, 0];
  const cx = dz;
  const cz = -dx;
  const w = 1 + dy;
  const len = Math.sqrt(cx * cx + cz * cz + w * w);
  return [cx / len, 0, cz / len, w / len];
}

function pole(from, to, radius, tint) {
  const d = [to[0] - from[0], to[1] - from[1], to[2] - from[2]];
  const len = Math.hypot(...d);
  return {
    p: [(from[0] + to[0]) / 2, (from[1] + to[1]) / 2, (from[2] + to[2]) / 2],
    q: quatFromUp([d[0] / len, d[1] / len, d[2] / len]),
    s: [radius, len, radius],
    tint,
  };
}

function buildShelter(shelter, index) {
  const poles = [];
  const branches = [];
  const seats = [];
  const colliders = [];
  const ground = shelter.floor ?? terrainHeight(shelter.x, shelter.z);
  const { sides, radius, postH, postR, roofRise, overhang, yaw } = shelter;
  let n = index * 1000;
  const seed = () => {
    n += 1;
    return n * 3.7;
  };

  const corner = (k, r = radius) => {
    const angle = yaw + (k * Math.PI * 2) / sides;
    return [shelter.x + Math.cos(angle) * r, shelter.z + Math.sin(angle) * r];
  };
  const topY = ground + postH;

  // Outer posts, buried well below grade so a sloping skirt never bares them.
  for (let k = 0; k < sides; k += 1) {
    const [x, z] = corner(k);
    const lean = (hash01(seed()) - 0.5) * 0.1;
    const foot = Math.min(ground, terrainHeight(x, z)) - 0.8;
    poles.push(pole([x - lean, foot, z], [x + lean, topY, z], postR, cedarTint(seed())));
    colliders.push({ type: 'cylinder', p: [x, ground + postH / 2, z], radius: postR + 0.05, height: postH });
  }

  // Eave beams between post tops, with a pair of Y-braces under each.
  for (let k = 0; k < sides; k += 1) {
    const [x1, z1] = corner(k);
    const [x2, z2] = corner(k + 1);
    poles.push(pole([x1, topY - 0.06, z1], [x2, topY - 0.06, z2], postR * 0.62, cedarTint(seed())));
    for (const t of [0.3, 0.7]) {
      const bx = x1 + (x2 - x1) * t;
      const bz = z1 + (z2 - z1) * t;
      const [px, pz] = t < 0.5 ? [x1, z1] : [x2, z2];
      branches.push(pole([px, topY - 1.0, pz], [bx, topY - 0.1, bz], 0.05, cedarTint(seed())));
    }
  }

  // Inner post ring for the big span.
  if (shelter.inner) {
    const innerR = radius * 0.45;
    const innerTop = ground + postH + roofRise * (1 - (innerR + overhang * 0.45) / (radius + overhang)) - 0.05;
    for (let k = 0; k < sides; k += 2) {
      const [x, z] = corner(k + 0.5, innerR);
      poles.push(pole([x, ground - 0.8, z], [x, innerTop, z], postR * 0.9, cedarTint(seed())));
      colliders.push({ type: 'cylinder', p: [x, ground + postH / 2, z], radius: postR, height: postH });
    }
  }

  // A plank deck under the whole footprint, aligned with the bays. Only the
  // Belt Line stop carries one; the lawn shelters stand on their ground.
  if (shelter.platform) {
    const deck = shelter.platform;
    const deckYaw = -(yaw - Math.PI / 4);
    seats.push({
      p: [shelter.x, ground + 0.05, shelter.z],
      r: [0, deckYaw, 0],
      s: [deck, 0.1, deck],
      tint: cedarTint(seed()),
    });
    colliders.push({ type: 'box', p: [shelter.x, ground + 0.05, shelter.z], size: [deck, 0.1, deck], yaw: deckYaw });
  }

  // Roof frame. A plain shelter gets a cone to a peak; the Kinderberg's
  // cone stops at a ring and carries an open lantern with its own cap, the
  // two-stage silhouette the big shelter needs to not read as a shed.
  const eaveR = radius + overhang;
  const eaveY = topY - 0.08;
  const roofs = [];
  let peak;
  if (shelter.lantern) {
    const ringR = 1.5;
    const ringY = eaveY + roofRise * (1 - ringR / eaveR);
    roofs.push({ center: [shelter.x, shelter.z], yaw, sides, eaveY, eaveR, topY: ringY, topR: ringR });
    roofs.push({ center: [shelter.x, shelter.z], yaw, sides, eaveY: ringY + 0.62, eaveR: ringR + 0.35, apexY: ringY + 1.55 });
    // Lantern posts between the two roofs.
    for (let k = 0; k < sides; k += 1) {
      const [x, z] = corner(k + 0.5, ringR * 0.8);
      branches.push(pole([x, ringY - 0.25, z], [x, ringY + 0.68, z], 0.07, cedarTint(seed())));
    }
    peak = [shelter.x, ringY + 1.55, shelter.z];
    // Rafters run to the lantern ring, not the peak.
    for (let k = 0; k < sides; k += 1) {
      for (const half of [0, 0.5]) {
        const [x, z] = corner(k + half, eaveR * 0.94);
        const [rx, rz] = corner(k + half, ringR + 0.15);
        branches.push(pole([x, topY - 0.16, z], [rx, ringY - 0.06, rz], 0.075, cedarTint(seed())));
      }
    }
  } else {
    const apexY = ground + postH + roofRise;
    roofs.push({ center: [shelter.x, shelter.z], yaw, sides, eaveY, eaveR, apexY });
    peak = [shelter.x, apexY, shelter.z];
    for (let k = 0; k < sides; k += 1) {
      for (const half of [0, 0.5]) {
        const [x, z] = corner(k + half, eaveR * 0.9);
        branches.push(pole([x, topY - 0.16, z], [peak[0], peak[1] - 0.14, peak[2]], 0.065, cedarTint(seed())));
      }
    }
  }
  // Fascia ring carrying the roof edge over the rafter tails, and the finial.
  for (let k = 0; k < sides; k += 1) {
    const [f1x, f1z] = corner(k, radius + overhang * 0.94);
    const [f2x, f2z] = corner(k + 1, radius + overhang * 0.94);
    branches.push(pole([f1x, topY - 0.12, f1z], [f2x, topY - 0.12, f2z], 0.06, cedarTint(seed())));
  }
  branches.push(pole(peak, [peak[0], peak[1] + 0.55, peak[2]], 0.05, cedarTint(seed())));

  // Railing bays with the classic X-lattice, benches inside them.
  for (let k = 0; k < sides; k += 1) {
    if (shelter.entries.includes(k)) continue;
    const [x1, z1] = corner(k);
    const [x2, z2] = corner(k + 1);
    const rail = (t1, y1, t2, y2, r) =>
      branches.push(pole(
        [x1 + (x2 - x1) * t1, ground + y1, z1 + (z2 - z1) * t1],
        [x1 + (x2 - x1) * t2, ground + y2, z1 + (z2 - z1) * t2],
        r, cedarTint(seed()),
      ));
    rail(0.02, 0.85, 0.98, 0.85, 0.055);
    rail(0.02, 0.16, 0.98, 0.16, 0.05);
    // Two lattice panels split by a mid picket: denser, closer to the
    // branchwork in the period photographs.
    rail(0.5, 0.17, 0.5, 0.84, 0.045);
    for (const [a, b] of [[0.04, 0.5], [0.5, 0.96]]) {
      rail(a, 0.18, b, 0.83, 0.04);
      rail(a, 0.83, b, 0.18, 0.04);
      rail((a + b) / 2, 0.17, (a + b) / 2, 0.84, 0.035);
    }
    const chord = Math.hypot(x2 - x1, z2 - z1);
    const yawBay = Math.atan2(x2 - x1, z2 - z1) + Math.PI / 2;
    const mx = (x1 + x2) / 2;
    const mz = (z1 + z2) / 2;
    colliders.push({ type: 'box', p: [mx, ground + 0.5, mz], size: [chord, 1.0, 0.14], yaw: yawBay });

    // Bench: plank seat on pole legs, set in from the railing, facing the
    // middle of the shelter.
    const inward = [(shelter.x - mx), (shelter.z - mz)];
    const inLen = Math.hypot(...inward) || 1;
    const bx = mx + (inward[0] / inLen) * 0.42;
    const bz = mz + (inward[1] / inLen) * 0.42;
    seats.push({ p: [bx, ground + 0.45, bz], r: [0, yawBay, 0], s: [chord * 0.72, 0.06, 0.42], tint: cedarTint(seed()) });
    // Legs sit along the seat: under item yaw, local +x maps to
    // (cos yaw, -sin yaw) in world.
    for (const t of [-0.3, 0.3]) {
      const lx = bx + Math.cos(yawBay) * chord * t;
      const lz = bz - Math.sin(yawBay) * chord * t;
      branches.push(pole([lx, ground - 0.1, lz], [lx, ground + 0.44, lz], 0.055, cedarTint(seed())));
    }
    colliders.push({ type: 'box', p: [bx, ground + 0.24, bz], size: [chord * 0.72, 0.48, 0.42], yaw: yawBay });
  }

  return { poles, branches, seats, colliders, roofs };
}

// The stage itself; the shelter on its head is an ordinary SHELTERS entry.
// Planks go across, each its own box so the gaps read; piles run down to
// the pond bed, and on the walk they carry on up as the railing posts.
function buildLanding() {
  const poles = [];
  const branches = [];
  const seats = [];
  const colliders = [];
  let n = 9000;
  const tint = () => cedarTint((n += 1) * 3.7);
  const deckYaw = Math.atan2(DIR[0], DIR[1]);
  const at = (s, side, y) => {
    const [x, z] = landingPoint(s, side);
    return [x, y, z];
  };
  const widthAt = (s) => (s < WALK_TO ? WALK_W : HEAD_W);

  for (let s = 0.15; s < HEAD_TO; s += 0.3) {
    seats.push({ p: at(s, 0, DECK_Y - 0.035), r: [0, deckYaw, 0], s: [widthAt(s), 0.07, 0.27], tint: tint() });
  }
  // Stringers under the planks, and a cap beam on every row of piles.
  for (const side of [-1, 1]) {
    for (const [from, to, w] of [[0, WALK_TO, WALK_W], [WALK_TO, HEAD_TO, HEAD_W]]) {
      seats.push({ p: at((from + to) / 2, side * (w / 2 - 0.2), DECK_Y - 0.14), r: [0, deckYaw, 0], s: [0.12, 0.16, to - from], tint: tint() });
    }
  }
  const pileRows = [[0.35, WALK_W, 0.95], [1.6, WALK_W, 0.95], [WALK_TO, WALK_W, 0.95], [WALK_TO + 0.12, HEAD_W, 0], [(WALK_TO + HEAD_TO) / 2, HEAD_W, 0], [HEAD_TO - 0.12, HEAD_W, 0.55]];
  for (const [s, w, rise] of pileRows) {
    seats.push({ p: at(s, 0, DECK_Y - 0.15), r: [0, deckYaw, 0], s: [w + 0.16, 0.14, 0.16], tint: tint() });
    for (const side of [-1, 1]) {
      const [x, , z] = at(s, side * (w / 2 + 0.06), 0);
      const top = DECK_Y + (rise || -0.08);
      // Mooring posts at the outer corners stand thicker than the rest.
      const radius = rise === 0.55 ? 0.15 : 0.11;
      poles.push(pole([x, terrainHeight(x, z) - 0.4, z], [x, top, z], radius, tint()));
      if (rise) colliders.push({ type: 'cylinder', p: [x, DECK_Y + rise / 2, z], radius: radius + 0.04, height: rise });
    }
  }
  // Walk railings: top and bottom rail with the X-lattice between posts.
  const walkPosts = pileRows.filter(([s, w, rise]) => w === WALK_W && rise);
  for (const side of [-1, 1]) {
    const across = side * (WALK_W / 2 + 0.06);
    for (let i = 0; i + 1 < walkPosts.length; i += 1) {
      const [s1] = walkPosts[i];
      const [s2] = walkPosts[i + 1];
      const rail = (t1, y1, t2, y2, r) => branches.push(pole(
        at(s1 + (s2 - s1) * t1, across, DECK_Y + y1), at(s1 + (s2 - s1) * t2, across, DECK_Y + y2), r, tint(),
      ));
      rail(0, 0.88, 1, 0.88, 0.05);
      rail(0, 0.14, 1, 0.14, 0.045);
      rail(0.06, 0.16, 0.94, 0.86, 0.038);
      rail(0.06, 0.86, 0.94, 0.16, 0.038);
    }
    colliders.push({ type: 'box', p: at(WALK_TO / 2, across, DECK_Y + 0.5), size: [0.14, 1.0, WALK_TO], yaw: deckYaw });
  }
  // A fender log along the berth face, where the boat comes alongside.
  branches.push(pole(at(HEAD_TO + 0.1, -HEAD_W / 2, DECK_Y - 0.2), at(HEAD_TO + 0.1, HEAD_W / 2, DECK_Y - 0.2), 0.09, tint()));
  colliders.push({ type: 'box', p: at(HEAD_TO / 2, 0, DECK_Y - 0.05), size: [HEAD_W, 0.1, HEAD_TO], yaw: deckYaw });
  return { poles, branches, seats, colliders, roofs: [] };
}

export function buildShelters() {
  const all = { poles: [], branches: [], seats: [], colliders: [], roofs: [] };
  [...SHELTERS.map(buildShelter), buildLanding()].forEach((built) => {
    all.poles.push(...built.poles);
    all.branches.push(...built.branches);
    all.seats.push(...built.seats);
    all.colliders.push(...built.colliders);
    all.roofs.push(...built.roofs);
  });
  return all;
}
