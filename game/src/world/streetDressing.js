// A restrained, authored layer of flags and signs for the Fifth Avenue
// district. Placements are tied to stable building ids and facade anchors so
// they survive ordinary block-layout tuning without becoming random clutter.

import {
  facadeEntranceLayout,
  facadeLayoutForFace,
  facadeWidth,
  FACES,
} from './facade.js';
import { streetItems, WALK_TOP } from './streetGrid.js';

export const STREET_DRESSING_BUDGET = Object.freeze({
  flags: 3,
  signRecords: 20,
  signFaces: 26,
  renderBatches: 4,
  triangles: 3000,
});

// Six staggered rows of eight and seven stars make 45. The flag texture is
// drawn locally in scene/DistrictFlags.jsx, so it introduces no redistributable
// third-party asset and all three cloth instances share one map.
export const FLAG_SITES = Object.freeze([
  Object.freeze({
    id: 'new-netherland-national-flag',
    buildingId: 'hotel-new-netherland',
    // The smaller Fifth Avenue roof pavilion, separate from the existing red
    // and gold pennant on the rounded corner turret.
    localPosition: [-9.75, 13.25, -8.1],
    yaw: -0.56,
    size: [3.45, 1.82],
    phase: 0.35,
    sourceStatus: 'inferred-selective-placement',
  }),
  Object.freeze({
    id: 'savoy-national-flag',
    buildingId: 'hotel-savoy',
    // Apex of the Savoy corner turret built in GildedAgeLandmarks.
    localPosition: [-7.254, 20.08, -5.092],
    yaw: -0.48,
    size: [3.25, 1.71],
    phase: 2.4,
    sourceStatus: 'inferred-selective-placement',
  }),
  Object.freeze({
    id: 'metropolitan-club-national-flag',
    buildingId: 'metropolitan-club',
    // Centre finial of the clubhouse's copper roof.
    localPosition: [-2.175, 10.55, 0],
    yaw: -0.62,
    size: [3.05, 1.61],
    phase: 4.65,
    sourceStatus: 'inferred-selective-placement',
  }),
]);

// Pixel cells in the one 1024x512 atlas. The renderer samples an inset inside
// each cell, leaving an eight-pixel gutter so distant mip levels do not bleed
// neighbouring lettering into one another.
export const SIGN_ATLAS_ENTRIES = Object.freeze({
  'hotel-new-netherland': Object.freeze({ rect: [0, 0, 512, 128], lines: ['HOTEL NEW NETHERLAND'], style: 'hotel' }),
  'hotel-savoy': Object.freeze({ rect: [512, 0, 512, 128], lines: ['HOTEL SAVOY'], style: 'hotel-light' }),
  'street-fifth': Object.freeze({ rect: [0, 128, 256, 128], lines: ['5TH AVE'], style: 'street' }),
  'street-sixtieth': Object.freeze({ rect: [256, 128, 256, 128], lines: ['E. 60TH ST'], style: 'street' }),
  'street-fifty-ninth': Object.freeze({ rect: [512, 128, 256, 128], lines: ['E. 59TH ST'], style: 'street' }),
  'street-fifty-eighth': Object.freeze({ rect: [768, 128, 256, 128], lines: ['E. 58TH ST'], style: 'street' }),
  'to-let': Object.freeze({ rect: [0, 256, 256, 128], lines: ['TO LET'], style: 'paper' }),
  physician: Object.freeze({ rect: [256, 256, 256, 128], lines: ['PHYSICIAN', 'HOURS 2–4'], style: 'brass' }),
  architect: Object.freeze({ rect: [512, 256, 256, 128], lines: ['ARCHITECT', 'OFFICE'], style: 'brass' }),
  society: Object.freeze({ rect: [768, 256, 256, 128], lines: ['SOCIETY', 'ROOMS'], style: 'painted' }),
  'metropolitan-club': Object.freeze({ rect: [0, 384, 512, 128], lines: ['METROPOLITAN CLUB'], style: 'brass' }),
  deliveries: Object.freeze({ rect: [512, 384, 256, 128], lines: ['DELIVERIES'], style: 'painted' }),
  'house-12': Object.freeze({ rect: [768, 384, 128, 128], lines: ['12'], style: 'number' }),
  'house-16': Object.freeze({ rect: [896, 384, 128, 128], lines: ['16'], style: 'number' }),
});

