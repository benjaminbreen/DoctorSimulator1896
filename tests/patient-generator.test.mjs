import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { generatePatient, patientToCharacterPreset } from '../character-lab/src/patients/index.js';

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

test('2,000 generated patients remain coherent and inside the render contract', () => {
  const names = new Set(); const faces = new Set(); const complaints = new Set();
  const originCounts = new Map(); let withoutPaidOccupation = 0; let mourningDress = 0;
  for (let seed = 1; seed <= 2000; seed += 1) {
    const patient = generatePatient({ seed });
    const preset = patientToCharacterPreset(patient, basePreset, definitions);
    assert.equal(patient.setting.year, 1896);
    assert.equal(patient.identity.sex, 'female');
    assert.ok(patient.identity.age >= 16 && patient.identity.age <= 76);
    assert.ok(patient.clinical.presentingComplaint.length > 20);
    assert.deepEqual(validateValues(preset), [], `seed ${seed}`);
    assert.ok(Math.abs(preset.values.african + preset.values.asian + preset.values.caucasian - 1) < 0.001);
    if (preset.values.outfitStyle === 'mourning-dress') {
      mourningDress += 1;
      assert.ok(patient.clinical.flags.includes('mourning'));
    }
    if (!patient.social.occupation) withoutPaidOccupation += 1;
    names.add(patient.identity.fullName); faces.add(preset.patient.appearance.faceArchetype); complaints.add(patient.clinical.id);
    originCounts.set(patient.identity.origin.id, (originCounts.get(patient.identity.origin.id) ?? 0) + 1);
  }
  assert.ok(names.size > 900, `only ${names.size} distinct names`);
  assert.ok(faces.size >= 7, `only ${faces.size} face archetypes`);
  assert.ok(complaints.size >= 9, `only ${complaints.size} clinical presentations`);
  assert.ok(withoutPaidOccupation > 250, `only ${withoutPaidOccupation} patients without paid occupations`);
  assert.ok(mourningDress > 30, `only ${mourningDress} mourning presentations rendered as mourning`);
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

