import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'meshoptimizer';
import { createCostume, findBones } from '../../character-lab/src/costume.js';
import { createMhrFacialDetails } from '../../character-lab/src/facial-details.js';
import { createMhrHairFormSystem } from '../../character-lab/src/mhr-hair-forms.js';
import { createMhrController, createMhrEyeDetails, mhrSemanticProfile } from '../../character-lab/src/mhr.js';
import { createRandom, generatePatient, patientToCharacterPreset } from '../../character-lab/src/patients/index.js';
import { getOriginProfile } from '../../character-lab/src/patients/data/demographics.js';
import { prepareSkinModel, refreshSkinGeometry, updateSkinModel } from '../../character-lab/src/stylized.js';

globalThis.self = globalThis;
globalThis.ProgressEvent ??= class ProgressEvent {
  constructor(type, properties = {}) { this.type = type; Object.assign(this, properties); }
};
globalThis.createImageBitmap ??= async () => ({ width: 1, height: 1, close() {} });

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const modelPath = path.join(root, 'character-lab/public/models/comparison-mhr-lod1.glb');
const cardGroomPath = path.join(root, 'character-lab/public/models/victorian-low-bun.glb');
const basePresetPath = path.join(root, 'character-lab/public/presets/mrs-ostrander-1896.json');
const schemaPath = path.join(root, 'character-lab/public/schema/character.schema.json');
const generatedDir = path.join(root, 'character-lab/.generated/mhr-demographic-audit');

const FACE_IDS = [
  'headWidth', 'faceHeight', 'headDepth', 'headAngle', 'headBackDepth',
  'noseWidth', 'noseLength', 'noseVolume', 'noseDepth', 'noseBridge', 'noseCurve',
  'noseTipAngle', 'nostrilWidth', 'jawWidth', 'chinHeight', 'chinProminence',
  'chinPrognathism', 'eyeSize', 'eyeSpacing', 'eyeVerticalPosition', 'eyeDepth',
  'eyeHeightInner', 'eyeHeightCenter', 'eyeHeightOuter', 'epicanthus', 'eyeFold',
  'browHeight', 'browAngle', 'mouthWidth', 'mouthVerticalPosition', 'mouthDepth',
  'lipFullness', 'cupidBow', 'philtrumVolume', 'cheekVolume',
  'cheekboneProminence', 'cheekHeight', 'cheekInnerVolume', 'faceAsymmetry',
];

