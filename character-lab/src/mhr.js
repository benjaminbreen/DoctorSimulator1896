import * as THREE from 'three';
import { createRandom } from './patients/random.js';

// MHR's shipped shape library is latent rather than semantic.  These helpers
// project anatomical requests back into the 20-dimensional head subspace, so
// UI labels describe measured effects instead of pretending a PCA component is
// inherently "nose width" or "age".

const AXES = {
  x: new THREE.Vector3(1, 0, 0),
  y: new THREE.Vector3(0, 1, 0),
  z: new THREE.Vector3(0, 0, 1),
};

const clamp = (value, minimum, maximum) => THREE.MathUtils.clamp(value, minimum, maximum);
const signed = (value, centre = 0) => (value < centre ? -1 : 1);
const unitRange = (value, minimum, maximum) => clamp((value - minimum) / (maximum - minimum), 0, 1);
const bipolar = (value, minimum, maximum) => unitRange(value, minimum, maximum) * 2 - 1;

const FEATURE_SPECS = {
  headWidth: { region: 'head', vector: (x) => [signed(x), 0, 0] },
  faceHeight: { region: 'face', vector: (_x, y, _z, metrics) => [0, signed(y, metrics.faceCentreY), 0] },
  headDepth: { region: 'head', vector: (_x, _y, z, metrics) => [0, 0, signed(z, metrics.headCentreZ)] },
  noseWidth: { region: 'nose', vector: (x) => [signed(x), 0, 0] },
  noseLength: { region: 'nose', vector: () => [0, -1, 0] },
  noseDepth: { region: 'nose', vector: () => [0, 0, 1] },
  jawWidth: { region: 'jaw', vector: (x) => [signed(x), 0, 0] },
  chinHeight: { region: 'chin', vector: () => [0, -1, 0] },
  chinProminence: { region: 'chin', vector: () => [0, 0, 1] },
  eyeSize: { region: 'eyes', vector: (x, y, _z, metrics) => [signed(x), signed(y, metrics.eyeY), 0] },
  eyeSpacing: { region: 'eyes', vector: (x) => [signed(x), 0, 0] },
  eyeVerticalPosition: { region: 'eyes', vector: () => [0, 1, 0] },
  eyeDepth: { region: 'eyes', vector: () => [0, 0, 1] },
  browHeight: { region: 'brows', vector: () => [0, 1, 0] },
  mouthWidth: { region: 'mouth', vector: (x) => [signed(x), 0, 0] },
  mouthVerticalPosition: { region: 'mouth', vector: () => [0, 1, 0] },
  mouthDepth: { region: 'mouth', vector: () => [0, 0, 1] },
  cheekVolume: { region: 'cheeks', vector: (x) => [signed(x) * 0.55, 0, 1] },
  cheekHeight: { region: 'cheeks', vector: () => [0, 1, 0] },
};

const BODY_FEATURE_SPECS = {
  shoulderWidth: { region: 'shoulders', vector: (x) => [signed(x), 0, 0] },
  chestWidth: { region: 'chest', vector: (x) => [signed(x), 0, 0] },
  chestDepth: { region: 'chestFront', vector: () => [0, 0, 1] },
  waistWidth: { region: 'waist', vector: (x) => [signed(x), 0, 0] },
  hipWidth: { region: 'hips', vector: (x) => [signed(x), 0, 0] },
};

// These are overlapping population centres in anatomical feature space, not
// categorical face templates. A patient's seed and manual feature controls are
// applied independently, and mixed ancestry interpolates continuously. The
// values are deliberately moderate: origin should be represented without
// making every member of a population look alike.
const ANCESTRY_FEATURE_CENTRES = Object.freeze({
  african: Object.freeze({
    headWidth: 0.10, faceHeight: -0.02, noseWidth: 0.46, noseDepth: -0.08,
    eyeSpacing: 0.06, mouthDepth: 0.20, cheekVolume: 0.10, cheekHeight: 0.04,
    chinProminence: 0.08,
  }),
  asian: Object.freeze({
    headWidth: 0.18, faceHeight: -0.08, noseWidth: -0.02, noseDepth: -0.30,
    eyeSize: -0.10, eyeSpacing: 0.08, eyeDepth: -0.24, cheekVolume: 0.18,
    cheekHeight: 0.24, chinProminence: -0.05,
  }),
  caucasian: Object.freeze({
    headWidth: -0.06, faceHeight: 0.07, noseWidth: -0.13, noseDepth: 0.18,
    eyeSpacing: -0.03, eyeDepth: 0.07, mouthDepth: -0.07, cheekVolume: -0.05,
    cheekHeight: -0.03, chinProminence: 0.03,
  }),
});

