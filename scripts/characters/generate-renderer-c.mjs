import { spawn } from 'node:child_process';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { NodeIO } from '@gltf-transform/core';
import { EXTMeshoptCompression, KHRMeshQuantization } from '@gltf-transform/extensions';
import { dedup, prune, quantize, reorder } from '@gltf-transform/functions';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';

globalThis.self = globalThis;
globalThis.ProgressEvent ??= class ProgressEvent {
  constructor(type, properties = {}) { this.type = type; Object.assign(this, properties); }
};
globalThis.createImageBitmap ??= async () => ({ width: 1, height: 1, close() {} });
globalThis.FileReader ??= class FileReader {
  readAsArrayBuffer(blob) {
    blob.arrayBuffer().then((result) => { this.result = result; this.onloadend?.({ target: this }); });
  }

  readAsDataURL(blob) {
    blob.arrayBuffer().then((result) => {
      this.result = `data:${blob.type};base64,${Buffer.from(result).toString('base64')}`;
      this.onloadend?.({ target: this });
    });
  }
};

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const blender = process.env.BLENDER || '/Applications/Blender.app/Contents/MacOS/Blender';
const presetPath = path.resolve(root, process.argv[2] || 'character-lab/public/presets/mrs-ostrander-1896.json');
const generatedDir = path.join(root, 'character-lab/.generated/renderer-c');
const publicDir = path.join(root, 'character-lab/public/models');
const scriptPath = path.join(root, 'scripts/characters/generate_renderer_c.py');
const LODS = ['consultation', 'nearby', 'crowd'];

function runBlender(lod, output, preview = null) {
  return new Promise((resolve, reject) => {
    const args = [
      '--background', '--python-exit-code', '1', '--python', scriptPath,
      '--', '--preset', presetPath, '--output', output, '--lod', lod,
    ];
    if (preview) args.push('--preview', preview);
    const child = spawn(blender, args, { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
    let log = '';
    child.stdout.on('data', (chunk) => { log = `${log}${chunk}`.slice(-24000); });
    child.stderr.on('data', (chunk) => { log = `${log}${chunk}`.slice(-24000); });
    child.on('error', reject);
    child.on('exit', (code) => code === 0 ? resolve(log) : reject(new Error(log || `Blender exited with code ${code}`)));
  });
}

async function compressGlb(source, output) {
  await MeshoptEncoder.ready;
  const io = new NodeIO()
    .registerExtensions([EXTMeshoptCompression, KHRMeshQuantization])
    .registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder });
  const document = await io.read(source);
  await document.transform(
    dedup(),
    prune(),
    reorder({ encoder: MeshoptEncoder, target: 'size' }),
    quantize({
      quantizePosition: 16,
      quantizeNormal: 12,
      quantizeTexcoord: 14,
      quantizeColor: 10,
      quantizeWeight: 12,
      quantizeGeneric: 16,
    }),
  );
  document.createExtension(EXTMeshoptCompression)
    .setRequired(true)
    .setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.QUANTIZE });
  await io.write(output, document);
}

async function validate(lod, modelPath) {
  const data = await readFile(modelPath);
  const arrayBuffer = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
  const gltf = await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(arrayBuffer, '');
  const required = ['Human_Body', 'Patient_Rig', 'Eyes', 'Eyebrows', 'Eyelashes', 'Teeth', 'RendererC_Hair'];
  for (const name of required) {
    if (!gltf.scene.getObjectByName(name)) throw new Error(`${lod} Renderer C is missing ${name}`);
  }
  const body = gltf.scene.getObjectByName('Human_Body');
  const morphTargets = Object.keys(body.morphTargetDictionary || {}).length;
  if (lod === 'consultation' && morphTargets < 45) throw new Error(`Consultation LOD retained only ${morphTargets} face units`);
  if (lod === 'nearby' && (morphTargets < 12 || morphTargets > 20)) throw new Error(`Nearby LOD retained ${morphTargets} face units`);
  if (lod === 'crowd' && morphTargets !== 0) throw new Error(`Crowd LOD retained ${morphTargets} face units`);
  if (gltf.animations.length < 2) throw new Error(`${lod} Renderer C lost its idle clips`);
  let triangles = 0;
  gltf.scene.traverse((object) => {
    if (!object.geometry) return;
    triangles += object.geometry.index
      ? object.geometry.index.count / 3
      : object.geometry.attributes.position.count / 3;
  });
  return { bytes: (await stat(modelPath)).size, triangles: Math.round(triangles), morphTargets, clips: gltf.animations.length };
}

await mkdir(generatedDir, { recursive: true });
await mkdir(publicDir, { recursive: true });
const results = {};
for (const lod of LODS) {
  const source = path.join(generatedDir, `renderer-c-${lod}.source.glb`);
  const output = path.join(publicDir, `renderer-c-${lod}.glb`);
  const preview = lod === 'consultation' ? path.join(publicDir, 'renderer-c-consultation-preview.png') : null;
  process.stdout.write(`Building Renderer C ${lod} LOD...\n`);
  const log = await runBlender(lod, source, preview);
  await compressGlb(source, output);
  results[lod] = { ...(await validate(lod, output)), log: log.split('\n').filter(Boolean).slice(-2).join(' | ') };
}

await writeFile(
  path.join(publicDir, 'renderer-c-manifest.json'),
  `${JSON.stringify({ pipeline: 'renderer-c-mpfb2-v1', preset: path.relative(root, presetPath), lods: results }, null, 2)}\n`,
);
process.stdout.write(`${JSON.stringify(results, null, 2)}\n`);
