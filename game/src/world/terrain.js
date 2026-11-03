// Central Park terrain, framework-free and deterministic. The land climbs
// gently to the north and west, the Pond sits in its sunken hollow,
// Hallett's knoll and the schist outcrops rise from the lawn, and
// every path grades the ground it crosses.

import { clamp } from '../movement/mathUtils.js';
import { POND_OUTLINE, PATHS, KNOLLS, MEADOW, GATE, PADS } from './centralPark.js';
import { STREET_LEVEL } from './streetGrid.js';

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

const pathSegments = PATHS.flatMap(path => path.points.slice(1).map((end, i) => {
  const start = path.points[i];
  return { start, end, halfWidth: path.width / 2,
    minX: Math.min(start[0], end[0]), maxX: Math.max(start[0], end[0]),
    minZ: Math.min(start[1], end[1]), maxZ: Math.max(start[1], end[1]) };
}));
const pondBounds = {
  minX: Math.min(...POND_OUTLINE.map(p => p[0])) - 7,
  maxX: Math.max(...POND_OUTLINE.map(p => p[0])) + 7,
  minZ: Math.min(...POND_OUTLINE.map(p => p[1])) - 7,
  maxZ: Math.max(...POND_OUTLINE.map(p => p[1])) + 7,
};

// Bounds reject segments that cannot improve the nearest exact distance.
export function pathsDistance(x, z) {
  let nearest = Infinity;
  for (const segment of pathSegments) {
    const limit = nearest + segment.halfWidth;
    const dx = Math.max(segment.minX - x, 0, x - segment.maxX);
    const dz = Math.max(segment.minZ - z, 0, z - segment.maxZ);
    if (limit <= 0 || dx * dx + dz * dz > limit * limit) continue;
    nearest = Math.min(nearest, segmentDistance(x, z, segment.start, segment.end) - segment.halfWidth);
    if (nearest <= 0) return 0;
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
  if (x < pondBounds.minX || x > pondBounds.maxX || z < pondBounds.minZ || z > pondBounds.maxZ) return 1;
  const edge = polygonEdgeDistance(x, z, POND_OUTLINE);
  const signed=pointInPolygon(x,z,POND_OUTLINE)?-edge:edge;
  // Small erosion scallops break the survey polygon's ruler-straight edges.
  // The waterline remains inside the authored outline used by water contact.
  const erosion=.26+(valueNoise(x*.48+13,z*.48-5)-.5)*.36+Math.sin(x*.9+z*.67)*.08;
  return clamp((signed+erosion)/7,-1,1);
}

// Combined outcrop strength in [0, ~1.5]; also drives rock coloring.
export function rockiness(x, z) {
  let total = 0;
  for (const knoll of KNOLLS) {
    const distance = Math.hypot(x - knoll.x, z - knoll.z);
    total += smooth(clamp(1 - distance / knoll.radius, 0, 1));
  }
  return total;
}

export function terrainHeight(x, z) {
  let height = baseHeight(x, z);
  // Building pads: flat at the pad center's own height inside `flat`,
  // eased off toward `radius`, so a shelter never straddles a slope.
  for (const pad of PADS) {
    const distance = Math.hypot(x - pad.x, z - pad.z);
    if (distance >= pad.radius) continue;
    const weight = 1 - smooth(clamp((distance - pad.flat) / (pad.radius - pad.flat), 0, 1));
    height = height * (1 - weight) + padHeights.get(pad) * weight;
  }
  return height;
}

function baseHeight(x, z) {
  // The land climbs away from the Pond corner, toward the north and west.
  const base = (58 - z) * 0.012 + Math.max(0, -x - 20) * 0.008;

  const rolling =
    (valueNoise(x * 0.025 + 7.3, z * 0.025 + 2.9) - 0.5) * 2.8 +
    (valueNoise(x * 0.08 + 3.1, z * 0.08 + 9.4) - 0.5) * 0.9 +
    (valueNoise(x * 0.25 + 5.7, z * 0.25 + 1.2) - 0.5) * 0.2;

  let relief = rolling;
  for (const knoll of KNOLLS) {
    const distance = Math.hypot(x - knoll.x, z - knoll.z);
    relief += knoll.height * smooth(clamp(1 - distance / knoll.radius, 0, 1));
  }

  // The Green is graded level; paths grade whatever they cross.
  const meadow = smooth(clamp(1 - Math.hypot(x - MEADOW.x, z - MEADOW.z) / MEADOW.radius, 0, 1));
  relief *= 1 - meadow * 0.85;
  relief *= smooth(clamp(pathsDistance(x, z) / 3.5, 0, 1));

  let height = base + relief;

  // Beyond the park wall the city takes over: level street grade under the
  // road and sidewalk strips. The blend must COMPLETE at the park boundary
  // (x=96, z=84), or the lawn is still a metre below the slab where the
  // sidewalk begins and its edge hangs in the air.
  const street = Math.max(
    smooth(clamp((x - 91) / 5, 0, 1)),
    smooth(clamp((z - 79) / 5, 0, 1)),
  );
  if (street > 0) height = height * (1 - street) + (STREET_LEVEL - 0.03) * street;

  // Grand Army Plaza is a raised, level apron with a fully flat core.
  const gateDistance = Math.hypot(x - GATE.x, z - GATE.z);
  const gate = 1 - smooth(clamp((gateDistance - GATE.flat) / (GATE.radius - GATE.flat), 0, 1));
  height = height * (1 - gate) + GATE.height * gate;

  // A low earthen shelf meets the water, then rolls up into the lawn.
  // Varying its width avoids a continuous raised grass embankment.
  const pond = pondDepth(x, z);
  const bankWidth=4+valueNoise(x*.12+5,z*.12+8)*3;
  if (pond < 0) {
    const bedWidth=.9+valueNoise(x*.23+7,z*.23)*.65;
    height = -.42-.55*smooth(clamp(-pond*7/bedWidth,0,1))+pond*1.7;
  } else {
    const shore = smooth(clamp(pond*7/bankWidth, 0, 1));
    height = -.42 * (1 - shore) + height * shore;
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

const padHeights = new Map(PADS.map(pad => [pad, baseHeight(pad.x, pad.z)]));
