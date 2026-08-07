import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  FACE_UNIT_NAMES, FACE_UNIT_PAIRS, faceIdentityDistance, generatePatient,
  generateRestingFaceSignature, patientToCharacterPreset,
} from '../character-lab/src/patients/index.js';

const schema = JSON.parse(await readFile(new URL('../character-lab/public/schema/character.schema.json', import.meta.url)));
const basePreset = JSON.parse(await readFile(new URL('../character-lab/public/presets/mrs-ostrander-1896.json', import.meta.url)));
const definitions = schema.groups.flatMap((group) => group.parameters.map((parameter) => ({
  ...parameter, mode: parameter.mode || group.mode,
})));

function validateValues(preset) {
  const errors = [];
  for (const definition of definitions) {
    const value = preset.values[definition.id];
    if (value === undefined) errors.push(`missing ${definition.id}`);
    if (definition.type === 'range' && (!Number.isFinite(value) || value < definition.min || value > definition.max)) errors.push(`${definition.id} out of range: ${value}`);
    if (definition.type === 'select' && !definition.options.includes(value)) errors.push(`${definition.id} invalid: ${value}`);
    if (definition.type === 'color' && !/^#[0-9a-f]{6}$/i.test(value)) errors.push(`${definition.id} invalid color: ${value}`);
  }
  return errors;
}

test('a patient seed is exactly reproducible', () => {
  assert.deepEqual(generatePatient({ seed: 4815 }), generatePatient({ seed: 4815 }));
});

test('domain generation is independent from appearance generation', () => {
  const patient = generatePatient({ seed: 227 });
  const before = structuredClone(patient);
  patientToCharacterPreset(patient, basePreset, definitions);
  assert.deepEqual(patient, before);
});

test('appearance seeds reroll rendering without replacing the patient', () => {
  const patient = generatePatient({ seed: 227 });
  const first = patientToCharacterPreset(patient, basePreset, definitions, { appearanceSeed: 701 });
  const second = patientToCharacterPreset(patient, basePreset, definitions, { appearanceSeed: 702 });
  assert.equal(first.name, second.name);
  assert.equal(first.patient.seed, patient.seed);
  assert.equal(second.patient.seed, patient.seed);
  assert.equal(first.patient.clinical.presentingComplaint, second.patient.clinical.presentingComplaint);
  assert.equal(first.values.seed, 701);
  assert.equal(second.values.seed, 702);
  assert.equal(first.patient.appearance.seed, 701);
  assert.equal(second.patient.appearance.seed, 702);
  assert.equal(first.values.fidget, second.values.fidget);
  assert.equal(first.values.tremor, second.values.tremor);
  assert.notDeepEqual(first.patient.appearance, second.patient.appearance);
  assert.notEqual(first.values.headWidth, second.values.headWidth);
});

test('resting-face signatures cover all units with predominantly bilateral variation', () => {
  assert.equal(FACE_UNIT_NAMES.length, 52);
  assert.deepEqual(generateRestingFaceSignature(814), generateRestingFaceSignature(814));
  let activePairs = 0;
  let bilateralPairs = 0;
  for (let seed = 1; seed <= 600; seed += 1) {
    const signature = generateRestingFaceSignature(seed);
    assert.deepEqual(Object.keys(signature).sort(), [...FACE_UNIT_NAMES].sort());
    assert.ok(Object.values(signature).every((value) => value >= 0 && value <= 0.72));
    assert.equal(signature.tongueOut, 0);
    assert.ok(!(signature.jawOpen > 0 && signature.mouthClose > 0));
    assert.ok(!((signature.eyeWideLeft > 0 || signature.eyeWideRight > 0)
      && (signature.cheekSquintLeft > 0 || signature.cheekSquintRight > 0)));
    assert.ok(!((signature.browDownLeft > 0 || signature.browDownRight > 0) && signature.browInnerUp > 0));
    for (const [left, right] of FACE_UNIT_PAIRS) {
      if (signature[left] === 0 && signature[right] === 0) continue;
      activePairs += 1;
      if (Math.abs(signature[left] - signature[right]) / Math.max(signature[left], signature[right]) <= 0.23) bilateralPairs += 1;
    }
  }
  const bilateralRate = bilateralPairs / activePairs;
  assert.ok(bilateralRate > 0.70 && bilateralRate < 0.86, `bilateral rate ${bilateralRate}`);
});

test('2,000 generated patients remain coherent and inside the render contract', () => {
  const names = new Set(); const faces = new Set(); const complaints = new Set();
  const originCounts = new Map(); const sexCounts = new Map(); let withoutPaidOccupation = 0; let mourningDress = 0;
  for (let seed = 1; seed <= 2000; seed += 1) {
    const patient = generatePatient({ seed });
    const preset = patientToCharacterPreset(patient, basePreset, definitions);
    assert.equal(patient.setting.year, 1896);
    assert.ok(['female', 'male'].includes(patient.identity.sex));
    assert.equal(patient.identity.title, patient.identity.sex === 'male' ? 'Mr.' : patient.social.household.maritalStatus === 'single' ? 'Miss' : 'Mrs.');
    assert.ok(patient.identity.age >= 16 && patient.identity.age <= 76);
    assert.ok(patient.clinical.presentingComplaint.length > 20);
    assert.deepEqual(validateValues(preset), [], `seed ${seed}`);
    assert.ok(Math.abs(preset.values.african + preset.values.asian + preset.values.caucasian - 1) < 0.001);
    assert.ok(patient.identity.sex === 'female' ? preset.values.gender < 0.18 : preset.values.gender > 0.82);
    assert.deepEqual(preset.patient.appearance.mhrIdentity.ancestry, {
      african: preset.values.african, asian: preset.values.asian, caucasian: preset.values.caucasian,
    });
    if (patient.clinical.id === 'postpartum-disturbance') assert.equal(patient.identity.sex, 'female');
    if (['mourning-dress', 'mens-mourning-suit'].includes(preset.values.outfitStyle)) {
      mourningDress += 1;
      assert.ok(patient.clinical.flags.includes('mourning'));
    }
    assert.equal(preset.values.outfitStyle.startsWith('mens-'), patient.identity.sex === 'male');
    if (!patient.social.occupation) withoutPaidOccupation += 1;
    names.add(patient.identity.fullName); faces.add(preset.patient.appearance.faceArchetype); complaints.add(patient.clinical.id);
    originCounts.set(patient.identity.origin.id, (originCounts.get(patient.identity.origin.id) ?? 0) + 1);
    sexCounts.set(patient.identity.sex, (sexCounts.get(patient.identity.sex) ?? 0) + 1);
  }
  assert.ok(names.size > 900, `only ${names.size} distinct names`);
  assert.ok(faces.size >= 7, `only ${faces.size} face archetypes`);
  assert.ok(complaints.size >= 9, `only ${complaints.size} clinical presentations`);
  assert.ok(withoutPaidOccupation > 250, `only ${withoutPaidOccupation} patients without paid occupations`);
  assert.ok(mourningDress > 30, `only ${mourningDress} mourning presentations rendered as mourning`);
  assert.ok((sexCounts.get('female') ?? 0) > 850, `only ${sexCounts.get('female')} female patients`);
  assert.ok((sexCounts.get('male') ?? 0) > 850, `only ${sexCounts.get('male')} male patients`);
  assert.ok((originCounts.get('chinese-american') ?? 0) < 30, 'clinic sample overrepresents Chinese New Yorkers');
  assert.ok((originCounts.get('african-american') ?? 0) < 100, 'clinic sample overrepresents African American New Yorkers');
});

test('clinical state changes performance rather than acting as biography-only flavor', () => {
  const byPresentation = new Map();
  for (let seed = 1; seed <= 1000; seed += 1) {
    const patient = generatePatient({ seed });
    const preset = patientToCharacterPreset(patient, basePreset, definitions);
    const list = byPresentation.get(patient.clinical.id) ?? [];
    list.push(preset.values); byPresentation.set(patient.clinical.id, list);
  }
  const mean = (id, field) => byPresentation.get(id).reduce((sum, values) => sum + values[field], 0) / byPresentation.get(id).length;
  assert.ok(mean('anxious-palpitations', 'fidget') > mean('melancholic-withdrawal', 'fidget') + 0.35);
  assert.ok(mean('functional-tremor', 'tremor') > mean('persistent-insomnia', 'tremor') + 0.45);
  assert.ok(mean('melancholic-withdrawal', 'posture') < mean('traumatic-fright', 'posture') - 0.2);
});

test('generated skin rendering changes coherently with age', () => {
  const young = [];
  const older = [];
  for (let seed = 1; seed <= 5000 && (young.length < 180 || older.length < 180); seed += 1) {
    const patient = generatePatient({ seed });
    const preset = patientToCharacterPreset(patient, basePreset, definitions);
    if (patient.identity.age <= 29 && young.length < 180) young.push(preset.values);
    if (patient.identity.age >= 57 && older.length < 180) older.push(preset.values);
  }
  assert.equal(young.length, 180);
  assert.equal(older.length, 180);
  const mean = (list, field) => list.reduce((sum, values) => sum + values[field], 0) / list.length;
  assert.ok(mean(older, 'stylizedSkinDetail') > mean(young, 'stylizedSkinDetail') + 0.20);
  assert.ok(mean(older, 'stylizedPigmentVariation') > mean(young, 'stylizedPigmentVariation') + 0.20);
  assert.ok(mean(older, 'stylizedPoreScale') > mean(young, 'stylizedPoreScale') + 0.20);
  assert.ok(mean(older, 'stylizedSurfaceRoughness') > mean(young, 'stylizedSurfaceRoughness') + 0.07);
  assert.ok(mean(older, 'stylizedLipTint') < mean(young, 'stylizedLipTint') - 0.07);
  assert.ok(mean(older, 'stylizedEyeContrast') < mean(young, 'stylizedEyeContrast') - 0.06);
});

test('generated identities span landmark structure beyond a shared face template', () => {
  const fields = [
    'headWidth', 'faceHeight', 'headAngle', 'eyeDepth', 'eyeHeightCenter',
    'noseDepth', 'noseBridge', 'noseCurve', 'mouthVerticalPosition',
    'chinPrognathism', 'cheekHeight',
  ];
  const ranges = Object.fromEntries(fields.map((field) => [field, { minimum: Infinity, maximum: -Infinity }]));
  for (let seed = 1; seed <= 1200; seed += 1) {
    const values = patientToCharacterPreset(generatePatient({ seed }), basePreset, definitions).values;
    for (const field of fields) {
      ranges[field].minimum = Math.min(ranges[field].minimum, values[field]);
      ranges[field].maximum = Math.max(ranges[field].maximum, values[field]);
    }
  }
  for (const [field, range] of Object.entries(ranges)) {
    assert.ok(range.maximum - range.minimum > 0.62, `${field} spans only ${range.maximum - range.minimum}`);
  }
});

test('face identity distance detects structural siblings', () => {
  const first = patientToCharacterPreset(generatePatient({ seed: 111 }), basePreset, definitions);
  const same = patientToCharacterPreset(generatePatient({ seed: 111 }), basePreset, definitions);
  const distinct = patientToCharacterPreset(generatePatient({ seed: 222 }), basePreset, definitions);
  assert.equal(faceIdentityDistance(first, same, definitions), 0);
  assert.ok(faceIdentityDistance(first, distinct, definitions) > 0.17);
});
