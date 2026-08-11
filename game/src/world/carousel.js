// The carousel (1871), framework-free and deterministic: a twelve-sided
// open pavilion, striped canopy, and two rows of painted horses on brass
// poles. The original was turned by a mule and horse in a pit below the
// platform — the drive is invisible, which suits a placeholder-free build.
// Ben verifies siting and paint scheme before this counts as history.

import { terrainHeight } from './terrain.js';

export const CAROUSEL = { x: 6, z: -54, yaw: -Math.PI / 12 };

const SIDES = 12;
const PLATFORM_R = 6.0;
const PLATFORM_H = 0.3;
const POST_R = 7.0;
const POST_H = 3.4;
const EAVE_R = 8.05;
const ENTRIES = [3, 9]; // bays facing the walk and the meadow

function hash01(seed) {
  const value = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return value - Math.floor(value);
}

// 1890s paint: cream, vermilion, Prussian blue, bottle green, gold.
const BODY_COLORS = [
  [0.93, 0.9, 0.82], // cream
  [0.75, 0.76, 0.78], // dapple grey
  [0.32, 0.25, 0.2], // dark bay
  [0.62, 0.42, 0.26], // chestnut
  [0.88, 0.78, 0.58], // palomino
];
const SADDLE_COLORS = [
  [0.72, 0.2, 0.14], // vermilion
  [0.16, 0.25, 0.5], // Prussian blue
  [0.16, 0.4, 0.28], // bottle green
  [0.78, 0.62, 0.28], // gold
];

export function buildCarousel() {
  const ground = terrainHeight(CAROUSEL.x, CAROUSEL.z);

  const horses = [];
  const rows = [
    { count: 10, radius: 4.9 },
    { count: 8, radius: 3.5 },
  ];
  let index = 0;
  for (const [rowIndex, row] of rows.entries()) {
    for (let i = 0; i < row.count; i += 1) {
      const angle = ((i + rowIndex * 0.5) / row.count) * Math.PI * 2;
      horses.push({
        angle,
        radius: row.radius,
        yaw: -angle - Math.PI / 2,
        phase: (i % 2) * Math.PI + rowIndex * (Math.PI / 2),
        // Outer row gallops on the poles; the inner row stands.
        bobs: rowIndex === 0,
        body: BODY_COLORS[index % BODY_COLORS.length],
        accent: SADDLE_COLORS[index % SADDLE_COLORS.length],
        dark: index % 3 === 0 ? [0.12, 0.1, 0.09] : [0.22, 0.16, 0.12],
      });
      index += 1;
    }
  }

  const posts = [];
  const rails = [];
  const steps = [];
  const colliders = [];
  const cos = Math.cos(CAROUSEL.yaw);
  const sin = Math.sin(CAROUSEL.yaw);
  const toWorld = (lx, lz) => [CAROUSEL.x + lx * cos + lz * sin, CAROUSEL.z - lx * sin + lz * cos];

  for (let k = 0; k < SIDES; k += 1) {
    const angle = (k / SIDES) * Math.PI * 2;
    const px = Math.cos(angle) * POST_R;
    const pz = Math.sin(angle) * POST_R;
    posts.push({ p: [px, POST_H / 2, pz], s: [0.16, POST_H, 0.16] });
    const [wx, wz] = toWorld(px, pz);
    colliders.push({ type: 'cylinder', p: [wx, ground + POST_H / 2, wz], radius: 0.12, height: POST_H });

    const a1 = angle;
    const a2 = ((k + 1) / SIDES) * Math.PI * 2;
    const mx = (Math.cos(a1) + Math.cos(a2)) * 0.5 * POST_R;
    const mz = (Math.sin(a1) + Math.sin(a2)) * 0.5 * POST_R;
    const chord = 2 * POST_R * Math.sin(Math.PI / SIDES);
    const railYaw = -Math.atan2(Math.sin(a2) - Math.sin(a1), Math.cos(a2) - Math.cos(a1));
    if (ENTRIES.includes(k)) {
      // Two low steps up to the platform in each open bay.
      const sx = mx * 0.88;
      const sz = mz * 0.88;
      steps.push({ p: [sx, 0.07, sz], r: [0, railYaw, 0], s: [1.6, 0.14, 0.7] });
      steps.push({ p: [sx * 0.93, 0.21, sz * 0.93], r: [0, railYaw, 0], s: [1.6, 0.14, 0.5] });
      const [swx, swz] = toWorld(sx, sz);
      colliders.push({ type: 'box', p: [swx, ground + 0.07, swz], size: [1.6, 0.14, 0.7], yaw: railYaw + CAROUSEL.yaw });
      colliders.push({ type: 'box', p: [swx * 1, ground + 0.21, swz], size: [1.6, 0.14, 0.5], yaw: railYaw + CAROUSEL.yaw });
      continue;
    }
    rails.push({ p: [mx, 0.72, mz], r: [0, railYaw, 0], s: [chord - 0.22, 0.07, 0.07] });
    rails.push({ p: [mx, 0.3, mz], r: [0, railYaw, 0], s: [chord - 0.22, 0.06, 0.06] });
    const [rwx, rwz] = toWorld(mx, mz);
    colliders.push({ type: 'box', p: [rwx, ground + 0.5, rwz], size: [chord - 0.2, 1.0, 0.12], yaw: railYaw + CAROUSEL.yaw });
  }

  // The ride itself: platform disc and centre drum, both rotating.
  const [cwx, cwz] = toWorld(0, 0);
  colliders.push({ type: 'cylinder', p: [cwx, ground + PLATFORM_H / 2, cwz], radius: PLATFORM_R + 0.1, height: PLATFORM_H });
  colliders.push({ type: 'cylinder', p: [cwx, ground + PLATFORM_H + 1.3, cwz], radius: 1.25, height: 2.6 });

  return {
    ground,
    sides: SIDES,
    platform: { radius: PLATFORM_R, height: PLATFORM_H },
    drum: { radius: 1.15, height: 2.6, y: PLATFORM_H },
    mast: { radius: 0.09, top: 6.2 },
    roof: { eaveR: EAVE_R, eaveY: POST_H - 0.05, apexY: 6.15 },
    rounding: { radius: EAVE_R - 0.4, y: POST_H + 0.14, height: 0.66 },
    poleTopY: POST_H - 0.2,
    horses,
    posts,
    rails,
    steps,
    colliders,
  };
}
