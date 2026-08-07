#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'meshoptimizer';
import { createMhrExpressions } from '../../character-lab/src/expressions.js';
import { createMhrController } from '../../character-lab/src/mhr.js';

globalThis.self = globalThis;
globalThis.ProgressEvent ??= class ProgressEvent {
  constructor(type, properties = {}) { this.type = type; Object.assign(this, properties); }
};
globalThis.createImageBitmap ??= async () => ({ width: 1, height: 1, close() {} });

const [modelPath, outputPath, mode = 'semantic', rangeStart = '0'] = process.argv.slice(2);
if (!modelPath || !outputPath) {
  console.error('Usage: node render-mhr-expression-contact-sheet.mjs MODEL.glb OUTPUT.json');
  process.exit(2);
}

const data = await readFile(modelPath);
const arrayBuffer = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
const gltf = await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(arrayBuffer, '');
const values = {
  seed: 6824, gender: 0.38, age: 0.63, height: 0.5, weight: 0.46, muscle: 0.27,
  proportions: 0.5, shoulderWidth: 0, torsoLength: 0, headShape: 'oval', headShapeStrength: 0.18,
  headWidth: -0.12, faceHeight: 0.08, headDepth: 0.03, noseWidth: -0.08, noseLength: 0.05,
  noseVolume: 0, noseDepth: 0.06, noseBridge: 0.03, nostrilWidth: 0, jawWidth: -0.16,
  chinHeight: 0.02, chinProminence: -0.05, chinPrognathism: 0, eyeSize: 0.08, eyeSpacing: 0.02,
  eyeVerticalPosition: 0, eyeDepth: 0, browHeight: 0.04, mouthWidth: 0.03, mouthVerticalPosition: 0,
  mouthDepth: 0.03, lipFullness: 0.06, cheekVolume: 0.08, cheekboneProminence: 0.08,
  cheekHeight: 0.06, cheekInnerVolume: 0, african: 0.12, asian: 0.10, caucasian: 0.78,
  seated: 0, kneesTogether: 0, posture: 0, headTurn: 0, headTilt: 0, breathing: 0,
  mhrEyeSpacing: 0,
};
const controller = createMhrController(gltf.scene, values);
const expressions = createMhrExpressions(gltf.scene);
if (!controller || !expressions) throw new Error('Unable to initialize MHR identity/expression drivers');
const identityWeights = Array.from(controller.mesh.userData.mhrIdentityWeights);
let entries;
if (mode === 'atomic') {
  const start = Number(rangeStart);
  entries = Array.from({ length: Math.min(12, 72 - start) }, (_, local) => {
    const component = start + local;
    expressions.setDebugUnit(`MHR expression ${String(component).padStart(2, '0')}`, 0.65);
    expressions.update(0, component, { smile: 0, sadness: 0, fatigueExpression: 0 });
    return {
      label: `Component ${String(component).padStart(2, '0')}`,
      detail: '+0.65 signed weight',
      skinTone: '#bd8067',
      identityWeights,
      expressionWeights: Array.from(expressions.appliedWeights),
    };
  });
} else {
  const cases = [
    ['Neutral', 'resting reference', { smile: 0, sadness: 0, fatigueExpression: 0 }],
    ['Smile', 'mouth → cheek/eye', { smile: 0.82, sadness: 0, fatigueExpression: 0 }],
    ['Sadness', 'corners + inner brow', { smile: 0, sadness: 0.82, fatigueExpression: 0 }],
    ['Fatigue', 'lid droop + subtle mouth', { smile: 0, sadness: 0, fatigueExpression: 0.82 }],
  ];
  entries = cases.map(([label, detail, expressionValues], index) => {
    expressions.update(0, index, expressionValues);
    return {
      label,
      detail,
      skinTone: '#bd8067',
      identityWeights,
      expressionWeights: Array.from(expressions.appliedWeights),
    };
  });
}
await writeFile(outputPath, `${JSON.stringify({ version: 1, columns: 4, entries }, null, 2)}\n`);
console.log(`Wrote ${outputPath}`);
