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
import { ladysGlove } from './furnishings.js';
import { modelSize } from './modelPacks.js';
import { GAPSTOW, localToWorld, walkY, RUN_W } from './gapstow.js';
import { PARK_LANDMARKS } from './parkLandmarks.js';

const RAILING = 'metal_and_concrete_guardrail_8_MB';

export const POND_OUTLINE = [
  [-37.6, 40.3], [-26.4, 58.7], [-15.6, 63.6], [-1.4, 62.9], [3.9, 60.5],
  [7.6, 61.4], [19.8, 53.7], [22.3, 53.6], [34, 60.6], [40.2, 58.6],
  [37.7, 51.9], [39.9, 47.1], [38.4, 36.3], [29.1, 20.5], [29.6, 8.4],
  [26, 5], [22.1, 5.9], [23.2, -1.9], [19.8, -8.8], [17, -11.1],
  [11.5, -10.5], [8.7, -12.4], [2, -23.6], [-0.7, -19.7], [-3.9, -20.5],
  [-7.6, -19.2], [-8, -17.5], [-4.4, -12.6], [10, -4.1], [9.8, -1.5],
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
  { id: 'pond-walk', width: 3.2, points: [[86, 66], [72, 64], [58, 63], [46, 64], [36, 66], [24, 64], [12, 66], [-2, 68], [-16, 68], [-28, 62], [-38, 52], [-44, 40], [-48, 30], [-50, 20], [-56, 12]] },
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
// the instanced trunk + canopy from the `tree` payload.
function tree(id, x, z, scale, colorIndex, archetype = 0) {
  const trunkH = (3.8 + hash01(x + z) * 0.9) * scale;
  const trunkR = 0.32 * scale;
  const canopyR = (2.5 + hash01(x * 3 + z) * 1.3) * scale * (archetype === 1 ? 1.3 : 1);
  return [
    {
      id, kind: 'tree', shape: 'tree',
      position: [x, trunkH / 2, z], size: [trunkR * 2, trunkH, trunkR * 2], yaw: 0,
      color: CANOPY_COLORS[colorIndex % 4],
      tree: { archetype, trunkH, trunkR, canopyR },
    },
  ];
}

function pointAlong(points, t) {
  const index = Math.min(points.length - 2, Math.floor(t * (points.length - 1)));
  const local = t * (points.length - 1) - index;
  const [x1, z1] = points[index];
  const [x2, z2] = points[index + 1];
  return [x1 + (x2 - x1) * local, z1 + (z2 - z1) * local, x2 - x1, z2 - z1];
}

function treesAlongPath(items, path, count, prefix, offsetExtra, bothSides, archetype = 0) {
  for (let i = 0; i < count; i += 1) {
    const t = (i + 0.5) / count;
    const [x, z, dx, dz] = pointAlong(path.points, t);
    const length = Math.hypot(dx, dz) || 1;
    const nx = -dz / length;
    const nz = dx / length;
    const offset = path.width / 2 + offsetExtra + hash01(i * 3.7) * 1.5;
    // Shore walks put one side in the water; a drowned elm is dropped.
    const ax = x + nx * offset;
    const az = z + nz * offset;
    if (!insidePond(ax, az)) items.push(...tree(`${prefix}-${i}a`, ax, az, 0.9 + hash01(i) * 0.3, i, archetype));
    if (bothSides && i % 2 === 0) {
      const bx = x - nx * offset;
      const bz = z - nz * offset;
      if (!insidePond(bx, bz)) items.push(...tree(`${prefix}-${i}b`, bx, bz, 0.85 + hash01(i + 40) * 0.3, i + 1, archetype));
    }
  }
}


// A run of railing between two points, in whole sections. The model cannot
// stretch, so the count is rounded and the spacing shared out: sections
// overlap slightly rather than leaving a gap you could walk through.
function railingRun(items, prefix, from, to) {
  const [dx, dz] = [to[0] - from[0], to[1] - from[1]];
  const length = Math.hypot(dx, dz);
  const section = modelSize(RAILING)[0];
  // Ceil, not round: rounding down leaves half-metre gaps at every joint.
  const count = Math.max(1, Math.ceil(length / section));
  const yaw = Math.atan2(dx, dz) + Math.PI / 2;
  for (let i = 0; i < count; i += 1) {
    const t = (i + 0.5) / count;
    items.push(parkProp(`${prefix}-${i}`, RAILING, from[0] + dx * t, from[1] + dz * t, yaw));
  }
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

  treesAlongPath(items, PATHS[0], 18, 'center-drive-elm', 2.6, true, 0);
  treesAlongPath(items, PATHS[1], 8, 'east-drive-elm', 2.4, false, 0);
  treesAlongPath(items, PATHS[2], 12, 'pond-walk-elm', 2.2, false, 2);
  treesAlongPath(items, PATHS[4], 8, 'green-elm', 2.0, false, 1);

  // Hallett's wooded knoll on the peninsula.
  for (let i = 0; i < 8; i += 1) {
    const angle = hash01(i + 200) * Math.PI * 2;
    const radius = 3 + hash01(i + 210) * 8;
    items.push(...tree(`hallett-${i}`, 2 + Math.cos(angle) * radius, 28 + Math.sin(angle) * radius * 0.9, 0.8 + hash01(i + 220) * 0.3, i, 1));
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
    { id: 'checkers-table-a', kind: 'furniture', position: [41.48, 0.9, -58.57], size: [0.5, 1, 0.5], render: false, collider: false, affordance: { kind: 'act', verb: 'Play', name: 'checkers' } },
    { id: 'checkers-table-b', kind: 'furniture', position: [46.54, 0.9, -53.45], size: [0.5, 1, 0.5], render: false, collider: false, affordance: { kind: 'act', verb: 'Play', name: 'checkers' } },
  );

  // The Arsenal and the Menagerie sheds behind it.
  items.push(
    { id: 'arsenal', kind: 'furniture', position: [88, 4.5, -44], size: [13, 9, 17], yaw: 0, color: '#71453a', texture: 'brick', absoluteY: true, ...PARK_LANDMARKS.arsenal },
    { id: 'menagerie-shed-1', kind: 'furniture', position: [78, 1.75, -52], size: [10, 3.5, 4], yaw: 0.1, color: '#6d5a44', absoluteY: true, ...PARK_LANDMARKS.menagerie },
    { id: 'menagerie-shed-2', kind: 'furniture', position: [80, 1.5, -62], size: [8, 3, 3.5], yaw: -0.15, color: '#645440', absoluteY: true, ...PARK_LANDMARKS.menagerie },
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

  // Perimeter: stone-and-iron railing on the street frontages, with the Plaza
  // corner open and the Artists' Gate gap at the Sixth Avenue crossing. The
  // street grid module owns everything beyond. Sections are rigid, so they
  // follow the grade at their own origin rather than one fixed height.
  railingRun(items, 'rail-east', [96, 56], [96, -84]);
  railingRun(items, 'rail-south-east', [60, 84], [-36, 84]);
  railingRun(items, 'rail-south-west', [-44, 84], [-98, 84]);
  items.push(
    // StreetSurfaces owns the shaped apron and its trimesh collider. Keep
    // this catalog marker non-solid so the retired rectangular slab cannot
    // leave an invisible ledge around the new outline.
    { id: 'plaza-paving', kind: 'ground', position: [86, 1.21, 72], size: [26, 0.06, 24], yaw: 0, color: '#b9ab8c', texture: 'paving', absoluteY: true, render: false, collider: false },
  );

  return items;
}

export const parkItems = buildItems();
