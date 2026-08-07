import { spawn } from 'node:child_process';
import { access, mkdir, readFile, stat, writeFile } from 'node:fs/promises';
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

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const blender = process.env.BLENDER || '/Applications/Blender.app/Contents/MacOS/Blender';
const generatedDir = path.join(root, 'character-lab/.generated/renderer-c');
const publicDir = path.join(root, 'character-lab/public/models');
const scriptPath = path.join(root, 'scripts/characters/generate_renderer_c_master.py');
const gnmPath = process.env.GNM_HEAD || '/private/tmp/gnm-head-proof/gnm/shape/data/versions/v3_0/gnm_head.npz';
const reuseSources = process.env.RENDERER_C_REUSE_SOURCES === '1';

function runBlender(cohort, output, manifest) {
  return new Promise((resolve, reject) => {
    const child = spawn(blender, [
      '--background', '--python-exit-code', '1', '--python', scriptPath,
      '--', '--cohort', cohort, '--output', output, '--manifest', manifest, '--gnm-npz', gnmPath,
    ], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
    let log = '';
    child.stdout.on('data', (chunk) => { log = `${log}${chunk}`.slice(-30000); });
    child.stderr.on('data', (chunk) => { log = `${log}${chunk}`.slice(-30000); });
    child.on('error', reject);
    child.on('exit', (code) => code === 0 ? resolve(log) : reject(new Error(log || `Blender exited with code ${code}`)));
  });
}

async function runBlenderWithRetry(cohort, output, manifest) {
  try {
    return await runBlender(cohort, output, manifest);
  } catch (firstError) {
    process.stderr.write(`Blender did not start cleanly for ${cohort}; retrying once.\n`);
    await new Promise((resolve) => setTimeout(resolve, 1000));
    try {
      return await runBlender(cohort, output, manifest);
    } catch (secondError) {
      secondError.cause = firstError;
      throw secondError;
    }
  }
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

async function validate(cohort, modelPath, manifest) {
  const data = await readFile(modelPath);
  const arrayBuffer = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
  const gltf = await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(arrayBuffer, '');
  const required = ['Human_Body', 'Patient_Rig', 'RendererC_Eyes_01', 'RendererC_Teeth_01', 'RendererC_BaseGarment'];
  for (const name of required) if (!gltf.scene.getObjectByName(name)) throw new Error(`${cohort} master is missing ${name}`);
  const body = gltf.scene.getObjectByName('Human_Body');
  const morphs = Object.keys(body.morphTargetDictionary || {});
  for (const anchor of manifest.anchors) if (!morphs.includes(anchor.morph)) throw new Error(`${cohort} master lost ${anchor.morph}`);
  for (const id of manifest.liveFaceIds) {
    for (const sign of ['pos', 'neg']) if (!morphs.includes(`rc_live_${id}_${sign}`)) throw new Error(`${cohort} master lost ${id} ${sign}`);
  }
  if (morphs.length < 120) throw new Error(`${cohort} master retained only ${morphs.length} morphs`);
  if (gltf.animations.length < 2) throw new Error(`${cohort} master lost its idle clips`);
  return { bytes: (await stat(modelPath)).size, morphTargets: morphs.length, clips: gltf.animations.length };
}

await mkdir(generatedDir, { recursive: true });
await mkdir(publicDir, { recursive: true });
const cohorts = {};
for (const cohort of ['women', 'men']) {
  const source = path.join(generatedDir, `renderer-c-${cohort}.source.glb`);
  const sourceManifest = path.join(generatedDir, `renderer-c-${cohort}.json`);
  const output = path.join(publicDir, `renderer-c-${cohort}.glb`);
  if (!reuseSources) {
    process.stdout.write(`Building Renderer C ${cohort} master...\n`);
    await runBlenderWithRetry(cohort, source, sourceManifest);
  } else {
    await Promise.all([access(source), access(sourceManifest)]);
  }
  const manifest = JSON.parse(await readFile(sourceManifest, 'utf8'));
  await compressGlb(source, output);
  const facts = await validate(cohort, output, manifest);
  cohorts[cohort] = { ...manifest, ...facts, path: `/models/renderer-c-${cohort}.glb` };
  process.stdout.write(`${cohort}: ${(facts.bytes / 1024 / 1024).toFixed(1)} MB, ${facts.morphTargets} morphs\n`);
}

const combined = { pipeline: 'renderer-c-parametric-master-v1', cohorts };
await writeFile(path.join(publicDir, 'renderer-c-cohorts.json'), `${JSON.stringify(combined, null, 2)}\n`);
process.stdout.write(`${JSON.stringify(combined, null, 2)}\n`);
