// The southeast corner of Central Park, c. 1896, at 0.4 scale. +x is east
// (Fifth Avenue wall at x=96), +z is south (Central Park South wall at z=84).
// World frame: x in [-100, 100], z in [-85, 85].
//
// The Pond outline is the OSM polygon (way 22726524) projected into this
// frame: grid-rotated, 0.4-scaled, anchored at the Fifth/CPS corner. Ben's
// call: the modern outline stands in for 1896. The big lobe lies along CPS,
// the arm runs north to the Gapstow narrows (bridge at 8.2, -9.4), a small
// lobe sits beyond, and the Hallett peninsula fills the crook between arm
// and lobe. Drives and walks are eyeballed from the same map.

import { parkProp, gasLamp } from './parkCatalog.js';
import { WALK_TOP } from './streetGrid.js';
import { ladysGlove } from './furnishings.js';
import { GAPSTOW, localToWorld, walkY, RUN_W } from './gapstow.js';
import { PARK_LANDMARKS } from './parkLandmarks.js';


export const POND_OUTLINE = [
  [-37.6, 40.3], [-26.4, 58.7], [-15.6, 63.6], [-1.4, 62.9], [3.9, 60.5],
  [7.6, 61.4], [19.8, 53.7], [22.3, 53.6], [34, 60.6], [40.2, 58.6],
  [37.7, 51.9], [39.9, 47.1], [38.4, 36.3], [29.1, 20.5], [29.6, 8.4],
  [26, 5], [22.1, 5.9], [23.2, -1.9], [19.8, -8.8], [17, -11.1],
  [11.5, -10.5], [8.7, -12.4], [2, -23.6], [-0.7, -19.7], [-3.9, -20.8],
  [-7.6, -21.4],
  // Upper basin, filled in 1950 for Wollman Rink; in 1896 the water ran on
  // northwest through a narrow neck. Drawn short of the drive and the knoll.
  [-11, -21.8], [-14, -23.2], [-18, -25], [-23, -25.5], [-27, -23],
  [-28, -18.5], [-24.5, -14.8], [-19, -14.2], [-14.5, -15], [-11, -15.6],
  [-7.5, -15.4], [-4.4, -12.6], [10, -4.1], [9.8, -1.5],
  [7.9, -1.9], [1.9, 1.7], [2.2, 5], [-0.5, 9.5], [15.7, 34.2],
  [16.3, 39.8], [1.4, 46.6], [-14.4, 44.1], [-18.8, 47], [-19.7, 50.6],
  [-22.4, 52.3], [-35.2, 36.6], [-36.2, 32.6], [-33.6, 27.7], [-36.2, 25],
  [-41.1, 26.1], [-41.7, 28.2],
];

export const WATER_LEVEL = -0.5;

// Motion affordances are sparse authored staging points, not another collider
// layer. These four sit at the exposed ends of Gapstow's parapets. Future roof
// and prop builders can emit the same local data contract after transforming
// their own anchor and outward normal into world space.
export const PARK_MOTION_AFFORDANCES = Object.freeze(
  [-1, 1].flatMap((end) => [-1, 1].map((side) => {
    const along = end * (RUN_W - 0.2);
    const across = side * 1.62;
    const [x, z] = localToWorld(along, across);
    return Object.freeze({
      id: `gapstow-parapet-${end < 0 ? 'west' : 'east'}-${side < 0 ? 'north' : 'south'}`,
      type: 'ledge',
      position: Object.freeze([x, walkY(along), z]),
      outward: Object.freeze([
        side * Math.sin(GAPSTOW.yaw),
        side * Math.cos(GAPSTOW.yaw),
      ]),
      radius: 0.56,
      heightTolerance: 0.5,
      dwellSeconds: 0.35,
      safeRetreat: 0.48,
    });
  })),
);

