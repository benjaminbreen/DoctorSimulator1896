// Fireflies share the flower beds but wake according to solar altitude, not a
// hard clock switch. Their motion is evaluated in the vertex shader.

import { floweringCoverItems } from './groundCover.js';
import { terrainHeight } from './terrain.js';
import { smoothstep, solarRamps } from './solar.js';

export const FIREFLY_COUNT = 88;

export const FIREFLY_PATCHES = floweringCoverItems.map((item) => {
  const [x, , z] = item.position;
  return { x, y: terrainHeight(x, z) + 0.12, z };
});

function hash01(seed) {
  const value = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return value - Math.floor(value);
}

export function fireflyActivity(timeOfDay, dayOfYear) {
  const { altitude } = solarRamps(timeOfDay, dayOfYear);
  // Wake in the long late-June shadows rather than waiting until after
  // sunset: first glimmers below 8 degrees, fully present near the horizon.
  return 1 - smoothstep(1, 8, altitude);
}

export function buildFireflies(seed = 1896, count = FIREFLY_COUNT) {
  return Array.from({ length: count }, (_, index) => {
    const insectSeed = seed + index * 31.9;
    return {
      id: `firefly-${index}`,
      patch: index % FIREFLY_PATCHES.length,
      phase: hash01(insectSeed + 1) * Math.PI * 2,
      pulse: hash01(insectSeed + 2) * Math.PI * 2,
      radius: 1.2 + hash01(insectSeed + 3) * 3.2,
      height: 0.35 + hash01(insectSeed + 4) * 1.65,
      rate: 0.16 + hash01(insectSeed + 5) * 0.28,
      size: 2.4 + hash01(insectSeed + 6) * 1.8,
    };
  });
}
