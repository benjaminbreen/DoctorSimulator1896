// The southeast corner of Central Park, c. 1896, authored from the period
// maps at roughly 0.4 scale. +x is east (Fifth Avenue), +z is south (59th
// Street / Central Park South). World frame: x in [-100, 100], z in [-85, 85].
//
// Ground truth: The Pond hooks west from Scholars' Gate along CPS, curling
// north at its west lobe; the Hallett peninsula juts southwest from the north
// shore; Gapstow crosses the northeast narrows. The Center Drive sweeps
// northwest above the Pond; the East Drive follows Fifth past the Arsenal and
// Menagerie; the Green (ball ground) opens to the north; the Dairy and the
// Kinderberg shelter sit between them.

export const POND_OUTLINE = [
  [72.5, 53.5], [67.5, 61], [57.5, 58.5], [47.5, 63.5], [37.5, 71], [20, 76],
  [0, 78.5], [-20, 78.5], [-40, 76], [-57.5, 71], [-72.5, 63.5], [-82.5, 53.5],
  [-85, 41], [-80, 28.5], [-67.5, 23.5], [-55, 23.5], [-42.5, 28.5], [-30, 36],
  [-17.5, 41], [-5, 43.5], [5, 46], [12.5, 51], [10, 58.5], [17.5, 61],
  [27.5, 56], [35, 51], [45, 48.5], [55, 46], [65, 46],
];

export const WATER_LEVEL = -0.5;

export const PATHS = [
  // Center Drive: Scholars' Gate, north, then the long sweep west above the Pond.
  { id: 'center-drive', width: 6, points: [[88, 70], [80, 56], [76, 40], [72, 22], [62, 4], [46, -10], [26, -20], [2, -26], [-24, -24], [-46, -16], [-64, -2], [-80, 10], [-94, 16]] },
  // East Drive: branches north along Fifth Avenue past the Arsenal.
  { id: 'east-drive', width: 5, points: [[76, 40], [82, 18], [86, -10], [88, -40], [90, -70], [90, -83]] },
  // Pond walk: the outer shore, between the water and Central Park South.
  { id: 'pond-walk', width: 3.2, points: [[86, 66], [70, 70], [50, 74], [28, 79], [4, 81], [-22, 81], [-46, 79], [-64, 74], [-78, 67], [-88, 57], [-92, 44]] },
  // North shore walk: over Gapstow, along the inner shore, around the hook.
  { id: 'north-walk', width: 2.8, points: [[80, 48], [70, 49], [62, 52], [54, 49], [44, 50], [34, 53], [24, 58], [15, 59], [8, 52], [-2, 46], [-16, 43], [-30, 38], [-44, 30], [-56, 26], [-70, 26], [-80, 32]] },
  // Ring around the Green.
  { id: 'green-walk', width: 2.4, points: [[2, -26], [-14, -34], [-24, -46], [-16, -58], [2, -62], [18, -56], [24, -44], [16, -32], [2, -26]] },
];

// Rock outcrops (Manhattan schist). Hallett's knoll sits on the peninsula.
export const KNOLLS = [
  { x: 22, z: 50, radius: 14, height: 3.0 },
  { x: 70, z: 30, radius: 12, height: 2.0 },
  { x: -52, z: -6, radius: 20, height: 3.6 },
  { x: -88, z: 20, radius: 14, height: 2.8 },
  { x: 44, z: -56, radius: 16, height: 2.0 },
];

export const MEADOW = { x: -2, z: -45, radius: 30 };
// Grand Army Plaza sits above the sunken pond hollow. Fully level inside
// `flat`, easing off toward `radius`, so the paving never floats.
export const GATE = { x: 88, z: 70, radius: 30, flat: 19, height: 1.2 };

function hash01(seed) {
  const value = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return value - Math.floor(value);
}

