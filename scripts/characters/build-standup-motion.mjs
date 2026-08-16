// The one clip every pedestrian rig needs and none of the packs carried:
// getting up off a bench. The Mixamo source is a 33-bone download, but its
// bone names are a subset of the 65-bone rig's, so the same file binds on
// every figure — the fingers simply do not move.
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, stat } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, EXTMeshoptCompression } from '@gltf-transform/extensions';
import { dedup, prune, quantize, reorder } from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const BLENDER = process.env.BLENDER || '/Applications/Blender.app/Contents/MacOS/Blender';
const SOURCE = 'Sit To Stand.fbx';
const RAW = path.join(ROOT, 'character-lab/.generated/ped-anim-standup.raw.glb');
const OUTPUT = path.join(ROOT, 'game/public/models/ped-anim-standup.glb');

const local = path.join(ROOT, 'assets-local/mixamo/pedestrians', SOURCE);
const sourceDir = existsSync(local) ? path.dirname(local) : ROOT;

await mkdir(path.dirname(RAW), { recursive: true });
await new Promise((resolve, reject) => {
  const child = spawn(BLENDER, [
    '--factory-startup', '--background', '--python-exit-code', '1',
    '--python', path.join(ROOT, 'scripts/characters/convert_mixamo_motion.py'), '--',
    '--source-dir', sourceDir,
    '--output', RAW,
    '--in-place',
    '--clip', `${SOURCE}=StandUp`,
  ], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
  let log = '';
  child.stdout.on('data', (chunk) => { log = `${log}${chunk}`.slice(-30000); });
  child.stderr.on('data', (chunk) => { log = `${log}${chunk}`.slice(-30000); });
  child.on('error', reject);
  child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(log))));
});

await MeshoptEncoder.ready;
const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder });
const document = await io.read(RAW);
await document.transform(
  dedup(),
  prune({ keepAttributes: true }),
  reorder({ encoder: MeshoptEncoder, target: 'size' }),
  quantize({ quantizationVolume: 'mesh' }),
);
document.createExtension(EXTMeshoptCompression)
  .setRequired(true)
  .setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.QUANTIZE });
await io.write(OUTPUT, document);

const clips = document.getRoot().listAnimations().map((clip) => clip.getName());
if (clips.length !== 1 || clips[0] !== 'StandUp') {
  throw new Error(`Unexpected stand-up clips: ${clips.join(', ')}`);
}
process.stdout.write(`${JSON.stringify({ clips, bytes: (await stat(OUTPUT)).size }, null, 2)}\n`);
