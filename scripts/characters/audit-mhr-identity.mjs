import { readFile } from 'node:fs/promises';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'meshoptimizer';
import { createMhrController } from '../../character-lab/src/mhr.js';

globalThis.self = globalThis;
globalThis.ProgressEvent ??= class ProgressEvent {
  constructor(type, properties = {}) { this.type = type; Object.assign(this, properties); }
};
globalThis.createImageBitmap ??= async () => ({ width: 1, height: 1, close() {} });

const modelUrl = new URL('../../character-lab/public/models/comparison-mhr-lod1.glb', import.meta.url);

async function loadModel() {
  const data = await readFile(modelUrl);
  const arrayBuffer = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
  return new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(arrayBuffer, '');
}

function difference(left, right) {
  let squared = 0;
  let maximum = 0;
  for (let index = 0; index < left.length; index += 1) {
    const delta = Math.abs(left[index] - right[index]);
    squared += delta * delta;
    maximum = Math.max(maximum, delta);
  }
  return { rms: Math.sqrt(squared / left.length), maximum };
}

function baseValues(overrides = {}) {
  return {
    seed: 2665, gender: 0.5, age: 0.68, height: 0.5, weight: 0.5, muscle: 0.35,
    proportions: 0.5, shoulderWidth: 0, torsoLength: 0, headShape: 'oval', headShapeStrength: 0,
    african: 0, asian: 0, caucasian: 1, seated: 0, kneesTogether: 0, posture: 0,
    headTurn: 0, headTilt: 0, breathing: 0, breathingRate: 13,
    ...overrides,
  };
}

const gltf = await loadModel();
const body = gltf.scene.getObjectByName('body_mesh');
const values = baseValues();
const controller = createMhrController(gltf.scene, values);

function capture(overrides) {
  Object.assign(values, baseValues(overrides));
  controller.applyValues(values, { forceIdentity: true });
  return {
    position: new Float32Array(body.geometry.attributes.position.array),
    weights: [...body.userData.mhrIdentityWeights],
    profile: structuredClone(body.userData.mhrSemanticProfile),
  };
}

const female = capture({ gender: 0 });
const male = capture({ gender: 1 });
const african = capture({ african: 1, asian: 0, caucasian: 0 });
const asian = capture({ african: 0, asian: 1, caucasian: 0 });
const european = capture({ african: 0, asian: 0, caucasian: 1 });

console.log(JSON.stringify({
  model: 'Meta MHR LOD1',
  seed: values.seed,
  directionSamples: {
    head: Object.fromEntries(Object.entries(controller.directions).filter(([name]) => name !== 'body').map(([name, direction]) => [name, direction.samples])),
    body: Object.fromEntries(Object.entries(controller.directions.body).map(([name, direction]) => [name, direction.samples])),
  },
  presentation: {
    femaleVsMaleGeometry: difference(female.position, male.position),
    femaleVsMaleCoefficients: difference(female.weights, male.weights),
  },
  ancestry: {
    africanVsEuropeanGeometry: difference(african.position, european.position),
    africanVsEuropeanCoefficients: difference(african.weights, european.weights),
    asianVsEuropeanGeometry: difference(asian.position, european.position),
    asianVsEuropeanCoefficients: difference(asian.weights, european.weights),
  },
  profiles: { female: female.profile, male: male.profile, african: african.profile, asian: asian.profile },
}, null, 2));