// Method A: the native identity seed stays fixed while linked anatomical
// systems change together. This exposes what the public semantic controls can
// genuinely do without allowing opaque PCA seed changes to take the credit.
const STRUCTURAL_RECIPES = Object.freeze([
  ['long oval / high cheekbones', 'oval', {
    headWidth: -0.58, faceHeight: 0.54, headDepth: -0.22, headAngle: -0.38,
    jawWidth: -0.72, chinHeight: 0.20, chinProminence: -0.18,
    cheekVolume: -0.38, cheekboneProminence: 0.65, cheekHeight: 0.62,
    eyeSize: 0.18, eyeSpacing: 0.02, eyeDepth: -0.26,
    noseWidth: -0.34, noseLength: 0.46, noseDepth: 0.36, noseBridge: 0.42,
    mouthWidth: 0.08, lipFullness: 0.25,
  }],
  ['compact round / full cheeks', 'round', {
    headWidth: 0.48, faceHeight: -0.52, headDepth: 0.34, headAngle: 0.20,
    jawWidth: -0.84, chinHeight: -0.72, chinProminence: -0.56,
    cheekVolume: 0.94, cheekboneProminence: -0.42, cheekHeight: -0.38,
    cheekInnerVolume: 0.58, eyeSize: 0.48, eyeSpacing: 0.22, eyeDepth: 0.18,
    noseWidth: 0.34, noseLength: -0.58, noseVolume: 0.52, noseDepth: -0.18,
    mouthWidth: 0.26, lipFullness: 0.40,
  }],
  ['heart / wide-set eyes', 'invertedtriangular', {
    headWidth: 0.28, faceHeight: 0.12, headDepth: -0.12, headAngle: -0.18,
    jawWidth: -0.92, chinHeight: -0.08, chinProminence: -0.28,
    cheekVolume: 0.34, cheekboneProminence: 0.62, cheekHeight: 0.48,
    eyeSize: 0.62, eyeSpacing: 0.58, eyeHeightOuter: 0.30, browHeight: 0.38,
    noseWidth: -0.48, noseLength: -0.04, noseDepth: 0.06,
    mouthWidth: -0.12, lipFullness: 0.42, cupidBow: 0.48,
  }],
  ['diamond / deep-set eyes', 'diamond', {
    headWidth: -0.18, faceHeight: 0.24, headDepth: 0.12, headAngle: 0.18,
    jawWidth: -0.88, chinHeight: -0.18, chinProminence: -0.14,
    cheekVolume: -0.52, cheekboneProminence: 0.65, cheekHeight: 0.64,
    cheekInnerVolume: -0.52, eyeSize: -0.18, eyeSpacing: -0.18, eyeDepth: -0.58,
    browHeight: -0.26, browAngle: 0.38, noseWidth: -0.20, noseLength: 0.28,
    noseDepth: 0.52, noseBridge: 0.52, mouthWidth: -0.18,
  }],
  ['soft pear / broad lower face', 'triangular', {
    headWidth: -0.30, faceHeight: 0.02, headDepth: 0.38, headAngle: 0.34,
    jawWidth: 0.42, chinHeight: -0.48, chinProminence: -0.42,
    chinPrognathism: -0.28, cheekVolume: 0.58, cheekboneProminence: -0.44,
    cheekHeight: -0.34, cheekInnerVolume: 0.48, eyeSize: 0.10, eyeSpacing: -0.28,
    noseWidth: 0.26, noseLength: -0.34, noseDepth: -0.24,
    mouthWidth: 0.40, lipFullness: 0.52,
  }],
  ['broad cheekbones / short nose', 'diamond', {
    headWidth: 0.46, faceHeight: -0.18, headDepth: 0.14, headAngle: -0.20,
    jawWidth: -0.54, chinHeight: -0.38, chinProminence: -0.12,
    cheekVolume: 0.72, cheekboneProminence: 0.58, cheekHeight: 0.42,
    cheekInnerVolume: 0.38, eyeSize: 0.22, eyeSpacing: 0.36, eyeDepth: -0.12,
    noseWidth: 0.42, noseLength: -0.62, noseVolume: 0.30, noseDepth: -0.34,
    nostrilWidth: 0.32, mouthWidth: 0.16, lipFullness: 0.28,
  }],
  ['long aquiline / narrow planes', 'rectangular', {
    headWidth: -0.52, faceHeight: 0.55, headDepth: 0.02, headAngle: -0.44,
    jawWidth: -0.38, chinHeight: 0.36, chinProminence: 0.12,
    cheekVolume: -0.62, cheekboneProminence: 0.42, cheekHeight: 0.34,
    cheekInnerVolume: -0.46, eyeSize: -0.30, eyeSpacing: -0.30, eyeDepth: -0.55,
    noseWidth: -0.36, noseLength: 0.96, noseDepth: 0.92, noseBridge: 0.74,
    noseCurve: 0.82, noseTipAngle: -0.38, mouthWidth: -0.26, lipFullness: 0.08,
  }],
  ['small-featured / button nose', 'oval', {
    headWidth: -0.08, faceHeight: -0.36, headDepth: -0.18, headAngle: 0.08,
    jawWidth: -0.58, chinHeight: -0.58, chinProminence: -0.36,
    cheekVolume: 0.20, cheekboneProminence: 0.12, cheekHeight: 0.10,
    eyeSize: 0.64, eyeSpacing: -0.08, eyeDepth: 0.12, eyeHeightCenter: 0.34,
    noseWidth: -0.48, noseLength: -0.76, noseVolume: -0.58, noseDepth: -0.48,
    noseTipAngle: 0.56, mouthWidth: -0.36, lipFullness: 0.48,
  }],
]);

async function loadModel() {
  const data = await readFile(modelPath);
  const arrayBuffer = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
  return new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(arrayBuffer, '');
}

