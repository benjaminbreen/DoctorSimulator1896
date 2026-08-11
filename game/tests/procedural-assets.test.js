import test from 'node:test';
import assert from 'node:assert/strict';
import { builtBounds, propList } from '../src/world/propCatalog.js';
import { LABEL_FONT_IDS } from '../src/world/labelFonts.js';
import {
  assetBuildStats,
  createAssetRecipe,
  createScatterRecipe,
  generateAssetVariants,
  generateScatterPlacements,
  setRecipeValue,
  setScatterValue,
  validateAssetRecipe,
  validateScatterRecipe,
  varyAssetRecipe,
} from '../src/world/proceduralAssets.js';

const editable = propList().filter((row) => row.family && row.schema);

function family(id) {
  return editable.find((row) => row.family === id);
}

test('the workbench exposes editable proof families', () => {
  assert.deepEqual(editable.map((row) => row.family), [
    'laboratory-bench',
    'bookcase',
    'folding-screen',
    'vase-of-flowers',
    'labeled-bottle-proof',
    'reagent-bottle-rack',
  ]);
});

test('laboratory bench keeps its construction and PBR surface editable', () => {
  const row = family('laboratory-bench');
  let recipe = createAssetRecipe(row);
  const defaultItems = row.build('bench', [0, 0, 0], recipe);
  const defaultBounds = builtBounds(defaultItems);

  assert.deepEqual(defaultBounds.size.map((value) => Number(value.toFixed(3))), [2.4, 0.9, 0.72]);
  assert.equal(defaultItems.filter((item) => item.sculptPart === 'worktop').length, 3);
  assert.ok(defaultItems.every((item) => item.id.startsWith('bench-')));
  assert.ok(defaultItems.some((item) => item.finish === 'laboratoryDeal'));
  assert.ok(defaultItems.some((item) => item.sculptPart === 'lower-shelf' && item.collider));
  assert.ok(!defaultItems.some((item) => item.sculptPart === 'fasteners'));

  recipe = setRecipeValue(row, recipe, 'plankCount', 6);
  recipe = setRecipeValue(row, recipe, 'rearApron', false);
  recipe = setRecipeValue(row, recipe, 'bolts', true);
  recipe = setRecipeValue(row, recipe, 'normalStrength', 0.7);
  recipe = setRecipeValue(row, recipe, 'textureIntensity', 1.8);
  const changed = row.build('bench', [0, 0, 0], recipe);
  assert.equal(changed.filter((item) => item.sculptPart === 'worktop').length, 6);
  assert.ok(!changed.some((item) => item.id.includes('apron-rear')));
  assert.equal(changed.filter((item) => item.sculptPart === 'fasteners').length, 8);
  assert.ok(changed.filter((item) => item.finish === 'laboratoryDeal').every((item) => item.normalStrength === 0.7));
  assert.ok(changed.filter((item) => item.finish === 'laboratoryDeal').every((item) => item.textureIntensity === 1.8));
});

test('default asset recipes are valid and deterministic', () => {
  for (const row of editable) {
    const recipe = createAssetRecipe(row);
    assert.deepEqual(validateAssetRecipe(row, recipe), [], row.family);
    assert.deepEqual(
      row.build('proof', [0, 0, 0], recipe),
      row.build('proof', [0, 0, 0], recipe),
      `${row.family} repeats exactly`,
    );
  }
});

test('recipe controls are bounded and change their family', () => {
  const bookcase = family('bookcase');
  const base = createAssetRecipe(bookcase);
  const narrow = setRecipeValue(bookcase, base, 'width', -10);
  const wide = setRecipeValue(bookcase, base, 'width', 99);
  assert.equal(narrow.values.width, 1);
  assert.equal(wide.values.width, 3.2);
  const narrowBounds = builtBounds(bookcase.build('narrow', [0, 0, 0], narrow));
  const wideBounds = builtBounds(bookcase.build('wide', [0, 0, 0], wide));
  assert.ok(wideBounds.size[0] > narrowBounds.size[0] + 2);

  const vase = family('vase-of-flowers');
  const few = setRecipeValue(vase, createAssetRecipe(vase), 'count', 3);
  const many = setRecipeValue(vase, few, 'count', 16);
  assert.ok(
    assetBuildStats(vase.build('many', [0, 0, 0], many)).parts
      > assetBuildStats(vase.build('few', [0, 0, 0], few)).parts,
  );
});

test('seeded shape variation is repeatable', () => {
  const row = family('folding-screen');
  const base = createAssetRecipe(row);
  const a = varyAssetRecipe(row, base, 4201);
  const b = varyAssetRecipe(row, base, 4201);
  const c = varyAssetRecipe(row, base, 4202);
  assert.deepEqual(a, b);
  assert.notDeepEqual(a.values, c.values);
  assert.equal(a.values.frame, base.values.frame, 'manual colours do not randomize');
});

