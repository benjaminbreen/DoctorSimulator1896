// Scattered ground cover for the park: grass tufts and low shrubs, planted
// off the terrain masks that shape the ground, so the planting follows the
// land instead of sitting on top of it. Deterministic.
//
// This lives apart from centralPark.js because terrain.js imports that module
// for the pond and path outlines; scattering needs the terrain functions, so
// it has to sit downstream of both.

import { parkProp } from './parkCatalog.js';
import { modelSize } from './modelPacks.js';
import { WATER_LEVEL, GATE, PATHS } from './centralPark.js';
import { terrainHeight, pathsDistance, pondDepth } from './terrain.js';

// The park rectangle, inset so nothing straddles the perimeter railing.
const AREA = { minX: -96, maxX: 96, minZ: -81, maxZ: 81 };
// One candidate per 2.5m cell, jittered inside it.
const SPACING = 2.5;
// Walks stay clear: a tuft in the middle of the path reads as a bug.
const PATH_CLEARANCE = 1.9;
// Beds gather at this scale. Much larger and the park looks striped; much
// smaller and the clumping is lost against the spacing.
const CLUMP = 14;
// The lawn tufts get a finer grid of their own: they are what makes the
// lawn read grown rather than textured, so they need real density.
const TUFT_SPACING = 1.7;

// Pieces of the Shapespark plants kit, as the converter named them.
const GRASS = ['shapespark_plants__Grass-01_23', 'shapespark_plants__Grass-02_24', 'shapespark_plants__Grass-03_25'];
const CLOVER = ['shapespark_plants__Clover-01_18', 'shapespark_plants__Clover-03_20', 'shapespark_plants__Clover-05_22'];
const FLOWERS = ['shapespark_plants__Flowers-01_28', 'shapespark_plants__Flowers-02_26', 'shapespark_plants__Flowers-03_29'];
const BUSHES = ['shapespark_plants__Bush-01_13', 'shapespark_plants__Bush-02_14', 'shapespark_plants__Bush-03_15'];
const MEADOW_GRASS = 'meadow_grass';
// Period shrubs baked by scripts/models/build-park-trees.mjs.
const PRIVET = 'park-shrub-privet-0';
const SPIREA = 'park-shrub-spirea-0';
const SUMAC = 'park-shrub-sumac-0';
const KNOTWEED = 'park-shrub-knotweed-0';
const SHRUBS = [PRIVET, SPIREA, SUMAC, KNOTWEED];

// The kit is authored for a garden visualiser, where a grass card is a 1.5m
// ornamental clump and a clover patch is nearly 2m across. A mown park lawn
// wants both much smaller; this is the base scale each piece is planted at,
// before the per-item jitter.
const BASE_SCALE = {
  [MEADOW_GRASS]: 1,
};
const DEFAULT_SCALE = { grass: 0.34, clover: 0.5, flowers: 0.45, bush: 1.0 };

function baseScale(model) {
  if (BASE_SCALE[model]) return BASE_SCALE[model];
  if (GRASS.includes(model)) return DEFAULT_SCALE.grass;
  if (CLOVER.includes(model)) return DEFAULT_SCALE.clover;
  if (FLOWERS.includes(model)) return DEFAULT_SCALE.flowers;
  if (SHRUBS.includes(model)) return 1;
  return DEFAULT_SCALE.bush;
}

// These multiply the leaf texture rather than replacing a flat colour, so
// they sit near white: a mid-tone green here turns every plant to a dark
// blot. The spread is what keeps a bed from reading as one object.
const FOLIAGE = ['#dfe7cf', '#d4ddc2', '#e8ecdb', '#cbd8b8'];
const MEADOW = ['#e6e2c4', '#dcd9bb', '#eeead0'];

function hash01(seed) {
  const value = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return value - Math.floor(value);
}

// Low-frequency bed mask in [0,1]. Planting is not evenly spread: it gathers
// where nobody mows and thins to nothing across the open lawn.
function clumping(x, z) {
  const cx = Math.floor(x / CLUMP);
  const cz = Math.floor(z / CLUMP);
  return hash01(cx * 17.3 + cz * 41.7);
}

// Where the keeper's planting is: the same test speciesAt uses to put shrubs
// down, so what he objects to is what is actually growing there.
export function inPlantedBed(x, z) {
  return clumping(x, z) > 0.72 && pathsDistance(x, z) > 9 && pondDepth(x, z) > 0;
}

function pick(palette, roll) {
  return palette[Math.floor(roll * palette.length) % palette.length];
}

