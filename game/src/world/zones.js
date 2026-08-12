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
import {
  parkItems,
  PARK_MOTION_AFFORDANCES,
  POND_OUTLINE,
  WATER_LEVEL,
} from './centralPark.js';
import { groundCoverItems, buildGroundCover } from './groundCover.js';
import { streetItems, INTERIOR_BUILDINGS } from './streetGrid.js';
import { generateInterior, interiorEntryTransitions, interiorZoneId } from './interiors.js';
import { bookcase, vaseOfFlowers, labeledBottle, reagentBottleRack, opiumPipe } from './furnishings.js';
import { labBench } from './instruments.js';
import { cattellLabItems } from './cattellLab.js';
import { lobbyItems } from './lobby.js';
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
      // The study behind the portière: a working bench under the sconce with
      // the dispensary glass turned label-out, shelving on the party wall,
      // and the pipe on the side table by the east wall.
      ...labBench('study-bench', -1.7, 8.9, 0, { length: 2.4 }),
      ...bookcase('bookcase-study', -0.33, 7.7, -Math.PI / 2, { height: 2.1, width: 1.7, depth: 0.35, seed: 7 }),
      ...reagentBottleRack('study-rack', -1.1, 0.9, 9.05, { columns: 5, seed: 23 }).map((item) => ({ ...item, yaw: Math.PI })),
      ...labeledBottle('study-bottle-a', -0.75, 0.9, 8.8, { labelText: 'LAUDANUM', liquid: '#5a2f14', height: 0.16 }).map((item) => ({ ...item, yaw: Math.PI })),
      ...labeledBottle('study-bottle-b', -1.55, 0.9, 8.75, { labelText: 'TINCTURE', liquid: '#7a6b3a', height: 0.13 }).map((item) => ({ ...item, yaw: Math.PI })),
      ...opiumPipe('study-pipe', -0.55, 1.059, 6.2, { yaw: -1.0 }).map((item) => ({
        ...item,
        // `group` lets the room copy hide while the ritual's working copy is
        // in the player's hand (the same trick the instruments use).
        affordance: { kind: 'act', verb: 'Smoke', name: 'the opium pipe', group: 'study-pipe' },
      })),
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
  // The shared office-building lobby: a street vestibule, porter station,
  // stone dado and rear elevator bank. It has no domestic window dressing.
  foyer: {
    blueprint: foyerBlueprint,
    lighting: foyerLighting,
    extraItems: lobbyItems(foyerBlueprint),
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
    motionAffordances: PARK_MOTION_AFFORDANCES,
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
      'horse-drawn-traffic',
      'pushcarts',
      'pigeon-flock',
      'bees',
      'butterflies',
      'fireflies',
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
