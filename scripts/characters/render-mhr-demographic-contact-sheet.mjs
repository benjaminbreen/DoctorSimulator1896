import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'meshoptimizer';
import { createMhrController, mhrSemanticProfile } from '../../character-lab/src/mhr.js';

globalThis.self = globalThis;
globalThis.ProgressEvent ??= class ProgressEvent {
  constructor(type, properties = {}) { this.type = type; Object.assign(this, properties); }
};
globalThis.createImageBitmap ??= async () => ({ width: 1, height: 1, close() {} });

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const modelPath = path.join(root, 'character-lab/public/models/comparison-mhr-lod1.glb');
const basePresetPath = path.join(root, 'character-lab/public/presets/mrs-ostrander-1896.json');
const generatedDir = path.join(root, 'character-lab/.generated/mhr-demographic-audit');
const manifestPath = path.join(generatedDir, 'manifest.json');
const outputPath = path.join(root, 'mockups/character-engine-comparison/mhr-demographic-contact-sheet-2026-08-06.png');

const CASES = [
  { label: 'European American', detail: 'woman · 24', seed: 1701, skinTone: '#c99477', gender: 0.08, age: 0.56, weight: 0.42, muscle: 0.22, ancestry: [0.01, 0.01, 0.98] },
  { label: 'European American', detail: 'man · 55', seed: 1702, skinTone: '#b9795e', gender: 0.92, age: 0.76, weight: 0.62, muscle: 0.42, ancestry: [0.01, 0.01, 0.98] },
  { label: 'African American', detail: 'woman · 38', seed: 2701, skinTone: '#704434', gender: 0.08, age: 0.66, weight: 0.55, muscle: 0.27, ancestry: [0.86, 0.03, 0.11] },
  { label: 'African American', detail: 'man · 66', seed: 2702, skinTone: '#5f382b', gender: 0.92, age: 0.84, weight: 0.48, muscle: 0.38, ancestry: [0.88, 0.02, 0.10] },
  { label: 'Chinese American', detail: 'woman · 29', seed: 3701, skinTone: '#c78e69', gender: 0.08, age: 0.59, weight: 0.38, muscle: 0.20, ancestry: [0.01, 0.95, 0.04] },
  { label: 'Chinese American', detail: 'man · 52', seed: 3702, skinTone: '#b77b5b', gender: 0.92, age: 0.74, weight: 0.57, muscle: 0.34, ancestry: [0.01, 0.95, 0.04] },
  { label: 'Mixed ancestry', detail: 'woman · 45', seed: 4701, skinTone: '#9f674f', gender: 0.08, age: 0.70, weight: 0.68, muscle: 0.25, ancestry: [0.48, 0.10, 0.42] },
  { label: 'Mixed ancestry', detail: 'man · 70', seed: 4702, skinTone: '#8d5a46', gender: 0.92, age: 0.88, weight: 0.44, muscle: 0.31, ancestry: [0.32, 0.18, 0.50] },
];

async function loadModel() {
  const data = await readFile(modelPath);
  const arrayBuffer = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
  return new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(arrayBuffer, '');
}

function neutralizeFace(values) {
  for (const key of [
    'headWidth', 'faceHeight', 'headDepth', 'noseWidth', 'noseLength', 'noseVolume', 'noseDepth',
    'noseBridge', 'nostrilWidth', 'jawWidth', 'chinHeight', 'chinProminence', 'chinPrognathism',
    'eyeSize', 'eyeSpacing', 'eyeVerticalPosition', 'eyeDepth', 'browHeight', 'mouthWidth',
    'mouthVerticalPosition', 'mouthDepth', 'lipFullness', 'cheekVolume', 'cheekboneProminence',
    'cheekHeight', 'cheekInnerVolume',
  ]) values[key] = 0;
  Object.assign(values, {
    height: 0.5, proportions: 0.5, shoulderWidth: 0, torsoLength: 0,
    headShape: 'oval', headShapeStrength: 0, seated: 0,
  });
  return values;
}

const basePreset = JSON.parse(await readFile(basePresetPath, 'utf8'));
const gltf = await loadModel();
const body = gltf.scene.getObjectByName('body_mesh');
if (!body) throw new Error('MHR master does not contain body_mesh');
const working = neutralizeFace(structuredClone(basePreset.values));
const controller = createMhrController(gltf.scene, working);
if (!controller) throw new Error('MHR controller could not inspect the authoring master');

const entries = CASES.map((definition) => {
  const values = neutralizeFace(structuredClone(working));
  const [african, asian, caucasian] = definition.ancestry;
  Object.assign(values, {
    seed: definition.seed,
    gender: definition.gender,
    age: definition.age,
    weight: definition.weight,
    muscle: definition.muscle,
    skinTone: definition.skinTone,
    african, asian, caucasian,
  });
  controller.applyValues(values, { forceIdentity: true, snapPose: true });
  return {
    label: definition.label,
    detail: definition.detail,
    seed: definition.seed,
    skinTone: definition.skinTone,
    semanticProfile: mhrSemanticProfile(values),
    identityWeights: [...body.userData.mhrIdentityWeights],
  };
});

await mkdir(generatedDir, { recursive: true });
await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(manifestPath, `${JSON.stringify({ version: 1, entries }, null, 2)}\n`);
console.log(JSON.stringify({
  imageTarget: path.relative(root, outputPath),
  manifest: path.relative(root, manifestPath),
  entries: entries.length,
}, null, 2));