// Which piece belongs at a spot, or null to leave it bare.
function speciesAt(x, z, roll, bed, variant) {
  // The pond bank: rough meadow grass in the first few metres of dry land.
  const bank = pondDepth(x, z);
  if (bank > 0 && bank < 0.45) return roll < 0.6 ? MEADOW_GRASS : null;

  const fromPath = pathsDistance(x, z);
  // A mown lawn is mostly bare. Planting gathers on the verges, where the
  // mower and the walkers stop, and in the beds the clump mask picks out.
  const verge = fromPath < 7 ? 0.34 : 0.09;
  const chance = verge + bed * bed * 0.5;
  if (roll > chance) return null;

  // Shrubs only where the bed mask is strong and a walk is not close: a
  // planted bed, rather than bushes sprinkled evenly over the grass.
  if (bed > 0.72 && fromPath > 9) {
    if (roll < chance * 0.06) return SPIREA;
    if (roll < chance * 0.14) return PRIVET;
    if (roll < chance * 0.34) return pick(BUSHES, variant);
    if (roll < chance * 0.42) return pick(FLOWERS, variant);
  }
  // Clover is a flat decal a few centimetres tall. Useful for breaking up the
  // ground texture, but it reads as a stain if there is much of it, so grass
  // takes most of the lawn.
  return roll < chance * 0.82 ? pick(GRASS, variant) : pick(CLOVER, variant);
}

const LAWN_GRASS = ['#b2c290', '#a8ba88', '#bccb9c'];

function tintFor(model, roll) {
  if (GRASS.includes(model)) return pick(LAWN_GRASS, roll);
  return model === MEADOW_GRASS ? pick(MEADOW, roll) : pick(FOLIAGE, roll);
}

// Tufts run a short ramp instead of a palette pick, so neighbouring clumps
// shade into one another rather than sorting into three visible kinds.
// Matched to the Grass001 lawn texture, which is darker and greener than
// the turf these were first tuned against.
const TUFT_LIGHT = [0xb4, 0xc4, 0x8c];
const TUFT_DARK = [0x86, 0xa2, 0x66];

function tuftTint(tone) {
  const hex = TUFT_LIGHT.map((light, channel) =>
    Math.round(light + (TUFT_DARK[channel] - light) * tone).toString(16).padStart(2, '0'));
  return `#${hex.join('')}`;
}

// Tuft density in [0,1]: rough meadow at the pond bank, fuller along the
// verges and in the beds, but never zero on the open lawn.
function tuftChance(x, z, bed) {
  const bank = pondDepth(x, z);
  if (bank > 0 && bank < 0.45) return .38+bed*.25;
  const verge = pathsDistance(x, z) < 7 ? 0.3 : 0.16;
  return verge + bed * bed * 0.45;
}

// `tuftAmount` multiplies the planting chance, `tuftSize` the clump scale.
// Both come from the tuning panel; 1 is the authored look.
export function buildGroundCover({ tuftAmount = 1, tuftSize = 1 } = {}) {
  const items = [];
  let index = 0;
  for (let gx = AREA.minX; gx <= AREA.maxX; gx += SPACING) {
    for (let gz = AREA.minZ; gz <= AREA.maxZ; gz += SPACING) {
      index += 1;
      const x = gx + (hash01(index * 1.7) - 0.5) * SPACING;
      const z = gz + (hash01(index * 3.3 + 11) - 0.5) * SPACING;

      if (pondDepth(x, z) <= 0) continue;
      if (terrainHeight(x, z) <= WATER_LEVEL + 0.15) continue;
      if (pathsDistance(x, z) < PATH_CLEARANCE) continue;
      // Grand Army Plaza is paved to its easing edge.
      if (Math.hypot(x - GATE.x, z - GATE.z) < GATE.flat + 3) continue;

      const model = speciesAt(x, z, hash01(index * 7.9 + 5), clumping(x, z), hash01(index * 9.1 + 7));
      if (!model) continue;

      // Size has to stay the model's own measurement times the scale, or the
      // pack test catches the drift.
      const scale = baseScale(model) * (0.75 + hash01(index * 13.1 + 2) * 0.6);
      const item = parkProp(`cover-${index}`, model, x, z, hash01(index * 2.3) * Math.PI * 2, {
        collider: false,
      });
      item.modelScale = scale;
      item.wind = true;
      // Small cover neither casts shadows nor draws at distance: a knee-high
      // card is subpixel long before 95m, and its shadow never showed.
      if (model === MEADOW_GRASS || GRASS.includes(model) || CLOVER.includes(model) || FLOWERS.includes(model)) {
        item.shadow = false;
        item.far = 55;
      }
      item.size = modelSize(model).map((value) => value * scale);
      item.color = tintFor(model, hash01(index * 5.9 + 3));
      items.push(item);
    }
  }

  // Lawn tufts on their own finer grid. The pieces above are set dressing;
  // this is the layer that keeps the lawn from reading bare — one clump
  // model instanced a couple of thousand times, tone driving both the tint
  // and the shape so no two neighbours match.
  for (let gx = AREA.minX; gx <= AREA.maxX; gx += TUFT_SPACING) {
    for (let gz = AREA.minZ; gz <= AREA.maxZ; gz += TUFT_SPACING) {
      index += 1;
      const x = gx + (hash01(index * 4.7 + 23) - 0.5) * TUFT_SPACING;
      const z = gz + (hash01(index * 6.1 + 31) - 0.5) * TUFT_SPACING;

      if (pondDepth(x, z) <= 0) continue;
      if (terrainHeight(x, z) <= WATER_LEVEL + 0.15) continue;
      if (pathsDistance(x, z) < PATH_CLEARANCE) continue;
      if (Math.hypot(x - GATE.x, z - GATE.z) < GATE.flat + 3) continue;
      if (hash01(index * 8.3 + 13) > tuftChance(x, z, clumping(x, z)) * tuftAmount) continue;

      const tone = hash01(index * 11.7 + 41);
      const base = (0.5 + hash01(index * 14.9 + 3) * 0.45) * tuftSize;
      // Strong-tone clumps grow wider faster than they grow tall, like a
      // tuft spreading where nothing tramples it.
      const spread = base * (0.8 + tone * 0.4)*.8;
      const rise = base * (0.55 + tone * 0.4)*.7;
      const item = parkProp(`tuft-${index}`, MEADOW_GRASS, x, z, hash01(index * 3.9 + 17) * Math.PI * 2, {
        collider: false,
        // Sunk a touch so a clump base never hangs off a grade.
        y: -0.03,
      });
      item.modelScale = [spread, rise, spread];
      item.wind = true;
      item.shadow = false;
      // Ankle-high: gone from view well inside 90m, so stop paying for it.
      item.far = 42;
      item.size = modelSize(MEADOW_GRASS).map((value, axis) => value * item.modelScale[axis]);
      item.color = tuftTint(tone);
      items.push(item);
    }
  }
  plantShrubMasses(items);
  return items;
}