export const STREET_SIGN_POSTS = Object.freeze([
  Object.freeze({
    id: 'fifth-and-sixtieth-signpost',
    position: [108.25, WALK_TOP, 50.25],
    blades: Object.freeze([
      Object.freeze({ id: 'fifth-at-sixtieth', atlasKey: 'street-fifth', yaw: 0, height: 3.12 }),
      Object.freeze({ id: 'sixtieth-at-fifth', atlasKey: 'street-sixtieth', yaw: Math.PI / 2, height: 2.68 }),
    ]),
  }),
  Object.freeze({
    id: 'fifth-and-fifty-ninth-signpost',
    position: [108.25, WALK_TOP, 97.55],
    blades: Object.freeze([
      Object.freeze({ id: 'fifth-at-fifty-ninth', atlasKey: 'street-fifth', yaw: 0, height: 3.12 }),
      Object.freeze({ id: 'fifty-ninth-at-fifth', atlasKey: 'street-fifty-ninth', yaw: Math.PI / 2, height: 2.68 }),
    ]),
  }),
  Object.freeze({
    id: 'fifth-and-fifty-eighth-signpost',
    position: [109.15, WALK_TOP, 128.25],
    blades: Object.freeze([
      Object.freeze({ id: 'fifth-at-fifty-eighth', atlasKey: 'street-fifth', yaw: 0, height: 3.12 }),
      Object.freeze({ id: 'fifty-eighth-at-fifth', atlasKey: 'street-fifty-eighth', yaw: Math.PI / 2, height: 2.68 }),
    ]),
  }),
]);

const STREET_BLADE_SITES = STREET_SIGN_POSTS.flatMap((post) => post.blades.map((blade) => Object.freeze({
  ...blade,
  kind: 'street-blade',
  anchor: 'absolute',
  position: [post.position[0], post.position[1] + blade.height, post.position[2]],
  size: [1.72, 0.36],
  doubleSided: true,
  sourceStatus: 'location-appropriate-inference',
})));

export const SIGN_SITES = Object.freeze([
  ...STREET_BLADE_SITES,
  Object.freeze({
    id: 'new-netherland-roof-sign', kind: 'hotel', atlasKey: 'hotel-new-netherland',
    anchor: 'building-local', buildingId: 'hotel-new-netherland',
    localPosition: [-7.99, 14.62, -1.85], yaw: -Math.PI / 2, size: [6.4, 1.25],
    sourceStatus: 'building-identity',
  }),
  Object.freeze({
    id: 'savoy-portico-sign', kind: 'hotel', atlasKey: 'hotel-savoy',
    anchor: 'building-local', buildingId: 'hotel-savoy',
    localPosition: [-12.04, -10.98, -3.216], yaw: -Math.PI / 2, size: [4.65, 0.72],
    sourceStatus: 'building-identity',
  }),
  Object.freeze({
    id: 'cps-apartment-to-let', kind: 'to-let', atlasKey: 'to-let',
    anchor: 'window', buildingId: 'cps-south-b-1', face: '-z', floor: 1, col: 2,
    size: [0.86, 0.44], sourceStatus: 'photograph-supported-type',
  }),
  Object.freeze({
    id: 'savoy-east-to-let', kind: 'to-let', atlasKey: 'to-let',
    anchor: 'window', buildingId: 'cps-savoy-east-0', face: '-z', floor: 0, col: 2,
    size: [0.86, 0.44], sourceStatus: 'photograph-supported-type',
  }),
  Object.freeze({
    id: 'fifty-eighth-mansion-to-let', kind: 'to-let', atlasKey: 'to-let',
    anchor: 'window', buildingId: 'fifty-eighth-s-central-3', face: '-z', floor: 0, col: 3,
    size: [0.82, 0.42], sourceStatus: 'photograph-supported-type',
  }),
  Object.freeze({
    id: 'fifth-avenue-physician-plaque', kind: 'plaque', atlasKey: 'physician',
    anchor: 'entrance', buildingId: 'fifth-east-a-0', side: 1, height: 1.5,
    size: [0.72, 0.42], sourceStatus: 'location-appropriate-inference',
  }),
  Object.freeze({
    id: 'fifth-avenue-architect-plaque', kind: 'plaque', atlasKey: 'architect',
    anchor: 'entrance', buildingId: 'fifth-east-a-2', side: -1, height: 1.5,
    size: [0.68, 0.4], sourceStatus: 'location-appropriate-inference',
  }),
  Object.freeze({
    id: 'side-street-society-plaque', kind: 'plaque', atlasKey: 'society',
    anchor: 'entrance', buildingId: 'fifty-seventh-n-central-1', side: -1, height: 1.45,
    size: [0.62, 0.44], sourceStatus: 'location-appropriate-inference',
  }),
  Object.freeze({
    id: 'metropolitan-club-plaque', kind: 'plaque', atlasKey: 'metropolitan-club',
    anchor: 'building-local', buildingId: 'metropolitan-club',
    localPosition: [-10.88, -5.95, 2.25], yaw: -Math.PI / 2, size: [1.42, 0.48],
    sourceStatus: 'building-identity',
  }),
  Object.freeze({
    id: 'new-netherland-deliveries', kind: 'service', atlasKey: 'deliveries',
    anchor: 'building-local', buildingId: 'hotel-new-netherland',
    localPosition: [2.25, -15.55, 10.05], yaw: 0, size: [1.15, 0.36],
    sourceStatus: 'location-appropriate-inference',
  }),
  Object.freeze({
    id: 'side-street-house-number-12', kind: 'number', atlasKey: 'house-12',
    anchor: 'entrance', buildingId: 'fifty-seventh-n-central-1', side: 0, height: 2.8,
    size: [0.3, 0.3], sourceStatus: 'atmospheric-number',
  }),
  Object.freeze({
    id: 'side-street-house-number-16', kind: 'number', atlasKey: 'house-16',
    anchor: 'entrance', buildingId: 'fifty-seventh-n-central-3', side: 0, height: 2.75,
    size: [0.3, 0.3], sourceStatus: 'atmospheric-number',
  }),
]);