export const PATHS = [
  // Center Drive: Scholars' Gate, north past the east shore, then the sweep
  // west above the north lobe.
  { id: 'center-drive', width: 6, points: [[88, 70], [82, 54], [76, 38], [68, 22], [60, 8], [52, -6], [42, -18], [30, -28], [16, -34], [0, -36], [-18, -34], [-38, -28], [-58, -20], [-76, -10], [-94, -2]] },
  // East Drive: branches north along Fifth Avenue past the Arsenal.
  { id: 'east-drive', width: 5, points: [[76, 38], [80, 20], [80, -6], [78, -30], [78, -56], [80, -83]] },
  // Pond walk: the outer shore, from the Plaza along CPS and around the hook.
  { id: 'pond-walk', width: 3.2, points: [[86, 66], [72, 64], [58, 63], [46, 64], [36, 66], [24, 64], [12, 66], [3.6, 67.2], [-2, 68], [-16, 68], [-28, 62], [-38, 52], [-44, 40], [-48, 30], [-50, 20], [-56, 12]] },
  // North shore walk: down from the drive, over Gapstow, along the Hallett
  // side, west to meet the pond walk beyond the hook.
  { id: 'north-walk', width: 2.8, points: [[52, -6], [38, -10], [26, -12], [17, -14], [11.2, -14.2], [5.2, -4.6], [-1, 3], [-8, 8], [-18, 12], [-28, 15], [-38, 16], [-48, 16], [-56, 12]] },
  // Ring around the Green.
  { id: 'green-walk', width: 2.4, points: [[-8, -46], [-14, -62], [-30, -70], [-46, -64], [-52, -50], [-46, -38], [-30, -33], [-14, -38], [-8, -46]] },
  // Spurs: every destination gets a walk to its door.
  { id: 'dairy-walk', width: 2.2, points: [[-8, -46], [8, -47], [22, -46], [25.5, -45.5]] },
  { id: 'kinderberg-walk', width: 2.2, points: [[22, -46], [30, -51], [37.5, -55.5]] },
  { id: 'copcot-walk', width: 1.8, points: [[-28, 62], [-31, 67], [-33.5, 71]] },
  { id: 'arbor-walk', width: 1.6, points: [[-8, 8], [-4, 20], [0, 30], [1.5, 35.5]] },
  { id: 'carousel-walk', width: 2.0, points: [[8, -47], [6.8, -47.8], [6.1, -48.8]] },
  // Down to the swan boat landing (world/rusticwork.js) on the south shore.
  { id: 'landing-walk', width: 2.0, points: [[3.6, 67.2], [1.86, 63.16]] },
];

// Rock outcrops (Manhattan schist). Hallett's knoll sits on the peninsula;
// two small ones flank the Gapstow narrows, whose boulders come from the
// bridge module instead of the generic scatter.
export const KNOLLS = [
  { x: 2, z: 28, radius: 11, height: 3.0 },
  { x: 18, z: -17, radius: 6, height: 1.5, boulders: false },
  { x: -2, z: -6, radius: 4.5, height: 1.2, boulders: false },
  // Cop Cot's rock above the Pond's southwest shore. No boulder scatter:
  // the summerhouse pad sits on the crown.
  { x: -34, z: 74, radius: 8, height: 1.5, boulders: false },
  { x: 70, z: 30, radius: 12, height: 2.0 },
  { x: -52, z: -6, radius: 20, height: 3.6 },
  { x: -88, z: 20, radius: 14, height: 2.8 },
  { x: 44, z: -56, radius: 16, height: 2.0 },
];

export const MEADOW = { x: -30, z: -52, radius: 24 };

// Graded building pads: terrain flattens to the pad center's height inside
// `flat`, easing off toward `radius`. The shelters and the Dairy stand on
// these the way the real ones stood on graded crowns.
export const PADS = [
  { x: 44, z: -56, radius: 10, flat: 7 },   // Kinderberg, atop its knoll
  { x: -34, z: 73, radius: 6, flat: 4 },    // Cop Cot, overlooking the Pond
  { x: 29, z: -48, radius: 8, flat: 6 },    // the Dairy
  { x: 2, z: 39, radius: 3.5, flat: 2.2 },  // Hallett arbor
  { x: 6, z: -54, radius: 10, flat: 8.3 }, // the carousel
];
// Grand Army Plaza sits above the sunken pond hollow. Fully level inside
// `flat`, easing off toward `radius`, so the paving never floats.
export const GATE = { x: 88, z: 70, radius: 30, flat: 19, height: 1.2 };

function hash01(seed) {
  const value = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return value - Math.floor(value);
}

// Canopy tint. These multiply the leaf texture rather than replacing a flat
// colour, so they sit near white: a saturated green here darkens every tree
// and throws away what the map already says. The spread is what keeps a row
// of elms from reading as one repeated object.
const CANOPY_COLORS = ['#d8e0c6', '#cfdcbc', '#e2e6d0', '#c6d4b2'];