async function loadGlb(assetPath) {
  const data = await readFile(assetPath);
  const arrayBuffer = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
  return new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(arrayBuffer, '');
}

const basePreset = JSON.parse(await readFile(basePresetPath, 'utf8'));
const schema = JSON.parse(await readFile(schemaPath, 'utf8'));
const definitions = schema.groups.flatMap((group) => group.parameters.map((parameter) => ({
  ...parameter, mode: parameter.mode || group.mode,
})));
const definitionById = new Map(definitions.map((definition) => [definition.id, definition]));
const gltf = await loadModel();
const cardGroom = await loadGlb(cardGroomPath);
const body = gltf.scene.getObjectByName('body_mesh');
if (!body) throw new Error('MHR master does not contain body_mesh');
const controller = createMhrController(gltf.scene, structuredClone(basePreset.values));
if (!controller) throw new Error('MHR controller could not inspect the authoring master');
prepareSkinModel(gltf.scene, basePreset.values);
const bones = findBones(gltf.scene);
const eyeDetails = createMhrEyeDetails(gltf.scene, basePreset.values);
const facialDetails = createMhrFacialDetails(gltf.scene, basePreset.values);
const hairForms = createMhrHairFormSystem(gltf.scene, bones, gltf.scene);
const costume = createCostume(gltf.scene, bones, gltf.scene);

const cardGroomMeshes = [];
cardGroom.scene.traverse((object) => {
  if (object.isMesh && object.geometry?.attributes?.position) cardGroomMeshes.push(object);
});

const APPEARANCE = Object.freeze([
  { skinTone: '#f0c4ad', hairColor: '#2a1811', eyeColor: '#526779', dressColor: '#293a4a', trimColor: '#b9aa8b', freckles: 0.18, pigment: 0.22 },
  { skinTone: '#e9b69c', hairColor: '#6a2f1c', eyeColor: '#657044', dressColor: '#4b2532', trimColor: '#c1a97e', freckles: 0.42, pigment: 0.34 },
  { skinTone: '#f3cfba', hairColor: '#a8753f', eyeColor: '#66859a', dressColor: '#2d493f', trimColor: '#d0bb94', freckles: 0.10, pigment: 0.18 },
  { skinTone: '#dca487', hairColor: '#241713', eyeColor: '#49382a', dressColor: '#3f304f', trimColor: '#b7a678', freckles: 0.05, pigment: 0.38 },
  { skinTone: '#edbea3', hairColor: '#4b3023', eyeColor: '#77705c', dressColor: '#34404f', trimColor: '#c5b68f', freckles: 0.26, pigment: 0.30 },
  { skinTone: '#d99b7c', hairColor: '#160f0d', eyeColor: '#4b6659', dressColor: '#4c3230', trimColor: '#c4ad82', freckles: 0.08, pigment: 0.42 },
  { skinTone: '#f2c8b0', hairColor: '#7a4d2d', eyeColor: '#535f75', dressColor: '#29433b', trimColor: '#b9a67f', freckles: 0.36, pigment: 0.28 },
  { skinTone: '#e4aa8d', hairColor: '#3a2118', eyeColor: '#6a5338', dressColor: '#40334c', trimColor: '#c7b38e', freckles: 0.14, pigment: 0.36 },
]);

function mixHex(left, right, amount) {
  const a = new THREE.Color(left);
  return `#${a.lerp(new THREE.Color(right), amount).getHexString(THREE.SRGBColorSpace)}`;
}

