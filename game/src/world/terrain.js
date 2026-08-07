// Central Park terrain, framework-free and deterministic. The Pond is carved
// from its authored outline, paths grade the ground flat, knolls raise the
// schist outcrops, and the Green is a level meadow.

import { clamp } from '../movement/mathUtils.js';
import { POND_OUTLINE, PATHS, KNOLLS, MEADOW, GATE } from './centralPark.js';

function hash(ix, iz) {
  let h = ix * 374761393 + iz * 668265263;
  h = (h ^ (h >> 13)) * 1274126177;
  return (((h ^ (h >> 16)) >>> 0) % 10000) / 10000;
}

function smooth(t) {
  return t * t * (3 - 2 * t);
}

function valueNoise(x, z) {
  const ix = Math.floor(x);
  const iz = Math.floor(z);
  const fx = smooth(x - ix);
  const fz = smooth(z - iz);
  const a = hash(ix, iz);
  const b = hash(ix + 1, iz);
  const c = hash(ix, iz + 1);
  const d = hash(ix + 1, iz + 1);
  return a + (b - a) * fx + (c - a) * fz + (a - b - c + d) * fx * fz;
}

function segmentDistance(x, z, [x1, z1], [x2, z2]) {
  const dx = x2 - x1;
  const dz = z2 - z1;
  const lengthSq = dx * dx + dz * dz;
  const t = lengthSq === 0 ? 0 : clamp(((x - x1) * dx + (z - z1) * dz) / lengthSq, 0, 1);
  return Math.hypot(x - (x1 + dx * t), z - (z1 + dz * t));
}

// Distance to the nearest path centerline minus its half width (0 on a path).
export function pathsDistance(x, z) {
  let nearest = Infinity;
  for (const path of PATHS) {
    for (let i = 0; i < path.points.length - 1; i += 1) {
      const distance = segmentDistance(x, z, path.points[i], path.points[i + 1]) - path.width / 2;
      if (distance < nearest) nearest = distance;
    }
  }
  return Math.max(0, nearest);
}

function pointInPolygon(x, z, polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const [xi, zi] = polygon[i];
    const [xj, zj] = polygon[j];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

function polygonEdgeDistance(x, z, polygon) {
  let nearest = Infinity;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const distance = segmentDistance(x, z, polygon[j], polygon[i]);
    if (distance < nearest) nearest = distance;
  }
  return nearest;
}

// Signed pond field: negative inside (toward -1 at depth), positive outside.
export function pondDepth(x, z) {
  const edge = polygonEdgeDistance(x, z, POND_OUTLINE);
  if (pointInPolygon(x, z, POND_OUTLINE)) return -Math.min(1, edge / 6);
  return Math.min(1, edge / 6);
}

export function terrainHeight(x, z) {
  const rolling =
    (valueNoise(x * 0.03 + 7.3, z * 0.03 + 2.9) - 0.5) * 2.6 +
    (valueNoise(x * 0.09 + 3.1, z * 0.09 + 9.4) - 0.5) * 0.8 +
    (valueNoise(x * 0.27 + 5.7, z * 0.27 + 1.2) - 0.5) * 0.2;

  let height = rolling;
  for (const knoll of KNOLLS) {
    const distance = Math.hypot(x - knoll.x, z - knoll.z);
    height += knoll.height * smooth(clamp(1 - distance / knoll.radius, 0, 1));
  }

  // The Green and the gate apron are graded level.
  const meadow = smooth(clamp(1 - Math.hypot(x - MEADOW.x, z - MEADOW.z) / MEADOW.radius, 0, 1));
  const gate = smooth(clamp(1 - Math.hypot(x - GATE.x, z - GATE.z) / GATE.radius, 0, 1));
  height *= 1 - Math.max(meadow * 0.85, gate);

  // Paths grade the ground toward level.
  height *= smooth(clamp(pathsDistance(x, z) / 3.5, 0, 1));

  // Carve the Pond; lift its banks gently just outside.
  const pond = pondDepth(x, z);
  if (pond < 0) {
    height = Math.min(height, 0) + pond * 1.7;
  } else {
    height *= smooth(clamp(pond, 0, 1)) * 0.85 + 0.15;
  }

  return height;
}

// Sampled grid for tests and any future heightfield consumer.
export function sampleHeights(size, segments) {
  const heights = [];
  const half = size / 2;
  for (let row = 0; row <= segments; row += 1) {
    for (let col = 0; col <= segments; col += 1) {
      const x = -half + (size * col) / segments;
      const z = -half + (size * row) / segments;
      heights.push(terrainHeight(x, z));
    }
  }
  return heights;
}
