import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'meshoptimizer';
import { createMhrController, mhrSemanticProfile } from '../../character-lab/src/mhr.js';
import { createRandom, generatePatient, patientToCharacterPreset } from '../../character-lab/src/patients/index.js';
import { getOriginProfile } from '../../character-lab/src/patients/data/demographics.js';

globalThis.self = globalThis;
globalThis.ProgressEvent ??= class ProgressEvent {
  constructor(type, properties = {}) { this.type = type; Object.assign(this, properties); }
};
globalThis.createImageBitmap ??= async () => ({ width: 1, height: 1, close() {} });

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const modelPath = path.join(root, 'character-lab/public/models/comparison-mhr-lod1.glb');
const basePresetPath = path.join(root, 'character-lab/public/presets/mrs-ostrander-1896.json');
const schemaPath = path.join(root, 'character-lab/public/schema/character.schema.json');
const generatedDir = path.join(root, 'character-lab/.generated/mhr-demographic-audit');
const outputDir = path.join(root, 'mockups/character-engine-comparison');

const PROFILE_OUTPUTS = Object.freeze({
  runtime: {
    manifest: 'manifest.json',
    image: 'mhr-representation-cohorts-2026-08-07.png',
  },
  conservative: {
    manifest: 'manifest-expanded-conservative.json',
    image: 'mhr-representation-cohorts-expanded-conservative-2026-08-07.png',
  },
  bold: {
    manifest: 'manifest-expanded-bold.json',
    image: 'mhr-representation-cohorts-expanded-bold-2026-08-07.png',
  },
  revised: {
    manifest: 'manifest-revised-bold-v2.json',
    image: 'mhr-representation-cohorts-revised-bold-v2-2026-08-07.png',
  },
  distinctive: {
    manifest: 'manifest-distinctive-faces-v3.json',
    image: 'mhr-representation-cohorts-distinctive-faces-v3-2026-08-07.png',
  },
});

const MARKER_GROUPS = Object.freeze({
  cranial: ['headWidth', 'faceHeight', 'headDepth', 'headAngle', 'headBackDepth'],
  eyes: [
    'eyeSize', 'eyeSpacing', 'eyeVerticalPosition', 'eyeDepth', 'eyeHeightInner', 'eyeHeightCenter',
    'eyeHeightOuter', 'epicanthus', 'eyeFold', 'browHeight', 'browAngle',
  ],
  nose: ['noseWidth', 'noseLength', 'noseVolume', 'noseDepth', 'noseBridge', 'noseCurve', 'noseTipAngle', 'nostrilWidth'],
  mouth: ['mouthWidth', 'mouthVerticalPosition', 'mouthDepth', 'lipFullness', 'cupidBow', 'philtrumVolume'],
  cheeks: ['cheekVolume', 'cheekboneProminence', 'cheekHeight', 'cheekInnerVolume'],
  lowerFace: ['jawWidth', 'chinHeight', 'chinProminence', 'chinPrognathism'],
});

const PROFILE_CALIBRATION = Object.freeze({
  conservative: Object.freeze({
    cranial: [1.08, 0.150], eyes: [1.18, 0.420], nose: [1.18, 0.500],
    mouth: [1.12, 0.320], cheeks: [1.12, 0.300], lowerFace: [1.02, 0.080],
  }),
  bold: Object.freeze({
    cranial: [1.12, 0.500], eyes: [1.25, 2.400], nose: [1.25, 2.600],
    mouth: [1.18, 1.800], cheeks: [1.18, 1.600], lowerFace: [1.04, 0.150],
  }),
});

// The marked-up bold sheet showed that useful nose/eye range and destructive
// mask range are not the same thing. V2 pushes profile, spacing, depth, and
// face planes, while keeping seam-prone width fields and the mouth/chin overlap
// inside their authored envelope.
const REVISED_MARKER_GROUPS = Object.freeze({
  cranial: ['headWidth', 'faceHeight', 'headDepth', 'headAngle', 'headBackDepth'],
  eyeFrame: ['eyeSize', 'eyeSpacing', 'eyeVerticalPosition', 'eyeDepth', 'browHeight', 'browAngle'],
  eyeLids: ['eyeHeightInner', 'eyeHeightCenter', 'eyeHeightOuter', 'epicanthus', 'eyeFold'],
  noseProfile: ['noseLength', 'noseDepth', 'noseCurve', 'noseTipAngle'],
  noseBridge: ['noseBridge'],
  noseWidth: ['noseWidth', 'noseVolume', 'nostrilWidth'],
  mouth: ['mouthWidth', 'mouthVerticalPosition', 'mouthDepth', 'lipFullness', 'cupidBow', 'philtrumVolume'],
  planes: ['cheekVolume', 'cheekboneProminence', 'cheekHeight', 'cheekInnerVolume'],
  lowerFace: ['jawWidth', 'chinHeight', 'chinProminence', 'chinPrognathism'],
});

