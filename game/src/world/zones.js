// Zone registry: every travel destination pairs a blueprint with a lighting
// config. Exterior zones can add authored layout items and a water body.

import consultingBlueprint from './consulting-office.blueprint.json';
import consultingLighting from './consulting-office.lighting.json';
import waitingBlueprint from './waiting-room.blueprint.json';
import waitingLighting from './waiting-room.lighting.json';
import parkBlueprint from './central-park.blueprint.json';
import parkLighting from './central-park.lighting.json';
import { parkItems, POND_OUTLINE, WATER_LEVEL } from './centralPark.js';
import { streetItems, INTERIOR_BUILDINGS } from './streetGrid.js';
import { generateInterior, interiorEntryTransitions, interiorZoneId } from './interiors.js';

export const zones = {
  'consulting-office': { blueprint: consultingBlueprint, lighting: consultingLighting },
  'waiting-room': { blueprint: waitingBlueprint, lighting: waitingLighting },
  'central-park': {
    blueprint: parkBlueprint,
    lighting: parkLighting,
    extraItems: [...parkItems, ...streetItems],
    extraTransitions: interiorEntryTransitions(INTERIOR_BUILDINGS),
    water: { outline: POND_OUTLINE, level: WATER_LEVEL },
  },
};

const interiorIndex = new Map(INTERIOR_BUILDINGS.map((building) => [interiorZoneId(building.id), building]));

// Static zones by id, or a generated interior. `values` feeds the interior
// scale/density tuning; generation is deterministic per building.
export function getZone(id, values) {
  if (zones[id]) return zones[id];
  const building = interiorIndex.get(id);
  if (!building) return null;
  return generateInterior(building, values);
}
