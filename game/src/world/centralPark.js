// The southeast corner of Central Park, c. 1896, as authored data. Layout
// follows the period maps: The Pond curving under the Plaza corner, Gapstow
// at its neck, the Drive sweeping northwest, the Green beyond, Fifth Avenue
// and 59th Street outside the wall. Coordinates: +x east, +z south, meters,
// roughly 0.6 scale.

// World frame: x in [-80, 80], z in [-70, 70]. Scholars' Gate at the SE.
export const POND_OUTLINE = [
  [24, 16], [27, 22], [22, 28], [12, 30], [0, 28], [-12, 30], [-24, 34],
  [-36, 38], [-46, 34], [-50, 26], [-46, 16], [-36, 10], [-24, 8], [-12, 8],
  [0, 10], [10, 10], [18, 11],
];

export const WATER_LEVEL = -0.45;

export const PATHS = [
  // The Drive: in at Scholars' Gate, up the east side, west across the top.
  { id: 'drive', width: 5.5, points: [[72, 58], [66, 44], [62, 26], [56, 6], [44, -12], [26, -24], [4, -30], [-20, -30], [-42, -24], [-58, -12], [-70, 4]] },
  // Walk looping The Pond.
  { id: 'pond-walk', width: 2.6, points: [[28, 12], [30, 24], [24, 32], [12, 34], [0, 32], [-12, 34], [-26, 38], [-40, 42], [-52, 36], [-56, 24], [-50, 12], [-38, 4], [-22, 2], [-6, 0], [8, 2], [20, 6], [28, 12]] },
  // Spur from the Drive down to Gapstow.
  { id: 'gapstow-spur', width: 2.8, points: [[62, 30], [46, 26], [34, 22], [26, 18]] },
  // 59th Street side walk.
  { id: 'south-walk', width: 3, points: [[68, 64], [40, 62], [10, 60], [-20, 58], [-48, 54], [-68, 46]] },
];

// Rock outcrops (Manhattan schist) folded into the terrain.
export const KNOLLS = [
  { x: -6, z: 0, radius: 14, height: 2.1 },
  { x: -58, z: 30, radius: 12, height: 2.6 },
  { x: 44, z: -38, radius: 16, height: 1.6 },
  { x: -66, z: -46, radius: 14, height: 2.2 },
];

// The Green: flattened meadow to the north-center.
export const MEADOW = { x: 0, z: -46, radius: 34 };
// Plaza corner and gate apron: kept flat for the entrance.
export const GATE = { x: 68, z: 58, radius: 20 };

function hash01(seed) {
  const value = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return value - Math.floor(value);
}