const REVISED_CALIBRATION = Object.freeze({
  cranial: [1.08, 0.70, 2.0],
  eyeFrame: [1.22, 3.00, 3.2],
  eyeLids: [1.10, 1.15, 1.55],
  noseProfile: [1.24, 3.10, 3.2],
  noseBridge: [1.10, 1.10, 1.45],
  noseWidth: [1.10, 0.90, 1.0],
  mouth: [1.05, 0.42, 1.0],
  planes: [1.18, 1.30, 1.65],
  lowerFace: [1.0, 0.06, 1.0],
});

// Correlated individual facial types. These are casting-shape recipes, not
// demographic definitions. A recognizable face usually comes from several
// mutually reinforcing proportions rather than one extreme slider.
const DISTINCTIVE_FACE_TYPES = Object.freeze({
  heartFine: Object.freeze({
    headWidth: -0.35, faceHeight: 0.18, jawWidth: -1.55, chinHeight: -0.38,
    chinProminence: -0.48, cheekVolume: 0.62, cheekHeight: 1.15, eyeSize: 1.35,
    eyeSpacing: 0.18, browHeight: 0.72, noseWidth: -0.42, noseLength: 0.20,
    noseDepth: 0.18, lipFullness: 0.82, mouthWidth: -0.12,
  }),
  longSoft: Object.freeze({
    headWidth: -0.78, faceHeight: 1.30, jawWidth: -1.25, chinHeight: 0.22,
    chinProminence: -0.58, cheekVolume: 0.42, cheekHeight: 0.48, eyeSize: 0.72,
    eyeSpacing: -0.12, eyeDepth: -0.36, noseWidth: -0.30, noseLength: 1.15,
    noseDepth: 0.72, noseBridge: 0.55, lipFullness: 0.54,
  }),
  longNarrowConvex: Object.freeze({
    headWidth: -1.20, faceHeight: 1.55, jawWidth: -1.30, chinHeight: 0.05,
    chinProminence: -0.82, chinPrognathism: -0.42, cheekVolume: -0.25,
    cheekHeight: 0.62, eyeSize: -0.22, eyeSpacing: -0.48, eyeDepth: -1.05,
    browHeight: 0.28, noseWidth: -0.48, noseLength: 2.65, noseDepth: 2.25,
    noseBridge: 1.30, noseCurve: 1.65, noseTipAngle: -0.62, mouthWidth: -0.35,
  }),
  compactRoundSoft: Object.freeze({
    headWidth: 1.12, faceHeight: -1.20, headDepth: 0.65, jawWidth: -1.60,
    chinHeight: -1.18, chinProminence: -1.28, cheekVolume: 1.52,
    cheekHeight: 0.12, cheekInnerVolume: 0.85, eyeSize: 0.72, eyeSpacing: 0.32,
    eyeDepth: 0.18, browHeight: 0.18, noseWidth: 0.85, noseVolume: 1.45,
    noseLength: -0.72, noseDepth: 0.55, noseTipAngle: 0.48, nostrilWidth: 0.62,
    mouthWidth: 0.30, lipFullness: 0.38,
  }),
  fineBonedAngular: Object.freeze({
    headWidth: -0.62, faceHeight: 0.82, jawWidth: -1.42, chinHeight: -0.12,
    chinProminence: -0.35, cheekVolume: -0.18, cheekHeight: 1.38,
    cheekInnerVolume: -0.42, eyeSize: 0.48, eyeSpacing: 0.22, eyeDepth: -0.85,
    browHeight: 0.52, browAngle: 0.55, noseWidth: -0.36, noseLength: 1.18,
    noseDepth: 1.12, noseBridge: 0.90, mouthWidth: -0.18,
  }),
  broadMidTapered: Object.freeze({
    headWidth: 0.62, faceHeight: -0.18, jawWidth: -1.18, chinHeight: -0.45,
    chinProminence: -0.52, cheekVolume: 1.48, cheekHeight: 0.82,
    cheekInnerVolume: 1.05, eyeSize: 0.52, eyeSpacing: 0.72, eyeDepth: -0.12,
    noseWidth: 0.55, noseVolume: 0.62, noseLength: -0.22, noseDepth: -0.18,
    mouthWidth: 0.28, lipFullness: 0.65,
  }),
  angularAquiline: Object.freeze({
    headWidth: -0.25, faceHeight: 1.05, jawWidth: 0.22, chinHeight: 0.48,
    chinProminence: 0.35, cheekVolume: -0.35, cheekHeight: 0.92,
    eyeSize: -0.38, eyeSpacing: -0.12, eyeDepth: -1.05, browHeight: -0.12,
    browAngle: 0.48, noseWidth: -0.28, noseLength: 2.25, noseDepth: 2.05,
    noseBridge: 1.18, noseCurve: 1.30, noseTipAngle: -0.55, mouthWidth: -0.15,
  }),
  recedingChinLongNose: Object.freeze({
    headWidth: -0.35, faceHeight: 0.68, jawWidth: -0.98, chinHeight: -0.35,
    chinProminence: -1.28, chinPrognathism: -0.72, cheekVolume: 0.18,
    cheekHeight: 0.45, eyeSize: 0.18, eyeSpacing: -0.22, eyeDepth: -0.62,
    noseWidth: 0.02, noseLength: 1.85, noseDepth: 1.62, noseBridge: 0.72,
    noseCurve: 0.58, mouthDepth: -0.35, lipFullness: 0.28,
  }),
});

