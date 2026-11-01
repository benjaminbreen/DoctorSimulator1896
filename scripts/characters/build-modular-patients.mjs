import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '../..');
const blender = [process.env.BLENDER_BIN, '/Applications/Blender.app/Contents/MacOS/Blender', '/private/tmp/ghosts-character-tools/Blender52.app/Contents/MacOS/Blender'].find((file) => file && existsSync(file));
if (!blender) throw new Error('Blender 5.2 or later is required. Set BLENDER_BIN to its executable.');
const versionText = spawnSync(blender, ['--version'], { encoding: 'utf8' }).stdout || '';
const version = /Blender (\d+)\.(\d+)/.exec(versionText);
if (!version || Number(version[1]) < 5 || (Number(version[1]) === 5 && Number(version[2]) < 2)) {
  throw new Error(`Blender 5.2 or later is required: ${blender}`);
}
const source = 'assets/source/carmela-russo-2026-10-29';
const assembleOnly = process.argv.includes('--assemble-only');
const selected = process.argv.find(arg => arg.startsWith('--identity='))?.split('=')[1];
if (selected && !['carmela', 'seamstress'].includes(selected)) throw new Error('Identity must be carmela or seamstress.');
function run(command, args) {
  const result = spawnSync(command, args, { cwd: root, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${path.basename(command)} exited ${result.status}`);
}
function python(script, args) {
  run(blender, ['--factory-startup', '--background', '--threads', '4', '--python-exit-code', '1', '--python', `scripts/characters/${script}`, '--', ...args]);
}
const identities = selected ? [selected] : ['carmela', 'seamstress'];
for (const identity of identities) {
  const directory = identity === 'carmela' ? 'direct-head-v1' : 'second-direct-head-v1';
  const asset = identity === 'carmela' ? 'carmela-russo' : 'seamstress-prototype';
  if (!assembleOnly) python('build_carmela_head.py', ['--output', `${source}/${directory}`, '--identity', identity]);
  python('build_carmela_character.py', ['--head', `${directory}/carmela-head.blend`, '--name', identity, '--output', `game/public/models/characters/${asset}.glb`]);
  python('audit_modular_motion.py', ['--blend', `${source}/${identity}-assembled.blend`, '--output', `artifacts/characters/carmela-prototype/${identity}-motion.json`]);
}
run(process.execPath, ['scripts/characters/optimize-modular-patients.mjs', ...identities.map(identity => `game/public/models/characters/${identity === 'carmela' ? 'carmela-russo' : 'seamstress-prototype'}.glb`)]);
