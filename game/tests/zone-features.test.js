import test from 'node:test';
import assert from 'node:assert/strict';
import { zones } from '../src/world/zones.js';

// The scene-side registry (scene/ZoneFeatures.jsx) resolves these ids; the
// list itself lives with the zone so content stays in world data.
const KNOWN_FEATURES = [
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
];

test('zone feature lists are unique and known', () => {
  for (const [id, zone] of Object.entries(zones)) {
    const features = zone.features ?? [];
    assert.equal(new Set(features).size, features.length, `${id} features unique`);
    for (const feature of features) {
      assert.ok(KNOWN_FEATURES.includes(feature), `${id}: unknown feature '${feature}'`);
    }
  }
  assert.ok(zones['central-park'].features.length >= 6, 'the park carries its set dressing');
});