const DISTINCTIVE_RANGE_SCALE = Object.freeze({
  headWidth: 2.0, faceHeight: 2.0, headDepth: 2.0,
  eyeSize: 3.2, eyeSpacing: 3.2, eyeDepth: 3.2, browHeight: 1.55, browAngle: 1.55,
  noseLength: 3.2, noseDepth: 3.2, noseBridge: 1.45, noseCurve: 3.2,
  noseTipAngle: 3.2, noseWidth: 1.0, noseVolume: 1.0, nostrilWidth: 1.0,
  jawWidth: 1.80, chinHeight: 1.60, chinProminence: 1.80, chinPrognathism: 1.80,
  cheekVolume: 1.70, cheekHeight: 1.70, cheekInnerVolume: 1.70,
  mouthWidth: 1.0, mouthDepth: 1.0, lipFullness: 1.45,
});

const FACE_TYPE_LABELS = Object.freeze({
  heartFine: 'heart / fine-boned',
  longSoft: 'long / soft-jawed',
  longNarrowConvex: 'long / prominent nose',
  compactRoundSoft: 'compact / round',
  fineBonedAngular: 'fine-boned / angular',
  broadMidTapered: 'broad midface / tapered jaw',
  angularAquiline: 'angular / aquiline',
  recedingChinLongNose: 'long nose / receding chin',
});