// One entry per tree: the collider is the trunk cylinder; TreeField renders
// the baked species model from the `tree` payload, scaled to `height`.
function tree(id, x, z, species, height, name, colorIndex) {
  const trunkH = 3;
  const trunkR = 0.12 + height * 0.022;
  return {
    id, kind: 'tree', shape: 'tree',
    position: [x, trunkH / 2, z], size: [trunkR * 2, trunkH, trunkR * 2], yaw: 0,
    color: CANOPY_COLORS[colorIndex % 4],
    tree: { species, height, name },
  };
}

function pointAlong(points, t) {
  const index = Math.min(points.length - 2, Math.floor(t * (points.length - 1)));
  const local = t * (points.length - 1) - index;
  const [x1, z1] = points[index];
  const [x2, z2] = points[index + 1];
  return [x1 + (x2 - x1) * local, z1 + (z2 - z1) * local, x2 - x1, z2 - z1];
}

function segmentDistance(x, z, [x1, z1], [x2, z2]) {
  const dx = x2 - x1;
  const dz = z2 - z1;
  const t = Math.max(0, Math.min(1, ((x - x1) * dx + (z - z1) * dz) / (dx * dx + dz * dz || 1)));
  return Math.hypot(x - x1 - dx * t, z - z1 - dz * t);
}

function shoreDistance(x, z) {
  let best = Infinity;
  for (let i = 0; i < POND_OUTLINE.length; i += 1) {
    best = Math.min(best, segmentDistance(x, z, POND_OUTLINE[i], POND_OUTLINE[(i + 1) % POND_OUTLINE.length]));
  }
  return best;
}

// Ground a trunk can stand on: dry, off the walks, clear of the buildings'
// pads, the Plaza paving, the bridge, the Arsenal yard and the street walls.
function plantable(x, z) {
  if (Math.abs(x) > 93 || z > 81 || z < -82) return false;
  if (insidePond(x, z) || shoreDistance(x, z) < 1) return false;
  for (const path of PATHS) {
    for (let i = 0; i + 1 < path.points.length; i += 1) {
      if (segmentDistance(x, z, path.points[i], path.points[i + 1]) < path.width / 2 + 1.6) return false;
    }
  }
  for (const pad of PADS) if (Math.hypot(x - pad.x, z - pad.z) < pad.radius + 1) return false;
  if (Math.hypot(x - GATE.x, z - GATE.z) < GATE.flat + 2) return false;
  if (Math.hypot(x - GAPSTOW.x, z - GAPSTOW.z) < 9) return false;
  if (x > 72 && z < -30 && z > -68) return false;
  if (x > 81 && z < -30) return false; // the Menagerie's yards
  return true;
}

// The species the park actually had in each quarter, after Peet's Trees and
// Shrubs of Central Park (1903). [model, common name, weight]; the model is
// the nearest baked shape, the name is what the examine view reports.
const MIX = {
  shore: [['willow', 'weeping willow', 3], ['cottonwood', 'cottonwood', 2], ['cypress', 'bald cypress', 1], ['broadleaf', 'alder', 2], ['broadleaf', 'American hornbeam', 1]],
  pondWoods: [['elm', 'American elm', 2], ['pine', 'white pine', 1], ['pine', 'Austrian pine', 1], ['broadleaf', 'catalpa', 1], ['broadleaf', 'American hornbeam', 1]],
  pines: [['pine', 'white pine', 2], ['pine', 'Austrian pine', 2], ['pine', 'Scotch pine', 1], ['elm', 'American elm', 1]],
  arsenal: [['compound', 'honey locust', 2], ['compound', 'Japanese pagoda tree', 1], ['broadleaf', 'catalpa', 1], ['broadleaf', 'buckeye', 1], ['broadleaf', 'red maple', 1], ['broadleaf', 'Osage orange', 1]],
  carousel: [['broadleaf', 'silver maple', 2], ['broadleaf', 'red maple', 1], ['broadleaf', 'English maple', 1], ['broadleaf', 'catalpa', 1], ['cottonwood', 'cottonwood', 1]],
  plaza: [['compound', 'European flowering ash', 2], ['broadleaf', 'silver maple', 1], ['elm', 'American elm', 1]],
  drive: [['elm', 'American elm', 3], ['broadleaf', 'silver maple', 2], ['broadleaf', 'catalpa', 1], ['compound', 'honey locust', 1], ['cottonwood', 'cottonwood', 1]],
  west: [['elm', 'American elm', 2], ['broadleaf', 'red maple', 1], ['broadleaf', 'silver maple', 1], ['broadleaf', 'buckeye', 1], ['cottonwood', 'cottonwood', 1], ['pine', 'white pine', 1]],
};

