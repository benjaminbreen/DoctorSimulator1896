// Walkable streets beyond the park wall: Fifth Avenue and Madison to the
// east, Central Park South (59th), 58th, and 57th to the south, with the
// Sixth Avenue stand-in running south from the Artists' Gate. Landmark
// identifications are provisional (Ben to verify): Hotel New Netherland
// (1893), Savoy (1892), first Plaza Hotel (1890), Metropolitan Club (1894),
// Cornelius Vanderbilt II mansion, Navarro Flats.

import { gasLamp } from './parkCatalog.js';
import { buildStreetSurfaceLayout } from './streetSurfaceLayout.js';

export const WORLD_BOUNDS = { minX: -100, maxX: 230, minZ: -85, maxZ: 186 };
export const STREET_LEVEL = 1.05;
export const ROAD_TOP = 1.16;
export const WALK_TOP = 1.29;
export const SIDEWALK_WIDTH = 3.2;

// Roads as [axis, lo, hi, from, to]: axis 'z' = east-west street band.
export const ROADS = [
  { id: 'cps', axis: 'z', lo: 86, hi: 96, from: -100, to: 230 },
  { id: 'fifty-eighth', axis: 'z', lo: 130, hi: 140, from: -100, to: 230 },
  { id: 'fifty-seventh', axis: 'z', lo: 174, hi: 184, from: -100, to: 230 },
  { id: 'fifth-ave', axis: 'x', lo: 99, hi: 107, from: -85, to: 186 },
  { id: 'madison-ave', axis: 'x', lo: 163, hi: 171, from: 84, to: 186 },
  { id: 'sixth-ave', axis: 'x', lo: -44, hi: -36, from: 84, to: 186 },
];

export const STREET_SURFACES = buildStreetSurfaceLayout(ROADS, {
  sidewalkWidth: SIDEWALK_WIDTH,
  gutterWidth: 0.42,
  curbWidth: 0.18,
});

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

// Sidewalk gas lamp, same fitting as the park walks. `yaw` turns the lantern
// arm out over the roadway.
function lamp(id, x, z, yaw = 0) {
  return gasLamp(id, x, z, yaw, { y: WALK_TOP, absoluteY: true });
}

// Set back from curb returns, gates, hydrants, and hitching-post runs. These
// are authored curb lines, not a blind interval loop: the Plaza opening stays
// open and each block face keeps a legible lamp rhythm.
export const STREET_LAMP_SITES = [
  // Two lamps frame the park entrance without blocking its diagonal carriage
  // mouth. Their asymmetry follows the paving outline rather than a grid.
  { id: 'plaza-south', x: 79.0, z: 80.5, yaw: Math.PI / 2 },
  { id: 'plaza-east', x: 95.0, z: 76.0, yaw: Math.PI },
  ...[-68, -42, -16, 10, 36, 50].map((z, index) => ({ id: `fifth-park-${index}`, x: 98.0, z, yaw: Math.PI })),
  ...[-70, -44, -20, 4, 28, 52, 72, 110, 120, 154, 170].map((z, index) => ({ id: `fifth-built-${index}`, x: 108.0, z, yaw: 0 })),
  ...[-90, -62, -6, 22, 50].map((x, index) => ({ id: `cps-park-${index}`, x, z: 85.0, yaw: Math.PI / 2 })),
  ...[-92, -66, -14, 12, 38, 64, 82, 124, 150, 176, 202].map((x, index) => ({ id: `cps-built-${index}`, x, z: 97.0, yaw: -Math.PI / 2 })),
];