const FEATURE_INPUTS = [
  ['headWidth', 'headWidth', 0.62],
  ['faceHeight', 'faceHeight', 0.58],
  ['headDepth', 'headDepth', 0.48],
  ['noseWidth', 'noseWidth', 0.56],
  ['noseLength', 'noseLength', 0.42],
  ['noseVolume', 'noseWidth', 0.22],
  ['noseVolume', 'noseDepth', 0.28],
  ['noseDepth', 'noseDepth', 0.52],
  ['noseBridge', 'noseDepth', 0.24],
  ['nostrilWidth', 'noseWidth', 0.30],
  ['jawWidth', 'jawWidth', 0.62],
  ['chinHeight', 'chinHeight', 0.38],
  ['chinProminence', 'chinProminence', 0.46],
  ['chinPrognathism', 'chinProminence', 0.34],
  ['eyeSize', 'eyeSize', 0.42],
  ['eyeSpacing', 'eyeSpacing', 0.48],
  ['eyeVerticalPosition', 'eyeVerticalPosition', 0.30],
  ['eyeDepth', 'eyeDepth', 0.38],
  ['browHeight', 'browHeight', 0.36],
  ['mouthWidth', 'mouthWidth', 0.52],
  ['mouthVerticalPosition', 'mouthVerticalPosition', 0.30],
  ['mouthDepth', 'mouthDepth', 0.38],
  ['lipFullness', 'mouthDepth', 0.30],
  ['cheekVolume', 'cheekVolume', 0.46],
  ['cheekboneProminence', 'cheekVolume', 0.30],
  ['cheekHeight', 'cheekHeight', 0.28],
  ['cheekInnerVolume', 'cheekVolume', 0.22],
];

function geometryMetrics(position) {
  const box = new THREE.Box3();
  const point = new THREE.Vector3();
  for (let index = 0; index < position.count; index += 1) box.expandByPoint(point.fromBufferAttribute(position, index));
  const height = box.max.y - box.min.y;
  return {
    box,
    height,
    headMinY: box.max.y - height * 0.18,
    headCentreZ: box.max.z - (box.max.z - box.min.z) * 0.28,
    faceCentreY: box.max.y - height * 0.105,
    eyeY: box.max.y - height * 0.068,
  };
}

function inRegion(name, x, y, z, metrics) {
  const top = metrics.box.max.y;
  const front = z > metrics.box.max.z - 0.18;
  if (name === 'head') return y > metrics.headMinY;
  if (name === 'face') return y > metrics.headMinY && front;
  if (name === 'nose') return Math.abs(x) < 0.055 && y > top - 0.235 && y < top - 0.075 && z > metrics.box.max.z - 0.13;
  if (name === 'jaw') return Math.abs(x) < 0.16 && y > top - 0.285 && y < top - 0.175 && front;
  if (name === 'chin') return Math.abs(x) < 0.085 && y > top - 0.31 && y < top - 0.215 && front;
  if (name === 'eyes') return Math.abs(x) < 0.145 && Math.abs(x) > 0.018 && y > top - 0.15 && y < top - 0.075 && front;
  if (name === 'brows') return Math.abs(x) < 0.16 && y > top - 0.105 && y < top - 0.04 && front;
  if (name === 'mouth') return Math.abs(x) < 0.14 && y > top - 0.255 && y < top - 0.165 && front;
  if (name === 'cheeks') return Math.abs(x) > 0.04 && Math.abs(x) < 0.18 && y > top - 0.225 && y < top - 0.105 && front;
  return false;
}

function inBodyRegion(name, x, y, z, metrics) {
  const vertical = (y - metrics.box.min.y) / metrics.height;
  const halfWidth = Math.max(0.001, (metrics.box.max.x - metrics.box.min.x) * 0.5);
  const lateral = Math.abs(x) / halfWidth;
  if (name === 'shoulders') return vertical > 0.72 && vertical < 0.84 && lateral > 0.16;
  if (name === 'chest') return vertical > 0.60 && vertical < 0.73 && lateral < 0.72;
  if (name === 'chestFront') return vertical > 0.60 && vertical < 0.73 && lateral < 0.62 && z > metrics.headCentreZ - 0.03;
  if (name === 'waist') return vertical > 0.49 && vertical < 0.60 && lateral < 0.72;
  if (name === 'hips') return vertical > 0.40 && vertical < 0.51 && lateral > 0.10;
  return false;
}