test('label text and typeface are editable recipe data', () => {
  const row = family('labeled-bottle-proof');
  const base = createAssetRecipe(row);
  const typed = setRecipeValue(row, base, 'labelText', '  HARTLEY\n& SONS RESTORATIVE MIXTURE 1896 EXTRA  ');
  const bodoni = setRecipeValue(row, typed, 'labelFont', 'bodoni');
  const [bottle] = row.build('label-proof', [0, 0, 0], bodoni);
  const label = bottle.parts.find((part) => part.label)?.label;

  assert.equal(LABEL_FONT_IDS.length, 3);
  assert.equal(typed.values.labelText.length, 42);
  assert.ok(!typed.values.labelText.includes('\n'));
  assert.equal(label.text, typed.values.labelText);
  assert.equal(label.font, 'bodoni');
  assert.equal(varyAssetRecipe(row, bodoni, 99).values.labelText, typed.values.labelText);
});

test('the bottle uses a continuous wall, curved label, and profiled liquid', () => {
  const row = family('labeled-bottle-proof');
  let recipe = createAssetRecipe(row);
  recipe = setRecipeValue(row, recipe, 'labelWrap', 4.1);
  recipe = setRecipeValue(row, recipe, 'liquidLevel', 0.9);
  recipe = setRecipeValue(row, recipe, 'wallThickness', 0.003);
  const [bottle] = row.build('bottle-structure', [0, 0, 0], recipe);
  const byPart = Object.fromEntries(bottle.parts.map((part) => [part.sculptPart, part]));

  assert.deepEqual(bottle.parts.map((part) => part.sculptPart), [
    'glass-shell',
    'liquid-volume',
    'liquid-meniscus',
    'cork-stopper',
    'curved-paper-label',
  ]);
  assert.equal(byPart['glass-shell'].shape, 'lathe');
  assert.ok(byPart['glass-shell'].profile.length > 20);
  assert.equal(byPart['glass-shell'].finish, 'bottleGlass');
  assert.equal(byPart['glass-shell'].wallThickness, 0.003);
  assert.equal(byPart['liquid-volume'].shape, 'lathe');
  assert.ok(byPart['liquid-volume'].profile.length > 15);
  assert.equal(byPart['liquid-volume'].finish, 'bottleLiquid');
  assert.equal(byPart['curved-paper-label'].shape, 'cylinderSector');
  assert.equal(byPart['curved-paper-label'].thetaLength, 4.1);
  assert.equal(byPart['curved-paper-label'].label.surface, 'agedPaper');
  assert.ok(!bottle.parts.some((part) => ['cylinder', 'frustum'].includes(part.shape)));
});

test('the reagent rack composes deterministic bottle slots and joined rack members', () => {
  const row = family('reagent-bottle-rack');
  let recipe = createAssetRecipe(row, { seed: 490 });
  recipe = setRecipeValue(row, recipe, 'columns', 8);
  recipe = setRecipeValue(row, recipe, 'rows', 2);
  recipe = setRecipeValue(row, recipe, 'emptyRate', 0.35);
  recipe = setRecipeValue(row, recipe, 'labelText', 'SOLUTION');
  recipe = setRecipeValue(row, recipe, 'labelFont', 'bodoni');
  recipe = setRecipeValue(row, recipe, 'textureIntensity', 1.75);
  const [rack] = row.build('rack-proof', [0, 0, 0], recipe);
  const repeated = row.build('rack-proof', [0, 0, 0], recipe);

  assert.deepEqual([rack], repeated);
  assert.equal(rack.sculptPart, 'reagent-rack-root');
  assert.equal(rack.slotCount, 16);
  assert.ok(rack.occupiedSlots.length > 0 && rack.occupiedSlots.length < rack.slotCount);
  assert.ok(rack.parts.some((part) => part.sculptPart === 'rack-base'));
  assert.ok(rack.parts.some((part) => part.sculptPart === 'rack-back'));
  assert.equal(rack.parts.filter((part) => part.sculptPart.startsWith('side-cheek-')).length, 2);
  assert.equal(rack.parts.filter((part) => part.sculptPart.startsWith('front-retaining-rail-')).length, 2);
  assert.equal(
    rack.parts.filter((part) => part.sculptPart.endsWith('-glass-shell')).length,
    rack.occupiedSlots.length,
  );
  assert.ok(rack.parts
    .filter((part) => part.finish === 'laboratoryDeal')
    .every((part) => part.textureIntensity === 1.75));
  assert.ok(rack.parts
    .filter((part) => part.label)
    .every((part) => part.label.text.startsWith('SOLUTION ') && part.label.font === 'bodoni'));
});