function applyAppearance(values, index) {
  const appearance = APPEARANCE[index % APPEARANCE.length];
  Object.assign(values, {
    skinTone: appearance.skinTone,
    hairColor: appearance.hairColor,
    hairStyle: 'center-parted-bun',
    eyeColor: appearance.eyeColor,
    dressColor: appearance.dressColor,
    trimColor: appearance.trimColor,
    outfitStyle: index % 3 === 1 ? 'visiting-dress' : index % 3 === 2 ? 'working-day' : 'conservative-day',
    fabricRoughness: 0.78,
    sleeveVolume: 0.62 + (index % 3) * 0.10,
    collarHeight: 0.58 + (index % 3) * 0.09,
    collarSpread: 0.84 + (index % 3) * 0.08,
    browColor: mixHex(appearance.hairColor, '#1a100c', 0.34),
    lashColor: mixHex(appearance.hairColor, '#080605', 0.72),
    hairVolume: 0.88 + (index % 4) * 0.11,
    hairHeight: 0.84 + ((index * 3) % 5) * 0.08,
    sideVolume: 0.82 + ((index * 5) % 4) * 0.12,
    partWidth: 0.18 + (index % 3) * 0.12,
    bunSize: 0.82 + ((index * 2) % 5) * 0.10,
    waveAmount: 0.25 + (index % 4) * 0.13,
    strandContrast: 0.30 + (index % 4) * 0.12,
    greyAmount: 0,
    browDensity: 0.62 + (index % 3) * 0.10,
    browThickness: 0.78 + (index % 4) * 0.10,
    browArch: -0.18 + (index % 5) * 0.10,
    lashDensity: 0.78 + (index % 3) * 0.07,
    lashLength: 1.00 + (index % 4) * 0.06,
    mhrScleraColor: mixHex('#ded3c8', appearance.skinTone, 0.10),
    mhrScleraBrightness: 0.22 + (index % 3) * 0.035,
    // Keep the complete globe behind the topology-cut eyelid aperture. The
    // previous presentation override pushed an oversized sphere forward,
    // making the iris/sclera project through the lids like a sticker.
    mhrEyeGlobeScale: 0.74,
    mhrEyeDepth: -4.8,
    mhrEyeVertical: 0,
    mhrIrisScale: 0.98 + (index % 4) * 0.035,
    mhrPupilScale: 0.88 + (index % 3) * 0.07,
    stylizedPlaneContrast: 0.22 + (index % 4) * 0.04,
    stylizedSkinDetail: 0.16 + (index % 4) * 0.07,
    stylizedPoreScale: 0.72 + (index % 4) * 0.14,
    stylizedPigmentVariation: appearance.pigment,
    stylizedFreckleAmount: appearance.freckles,
    stylizedSkinWarmth: 0.22 + (index % 4) * 0.06,
    stylizedCheekBlush: 0.28 + (index % 4) * 0.08,
    stylizedNoseRedness: 0.12 + (index % 3) * 0.07,
    stylizedUnderEyeDepth: 0.10 + (index % 4) * 0.04,
    stylizedAgeSpots: 0,
    stylizedLipTint: 0.46 + (index % 4) * 0.08,
    stylizedSurfaceRoughness: 0.68 + (index % 3) * 0.07,
  });
  return values;
}

function clampValue(id, value) {
  const definition = definitionById.get(id);
  if (!definition || definition.type !== 'range') return value;
  return Math.max(definition.min, Math.min(definition.max, value));
}

function patientPreset(seed, age) {
  const patient = generatePatient({ seed, sex: 'female' });
  const origin = getOriginProfile('old-stock-american');
  patient.identity.age = age;
  patient.identity.birthYear = 1896 - age;
  patient.identity.origin = { ...patient.identity.origin, id: origin.id, label: origin.label };
  return patientToCharacterPreset(patient, basePreset, definitions, { appearanceSeed: seed });
}

function neutralFace(values) {
  for (const id of FACE_IDS) values[id] = id === 'faceAsymmetry' ? 0.04 : 0;
  Object.assign(values, {
    gender: 0.02, age: 0.55, african: 0, asian: 0, caucasian: 1,
    headShape: 'oval', headShapeStrength: 0.15, weight: 0.49, muscle: 0.25,
    height: 0.46, proportions: 0.5, shoulderWidth: -0.20, seated: 0,
  });
  return values;
}

function applyRecipe(values, headShape, targets) {
  neutralFace(values);
  values.headShape = headShape;
  values.headShapeStrength = 0.72;
  for (const [id, value] of Object.entries(targets)) values[id] = clampValue(id, value);
  return values;
}

// Duplicate the controller's deterministic native head draw so seed selection
// can happen cheaply in the same 20-dimensional subspace it actually renders.
function nativeIdentityVector(seed) {
  const random = createRandom(seed, 'renderer.mhr.identity.v3');
  return Array.from({ length: 45 }, (_, component) => {
    const strength = component < 20 ? 0.60 : component < 40 ? 1.12 : 0.42;
    const broad = random.bell() * 1.12 + random.between(-1, 1) * 0.42;
    return Math.max(-1.98, Math.min(1.98, broad * strength));
  });
}