function rotateLocal([x, y, z], yaw) {
  const cos = Math.cos(yaw);
  const sin = Math.sin(yaw);
  return [x * cos + z * sin, y, -x * sin + z * cos];
}

function buildingLocalToWorld(building, localPosition) {
  const local = rotateLocal(localPosition, building.yaw ?? 0);
  return [
    building.position[0] + local[0],
    building.position[1] + local[1],
    building.position[2] + local[2],
  ];
}

function facadePoint(building, token, along, worldY, outset = 0.08) {
  const face = FACES[token];
  if (!face) throw new Error(`Unknown facade face '${token}' for ${building.id}`);
  const halfDepth = face.normal[2] !== 0 ? building.size[2] / 2 : building.size[0] / 2;
  const local = [
    face.right[0] * along + face.normal[0] * (halfDepth + outset),
    worldY - building.position[1],
    face.right[2] * along + face.normal[2] * (halfDepth + outset),
  ];
  return {
    position: buildingLocalToWorld(building, local),
    yaw: face.yaw + (building.yaw ?? 0),
  };
}

function resolveWindowAnchor(site, building) {
  const layout = facadeLayoutForFace(building, site.face);
  const opening = layout.upper.find((entry) => entry.floor === site.floor && entry.col === site.col);
  if (!opening) throw new Error(`Missing window ${site.floor}:${site.col} on ${site.buildingId}`);
  const u = (opening.x + opening.w / 2) / layout.texW;
  const along = (u - 0.5) * facadeWidth(building.size, site.face);
  const worldY = building.position[1] + building.size[1] / 2
    - ((opening.y + opening.h / 2) / layout.texH) * building.size[1];
  return facadePoint(building, site.face, along, worldY, 0.1);
}

function resolveEntranceAnchor(site, building) {
  const entrance = facadeEntranceLayout(building);
  if (!entrance) throw new Error(`Missing entrance on ${site.buildingId}`);
  const side = site.side ?? 0;
  const along = (entrance.u - 0.5) * entrance.faceWidth
    + side * (entrance.doorWidth / 2 + (site.gap ?? 0.32));
  const worldY = entrance.baseY + entrance.rise + site.height;
  return facadePoint(building, entrance.token, along, worldY, 0.14);
}

function resolveSign(site, buildings) {
  if (site.anchor === 'absolute') return { ...site, position: [...site.position] };
  const building = buildings.get(site.buildingId);
  if (!building) throw new Error(`Street dressing references missing building '${site.buildingId}'`);
  if (site.anchor === 'building-local') {
    return {
      ...site,
      position: buildingLocalToWorld(building, site.localPosition),
      yaw: site.yaw + (building.yaw ?? 0),
    };
  }
  const anchor = site.anchor === 'window'
    ? resolveWindowAnchor(site, building)
    : resolveEntranceAnchor(site, building);
  return { ...site, ...anchor };
}

export function resolveStreetDressing(items = streetItems) {
  const buildings = new Map(items.filter((item) => item.kind === 'backdrop').map((item) => [item.id, item]));
  const flags = FLAG_SITES.map((site) => {
    const building = buildings.get(site.buildingId);
    if (!building) throw new Error(`Flag references missing building '${site.buildingId}'`);
    return {
      ...site,
      position: buildingLocalToWorld(building, site.localPosition),
      yaw: site.yaw + (building.yaw ?? 0),
    };
  });
  const signs = SIGN_SITES.flatMap((site) => {
    const resolved = resolveSign(site, buildings);
    if (!site.doubleSided) return [resolved];
    return [
      { ...resolved, id: `${site.id}-front` },
      { ...resolved, id: `${site.id}-back`, yaw: resolved.yaw + Math.PI },
    ];
  });
  const supports = STREET_SIGN_POSTS.map((post) => ({
    id: post.id,
    position: [...post.position],
    height: 3.48,
  }));
  return { flags, signs, supports };
}

export const streetDressingLayout = resolveStreetDressing();
