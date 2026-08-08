// Curated slot catalog for the CGTrader Victorian pack. The interior
// generator asks for a semantic slot ("seating", "hearth") at a wealth tier
// and gets a model name; VictorianProps renders it.
//
// Every entry below was checked upright in a rendered contact sheet — the
// source pack mixes authoring orientations, so do not add a piece here
// without looking at it first (scripts/interiors/convert_victorian.py).

import manifest from '../../public/models/victorian/manifest.json' with { type: 'json' };

export const MODEL_URL = (name) => `/models/victorian/${name}.glb`;

// Real measured footprints, so colliders and spacing use true sizes. The
// converter recentres every piece horizontally with its base at y=0, so a
// placement position is simply the model's floor-contact point.
export function modelSize(name) {
  return manifest[name]?.size ?? [1, 1, 1];
}

// Where the burners actually sit inside each fixture, as fractions of the
// model's own size. A twin-armed sconce has two flames out at its shades,
// not one hovering between them, and a candelabra has a ring of them.
//
// `flames` are visible glows and cost nothing, so every burner gets one.
// `lights` are real lights and are expensive, so a chandelier pools its
// output into a single source at the centre while a sconce — whose shades
// are half a metre apart — gets one under each.
const CHANDELIER_RING = Array.from({ length: 6 }, (_, i) => {
  const angle = (i / 6) * Math.PI * 2;
  return [Math.cos(angle) * 0.36, 0.82, Math.sin(angle) * 0.36];
});

const FIXTURES = {
  Chandelier: { flames: CHANDELIER_RING, lights: [[0, 0.78, 0]] },
  Sconce: {
    flames: [[-0.33, 0.66, 0.1], [0.33, 0.66, 0.1]],
    lights: [[-0.33, 0.62, 0.12], [0.33, 0.62, 0.12]],
  },
  OilLamp: { flames: [[0, 0.72, 0]], lights: [[0, 0.7, 0]] },
  SmallLamp: { flames: [[0, 0.74, 0]], lights: [[0, 0.72, 0]] },
};

function scalePoints(name, points) {
  const [sx, sy, sz] = modelSize(name);
  return points.map(([x, y, z]) => [x * sx, y * sy, z * sz]);
}

export function fixtureBurners(name) {
  const spec = FIXTURES[name];
  if (!spec) return null;
  return { flames: scalePoints(name, spec.flames), lights: scalePoints(name, spec.lights) };
}

export function hasModel(name) {
  return Boolean(manifest[name]);
}

// Slots list candidates per wealth tier, richest pieces for grand rooms.
export const SLOTS = {
  seating: {
    humble: ['chair_small_01', 'ChairSmall2', 'stool'],
    middling: ['chair_big_01', 'chair_small_01', 'ChairSmall2'],
    grand: ['Armchair02', 'chair_big_01', 'chair_big_01'],
  },
  sideChair: {
    humble: ['stool', 'chair_small_01'],
    middling: ['chair_small_01', 'ChairSmall2'],
    grand: ['ChairSmall2', 'chair_small_01'],
  },
  centerTable: {
    humble: ['SmallTable02'],
    middling: ['Table_02', 'SmallTable02'],
    grand: ['Table_01', 'Table_02'],
  },
  sideTable: {
    humble: ['SmallTable02'],
    middling: ['SmallTable02', 'Table_02'],
    grand: ['SmallTable02', 'Table_02'],
  },
  hearth: {
    humble: ['Fireplace'],
    middling: ['Fireplace'],
    grand: ['Fireplace'],
  },
  rug: {
    humble: [],
    middling: ['Rug01'],
    grand: ['Rug01'],
  },
  storage: {
    humble: ['Bedside_Cabinet'],
    middling: ['Cabinet_Small', 'Bedside_Cabinet'],
    grand: ['Cabinet', 'Wardrobe_gothic'],
  },
  ceilingLight: {
    humble: [],
    middling: ['Chandelier'],
    grand: ['Chandelier'],
  },
  wallLight: {
    humble: [],
    middling: ['Sconce'],
    grand: ['Sconce'],
  },
  tableLamp: {
    humble: ['SmallLamp', 'OilLamp'],
    middling: ['OilLamp', 'SmallLamp'],
    grand: ['OilLamp', 'SmallLamp'],
  },
  // Painting2's texture is a modern portrait photo — excluded as anachronistic.
  wallDecor: {
    humble: [],
    middling: ['Painting'],
    grand: ['Painting'],
  },
  clock: {
    humble: [],
    middling: ['Clock'],
    grand: ['Clock'],
  },
  pedestal: {
    humble: [],
    middling: ['Pilar_wooden'],
    grand: ['Bust_Pilar_01', 'Pilar_wooden'],
  },
  radiator: {
    humble: ['Radiator'],
    middling: ['Radiator'],
    grand: ['Radiator'],
  },
  work: {
    humble: ['Sewing Machine'],
    middling: ['Sewing Machine'],
    grand: [],
  },
};

// Deterministic pick from a slot; returns null when the tier leaves it empty.
export function pickModel(slot, wealth, roll) {
  const options = (SLOTS[slot]?.[wealth] ?? []).filter(hasModel);
  if (options.length === 0) return null;
  return options[Math.floor(roll * options.length) % options.length];
}

// Wall and floor surfaces from the pack's seamless set. Each tier offers
// several, picked per building, so a row of parlors is not one wallpaper.
// Tints multiply the texture, which is what actually varies the papers.
const SURFACE_SETS = {
  humble: {
    walls: ['Plaster01_Damaged', 'Plaster01', 'Plaster02'],
    floors: ['WoodenFloor_02', 'WoodenFloor_01'],
  },
  middling: {
    walls: ['Plaster02', 'Plaster03', 'Plaster01'],
    floors: ['WoodenFloor_01', 'WoodenFloor_02'],
  },
  grand: {
    walls: ['Plaster03', 'Plaster02', 'Wooden_WallPanel'],
    floors: ['WoodenFloor_01', 'WoodenFloor_02'],
  },
};

export function pickSurfaces(wealth, wallRoll, floorRoll) {
  const set = SURFACE_SETS[wealth] ?? SURFACE_SETS.middling;
  return {
    wall: set.walls[Math.floor(wallRoll * set.walls.length) % set.walls.length],
    floor: set.floors[Math.floor(floorRoll * set.floors.length) % set.floors.length],
  };
}

export const surfaceUrl = (name, kind = 'AlbedoTransparency') =>
  `/textures/victorian/${name}_${kind}.jpg`;
