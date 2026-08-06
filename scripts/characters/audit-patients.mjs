import { generatePatient, patientToCharacterPreset } from '../../character-lab/src/patients/index.js';
import { readFile } from 'node:fs/promises';

const count = Number(process.argv[2] || 1000);
const schema = JSON.parse(await readFile(new URL('../../character-lab/public/schema/character.schema.json', import.meta.url)));
const basePreset = JSON.parse(await readFile(new URL('../../character-lab/public/presets/mrs-ostrander-1896.json', import.meta.url)));
const definitions = schema.groups.flatMap((group) => group.parameters.map((parameter) => ({ ...parameter, mode: parameter.mode || group.mode })));
const counters = { origin: {}, class: {}, occupation: {}, clinical: {}, outfit: {}, hair: {}, eyes: {} };
const increment = (group, value) => { counters[group][value ?? 'none'] = (counters[group][value ?? 'none'] ?? 0) + 1; };

for (let seed = 1; seed <= count; seed += 1) {
  const patient = generatePatient({ seed });
  const preset = patientToCharacterPreset(patient, basePreset, definitions);
  increment('origin', patient.identity.origin.id); increment('class', patient.social.classId);
  increment('occupation', patient.social.occupationId); increment('clinical', patient.clinical.id);
  increment('outfit', preset.values.outfitStyle); increment('hair', preset.values.hairStyle); increment('eyes', preset.values.eyeColor);
}

const percentage = (value) => `${((value / count) * 100).toFixed(1)}%`;
for (const [group, values] of Object.entries(counters)) {
  console.log(`\n${group.toUpperCase()}`);
  for (const [label, value] of Object.entries(values).sort((a, b) => b[1] - a[1])) console.log(`${percentage(value).padStart(6)}  ${label}`);
}

