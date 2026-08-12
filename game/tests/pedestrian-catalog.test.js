import test from 'node:test';
import assert from 'node:assert/strict';
import {
  currentPedestrianCast,
  PEDESTRIAN_ARCHETYPES,
} from '../src/world/pedestrianCatalog.js';

test('the review catalog describes every current park pedestrian', () => {
  const cast = currentPedestrianCast();
  assert.equal(cast.length, 10);
  assert.equal(new Set(cast.map((entry) => entry.id)).size, cast.length);
  assert.deepEqual(new Set(cast.map((entry) => entry.archetype)), new Set(['m', 'w', 'd', 's', 'f']));
});

test('every current pedestrian action is valid for that rig', () => {
  for (const entry of currentPedestrianCast()) {
    const archetype = PEDESTRIAN_ARCHETYPES[entry.archetype];
    assert.ok(archetype, `missing archetype ${entry.archetype}`);
    assert.ok(archetype.animations.includes(entry.animation), `${entry.id}: ${entry.animation}`);
    assert.ok(entry.location);
  }
});