// Height in metres at maturity in a young park: the planting was thirty-odd
// years old in 1896.
const HEIGHT = { elm: 15, cottonwood: 16, willow: 10, cypress: 11, poplar: 16, beech: 10, pine: 10, broadleaf: 11, compound: 11, ailanthus: 7 };

function pick(mix, roll) {
  const total = mix.reduce((sum, entry) => sum + entry[2], 0);
  let left = roll * total;
  for (const entry of mix) {
    left -= entry[2];
    if (left <= 0) return entry;
  }
  return mix[mix.length - 1];
}

function placeTree(items, id, x, z, [species, name], seed) {
  const height = HEIGHT[species] * (0.82 + hash01(seed * 1.7) * 0.33);
  items.push(tree(id, x, z, species, height, name, Math.floor(hash01(seed * 2.3) * 4)));
}

// Trees keep a crown's width apart unless they were planted as a clump.
function spaced(items, x, z, gap) {
  return !items.some((item) => item.kind === 'tree' && Math.hypot(item.position[0] - x, item.position[2] - z) < gap);
}

// A loose grove: seeded scatter in a circle, rejected where nothing can grow.
function grove(items, prefix, cx, cz, radius, count, mix, gap = 6) {
  let placed = 0;
  for (let attempt = 0; attempt < count * 12 && placed < count; attempt += 1) {
    const seed = cx * 13.1 + cz * 7.7 + attempt * 3.3;
    const angle = hash01(seed) * Math.PI * 2;
    const r = Math.sqrt(hash01(seed + 1.9)) * radius;
    const x = cx + Math.cos(angle) * r;
    const z = cz + Math.sin(angle) * r;
    if (!plantable(x, z) || !spaced(items, x, z, gap)) continue;
    placeTree(items, `${prefix}-${placed}`, x, z, pick(mix, hash01(seed + 4.1)), seed);
    placed += 1;
  }
}

// Irregular planting beside a walk or drive: mixed species, uneven gaps,
// some stretches left open. Elm avenues were the Mall's alone.
function treesAlongPath(items, path, count, prefix, mix, setback, bothSides) {
  for (let i = 0; i < count; i += 1) {
    const t = (i + 0.2 + hash01(i * 9.1 + setback) * 0.6) / count;
    const [x, z, dx, dz] = pointAlong(path.points, t);
    const length = Math.hypot(dx, dz) || 1;
    for (const side of bothSides ? [1, -1] : [1]) {
      if (hash01(i * 4.3 + side) < 0.3) continue;
      const offset = path.width / 2 + setback + hash01(i * 3.7 + side) * 3;
      const ax = x + (-dz / length) * offset * side;
      const az = z + (dx / length) * offset * side;
      if (!plantable(ax, az) || !spaced(items, ax, az, 7)) continue;
      const seed = i * 11.3 + side * 5 + setback;
      placeTree(items, `${prefix}-${i}${side > 0 ? 'a' : 'b'}`, ax, az, pick(mix, hash01(seed)), seed);
    }
  }
}

// Around the shore at even steps of the outline, set back to dry ground.
function shoreTrees(items, from, to, count, prefix) {
  for (let i = 0; i < count; i += 1) {
    const at = from + ((to - from) * (i + hash01(i * 2.9) * 0.6)) / count;
    const k = Math.floor(at) % POND_OUTLINE.length;
    const [x1, z1] = POND_OUTLINE[k];
    const [x2, z2] = POND_OUTLINE[(k + 1) % POND_OUTLINE.length];
    const f = at - Math.floor(at);
    const [px, pz] = [x1 + (x2 - x1) * f, z1 + (z2 - z1) * f];
    const length = Math.hypot(x2 - x1, z2 - z1) || 1;
    let [nx, nz] = [-(z2 - z1) / length, (x2 - x1) / length];
    if (insidePond(px + nx, pz + nz)) [nx, nz] = [-nx, -nz];
    for (const offset of [1.6, 3, 4.5]) {
      const x = px + nx * offset;
      const z = pz + nz * offset;
      if (!plantable(x, z) || !spaced(items, x, z, 6)) continue;
      const seed = at * 17.3;
      placeTree(items, `${prefix}-${i}`, x, z, pick(MIX.shore, hash01(seed)), seed);
      break;
    }
  }
}

