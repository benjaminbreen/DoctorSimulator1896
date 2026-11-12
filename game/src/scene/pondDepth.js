import { terrainHeight } from '../world/terrain.js';

export const POND_DEPTH_RESOLUTION = 512;
export const POND_DEPTH_RANGE = 2.5;

export function samplePondDepth(outline, level) {
  const x = outline.map((point) => point[0]);
  const z = outline.map((point) => point[1]);
  const minX = Math.min(...x) - 5;
  const minZ = Math.min(...z) - 5;
  const width = Math.max(...x) + 5 - minX;
  const height = Math.max(...z) + 5 - minZ;
  const size = POND_DEPTH_RESOLUTION;
  const depths = new Float32Array(size * size);
  const data = new Uint8Array(size * size * 4);
  for (let row = 0; row < size; row += 1) {
    const z = minZ + (row / (size - 1)) * height;
    for (let col = 0; col < size; col += 1) {
      const x = minX + (col / (size - 1)) * width;
      const depth = Math.min(POND_DEPTH_RANGE, Math.max(0, level - terrainHeight(x, z)));
      const i = row * size + col;
      depths[i] = depth;
      data[i * 4] = Math.round((depth / POND_DEPTH_RANGE) * 255);
      data[i * 4 + 3] = 255;
    }
  }
  return { data, depths, minX, minZ, width, height };
}