// Row of party-wall brownstones along one block face. Windows get geometry
// only on the street face; laundry rows hang lines there too (provisional —
// street-front laundry suits the modest Sixth Avenue side, not Fifth).
function parcelRow(items, prefix, axis, faceCoord, from, to, depth, facing, laundryChance = 0) {
  const streetFace = axis === 'z' ? (facing > 0 ? '-z' : '+z') : (facing > 0 ? '-x' : '+x');
  // A paved lot strip under the whole row, so the houses meet stone, not lawn.
  const lotMid = faceCoord + (facing * (depth + 2)) / 2;
  const lotLen = to - from;
  const [lx, lz, lsx, lsz] =
    axis === 'z' ? [(from + to) / 2, lotMid, lotLen, depth + 2] : [lotMid, (from + to) / 2, depth + 2, lotLen];
  items.push({ ...strip(`${prefix}-lot`, lx, lz, lsx, lsz, WALK_TOP - 0.015, 0.24, 'paving', '#8d8779'), collider: false });
  // 25-foot lots: the 1896 rowhouse rhythm is narrow and repetitive.
  let cursor = from;
  let index = 0;
  while (cursor < to - 5) {
    const width = 6 + hash01(index * 3.1 + from) * 2.5;
    const height = 12 + hash01(index * 7.7 + to) * 3.5;
    const center = cursor + width / 2;
    const [x, z, sx, sz] =
      axis === 'z' ? [center, faceCoord + (facing * depth) / 2, width - 0.3, depth] : [faceCoord + (facing * depth) / 2, center, depth, width - 0.3];
    items.push(building(`${prefix}-${index}`, x, z, sx, height, sz, {
      facadeStyle: index % 2 === 0 ? 0 : 3,
      windowFaces: [streetFace],
      laundry: hash01(index * 9.13 + from * 0.7) < laundryChance,
    }));
    cursor += width;
    index += 1;
  }
}

// Cast-iron hitching post: plinth, tapered shaft, collar, ball finial.
function hitchingPost(id, x, z) {
  return [
    { id: `${id}-plinth`, kind: 'furniture', shape: 'cylinder', position: [x, WALK_TOP + 0.06, z], size: [0.2, 0.12, 0.2], yaw: 0, color: '#2c3033', metal: true, collider: false, absoluteY: true },
    { id: `${id}-shaft`, kind: 'furniture', shape: 'cone', position: [x, WALK_TOP + 0.55, z], size: [0.11, 0.86, 0.11], yaw: 0, color: '#33383c', metal: true, collider: false, absoluteY: true },
    { id: `${id}-collar`, kind: 'furniture', shape: 'cylinder', position: [x, WALK_TOP + 0.88, z], size: [0.11, 0.05, 0.11], yaw: 0, color: '#22262a', metal: true, collider: false, absoluteY: true },
    { id: `${id}-ball`, kind: 'furniture', shape: 'sphere', position: [x, WALK_TOP + 0.99, z], size: [0.15, 0.15, 0.15], yaw: 0, color: '#2b2f33', metal: true, collider: false, absoluteY: true },
  ];
}

// Squat cast-iron hydrant: base flange, barrel, domed bonnet, two capped
// side nozzles.
function hydrant(id, x, z) {
  return [
    { id: `${id}-flange`, kind: 'furniture', shape: 'cylinder', position: [x, WALK_TOP + 0.05, z], size: [0.42, 0.1, 0.42], yaw: 0, color: '#31402f', metal: true, collider: false, absoluteY: true },
    { id: `${id}-body`, kind: 'furniture', shape: 'cylinder', position: [x, WALK_TOP + 0.4, z], size: [0.3, 0.62, 0.3], yaw: 0, color: '#3d4a3c', metal: true, absoluteY: true },
    { id: `${id}-bonnet`, kind: 'furniture', shape: 'sphere', position: [x, WALK_TOP + 0.74, z], size: [0.3, 0.3, 0.3], yaw: 0, color: '#334032', metal: true, collider: false, absoluteY: true },
    { id: `${id}-finial`, kind: 'furniture', shape: 'cylinder', position: [x, WALK_TOP + 0.92, z], size: [0.08, 0.1, 0.08], yaw: 0, color: '#2b362a', metal: true, collider: false, absoluteY: true },
    { id: `${id}-nozzle-a`, kind: 'furniture', shape: 'cylinder', position: [x + 0.2, WALK_TOP + 0.45, z], size: [0.12, 0.16, 0.12], yaw: 0, rotation: [0, 0, Math.PI / 2], color: '#2b362a', metal: true, collider: false, absoluteY: true },
    { id: `${id}-nozzle-b`, kind: 'furniture', shape: 'cylinder', position: [x - 0.2, WALK_TOP + 0.45, z], size: [0.12, 0.16, 0.12], yaw: 0, rotation: [0, 0, Math.PI / 2], color: '#2b362a', metal: true, collider: false, absoluteY: true },
  ];
}

