import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { generatePatient, patientToCharacterPreset } from '../character-lab/src/patients/index.js';
import { patientToRendererCRecipe } from '../shared/patients/toRendererCRecipe.js';
import { validateCharacterRecipe } from '../shared/characters/recipe.js';
import {
  RENDERER_C_VALUE_IDS,
  rendererCAgeBandForPatient,
  rendererCAncestryForValues,
  rendererCCohortForPatient,
} from '../shared/characters/rendererCRecipe.js';
import {
  createRendererCController as createLabRendererCController,
  generateRendererCCandidates,
  RENDERER_C_ANCESTRIES,
} from '../character-lab/src/renderer-c.js';
import { createRendererCController as createGameRendererCController } from '../game/src/scene/characters/rendererCController.js';
import {
  appearancePaletteForAncestry,
  EYE_COLOR_VALUES,
  SKIN_TONE_VALUES,
} from '../shared/characters/appearancePalettes.js';
import {
  AGE_APPEARANCE_VALUE_IDS,
  deriveAgeAppearance,
  rendererCAgeValueToYears,
  rendererCYearsToAgeValue,
} from '../shared/characters/ageAppearance.js';
import {
  FACE_QA_STATES,
  FACE_WEIGHT_LIMITS,
  safeFaceWeight,
} from '../shared/characters/facePerformance.js';

const schema = JSON.parse(await readFile(new URL('../character-lab/public/schema/character.schema.json', import.meta.url)));
const basePreset = JSON.parse(await readFile(new URL('../character-lab/public/presets/mrs-ostrander-1896.json', import.meta.url)));
const manifest = JSON.parse(await readFile(new URL('../character-lab/public/models/renderer-c-cohorts.json', import.meta.url)));
const definitions = schema.groups.flatMap((group) => group.parameters.map((parameter) => ({
  ...parameter, mode: parameter.mode || group.mode,
})));

test('patient recipes select Renderer C anchors deterministically across both cohorts', () => {
  const anchors = { women: new Set(), men: new Set() };
  for (let seed = 1; seed <= 600; seed += 1) {
    const patient = generatePatient({ seed });
    const cohort = patient.identity.sex === 'male' ? 'men' : 'women';
    const first = patientToCharacterPreset(patient, basePreset, definitions, {
      rendererCManifest: manifest.cohorts[cohort],
    });
    const second = patientToCharacterPreset(patient, basePreset, definitions, {
      rendererCManifest: manifest.cohorts[cohort],
    });
    assert.deepEqual(first.characterRecipe, second.characterRecipe);
    assert.equal(first.values.rendererCAnchor, first.characterRecipe.anchor.index);
    assert.equal(first.characterRecipe.anchor.id, manifest.cohorts[cohort].anchors[first.values.rendererCAnchor].id);
    assert.deepEqual(validateCharacterRecipe(first.characterRecipe, manifest), []);
    anchors[cohort].add(first.values.rendererCAnchor);
  }
  assert.equal(anchors.women.size, 8);
  assert.equal(anchors.men.size, 8);
});

test('Renderer C recipes contain only supported live values', () => {
  const patient = generatePatient({ seed: 4815 });
  const preset = patientToCharacterPreset(patient, basePreset, definitions, {
    rendererCManifest: manifest.cohorts.women,
  });
  const allowed = new Set([
    'rendererCAnchor', ...RENDERER_C_VALUE_IDS,
    'skinTone', 'eyeColor', 'hairColor', 'browColor', 'lashColor',
    'dressColor', 'trimColor', 'skinRoughness', 'fabricRoughness', 'greyPattern',
  ]);
  for (const id of Object.keys(preset.characterRecipe.values)) assert.ok(allowed.has(id), `unsupported value ${id}`);
  assert.equal(preset.characterRecipe.values.headAngle, undefined);
  assert.equal(preset.characterRecipe.values.mhrEyeSpacing, undefined);
});

test('age appearance is deterministic, varied, and visibly stronger in later life', () => {
  assert.equal(rendererCAgeValueToYears(0.5), 16);
  assert.equal(rendererCAgeValueToYears(0.9), 90);
  assert.ok(Math.abs(rendererCYearsToAgeValue(90) - 0.9) < 1e-9);
  assert.ok(Math.abs(rendererCYearsToAgeValue(16) - 0.5) < 1e-9);
  assert.deepEqual(
    deriveAgeAppearance({ ageYears: 61, seed: 8133 }),
    deriveAgeAppearance({ ageYears: 61, seed: 8133 }),
  );
  assert.notDeepEqual(
    deriveAgeAppearance({ ageYears: 61, seed: 8133 }),
    deriveAgeAppearance({ ageYears: 61, seed: 8134 }),
  );
  const average = (ageYears, id) => Array.from({ length: 80 }, (_, index) => (
    deriveAgeAppearance({ ageYears, seed: index + 1 })[id]
  )).reduce((sum, value) => sum + value, 0) / 80;
  for (const id of ['ageGeometry', 'wrinkleAmount', 'skinTexture', 'pigmentVariation', 'ageSpotAmount', 'underEyeDarkness', 'greyAmount']) {
    assert.ok(average(65, id) > average(25, id) + 0.2, `${id} should read as older at 65`);
  }
  assert.ok(Math.abs(average(65, 'freckleAmount') - average(25, 'freckleAmount')) < 0.08);
});

