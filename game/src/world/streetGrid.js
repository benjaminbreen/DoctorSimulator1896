// Walkable streets beyond the park wall: Fifth Avenue and Madison to the
// east, Central Park South (59th), 58th, and 57th to the south, with the
// Sixth Avenue stand-in running south from the Artists' Gate. Landmark
// identifications are provisional (Ben to verify): Hotel New Netherland
// (1893), Savoy (1892), first Plaza Hotel (1890), Metropolitan Club (1894),
// Cornelius Vanderbilt II mansion, Navarro Flats.

export const WORLD_BOUNDS = { minX: -100, maxX: 230, minZ: -85, maxZ: 186 };
export const STREET_LEVEL = 1.05;
const ROAD_TOP = 1.16;
const WALK_TOP = 1.29;

// Roads as [axis, lo, hi, from, to]: axis 'z' = east-west street band.
export const ROADS = [
  { id: 'cps', axis: 'z', lo: 86, hi: 96, from: -100, to: 230 },
  { id: 'fifty-eighth', axis: 'z', lo: 130, hi: 140, from: -100, to: 230 },
  { id: 'fifty-seventh', axis: 'z', lo: 174, hi: 184, from: -100, to: 230 },
  { id: 'fifth-ave', axis: 'x', lo: 99, hi: 107, from: -85, to: 186 },
  { id: 'madison-ave', axis: 'x', lo: 163, hi: 171, from: 84, to: 186 },
  { id: 'sixth-ave', axis: 'x', lo: -44, hi: -36, from: 84, to: 186 },
];

function hash01(seed) {
  const value = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return value - Math.floor(value);
}

function strip(id, x, z, sx, sz, top, thickness, texture, color) {
  return {
    id, kind: 'ground', position: [x, top - thickness / 2, z], size: [sx, thickness, sz],
    yaw: 0, texture, color, absoluteY: true,
  };
}

function building(id, x, z, sx, sy, sz, options = {}) {
  return {
    id, kind: 'backdrop', position: [x, WALK_TOP + sy / 2, z], size: [sx, sy, sz],
    yaw: options.yaw ?? 0, collider: true, absoluteY: true, ...options,
  };
}

function lamp(id, x, z) {
  return [
    { id: `${id}-post`, kind: 'furniture', shape: 'cylinder', position: [x, WALK_TOP + 1.5, z], size: [0.14, 3, 0.14], yaw: 0, color: '#2e3438', absoluteY: true },
    { id: `${id}-globe`, kind: 'furniture', shape: 'sphere', position: [x, WALK_TOP + 3.15, z], size: [0.42, 0.42, 0.42], yaw: 0, color: '#ffdca0', collider: false, emissive: '#ffc57a', absoluteY: true },
  ];
}

// Row of party-wall brownstones along one block face.
function parcelRow(items, prefix, axis, faceCoord, from, to, depth, facing) {
  let cursor = from;
  let index = 0;
  while (cursor < to - 6) {
    const width = 8 + hash01(index * 3.1 + from) * 4;
    const height = 11 + hash01(index * 7.7 + to) * 6;
    const center = cursor + width / 2;
    const [x, z, sx, sz] =
      axis === 'z' ? [center, faceCoord + (facing * depth) / 2, width - 0.4, depth] : [faceCoord + (facing * depth) / 2, center, depth, width - 0.4];
    items.push(building(`${prefix}-${index}`, x, z, sx, height, sz, { facadeStyle: index % 2 === 0 ? 0 : 3 }));
    cursor += width;
    index += 1;
  }
}

function buildStreets() {
  const items = [];

  // Road beds and sidewalks.
  for (const road of ROADS) {
    const length = road.to - road.from;
    const mid = (road.from + road.to) / 2;
    const width = road.hi - road.lo;
    const center = (road.lo + road.hi) / 2;
    if (road.axis === 'z') {
      items.push(strip(`${road.id}-bed`, mid, center, length, width, ROAD_TOP, 0.12, 'road', '#6d6a66'));
      items.push(strip(`${road.id}-walk-n`, mid, road.lo - 1.6, length, 3.2, WALK_TOP, 0.26, 'paving', '#9a958c'));
      items.push(strip(`${road.id}-walk-s`, mid, road.hi + 1.6, length, 3.2, WALK_TOP, 0.26, 'paving', '#9a958c'));
    } else {
      items.push(strip(`${road.id}-bed`, center, mid, width, length, ROAD_TOP, 0.12, 'road', '#6d6a66'));
      items.push(strip(`${road.id}-walk-w`, road.lo - 1.6, mid, 3.2, length, WALK_TOP, 0.26, 'paving', '#9a958c'));
      items.push(strip(`${road.id}-walk-e`, road.hi + 1.6, mid, 3.2, length, WALK_TOP, 0.26, 'paving', '#9a958c'));
    }
  }

  // Landmarks (provisional identifications; massing only).
  items.push(
    building('hotel-new-netherland', 122, 72, 15, 34, 15, { facadeStyle: 1, roof: 'cone' }),
    building('hotel-savoy', 122, 104, 14, 24, 14, { facadeStyle: 1, roof: 'mansard' }),
    building('plaza-hotel-1890', 80, 106, 20, 17, 14, { facadeStyle: 2, roof: 'mansard' }),
    building('metropolitan-club', 120, 52, 16, 9, 12, { facadeStyle: 4 }),
    building('vanderbilt-mansion', 86, 116, 18, 13, 14, { facadeStyle: 1, roof: 'mansard' }),
    building('navarro-flats-a', -52, 108, 12, 21, 13, { facadeStyle: 1, roof: 'cone' }),
    building('navarro-flats-b', -38, 110, 12, 22, 13, { facadeStyle: 1, roof: 'mansard' }),
    building('navarro-flats-c', -24, 108, 12, 20, 13, { facadeStyle: 1, roof: 'cone' }),
  );

  // Brownstone rows along the block faces, clear of the landmarks.
  parcelRow(items, 'fifth-east-a', 'x', 110, -20, 40, 12, 1);
  parcelRow(items, 'fifth-east-b', 'x', 110, 120, 160, 12, 1);
  parcelRow(items, 'cps-south-a', 'z', 99, -96, -60, 12, 1);
  parcelRow(items, 'cps-south-b', 'z', 99, -8, 68, 12, 1);
  parcelRow(items, 'fifty-eighth-n', 'z', 128, 116, 160, 11, -1);
  parcelRow(items, 'fifty-eighth-s', 'z', 141, -96, -52, 11, 1);
  parcelRow(items, 'madison-west', 'x', 161, 100, 128, 11, -1);
  parcelRow(items, 'madison-east', 'x', 173, 92, 170, 12, 1);
  parcelRow(items, 'sixth-west', 'x', -46, 100, 170, 11, -1);
  parcelRow(items, 'block-a-inner', 'z', 118, 118, 158, 12, 1);

  // Street lamps along Fifth and Central Park South.
  for (let i = 0; i < 9; i += 1) {
    items.push(...lamp(`fifth-lamp-${i}`, 97.5, -70 + i * 28));
    items.push(...lamp(`cps-lamp-${i}`, -92 + i * 28, 84.5));
  }

  return items;
}

export const streetItems = buildStreets();
