// Gapstow Bridge (1896) as placed stones, framework-free and deterministic.
// Local frame: x along the bridge axis, y absolute world height, z across.
// The scene component rotates the lot into place at GAPSTOW.
//
// Proportions come from the documented bridge: 76 ft of masonry, 44 ft of
// water under the arch, a 12 ft rise over the Pond. Built at BRIDGE_SCALE
// above the 0.4 world scale: people are full size, and at true map scale
// the bridge reads as a garden ornament next to them. 0.58 of real size
// splits the difference and still fits the narrows.

export const GAPSTOW = { x: 8.2, z: -9.4, yaw: 1.01 };

const WATER = -0.5;
const BRIDGE_SCALE = 1.45;

// Base-space measures (0.4 world scale); everything is scaled on the way out.
const HALF_RUN = 4.6;
const WALL_Z = 1.49; // face-wall center plane, both signs
const SPRING_X = 2.7;
const SPRING_Y = -0.45;
const CROWN_INNER = 0.62;

// Intrados circle through the springings and inner crown.
const RISE = CROWN_INNER - SPRING_Y;
const ARCH_R = (SPRING_X * SPRING_X + RISE * RISE) / (2 * RISE);
const ARCH_CY = CROWN_INNER - ARCH_R;
const RING = 0.36; // voussoir depth, radial
const SPRING_THETA = Math.atan2(SPRING_Y - ARCH_CY, SPRING_X);

// Deck circle: ends (±4.6, 0.28), crown (0, 0.98).
const DECK_R = (HALF_RUN * HALF_RUN + 0.7 * 0.7) / (2 * 0.7);
const DECK_CY = 0.98 - DECK_R;

function deckYBase(x) {
  const clamped = Math.min(Math.abs(x), DECK_R - 0.01);
  return DECK_CY + Math.sqrt(DECK_R * DECK_R - clamped * clamped);
}

function deckSlopeAngle(x) {
  return Math.atan(-x / Math.sqrt(DECK_R * DECK_R - x * x));
}

// Scaled world-space profile. Scaling is about the waterline, so the rise
// over the Pond grows with the bridge while the water stays put.
function scaleY(y) {
  return WATER + (y - WATER) * BRIDGE_SCALE;
}

export const RUN_W = HALF_RUN * BRIDGE_SCALE;
export const APRON_W = RUN_W + 1.65;
const APRON_DROP = 0.19;

export function deckY(x) {
  return scaleY(deckYBase(x / BRIDGE_SCALE));
}

// The walk surface along the whole crossing: deck over the masonry, apron
// ramps down to the graded shore beyond it.
export function walkY(x) {
  const a = Math.abs(x);
  if (a <= RUN_W) return deckY(x);
  return deckY(RUN_W) - (a - RUN_W) * APRON_DROP;
}

export function localToWorld(lx, lz) {
  const cos = Math.cos(GAPSTOW.yaw);
  const sin = Math.sin(GAPSTOW.yaw);
  return [GAPSTOW.x + lx * cos + lz * sin, GAPSTOW.z - lx * sin + lz * cos];
}

function hash01(seed) {
  const value = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return value - Math.floor(value);
}

// Tints modulate the rock texture around 1; the material carries the gain
// that lifts the dark map (avg 0.31) to schist mid-grey. `lift` brightens
// the fresh-cut voussoirs.
function stoneColor(seed, lift = 0) {
  const t = hash01(seed) * 0.3 + lift;
  const green = hash01(seed * 3.7) * 0.08;
  return [0.85 + t, 0.85 + t + green, 0.81 + t];
}

