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

// Height of the flame within a light fixture, as a fraction of its height.
// Gaslights are placed here rather than at the model origin so the glow comes
// from the burner, not the floor.
const FLAME_FRACTION = {
  Chandelier: 0.82,
  Sconce: 0.72,
  OilLamp: 0.72,
  SmallLamp: 0.74,
};

export function flameHeight(name) {
  const fraction = FLAME_FRACTION[name];
  if (fraction === undefined) return null;
  return modelSize(name)[1] * fraction;
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
