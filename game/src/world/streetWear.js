// Crossing stones and the leavings of horse traffic on the streets around
// the park, framework-free. Period photographs show flagstone crossings laid
// across the setts at every corner, and roadways marked with dung, straw and
// dust down the middle of each lane.

import { ROADS, SIDEWALK_WIDTH } from './streetGrid.js';

const HALF_WALK = SIDEWALK_WIDTH / 2;
const SLAB_WIDTH = 0.72;
const JOINT = 0.035;

function hash01(seed) {
  const value = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return value - Math.floor(value);
}

// One crossing: two rows of long slabs laid in the walking direction. `axis`
// is the walking direction, 'x' or 'z'; `at` is the fixed coordinate and
// `from`..`to` the span between curbs.
function crossing(axis, at, from, to, seed) {
  const slabs = [];
  [-1, 1].forEach((row, rowIndex) => {
    // The rows break joint with each other.
    let cursor = from + (rowIndex ? 0.45 : 0);
    if (rowIndex) slabs.push(slab(axis, at + row * (SLAB_WIDTH + JOINT) / 2, from, cursor - JOINT, seed + 99));
    let index = 0;
    while (cursor < to - 0.2) {
      const length = Math.min(0.95 + hash01(seed + index * 7 + rowIndex * 31) * 0.6, to - cursor);
      slabs.push(slab(axis, at + row * (SLAB_WIDTH + JOINT) / 2, cursor, cursor + length, seed + index * 13 + rowIndex));
      cursor += length + JOINT;
      index += 1;
    }
  });
  return slabs;
}

function slab(axis, at, from, to, seed) {
  const centre = (from + to) / 2;
  const length = to - from;
  return {
    x: axis === 'x' ? centre : at,
    z: axis === 'x' ? at : centre,
    sx: axis === 'x' ? length : SLAB_WIDTH,
    sz: axis === 'x' ? SLAB_WIDTH : length,
    tone: hash01(seed * 3.7),
    sink: hash01(seed * 5.3),
  };
}

// Crossings sit on the sidewalk centre lines, where the pedestrian walk
// graph crosses, and only where the sidewalk carries on past the corner.
export function crossingSlabs(roads = ROADS) {
  const horizontal = roads.filter((road) => road.axis === 'z');
  const vertical = roads.filter((road) => road.axis === 'x');
  const slabs = [];
  let seed = 1;
  for (const h of horizontal) {
    for (const v of vertical) {
      const vx = (v.lo + v.hi) / 2;
      const hz = (h.lo + h.hi) / 2;
      if (vx < h.from || vx > h.to || hz < v.from || hz > v.to) continue;
      // Across the avenue, carrying the street's sidewalks.
      for (const z of [h.lo - HALF_WALK, h.hi + HALF_WALK]) {
        if (h.from < v.lo - SIDEWALK_WIDTH && h.to > v.hi + SIDEWALK_WIDTH && z >= v.from && z <= v.to) {
          slabs.push(...crossing('x', z, v.lo, v.hi, (seed += 17)));
        }
      }
      // Across the street, carrying the avenue's sidewalks.
      for (const x of [v.lo - HALF_WALK, v.hi + HALF_WALK]) {
        if (v.from < h.lo - SIDEWALK_WIDTH && v.to > h.hi + SIDEWALK_WIDTH && x >= h.from && x <= h.to) {
          slabs.push(...crossing('z', x, h.lo, h.hi, (seed += 17)));
        }
      }
    }
  }
  return slabs;
}

// Places along each road where a crossing lies, so litter keeps off them.
function crossingLines(road, roads) {
  const others = roads.filter((other) => other.axis !== road.axis);
  return others.flatMap((other) => [other.lo - HALF_WALK, other.hi + HALF_WALK]);
}

// Stains, dung and straw. Dung falls where the horses walk, down the middle
// of each lane, and thickest where traffic waits at the corners; straw and
// dust blow into the gutters.
export function roadLitter(roads = ROADS) {
  const stains = [];
  const dung = [];
  const straw = [];
  roads.forEach((road, roadIndex) => {
    const centre = (road.lo + road.hi) / 2;
    const width = road.hi - road.lo;
    const crossings = crossingLines(road, roads);
    const corners = roads
      .filter((other) => other.axis !== road.axis)
      .map((other) => (other.lo + other.hi) / 2);
    const place = (along, across) => (road.axis === 'z' ? [along, across] : [across, along]);
    const clear = (along) => crossings.every((line) => Math.abs(line - along) > 1.1);

    for (const lane of [-1, 1]) {
      let along = road.from + hash01(roadIndex * 11 + lane) * 4;
      let index = 0;
      while (along < road.to) {
        const seed = roadIndex * 1000 + index * 2 + (lane > 0 ? 1 : 0);
        const nearCorner = corners.some((corner) => Math.abs(corner - along) < 16);
        const across = centre + lane * width * 0.21 + (hash01(seed * 1.3) - 0.5) * 1.1;
        if (clear(along)) {
          const [x, z] = place(along, across);
          stains.push({ x, z, size: 0.45 + hash01(seed * 2.1) * 0.8, yaw: hash01(seed * 4.7) * Math.PI * 2, tone: hash01(seed * 6.1) });
          if (hash01(seed * 8.3) < (nearCorner ? 0.4 : 0.14)) {
            const count = 3 + Math.floor(hash01(seed * 9.9) * 5);
            for (let ball = 0; ball < count; ball += 1) {
              const angle = hash01(seed + ball * 3.1) * Math.PI * 2;
              const radius = hash01(seed + ball * 5.7) * 0.16;
              dung.push({ x: x + Math.cos(angle) * radius, z: z + Math.sin(angle) * radius, size: 0.04 + hash01(seed + ball) * 0.025, tone: hash01(seed + ball * 2.3) });
            }
          }
        }
        along += (nearCorner ? 1.6 : 3.4) + hash01(seed * 3.3) * 3;
        index += 1;
      }
    }

    // Gutter straw on both sides.
    for (const side of [-1, 1]) {
      let along = road.from + 2;
      let index = 0;
      while (along < road.to) {
        const seed = roadIndex * 777 + index * 2 + (side > 0 ? 1 : 0);
        const atCorner = corners.some((corner) => Math.abs(corner - along) < width / 2 + HALF_WALK + 3.2);
        if (!atCorner && clear(along) && hash01(seed * 1.9) < 0.6) {
          const across = (side < 0 ? road.lo : road.hi) - side * (0.35 + hash01(seed * 2.9) * 0.45);
          const [x, z] = place(along, across);
          straw.push({ x, z, size: 0.5 + hash01(seed * 3.9) * 0.7, yaw: (road.axis === 'z' ? 0 : Math.PI / 2) + (hash01(seed * 4.4) - 0.5) * 1.2, tone: hash01(seed * 5.1) });
        }
        along += 2.5 + hash01(seed * 6.7) * 5;
        index += 1;
      }
    }
  });
  return { stains, dung, straw };
}