test('generated patient recipes retain all Renderer C age appearance values', () => {
  const patient = generatePatient({ seed: 8133 });
  const preset = patientToCharacterPreset(patient, basePreset, definitions, {
    rendererCManifest: manifest.cohorts[rendererCCohortForPatient(patient)],
  });
  for (const id of AGE_APPEARANCE_VALUE_IDS) {
    assert.equal(preset.characterRecipe.values[id], preset.values[id], `${id} was not preserved in the recipe`);
    assert.ok(preset.values[id] >= 0 && preset.values[id] <= 1);
  }
  assert.ok(['temples-first', 'scattered', 'uniform'].includes(preset.characterRecipe.values.greyPattern));

  const gameRecipe = patientToRendererCRecipe(patient);
  for (const id of AGE_APPEARANCE_VALUE_IDS) assert.ok(Number.isFinite(gameRecipe.values[id]));
  assert.ok(['temples-first', 'scattered', 'uniform'].includes(gameRecipe.values.greyPattern));
});

test('Character Lab and the game use the same Renderer C controller', () => {
  assert.equal(createLabRendererCController, createGameRendererCController);
});

test('patient facts resolve to stable Renderer C casting criteria', () => {
  assert.equal(rendererCCohortForPatient({ identity: { sex: 'male' } }), 'men');
  assert.equal(rendererCAgeBandForPatient({ identity: { age: 54 } }), '50s');
  assert.equal(rendererCAgeBandForPatient({ identity: { age: 75 } }), '70s');
  assert.equal(rendererCAgeBandForPatient({ identity: { age: 86 } }), '80s');
  assert.equal(rendererCAncestryForValues({ african: 0.78, asian: 0.01 }), 'african');
  assert.equal(rendererCAncestryForValues({ african: 0.28, asian: 0.01 }), 'european-african');
});

test('generated patients use the six approved appearance palettes within ancestry bounds', () => {
  for (let seed = 1; seed <= 600; seed += 1) {
    const patient = generatePatient({ seed });
    const preset = patientToCharacterPreset(patient, basePreset, definitions);
    const ancestry = rendererCAncestryForValues(preset.values);
    const palette = appearancePaletteForAncestry(ancestry);
    assert.ok(SKIN_TONE_VALUES.includes(preset.values.skinTone));
    assert.ok(EYE_COLOR_VALUES.includes(preset.values.eyeColor));
    assert.ok(palette.skinTones.includes(preset.values.skinTone), `${ancestry} used ${preset.values.skinTone}`);
    assert.ok(palette.eyeColors.includes(preset.values.eyeColor), `${ancestry} used ${preset.values.eyeColor}`);
  }
});

test('Renderer C identity grids randomize complexion and eye colour within each selected cohort', () => {
  for (const ancestry of Object.keys(RENDERER_C_ANCESTRIES)) {
    const palette = appearancePaletteForAncestry(ancestry);
    const candidates = generateRendererCCandidates({
      ancestry, seed: 8133, count: 8, manifest: manifest.cohorts.women,
    });
    assert.equal(new Set(candidates.map(({ values }) => values.skinTone)).size, palette.skinTones.length);
    assert.equal(new Set(candidates.map(({ values }) => values.eyeColor)).size, palette.eyeColors.length);
    for (const { values } of candidates) {
      assert.ok(palette.skinTones.includes(values.skinTone));
      assert.ok(palette.eyeColors.includes(values.eyeColor));
    }
  }
});

test('the fixed face review matrix covers the Phase 1 safety states', () => {
  assert.deepEqual(FACE_QA_STATES.map((state) => state.id), [
    'neutral', 'blink', 'jaw-025', 'jaw-05', 'guarded', 'distressed',
  ]);
  assert.equal(safeFaceWeight('jawOpen', 0.05), FACE_WEIGHT_LIMITS.jawOpen);
  for (const state of FACE_QA_STATES) {
    for (const value of Object.values(state.weights)) {
      assert.ok(Number.isFinite(value) && value >= 0 && value <= 1, `${state.id} has an unsafe review value`);
    }
  }
});