function buildFacialShapeGram() {
  const position = body.geometry.attributes.position;
  const targets = body.geometry.morphAttributes.position || [];
  body.geometry.computeBoundingBox();
  const box = body.geometry.boundingBox;
  const height = box.max.y - box.min.y;
  const headMinY = box.max.y - height * 0.18;
  let headMinZ = Infinity;
  let headMaxZ = -Infinity;
  for (let vertex = 0; vertex < position.count; vertex += 1) {
    if (position.getY(vertex) < headMinY) continue;
    headMinZ = Math.min(headMinZ, position.getZ(vertex));
    headMaxZ = Math.max(headMaxZ, position.getZ(vertex));
  }
  const headDepth = headMaxZ - headMinZ;
  const vertices = [];
  for (let vertex = 0; vertex < position.count; vertex += 1) {
    if (position.getY(vertex) < headMinY) continue;
    if (position.getZ(vertex) < headMaxZ - headDepth * 0.48) continue;
    vertices.push(vertex);
  }
  if (vertices.length < 10) throw new Error(`Facial shape metric selected only ${vertices.length} vertices`);
  const baseMeans = [0, 0, 0];
  for (const vertex of vertices) {
    baseMeans[0] += position.getX(vertex);
    baseMeans[1] += position.getY(vertex);
    baseMeans[2] += position.getZ(vertex);
  }
  for (let axis = 0; axis < 3; axis += 1) baseMeans[axis] /= vertices.length;
  const baseVariances = [0, 0, 0];
  for (const vertex of vertices) {
    baseVariances[0] += (position.getX(vertex) - baseMeans[0]) ** 2;
    baseVariances[1] += (position.getY(vertex) - baseMeans[1]) ** 2;
    baseVariances[2] += (position.getZ(vertex) - baseMeans[2]) ** 2;
  }

  // Remove translation and independent x/y/z scale from every source mode.
  // The remaining Gram matrix rewards changed orbital, zygomatic, nasal and
  // lower-face construction instead of merely selecting a taller/wider head.
  const residuals = targets.slice(0, 45).map((target) => {
    const deltaMeans = [0, 0, 0];
    for (const vertex of vertices) {
      deltaMeans[0] += target.getX(vertex);
      deltaMeans[1] += target.getY(vertex);
      deltaMeans[2] += target.getZ(vertex);
    }
    for (let axis = 0; axis < 3; axis += 1) deltaMeans[axis] /= vertices.length;
    const scales = [0, 0, 0];
    for (const vertex of vertices) {
      scales[0] += (position.getX(vertex) - baseMeans[0]) * (target.getX(vertex) - deltaMeans[0]);
      scales[1] += (position.getY(vertex) - baseMeans[1]) * (target.getY(vertex) - deltaMeans[1]);
      scales[2] += (position.getZ(vertex) - baseMeans[2]) * (target.getZ(vertex) - deltaMeans[2]);
    }
    for (let axis = 0; axis < 3; axis += 1) scales[axis] /= Math.max(1e-12, baseVariances[axis]);
    const result = new Float64Array(vertices.length * 3);
    for (let index = 0; index < vertices.length; index += 1) {
      const vertex = vertices[index];
      result[index * 3] = target.getX(vertex) - deltaMeans[0]
        - scales[0] * (position.getX(vertex) - baseMeans[0]);
      result[index * 3 + 1] = target.getY(vertex) - deltaMeans[1]
        - scales[1] * (position.getY(vertex) - baseMeans[1]);
      result[index * 3 + 2] = target.getZ(vertex) - deltaMeans[2]
        - scales[2] * (position.getZ(vertex) - baseMeans[2]);
    }
    return result;
  });
  return residuals.map((left) => residuals.map((right) => {
    let dot = 0;
    for (let offset = 0; offset < left.length; offset += 1) dot += left[offset] * right[offset];
    return dot / vertices.length;
  }));
}

