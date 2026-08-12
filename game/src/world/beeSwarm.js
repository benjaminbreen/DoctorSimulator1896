// Deterministic bee movement tied to the park's rendered flower patches.
// Rendering owns the wingbeat; this module decides where each bee forages.

import { floweringCoverItems } from './groundCover.js';
import { terrainHeight } from './terrain.js';

export const BEE_COUNT = 44;

export const BEE_FLOWER_PATCHES = floweringCoverItems.map((item) => {
  const [x, , z] = item.position;
  return {
    id: item.id,
    x,
    y: terrainHeight(x, z) + Math.max(0.18, item.size[1] * 0.8),
    z,
  };
});

function hash01(seed) {
  const value = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return value - Math.floor(value);
}

// Three or four bees share each flower patch at the full count. Individual
// radii and rhythms keep them from reading as synchronized particles.
export function buildBeeSwarm(seed = 1896, count = BEE_COUNT) {
  return Array.from({ length: count }, (_, index) => {
    const beeSeed = seed + index * 37.7;
    return {
      id: `bee-${index}`,
      patch: index % BEE_FLOWER_PATCHES.length,
      phase: hash01(beeSeed + 1) * Math.PI * 2,
      crossPhase: hash01(beeSeed + 2) * Math.PI * 2,
      radius: 0.45 + hash01(beeSeed + 3) * 1.05,
      height: 0.28 + hash01(beeSeed + 4) * 0.62,
      rate: 0.75 + hash01(beeSeed + 5) * 0.75,
      scale: 0.82 + hash01(beeSeed + 6) * 0.3,
      wingPhase: hash01(beeSeed + 7) * Math.PI * 2,
    };
  });
}

// Writes into `out` so the render loop stays allocation-free. The breathing
// radius repeatedly brings each bee close to its flower before it circles out.
export function beeStateAt(bee, seconds, spread = 1, out = {}) {
  const patch = BEE_FLOWER_PATCHES[bee.patch];
  const angle = seconds * bee.rate + bee.phase;
  const visitWave = 0.5 + Math.sin(angle * 0.31 + bee.crossPhase) * 0.5;
  const visitRadius = 0.16 + visitWave * visitWave * 0.84;
  const radius = bee.radius * spread * visitRadius;
  const cross = angle * 0.63 + bee.crossPhase;
  const dart = 0.1 * spread;

  out.x = patch.x
    + Math.cos(angle) * radius
    + Math.sin(cross) * radius * 0.24
    + Math.sin(angle * 3.7 + bee.crossPhase) * dart;
  out.y = patch.y
    + 0.08
    + bee.height * (0.32 + visitRadius * 0.68)
    + Math.sin(angle * 1.7 + bee.crossPhase) * 0.11
    + Math.sin(angle * 4.3 + bee.phase) * dart * 0.45;
  out.z = patch.z
    + Math.sin(angle) * radius * 0.78
    + Math.cos(cross) * radius * 0.2
    + Math.cos(angle * 3.1 + bee.phase) * dart;
  out.yaw = Math.atan2(-Math.sin(angle), Math.cos(angle));
  out.pitch = Math.sin(angle * 1.7 + bee.crossPhase) * 0.12;
  out.bank = Math.sin(angle * 1.13 + bee.phase) * 0.18;
  out.distanceFromFlower = Math.hypot(out.x - patch.x, out.z - patch.z);
  return out;
}