function tree(id, x, z, scale, colorIndex) {
  const canopyColors = ['#49682f', '#547236', '#42602b', '#5b6f3a'];
  const trunkColors = ['#5a4630', '#54422c'];
  const radius = (3.6 + hash01(x * 3 + z) * 2.2) * scale;
  return [
    {
      id: `${id}-trunk`, kind: 'tree', shape: 'cylinder',
      position: [x, 1.9 * scale, z], size: [0.55 * scale, 3.8 * scale, 0.55 * scale],
      yaw: 0, color: trunkColors[colorIndex % 2],
    },
    {
      id: `${id}-canopy`, kind: 'tree', shape: 'sphere',
      position: [x, (4.4 + hash01(z * 7 + x) * 0.8) * scale, z], size: [radius, radius, radius],
      yaw: 0, color: canopyColors[colorIndex % 4], collider: false,
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

function buildItems() {
  const items = [];

  // Elm rows flanking the Drive.
  const drive = PATHS[0];
  for (let i = 0; i < 13; i += 1) {
    const t = (i + 0.5) / 13;
    const [x, z, dx, dz] = pointAlong(drive.points, t);
    const length = Math.hypot(dx, dz) || 1;
    const nx = -dz / length;
    const nz = dx / length;
    const offset = drive.width / 2 + 2.4;
    items.push(...tree(`drive-elm-${i}a`, x + nx * offset, z + nz * offset, 0.95 + hash01(i) * 0.25, i));
    if (i % 2 === 0) {
      items.push(...tree(`drive-elm-${i}b`, x - nx * offset, z - nz * offset, 0.9 + hash01(i + 40) * 0.25, i + 1));
    }
  }
  // Grove on the Pond's south and west banks.
  const bank = [[-2, 42], [-16, 44], [-30, 48], [-46, 46], [-58, 38], [-58, 18], [-52, 4], [-40, -4], [14, 40], [26, 34]];
  bank.forEach(([x, z], index) => {
    items.push(...tree(`pond-grove-${index}`, x + hash01(index) * 3, z + hash01(index + 9) * 3, 0.85 + hash01(index + 17) * 0.35, index));
  });
  // Scattered elms around the Green.
  for (let i = 0; i < 9; i += 1) {
    const angle = (i / 9) * Math.PI * 2;
    const radius = MEADOW.radius + 4 + hash01(i + 60) * 8;
    items.push(
      ...tree(`green-elm-${i}`, MEADOW.x + Math.cos(angle) * radius, MEADOW.z + Math.sin(angle) * radius * 0.8, 0.9 + hash01(i + 70) * 0.3, i),
    );
  }

  // Gapstow (placeholder): low stone deck across the neck with parapets.
  const gapstow = { x: 24, z: 15, yaw: -0.55 };
  items.push(
    { id: 'gapstow-deck', kind: 'furniture', position: [gapstow.x, 0.12, gapstow.z], size: [8.5, 0.36, 3.6], yaw: gapstow.yaw, color: '#8f8878', absoluteY: true },
    { id: 'gapstow-parapet-n', kind: 'furniture', position: [gapstow.x - 1.9 * Math.sin(gapstow.yaw + Math.PI / 2), 0.62, gapstow.z - 1.9 * Math.cos(gapstow.yaw + Math.PI / 2)], size: [8.5, 0.65, 0.3], yaw: gapstow.yaw, color: '#807965', absoluteY: true },
    { id: 'gapstow-parapet-s', kind: 'furniture', position: [gapstow.x + 1.9 * Math.sin(gapstow.yaw + Math.PI / 2), 0.62, gapstow.z + 1.9 * Math.cos(gapstow.yaw + Math.PI / 2)], size: [8.5, 0.65, 0.3], yaw: gapstow.yaw, color: '#807965', absoluteY: true },
  );

  // Boulders on the outcrops.
  KNOLLS.forEach((knoll, index) => {
    items.push({
      id: `schist-${index}`, kind: 'furniture',
      position: [knoll.x + hash01(index) * 4 - 2, knoll.height * 0.45, knoll.z + hash01(index + 5) * 4 - 2],
      size: [3.2 + hash01(index + 11) * 2, 1.1, 2.2 + hash01(index + 13) * 1.5],
      yaw: hash01(index + 21) * 3, color: '#7d7a70',
    });
  });

  // Benches along the pond walk and the gate apron.
  const benchSpots = [[30, 20, 1.2], [12, 33, 0.05], [-24, 37, 0.2], [-52, 30, 1.4], [60, 52, 0.8]];
  benchSpots.forEach(([x, z, yaw], index) => {
    items.push({ id: `bench-${index}`, kind: 'furniture', position: [x, 0.42, z], size: [1.9, 0.84, 0.6], yaw, color: '#5d4a33' });
  });

  // Perimeter wall: Fifth Avenue (east) and 59th Street (south), with the
  // Plaza corner open for Scholars' Gate.
  items.push(
    { id: 'wall-east', kind: 'furniture', position: [78, 0.65, -10], size: [0.6, 1.3, 118], yaw: 0, color: '#6e6a5e', absoluteY: true },
    { id: 'wall-south', kind: 'furniture', position: [-14, 0.65, 68], size: [136, 1.3, 0.6], yaw: 0, color: '#6e6a5e', absoluteY: true },
    { id: 'plaza-paving', kind: 'ground', position: [66, 0.02, 58], size: [26, 0.04, 22], yaw: 0, color: '#b9ab8c', collider: false, absoluteY: true },
  );

  // The Arsenal's brick mass on the Fifth Avenue side.
  items.push({ id: 'arsenal', kind: 'furniture', position: [68, 4, -28], size: [11, 8, 15], yaw: 0, color: '#71453a', absoluteY: true });

  // Backdrop: building masses along Fifth Avenue and 59th Street, outside
  // the wall. Set dressing only.
  for (let i = 0; i < 9; i += 1) {
    const height = 12 + hash01(i + 30) * 12;
    const shade = ['#5e5348', '#6b5d50', '#584f47', '#70645a'][i % 4];
    items.push({
      id: `fifth-ave-${i}`, kind: 'backdrop',
      position: [90, height / 2, -62 + i * 14], size: [12, height, 11],
      yaw: 0, color: shade, collider: false, absoluteY: true,
    });
  }
  for (let i = 0; i < 8; i += 1) {
    const height = 11 + hash01(i + 90) * 13;
    const shade = ['#6b5d50', '#5e5348', '#70645a', '#584f47'][i % 4];
    items.push({
      id: `fifty-ninth-${i}`, kind: 'backdrop',
      position: [-70 + i * 15, height / 2, 80], size: [13, height, 12],
      yaw: 0, color: shade, collider: false, absoluteY: true,
    });
  }

  return items;
}

export const parkItems = buildItems();