function buildFeatureDirections(geometry) {
  const position = geometry.attributes.position;
  const targets = geometry.morphAttributes.position || [];
  const metrics = geometryMetrics(position);
  const result = {};
  for (const [name, spec] of Object.entries(FEATURE_SPECS)) {
    const scores = new Float32Array(20);
    let samples = 0;
    for (let vertex = 0; vertex < position.count; vertex += 1) {
      const x = position.getX(vertex), y = position.getY(vertex), z = position.getZ(vertex);
      if (!inRegion(spec.region, x, y, z, metrics)) continue;
      const [vx, vy, vz] = spec.vector(x, y, z, metrics);
      for (let component = 0; component < 20; component += 1) {
        const target = targets[20 + component];
        if (!target) continue;
        scores[component] += target.getX(vertex) * vx + target.getY(vertex) * vy + target.getZ(vertex) * vz;
      }
      samples += 1;
    }
    const length = Math.hypot(...scores) || 1;
    for (let component = 0; component < scores.length; component += 1) scores[component] /= length;
    result[name] = scores;
    result[name].samples = samples;
  }
  return result;
}

function buildBodyDirections(geometry) {
  const position = geometry.attributes.position;
  const targets = geometry.morphAttributes.position || [];
  const metrics = geometryMetrics(position);
  const result = {};
  for (const [name, spec] of Object.entries(BODY_FEATURE_SPECS)) {
    const scores = new Float32Array(20);
    let samples = 0;
    for (let vertex = 0; vertex < position.count; vertex += 1) {
      const x = position.getX(vertex), y = position.getY(vertex), z = position.getZ(vertex);
      if (!inBodyRegion(spec.region, x, y, z, metrics)) continue;
      const [vx, vy, vz] = spec.vector(x, y, z, metrics);
      for (let component = 0; component < 20; component += 1) {
        const target = targets[component];
        if (!target) continue;
        scores[component] += target.getX(vertex) * vx + target.getY(vertex) * vy + target.getZ(vertex) * vz;
      }
      samples += 1;
    }
    const length = Math.hypot(...scores) || 1;
    for (let component = 0; component < scores.length; component += 1) scores[component] /= length;
    result[name] = scores;
    result[name].samples = samples;
  }
  return result;
}

function addDirection(weights, direction, amount) {
  if (!direction || !Number.isFinite(amount) || amount === 0) return;
  for (let index = 0; index < 20; index += 1) weights[20 + index] += direction[index] * amount;
}

function addBodyDirection(weights, direction, amount) {
  if (!direction || !Number.isFinite(amount) || amount === 0) return;
  for (let index = 0; index < 20; index += 1) weights[index] += direction[index] * amount;
}

function normalizedAncestry(values) {
  const raw = [Number(values.african) || 0, Number(values.asian) || 0, Number(values.caucasian) || 0]
    .map((value) => Math.max(0, value));
  const total = raw.reduce((sum, value) => sum + value, 0) || 1;
  return { african: raw[0] / total, asian: raw[1] / total, caucasian: raw[2] / total };
}

export function mhrSemanticProfile(values) {
  return {
    version: 1,
    presentation: bipolar(values.gender ?? 0.5, 0, 1),
    ancestry: normalizedAncestry(values),
  };
}

function seededIdentity(seed) {
  const random = createRandom(seed, 'renderer.mhr.identity.v2');
  return Array.from({ length: 45 }, (_, component) => {
    const strength = component < 20 ? 0.62 : component < 40 ? 0.84 : 0.38;
    return clamp(random.bell() * strength * 1.45, -1.65, 1.65);
  });
}

