import test from 'node:test';
import assert from 'node:assert/strict';
import { LatheGeometry, Vector2 } from 'three';
import { createAssetRecipe } from '../src/world/proceduralAssets.js';
import { propList } from '../src/world/propCatalog.js';

const row = propList().find((entry) => entry.family === 'labeled-bottle-proof');

function finiteAttribute(attribute) {
  for (let index = 0; index < attribute.array.length; index += 1) {
    if (!Number.isFinite(attribute.array[index])) return false;
  }
  return true;
}

test('bottle lathe profiles produce finite geometry at default settings', () => {
  const [bottle] = row.build('geometry-proof', [0, 0, 0], createAssetRecipe(row));
  const lathed = bottle.parts.filter((part) => part.shape === 'lathe');
  assert.equal(lathed.length, 3);

  for (const part of lathed) {
    assert.equal(part.profile[0][0], 0, `${part.sculptPart} begins on its axis`);
    assert.equal(part.profile.at(-1)[0], 0, `${part.sculptPart} closes on its axis`);
    const geometry = new LatheGeometry(
      part.profile.map(([radius, height]) => new Vector2(radius, height)),
      part.radialSegments,
    );
    assert.ok(finiteAttribute(geometry.getAttribute('position')), `${part.sculptPart} positions`);
    assert.ok(finiteAttribute(geometry.getAttribute('normal')), `${part.sculptPart} normals`);
    assert.ok(
      geometry.getAttribute('position').count >= part.radialSegments * 6,
      `${part.sculptPart} resolution`,
    );
    geometry.dispose();
  }
});

test('bottle recipe extrema keep every radial profile valid', () => {
  const scenarios = [
    { height: 0.1, radius: 0.025, neckRatio: 0.34, wallThickness: 0.004, liquidLevel: 0.92 },
    { height: 0.28, radius: 0.065, neckRatio: 0.66, wallThickness: 0.001, liquidLevel: 0.1 },
  ];
  for (const values of scenarios) {
    const recipe = createAssetRecipe(row, { values });
    const [bottle] = row.build('geometry-extreme', [0, 0, 0], recipe);
    for (const part of bottle.parts.filter((candidate) => candidate.profile)) {
      assert.ok(part.profile.every(([radius, height]) => radius >= 0 && Number.isFinite(height)));
    }
  }
});
