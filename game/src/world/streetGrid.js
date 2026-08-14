// Compressed street context around the southeast corner of Central Park.
// Existing through-routes retain their centres so traffic and playable
// geography remain stable. Short pieces of 61st and Seventh complete the
// visible blocks without pretending this is a survey-accurate city model.

import { gasLamp } from './parkCatalog.js';
import { facadeEntranceLayout } from './facade.js';
import { buildStreetSurfaceLayout } from './streetSurfaceLayout.js';

export const WORLD_BOUNDS = { minX: -100, maxX: 230, minZ: -85, maxZ: 186 };
export const STREET_LEVEL = 1.05;
export const ROAD_TOP = 1.16;
export const WALK_TOP = 1.29;
export const SIDEWALK_WIDTH = 3.2;

// Roads as [axis, lo, hi, from, to]: axis 'z' = east-west street band.
export const ROADS = [
  { id: 'east-sixty-first', axis: 'z', lo: 6, hi: 14, from: 99, to: 171 },
  // East 60th terminates at Fifth Avenue. It replaces the narrow visual gap
  // that previously read as an alley between the Metropolitan Club and the
  // next block. The actual clubhouse service alley was on the north side.
  { id: 'east-sixtieth', axis: 'z', lo: 52, hi: 60, from: 99, to: 230 },
  { id: 'cps', axis: 'z', lo: 86, hi: 96, from: -100, to: 230 },
  { id: 'fifty-eighth', axis: 'z', lo: 130, hi: 140, from: -100, to: 230 },
  { id: 'fifty-seventh', axis: 'z', lo: 174, hi: 184, from: -100, to: 230 },
  { id: 'fifth-ave', axis: 'x', lo: 99, hi: 107, from: -85, to: 186 },
  { id: 'madison-ave', axis: 'x', lo: 163, hi: 171, from: -85, to: 186 },
  { id: 'sixth-ave', axis: 'x', lo: -44, hi: -36, from: 84, to: 186 },
  // Context only: the western edge of the Navarro block. Traffic continues
  // to use the established Sixth Avenue loops.
  { id: 'seventh-ave', axis: 'x', lo: -96, hi: -88, from: 84, to: 140 },
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
  ...[-68, -42, -16, 20, 36, 50].map((z, index) => ({ id: `fifth-park-${index}`, x: 98.0, z, yaw: Math.PI })),
  // The New Netherland entrance supplies its own paired lamps; keep its stoop
  // and doorway axis clear instead of dropping a generic city lamp at z=72.
  ...[-70, -44, -20, 4, 28, 46, 110, 120, 154, 170].map((z, index) => ({ id: `fifth-built-${index}`, x: 108.0, z, yaw: 0 })),
  ...[-84, -62, -6, 22, 50].map((x, index) => ({ id: `cps-park-${index}`, x, z: 85.0, yaw: Math.PI / 2 })),
  ...[-84, -66, -14, 12, 38, 64, 82, 124, 150, 176, 202].map((x, index) => ({ id: `cps-built-${index}`, x, z: 97.0, yaw: -Math.PI / 2 })),
];

const FRONTAGE_FAMILIES = {
  brownstone: {
    width: [6, 8.5], height: [12, 15.5], styles: [0, 3, 5], tones: [0, 3, 1], setback: 0,
  },
  mansion: {
    width: [9.5, 14], height: [12.5, 16.5], styles: [2, 4, 1], tones: [null], setback: 0.55,
  },
  marble: {
    width: [8, 10.5], height: [14, 17], styles: [4, 2], tones: [null], setback: 0.25,
  },
  apartment: {
    width: [10, 15], height: [18, 24], styles: [1, 5, 2], tones: [null], setback: 0,
  },
};