function identityWeights(seed, values, directions) {
  const weights = seededIdentity(seed);
  const mass = bipolar(values.weight ?? 0.5, 0.2, 0.82);
  const muscle = bipolar(values.muscle ?? 0.35, 0.18, 0.78);
  const semantic = mhrSemanticProfile(values);
  const presentation = semantic.presentation;
  // Component 0 is the dominant measured torso-depth/overall-volume mode;
  // component 1 primarily changes waist/hip breadth.  Keep the adjustments
  // inside the model's documented typical coefficient range.
  weights[0] += mass * 1.15 + muscle * 0.16;
  weights[1] += mass * 0.34 - presentation * 0.20;
  weights[10] += muscle * 0.22 + presentation * 0.10;
  weights[12] += muscle * 0.28 + presentation * 0.12;

  // Project a visible female/androgynous/male continuum into MHR's actual
  // body PCA space. This supplements skeletal spacing with surface anatomy;
  // lowering muscle alone cannot produce a female body from a neutral mean.
  addBodyDirection(weights, directions.body.shoulderWidth, presentation * 0.95);
  addBodyDirection(weights, directions.body.chestWidth, presentation * 0.52);
  addBodyDirection(weights, directions.body.chestDepth, presentation * -1.20);
  addBodyDirection(weights, directions.body.waistWidth, presentation * 0.52);
  addBodyDirection(weights, directions.body.hipWidth, presentation * -1.05);

  for (const [input, feature, gain] of FEATURE_INPUTS) {
    const amount = Number(values[input]) || 0;
    addDirection(weights, directions[feature], amount * gain);
  }

  const archetype = values.headShape;
  const archetypeStrength = Number(values.headShapeStrength) || 0;
  const archetypes = {
    round: [0.45, -0.18], square: [0.48, 0.08], rectangular: [-0.05, 0.52],
    diamond: [0.22, 0.08], triangular: [-0.18, 0.12], invertedtriangular: [0.25, -0.06], oval: [0, 0],
  };
  const [width, height] = archetypes[archetype] || archetypes.oval;
  addDirection(weights, directions.headWidth, width * archetypeStrength);
  addDirection(weights, directions.faceHeight, height * archetypeStrength);

  addDirection(weights, directions.jawWidth, presentation * 0.95);
  addDirection(weights, directions.faceHeight, presentation * 0.38);
  addDirection(weights, directions.chinProminence, presentation * 0.52);
  addDirection(weights, directions.browHeight, presentation * -0.34);
  addDirection(weights, directions.cheekVolume, presentation * -0.35);
  addDirection(weights, directions.noseWidth, presentation * 0.20);
  addDirection(weights, directions.eyeSize, presentation * -0.20);
  addDirection(weights, directions.mouthDepth, presentation * -0.12);

  // Link the procedural origin record and the three editable ancestry sliders
  // to shape as well as pigmentation. Each target is a blended population
  // centre; independent seed and feature variation remains larger locally.
  for (const feature of Object.keys(ANCESTRY_FEATURE_CENTRES.african)) {
    const target = semantic.ancestry.african * (ANCESTRY_FEATURE_CENTRES.african[feature] || 0)
      + semantic.ancestry.asian * (ANCESTRY_FEATURE_CENTRES.asian[feature] || 0)
      + semantic.ancestry.caucasian * (ANCESTRY_FEATURE_CENTRES.caucasian[feature] || 0);
    addDirection(weights, directions[feature], target * 1.18);
  }

  const age = bipolar(values.age ?? 0.7, 0.5, 0.9);
  addDirection(weights, directions.cheekVolume, age * -0.12);
  addDirection(weights, directions.chinProminence, age * 0.07);

  return weights.map((value) => clamp(value, -2.6, 2.6));
}

function collectBones(root) {
  const bones = new Map();
  root.traverse((object) => { if (object.isBone) bones.set(object.name, object); });
  return bones;
}

function captureRest(bones) {
  const rest = new Map();
  for (const [name, bone] of bones) rest.set(name, {
    position: bone.position.clone(), quaternion: bone.quaternion.clone(), scale: bone.scale.clone(),
  });
  return rest;
}

export const MHR_LIVE_IDENTITY_IDS = new Set([
  'seed', 'gender', 'age', 'height', 'weight', 'muscle', 'proportions', 'shoulderWidth', 'torsoLength',
  'african', 'asian', 'caucasian',
  'headShape', 'headShapeStrength', 'headWidth', 'faceHeight', 'headDepth', 'noseWidth', 'noseLength',
  'noseVolume', 'noseDepth', 'noseBridge', 'nostrilWidth', 'jawWidth', 'chinHeight', 'chinProminence',
  'chinPrognathism', 'eyeSize', 'eyeSpacing', 'eyeVerticalPosition', 'eyeDepth', 'browHeight', 'mouthWidth',
  'mouthVerticalPosition', 'mouthDepth', 'lipFullness', 'cheekVolume', 'cheekboneProminence', 'cheekHeight',
  'cheekInnerVolume',
  'mhrNeckLength', 'mhrUpperArmLength', 'mhrLowerArmLength', 'mhrHipWidth', 'mhrUpperLegLength',
  'mhrLowerLegLength', 'mhrFootLength', 'mhrHandScale', 'mhrEyeSpacing',
]);

