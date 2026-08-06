import { readFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '../..');
const schema = JSON.parse(await readFile(path.join(root, 'character-lab/public/schema/character.schema.json'), 'utf8'));
const presetPath = path.resolve(root, process.argv[2] || 'character-lab/public/presets/mrs-ostrander-1896.json');
const preset = JSON.parse(await readFile(presetPath, 'utf8'));
const definitions = schema.groups.flatMap((group) => group.parameters.map((parameter) => ({ ...parameter, mode: parameter.mode || group.mode })));
const errors = [];
for (const parameter of definitions) {
  const value = preset.values[parameter.id];
  if (value === undefined) errors.push(`missing ${parameter.id}`);
  if (parameter.type === 'range' && (typeof value !== 'number' || value < parameter.min || value > parameter.max)) {
    errors.push(`${parameter.id} must be a number from ${parameter.min} to ${parameter.max}`);
  }
  if (parameter.type === 'color' && !/^#[0-9a-f]{6}$/i.test(value || '')) errors.push(`${parameter.id} must be a hex color`);
  if (parameter.type === 'select' && !parameter.options.includes(value)) errors.push(`${parameter.id} is not an allowed option`);
}
for (const id of Object.keys(preset.values)) if (!definitions.some((definition) => definition.id === id)) errors.push(`unknown parameter ${id}`);
const raceTotal = ['african', 'asian', 'caucasian'].reduce((sum, id) => sum + preset.values[id], 0);
if (Math.abs(raceTotal - 1) > 0.02) errors.push(`phenotype weights must sum to 1 (currently ${raceTotal.toFixed(2)})`);
if (errors.length) {
  console.error(errors.map((error) => `- ${error}`).join('\n'));
  process.exit(1);
}
console.log(`Valid preset: ${preset.name} (${definitions.length} tunable parameters)`);
