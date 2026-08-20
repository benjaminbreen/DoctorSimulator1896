import test from 'node:test';
import assert from 'node:assert/strict';
import { stat } from 'node:fs/promises';
import {
  PEDESTRIAN_ARCHETYPES,
  PEDESTRIAN_LOD_ARCHETYPES,
  PEDESTRIAN_LOD_FILES,
} from '../src/world/pedestrianCatalog.js';
import { useFarPedestrianLod } from '../src/scene/pedestrianLod.js';

function publicModelUrl(path) {
  return new URL(`../public${path.split('?')[0]}`, import.meta.url);
}

test('pedestrian LOD uses hysteresis around the far boundary', () => {
  assert.equal(useFarPedestrianLod(false, 29 ** 2), false);
  assert.equal(useFarPedestrianLod(false, 31 ** 2), true);
  assert.equal(useFarPedestrianLod(true, 26 ** 2), true);
  assert.equal(useFarPedestrianLod(true, 24 ** 2), false);
});

test('every outdoor pedestrian archetype ships a smaller far mesh', async () => {
  assert.equal(PEDESTRIAN_LOD_ARCHETYPES.length, PEDESTRIAN_LOD_FILES.length);
  for (const [index, who] of PEDESTRIAN_LOD_ARCHETYPES.entries()) {
    const archetype = PEDESTRIAN_ARCHETYPES[who];
    assert.equal(archetype.lodModelPath, PEDESTRIAN_LOD_FILES[index]);
    const source = await stat(publicModelUrl(archetype.modelPath));
    const lod = await stat(publicModelUrl(archetype.lodModelPath));
    assert.ok(lod.size < source.size, `${who}: ${lod.size} >= ${source.size}`);
  }
});