// The park wall: coursed stone about 3 ft 7 in above the sidewalk, capped
// with a lighter coping, on top of the retaining wall below. Runs are
// axis-aligned, so each is one box plus its cap.
const WALL_HEIGHT = 1.1;
const WALL_THICK = 0.5;
function wallRun(items, prefix, from, to) {
  const alongX = Math.abs(to[0] - from[0]) > Math.abs(to[1] - from[1]);
  const length = Math.hypot(to[0] - from[0], to[1] - from[1]);
  const x = (from[0] + to[0]) / 2;
  const z = (from[1] + to[1]) / 2;
  const box = (w, d) => (alongX ? [length, 0, d] : [w, 0, length]);
  const [sx, , sz] = box(WALL_THICK, WALL_THICK);
  items.push(
    {
      id: `${prefix}-0`, kind: 'furniture', position: [x, WALK_TOP + WALL_HEIGHT / 2 - 0.04, z],
      size: [sx, WALL_HEIGHT, sz], yaw: 0, color: '#b5ad9a', texture: 'blockstone', absoluteY: true,
    },
    {
      id: `${prefix}-cap`, kind: 'furniture', position: [x, WALK_TOP + WALL_HEIGHT + 0.02, z],
      size: alongX ? [length, 0.12, WALL_THICK + 0.12] : [WALL_THICK + 0.12, 0.12, length],
      yaw: 0, color: '#d2cab6', texture: 'blockstone', absoluteY: true, collider: false,
    },
  );
}

// A pier a little wider and taller than the wall, with a projecting cap and
// a low block above it.
function gatePier(items, id, x, z) {
  const height = WALL_HEIGHT + 0.36;
  const stone = { kind: 'furniture', yaw: 0, texture: 'blockstone', absoluteY: true };
  items.push(
    { ...stone, id, position: [x, WALK_TOP + height / 2 - 0.04, z], size: [0.86, height, 0.86], color: '#b2aa96' },
    { ...stone, id: `${id}-cap`, position: [x, WALK_TOP + height + 0.04, z], size: [1.04, 0.16, 1.04], color: '#d2cab6', collider: false },
    { ...stone, id: `${id}-top`, position: [x, WALK_TOP + height + 0.2, z], size: [0.7, 0.16, 0.7], color: '#cbc3ae', collider: false },
  );
}