const CANOPY_COLORS = ['#49682f', '#547236', '#42602b', '#5b6f3a'];
const TRUNK_COLORS = ['#5a4630', '#54422c'];

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
      tree: { archetype, trunkH, trunkR, canopyR, trunkColor: TRUNK_COLORS[colorIndex % 2] },
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
    items.push(...tree(`${prefix}-${i}a`, x + nx * offset, z + nz * offset, 0.9 + hash01(i) * 0.3, i, archetype));
    if (bothSides && i % 2 === 0) {
      items.push(...tree(`${prefix}-${i}b`, x - nx * offset, z - nz * offset, 0.85 + hash01(i + 40) * 0.3, i + 1, archetype));
    }
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
    const radius = 3 + hash01(i + 210) * 9;
    items.push(...tree(`hallett-${i}`, 22 + Math.cos(angle) * radius, 50 + Math.sin(angle) * radius * 0.7, 0.8 + hash01(i + 220) * 0.3, i, 1));
  }

  // Gapstow: three-step stone arch over the narrows, walkable via autostep.
  const gapstowYaw = -1.97;
  const across = (offset) => [62 - Math.cos(gapstowYaw) * offset, 52 + Math.sin(gapstowYaw) * offset];
  const [rampAx, rampAz] = across(-3.6);
  const [rampBx, rampBz] = across(3.6);
  items.push(
    { id: 'gapstow-ramp-a', kind: 'furniture', position: [rampAx, 0.14, rampAz], size: [4.2, 0.28, 3.8], yaw: gapstowYaw, color: '#8f8878', absoluteY: true },
    { id: 'gapstow-deck', kind: 'furniture', position: [62, 0.3, 52], size: [4.6, 0.6, 3.8], yaw: gapstowYaw, color: '#968e7c', absoluteY: true },
    { id: 'gapstow-ramp-b', kind: 'furniture', position: [rampBx, 0.14, rampBz], size: [4.2, 0.28, 3.8], yaw: gapstowYaw, color: '#8f8878', absoluteY: true },
    { id: 'gapstow-parapet-a', kind: 'furniture', position: [62 + Math.sin(gapstowYaw) * 1.95, 0.95, 52 + Math.cos(gapstowYaw) * 1.95], size: [12, 0.7, 0.3], yaw: gapstowYaw, color: '#807965', absoluteY: true, collider: false },
    { id: 'gapstow-parapet-b', kind: 'furniture', position: [62 - Math.sin(gapstowYaw) * 1.95, 0.95, 52 - Math.cos(gapstowYaw) * 1.95], size: [12, 0.7, 0.3], yaw: gapstowYaw, color: '#807965', absoluteY: true, collider: false },
  );

  // Boulders on the outcrops.
  KNOLLS.forEach((knoll, index) => {
    for (let b = 0; b < 2; b += 1) {
      items.push({
        id: `schist-${index}-${b}`, kind: 'furniture',
        position: [knoll.x + (hash01(index * 3 + b) - 0.5) * knoll.radius, knoll.height * 0.55, knoll.z + (hash01(index * 5 + b) - 0.5) * knoll.radius * 0.8],
        size: [3 + hash01(index + b + 11) * 3, 1 + hash01(index + b) * 0.8, 2.2 + hash01(index + b + 13) * 2],
        yaw: hash01(index + b + 21) * 3, color: '#7d7a70',
      });
    }
  });

  // The Dairy (gabled cottage) and the Kinderberg shelter.
  items.push(
    { id: 'dairy-body', kind: 'furniture', position: [0, 2.2, 16], size: [8, 4.4, 5], yaw: 0.15, color: '#cfc3a8' },
    { id: 'dairy-roof', kind: 'furniture', position: [0, 4.9, 16], size: [8.8, 1.4, 5.8], yaw: 0.15, color: '#6b4a3a', collider: false },
    { id: 'kinderberg-post', kind: 'furniture', shape: 'cylinder', position: [-18, 1.6, 12], size: [9, 3.2, 9], yaw: 0, color: '#7a6248' },
    { id: 'kinderberg-roof', kind: 'furniture', shape: 'cone', position: [-18, 4.4, 12], size: [11, 2.6, 11], yaw: 0, color: '#5d4a33', collider: false },
  );

  // The Arsenal and the Menagerie sheds behind it.
  items.push(
    { id: 'arsenal', kind: 'furniture', position: [88, 4.5, -44], size: [13, 9, 17], yaw: 0, color: '#71453a', texture: 'brick', absoluteY: true },
    { id: 'menagerie-shed-1', kind: 'furniture', position: [78, 1.75, -52], size: [10, 3.5, 4], yaw: 0.1, color: '#6d5a44', absoluteY: true },
    { id: 'menagerie-shed-2', kind: 'furniture', position: [80, 1.5, -62], size: [8, 3, 3.5], yaw: -0.15, color: '#645440', absoluteY: true },
  );

  // Benches and gas lamps along the walks.
  const benches = [[84, 62, 1.3], [46, 70, 0.4], [6, 79, 0.1], [-40, 74, -0.3], [60, 50, 1.2], [-2, 44, 0.3], [24, -30, 0.9]];
  benches.forEach(([x, z, yaw], index) => {
    items.push({ id: `bench-${index}`, kind: 'furniture', position: [x, 0.42, z], size: [1.9, 0.84, 0.6], yaw, color: '#5d4a33' });
  });
  for (let i = 0; i < 8; i += 1) {
    const t = (i + 0.5) / 8;
    const [x, z, dx, dz] = pointAlong(PATHS[0].points, t);
    const length = Math.hypot(dx, dz) || 1;
    items.push(
      { id: `lamp-${i}-post`, kind: 'furniture', shape: 'cylinder', position: [x - (dz / length) * 4.2, 1.5, z + (dx / length) * 4.2], size: [0.14, 3, 0.14], yaw: 0, color: '#2e3438' },
      { id: `lamp-${i}-globe`, kind: 'furniture', shape: 'sphere', position: [x - (dz / length) * 4.2, 3.15, z + (dx / length) * 4.2], size: [0.42, 0.42, 0.42], yaw: 0, color: '#ffdca0', collider: false, emissive: '#ffc57a' },
    );
  }

  // Perimeter wall with the Plaza corner open and the Artists' Gate gap at
  // the Sixth Avenue crossing. The street grid module owns everything beyond.
  items.push(
    { id: 'wall-east', kind: 'furniture', position: [96, 0.65, -14], size: [0.6, 1.3, 140], yaw: 0, color: '#6e6a5e', absoluteY: true },
    { id: 'wall-south-west', kind: 'furniture', position: [-71, 0.65, 84], size: [54, 1.3, 0.6], yaw: 0, color: '#6e6a5e', absoluteY: true },
    { id: 'wall-south-east', kind: 'furniture', position: [12, 0.65, 84], size: [96, 1.3, 0.6], yaw: 0, color: '#6e6a5e', absoluteY: true },
    { id: 'plaza-paving', kind: 'ground', position: [86, 1.21, 72], size: [26, 0.06, 24], yaw: 0, color: '#b9ab8c', texture: 'paving', absoluteY: true },
  );

  return items;
}

export const parkItems = buildItems();
