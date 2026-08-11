// Zone registry: every travel destination pairs a blueprint with a lighting
// config. Exterior zones can add authored layout items and a water body.

import consultingBlueprint from './consulting-office.blueprint.json' with { type: 'json' };
import consultingLighting from './consulting-office.lighting.json' with { type: 'json' };
import waitingBlueprint from './waiting-room.blueprint.json' with { type: 'json' };
import waitingLighting from './waiting-room.lighting.json' with { type: 'json' };
import foyerBlueprint from './foyer.blueprint.json' with { type: 'json' };
import foyerLighting from './foyer.lighting.json' with { type: 'json' };
import labBlueprint from './cattell-lab.blueprint.json' with { type: 'json' };
import labLighting from './cattell-lab.lighting.json' with { type: 'json' };
import parkBlueprint from './central-park.blueprint.json' with { type: 'json' };
import parkLighting from './central-park.lighting.json' with { type: 'json' };
import { parkItems, POND_OUTLINE, WATER_LEVEL } from './centralPark.js';
import { groundCoverItems, buildGroundCover } from './groundCover.js';
import { streetItems, INTERIOR_BUILDINGS } from './streetGrid.js';
import { generateInterior, interiorEntryTransitions, interiorZoneId } from './interiors.js';
import { bookcase, vaseOfFlowers } from './furnishings.js';
import { cattellLabItems } from './cattellLab.js';
import { blueprintMouldings, friezeBand, ceilingPanel } from './mouldings.js';

export const zones = {
  'consulting-office': {
    blueprint: consultingBlueprint,
    lighting: consultingLighting,
    // A consulting room is a working room: Venetian blinds and shades, not
    // the parlor's lace and drapery. `interior` here only dresses the
    // windows — no `building`, so the view stays the procedural sky.
    interior: { wealth: 'middling', role: 'office', seed: 41 },
    // The filled bookcase is built in code because its boards and books are
    // not worth hand-authoring as JSON. It stands against the west party wall
    // south of the chimney breast.
    extraItems: [
      ...bookcase('bookcase-west', -3.65, 3.1, Math.PI / 2, { height: 2.4, width: 2.2, depth: 0.4 }),
      ...blueprintMouldings(consultingBlueprint, {
        trim: consultingLighting.materials.trim,
        ceiling: consultingLighting.materials.ceiling,
      }),
      ...friezeBand(consultingBlueprint, {
        wall: consultingLighting.materials.wall,
        ceiling: consultingLighting.materials.ceiling,
      }),
      ...ceilingPanel(consultingBlueprint, { ceiling: consultingLighting.materials.ceiling, inset: 1.1 }),
    ],
  },
  // The room patients sit in is dressed to be seen: the full parlor layers.
  'waiting-room': {
    blueprint: waitingBlueprint,
    lighting: waitingLighting,
    interior: { wealth: 'grand', role: 'parlor', seed: 17 },
    // A room for show gets the dado as well. The vase stands on the centre
    // table: `Table_02` is 1.0588m to its top.
    extraItems: [
      ...vaseOfFlowers('vase', -0.22, 1.0588, 0.76, { count: 8, seed: 11 }),
      ...blueprintMouldings(waitingBlueprint, {
        trim: waitingLighting.materials.trim,
        ceiling: waitingLighting.materials.ceiling,
        dado: true,
      }),
      ...friezeBand(waitingBlueprint, {
        wall: waitingLighting.materials.wall,
        ceiling: waitingLighting.materials.ceiling,
      }),
      ...ceilingPanel(waitingBlueprint, { ceiling: waitingLighting.materials.ceiling, inset: 1.4 }),
    ],
  },
  // The old waiting room, kept as authored. It is far larger than a row
  // house room can be, which is what makes it read as a hall rather than a
  // parlor — so it stands as the entrance foyer instead of being retired.
  foyer: {
    blueprint: foyerBlueprint,
    lighting: foyerLighting,
    interior: { wealth: 'grand', role: 'parlor', seed: 17 },
    extraItems: [
      ...blueprintMouldings(foyerBlueprint, {
        trim: foyerLighting.materials.trim,
        ceiling: foyerLighting.materials.ceiling,
        dado: true,
      }),
      ...friezeBand(foyerBlueprint, {
        wall: foyerLighting.materials.wall,
        ceiling: foyerLighting.materials.ceiling,
      }),
      ...ceilingPanel(foyerBlueprint, { ceiling: foyerLighting.materials.ceiling, inset: 2.2 }),
    ],
  },
  // Cattell's laboratory. A working room, so the windows take plain shades
  // and nothing else, and the walls are distempered plaster rather than
  // paper: `role: 'service'` and no frieze.
  'cattell-lab': {
    blueprint: labBlueprint,
    lighting: labLighting,
    interior: { wealth: 'middling', role: 'service', seed: 7 },
    extraItems: cattellLabItems(labBlueprint, labLighting),
  },
  'central-park': {
    blueprint: parkBlueprint,
    lighting: parkLighting,
    extraItems: [...parkItems, ...streetItems, ...groundCoverItems],
    extraTransitions: interiorEntryTransitions(INTERIOR_BUILDINGS),
    water: { outline: POND_OUTLINE, level: WATER_LEVEL },
    // Set dressing, resolved by scene/ZoneFeatures.jsx.
    features: [
      'backdrop',
      'street-surfaces',
      'pedestrians',
      'gapstow-bridge',
      'schist-outcrops',
      'rustic-shelters',
      'dairy-cottage',
      'carousel',
      'checkers-tables',
      'horseless-carriage',
      'pushcarts',
    ],
  },
};

const interiorIndex = new Map(INTERIOR_BUILDINGS.map((building) => [interiorZoneId(building.id), building]));

// The park zone is rebuilt when the grass tuning moves, but cached per
// setting: GameCanvas memoises on zone identity, so a fresh object every
// call would re-derive the room every render.
let parkKey = '';
let parkZone = zones['central-park'];

function parkWithCover(values) {
  const key = `${values?.tuftAmount ?? 1}|${values?.tuftSize ?? 1}`;
  if (key !== parkKey) {
    parkKey = key;
    parkZone = {
      ...zones['central-park'],
      extraItems: [...parkItems, ...streetItems, ...buildGroundCover(values)],
    };
  }
  return parkZone;
}

// Static zones by id, or a generated interior. `values` feeds the interior
// scale/density tuning and the park's grass scatter; generation is
// deterministic per building.
export function getZone(id, values) {
  if (id === 'central-park') return parkWithCover(values);
  if (zones[id]) return zones[id];
  const building = interiorIndex.get(id);
  if (!building) return null;
  return generateInterior(building, values);
}