function buildStones() {
  const stones = [];
  let n = 0;
  const push = (p, r, s, color) => {
    stones.push({ p, r, s, color });
    n += 1;
  };

  // Arch ring: radial voussoirs on each face, standing proud of the walls.
  const arc = Math.PI - 2 * SPRING_THETA;
  const count = 17;
  for (const face of [-1, 1]) {
    for (let i = 0; i < count; i += 1) {
      const theta = SPRING_THETA + ((i + 0.5) / count) * arc;
      const radial = ARCH_R + RING / 2;
      const seed = n * 7.3 + i;
      push(
        [Math.cos(theta) * radial, ARCH_CY + Math.sin(theta) * radial, face * WALL_Z],
        [0, 0, theta - Math.PI / 2 + (hash01(seed) - 0.5) * 0.02],
        [(arc / count) * radial * 0.94, RING, 0.5],
        stoneColor(seed, 0.14),
      );
    }
  }

  // Spandrel and abutment walls: rubble courses up to the deck line,
  // skipping the arch opening and its ring.
  for (const face of [-1, 1]) {
    for (let course = 0; course < 8; course += 1) {
      const y0 = -0.42 + course * 0.23;
      let x = -HALF_RUN + hash01(course * 11.7 + face) * 0.3;
      while (x < HALF_RUN) {
        const len = 0.34 + hash01(n * 3.1) * 0.28;
        const xc = x + len / 2;
        x += len - 0.015;
        if (xc + len / 2 > HALF_RUN + 0.05) break;
        const yc = y0 + 0.115;
        if (yc > deckYBase(xc) - 0.09) continue;
        // Near the waterline the courses tuck in behind the ring, closing
        // the haunch wedge; higher up they stop clear of it.
        const clearance = yc < -0.05 ? 0.02 : RING + 0.03;
        if (Math.hypot(xc, yc - ARCH_CY) < ARCH_R + clearance) continue;
        push(
          [xc, yc, face * WALL_Z],
          [0, 0, (hash01(n * 5.3) - 0.5) * 0.03],
          [len, 0.24, 0.4],
          stoneColor(n * 1.7),
        );
      }
    }
  }

  // String course at deck level on each face: closes the band between the
  // level wall courses and the curved parapet, and draws the deck line the
  // way the real bridge does.
  for (const face of [-1, 1]) {
    let x = -HALF_RUN + 0.05;
    while (x < HALF_RUN) {
      const len = 0.45 + hash01(n * 4.7) * 0.15;
      const xc = x + len / 2;
      x += len - 0.03;
      if (xc + len / 2 > HALF_RUN) break;
      push(
        [xc, deckYBase(xc) - 0.03, face * WALL_Z],
        [0, 0, deckSlopeAngle(xc)],
        [len, 0.2, 0.46],
        stoneColor(n * 6.7, 0.06),
      );
    }
  }

  // End cheeks: the short walls that close each abutment.
  for (const end of [-1, 1]) {
    for (let course = 0; course < 3; course += 1) {
      for (let i = 0; i < 5; i += 1) {
        const seed = n * 2.9;
        push(
          [end * (HALF_RUN - 0.15), -0.34 + course * 0.23, -1.32 + i * 0.66],
          [0, (hash01(seed) - 0.5) * 0.04, 0],
          [0.32, 0.21, 0.6],
          stoneColor(seed),
        );
      }
    }
  }

  // Parapet: two courses and a proud coping, all following the deck curve;
  // short wings step down and splay at the four corners.
  for (const side of [-1, 1]) {
    for (let course = 0; course < 2; course += 1) {
      let x = -HALF_RUN + hash01(course * 3.3 + side) * 0.25;
      while (x < HALF_RUN) {
        const len = 0.4 + hash01(n * 2.3) * 0.2;
        const xc = x + len / 2;
        x += len - 0.015;
        if (xc + len / 2 > HALF_RUN) break;
        push(
          [xc, deckYBase(xc) + 0.1 + course * 0.2, side * WALL_Z],
          [0, 0, deckSlopeAngle(xc) + (hash01(n * 7.7) - 0.5) * 0.02],
          [len, 0.22, 0.32],
          stoneColor(n * 4.3),
        );
      }
    }
    let x = -HALF_RUN + 0.1;
    while (x < HALF_RUN) {
      const len = 0.5 + hash01(n * 6.1) * 0.16;
      const xc = x + len / 2;
      x += len - 0.03;
      if (xc + len / 2 > HALF_RUN) break;
      push(
        [xc, deckYBase(xc) + 0.48, side * WALL_Z],
        [(hash01(n * 9.1) - 0.5) * 0.03, 0, deckSlopeAngle(xc)],
        [len, 0.18, 0.44],
        stoneColor(n * 8.9, 0.1),
      );
    }
    for (const end of [-1, 1]) {
      for (let i = 0; i < 3; i += 1) {
        const seed = n * 3.7;
        push(
          [end * (HALF_RUN + 0.35 + i * 0.4), 0.62 - i * 0.24, side * (WALL_Z + 0.12 + i * 0.16)],
          [0, end * side * (0.35 + i * 0.12), 0],
          [0.52, 0.3, 0.36],
          stoneColor(seed),
        );
      }
    }
  }

  return stones;
}

// Schist boulders banked around the four abutment corners. Unseated here:
// the scene component sets y from the terrain, world-side stays pure.
function buildRocks() {
  const rocks = [];
  let n = 0;
  for (const ex of [-1, 1]) {
    for (const ez of [-1, 1]) {
      for (let i = 0; i < 4; i += 1) {
        const seed = n * 13.7 + i;
        const lx = ex * (4.9 + hash01(seed) * 1.9);
        // Clear of the walk: the apron's clear width ends at the parapet line.
        const lz = ez * (1.4 + hash01(seed * 2.1) * 1.6);
        const radius = (i === 0 ? 0.8 + hash01(seed * 3.3) * 0.5 : 0.3 + hash01(seed * 3.3) * 0.4) * 1.25;
        rocks.push({
          p: [lx * BRIDGE_SCALE, 0, lz * BRIDGE_SCALE],
          r: [hash01(seed * 5.1) * 0.5, hash01(seed * 7.7) * Math.PI, hash01(seed * 9.3) * 0.4],
          s: [radius, radius * (0.62 + hash01(seed * 4.9) * 0.35), radius * 0.85],
          color: stoneColor(seed * 1.3, -0.18),
          hero: radius >= 0.85,
        });
        n += 1;
      }
    }
  }
  return rocks;
}

// Exposed for tests: the intrados circle (scaled) that must stay clear.
export const GAPSTOW_ARCH = { r: ARCH_R * BRIDGE_SCALE, cy: scaleY(ARCH_CY) };

function scaleStone(stone) {
  return {
    ...stone,
    p: [stone.p[0] * BRIDGE_SCALE, scaleY(stone.p[1]), stone.p[2] * BRIDGE_SCALE],
    s: stone.s.map((v) => v * BRIDGE_SCALE),
  };
}

export function buildGapstow() {
  return {
    stones: buildStones().map(scaleStone),
    rocks: buildRocks(),
    vault: {
      radius: (ARCH_R - 0.01) * BRIDGE_SCALE,
      cy: scaleY(ARCH_CY),
      theta: [SPRING_THETA, Math.PI - SPRING_THETA],
      halfWidth: (WALL_Z + 0.17) * BRIDGE_SCALE,
    },
    deck: { halfWidth: 1.32 * BRIDGE_SCALE, apron: APRON_W },
  };
}
