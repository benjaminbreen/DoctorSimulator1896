import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { doorWorld } from '../src/world/facade.js';
import { streetItems } from '../src/world/streetGrid.js';

function loadBlueprint(id) {
  return JSON.parse(readFileSync(new URL(`../src/world/${id}.blueprint.json`, import.meta.url), 'utf8'));
}

const park = loadBlueprint('central-park');
const foyer = loadBlueprint('foyer');
const officeBuilding = streetItems.find((item) => item.id === 'cps-south-b-7');

test('the office lobby entrance is anchored to the tall gray building west of the Plaza', () => {
  assert.ok(officeBuilding, 'office building exists in the Central Park South frontage');
  const plaza = streetItems.find((item) => item.id === 'plaza-hotel-1890');
  assert.ok(officeBuilding.position[0] < plaza.position[0], 'office building is west of the Plaza');
  assert.ok(officeBuilding.size[1] > plaza.size[1], 'office building is taller than the Plaza');

  const entrance = park.transitions.find((transition) => transition.id === 'to-foyer');
  const doorway = doorWorld(officeBuilding, 1.3);
  assert.equal(entrance.label, 'Enter the lobby of your building');
  assert.ok(Math.hypot(
    entrance.position[0] - doorway.x,
    entrance.position[1] - doorway.z,
  ) < 0.1, 'entrance trigger sits at the visible street door');
});

test('leaving the lobby returns outside that doorway without retriggering it', () => {
  const entrance = park.transitions.find((transition) => transition.id === 'to-foyer');
  const exit = foyer.transitions.find((transition) => transition.id === 'to-park');
  const outside = doorWorld(officeBuilding, 3.0);
  const [x, , z] = exit.to.spawn;

  assert.ok(Math.hypot(x - outside.x, z - outside.z) < 0.1, 'lobby exit lands outside the office door');
  assert.deepEqual(exit.to.facing, [outside.normal[0], 0, outside.normal[2]]);
  assert.ok(
    Math.hypot(x - entrance.position[0], z - entrance.position[1]) > entrance.radius,
    'arrival stands clear of the entrance trigger',
  );
});
