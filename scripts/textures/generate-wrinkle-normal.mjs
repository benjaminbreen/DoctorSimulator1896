// Generates the garment-scale wrinkle normal map layered over the weave
// normals in rendererCWardrobeSurface: long vertical fold ridges that deepen
// toward the hem, soft diagonal crumple, and fine rumple. Tiling, seeded,
// written once into the fabric texture folder.
//
//   node scripts/textures/generate-wrinkle-normal.mjs

import { fileURLToPath } from 'node:url';
import path from 'node:path';
import sharp from 'sharp';

const SIZE = 512;
const SEED = 18960615;
const OUT = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../game/public/textures/renderer-c/fabrics/wrinkles-normal.png',
);

function makeRng(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0xffffffff;
  };
}

const rng = makeRng(SEED);

// Tiling value noise on an N-cell lattice.
function makeNoise(cells) {
  const lattice = Array.from({ length: cells * cells }, () => rng());
  const at = (x, y) => lattice[((y % cells + cells) % cells) * cells + ((x % cells + cells) % cells)];
  const smooth = (t) => t * t * (3 - 2 * t);
  return (u, v) => {
    const x = u * cells;
    const y = v * cells;
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const fx = smooth(x - x0);
    const fy = smooth(y - y0);
    const a = at(x0, y0);
    const b = at(x0 + 1, y0);
    const c = at(x0, y0 + 1);
    const d = at(x0 + 1, y0 + 1);
    return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
  };
}

const crumple = makeNoise(6);
const rumple = makeNoise(24);
const depthAlongFold = makeNoise(4);

// Vertical folds: position, half-width, amplitude. Widths vary so the skirt
// reads as gathered cloth, not corrugation.
const folds = Array.from({ length: 7 }, () => ({
  center: rng(),
  width: 0.018 + rng() * 0.035,
  amplitude: 0.55 + rng() * 0.45,
}));

function wrappedDistance(a, b) {
  const d = Math.abs(a - b);
  return Math.min(d, 1 - d);
}

function heightAt(u, v) {
  let height = 0;
  for (const fold of folds) {
    const distance = wrappedDistance(u, fold.center);
    const ridge = Math.exp(-(distance * distance) / (2 * fold.width * fold.width));
    // Folds deepen and wander down the drop, the way a gathered skirt hangs.
    const depth = 0.5 + 0.5 * depthAlongFold(fold.center, v);
    height += ridge * fold.amplitude * depth;
  }
  height += (crumple(u + v * 0.35, v - u * 0.2) - 0.5) * 0.85;
  height += (rumple(u, v) - 0.5) * 0.22;
  return height;
}

const field = new Float32Array(SIZE * SIZE);
for (let y = 0; y < SIZE; y += 1) {
  for (let x = 0; x < SIZE; x += 1) {
    field[y * SIZE + x] = heightAt(x / SIZE, y / SIZE);
  }
}

const STRENGTH = 2.1;
const pixels = Buffer.alloc(SIZE * SIZE * 4);
for (let y = 0; y < SIZE; y += 1) {
  for (let x = 0; x < SIZE; x += 1) {
    const left = field[y * SIZE + ((x + SIZE - 1) % SIZE)];
    const right = field[y * SIZE + ((x + 1) % SIZE)];
    const up = field[((y + SIZE - 1) % SIZE) * SIZE + x];
    const down = field[((y + 1) % SIZE) * SIZE + x];
    const nx = (left - right) * STRENGTH;
    const ny = (down - up) * STRENGTH;
    const length = Math.hypot(nx, ny, 1);
    const offset = (y * SIZE + x) * 4;
    pixels[offset] = Math.round(((nx / length) * 0.5 + 0.5) * 255);
    pixels[offset + 1] = Math.round(((ny / length) * 0.5 + 0.5) * 255);
    pixels[offset + 2] = Math.round(((1 / length) * 0.5 + 0.5) * 255);
    pixels[offset + 3] = 255;
  }
}

await sharp(pixels, { raw: { width: SIZE, height: SIZE, channels: 4 } })
  .png({ compressionLevel: 9 })
  .toFile(OUT);

console.log(`wrote ${OUT}`);
