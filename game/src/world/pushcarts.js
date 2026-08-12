// Vendor pushcarts: two spoked wheels, an open tray, handle poles, and a
// load. Each cart is one dynamic rigid body — the player can shove it, a
// horseless carriage can knock it over, and a tipped cart spills its goods
// as loose bodies. This module owns the deterministic data; the bodies,
// wheel spin, rolling, and spilling live in scene/Pushcarts.jsx.
//
// Local frame: +X forward (wheel travel), +Y up from the road, +Z the axle.
// `chassis` parts stay on the cart for good. `decor` parts (heaps, mounds,
// the meltwater film) vanish when the cart tips. `pieces` are drawn in place
// while the cart is upright and become individual rigid bodies on a spill;
// each carries its own collider spec. Everything is seeded from the cart id.
// Loads: coal, apples, cabbages, firewood, fish.

import { ROAD_TOP } from './streetGrid.js';

function hashId(id) {
  let total = 9;
  for (let i = 0; i < id.length; i += 1) total = (total * 31 + id.charCodeAt(i)) | 0;
  return total >>> 0;
}

function mulberry(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick(rng, list) {
  return list[Math.floor(rng() * list.length)];
}

const BODY_PAINTS = ['#7d3b2f', '#3e5138', '#8a6b35', '#4e5a63', '#6d5b44'];
const GRIME_PAINTS = ['#33342f', '#3d3a33', '#2f3336'];
const WHEEL_PAINTS = ['#5d4a33', '#43382a', '#5a3630', '#374232'];
const CANVAS_COLORS = ['#8a4a3a', '#5c6b50', '#7a6a45'];
// PropMaterial has no `metal` flag; ironwork spells out its surface.
const IRON = { roughness: 0.38, metalness: 0.85 };

// A heap as a lathe: rings shrink toward the top with a seeded wobble so no
// two mounds match.
function moundProfile(rng, radius, height, rings = 6) {
  const profile = [[radius * 0.96, 0]];
  for (let i = 1; i <= rings; i += 1) {
    const t = i / rings;
    const r = radius * Math.cos((t * Math.PI) / 2) ** 0.75 * (1 + (rng() - 0.5) * 0.18);
    profile.push([Math.max(r, 0.002), height * t]);
  }
  return profile;
}

function spherePiece(position, d, material, friction = 0.5) {
  return {
    position,
    collider: { type: 'ball', args: [d / 2], friction, density: 320 },
    parts: [{ shape: 'sphere', radialSegments: 8, position: [0, 0, 0], size: [d, d, d], ...material }],
  };
}

function applePiece(position, d, material) {
  return { ...spherePiece(position, d, material, 0.5), throwable: 'apple' };
}

function cabbagePiece(position, d, material, rng) {
  return {
    throwable: 'cabbage',
    position,
    rotation: [
      (rng() - 0.5) * 0.18,
      rng() * Math.PI * 2,
      (rng() - 0.5) * 0.18,
    ],
    // Keep the cheap round collider. The leaves only change what is drawn.
    collider: { type: 'ball', args: [d / 2], friction: 0.6, density: 320 },
    parts: [{
      shape: 'cabbage',
      position: [0, 0, 0],
      size: [1, 1, 1],
      scale: [
        d * (0.96 + rng() * 0.08),
        d * (0.95 + rng() * 0.08),
        d * (0.96 + rng() * 0.08),
      ],
      vertexColors: true,
      ...material,
    }],
  };
}

function coalLoad(load, c) {
  const coal = { color: '#17181b', roughness: 0.35, metalness: 0.25 };
  for (const fwd of [-0.28, 0.26]) {
    load.decor.push({
      shape: 'lathe', profile: moundProfile(c.rng, Math.min(c.W2, 0.66) / 2 + 0.05, 0.24 + c.rng() * 0.05),
      radialSegments: 14, position: [fwd, c.deckTop, 0], size: [0.7, 0.28, 0.7], ...coal,
    });
  }
  // Half the lumps sit on the mounds; the rest hide inside them and only
  // show once the cart goes over and the mound is gone.
  for (let i = 0; i < 16; i += 1) {
    const d = 0.07 + c.rng() * 0.06;
    const hidden = i >= 8;
    const fwd = hidden ? (c.rng() < 0.5 ? -0.28 : 0.26) + (c.rng() - 0.5) * 0.3 : (c.rng() - 0.5) * c.L2 * 0.9;
    const side = (c.rng() - 0.5) * (hidden ? 0.3 : c.W2 * 0.8);
    const y = c.deckTop + (hidden ? 0.05 + c.rng() * 0.07 : 0.03 + c.rng() * 0.16);
    load.pieces.push(spherePiece([fwd, y, side], d, coal, 0.7));
  }
  // Shovel: haft with the blade partway down, leaning out of the rear mound.
  load.pieces.push({
    position: [-0.42, c.deckTop + 0.4, c.W2 * 0.2],
    rotation: [0, 0, 1.05],
    collider: { type: 'cylinder', args: [0.42, 0.03], friction: 0.6, density: 250 },
    parts: [
      { shape: 'cylinder', radialSegments: 8, position: [0, 0, 0], size: [0.035, 0.85, 0.035], color: '#6a563c' },
      { position: [-0.03, -0.39, 0], size: [0.22, 0.02, 0.17], color: '#3a3d40', ...IRON },
    ],
  });
}

function appleLoad(load, c) {
  // Dark heap under the visible layer, so gaps read as shadow, not tray.
  load.decor.push({
    position: [0, c.deckTop + 0.07, 0], size: [c.L2, 0.14, c.W2], color: '#4a2418',
  });
  const colors = ['#7e3226', '#93402c', '#6f2d22', '#7e8547', '#9a7a33'];
  const cols = Math.floor(c.L2 / 0.12);
  const rows = Math.floor(c.W2 / 0.13);
  for (let i = 0; i < cols; i += 1) {
    for (let j = 0; j < rows; j += 1) {
      if (c.rng() < 0.08) continue;
      const d = 0.08 + c.rng() * 0.014;
      load.pieces.push(applePiece(
        [
          -c.L2 / 2 + 0.08 + i * 0.12 + (c.rng() - 0.5) * 0.025,
          c.deckTop + 0.155 + d / 2 + c.rng() * 0.012,
          -c.W2 / 2 + 0.09 + j * 0.13 + (c.rng() - 0.5) * 0.025,
        ],
        d,
        { color: pick(c.rng, colors), roughness: 0.42 },
      ));
    }
  }
}

function cabbageLoad(load, c) {
  load.decor.push({
    position: [0, c.deckTop + 0.05, 0], size: [c.L2, 0.1, c.W2], color: '#3f4a33',
  });
  const colors = ['#8ea45c', '#7c9a55', '#a4b06b', '#88975a'];
  const place = (fwd, y, side) => {
    const d = 0.22 + c.rng() * 0.04;
    load.pieces.push(cabbagePiece(
      [fwd, y, side],
      d,
      { color: pick(c.rng, colors), roughness: 0.72 },
      c.rng,
    ));
  };
  const cols = Math.floor(c.L2 / 0.24);
  for (let i = 0; i < cols; i += 1) {
    for (const side of [-0.25, 0.25]) {
      place(
        -c.L2 / 2 + 0.16 + i * 0.24 + (c.rng() - 0.5) * 0.04,
        c.deckTop + 0.21,
        side * c.W2 + (c.rng() - 0.5) * 0.05,
      );
    }
  }
  for (let i = 0; i < 3; i += 1) {
    place((c.rng() - 0.5) * c.L2 * 0.6, c.deckTop + 0.37, (c.rng() - 0.5) * 0.15);
  }
}

function firewoodLoad(load, c) {
  const colors = ['#6e5639', '#7a5f41', '#63503a', '#71583b'];
  const len = c.W2 + 0.08;
  const layers = [5, 4, 3];
  layers.forEach((count, layer) => {
    for (let i = 0; i < count; i += 1) {
      const d = 0.1 + c.rng() * 0.03;
      load.pieces.push({
        position: [
          (i - (count - 1) / 2) * 0.13 + (c.rng() - 0.5) * 0.02,
          c.deckTop + 0.06 + layer * 0.1,
          (c.rng() - 0.5) * 0.04,
        ],
        rotation: [Math.PI / 2, 0, 0],
        collider: { type: 'cylinder', args: [len / 2 - 0.02, d / 2], friction: 0.7, density: 500 },
        parts: [{
          shape: 'cylinder', radialSegments: 9, position: [0, 0, 0], size: [d, len, d],
          color: pick(c.rng, colors), roughness: 0.85,
        }],
      });
    }
  });
  for (let i = 0; i < 2; i += 1) {
    load.pieces.push({
      position: [(c.rng() - 0.5) * 0.5, c.deckTop + 0.38, (c.rng() - 0.5) * 0.3],
      rotation: [0, (c.rng() - 0.5) * 0.7, 0],
      collider: { type: 'cuboid', args: [0.045, 0.04, len * 0.35], friction: 0.7, density: 500 },
      parts: [{ position: [0, 0, 0], size: [0.09, 0.08, len * 0.7], color: '#8a7354', roughness: 0.85 }],
    });
  }
}

function fishLoad(load, c) {
  // Meltwater film on the deck: near-black and glossy, so the ice reads wet.
  load.decor.push({
    position: [0, c.deckTop + 0.004, 0], size: [c.L2, 0.008, c.W2],
    color: '#39474b', roughness: 0.1, metalness: 0.1,
  });
  const iceH = 0.2;
  for (const fwd of [-0.27, 0.25]) {
    load.decor.push({
      shape: 'lathe', profile: moundProfile(c.rng, Math.min(c.W2, 0.68) / 2 + 0.06, iceH + c.rng() * 0.04, 7),
      radialSegments: 16, position: [fwd, c.deckTop, 0], size: [0.8, 0.24, 0.8], finish: 'ice',
    });
  }
  // Six chunks show on the mounds; four more hide inside for the spill.
  for (let i = 0; i < 10; i += 1) {
    const d = 0.06 + c.rng() * 0.05;
    const hidden = i >= 6;
    load.pieces.push(spherePiece(
      [
        hidden ? (c.rng() < 0.5 ? -0.27 : 0.25) + (c.rng() - 0.5) * 0.2 : (c.rng() - 0.5) * c.L2 * 0.9,
        c.deckTop + (hidden ? 0.06 : 0.02 + c.rng() * 0.05),
        (c.rng() - 0.5) * (hidden ? 0.25 : c.W2 * 0.85),
      ],
      d,
      { finish: 'ice' },
      0.1,
    ));
  }
  // Fish bedded across the ice in a loose rank. In piece frame the lathe
  // axis is Y with the head at +Y; the tail cone flares past the other end.
  const skins = ['#9aa7ac', '#8d9ba1', '#a8b2b4', '#93a0a2'];
  const half = 0.17;
  const profile = [
    [0.004, -half], [0.02, -half * 0.7], [0.038, -half * 0.25],
    [0.04, half * 0.12], [0.03, half * 0.5], [0.014, half * 0.78], [0.004, half],
  ];
  for (let i = 0; i < 7; i += 1) {
    const skin = pick(c.rng, skins);
    const material = { color: skin, roughness: 0.26, metalness: 0.35 };
    load.pieces.push({
      position: [
        -c.L2 / 2 + 0.14 + (i * (c.L2 - 0.28)) / 6 + (c.rng() - 0.5) * 0.03,
        c.deckTop + iceH * 0.72 + (c.rng() - 0.5) * 0.04,
        (c.rng() - 0.5) * 0.2,
      ],
      rotation: [0, Math.PI / 2 + (c.rng() - 0.5) * 0.5, Math.PI / 2],
      collider: { type: 'ball', args: [0.045], friction: 0.25, density: 400 },
      parts: [
        { shape: 'lathe', profile, radialSegments: 9, position: [0, 0, 0], size: [0.08, half * 2, 0.08], ...material },
        { shape: 'cone', radialSegments: 6, position: [0, -(half + 0.03), 0], size: [0.085, 0.09, 0.085], ...material },
      ],
    });
  }
}

const LOADS = {
  coal: coalLoad,
  apples: appleLoad,
  cabbages: cabbageLoad,
  firewood: firewoodLoad,
  fish: fishLoad,
};

// One spoked wheel's visual parts, local to the axle end so the scene can
// spin the whole group about Z as the cart rolls. Iron tyre, painted felloe,
// hub with an axle nut.
function wheelParts(rng, R, paint) {
  const parts = [
    {
      shape: 'torus', radialSegments: 20, position: [0, 0, 0], size: [R * 2, 0.04, R * 2],
      color: '#232326', ...IRON,
    },
    {
      shape: 'torus', radialSegments: 20, position: [0, 0, 0], size: [R * 2 - 0.07, 0.055, R * 2 - 0.07],
      color: paint, roughness: 0.8,
    },
    {
      shape: 'cylinder', radialSegments: 10, position: [0, 0, 0], size: [0.1, 0.13, 0.1],
      rotation: [Math.PI / 2, 0, 0], color: paint,
    },
    {
      shape: 'cylinder', radialSegments: 6, position: [0, 0, 0.075], size: [0.045, 0.05, 0.045],
      rotation: [Math.PI / 2, 0, 0], color: '#2c2c2e', ...IRON,
    },
  ];
  const phase = rng() * Math.PI;
  for (let k = 0; k < 4; k += 1) {
    // Four crossing boxes read as eight spokes.
    parts.push({
      position: [0, 0, 0], size: [0.028, R * 1.82, 0.028],
      rotation: [0, 0, phase + (k * Math.PI) / 4], color: paint,
    });
  }
  return parts;
}

function buildCart(site) {
  const rng = mulberry(hashId(site.id));
  const R = 0.5 + rng() * 0.08;
  const L = 1.45 + rng() * 0.25;
  const W = 0.74 + rng() * 0.1;
  const boardH = 0.2 + rng() * 0.09;
  const axleY = R;
  const deckY = axleY + 0.13;
  const deckTop = deckY + 0.025;
  const legH = deckY - 0.05;
  const paint = pick(rng, site.load === 'coal' ? GRIME_PAINTS : BODY_PAINTS);
  const wheelPaint = pick(rng, WHEEL_PAINTS);
  // A quarter of carts run a mismatched replacement wheel.
  const offPaint = rng() < 0.25 ? pick(rng, WHEEL_PAINTS) : wheelPaint;
  const axleFwd = L * 0.1;
  const plank = { finish: 'plank', color: paint };

  const chassis = [
    { position: [0, deckY, 0], size: [L, 0.05, W], ...plank },
    {
      shape: 'cylinder', radialSegments: 8, position: [axleFwd, axleY, 0], size: [0.06, W + 0.3, 0.06],
      rotation: [Math.PI / 2, 0, 0], color: '#2c2c2e', ...IRON,
    },
  ];
  for (const side of [-1, 1]) {
    chassis.push(
      { position: [0, deckTop + boardH / 2, side * (W / 2 - 0.018)], size: [L, boardH, 0.035], ...plank },
      { position: [0, deckY - 0.07, side * (W / 2 - 0.12)], size: [L * 0.96, 0.06, 0.05], color: wheelPaint },
      // Handle poles out the rear, tapering toward the grip; legs under the
      // same end, so the cart stands level and tips onto them when shoved.
      {
        shape: 'frustum', topDiameter: 0.032, radialSegments: 8,
        position: [-(L / 2 + 0.36), deckY + 0.05, side * (W / 2 - 0.08)], size: [0.05, 0.8, 0.05],
        rotation: [0, 0, Math.PI / 2 + 0.07], color: '#6a563c',
      },
      { position: [-(L / 2 - 0.1), legH / 2, side * (W / 2 - 0.12)], size: [0.05, legH, 0.05], color: wheelPaint },
    );
  }
  for (const end of [-1, 1]) {
    chassis.push({
      position: [end * (L / 2 - 0.018), deckTop + boardH / 2, 0], size: [0.035, boardH, W - 0.07], ...plank,
    });
  }

  // Produce carts sometimes rig a striped canvas over the goods.
  if ((site.load === 'apples' || site.load === 'cabbages') && rng() < 0.6) {
    const aH = 1.05;
    for (const fwd of [-1, 1]) {
      for (const side of [-1, 1]) {
        chassis.push({
          shape: 'cylinder', radialSegments: 8, size: [0.035, aH, 0.035],
          position: [fwd * (L / 2 - 0.06), deckTop + aH / 2, side * (W / 2 - 0.06)], color: '#6a563c',
        });
      }
    }
    chassis.push({
      shape: 'roundedBox', bevelRadius: 0.015, position: [0, deckTop + aH + 0.02, 0],
      size: [L + 0.14, 0.045, W + 0.24], rotation: [0, 0, 0.05],
      finish: 'awning', color: pick(rng, CANVAS_COLORS),
    });
  }

  const c = { rng, deckTop, L2: L - 0.18, W2: W - 0.16 };
  const load = { decor: [], pieces: [] };
  LOADS[site.load](load, c);

  // A spare crate rides under a third of the trays and spills with the rest.
  if (rng() < 0.35) {
    load.pieces.push({
      position: [-0.2, 0.15, 0],
      rotation: [0, (rng() - 0.5) * 0.3, 0],
      collider: { type: 'cuboid', args: [0.21, 0.15, 0.17], friction: 0.7, density: 160 },
      parts: [{
        shape: 'roundedBox', bevelRadius: 0.01, position: [0, 0, 0], size: [0.42, 0.3, 0.34],
        color: '#87735a', roughness: 0.85,
      }],
    });
  }

  return {
    id: site.id,
    load: site.load,
    position: [site.x, ROAD_TOP + 0.02, site.z],
    yaw: site.yaw,
    wheelRadius: R,
    chassis,
    decor: load.decor,
    pieces: load.pieces,
    wheels: [-1, 1].map((side) => ({
      center: [axleFwd, axleY, side * (W / 2 + 0.09)],
      halfWidth: 0.045,
      parts: wheelParts(rng, R, side < 0 ? wheelPaint : offPaint),
    })),
    colliders: {
      tray: { half: [L / 2, 0.3, W / 2], position: [0, deckTop + 0.08, 0] },
      legs: { half: [0.03, legH / 2, W / 2 - 0.1], position: [-(L / 2 - 0.1), legH / 2, 0] },
      handles: { half: [0.4, 0.025, W / 2 - 0.05], position: [-(L / 2 + 0.36), deckY + 0.05, 0] },
    },
  };
}

// Vendor pitches: produce outside the hotels, fish and firewood along the
// park wall, coal by the El stairs. Yaw runs with the street.
const SITES = [
  { id: 'cart-plaza', x: 104.8, z: 76, yaw: Math.PI / 2, load: 'apples' },
  { id: 'cart-savoy', x: 104.8, z: 104, yaw: Math.PI / 2, load: 'cabbages' },
  { id: 'cart-cps', x: -20, z: 88.4, yaw: 0, load: 'fish' },
  { id: 'cart-cps-west', x: -64, z: 88.4, yaw: 0, load: 'firewood' },
  { id: 'cart-el', x: -30, z: 137.6, yaw: Math.PI, load: 'coal' },
];

export const PUSHCART_SPECS = SITES.map(buildCart);