// Authored shrub masses, after Peet (1903): privet at the Plaza entrance,
// knotweed and spirea along the Pond walks, sumac clumps on the rough edges,
// and the Dairy's lilacs, shadbush and hydrangea (drawn as privet and spirea).
function plantShrubMasses(items) {
  let n = 0;
  const clump = (model, cx, cz, count, radius) => {
    for (let k = 0, left = count; k < count * 4 && left > 0; k += 1) {
      n += 1;
      const seed = cx * 3.1 + cz * 5.3 + k * 7.7;
      const angle = hash01(seed) * Math.PI * 2;
      const r = Math.sqrt(hash01(seed + 1)) * radius;
      const x = cx + Math.cos(angle) * r;
      const z = cz + Math.sin(angle) * r;
      if (pondDepth(x, z) < 0.3 || terrainHeight(x, z) <= WATER_LEVEL + 0.15) continue;
      if (pathsDistance(x, z) < PATH_CLEARANCE + 0.6) continue;
      if (Math.hypot(x - GATE.x, z - GATE.z) < GATE.flat + 2) continue;
      const scale = 0.8 + hash01(seed + 2) * 0.45;
      const item = parkProp(`shrub-${n}`, model, x, z, hash01(seed + 3) * Math.PI * 2, { collider: false });
      item.modelScale = scale;
      item.wind = true;
      item.far = 80;
      item.size = modelSize(model).map((value) => value * scale);
      item.color = pick(FOLIAGE, hash01(seed + 4));
      items.push(item);
      left -= 1;
    }
  };
  // Privet banks either side of the Scholars' Gate entrance. The lawn by the
  // Pond at about (70..75, 56..57) is left open: two posted pedestrians sit
  // and lie there (pedestrianCatalog.js).
  for (const [x, z] of [[72, 74], [64, 76], [81, 61], [88, 50], [90, 40]]) clump(PRIVET, x, z, 4, 3);
  // Along the dry side of the Pond walk and north walk.
  for (const path of [PATHS[2], PATHS[3]]) {
    for (let i = 1; i + 1 < path.points.length; i += 2) {
      const [x, z] = path.points[i];
      const [px, pz] = path.points[i - 1];
      const [qx, qz] = path.points[i + 1];
      const length = Math.hypot(qx - px, qz - pz) || 1;
      const [nx, nz] = [-(qz - pz) / length, (qx - px) / length];
      const offset = path.width / 2 + 3.5;
      const side = pondDepth(x + nx * offset, z + nz * offset) > pondDepth(x - nx * offset, z - nz * offset) ? 1 : -1;
      clump(hash01(i * 3.1) < 0.6 ? KNOTWEED : SPIREA, x + nx * side * offset, z + nz * side * offset, 3, 2.5);
    }
  }
  for (const [x, z] of [[62, 36], [-62, -12], [-40, 2], [-84, 10], [88, -14], [-88, 70], [30, 74]]) clump(SUMAC, x, z, 3, 3);
  for (const [x, z, model] of [[22, -40, PRIVET], [38, -41, SPIREA], [36, -56, PRIVET], [20, -55, SPIREA], [27, -38, SPIREA]]) clump(model, x, z, 3, 2.5);
}

export const groundCoverItems = buildGroundCover();

// Ambient insects use the same authored flower positions as the rendered
// cover. Keeping these items public prevents the two layers drifting apart.
export const floweringCoverItems = groundCoverItems.filter((item) => FLOWERS.includes(item.model));