export function createMhrController(root, values) {
  const mesh = root.getObjectByName('body_mesh');
  if (!mesh?.isSkinnedMesh || !mesh.geometry.morphAttributes.position?.length) return null;
  const identityBaked = root.userData.mhrIdentityBaked === true || mesh.userData.mhrIdentityBaked === true;
  const geometry = mesh.geometry;
  const basePosition = new Float32Array(geometry.attributes.position.array);
  const baseNormal = geometry.attributes.normal ? new Float32Array(geometry.attributes.normal.array) : null;
  const morphPositions = geometry.morphAttributes.position;
  const morphNormals = geometry.morphAttributes.normal || [];
  const directions = identityBaked ? { body: {} } : buildFeatureDirections(geometry);
  if (!identityBaked) directions.body = buildBodyDirections(geometry);
  const bones = collectBones(root);
  const rest = captureRest(bones);
  const rootRestPosition = root.position.clone();
  const rootRestScale = root.scale.clone();
  const tempQuaternion = new THREE.Quaternion();
  let currentSeated = (values.seated ?? 1) >= 0.5 ? 1 : 0;
  let targetSeated = currentSeated;
  let identitySignature = '';
  let gesture = null;

  function resetRig() {
    for (const [name, state] of rest) {
      const bone = bones.get(name);
      bone.position.copy(state.position);
      bone.quaternion.copy(state.quaternion);
      bone.scale.copy(state.scale);
    }
  }

  function rotate(name, axis, radians) {
    const bone = bones.get(name);
    if (!bone || !radians) return;
    bone.quaternion.multiply(tempQuaternion.setFromAxisAngle(AXES[axis], radians));
  }

  function scaleBonePosition(name, factor) {
    const bone = bones.get(name);
    const state = rest.get(name);
    if (bone && state) bone.position.copy(state.position).multiplyScalar(factor);
  }

  function scaleBonePositions(names, factor) {
    for (const name of names) scaleBonePosition(name, factor);
  }

  function applyIdentity(nextValues, force = false) {
    if (identityBaked) {
      mesh.userData.mhrSemanticProfile ??= root.userData.semanticProfile || mhrSemanticProfile(nextValues);
      return false;
    }
    const signature = [...MHR_LIVE_IDENTITY_IDS].map((id) => nextValues[id]).join('|');
    if (!force && signature === identitySignature) return false;
    identitySignature = signature;
    const weights = identityWeights(Number(nextValues.seed) || 1, nextValues, directions);
    const position = geometry.attributes.position.array;
    position.set(basePosition);
    const normal = geometry.attributes.normal?.array;
    if (normal && baseNormal) normal.set(baseNormal);
    for (let component = 0; component < 45; component += 1) {
      const weight = weights[component];
      const positionTarget = morphPositions[component]?.array;
      const normalTarget = morphNormals[component]?.array;
      if (!positionTarget || Math.abs(weight) < 0.00001) continue;
      for (let offset = 0; offset < position.length; offset += 1) position[offset] += positionTarget[offset] * weight;
      if (normal && normalTarget) for (let offset = 0; offset < normal.length; offset += 1) normal[offset] += normalTarget[offset] * weight;
    }
    if (normal) for (let offset = 0; offset < normal.length; offset += 3) {
      const inverse = 1 / Math.max(0.00001, Math.hypot(normal[offset], normal[offset + 1], normal[offset + 2]));
      normal[offset] *= inverse; normal[offset + 1] *= inverse; normal[offset + 2] *= inverse;
    }
    geometry.attributes.position.needsUpdate = true;
    if (geometry.attributes.normal) geometry.attributes.normal.needsUpdate = true;
    geometry.computeBoundingBox(); geometry.computeBoundingSphere();
    for (let component = 0; component < 45; component += 1) {
      const index = mesh.morphTargetDictionary?.[`shape_${component}`];
      if (index != null) mesh.morphTargetInfluences[index] = 0;
    }
    mesh.userData.mhrIdentityWeights = weights;
    mesh.userData.mhrSemanticProfile = mhrSemanticProfile(nextValues);
    return true;
  }

  function applyRig(nextValues, seatedBlend = currentSeated, elapsed = 0) {
    resetRig();
    const stature = unitRange(nextValues.height ?? 0.5, 0.2, 0.8);
    const presentation = bipolar(nextValues.gender ?? 0.5, 0, 1);
    const proportion = bipolar(nextValues.proportions ?? 0.5, 0.25, 0.75);
    const torso = 1 + (Number(nextValues.torsoLength) || 0) * 0.075 - proportion * 0.025;
    const leg = 1 + proportion * 0.045;
    const shoulder = 1 + (Number(nextValues.shoulderWidth) || 0) * 0.09 + presentation * 0.090;
    const hip = 1 - presentation * 0.090 + (Number(nextValues.mhrHipWidth) || 0) * 0.045;
    const neck = 1 + (Number(nextValues.mhrNeckLength) || 0) * 0.04;
    const upperArm = 1 + (Number(nextValues.mhrUpperArmLength) || 0) * 0.08;
    const lowerArm = 1 + (Number(nextValues.mhrLowerArmLength) || 0) * 0.08;
    const upperLeg = leg * (1 + (Number(nextValues.mhrUpperLegLength) || 0) * 0.065);
    const lowerLeg = leg * (1 + (Number(nextValues.mhrLowerLegLength) || 0) * 0.075);
    const foot = 1 + (Number(nextValues.mhrFootLength) || 0) * 0.07;
    const hand = 1 + (Number(nextValues.mhrHandScale) || 0) * 0.12;
    for (const name of ['c_spine1', 'c_spine2', 'c_spine3', 'c_neck']) scaleBonePosition(name, torso);
    scaleBonePositions(['c_neck_twist1_proc', 'c_head'], neck);
    scaleBonePositions(['r_uparm_twist1_proc', 'r_uparm_twist2_proc', 'r_uparm_twist3_proc', 'r_uparm_twist4_proc', 'r_lowarm',
      'l_uparm_twist1_proc', 'l_uparm_twist2_proc', 'l_uparm_twist3_proc', 'l_uparm_twist4_proc', 'l_lowarm'], upperArm);
    scaleBonePositions(['r_lowarm_twist1_proc', 'r_lowarm_twist2_proc', 'r_lowarm_twist3_proc', 'r_lowarm_twist4_proc', 'r_wrist_twist',
      'l_lowarm_twist1_proc', 'l_lowarm_twist2_proc', 'l_lowarm_twist3_proc', 'l_lowarm_twist4_proc', 'l_wrist_twist'], lowerArm);
    scaleBonePositions(['r_upleg_twist1_proc', 'r_upleg_twist2_proc', 'r_upleg_twist3_proc', 'r_upleg_twist4_proc', 'r_lowleg',
      'l_upleg_twist1_proc', 'l_upleg_twist2_proc', 'l_upleg_twist3_proc', 'l_upleg_twist4_proc', 'l_lowleg'], upperLeg);
    scaleBonePositions(['r_lowleg_twist1_proc', 'r_lowleg_twist2_proc', 'r_lowleg_twist3_proc', 'r_lowleg_twist4_proc', 'r_foot',
      'l_lowleg_twist1_proc', 'l_lowleg_twist2_proc', 'l_lowleg_twist3_proc', 'l_lowleg_twist4_proc', 'l_foot'], lowerLeg);
    scaleBonePositions(['r_talocrural', 'r_ball', 'l_talocrural', 'l_ball'], foot);
    for (const name of ['r_uparm', 'l_uparm']) scaleBonePosition(name, shoulder);
    for (const name of ['r_upleg', 'l_upleg']) {
      const bone = bones.get(name), state = rest.get(name);
      if (bone && state) {
        bone.position.copy(state.position);
        bone.position.x *= hip;
      }
    }
    for (const name of ['r_wrist', 'l_wrist']) {
      const bone = bones.get(name), state = rest.get(name);
      if (bone && state) bone.scale.copy(state.scale).multiplyScalar(hand);
    }
    const eyeSpacing = (Number(nextValues.mhrEyeSpacing) || 0) * 0.08;
    for (const name of ['r_eye_null', 'l_eye_null']) {
      const bone = bones.get(name), state = rest.get(name);
      if (bone && state) {
        bone.position.copy(state.position);
        bone.position.x *= 1 + eyeSpacing;
      }
    }

    const heightScale = THREE.MathUtils.lerp(0.925, 1.075, stature);
    root.scale.copy(rootRestScale); root.scale.y *= heightScale;
    root.position.copy(rootRestPosition); root.position.y -= seatedBlend * 0.39 * heightScale;

    const sit = seatedBlend;
    rotate('r_upleg', 'z', -1.47 * sit);
    rotate('l_upleg', 'z', -1.47 * sit);
    rotate('r_lowleg', 'z', 1.58 * sit);
    rotate('l_lowleg', 'z', 1.58 * sit);
    rotate('r_talocrural', 'z', -0.11 * sit);
    rotate('l_talocrural', 'z', -0.11 * sit);
    rotate('c_spine0', 'z', 0.07 * sit);
    rotate('c_spine1', 'z', 0.08 * sit);
    rotate('c_spine2', 'z', 0.06 * sit);
    rotate('r_uparm', 'z', 0.75 * sit);
    rotate('l_uparm', 'z', 0.75 * sit);
    rotate('r_lowarm', 'z', -0.35 * sit);
    rotate('l_lowarm', 'z', -0.35 * sit);

    const knees = (Number(nextValues.kneesTogether) || 0) * 0.12 * sit;
    rotate('r_upleg', 'y', -knees);
    rotate('l_upleg', 'y', knees);
    const posture = Number(nextValues.posture) || 0;
    rotate('c_spine2', 'z', posture * -0.055);
    rotate('c_spine3', 'z', posture * -0.045);
    rotate('c_head', 'x', Number(nextValues.headTurn) || 0);
    rotate('c_head', 'y', Number(nextValues.headTilt) || 0);

    if (elapsed && nextValues.breathing) {
      const phase = elapsed * Math.PI * 2 * ((nextValues.breathingRate || 13) / 60);
      rotate('c_spine2', 'z', Math.sin(phase) * nextValues.breathing * 0.012);
    }
    if (gesture) {
      const progress = (performance.now() / 1000 - gesture.started) / gesture.duration;
      if (progress >= 1) gesture = null;
      else {
        const envelope = Math.sin(clamp(progress, 0, 1) * Math.PI) ** 1.35;
        if (gesture.name === 'nod') rotate('c_head', 'z', envelope * Math.sin(progress * Math.PI * 3) * 0.16);
        else if (gesture.name === 'shake') rotate('c_head', 'x', envelope * Math.sin(progress * Math.PI * 4) * 0.14);
        else if (gesture.name === 'glance') rotate('c_head', 'x', envelope * gesture.direction * 0.34);
        else if (gesture.name === 'sigh') rotate('c_spine2', 'z', envelope * 0.055);
      }
    }
    root.updateMatrixWorld(true);
  }

  function applyValues(nextValues, { forceIdentity = false, snapPose = false } = {}) {
    targetSeated = (nextValues.seated ?? 1) >= 0.5 ? 1 : 0;
    if (snapPose) currentSeated = targetSeated;
    const identityChanged = applyIdentity(nextValues, forceIdentity);
    applyRig(nextValues, currentSeated);
    return identityChanged;
  }

  function update(dt, elapsed, nextValues) {
    targetSeated = (nextValues.seated ?? 1) >= 0.5 ? 1 : 0;
    const ease = 1 - Math.exp(-dt * 3.6);
    currentSeated += (targetSeated - currentSeated) * ease;
    if (Math.abs(currentSeated - targetSeated) < 0.0005) currentSeated = targetSeated;
    applyRig(nextValues, currentSeated, elapsed);
  }

  function playGesture(name, speed = 1) {
    if (!['nod', 'shake', 'sigh', 'glance'].includes(name)) return;
    gesture = { name, started: performance.now() / 1000, duration: 1.7 / speed, direction: Math.random() < 0.5 ? -1 : 1 };
  }

  applyValues(values, { forceIdentity: true, snapPose: true });
  return {
    mode: 'mhr-rig', mesh, bones, directions, applyValues, update, playGesture,
    identityBaked,
    captureRest() {}, snapToRest() { applyRig(values, currentSeated); },
    get seatedBlend() { return currentSeated; },
  };
}
