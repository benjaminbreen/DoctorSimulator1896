import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const root = path.resolve(import.meta.dirname, '../..');
const blender = process.env.BLENDER || '/Applications/Blender.app/Contents/MacOS/Blender';
const preset = path.resolve(root, process.argv[2] || 'character-lab/public/presets/mrs-ostrander-1896.json');
const output = path.resolve(root, process.argv[3] || 'character-lab/public/models/mrs-ostrander-1896.glb');
const stylizedOutput = output.replace(/\.glb$/i, '-stylized.glb');
const preview = output.replace(/\.glb$/i, '-contact-sheet.png');
await mkdir(path.dirname(output), { recursive: true });

console.log(`Generating ${path.relative(root, output)} from ${path.relative(root, preset)}`);
const child = spawn(blender, [
  '--background',
  '--python', path.join(root, 'scripts/characters/generate_patient.py'),
  '--', '--preset', preset, '--output', output, '--stylized-output', stylizedOutput, '--preview', preview,
], { stdio: 'inherit' });

child.on('exit', (code) => process.exit(code ?? 1));