// One frontage grammar supplies four recognisable building families. Every
// parcel gets a formal street front and simpler rear; only exposed ends are
// detailed. This retains the existing instanced facade dressing.
function frontageRow(
  items,
  prefix,
  axis,
  faceCoord,
  from,
  to,
  depth,
  facing,
  familyName = 'brownstone',
  laundryChance = 0,
) {
  const family = FRONTAGE_FAMILIES[familyName] ?? FRONTAGE_FAMILIES.brownstone;
  const streetFace = axis === 'z' ? (facing > 0 ? '-z' : '+z') : (facing > 0 ? '-x' : '+x');
  const rearFace = { '+x': '-x', '-x': '+x', '+z': '-z', '-z': '+z' }[streetFace];
  const lotMid = faceCoord + (facing * (depth + family.setback + 2)) / 2;
  const lotLen = to - from;
  const [lx, lz, lsx, lsz] =
    axis === 'z'
      ? [(from + to) / 2, lotMid, lotLen, depth + family.setback + 2]
      : [lotMid, (from + to) / 2, depth + family.setback + 2, lotLen];
  items.push({ ...strip(`${prefix}-lot`, lx, lz, lsx, lsz, WALK_TOP - 0.015, 0.24, 'paving', '#8d8779'), collider: false });
  const parcels = [];
  let cursor = from;
  let index = 0;
  const [minWidth, maxWidth] = family.width;
  while (cursor < to - minWidth * 0.7) {
    let width = Math.min(minWidth + hash01(index * 3.1 + from) * (maxWidth - minWidth), to - cursor);
    if (to - cursor - width < minWidth * 0.7) width = to - cursor;
    const height = family.height[0]
      + hash01(index * 7.7 + to + faceCoord * 0.13) * (family.height[1] - family.height[0]);
    const runIndex = Math.floor(index / (familyName === 'brownstone' ? 2 : 1));
    const facadeStyle = family.styles[runIndex % family.styles.length];
    const facadeTone = family.tones[runIndex % family.tones.length];
    const center = cursor + width / 2;
    const buildingFace = faceCoord + facing * family.setback;
    const [x, z, sx, sz] =
      axis === 'z'
        ? [center, buildingFace + (facing * depth) / 2, width - 0.3, depth]
        : [buildingFace + (facing * depth) / 2, center, depth, width - 0.3];
    parcels.push(building(`${prefix}-${index}`, x, z, sx, height, sz, {
      frontageFamily: familyName,
      facadeStyle,
      facadeTone,
      windowFaces: [streetFace, rearFace],
      facadeRoles: { [streetFace]: 'front', [rearFace]: 'rear' },
      laundry: hash01(index * 9.13 + from * 0.7) < laundryChance,
      awnings: familyName === 'apartment' && hash01(index * 4.7 + from) < 0.38,
      roof: familyName === 'mansion' && index % 3 === 0 ? 'mansard' : undefined,
      shadows: false,
    }));
    cursor += width;
    index += 1;
  }

  // The row runs along X when its street is horizontal (`axis === 'z'`),
  // and along Z when its street is vertical. Append these after streetFace:
  // WindowField treats the first face as the entrance/frontage elevation.
  const [startFace, endFace] = axis === 'z' ? ['-x', '+x'] : ['-z', '+z'];
  if (parcels.length > 0) {
    parcels[0].windowFaces.push(startFace);
    parcels[0].facadeRoles[startFace] = 'end';
    parcels[parcels.length - 1].windowFaces.push(endFace);
    parcels[parcels.length - 1].facadeRoles[endFace] = 'end';
  }
  items.push(...parcels);
}

function infillBox(id, infillType, x, y, z, sx, sy, sz, color, collider = false) {
  return {
    id,
    kind: 'block-infill',
    infillType,
    position: [x, y, z],
    size: [sx, sy, sz],
    color,
    collider,
    absoluteY: true,
  };
}

