// Curated slot catalog for interiors. The generator asks for a semantic slot
// ("seating", "hearth") at a wealth tier and gets a model name; PropModels
// renders it. Most pieces come from the CGTrader Victorian pack, a few from
// the converted props pack — modelPacks resolves which.
//
// Every entry below was checked upright in a rendered contact sheet — the
// source pack mixes authoring orientations, so do not add a piece here
// without looking at it first (scripts/interiors/convert_victorian.py).

export { hasModel, modelSize } from './modelPacks.js';

import { hasModel, modelSize } from './modelPacks.js';

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


// Pieces light enough to shove, with a rough mass in kg. These get their own
// dynamic body; everything absent is anchored mass, because a wardrobe that
// drifts when you brush past it reads as broken rather than as physics.
// Lamps and fixtures stay anchored whatever they weigh: their flames and
// lights are separate props placed at build time and cannot follow them.
const LOOSE_MASS = {
  stool: 4,
  chair_small_01: 7,
  ChairSmall2: 7,
  chair_big_01: 13,
  Armchair02: 24,
  SmallTable02: 9,
  Table_02: 20,
};

export function looseMass(name) {
  return LOOSE_MASS[name] ?? null;
}

// Slab across the footprint on four legs inside the corners. `top` is where
// the slab starts as a fraction of the model's height.
function legged(top, leg = 0.12) {
  const offset = 0.5 - leg;
  const boxes = [{ c: [0, (top + 1) / 2, 0], s: [1, 1 - top, 1] }];
  for (const x of [-offset, offset]) {
    for (const z of [-offset, offset]) boxes.push({ c: [x, top / 2, z], s: [leg, top, leg] });
  }
  return boxes;
}

// Seat and back over the full footprint, a narrower block below for the legs.
// `seat` is the seat height as a fraction of the model's height, which for a
// chair measured to the top of its back is well under half.
function seated(seat) {
  return [
    { c: [0, (seat + 1) / 2, 0], s: [1, 1 - seat, 1] },
    { c: [0, seat / 2, 0], s: [0.62, seat, 0.62] },
  ];
}

// Compound colliders, as fractions of the model's own size with y measured up
// from its base. Only for pieces a single box gets badly wrong: you cannot
// stand at a table whose collider is solid to the floor.
const COMPOUND = {
  Table_01: legged(0.82),
  Table_02: legged(0.8),
  SmallTable02: legged(0.78),
  chair_small_01: seated(0.31),
  ChairSmall2: seated(0.35),
  chair_big_01: seated(0.33),
  Armchair02: seated(0.3),
};

// Boxes in metres relative to the model's floor contact point. Null when one
// box from the footprint will do.
export function modelColliders(name, scale = 1) {
  const spec = COMPOUND[name];
  if (!spec) return null;
  const [sx, sy, sz] = modelSize(name);
  return spec.map((box) => ({
    center: [box.c[0] * sx * scale, box.c[1] * sy * scale, box.c[2] * sz * scale],
    half: [(box.s[0] * sx * scale) / 2, (box.s[1] * sy * scale) / 2, (box.s[2] * sz * scale) / 2],
  }));
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
  // The carpet is listed twice so most rooms get it: it is a room-sized
  // Persian at 4.2 x 2.7m, where Rug01 is a long narrow runner.
  rug: {
    humble: [],
    middling: ['game_ready_carpet', 'Rug01', 'game_ready_carpet'],
    grand: ['game_ready_carpet', 'Rug01', 'game_ready_carpet'],
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
    middling: ['Bust_Pilar_01'],
    grand: ['Bust_Pilar_01'],
  },
  // Full-height shafts, only where there is height to carry them.
  column: {
    humble: [],
    middling: [],
    grand: ['Pilar_wooden', 'PilarConcrete'],
  },
  footstool: {
    humble: [],
    middling: ['stool'],
    grand: ['stool'],
  },
  // Carved bracket, used in pairs flanking the double-parlor arch.
  bracket: {
    humble: [],
    middling: ['Wooden_Detail_01'],
    grand: ['Wooden_Detail_01', 'ConcreteDecor'],
  },
  // Dado panelling below the chair rail, tiled along the party walls.
  wainscot: {
    humble: [],
    middling: [],
    grand: ['WoodenWallPanel'],
  },
  // Gallery railing around the atrium void.
  railing: {
    humble: [],
    middling: [],
    grand: ['Balustrade_Medium', 'Balustrade_Short'],
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
  // A floor globe on its stand: a study piece, so only the grand rooms get
  // one, and not all of them (see the roll in the generator).
  globe: {
    humble: [],
    middling: [],
    grand: ['explorers_globe'],
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
// Names are paths under public/textures/, so a surface can come from any
// converted set, not just the purchased pack.
const SURFACE_SETS = {
  humble: {
    walls: ['victorian/Plaster01_Damaged', 'victorian/Plaster01', 'victorian/Plaster02'],
    floors: ['victorian/WoodenFloor_02', 'victorian/WoodenFloor_01'],
  },
  middling: {
    walls: ['victorian/Plaster02', 'props/Wallpaper_Vintage', 'victorian/Plaster01'],
    floors: ['victorian/WoodenFloor_01', 'victorian/WoodenFloor_02'],
  },
  grand: {
    walls: ['victorian/Plaster03', 'props/Wallpaper_Vintage', 'victorian/Wooden_WallPanel'],
    floors: ['victorian/WoodenFloor_01', 'victorian/WoodenFloor_02'],
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
  `/textures/${name}_${kind}.jpg`;
