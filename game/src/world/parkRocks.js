// Boulder and pebble layout for the park outcrops, framework-free and
// deterministic. Boulders sit on the knolls that want them; pebble scatter
// runs along the pond shore and around each outcrop. SchistOutcrops renders
// the lot and gives the boulders their colliders.

import { KNOLLS, POND_OUTLINE, PADS } from './centralPark.js';
import { terrainHeight, pondDepth, pathsDistance } from './terrain.js';

// No rock lands on a building pad: the Kinderberg's knoll keeps its
// boulders, but outside the shelter.
function onPad(x, z) {
  return PADS.some((pad) => Math.hypot(x - pad.x, z - pad.z) < pad.radius * 0.95);
}

function hash01(seed) {
  const value = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return value - Math.floor(value);
}

// Grey with a faint green cast, per-rock. `lift` in [0,1] spreads light/dark.
function schistTint(seed) {
  const t = hash01(seed) * 0.4;
  return [0.58 + t, 0.58 + t + hash01(seed * 3.7) * 0.06, 0.54 + t];
}

function boulder(seed, x, z, radius) {
  return {
    p: [x, terrainHeight(x, z) + radius * 0.3, z],
    r: [hash01(seed * 5.1) * 0.5, hash01(seed * 7.7) * Math.PI * 2, hash01(seed * 9.3) * 0.4],
    s: [radius, radius * (0.6 + hash01(seed * 4.9) * 0.4), radius * 0.85],
    tint: schistTint(seed),
    hero: radius >= 0.85,
  };
}

export function buildParkRocks() {
  const boulders = [];
  const pebbles = [];

  KNOLLS.forEach((knoll, index) => {
    if (knoll.boulders === false) return;
    // A few real boulders per outcrop, one of them large. Attempts, not
    // guarantees: water, walks, and building pads all veto.
    const count = 4 + (index % 2);
    for (let b = 0; b < count; b += 1) {
      const seed = index * 37.7 + b * 11.3;
      const angle = hash01(seed) * Math.PI * 2;
      const reach = hash01(seed * 1.9) * knoll.radius * 0.7;
      const x = knoll.x + Math.cos(angle) * reach;
      const z = knoll.z + Math.sin(angle) * reach * 0.85;
      if (pondDepth(x, z) < 0.5 || pathsDistance(x, z) < 1.2 || onPad(x, z)) continue;
      const radius = b === 0 ? 0.9 + hash01(seed * 2.3) * 0.7 : 0.35 + hash01(seed * 2.3) * 0.5;
      boulders.push(boulder(seed, x, z, radius));
    }
    // Pebble litter around the outcrop skirt.
    for (let i = 0; i < 9; i += 1) {
      const seed = index * 53.9 + i * 7.1 + 500;
      const angle = hash01(seed) * Math.PI * 2;
      const reach = knoll.radius * (0.4 + hash01(seed * 1.7) * 0.9);
      const x = knoll.x + Math.cos(angle) * reach;
      const z = knoll.z + Math.sin(angle) * reach;
      if (pondDepth(x, z) < 0.25 || pathsDistance(x, z) < 0.5 || onPad(x, z)) continue;
      const radius = 0.09 + hash01(seed * 3.1) * 0.16;
      pebbles.push(boulder(seed, x, z, radius));
    }
  });

  // Shore pebbles: worked along the outline, set back onto the beach ring.
  for (let i = 0; i < POND_OUTLINE.length; i += 1) {
    const [x1, z1] = POND_OUTLINE[i];
    const [x2, z2] = POND_OUTLINE[(i + 1) % POND_OUTLINE.length];
    const length = Math.hypot(x2 - x1, z2 - z1);
    const nx = -(z2 - z1) / (length || 1);
    const nz = (x2 - x1) / (length || 1);
    const count = Math.max(1, Math.round(length / 6));
    for (let k = 0; k < count; k += 1) {
      const seed = i * 17.3 + k * 5.9 + 900;
      if (hash01(seed * 1.3) < 0.35) continue;
      const t = (k + 0.5) / count;
      const setback = 1.0 + hash01(seed) * 1.8;
      // The outline winds clockwise, so (nx, nz) points onto dry land.
      const x = x1 + (x2 - x1) * t + nx * setback;
      const z = z1 + (z2 - z1) * t + nz * setback;
      if (pondDepth(x, z) < 0.12 || pathsDistance(x, z) < 0.5 || onPad(x, z)) continue;
      const radius = 0.08 + hash01(seed * 3.7) * 0.2;
      pebbles.push(boulder(seed, x, z, radius));
    }
  }

  return { boulders, pebbles };
}