test('reagent rack layout controls change its measured footprint', () => {
  const row = family('reagent-bottle-rack');
  const base = createAssetRecipe(row);
  const narrow = setRecipeValue(row, base, 'columns', 4);
  const wide = setRecipeValue(row, base, 'columns', 10);
  const shallow = setRecipeValue(row, narrow, 'rows', 1);
  const deep = setRecipeValue(row, narrow, 'rows', 2);

  const narrowBounds = builtBounds(row.build('narrow-rack', [0, 0, 0], narrow));
  const wideBounds = builtBounds(row.build('wide-rack', [0, 0, 0], wide));
  const shallowBounds = builtBounds(row.build('shallow-rack', [0, 0, 0], shallow));
  const deepBounds = builtBounds(row.build('deep-rack', [0, 0, 0], deep));
  assert.ok(wideBounds.size[0] > narrowBounds.size[0]);
  assert.ok(deepBounds.size[2] > shallowBounds.size[2]);
});

test('variant sheets stay within a shared complexity budget', () => {
  for (const row of editable) {
    const variants = generateAssetVariants(row, createAssetRecipe(row));
    const parts = variants.reduce(
      (total, variant, index) => total + assetBuildStats(row.build(`variant-${index}`, [0, 0, 0], variant)).parts,
      0,
    );
    assert.ok(variants.length >= 2 && variants.length <= 6, `${row.family} variant count`);
    assert.ok(parts <= 240 || variants.length === 2, `${row.family} variant part budget`);
    assert.ok(variants.every((variant) => variant.previewQuality === 'variants'));
  }
});

test('reagent rack variants omit close-up-only texture and label cost', () => {
  const row = family('reagent-bottle-rack');
  const recipe = createAssetRecipe(row, {
    values: { columns: 10, rows: 2, emptyRate: 0 },
  });
  const [full] = row.build('full-rack', [0, 0, 0], recipe);
  const [preview] = row.build('preview-rack', [0, 0, 0], {
    ...recipe,
    previewQuality: 'variants',
  });

  assert.ok(preview.parts.length < full.parts.length);
  assert.ok(!preview.parts.some((part) => part.label));
  assert.ok(!preview.parts.some((part) => part.sculptPart.endsWith('-liquid-meniscus')));
  assert.ok(preview.parts
    .filter((part) => part.finish === 'laboratoryDeal')
    .every((part) => part.texturePreview && part.textureIntensity === 1));
  assert.ok(preview.parts
    .filter((part) => part.sculptPart.endsWith('-glass-shell'))
    .every((part) => part.radialSegments === 24));
});

test('invalid imported label values fail before normalization', () => {
  const row = family('labeled-bottle-proof');
  const recipe = createAssetRecipe(row);
  const wrongText = { ...recipe, values: { ...recipe.values, labelText: 123 } };
  const wrongFont = { ...recipe, values: { ...recipe.values, labelFont: 'comic-sans' } };
  assert.ok(validateAssetRecipe(row, wrongText).some((error) => error.includes('must be text')));
  assert.ok(validateAssetRecipe(row, wrongFont).some((error) => error.includes('supported option')));
});

test('scatter recipes are deterministic, bounded, and vary asset seeds', () => {
  const row = family('vase-of-flowers');
  const asset = createAssetRecipe(row, { seed: 11 });
  let scatter = createScatterRecipe({ seed: 77 });
  scatter = setScatterValue(scatter, 'count', 24);
  scatter = setScatterValue(scatter, 'width', 6);
  scatter = setScatterValue(scatter, 'depth', 4);
  scatter = setScatterValue(scatter, 'scaleJitter', 0.2);
  const first = generateScatterPlacements(asset, scatter);
  const second = generateScatterPlacements(asset, scatter);

  assert.deepEqual(validateScatterRecipe(scatter), []);
  assert.deepEqual(first, second);
  assert.equal(first.length, 24);
  for (const placement of first) {
    assert.ok(Math.abs(placement.position[0]) <= 3);
    assert.ok(Math.abs(placement.position[2]) <= 2);
    assert.ok(placement.scale >= 0.8 && placement.scale <= 1.2);
  }
  assert.ok(new Set(first.map((placement) => placement.assetSeed)).size > 1);
});

test('invalid imported recipes fail before normalization', () => {
  const row = family('bookcase');
  const wrong = { ...createAssetRecipe(row), family: 'not-a-bookcase' };
  assert.ok(validateAssetRecipe(row, wrong).some((error) => error.includes('family')));
  const scatter = { ...createScatterRecipe(), schemaVersion: 999 };
  assert.ok(validateScatterRecipe(scatter).some((error) => error.includes('schemaVersion')));
});

test('default proof families stay inside declared budgets', () => {
  for (const row of editable) {
    const items = row.build('budget', [0, 0, 0], createAssetRecipe(row));
    const stats = assetBuildStats(items);
    assert.ok(stats.parts <= row.performanceBudget.maxParts, `${row.family} part budget`);
    assert.ok(stats.materials <= row.performanceBudget.maxMaterials, `${row.family} material budget`);
  }
});