// Telegraph pole with four crossarms — the 1890s avenue skyline at eye level.
function telegraphPole(id, x, z) {
  const items = [
    { id: `${id}-pole`, kind: 'furniture', shape: 'cylinder', position: [x, WALK_TOP + 3.6, z], size: [0.22, 7.2, 0.22], yaw: 0, color: '#4f4234', absoluteY: true },
  ];
  for (let arm = 0; arm < 4; arm += 1) {
    items.push({
      id: `${id}-arm-${arm}`, kind: 'furniture', position: [x, WALK_TOP + 6.7 - arm * 0.5, z], size: [1.7, 0.09, 0.09], yaw: 0, color: '#443928', collider: false, absoluteY: true,
    });
  }
  return items;
}

// The Sixth Avenue El's northern terminus (dimensions provisional, Ben to
// verify): iron viaduct over the avenue ending in a station house whose
// street stairs land on 58th Street's south sidewalk. The deck is walkable.
function elTerminus(items) {
  const deckY = 7.85;
  const stairAngle = Math.atan2(deckY + 0.12 - WALK_TOP, 8);
  for (let i = 0; i < 6; i += 1) {
    const z = 145 + i * 8;
    for (const x of [-43, -37]) {
      items.push({ id: `el-col-${x}-${i}`, kind: 'furniture', shape: 'cylinder', position: [x, 4.36, z], size: [0.5, 6.4, 0.5], yaw: 0, color: '#2f3336', metal: true, absoluteY: true });
    }
    items.push({ id: `el-cross-${i}`, kind: 'furniture', position: [-40, 7.35, z], size: [6.6, 0.5, 0.55], yaw: 0, color: '#33383c', metal: true, collider: false, absoluteY: true });
  }
  for (const x of [-43, -37]) {
    items.push({ id: `el-girder-${x}`, kind: 'furniture', position: [x, 7.35, 164], size: [0.55, 0.85, 46], yaw: 0, color: '#2c3034', metal: true, collider: false, absoluteY: true });
  }
  items.push(
    { id: 'el-deck', kind: 'furniture', position: [-40, deckY, 164], size: [8.2, 0.25, 46], yaw: 0, color: '#4a4038', absoluteY: true },
    { id: 'el-guard-w', kind: 'furniture', position: [-43.9, 8.45, 164], size: [0.12, 0.95, 46], yaw: 0, color: '#33383c', metal: true, absoluteY: true },
    { id: 'el-guard-e', kind: 'furniture', position: [-36.1, 8.45, 164], size: [0.12, 0.95, 46], yaw: 0, color: '#33383c', metal: true, absoluteY: true },
    { id: 'el-bumper', kind: 'furniture', position: [-40, 8.35, 142.6], size: [7.6, 0.75, 0.5], yaw: 0, color: '#3d3428', absoluteY: true },
  );
  for (const x of [-42.2, -40.8, -39.2, -37.8]) {
    items.push({ id: `el-rail-${x}`, kind: 'furniture', position: [x, 8.05, 164.5], size: [0.09, 0.14, 43], yaw: 0, color: '#55504a', metal: true, collider: false, absoluteY: true });
  }
  // Station house with a gabled roof, platform canopy behind it.
  items.push(
    { id: 'el-station-house', kind: 'furniture', position: [-40, 9.55, 150], size: [5.5, 3.1, 14], yaw: 0, color: '#5d4c3a', absoluteY: true },
    { id: 'el-station-trim', kind: 'furniture', position: [-40, 8.35, 150], size: [5.7, 0.5, 14.2], yaw: 0, color: '#4a3c2e', collider: false, absoluteY: true },
    { id: 'el-roof-w', kind: 'furniture', position: [-41.5, 11.5, 150], size: [3.6, 0.16, 15], yaw: 0, rotation: [0, 0, 0.52], color: '#3e4046', collider: false, absoluteY: true },
    { id: 'el-roof-e', kind: 'furniture', position: [-38.5, 11.5, 150], size: [3.6, 0.16, 15], yaw: 0, rotation: [0, 0, -0.52], color: '#3e4046', collider: false, absoluteY: true },
    { id: 'el-canopy', kind: 'furniture', position: [-40, 10.15, 167], size: [7, 0.12, 16], yaw: 0, color: '#46413a', collider: false, absoluteY: true },
  );
  for (let post = 0; post < 4; post += 1) {
    items.push({ id: `el-canopy-post-${post}`, kind: 'furniture', shape: 'cylinder', position: [post % 2 === 0 ? -42.8 : -37.2, 9.05, 161 + Math.floor(post / 2) * 11], size: [0.16, 2.1, 0.16], yaw: 0, color: '#33383c', metal: true, collider: false, absoluteY: true });
  }
  // Street stairs: sloped, within the climbable grade, one flight per side.
  for (const side of [-1, 1]) {
    const inner = side < 0 ? -44.5 : -35.5;
    const centerX = inner + side * 4;
    items.push({
      id: `el-stair-${side}`, kind: 'furniture', position: [centerX, (deckY + WALK_TOP) / 2 + 0.1, 141.6],
      size: [10.4, 0.22, 1.6], yaw: 0, rotation: [0, 0, -side * stairAngle], color: '#4a4038', absoluteY: true,
    });
    items.push({
      id: `el-stair-rail-${side}`, kind: 'furniture', position: [centerX, (deckY + WALK_TOP) / 2 + 1.0, 140.9],
      size: [10.4, 0.08, 0.08], yaw: 0, rotation: [0, 0, -side * stairAngle], color: '#33383c', metal: true, collider: false, absoluteY: true,
    });
  }
}