function gramDistance(left, right, gram) {
  const delta = left.map((value, index) => value - right[index]);
  let total = 0;
  for (let row = 0; row < delta.length; row += 1) {
    for (let column = 0; column < delta.length; column += 1) {
      total += delta[row] * gram[row][column] * delta[column];
    }
  }
  return Math.sqrt(Math.max(0, total));
}

function selectSeparatedSeeds(count = 8) {
  const gram = buildFacialShapeGram();
  const candidates = [];
  const zero = Array(45).fill(0);
  for (let seed = 6100; seed < 10100; seed += 1) {
    const vector = nativeIdentityVector(seed);
    candidates.push({ seed, vector, norm: gramDistance(vector, zero, gram) });
  }
  const ranked = candidates.map((candidate) => candidate.norm).sort((a, b) => a - b);
  const minimum = ranked[Math.floor(ranked.length * 0.35)];
  const maximum = ranked[Math.floor(ranked.length * 0.98)];
  const eligible = candidates.filter((candidate) => candidate.norm >= minimum && candidate.norm <= maximum);
  const median = ranked[Math.floor(ranked.length * 0.62)];
  const selected = [eligible.reduce((best, item) => (
    Math.abs(item.norm - median) < Math.abs(best.norm - median) ? item : best
  ))];
  while (selected.length < count) {
    let best = null;
    let bestScore = -Infinity;
    for (const candidate of eligible) {
      if (selected.includes(candidate)) continue;
      const nearest = Math.min(...selected.map((item) => gramDistance(candidate.vector, item.vector, gram)));
      if (nearest > bestScore) { best = candidate; bestScore = nearest; }
    }
    selected.push(best);
  }
  return selected;
}

function percentile(items, amount, fallback) {
  if (items.length < 20) return fallback;
  items.sort((a, b) => a - b);
  return items[Math.round((items.length - 1) * amount)];
}

function fitCardGroom() {
  gltf.scene.updateMatrixWorld(true);
  const head = bones.head.getWorldPosition(new THREE.Vector3());
  const neck = bones.neck?.getWorldPosition(new THREE.Vector3())
    || head.clone().add(new THREE.Vector3(0, -0.08, 0));
  const up = head.clone().sub(neck).normalize();
  const forward = new THREE.Vector3(0, 0, 1).transformDirection(gltf.scene.matrixWorld);
  forward.addScaledVector(up, -forward.dot(up));
  if (forward.lengthSq() < 1e-8) forward.set(0, 0, 1);
  forward.normalize();
  const right = new THREE.Vector3().crossVectors(up, forward).normalize();
  const landmarks = body.geometry.userData.faceLandmarks;
  const source = body.geometry.attributes.position;
  const samples = { right: [], up: [], forward: [] };
  const point = new THREE.Vector3();
  const cutoff = landmarks ? landmarks.mouthY - landmarks.eyeSpan * 0.72 : 1.44;
  for (let vertex = 0; vertex < source.count; vertex += 1) {
    if (source.getY(vertex) < cutoff) continue;
    body.getVertexPosition(vertex, point).applyMatrix4(body.matrixWorld).sub(head);
    samples.right.push(point.dot(right));
    samples.up.push(point.dot(up));
    samples.forward.push(point.dot(forward));
  }
  const left = percentile(samples.right, 0.025, -0.084);
  const rightEdge = percentile(samples.right, 0.975, 0.084);
  const bottom = percentile(samples.up, 0.025, 0.0);
  const top = percentile(samples.up, 0.995, 0.212);
  const back = percentile(samples.forward, 0.025, -0.094);
  const front = percentile(samples.forward, 0.91, 0.094);
  const scale = new THREE.Vector3(
    THREE.MathUtils.clamp((rightEdge - left) / 0.192, 0.84, 1.18),
    // The exported groom is relative to the sample head joint: its crown is
    // only 0.16 m above that origin. Compare like with like rather than using
    // the full mouth-to-crown span, which previously dropped its hairline over
    // the subject's eyes.
    THREE.MathUtils.clamp(top / 0.160, 1.18, 1.48),
    // The reference scalp proxy includes substantially more facial depth than
    // MHR's cranium. Keep the cards behind the brow instead of scaling them to
    // the nose-to-occiput extent.
    THREE.MathUtils.clamp((front - back) / 0.270, 0.68, 0.90),
  );
  const basis = new THREE.Matrix4().makeBasis(right, up, forward);
  cardGroom.scene.position.copy(head).addScaledVector(up, 0.058).addScaledVector(forward, -0.010);
  cardGroom.scene.quaternion.setFromRotationMatrix(basis);
  cardGroom.scene.scale.copy(scale);
  cardGroom.scene.updateMatrixWorld(true);
}

