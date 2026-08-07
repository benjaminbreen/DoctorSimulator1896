import { createHash } from 'node:crypto';
import { access, copyFile, mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { NodeIO } from '@gltf-transform/core';
import { EXTMeshoptCompression, KHRMeshQuantization } from '@gltf-transform/extensions';
import { quantize, reorder } from '@gltf-transform/functions';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';
import { createMhrController, mhrSemanticProfile } from '../../character-lab/src/mhr.js';

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
const masterPath = path.join(root, 'character-lab/public/models/comparison-mhr-lod1.glb');
const cacheRoot = path.join(root, 'character-lab/.generated/cache/mhr');
const PIPELINE_VERSION = 'mhr-runtime-v5';

async function loadGlb(modelPath) {
  const data = await readFile(modelPath);
  const arrayBuffer = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
  return new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(arrayBuffer, '');
}

function stripBakedIdentityTargets(root) {
  let retained = 0;
  root.traverse((object) => {
    const dictionary = object.morphTargetDictionary;
    if (!object.isMesh || !dictionary?.shape_45) return;
    const keep = Object.entries(dictionary)
      .filter(([name]) => Number(name.replace('shape_', '')) >= 45)
      .sort((left, right) => left[1] - right[1]);
    for (const [kind, attributes] of Object.entries(object.geometry.morphAttributes)) {
      object.geometry.morphAttributes[kind] = keep.map(([, index]) => attributes[index]);
    }
    object.morphTargetInfluences = keep.map(([, index]) => object.morphTargetInfluences[index] || 0);
    object.morphTargetDictionary = Object.fromEntries(keep.map(([name], index) => [name, index]));
    retained = Math.max(retained, keep.length);
  });
  return retained;
}

async function exportBinary(scene) {
  return new Promise((resolve, reject) => {
    new GLTFExporter().parse(scene, resolve, reject, {
      binary: true,
      onlyVisible: true,
      truncateDrawRange: true,
      includeCustomExtensions: true,
    });
  });
}

async function compressRuntime(binary) {
  await MeshoptEncoder.ready;
  const io = new NodeIO()
    .registerExtensions([EXTMeshoptCompression, KHRMeshQuantization])
    .registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder });
  const document = await io.readBinary(new Uint8Array(binary));
  await document.transform(
    reorder({ encoder: MeshoptEncoder, target: 'size' }),
    quantize({
      quantizePosition: 16,
      quantizeNormal: 14,
      quantizeTexcoord: 14,
      quantizeColor: 10,
      quantizeWeight: 12,
      quantizeGeneric: 16,
    }),
  );
  document.createExtension(EXTMeshoptCompression)
    .setRequired(true)
    .setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.QUANTIZE });
  return io.writeBinary(document);
}

async function validateRuntime(modelPath) {
  const gltf = await loadGlb(modelPath);
  const body = gltf.scene.getObjectByName('body_mesh');
  let bones = 0;
  gltf.scene.traverse((object) => { if (object.isBone) bones += 1; });
  const expressions = Object.keys(body?.morphTargetDictionary || {}).length;
  if (!body?.isSkinnedMesh) throw new Error('Generated MHR runtime lost its skinned mesh binding');
  if (bones !== 126) throw new Error(`Generated MHR runtime has ${bones} bones instead of 126`);
  if (expressions !== 72) throw new Error(`Generated MHR runtime has ${expressions} expressions instead of 72`);
  if (body.userData.mhrIdentityBaked !== true) throw new Error('Generated MHR runtime lost its baked-identity metadata');
  return { bones, expressions };
}

export async function generateMhrRuntime({ preset, output }) {
  const signature = createHash('sha256')
    .update(`${PIPELINE_VERSION}:${JSON.stringify(preset.values)}`)
    .digest('hex').slice(0, 20);
  await mkdir(cacheRoot, { recursive: true });
  await mkdir(path.dirname(output), { recursive: true });
  const cachedPath = path.join(cacheRoot, `${preset.id}-${signature}.glb`);
  try {
    await access(cachedPath);
    await copyFile(cachedPath, output);
    return { cached: true, signature, output, bytes: (await stat(output)).size, ...(await validateRuntime(output)) };
  } catch {
    // Cache miss: bake from the full-fidelity authoring master below.
  }

  const gltf = await loadGlb(masterPath);
  const body = gltf.scene.getObjectByName('body_mesh');
  const controller = createMhrController(gltf.scene, preset.values);
  if (!controller || !body) throw new Error('MHR master is missing its body identity library');
  controller.applyValues(preset.values, { forceIdentity: true, snapPose: true });
  body.material.color.set(preset.values.skinTone || '#c99378');
  body.material.roughness = preset.values.skinRoughness ?? 0.86;
  body.material.needsUpdate = true;

  gltf.scene.userData.mhrIdentityBaked = true;
  gltf.scene.userData.mhrPipelineVersion = PIPELINE_VERSION;
  gltf.scene.userData.patientId = preset.id;
  gltf.scene.userData.patientSeed = preset.patient?.seed ?? preset.values.seed;
  gltf.scene.userData.appearanceSeed = preset.values.seed;
  gltf.scene.userData.semanticProfile = mhrSemanticProfile(preset.values);
  body.userData.mhrIdentityBaked = true;
  body.userData.mhrPipelineVersion = PIPELINE_VERSION;
  body.userData.patientId = preset.id;
  body.userData.patientSeed = preset.patient?.seed ?? preset.values.seed;
  body.userData.appearanceSeed = preset.values.seed;
  body.userData.semanticProfile = mhrSemanticProfile(preset.values);
  const expressions = stripBakedIdentityTargets(gltf.scene);
  if (expressions !== 72) throw new Error(`Expected 72 retained expression targets; found ${expressions}`);

  const binary = await exportBinary(gltf.scene);
  const compressed = await compressRuntime(binary);
  await writeFile(cachedPath, Buffer.from(compressed));
  await copyFile(cachedPath, output);
  return { cached: false, signature, output, bytes: (await stat(output)).size, ...(await validateRuntime(output)) };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const presetPath = path.resolve(root, process.argv[2] || 'character-lab/public/presets/mrs-ostrander-1896.json');
  const preset = JSON.parse(await readFile(presetPath, 'utf8'));
  const output = path.resolve(root, process.argv[3] || `character-lab/.generated/${preset.id}-mhr.glb`);
  const result = await generateMhrRuntime({ preset, output });
  console.log(JSON.stringify({ ...result, output: path.relative(root, output) }, null, 2));
}