// Rear courts are deliberately low-cost: all pieces are rendered in a few
// instanced batches in Furniture. The street houses do the visual work; these
// shapes stop the block interior reading as an open lawn from roofs and the
// overhead camera.
function serviceCourt(items, id, x, z, sx, sz, options = {}) {
  if (sx <= 0 || sz <= 0) return;
  items.push(infillBox(
    `${id}-court`,
    'court',
    x,
    WALK_TOP - 0.035,
    z,
    sx,
    0.07,
    sz,
    options.earth ? '#71624f' : '#716e65',
  ));

  const divisions = options.divisions ?? Math.max(1, Math.floor(sx / 24));
  for (let index = 1; index <= divisions; index += 1) {
    const wallX = x - sx / 2 + (index * sx) / (divisions + 1);
    items.push(infillBox(
      `${id}-party-wall-${index}`,
      'wall',
      wallX,
      WALK_TOP + 0.58,
      z,
      0.16,
      1.15,
      Math.max(1.2, sz - 0.5),
      '#695c50',
    ));
  }

  if (options.houses === 0 || sz < 6.2 || sx < 8) return;
  const houses = Math.min(options.houses ?? 1, Math.max(1, Math.floor(sx / 18)));
  const houseWidth = Math.min(7.2, sx / (houses + 0.7));
  const houseDepth = Math.min(3.8, sz * 0.42);
  for (let index = 0; index < houses; index += 1) {
    const houseX = x - sx / 2 + ((index + 1) * sx) / (houses + 1);
    const north = index % 2 === 0;
    const houseZ = z + (north ? 1 : -1) * (sz / 2 - houseDepth / 2 - 0.25);
    items.push(
      infillBox(
        `${id}-carriage-house-${index}`,
        'outbuilding',
        houseX,
        WALK_TOP + 2.2,
        houseZ,
        houseWidth,
        4.4,
        houseDepth,
        index % 2 ? '#765d4d' : '#806555',
        true,
      ),
      infillBox(
        `${id}-carriage-house-roof-${index}`,
        'roof',
        houseX,
        WALK_TOP + 4.48,
        houseZ,
        houseWidth + 0.35,
        0.18,
        houseDepth + 0.35,
        '#49433d',
      ),
      infillBox(
        `${id}-carriage-house-door-${index}`,
        'door',
        houseX,
        WALK_TOP + 1.45,
        houseZ + (north ? -1 : 1) * (houseDepth / 2 + 0.035),
        Math.min(3.1, houseWidth * 0.55),
        2.8,
        0.08,
        '#3f352d',
      ),
    );
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
    apron('hotel-savoy', 119.5, 105.9, 18.6, 13.4),
    apron('bolkenhayn-apartments', 119, 120.4, 17.6, 12.8),
    apron('plaza-hotel-1890', 84.8, 107.1, 22, 15.8),
    apron('vanderbilt-mansion', 84.8, 157, 22, 27.6),
    apron('navarro-flats-a', -78, 107.2, 13, 16),
    apron('navarro-flats-b', -64.5, 107.2, 12, 16),
    apron('navarro-flats-c', -52.6, 107.2, 10.8, 16),
  );
  items.push(
    { ...strip('metropolitan-service-alley', 122, 32, 25, 4, WALK_TOP - 0.015, 0.24, 'paving', '#77746c'), collider: false },
    // Only the south block receives a narrow private apron; East 60th's own
    // generated sidewalks remain visible and continuous at the intersection.
    { ...strip('hotel-new-netherland-apron', 122, 73, 19, 19.6, WALK_TOP - 0.015, 0.24, 'paving', '#8d8779'), collider: false },
    // Full-depth corner mass between 60th and 59th. Its neighbouring parcels
    // continue east as one solid block instead of leaving a freestanding tower.
    building('hotel-new-netherland', 120.5, 72, 20.6, 36, 17.6, {
      facadeStyle: 1, roof: 'cone', awnings: true,
      landmarkLabel: 'New Netherland Hotel', landmarkModel: 'new-netherland-hotel',
      landmarkLocation: 'Fifth Avenue at East 59th Street',
      wikipediaTitle: 'Hotel New Netherland',
      shadows: false, ...ALL_FACES,
    }),
    building('hotel-savoy', 119.5, 105.9, 18.6, 32, 13.4, {
      facadeStyle: 1, roof: 'mansard', awnings: true,
      landmarkLabel: 'Hotel Savoy', landmarkModel: 'savoy-hotel',
      landmarkLocation: 'Fifth Avenue at East 59th Street',
      shadows: false, ...ALL_FACES,
    }),
    building('bolkenhayn-apartments', 119, 120.4, 17.6, 22, 12.8, {
      facadeStyle: 2, roof: 'mansard', awnings: true,
      landmarkLabel: 'The Bolkenhayn Apartments', landmarkModel: 'bolkenhayn-apartments',
      landmarkLocation: 'Fifth Avenue near East 58th Street',
      shadows: false, ...ALL_FACES,
    }),
    building('plaza-hotel-1890', 84.8, 107.1, 22, 17, 15.8, {
      facadeStyle: 2, roof: 'mansard',
      landmarkLabel: 'The Plaza Hotel (1890)',
      landmarkLocation: 'Fifth Avenue between West 58th and 59th Streets',
      // Wikipedia's Plaza Hotel article covers the later 1907 building on
      // the same site as well as the first hotel represented in this scene.
      wikipediaTitle: 'Plaza Hotel',
      wikipediaContext: 'The article covers both Plaza hotels built on this site; the game shows the first, completed in 1890.',
      ...ALL_FACES,
    }),
    building('metropolitan-club', 122, 42, 25, 17, 16, {
      facadeStyle: 4, landmarkLabel: 'Metropolitan Club',
      landmarkModel: 'metropolitan-club',
      landmarkLocation: 'Fifth Avenue at East 60th Street',
      wikipediaTitle: 'Metropolitan Club (New York City)',
      // The main block occupies the west side; these proxies preserve the
      // open landscaped setback and eastern entrance court for collision.
      colliderBoxes: [
        { center: [-2.15, 0, 0], size: [17.4, 17, 13.4] },
        { center: [9.4, -5.3, -4.8], size: [5.7, 6.4, 5.2] },
      ],
      ...ALL_FACES,
    }),
    // The expanded house occupied the west Fifth Avenue frontage between
    // 57th and 58th. The compressed footprint preserves that urban role.
    building('vanderbilt-mansion', 84.8, 157, 22, 19, 27.6, {
      facadeStyle: 2, roof: 'mansard', frontageFamily: 'mansion',
      landmarkLabel: 'Cornelius Vanderbilt II Mansion', landmarkModel: 'vanderbilt-mansion',
      landmarkLocation: 'Fifth Avenue between West 57th and 58th Streets',
      wikipediaTitle: 'Cornelius Vanderbilt II House',
      shadows: false, ...ALL_FACES,
    }),
    // The 57th-to-58th Street block keeps a compressed portion of Mary Mason
    // Jones's attached white-marble row. By 1896 the Huntington house supplied
    // the more individual southern corner silhouette, so two authored parcels
    // replace nine generic frontage colliders here.
    building('marble-row', 122.2, 149.5, 24, 15.5, 12.6, {
      facadeStyle: 4, frontageFamily: 'marble', rowCount: 4,
      landmarkLabel: 'Marble Row', landmarkModel: 'marble-row',
      landmarkLocation: 'Fifth Avenue between East 57th and 58th Streets',
      shadows: false, ...ALL_FACES,
    }),
    building('huntington-mansion', 122.2, 163.5, 24, 18.5, 14.8, {
      facadeStyle: 0, frontageFamily: 'mansion',
      landmarkLabel: 'Collis P. Huntington Mansion', landmarkModel: 'huntington-mansion',
      landmarkLocation: 'Fifth Avenue at East 57th Street',
      shadows: false, ...ALL_FACES,
    }),
    // The Gerry house closes the Fifth/61st corner immediately north of the
    // Metropolitan Club, with the documented narrow service alley between.
    building('gerry-mansion', 122.5, 23.5, 24.6, 18.5, 12.6, {
      facadeStyle: 2, frontageFamily: 'mansion',
      landmarkLabel: 'Elbridge T. Gerry Mansion', landmarkModel: 'gerry-mansion',
      landmarkLocation: 'Fifth Avenue at East 61st Street',
      wikipediaTitle: 'Elbridge T. Gerry Mansion',
      shadows: false, ...ALL_FACES,
    }),
    // Three wings and two narrow courts suggest the larger Navarro complex
    // beside the new Seventh Avenue edge without building all eight houses.
    building('navarro-flats-a', -78, 107.2, 13, 21, 16, {
      facadeStyle: 1, roof: 'cone', landmarkLabel: 'Navarro Flats',
      landmarkLocation: 'Central Park South between Sixth and Seventh Avenues',
      ...ALL_FACES,
    }),
    building('navarro-flats-b', -64.5, 107.2, 12, 22, 16, {
      facadeStyle: 1, roof: 'mansard', landmarkLabel: 'Navarro Flats',
      landmarkLocation: 'Central Park South between Sixth and Seventh Avenues',
      ...ALL_FACES,
    }),
    building('navarro-flats-c', -52.6, 107.2, 10.8, 20, 16, {
      facadeStyle: 1, roof: 'cone', landmarkLabel: 'Navarro Flats',
      landmarkLocation: 'Central Park South between Sixth and Seventh Avenues',
      ...ALL_FACES,
    }),
  );

  // North: Fifth Avenue mansions, the Metropolitan Club block, and a denser
  // edge toward Madison. The 61st Street corner parcel supplies the missing
  // Fifth Avenue face south of that new short street.
  frontageRow(items, 'fifth-east-a', 'x', 110.2, -70, 2, 13, 1, 'mansion');
  frontageRow(items, 'sixty-first-north', 'z', 2.8, 124.5, 159.5, 11, -1, 'mansion');
  frontageRow(items, 'sixty-first-south', 'z', 17.2, 136.2, 159.5, 13, 1, 'mansion');
  frontageRow(items, 'madison-east-north', 'x', 174.2, -70, 2.8, 12, 1, 'apartment');
  frontageRow(items, 'madison-east-mid', 'x', 174.2, 17.2, 48.8, 12, 1, 'brownstone');
  frontageRow(items, 'sixtieth-north-west', 'z', 48.8, 136, 159.5, 14, -1, 'brownstone');
  frontageRow(items, 'sixtieth-north-east', 'z', 48.8, 174.2, 226, 14, -1, 'brownstone');
  frontageRow(items, 'sixtieth-south-block', 'z', 63.2, 132, 148.5, 7.5, 1, 'apartment');
  frontageRow(items, 'cps-north-block', 'z', 82.8, 132, 148.5, 7.5, -1, 'apartment');
  frontageRow(items, 'madison-west-upper', 'x', 159.8, 63.2, 82.8, 11, -1, 'apartment');
  frontageRow(items, 'sixtieth-south-east', 'z', 63.2, 186.5, 226, 7.5, 1, 'brownstone');
  frontageRow(items, 'cps-north-east', 'z', 82.8, 186.5, 226, 7.5, -1, 'apartment');
  frontageRow(items, 'madison-east-upper', 'x', 174.2, 63.2, 82.8, 12, 1, 'apartment');

  // Central Park South to 58th: Navarro and the Plaza anchor the west side;
  // the Savoy/Bolkenhayn composition anchors Fifth. Ordinary frontage closes
  // each remaining street wall while leaving narrow service courts behind.
  frontageRow(items, 'navarro-fifty-eighth', 'z', 126.8, -84.5, -47.2, 8, -1, 'apartment', 0.25);
  frontageRow(items, 'cps-south-b', 'z', 99.2, -32.5, 68, 10, 1, 'apartment');
  frontageRow(items, 'plaza-fifty-eighth', 'z', 126.8, -32.5, 68, 8, -1, 'brownstone', 0.25);
  frontageRow(items, 'cps-savoy-east', 'z', 99.2, 131, 148.5, 10, 1, 'apartment');
  frontageRow(items, 'fifty-eighth-n', 'z', 126.8, 132, 148.5, 8, -1, 'apartment', 0.25);
  frontageRow(items, 'madison-west-mid', 'x', 159.8, 99.2, 126.8, 11, -1, 'apartment', 0.25);
  frontageRow(items, 'cps-madison-east', 'z', 99.2, 186.5, 226, 10, 1, 'apartment');
  frontageRow(items, 'fifty-eighth-n-east', 'z', 126.8, 186.5, 226, 8, -1, 'apartment', 0.25);

  // 58th to 57th: attached houses west of Sixth, Vanderbilt opposite Marble
  // Row on Fifth, and progressively more repetitive fabric toward Madison.
  frontageRow(items, 'fifty-eighth-s', 'z', 143.2, -84.5, -47.2, 9, 1, 'apartment', 0.3);
  frontageRow(items, 'fifty-seventh-n-west', 'z', 170.8, -84.5, -47.2, 9, -1, 'brownstone', 0.3);
  frontageRow(items, 'fifty-eighth-s-central', 'z', 143.2, -32.5, 70, 9, 1, 'mansion');
  frontageRow(items, 'fifty-seventh-n-central', 'z', 170.8, -32.5, 70, 9, -1, 'brownstone');
  frontageRow(items, 'madison-west', 'x', 159.8, 143.2, 170.8, 11, -1, 'brownstone');
  frontageRow(items, 'madison-east', 'x', 174.2, 100, 126.8, 12, 1, 'apartment', 0.25);
  frontageRow(items, 'madison-east-south', 'x', 174.2, 143.2, 170.8, 12, 1, 'brownstone', 0.3);
  frontageRow(items, 'fifty-eighth-s-far-east', 'z', 143.2, 186.5, 226, 9, 1, 'brownstone', 0.3);
  frontageRow(items, 'fifty-seventh-n-far-east', 'z', 170.8, 186.5, 226, 9, -1, 'brownstone', 0.3);

  // Phase-three block interiors. These are spatial cues, not traversable
  // miniature simulations: paved or earthen courts, party walls, and a small
  // number of carriage houses close the overhead gaps at very low draw cost.
  serviceCourt(items, 'north-fifth-yards', 142, -35, 35, 52, { earth: true, divisions: 3, houses: 3 });
  serviceCourt(items, 'north-madison-yards', 206.2, -33.5, 39.2, 49, { earth: true, divisions: 2, houses: 2 });
  serviceCourt(items, 'new-netherland-east-court', 140.2, 73, 16.2, 4.6, { divisions: 1, houses: 0 });
  serviceCourt(items, 'sixtieth-east-court', 206.2, 73, 39.2, 4.6, { divisions: 2, houses: 0 });
  serviceCourt(items, 'navarro-rear-court', -65.9, 117, 37.2, 3.6, { earth: true, divisions: 2, houses: 0 });
  serviceCourt(items, 'plaza-west-service-court', 17.8, 114, 100.1, 9.6, { divisions: 4, houses: 3 });
  serviceCourt(items, 'savoy-east-service-court', 140.2, 114, 16.2, 9.6, { divisions: 1, houses: 1 });
  serviceCourt(items, 'madison-mid-service-court', 206.2, 114, 39.2, 9.6, { divisions: 2, houses: 2 });
  serviceCourt(items, 'seventh-south-yards', -65.9, 157, 37.2, 9.6, { earth: true, divisions: 2, houses: 2 });
  serviceCourt(items, 'fifty-seventh-central-yards', 18.8, 157, 102.5, 9.6, { earth: true, divisions: 4, houses: 3 });
  serviceCourt(items, 'marble-row-yards', 141, 149.5, 13.2, 12.6, { divisions: 1, houses: 1 });
  serviceCourt(items, 'huntington-rear-court', 141, 163.5, 13.2, 14.8, { divisions: 1, houses: 0 });
  serviceCourt(items, 'madison-south-yards', 206.2, 157, 39.2, 9.6, { divisions: 2, houses: 2 });

  // One smooth ramp plus, on raised stoops, two side blockers. These records
  // are generated from the exact entrance layout WindowField draws: no
  // per-tread or triangle-mesh collision, and no visual/collider drift.
  for (const entry of items.filter(
    (item) => item.kind === 'backdrop' && item.frontageFamily && !item.landmarkModel,
  )) {
    const entrance = facadeEntranceLayout(entry);
    if (!entrance) continue;
    for (const collider of entrance.colliders) {
      items.push({
        id: `${entry.id}-entrance-${collider.role}`,
        kind: 'entrance-collider',
        position: collider.position,
        size: collider.size,
        colliderQuaternion: collider.quaternion,
        render: false,
        absoluteY: true,
        cameraOccluder: false,
        entranceBuildingId: entry.id,
        entranceColliderRole: collider.role,
      });
    }
  }

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
  (item) => item.kind === 'backdrop'
    && (item.id.startsWith('fifty-seventh-n-central-') || item.id === 'navarro-flats-b'),
);

export const ALLEY_LINES = [
  { x: 130, z: 116, yaw: 0, length: 7 },
  { x: 145, z: 113, yaw: 0.4, length: 6 },
  { x: -60, z: 120, yaw: Math.PI / 2, length: 6 },
  { x: -60.5, z: 150, yaw: Math.PI / 2, length: 7 },
  { x: 190, z: 150, yaw: 0.2, length: 6 },
  { x: 122, z: 146, yaw: 1.2, length: 7 },
];