function entryFromValues(values, label, detail, seed, { presentation = false } = {}) {
  controller.applyValues(values, { forceIdentity: true, snapPose: true });
  refreshSkinGeometry(gltf.scene, values);
  updateSkinModel(gltf.scene, values);
  eyeDetails?.update(values);
  facialDetails?.rebuild(values);
  if (presentation) {
    costume.rebuild(values);
    fitCardGroom();
  } else {
    hairForms.rebuild(values);
  }
  gltf.scene.updateMatrixWorld(true);
  const finalPosition = body.geometry.attributes.position.array;
  const skinMultiplier = body.geometry.attributes.color;
  const skinBase = new THREE.Color(values.skinTone);
  const skinColors = new Float32Array(body.geometry.attributes.position.count * 3);
  for (let vertex = 0; vertex < body.geometry.attributes.position.count; vertex += 1) {
    skinColors[vertex * 3] = skinBase.r * (skinMultiplier?.getX(vertex) ?? 1);
    skinColors[vertex * 3 + 1] = skinBase.g * (skinMultiplier?.getY(vertex) ?? 1);
    skinColors[vertex * 3 + 2] = skinBase.b * (skinMultiplier?.getZ(vertex) ?? 1);
  }
  const presentationMeshes = presentation ? [
    ...cardGroomMeshes.filter((mesh) => !mesh.name.includes('Scalp')).map((mesh) => ({
      mesh,
      options: {
        kind: mesh.name.includes('Scalp') ? 'hair-root' : 'hair-card',
        color: values.hairColor,
      },
    })),
  ] : hairForms.pieces().map((mesh) => ({ mesh, options: {} }));
  const detailMeshes = [
    ...presentationMeshes,
    ...(facialDetails?.meshes || []),
    ...(eyeDetails?.groups.flatMap((group) => group.children.filter((child) => child.isMesh)) || []),
  ].map((item) => item?.mesh ? item : { mesh: item, options: {} })
    .filter(({ mesh }) => !mesh.name.includes('Cornea'))
    .map(({ mesh, options }) => serializeMesh(mesh, options));
  const visibleGroup = body.geometry.groups.find((group) => group.materialIndex === 0);
  const visibleIndices = visibleGroup
    ? body.geometry.index.array.slice(visibleGroup.start, visibleGroup.start + visibleGroup.count)
    : body.geometry.index.array;
  return {
    label, detail, seed, skinTone: values.skinTone,
    dressColor: values.dressColor,
    trimColor: values.trimColor,
    surface: {
      roughness: values.stylizedSurfaceRoughness,
      detail: values.stylizedSkinDetail,
      poreScale: values.stylizedPoreScale,
    },
    semanticProfile: mhrSemanticProfile(values),
    identityWeights: [...body.userData.mhrIdentityWeights],
    localizedRequests: body.userData.mhrLocalizedRequests,
    positionBase64: Buffer.from(
      finalPosition.buffer, finalPosition.byteOffset, finalPosition.byteLength,
    ).toString('base64'),
    visibleIndexBase64: Buffer.from(Uint32Array.from(visibleIndices).buffer).toString('base64'),
    skinColorBase64: Buffer.from(skinColors.buffer).toString('base64'),
    detailMeshes,
  };
}

