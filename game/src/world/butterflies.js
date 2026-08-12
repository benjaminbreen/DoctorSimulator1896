// Deterministic butterfly movement around the park's flowering cover.

import { floweringCoverItems } from './groundCover.js';
import { terrainHeight } from './terrain.js';
import { smoothstep } from './solar.js';

export const BUTTERFLY_COUNT = 32;

export const BUTTERFLY_PATCHES = floweringCoverItems.map((item) => {
  const [x, , z] = item.position;
  return { x, y: terrainHeight(x, z) + Math.max(0.25, item.size[1]), z };
});

function hash01(seed) {
  const value = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return value - Math.floor(value);
}

// Full population from 9:00 through 16:00, with gradual activity on either
// side instead of the entire layer appearing or disappearing at once.
export function butterflyActivity(timeOfDay) {
  const morning = smoothstep(7.25, 9, timeOfDay);
  const evening = 1 - smoothstep(16, 18.75, timeOfDay);
  return morning * evening;
}

export function buildButterflies(seed = 1896, count = BUTTERFLY_COUNT) {
  return Array.from({ length: count }, (_, index) => {
    const insectSeed = seed + index * 43.1;
    return {
      id: `butterfly-${index}`,
      patch: index % BUTTERFLY_PATCHES.length,
      phase: hash01(insectSeed + 1) * Math.PI * 2,
      crossPhase: hash01(insectSeed + 2) * Math.PI * 2,
      radius: 1.2 + hash01(insectSeed + 3) * 2.8,
      height: 0.7 + hash01(insectSeed + 4) * 1.5,
      rate: 0.23 + hash01(insectSeed + 5) * 0.24,
      scale: 0.82 + hash01(insectSeed + 6) * 0.34,
      wingPhase: hash01(insectSeed + 7) * Math.PI * 2,
      shade: hash01(insectSeed + 8),
    };
  });
}

// A wide slow circuit plus two quicker harmonics gives the hesitant,
// direction-changing flight of a butterfly without steering simulation.
export function butterflyStateAt(butterfly, seconds, spread = 1, out = {}) {
  const patch = BUTTERFLY_PATCHES[butterfly.patch];
  const angle = seconds * butterfly.rate + butterfly.phase;
  const cross = seconds * butterfly.rate * 1.71 + butterfly.crossPhase;
  const radius = butterfly.radius * spread;
  const dx = -Math.sin(angle) * radius
    + Math.cos(cross * 1.9) * radius * 0.28;
  const dz = Math.cos(angle) * radius * 0.72
    - Math.sin(cross * 1.4) * radius * 0.3;

  out.x = patch.x + Math.cos(angle) * radius + Math.sin(cross * 1.9) * radius * 0.15;
  out.y = patch.y
    + butterfly.height
    + Math.sin(cross) * 0.42
    + Math.sin(angle * 3.2 + butterfly.crossPhase) * 0.18;
  out.z = patch.z + Math.sin(angle) * radius * 0.72 + Math.cos(cross * 1.4) * radius * 0.22;
  out.yaw = Math.atan2(dx, dz);
  out.pitch = Math.sin(cross) * 0.12;
  out.bank = Math.sin(angle * 1.8 + butterfly.crossPhase) * 0.2;
  out.distanceFromFlower = Math.hypot(out.x - patch.x, out.z - patch.z);
  return out;
}