function buildStreets() {
  const items = [];
  elTerminus(items);

  // StreetSurfaces draws the partitioned top planes. These boxes provide the
  // matching collision volume and stay invisible, preventing coplanar road
  // strips and raised rut meshes from fighting at intersections.
  for (const surface of [...STREET_SURFACES.roads, ...STREET_SURFACES.intersections]) {
    items.push({
      ...strip(`collision-${surface.id}`, surface.x, surface.z, surface.sx, surface.sz, ROAD_TOP, 0.12),
      render: false,
    });
  }
  for (const surface of STREET_SURFACES.sidewalks) {
    items.push({
      ...strip(`collision-${surface.id}`, surface.x, surface.z, surface.sx, surface.sz, WALK_TOP, 0.26),
      render: false,
    });
  }

  // Landmarks (provisional identifications; massing only). Free-standing, so
  // all four faces carry window geometry. Each sits on a paved apron.
  const ALL_FACES = { windowFaces: ['+x', '-x', '+z', '-z'] };
  const apron = (id, x, z, sx, sz) =>
    ({ ...strip(`${id}-apron`, x, z, sx + 4, sz + 4, WALK_TOP - 0.015, 0.24, 'paving', '#8d8779'), collider: false });
  items.push(
    apron('hotel-new-netherland', 122, 72, 15, 15),
    apron('hotel-savoy', 122, 104, 14, 14),
    apron('plaza-hotel-1890', 80, 106, 20, 14),
    apron('metropolitan-club', 120, 52, 16, 12),
    apron('vanderbilt-mansion', 86, 116, 18, 14),
    apron('navarro-flats-a', -52, 108, 12, 13),
    apron('navarro-flats-b', -38, 110, 12, 13),
    apron('navarro-flats-c', -24, 108, 12, 13),
  );
  items.push(
    building('hotel-new-netherland', 122, 72, 15, 34, 15, { facadeStyle: 1, roof: 'cone', awnings: true, ...ALL_FACES }),
    building('hotel-savoy', 122, 104, 14, 24, 14, { facadeStyle: 1, roof: 'mansard', awnings: true, ...ALL_FACES }),
    building('plaza-hotel-1890', 80, 106, 20, 17, 14, { facadeStyle: 2, roof: 'mansard', awnings: true, ...ALL_FACES }),
    building('metropolitan-club', 120, 52, 16, 9, 12, { facadeStyle: 4, ...ALL_FACES }),
    building('vanderbilt-mansion', 86, 116, 18, 13, 14, { facadeStyle: 1, roof: 'mansard', ...ALL_FACES }),
    building('navarro-flats-a', -52, 108, 12, 21, 13, { facadeStyle: 1, roof: 'cone', ...ALL_FACES }),
    building('navarro-flats-b', -38, 110, 12, 22, 13, { facadeStyle: 1, roof: 'mansard', ...ALL_FACES }),
    building('navarro-flats-c', -24, 108, 12, 20, 13, { facadeStyle: 1, roof: 'cone', ...ALL_FACES }),
  );

  // Brownstone rows along the block faces, clear of the landmarks.
  parcelRow(items, 'fifth-east-a', 'x', 110, -20, 40, 12, 1);
  parcelRow(items, 'fifth-east-b', 'x', 110, 120, 160, 12, 1);
  parcelRow(items, 'cps-south-a', 'z', 99, -96, -60, 12, 1);
  parcelRow(items, 'cps-south-b', 'z', 99, -8, 68, 12, 1);
  parcelRow(items, 'fifty-eighth-n', 'z', 128, 116, 160, 11, -1, 0.3);
  parcelRow(items, 'fifty-eighth-s', 'z', 141, -96, -52, 11, 1, 0.3);
  parcelRow(items, 'madison-west', 'x', 161, 100, 128, 11, -1);
  parcelRow(items, 'madison-east', 'x', 173, 92, 170, 12, 1, 0.35);
  parcelRow(items, 'sixth-west', 'x', -46, 100, 170, 11, -1, 0.5);
  parcelRow(items, 'block-a-inner', 'z', 118, 118, 158, 12, 1, 0.5);

  for (const site of STREET_LAMP_SITES) items.push(...lamp(site.id, site.x, site.z, site.yaw));

  // Sidewalk iron: hitching posts and hydrants on the built side of Fifth
  // and Central Park South, telegraph poles down the Sixth Avenue stand-in.
  for (let i = 0; i < 6; i += 1) {
    items.push(...hitchingPost(`fifth-hitch-${i}`, 108.6, -56 + i * 24));
    items.push(...hitchingPost(`cps-hitch-${i}`, -80 + i * 26, 97.6));
  }
  items.push(
    ...hydrant('hydrant-fifth-cps', 108.6, 82),
    ...hydrant('hydrant-fifth-58', 108.6, 126),
    ...hydrant('hydrant-cps-west', -50, 97.6),
    ...hydrant('hydrant-madison', 172.6, 128),
  );
  for (let i = 0; i < 3; i += 1) {
    items.push(...telegraphPole(`sixth-pole-${i}`, -47.7, 104 + i * 30));
  }

  // Vendor pushcarts are dynamic bodies, not blueprint items: see
  // world/pushcarts.js for the pitches and scene/Pushcarts.jsx for the body.

  return items;
}

export const streetItems = buildStreets();

// Free-standing laundry lines in the back lots and alleys. Anchors are hand
// picked so no line threads a building; the dressing (posts, sag, cloth)
// stays procedural in WindowField.
// Interior-enabled buildings: one Fifth Avenue block for testing, plus one
// Navarro tower as the grand-atrium sample.
export const INTERIOR_BUILDINGS = streetItems.filter(
  (item) => item.kind === 'backdrop' && (item.id.startsWith('fifth-east-a-') || item.id === 'navarro-flats-b'),
);

export const ALLEY_LINES = [
  { x: 130, z: 116, yaw: 0, length: 7 },
  { x: 145, z: 113, yaw: 0.4, length: 6 },
  { x: -60, z: 120, yaw: Math.PI / 2, length: 6 },
  { x: -60.5, z: 150, yaw: Math.PI / 2, length: 7 },
  { x: 190, z: 150, yaw: 0.2, length: 6 },
  { x: 122, z: 146, yaw: 1.2, length: 7 },
];