function insidePond(x, z) {
  let inside = false;
  for (let i = 0, j = POND_OUTLINE.length - 1; i < POND_OUTLINE.length; j = i, i += 1) {
    const [xi, zi] = POND_OUTLINE[i];
    const [xj, zj] = POND_OUTLINE[j];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

// Benches set back from a walk, facing across it. `side` picks which hand of
// the path they sit on: +1 is the left of the direction of travel. Anything
// that lands in the Pond is dropped — the walks run close to the shore, and a
// bench standing in the water is worse than a gap in the dressing.
function benchesAlongPath(items, path, count, prefix, model, side) {
  for (let i = 0; i < count; i += 1) {
    const t = (i + 0.5) / count;
    const [x, z, dx, dz] = pointAlong(path.points, t);
    const length = Math.hypot(dx, dz) || 1;
    const nx = (-dz / length) * side;
    const nz = (dx / length) * side;
    const offset = path.width / 2 + 1.1 + hash01(i * 5.1) * 0.6;
    const bx = x + nx * offset;
    const bz = z + nz * offset;
    if (insidePond(bx, bz)) continue;
    items.push(parkProp(`${prefix}-${i}`, model, bx, bz, Math.atan2(-nx, -nz)));
  }
}

function buildItems() {
  const items = [];

  // Specimens first, so the groves fill in around them.
  // A Lombardy poplar at each end of the Gapstow narrows, purple beeches set
  // alone on lawns where they were meant to be looked at, and an elm on the
  // lawn by the carousel.
  // Two big old elms at the Plaza entrance, where the walk starts: they
  // shade the paving the player first stands on.
  items.push(
    tree('plaza-elm-a', 78.5, 59.9, 'old-elm', 17.5, 'American elm', 0),
    tree('plaza-elm-b', 92.1, 61.4, 'old-elm', 18.5, 'American elm', 2),
  );
  placeTree(items, 'gapstow-poplar-n', 15, -20, ['poplar', 'Lombardy poplar'], 1);
  placeTree(items, 'gapstow-poplar-s', 0, -9.5, ['poplar', 'Lombardy poplar'], 2);
  placeTree(items, 'lawn-beech-e', 55, 45, ['beech', 'purple beech'], 3);
  placeTree(items, 'lawn-beech-w', -64, 52, ['beech', 'purple beech'], 4);
  placeTree(items, 'carousel-elm', 18, -60, ['elm', 'American elm'], 5);

  shoreTrees(items, 0, POND_OUTLINE.length, 22, 'shore');

  // Hallett's wooded knoll, the pine knolls west and northwest, and the
  // woods along the Pond's west side.
  grove(items, 'hallett', 2, 28, 11, 9, MIX.pondWoods, 5.5);
  grove(items, 'west-knoll', -52, -6, 18, 9, MIX.pines, 6);
  grove(items, 'far-knoll', -86, 20, 13, 6, MIX.pines);
  grove(items, 'east-knoll', 68, 28, 12, 6, MIX.pondWoods);
  grove(items, 'pond-west', -64, 34, 14, 8, MIX.west);
  grove(items, 'cps-west', -72, 68, 14, 7, MIX.west);
  grove(items, 'northwest', -80, -40, 16, 9, MIX.west);
  grove(items, 'north-lawn', -66, -64, 14, 6, MIX.west);
  grove(items, 'arsenal', 64, -42, 14, 9, MIX.arsenal);
  grove(items, 'arsenal-north', 66, -70, 12, 5, MIX.arsenal);
  grove(items, 'fifth-ave', 86, -6, 9, 4, MIX.arsenal);
  grove(items, 'carousel', -2, -66, 10, 5, MIX.carousel);
  grove(items, 'dairy', 30, -34, 10, 4, MIX.carousel);
  grove(items, 'plaza', 72, 72, 10, 4, MIX.plaza, 5);
  grove(items, 'cps-east', 40, 76, 16, 5, MIX.plaza);
  grove(items, 'cps-mid', 0, 77, 14, 5, MIX.pondWoods);
  grove(items, 'east-lawn', 56, 0, 10, 4, MIX.drive);

  treesAlongPath(items, PATHS[0], 16, 'center-drive', MIX.drive, 2.4, true);
  treesAlongPath(items, PATHS[1], 7, 'east-drive', MIX.arsenal, 2.2, false);
  treesAlongPath(items, PATHS[4], 8, 'green', MIX.west, 2.0, false);

  // Tree of heaven seeds itself along the boundary walls and in waste corners.
  for (const [i, [x, z]] of [[94, -83], [91, 44], [90, 12], [-20, 80], [-90, 78], [-91, -60], [52, 80]].entries()) {
    if (plantable(x, z) && spaced(items, x, z, 4)) placeTree(items, `ailanthus-${i}`, x, z, ['ailanthus', 'tree of heaven'], i + 40);
  }

  // Gapstow colliders: invisible steps riding the bridge's walk profile
  // (GapstowBridge renders the masonry). Boxes every 0.9 keep each rise
  // under the 0.32 autostep on the steepest part of the curve; rail boxes
  // stand where the parapet does.
  const across = (offset, side = 0) => [
    GAPSTOW.x + Math.cos(GAPSTOW.yaw) * offset + Math.sin(GAPSTOW.yaw) * side,
    GAPSTOW.z - Math.sin(GAPSTOW.yaw) * offset + Math.cos(GAPSTOW.yaw) * side,
  ];
  const gapstowBox = (id, offset, side, length, width, bottom, top) => {
    const [x, z] = across(offset, side);
    return {
      id, kind: 'furniture', position: [x, (bottom + top) / 2, z],
      size: [length, top - bottom, width], yaw: GAPSTOW.yaw,
      color: '#8f8878', absoluteY: true, render: false,
    };
  };
  for (let k = -10; k <= 10; k += 1) {
    const offset = k * 0.9;
    const top = walkY(offset) + 0.01;
    if (top < 0.12) continue;
    items.push(gapstowBox(k === 0 ? 'gapstow-deck' : `gapstow-step-${k}`, offset, 0, 1.05, 3.8, 0, top));
    if (Math.abs(offset) <= RUN_W - 0.4) {
      for (const side of [-1, 1]) {
        items.push(gapstowBox(`gapstow-rail-${k}-${side > 0 ? 'n' : 's'}`, offset, side * 2.16, 1.05, 0.45, top + 0.04, top + 1.0));
      }
    }
  }

  // Boulders and pebbles come from world/parkRocks.js via SchistOutcrops,
  // which also owns their colliders.

  // The Dairy's stone half keeps a collider-only box so walkers and the
  // camera respect the building; DairyCottage renders the real cottage.
  // The Kinderberg and Cop Cot are RusticShelters with their own colliders.
  items.push(
    { id: 'dairy-body', kind: 'furniture', position: [32.1, 3.0, -48.5], size: [6.9, 6.0, 5.6], yaw: 0.15, render: false },
    // Invisible markers at the carousel's two entry bays: PlayerRig offers
    // "Ride the carousel", and Carousel.jsx takes the E press from there.
    { id: 'carousel-ride-a', kind: 'furniture', position: [3.0, 0.9, -48.8], size: [0.5, 1, 0.5], render: false, collider: false, affordance: { kind: 'act', verb: 'Ride', name: 'the carousel' } },
    { id: 'carousel-ride-b', kind: 'furniture', position: [9.0, 0.9, -59.2], size: [0.5, 1, 0.5], render: false, collider: false, affordance: { kind: 'act', verb: 'Ride', name: 'the carousel' } },
    // Checkers tables under the Kinderberg; CheckersTables takes the E.
    // On the swan boat landing's head, where passengers wait (rusticwork.js).
    { id: 'swan-boat-ride', kind: 'furniture', position: [-0.03, 0.3, 58.97], size: [0.5, 1, 0.5], absoluteY: true, render: false, collider: false, affordance: { kind: 'act', verb: 'Ride', name: 'the swan boat' } },
    { id: 'checkers-table-a', kind: 'furniture', position: [41.48, 0.9, -58.57], size: [0.5, 1, 0.5], render: false, collider: false, affordance: { kind: 'act', verb: 'Play', name: 'checkers' } },
    { id: 'checkers-table-b', kind: 'furniture', position: [46.54, 0.9, -53.45], size: [0.5, 1, 0.5], render: false, collider: false, affordance: { kind: 'act', verb: 'Play', name: 'checkers' } },
  );

  // The Arsenal and the Menagerie sheds north of it.
  items.push(
    // Arsenal.jsx draws the building; this invisible box is its body collider
    // and carries the landmark card. The towers and stoop collide in Arsenal.jsx.
    { id: 'arsenal', kind: 'furniture', position: [87.5, 7.5, -44], size: [11, 15, 17], yaw: 0, render: false, absoluteY: true, ...PARK_LANDMARKS.arsenal },
    // Menagerie.jsx draws the animal houses; these are their body colliders.
    { id: 'menagerie-shed-1', kind: 'furniture', position: [90.5, 3, -75], size: [6, 4, 9], yaw: 0, render: false, absoluteY: true, ...PARK_LANDMARKS.menagerie },
    { id: 'menagerie-shed-2', kind: 'furniture', position: [93, 3, -58.6], size: [3.5, 4, 3.2], yaw: 0, render: false, absoluteY: true, ...PARK_LANDMARKS.menagerie },
  );

  // Benches along the walks: plain slatted ones on the drives, the ornate
  // cast-iron pattern at the places people stopped to look — the Pond shore,
  // the Dairy, the Plaza gate.
  benchesAlongPath(items, PATHS[0], 5, 'center-drive-bench', 'large_park_bench', -1);
  // Pond walk and north walk both hug the shore: benches sit on the dry side
  // and look across the paving to the water.
  benchesAlongPath(items, PATHS[2], 6, 'pond-walk-bench', 'small_park_bench', -1);
  benchesAlongPath(items, PATHS[3], 4, 'north-walk-bench', 'large_park_bench', 1);
  benchesAlongPath(items, PATHS[4], 4, 'green-bench', 'large_park_bench', 1);
  items.push(
    // Flanking the Dairy's loggia, facing out across the lawn.
    parkProp('dairy-bench-w', 'small_park_bench', 22.5, -44.5, 0.15),
    parkProp('dairy-bench-e', 'small_park_bench', 37, -44, 0.15),
    // Scholars' Gate, on the Plaza paving, looking back into the park.
    parkProp('plaza-bench-a', 'small_park_bench', 82, 66, Math.PI),
    parkProp('plaza-bench-b', 'small_park_bench', 89, 66, Math.PI),
  );

  // A glove left on the first bench inside Scholars' Gate — the one a walker
  // from the Plaza reaches first. It rides the bench that was just built
  // rather than a copied coordinate, so moving the walk moves the glove.
  const bench = items.find((item) => item.id === 'pond-walk-bench-0');
  if (bench) {
    const [bx, , bz] = bench.position;
    const seat = 0.45;
    const along = 0.32;
    items.push(...ladysGlove('pond-glove', bx + Math.cos(bench.yaw) * along, seat, bz - Math.sin(bench.yaw) * along, {
      yaw: bench.yaw + 0.4,
    }).map((item) => ({
      ...item,
      affordance: {
        kind: 'examine',
        verb: 'Examine',
        name: "the glove",
        subject: 'ladys-glove',
        span: 0.16,
      },
    })));
  }
  // Gas lamps along the Center Drive. The model carries the post and lantern;
  // the emissive globe stays a separate prop, because it is what reads at dusk
  // and it has to sit exactly in the lantern.
  for (let i = 0; i < 8; i += 1) {
    const t = (i + 0.5) / 8;
    const [x, z, dx, dz] = pointAlong(PATHS[0].points, t);
    const length = Math.hypot(dx, dz) || 1;
    const lx = x - (dz / length) * 4.2;
    const lz = z + (dx / length) * 4.2;
    // Arm out over the drive: the lamp sits on the far side of the walk, so
    // the arm points back across it.
    items.push(...gasLamp(`lamp-${i}`, lx, lz, Math.atan2(-dx, -dz)));
  }

  // Perimeter: the low stone park wall on the street frontages, with the
  // Plaza corner open and the Artists' Gate gap at the Sixth Avenue crossing.
  // The street grid module owns everything beyond.
  wallRun(items, 'rail-east', [96, 56], [96, -84]);
  wallRun(items, 'rail-south-east', [60, 84], [-36, 84]);
  wallRun(items, 'rail-south-west', [-44, 84], [-98, 84]);
  // Scholars' Gate (the Plaza corner) and Artists' Gate (Sixth Avenue) were
  // plain openings in 1896; the names chosen in 1862 were not cut into the
  // wall until 1999. A square pier closes each end of the wall.
  for (const [id, x, z] of [['scholars-gate-s', 60, 84], ['scholars-gate-e', 96, 56], ['artists-gate-e', -36, 84], ['artists-gate-w', -44, 84]]) {
    gatePier(items, id, x, z);
  }
  // The lawn sits below the street; under each railing stretch a cut-stone
  // retaining wall gives the slab edge a built face instead of a hovering
  // plane. A lighter coping course stands slightly proud of the walk, the
  // way the real park wall caps do; bases are buried in the grade.
  const retainingCurb = (id, x, z, sx, sz) => {
    // The cap oversails the wall on its short axis only.
    const capX = sx > sz ? sx : sx + 0.1;
    const capZ = sx > sz ? sz + 0.1 : sz;
    return [
      {
        id: `${id}-wall`, kind: 'ground', position: [x, WALK_TOP - 0.34, z], size: [sx, 0.68, sz],
        yaw: 0, color: '#a59d8a', texture: 'blockstone', absoluteY: true, collider: false,
      },
      {
        id: `${id}-cap`, kind: 'ground', position: [x, WALK_TOP - 0.03, z], size: [capX, 0.1, capZ],
        yaw: 0, color: '#a29a8b', texture: 'blockstone', absoluteY: true, collider: false,
      },
    ];
  };
  items.push(
    ...retainingCurb('perimeter-curb-east', 96, -14, 0.55, 140.6),
    ...retainingCurb('perimeter-curb-south-east', 12, 84, 96.6, 0.55),
    ...retainingCurb('perimeter-curb-south-west', -71, 84, 54.6, 0.55),
  );
  items.push(
    // StreetSurfaces owns the shaped apron and its trimesh collider. Keep
    // this catalog marker non-solid so the retired rectangular slab cannot
    // leave an invisible ledge around the new outline.
    { id: 'plaza-paving', kind: 'ground', position: [86, 1.21, 72], size: [26, 0.06, 24], yaw: 0, color: '#b9ab8c', texture: 'paving', absoluteY: true, render: false, collider: false },
  );

  return items;
}

export const parkItems = buildItems();