const CASES = [
  { origin: 'old-stock-american', label: 'European American', sex: 'female', age: 22, seed: 1701, faceShift: -1.70, faceType: 'heartFine' },
  { origin: 'old-stock-american', label: 'European American', sex: 'female', age: 57, seed: 1702, faceShift: -1.35, faceType: 'longSoft' },
  { origin: 'old-stock-american', label: 'European American', sex: 'male', age: 25, seed: 1703, faceShift: -2.10, faceType: 'longNarrowConvex' },
  { origin: 'old-stock-american', label: 'European American', sex: 'male', age: 63, seed: 1704, faceShift: -0.55, faceType: 'compactRoundSoft' },
  { origin: 'african-american', label: 'African American', sex: 'female', age: 24, seed: 2701, revisedAppearanceSeed: 2711, faceShift: -1.55, faceType: 'broadMidTapered' },
  { origin: 'african-american', label: 'African American', sex: 'female', age: 52, seed: 2702, faceShift: -1.25, faceType: 'heartFine' },
  { origin: 'african-american', label: 'African American', sex: 'male', age: 28, seed: 2703, faceShift: -1.60, faceType: 'fineBonedAngular' },
  { origin: 'african-american', label: 'African American', sex: 'male', age: 66, seed: 2704, faceShift: -0.40, faceType: 'compactRoundSoft' },
  { origin: 'chinese-american', label: 'Chinese American', sex: 'female', age: 21, seed: 3701, faceShift: -1.75, faceType: 'heartFine' },
  { origin: 'chinese-american', label: 'Chinese American', sex: 'female', age: 48, seed: 3702, faceShift: -1.40, faceType: 'broadMidTapered' },
  { origin: 'chinese-american', label: 'Chinese American', sex: 'male', age: 30, seed: 3703, faceShift: -1.80, faceType: 'longSoft' },
  { origin: 'chinese-american', label: 'Chinese American', sex: 'male', age: 60, seed: 3704, faceShift: -1.35, faceType: 'recedingChinLongNose' },
  { origin: 'irish-american', label: 'Irish American', sex: 'female', age: 27, seed: 4701, faceShift: -1.45, faceType: 'compactRoundSoft' },
  { origin: 'ashkenazi-jewish', label: 'Ashkenazi Jewish', sex: 'female', age: 44, seed: 4702, distinctiveAppearanceSeed: 4712, faceShift: -1.25, faceType: 'longNarrowConvex' },
  { origin: 'italian', label: 'Italian immigrant', sex: 'male', age: 33, seed: 4703, faceShift: -0.05, faceType: 'angularAquiline' },
  { origin: 'eastern-european', label: 'Eastern European', sex: 'male', age: 69, seed: 4704, faceShift: -0.90, faceType: 'recedingChinLongNose' },
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
const schema = JSON.parse(await readFile(schemaPath, 'utf8'));
const definitions = schema.groups.flatMap((group) => group.parameters.map((parameter) => ({
  ...parameter, mode: parameter.mode || group.mode,
})));
const definitionById = new Map(definitions.map((definition) => [definition.id, definition]));
const gltf = await loadModel();
const body = gltf.scene.getObjectByName('body_mesh');
if (!body) throw new Error('MHR master does not contain body_mesh');
const working = neutralizeFace(structuredClone(basePreset.values));
const controller = createMhrController(gltf.scene, working);
if (!controller) throw new Error('MHR controller could not inspect the authoring master');

function clampedMarker(id, value, rangeScale = 1) {
  const definition = definitionById.get(id);
  if (!definition || definition.type !== 'range') return value;
  return Math.max(definition.min * rangeScale, Math.min(definition.max * rangeScale, value));
}

function markerDirection(seed, id) {
  const raw = createRandom(seed, `mhr.qa.marker.${id}`).between(-1, 1);
  // A QA cohort should exercise the feature rather than frequently landing
  // indistinguishably close to zero. The sign and relative strength remain
  // deterministic for matched conservative/bold comparisons.
  return Math.sign(raw || 1) * (0.35 + Math.abs(raw) * 0.65);
}

function applyMarkerProfile(sourceValues, profile, seed) {
  const values = structuredClone(sourceValues);
  const calibration = PROFILE_CALIBRATION[profile];
  if (!calibration) return values;
  for (const [group, ids] of Object.entries(MARKER_GROUPS)) {
    const [gain, spread] = calibration[group];
    for (const id of ids) {
      const adjusted = (Number(values[id]) || 0) * gain + markerDirection(seed, id) * spread;
      // Even the bold sheet is a casting stress test, not permission to revive
      // the oversized-chin failure mode.
      const lowerFaceCap = group === 'lowerFace' ? (profile === 'bold' ? 0.58 : 0.50) : Infinity;
      const rangeScale = profile === 'bold' && group !== 'lowerFace' ? 3.2 : 1;
      values[id] = clampedMarker(
        id,
        Math.max(-lowerFaceCap, Math.min(lowerFaceCap, adjusted)),
        rangeScale,
      );
    }
  }
  return values;
}

function applyFaceShift(values, definition) {
  const shift = Number(definition.faceShift) || 0;
  const add = (id, amount, rangeScale = 1) => {
    values[id] = clampedMarker(id, (Number(values[id]) || 0) + amount, rangeScale);
  };
  add('headWidth', shift * 0.08, 2.0);
  add('faceHeight', shift * 0.18, 2.0);
  add('jawWidth', shift * 0.62, 1.65);
  add('chinHeight', shift * 0.22, 1.50);
  add('chinProminence', shift * 0.34, 1.50);
  add('browHeight', shift * -0.34, 1.55);
  add('cheekVolume', shift * -0.42, 1.65);
  add('cheekHeight', shift * -0.16, 1.65);
  add('cheekInnerVolume', shift * -0.12, 1.65);
  add('noseWidth', shift * 0.025);
  add('noseLength', shift * 0.13, 3.2);
  add('noseDepth', shift * 0.14, 3.2);
  add('eyeSize', shift * -0.24, 3.2);
  add('eyeDepth', shift * -0.12, 3.2);
  add('mouthDepth', shift * -0.08);
  add('lipFullness', shift * -0.18, 1.40);

  // A moderate overlapping population tendency for the review cohort, not a
  // categorical template: individual seeded variation remains much larger.
  if (definition.origin === 'chinese-american') {
    add('jawWidth', definition.sex === 'male' ? -0.70 : -0.18, 1.65);
    add('chinHeight', definition.sex === 'male' ? -0.22 : -0.10, 1.50);
    add('chinProminence', definition.sex === 'male' ? -0.30 : -0.14, 1.50);
  }
  return values;
}

function applyRevisedProfile(sourceValues, definition) {
  const values = structuredClone(sourceValues);
  for (const [group, ids] of Object.entries(REVISED_MARKER_GROUPS)) {
    const [gain, spread, rangeScale] = REVISED_CALIBRATION[group];
    for (const id of ids) {
      const adjusted = (Number(values[id]) || 0) * gain + markerDirection(definition.seed, id) * spread;
      const lowerFaceCap = group === 'lowerFace' ? 0.46 : Infinity;
      values[id] = clampedMarker(
        id,
        Math.max(-lowerFaceCap, Math.min(lowerFaceCap, adjusted)),
        rangeScale,
      );
    }
  }
  // Avoid the correlated narrow/short/concave nose combination that created
  // the dark central trench in the marked African-American reference face.
  if ((Number(values.noseWidth) || 0) < -0.55 && (Number(values.noseLength) || 0) < -1.20) {
    values.noseWidth = -0.55;
    values.noseLength = -1.20;
    values.noseBridge = Math.max(Number(values.noseBridge) || 0, -0.55);
  }
  if (definition.origin === 'african-american' && (Number(values.noseWidth) || 0) < 0.05) {
    values.noseWidth = 0.05;
    values.noseLength = Math.max(Number(values.noseLength) || 0, -0.60);
    values.noseBridge = Math.max(Number(values.noseBridge) || 0, -0.35);
  }
  return applyFaceShift(values, definition);
}

function applyDistinctiveProfile(sourceValues, definition) {
  const values = applyRevisedProfile(sourceValues, definition);
  const targets = DISTINCTIVE_FACE_TYPES[definition.faceType];
  if (!targets) return values;
  const blend = 0.78;
  for (const [id, target] of Object.entries(targets)) {
    const current = Number(values[id]) || 0;
    const rangeScale = DISTINCTIVE_RANGE_SCALE[id] || 1;
    values[id] = clampedMarker(id, current + (target - current) * blend, rangeScale);
  }
  return values;
}

function makeEntries(profile) {
  return CASES.map((definition) => {
  const patient = generatePatient({ seed: definition.seed, sex: definition.sex });
  const origin = getOriginProfile(definition.origin);
  patient.identity.age = definition.age;
  patient.identity.birthYear = 1896 - definition.age;
  patient.identity.origin = {
    ...patient.identity.origin, id: origin.id, label: origin.label,
  };
  const appearanceSeed = profile === 'distinctive' && definition.distinctiveAppearanceSeed
    ? definition.distinctiveAppearanceSeed
    : ['revised', 'distinctive'].includes(profile) && definition.revisedAppearanceSeed
      ? definition.revisedAppearanceSeed : definition.seed;
  const generatedPreset = patientToCharacterPreset(patient, basePreset, definitions, {
    appearanceSeed,
  });
  const profileDefinition = { ...definition, seed: appearanceSeed };
  const values = profile === 'distinctive'
    ? applyDistinctiveProfile(generatedPreset.values, profileDefinition)
    : profile === 'revised'
      ? applyRevisedProfile(generatedPreset.values, profileDefinition)
      : applyMarkerProfile(generatedPreset.values, profile, definition.seed);
  controller.applyValues(values, { forceIdentity: true, snapPose: true });
  const finalPosition = body.geometry.attributes.position.array;
  return {
    label: definition.label,
    detail: `${definition.sex === 'female' ? 'woman' : 'man'} · ${definition.age}${profile === 'distinctive' ? ` · ${FACE_TYPE_LABELS[definition.faceType]}` : ''}`,
    seed: definition.seed,
    skinTone: values.skinTone,
    semanticProfile: mhrSemanticProfile(values),
    identityWeights: [...body.userData.mhrIdentityWeights],
    localizedRequests: body.userData.mhrLocalizedRequests,
    positionBase64: Buffer.from(finalPosition.buffer, finalPosition.byteOffset, finalPosition.byteLength).toString('base64'),
  };
  });
}

await mkdir(generatedDir, { recursive: true });
await mkdir(outputDir, { recursive: true });
const generated = [];
for (const profile of Object.keys(PROFILE_OUTPUTS)) {
  const entries = makeEntries(profile);
  const paths = PROFILE_OUTPUTS[profile];
  const manifestPath = path.join(generatedDir, paths.manifest);
  const outputPath = path.join(outputDir, paths.image);
  await writeFile(manifestPath, `${JSON.stringify({ version: 3, profile, columns: 4, entries }, null, 2)}\n`);
  generated.push({
    profile,
    imageTarget: path.relative(root, outputPath),
    manifest: path.relative(root, manifestPath),
    entries: entries.length,
  });
}
console.log(JSON.stringify({ generated }, null, 2));