function serializeMesh(mesh, overrides = {}) {
  mesh.updateWorldMatrix(true, false);
  const source = mesh.geometry.attributes.position;
  const positions = new Float32Array(source.count * 3);
  const point = new THREE.Vector3();
  for (let vertex = 0; vertex < source.count; vertex += 1) {
    point.fromBufferAttribute(source, vertex).applyMatrix4(mesh.matrixWorld);
    positions[vertex * 3] = point.x;
    positions[vertex * 3 + 1] = point.y;
    positions[vertex * 3 + 2] = point.z;
  }
  const sourceIndex = mesh.geometry.index?.array
    || Uint32Array.from({ length: source.count }, (_, index) => index);
  const colors = mesh.geometry.attributes.color;
  const uvs = mesh.geometry.attributes.uv;
  const material = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
  return {
    name: mesh.name,
    positionBase64: Buffer.from(positions.buffer).toString('base64'),
    indexBase64: Buffer.from(Uint32Array.from(sourceIndex).buffer).toString('base64'),
    colorBase64: colors
      ? Buffer.from(colors.array.buffer, colors.array.byteOffset, colors.array.byteLength).toString('base64')
      : null,
    uvBase64: uvs
      ? Buffer.from(uvs.array.buffer, uvs.array.byteOffset, uvs.array.byteLength).toString('base64')
      : null,
    kind: overrides.kind || 'detail',
    color: overrides.color
      || (material?.color ? `#${material.color.getHexString(THREE.SRGBColorSpace)}` : '#241711'),
    roughness: material?.roughness ?? (mesh.name.includes('Lash') || mesh.name.includes('Brow') ? 1 : 0.72),
  };
}

function structuralEntries() {
  // User-reviewed clean identities. Deliberately omit the seed that recreated
  // the masculine MHR mean and pair the aquiline recipe with a seam-free head.
  const acceptedSeeds = [7377, 9632, 7885, 6660, 9853, 9086, 6840, 8007];
  return STRUCTURAL_RECIPES.map(([label, headShape, recipe], index) => {
    const age = 21 + (index % 8);
    const seed = acceptedSeeds[index];
    const values = applyAppearance(
      applyRecipe(structuredClone(patientPreset(seed, age).values), headShape, recipe), index,
    );
    values.mhrNativeFaceStrength = 1.12;
    return entryFromValues(values, label, `woman · ${age} · linked anatomy + seed ${seed}`, seed);
  });
}

function presentationEntries() {
  const acceptedSeeds = [7377, 9632, 7885, 6660, 9853, 9086, 6840, 8007];
  return STRUCTURAL_RECIPES.map(([label, headShape, recipe], index) => {
    const age = 21 + index;
    const seed = acceptedSeeds[index];
    const values = applyAppearance(
      applyRecipe(structuredClone(patientPreset(seed, age).values), headShape, recipe), index,
    );
    values.mhrNativeFaceStrength = 1.12;
    return entryFromValues(
      values,
      label,
      `woman · ${age} · seed ${seed}`,
      seed,
      { presentation: true },
    );
  });
}

function latentEntries() {
  return selectSeparatedSeeds().map(({ seed, norm }, index) => {
    const age = 21 + index;
    const generated = patientPreset(seed, age).values;
    const values = neutralFace(structuredClone(generated));
    values.mhrNativeFaceStrength = 1.52;
    // Retain only a faint, seed-specific semantic trace. The native MHR head
    // modes—not our shared face masks—must account for almost all difference.
    for (const id of FACE_IDS) {
      if (id === 'faceAsymmetry') continue;
      values[id] = clampValue(id, (Number(generated[id]) || 0) * 0.12);
    }
    return entryFromValues(
      values, `native identity ${index + 1}`, `woman · ${age} · seed ${seed} · shape score ${(norm * 1000).toFixed(2)}`, seed,
    );
  });
}

await mkdir(generatedDir, { recursive: true });
const outputs = [
  ['semantic-structures', structuralEntries()],
  ['separated-native-seeds', latentEntries()],
  ['card-groom-presentation', presentationEntries()],
];
for (const [profile, entries] of outputs) {
  const manifestPath = path.join(generatedDir, `manifest-young-white-women-${profile}.json`);
  await writeFile(manifestPath, `${JSON.stringify({ version: 1, profile, columns: 4, entries }, null, 2)}\n`);
  console.log(JSON.stringify({ profile, entries: entries.length, manifest: path.relative(root, manifestPath) }));
}
