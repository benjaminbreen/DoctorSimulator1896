import * as THREE from 'three';
import { createRandom } from './patients/random.js';

// MHR's shipped shape library is latent rather than semantic. These helpers
// measure useful directions in its 20-dimensional head subspace, then spatially
// mask the resulting deltas. A "nose depth" request can therefore use plausible
// MHR motion without dragging the jaw, cranium, and cheeks along with it.

const AXES = {
  x: new THREE.Vector3(1, 0, 0),
  y: new THREE.Vector3(0, 1, 0),
  z: new THREE.Vector3(0, 0, 1),
};

const clamp = (value, minimum, maximum) => THREE.MathUtils.clamp(value, minimum, maximum);
const signed = (value, centre = 0) => (value < centre ? -1 : 1);
const featheredSign = (value, centre = 0, width = 0.02) => clamp((value - centre) / width, -1, 1);
const unitRange = (value, minimum, maximum) => clamp((value - minimum) / (maximum - minimum), 0, 1);
const bipolar = (value, minimum, maximum) => unitRange(value, minimum, maximum) * 2 - 1;
const gaussian = (value, centre, sigma) => Math.exp(-((value - centre) ** 2) / (2 * sigma * sigma));
const smoothstep = (minimum, maximum, value) => {
  const t = clamp((value - minimum) / Math.max(0.00001, maximum - minimum), 0, 1);
  return t * t * (3 - 2 * t);
};

function faceFront(z, metrics) {
  return smoothstep(metrics.box.max.z - 0.19, metrics.box.max.z - 0.035, z);
}

function regionWeight(name, x, y, z, metrics) {
  const top = metrics.box.max.y;
  const front = faceFront(z, metrics);
  const facialShell = smoothstep(metrics.box.max.z - 0.34, metrics.box.max.z - 0.075, z);
  if (name === 'head') return smoothstep(metrics.headMinY - 0.025, metrics.headMinY + 0.025, y);
  if (name === 'rearHead') return smoothstep(metrics.headMinY, metrics.headMinY + 0.05, y)
    * smoothstep(metrics.box.min.z + 0.035, metrics.headCentreZ - 0.035, metrics.headCentreZ - z);
  if (name === 'face') return smoothstep(metrics.headMinY - 0.015, metrics.headMinY + 0.045, y) * front;
  if (name === 'nose') return gaussian(x, 0, 0.044) * gaussian(y, top - 0.155, 0.060) * front;
  if (name === 'noseBridge') return gaussian(x, 0, 0.031) * gaussian(y, top - 0.112, 0.038) * front;
  if (name === 'noseTip') return gaussian(x, 0, 0.040) * gaussian(y, top - 0.205, 0.032) * front;
  if (name === 'nostrils') return gaussian(Math.abs(x), 0.026, 0.019) * gaussian(y, top - 0.202, 0.025) * front;
  // Jaw and cheek silhouette vertices sit farther back than the nose/eye
  // surface. Using the strict frontal mask made those sliders move only the
  // centre of the face while leaving the visible outline unchanged.
  if (name === 'jaw') return gaussian(Math.abs(x), 0.105, 0.052) * gaussian(y, top - 0.235, 0.055) * facialShell;
  if (name === 'chin') return gaussian(x, 0, 0.075) * gaussian(y, top - 0.267, 0.042) * facialShell;
  if (name === 'eyes') return gaussian(Math.abs(x), 0.043, 0.040) * gaussian(y, metrics.eyeY, 0.030) * front;
  if (name === 'innerEyes') return gaussian(Math.abs(x), 0.021, 0.016) * gaussian(y, metrics.eyeY, 0.025) * front;
  if (name === 'centralEyes') return gaussian(Math.abs(x), 0.043, 0.017) * gaussian(y, metrics.eyeY, 0.026) * front;
  if (name === 'outerEyes') return gaussian(Math.abs(x), 0.067, 0.020) * gaussian(y, metrics.eyeY, 0.026) * front;
  if (name === 'upperLids') return gaussian(Math.abs(x), 0.043, 0.039) * gaussian(y, metrics.eyeY + 0.010, 0.018) * front;
  if (name === 'brows') return gaussian(Math.abs(x), 0.050, 0.055) * gaussian(y, top - 0.072, 0.026) * front;
  if (name === 'mouth') return gaussian(x, 0, 0.078) * gaussian(y, top - 0.222, 0.038) * front;
  if (name === 'upperLip') return gaussian(x, 0, 0.065) * gaussian(y, top - 0.210, 0.019) * front;
  if (name === 'philtrum') return gaussian(x, 0, 0.025) * gaussian(y, top - 0.187, 0.026) * front;
  if (name === 'cheeks') return gaussian(Math.abs(x), 0.085, 0.060) * gaussian(y, top - 0.165, 0.060) * facialShell;
  if (name === 'innerCheeks') return gaussian(Math.abs(x), 0.052, 0.030) * gaussian(y, top - 0.175, 0.048) * facialShell;
  return 0;
}

const FEATURE_SPECS = {
  headWidth: { region: 'head', vector: (x) => [signed(x), 0, 0] },
  faceHeight: { region: 'face', vector: (_x, y, _z, metrics) => [0, featheredSign(y, metrics.faceCentreY, 0.030), 0] },
  headDepth: { region: 'head', vector: (_x, _y, z, metrics) => [0, 0, featheredSign(z, metrics.headCentreZ, 0.040)] },
  headAngle: { region: 'face', vector: (_x, y, _z, metrics) => [0, 0, featheredSign(y, metrics.faceCentreY, 0.030)] },
  headBackDepth: { region: 'rearHead', vector: () => [0, 0, -1] },
  noseWidth: { region: 'nose', vector: (x) => [signed(x), 0, 0] },
  noseLength: { region: 'nose', vector: () => [0, -1, 0] },
  noseDepth: { region: 'nose', vector: () => [0, 0, 1] },
  noseBridge: { region: 'noseBridge', vector: () => [0, 0, 1] },
  noseCurve: { region: 'nose', vector: (_x, y, _z, metrics) => [0, 0, featheredSign(y, metrics.box.max.y - 0.155, 0.025)] },
  noseTipAngle: { region: 'noseTip', vector: () => [0, -0.55, 0.84] },
  nostrilWidth: { region: 'nostrils', vector: (x) => [signed(x), 0, 0] },
  jawWidth: { region: 'jaw', vector: (x) => [signed(x), 0, 0] },
  chinHeight: { region: 'chin', vector: () => [0, -1, 0] },
  chinProminence: { region: 'chin', vector: () => [0, 0, 1] },
  chinPrognathism: { region: 'chin', vector: () => [0, 0, 1] },
  eyeSize: { region: 'eyes', vector: (x, y, _z, metrics) => [signed(x), featheredSign(y, metrics.eyeY, 0.012), 0] },
  eyeSpacing: { region: 'eyes', vector: (x) => [signed(x), 0, 0] },
  eyeVerticalPosition: { region: 'eyes', vector: () => [0, 1, 0] },
  eyeDepth: { region: 'eyes', vector: () => [0, 0, 1] },
  eyeHeightInner: { region: 'innerEyes', vector: (_x, y, _z, metrics) => [0, featheredSign(y, metrics.eyeY, 0.012), 0] },
  eyeHeightCenter: { region: 'centralEyes', vector: (_x, y, _z, metrics) => [0, featheredSign(y, metrics.eyeY, 0.012), 0] },
  eyeHeightOuter: { region: 'outerEyes', vector: (_x, y, _z, metrics) => [0, featheredSign(y, metrics.eyeY, 0.012), 0] },
  epicanthus: { region: 'innerEyes', vector: (x) => [-signed(x), 0.20, 0] },
  eyeFold: { region: 'upperLids', vector: () => [0, 0.72, -0.20] },
  browHeight: { region: 'brows', vector: () => [0, 1, 0] },
  browAngle: { region: 'brows', vector: (x) => [0, signed(x), 0] },
  mouthWidth: { region: 'mouth', vector: (x) => [signed(x), 0, 0] },
  mouthVerticalPosition: { region: 'mouth', vector: () => [0, 1, 0] },
  mouthDepth: { region: 'mouth', vector: () => [0, 0, 1] },
  lipFullness: { region: 'mouth', vector: (_x, y, _z, metrics) => [0, featheredSign(y, metrics.box.max.y - 0.222, 0.015) * 0.30, 1] },
  cupidBow: { region: 'upperLip', vector: (x) => [0, gaussian(x, 0, 0.022) - 0.26, 0.15] },
  philtrumVolume: { region: 'philtrum', vector: () => [0, 0, 1] },
  cheekVolume: { region: 'cheeks', vector: (x) => [signed(x) * 0.55, 0, 1] },
  cheekHeight: { region: 'cheeks', vector: () => [0, 1, 0] },
  cheekInnerVolume: { region: 'innerCheeks', vector: (x) => [signed(x) * 0.20, 0, 1] },
  faceAsymmetry: {
    region: 'face',
    vector: (x) => {
      const t = smoothstep(-0.025, 0.025, x);
      return [
        THREE.MathUtils.lerp(-0.08, 0.30, t),
        THREE.MathUtils.lerp(-0.035, 0.10, t),
        THREE.MathUtils.lerp(-0.07, 0.28, t),
      ];
    },
  },
};

// A measured MHR PCA direction supplies organic surface motion, but some
// directions are extremely weak or correlated with unrelated anatomy. These
// metre-scale direct terms guarantee that the public control means what its
// label says. They are still feathered by the same anatomical masks.
const FEATURE_DIRECT_SCALE = Object.freeze({
  headWidth: 0.008, faceHeight: 0.008, headDepth: 0.007, headAngle: 0.004, headBackDepth: 0.006,
  noseWidth: 0.005, noseLength: 0.006, noseDepth: 0.007, noseBridge: 0.004,
  noseCurve: 0.003, noseTipAngle: 0.004, nostrilWidth: 0.004,
  jawWidth: 0.010, chinHeight: 0.007, chinProminence: 0.007, chinPrognathism: 0.006,
  eyeSize: 0.004, eyeSpacing: 0.005, eyeVerticalPosition: 0.004, eyeDepth: 0.004,
  eyeHeightInner: 0.003, eyeHeightCenter: 0.003, eyeHeightOuter: 0.003,
  epicanthus: 0.0025, eyeFold: 0.0025, browHeight: 0.004, browAngle: 0.003,
  mouthWidth: 0.006, mouthVerticalPosition: 0.004, mouthDepth: 0.005,
  lipFullness: 0.004, cupidBow: 0.003, philtrumVolume: 0.003,
  cheekVolume: 0.006, cheekHeight: 0.005, cheekInnerVolume: 0.005,
  faceAsymmetry: 0.005,
});

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
  ['headAngle', 'headAngle', 0.30],
  ['headBackDepth', 'headBackDepth', 0.34],
  ['noseWidth', 'noseWidth', 0.56],
  ['noseLength', 'noseLength', 0.42],
  ['noseVolume', 'noseWidth', 0.22],
  ['noseVolume', 'noseDepth', 0.28],
  ['noseDepth', 'noseDepth', 0.52],
  ['noseBridge', 'noseBridge', 0.30],
  ['noseCurve', 'noseCurve', 0.25],
  ['noseTipAngle', 'noseTipAngle', 0.24],
  ['nostrilWidth', 'nostrilWidth', 0.30],
  ['jawWidth', 'jawWidth', 0.62],
  ['chinHeight', 'chinHeight', 0.38],
  ['chinProminence', 'chinProminence', 0.46],
  ['chinPrognathism', 'chinPrognathism', 0.30],
  ['eyeSize', 'eyeSize', 0.42],
  ['eyeSpacing', 'eyeSpacing', 0.48],
  ['eyeVerticalPosition', 'eyeVerticalPosition', 0.30],
  ['eyeDepth', 'eyeDepth', 0.38],
  ['eyeHeightInner', 'eyeHeightInner', 0.36],
  // The central-lid field is represented weakly in the source PCA basis, so
  // it needs more authored travel to match the inner/outer aperture controls.
  ['eyeHeightCenter', 'eyeHeightCenter', 0.42],
  ['eyeHeightOuter', 'eyeHeightOuter', 0.42],
  ['epicanthus', 'epicanthus', 0.30],
  ['eyeFold', 'eyeFold', 0.30],
  ['browHeight', 'browHeight', 0.36],
  ['browAngle', 'browAngle', 0.24],
  ['mouthWidth', 'mouthWidth', 0.52],
  ['mouthVerticalPosition', 'mouthVerticalPosition', 0.30],
  ['mouthDepth', 'mouthDepth', 0.38],
  ['lipFullness', 'lipFullness', 0.28],
  ['cupidBow', 'cupidBow', 0.22],
  ['philtrumVolume', 'philtrumVolume', 0.22],
  ['cheekVolume', 'cheekVolume', 0.46],
  ['cheekboneProminence', 'cheekVolume', 0.30],
  ['cheekHeight', 'cheekHeight', 0.28],
  ['cheekInnerVolume', 'cheekInnerVolume', 0.24],
  ['faceAsymmetry', 'faceAsymmetry', 1.0],
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
      const mask = regionWeight(spec.region, x, y, z, metrics);
      if (mask < 0.002) continue;
      const [vx, vy, vz] = spec.vector(x, y, z, metrics);
      // The source PCA modes are not guaranteed to share a welded sagittal
      // boundary. Projecting them through an intentionally asymmetric whole-
      // face field can therefore reveal a dark centre seam. The authored,
      // feathered direct field is sufficient for asymmetry and stays smooth.
      for (let component = 0; component < (name === 'faceAsymmetry' ? 0 : 20); component += 1) {
        const target = targets[20 + component];
        if (!target) continue;
        scores[component] += (target.getX(vertex) * vx + target.getY(vertex) * vy + target.getZ(vertex) * vz) * mask;
      }
      samples += mask;
    }
    const length = Math.hypot(...scores) || 1;
    for (let component = 0; component < scores.length; component += 1) scores[component] /= length;
    result[name] = scores;
    result[name].samples = samples;
  }
  return result;
}

function buildLocalizedFeatureDeltas(geometry, directions) {
  const position = geometry.attributes.position;
  const targets = geometry.morphAttributes.position || [];
  const normalTargets = geometry.morphAttributes.normal || [];
  const metrics = geometryMetrics(position);
  const result = {};
  for (const [name, spec] of Object.entries(FEATURE_SPECS)) {
    const direction = directions[name];
    if (!direction) continue;
    const positionDelta = new Float32Array(position.count * 3);
    const normalDelta = normalTargets.length ? new Float32Array(position.count * 3) : null;
    for (let vertex = 0; vertex < position.count; vertex += 1) {
      const x = position.getX(vertex), y = position.getY(vertex), z = position.getZ(vertex);
      const mask = regionWeight(spec.region, x, y, z, metrics);
      if (mask < 0.002) continue;
      const offset = vertex * 3;
      const [rawDirectX, directY, directZ] = spec.vector(x, y, z, metrics);
      // Width fields must converge continuously at the sagittal plane. A raw
      // sign vector would assign centre-line vertices to one side and create a
      // visible vertical seam through the nose, lips, and chin.
      const directX = Math.abs(rawDirectX) > 0.9
        ? rawDirectX * smoothstep(0.001, 0.020, Math.abs(x)) : rawDirectX;
      const directScale = FEATURE_DIRECT_SCALE[name] || 0;
      positionDelta[offset] += directX * mask * directScale;
      positionDelta[offset + 1] += directY * mask * directScale;
      positionDelta[offset + 2] += directZ * mask * directScale;
      for (let component = 0; component < 20; component += 1) {
        const coefficient = direction[component] * mask;
        if (Math.abs(coefficient) < 0.000001) continue;
        const target = targets[20 + component];
        if (target) {
          positionDelta[offset] += target.getX(vertex) * coefficient;
          positionDelta[offset + 1] += target.getY(vertex) * coefficient;
          positionDelta[offset + 2] += target.getZ(vertex) * coefficient;
        }
        const normalTarget = normalTargets[20 + component];
        if (normalDelta && normalTarget) {
          normalDelta[offset] += normalTarget.getX(vertex) * coefficient;
          normalDelta[offset + 1] += normalTarget.getY(vertex) * coefficient;
          normalDelta[offset + 2] += normalTarget.getZ(vertex) * coefficient;
        }
      }
    }
    result[name] = { position: positionDelta, normal: normalDelta };
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
  const random = createRandom(seed, 'renderer.mhr.identity.v3');
  return Array.from({ length: 45 }, (_, component) => {
    const strength = component < 20 ? 0.60 : component < 40 ? 1.12 : 0.42;
    // Uniform tails keep the cast from collapsing around the PCA mean while
    // the bell term still makes extreme source shapes uncommon.
    const broad = random.bell() * 1.12 + random.between(-1, 1) * 0.42;
    return clamp(broad * strength, -1.98, 1.98);
  });
}

function calibratedPresentation(presentation) {
  // The public MHR mean and source modes skew masculine. Give the feminine
  // half more travel while damping the male endpoint that formerly produced
  // an oversized jaw/chin caricature.
  return presentation < 0 ? presentation * 1.82 : presentation * 0.48;
}

function localizedFeatureRequests(values) {
  const requests = new Map();
  const add = (feature, amount) => {
    if (!Number.isFinite(amount) || Math.abs(amount) < 0.000001) return;
    requests.set(feature, (requests.get(feature) || 0) + amount);
  };
  for (const [input, feature, gain] of FEATURE_INPUTS) add(feature, (Number(values[input]) || 0) * gain);

  const archetypeStrength = Number(values.headShapeStrength) || 0;
  const archetypes = {
    round: [0.45, -0.18], square: [0.48, 0.08], rectangular: [-0.05, 0.52],
    diamond: [0.22, 0.08], triangular: [-0.18, 0.12], invertedtriangular: [0.25, -0.06], oval: [0, 0],
  };
  const [width, height] = archetypes[values.headShape] || archetypes.oval;
  add('headWidth', width * archetypeStrength);
  add('faceHeight', height * archetypeStrength);

  const semantic = mhrSemanticProfile(values);
  const presentation = calibratedPresentation(semantic.presentation);
  add('headWidth', presentation * 0.10);
  add('jawWidth', presentation * 0.68);
  add('faceHeight', presentation * 0.34);
  add('chinHeight', presentation * 0.22);
  add('chinProminence', presentation * 0.33);
  add('browHeight', presentation * -0.42);
  add('cheekVolume', presentation * -0.55);
  add('cheekHeight', presentation * -0.18);
  add('cheekInnerVolume', presentation * -0.15);
  add('noseWidth', presentation * 0.16);
  add('noseLength', presentation * 0.18);
  add('noseDepth', presentation * 0.18);
  add('eyeSize', presentation * -0.30);
  add('eyeDepth', presentation * -0.16);
  add('mouthDepth', presentation * -0.10);
  add('lipFullness', presentation * -0.22);

  for (const feature of Object.keys(ANCESTRY_FEATURE_CENTRES.african)) {
    const target = semantic.ancestry.african * (ANCESTRY_FEATURE_CENTRES.african[feature] || 0)
      + semantic.ancestry.asian * (ANCESTRY_FEATURE_CENTRES.asian[feature] || 0)
      + semantic.ancestry.caucasian * (ANCESTRY_FEATURE_CENTRES.caucasian[feature] || 0);
    add(feature, target * 0.88);
  }

  const age = bipolar(values.age ?? 0.7, 0.5, 0.9);
  add('cheekVolume', age * -0.12);
  add('chinProminence', age * 0.045);
  return requests;
}

function identityWeights(seed, values, directions) {
  const weights = seededIdentity(seed);
  // Internal audit hook: QA sheets can test whether the native MHR head basis
  // contains sufficient identity range before we expose or distribute such a
  // control. Normal runtime presets omit it and therefore remain exactly 1x.
  const nativeFaceStrength = clamp(Number(values.mhrNativeFaceStrength) || 1, 0.5, 1.6);
  for (let component = 20; component < 45; component += 1) weights[component] *= nativeFaceStrength;
  const mass = bipolar(values.weight ?? 0.5, 0.2, 0.82);
  const muscle = bipolar(values.muscle ?? 0.35, 0.18, 0.78);
  const semantic = mhrSemanticProfile(values);
  const presentation = calibratedPresentation(semantic.presentation);
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

export const MHR_IDENTITY_IDS = new Set([
  'seed', 'gender', 'age', 'weight', 'muscle', 'shoulderWidth',
  'african', 'asian', 'caucasian',
  'headShape', 'headShapeStrength', 'headWidth', 'faceHeight', 'headDepth', 'noseWidth', 'noseLength',
  'headAngle', 'headBackDepth', 'noseVolume', 'noseDepth', 'noseBridge', 'noseCurve', 'noseTipAngle',
  'nostrilWidth', 'jawWidth', 'chinHeight', 'chinProminence', 'chinPrognathism',
  'eyeSize', 'eyeSpacing', 'eyeVerticalPosition', 'eyeDepth', 'eyeHeightInner', 'eyeHeightCenter',
  'eyeHeightOuter', 'epicanthus', 'eyeFold', 'browHeight', 'browAngle', 'mouthWidth',
  'mouthVerticalPosition', 'mouthDepth', 'lipFullness', 'cupidBow', 'philtrumVolume',
  'cheekVolume', 'cheekboneProminence', 'cheekHeight', 'cheekInnerVolume',
  'faceAsymmetry',
]);

export const MHR_RIG_IDS = new Set([
  'height', 'proportions', 'shoulderWidth', 'torsoLength',
  'mhrNeckLength', 'mhrUpperArmLength', 'mhrLowerArmLength', 'mhrHipWidth', 'mhrUpperLegLength',
  'mhrLowerLegLength', 'mhrFootLength', 'mhrHandScale', 'mhrEyeSpacing',
]);

export const MHR_LIVE_IDENTITY_IDS = new Set([...MHR_IDENTITY_IDS, ...MHR_RIG_IDS]);

function paintMhrGlobe(geometry, values) {
  const position = geometry.attributes.position;
  const colors = geometry.attributes.color?.array || new Float32Array(position.count * 3);
  const iris = new THREE.Color(values.eyeColor || '#55422b');
  const scleraBrightness = Number.isFinite(Number(values.mhrScleraBrightness))
    ? clamp(Number(values.mhrScleraBrightness), 0, 1) : 0.22;
  const sclera = new THREE.Color(values.mhrScleraColor || '#d6c8bb');
  sclera.offsetHSL(0, 0, THREE.MathUtils.lerp(-0.09, 0.10, scleraBrightness));
  const limbal = iris.clone().multiplyScalar(0.48);
  const pupil = new THREE.Color('#080706');
  const radius = geometry.userData.mhrEyeRadius;
  const irisScale = THREE.MathUtils.clamp(Number(values.mhrIrisScale) || 1, 0.68, 1.42);
  const pupilScale = THREE.MathUtils.clamp(Number(values.mhrPupilScale) || 1, 0.55, 1.55);
  // The public MHR eye-bone-to-null distance is about 16.9 mm, substantially
  // larger than the conventional 11.5 mm globe radius. Keep iris and pupil at
  // human-scale absolute radii instead of enlarging them with that rig radius.
  const irisRadius = Math.min(radius * 0.50, 0.00585) * irisScale;
  const pupilRadius = Math.min(radius * 0.19, 0.00220) * pupilScale;
  for (let vertex = 0; vertex < position.count; vertex += 1) {
    const x = position.getX(vertex), y = position.getY(vertex), z = position.getZ(vertex);
    const radial = Math.hypot(x, y);
    const frontal = z > radius * 0.68;
    let color = sclera.clone();
    // A subtle warm limbus at the nasal/temporal extremes keeps the white from
    // reading as porcelain without painting the surrounding eyelid skin.
    const lateralWarmth = Math.max(0, Math.abs(x) / radius - 0.56);
    color.offsetHSL(-0.015, lateralWarmth * 0.10, -lateralWarmth * 0.025);
    if (frontal && radial < irisRadius) {
      const irisProgress = radial / irisRadius;
      color.copy(iris).multiplyScalar(0.80 + (1 - irisProgress) * 0.17);
      if (irisProgress > 0.84) color.lerp(limbal, (irisProgress - 0.84) / 0.16);
      // Radial tonal variation gives the iris depth without introducing a
      // flat texture card that separates from the globe in profile.
      const angle = Math.atan2(y, x);
      color.offsetHSL(Math.sin(angle * 9 + radial * 1800) * 0.012, 0.05, Math.cos(angle * 13) * 0.025);
    }
    if (frontal && radial < Math.min(pupilRadius, irisRadius * 0.62)) color.copy(pupil);
    colors[vertex * 3] = color.r;
    colors[vertex * 3 + 1] = color.g;
    colors[vertex * 3 + 2] = color.b;
  }
  if (!geometry.attributes.color) geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  else geometry.attributes.color.needsUpdate = true;
}

function cutMhrEyeApertures(body, landmarks) {
  const geometry = body.geometry;
  const index = geometry.index;
  const position = geometry.attributes.position;
  if (!index || !position || !landmarks) return null;
  const originalIndex = index.clone();
  const originalGroups = geometry.groups.map((group) => ({ ...group }));
  const originalMaterial = body.material;
  const radiusX = landmarks.eyeSpan * 0.113;
  const radiusY = landmarks.eyeSpan * 0.035;
  const centers = [-1, 1].map((side) => ({
    side,
    x: landmarks.centerX + side * landmarks.eyeHalfSeparation,
    y: landmarks.eyeY,
  }));
  const visible = [];
  const aperture = [];
  const triangleState = [];
  const triangleSide = [];
  const array = index.array;
  for (let offset = 0; offset < array.length; offset += 3) {
    const a = array[offset], b = array[offset + 1], c = array[offset + 2];
    const x = (position.getX(a) + position.getX(b) + position.getX(c)) / 3;
    const y = (position.getY(a) + position.getY(b) + position.getY(c)) / 3;
    const z = (position.getZ(a) + position.getZ(b) + position.getZ(c)) / 3;
    let cut = false;
    let side = 0;
    for (const center of centers) {
      const ellipse = ((x - center.x) / radiusX) ** 2 + ((y - center.y) / radiusY) ** 2;
      if (ellipse < 1 && z > landmarks.eyeZ - landmarks.eyeSpan * 0.055) {
        cut = true; side = center.side; break;
      }
    }
    triangleState.push(cut);
    triangleSide.push(side);
    (cut ? aperture : visible).push(a, b, c);
  }

  // Boundary edges shared by one retained and one removed triangle are the
  // actual upper/lower eyelid margins. They remain stable across all identity
  // and expression morphs because the MHR topology is constant.
  const edges = new Map();
  const recordEdge = (a, b, cut, side) => {
    const key = a < b ? `${a}:${b}` : `${b}:${a}`;
    const record = edges.get(key) || { a, b, states: [], sides: [] };
    record.states.push(cut); record.sides.push(side); edges.set(key, record);
  };
  for (let triangle = 0; triangle < triangleState.length; triangle += 1) {
    const offset = triangle * 3;
    const a = array[offset], b = array[offset + 1], c = array[offset + 2];
    recordEdge(a, b, triangleState[triangle], triangleSide[triangle]);
    recordEdge(b, c, triangleState[triangle], triangleSide[triangle]);
    recordEdge(c, a, triangleState[triangle], triangleSide[triangle]);
  }
  const margins = centers.map((center) => ({ ...center, upper: new Set(), lower: new Set() }));
  for (const edge of edges.values()) {
    if (edge.states.length < 2 || edge.states[0] === edge.states[1]) continue;
    const side = edge.sides.find((value) => value !== 0) || (position.getX(edge.a) < landmarks.centerX ? -1 : 1);
    const margin = margins.find((candidate) => candidate.side === side);
    if (!margin) continue;
    for (const vertex of [edge.a, edge.b]) {
      (position.getY(vertex) >= margin.y ? margin.upper : margin.lower).add(vertex);
    }
  }
  const apertures = margins.map((margin) => ({
    side: margin.side,
    centerX: margin.x,
    centerY: margin.y,
    radiusX,
    radiusY,
    upper: [...margin.upper].sort((a, b) => position.getX(a) - position.getX(b)),
    lower: [...margin.lower].sort((a, b) => position.getX(a) - position.getX(b)),
  }));

  const reordered = new array.constructor(visible.length + aperture.length);
  reordered.set(visible, 0); reordered.set(aperture, visible.length);
  geometry.setIndex(new THREE.BufferAttribute(reordered, 1));
  geometry.clearGroups();
  geometry.addGroup(0, visible.length, 0);
  geometry.addGroup(visible.length, aperture.length, 1);
  const invisible = new THREE.MeshBasicMaterial({
    name: 'MHR_EmbeddedEyeCutout', transparent: true, opacity: 0,
    depthWrite: false, colorWrite: false, side: THREE.DoubleSide,
  });
  body.material = [originalMaterial, invisible];
  geometry.userData.mhrEyeApertures = apertures;

  return {
    apertures,
    removedTriangles: aperture.length / 3,
    dispose() {
      geometry.setIndex(originalIndex);
      geometry.clearGroups();
      for (const group of originalGroups) geometry.addGroup(group.start, group.count, group.materialIndex);
      delete geometry.userData.mhrEyeApertures;
      body.material = originalMaterial;
      invisible.dispose();
    },
  };
}

/* The public MHR asset exposes eye-null bones but merges its opaque eye surface
   into body_mesh. We cut topology-stable apertures in that surface and place
   complete spherical, bone-bound globes behind the retained eyelids. Iris and
   pupil pigmentation is painted directly onto the globe vertices; a separate
   transparent corneal shell supplies highlights and profile volume. */
export function createMhrEyeDetails(root, values) {
  // The *_eye bones are the anatomical rotation centres. Their *_eye_null
  // children sit near the corneal surface. Parenting a globe to an eye-null
  // therefore rotates the *centre* of the globe around its front surface and
  // makes it orbit through the lids. Keep the globe on the actual eye bone and
  // use the null only as a reliable authored forward-axis reference.
  const eyeBones = [root.getObjectByName('r_eye'), root.getObjectByName('l_eye')].filter(Boolean);
  const eyeNulls = [root.getObjectByName('r_eye_null'), root.getObjectByName('l_eye_null')].filter(Boolean);
  const body = root.getObjectByName('body_mesh');
  const landmarks = body?.geometry?.userData?.faceLandmarks;
  if (eyeBones.length !== 2 || eyeNulls.length !== 2 || !body?.isSkinnedMesh || !landmarks) return null;
  body.userData.mhrAnatomicalEyes = true;

  // Match MHR's authored eye-centre -> corneal-null distance. The earlier
  // generic 11.55 mm sphere could show only its iris through this rig's ~21 mm
  // eyelid opening, leaving no sclera at all on wider identities.
  const radius = 0.01655;
  const globeGeometry = new THREE.SphereGeometry(radius, 64, 40);
  globeGeometry.userData.mhrEyeRadius = radius;
  paintMhrGlobe(globeGeometry, values);
  const corneaGeometry = new THREE.SphereGeometry(radius + 0.00038, 48, 28);
  const globeMaterial = new THREE.MeshPhysicalMaterial({
    name: 'MHR_AnatomicalEye', color: '#ffffff', vertexColors: true,
    roughness: 0.34, metalness: 0, clearcoat: 0.18, clearcoatRoughness: 0.20,
  });
  const corneaMaterial = new THREE.MeshPhysicalMaterial({
    name: 'MHR_Cornea', color: '#ffffff', roughness: 0.07, metalness: 0,
    transparent: true, opacity: 0.16, depthWrite: false,
    clearcoat: 1, clearcoatRoughness: 0.035, side: THREE.FrontSide,
  });
  globeMaterial.userData.excludeComparisonSkin = true;
  corneaMaterial.userData.excludeComparisonSkin = true;
  const cutout = cutMhrEyeApertures(body, landmarks);

  const groups = eyeBones.map((bone, index) => {
    const group = new THREE.Group();
    group.name = index === 0 ? 'MHR_EyeDetail_R' : 'MHR_EyeDetail_L';
    const globe = new THREE.Mesh(globeGeometry, globeMaterial);
    globe.name = `${group.name}_Globe`;
    globe.castShadow = true;
    const cornea = new THREE.Mesh(corneaGeometry, corneaMaterial);
    cornea.name = `${group.name}_Cornea`;
    cornea.position.copy(globe.position);
    cornea.renderOrder = 2;
    group.add(globe, cornea);
    bone.add(group);
    return group;
  });

  const aperturePoint = new THREE.Vector3();
  const socketCentre = new THREE.Vector3();
  const eyeCentre = new THREE.Vector3();
  const forward = new THREE.Vector3();

  function fitToSocket(index, worldRadius, depthMm, verticalMm) {
    const aperture = cutout?.apertures?.find((candidate) => candidate.side === (index === 0 ? -1 : 1));
    if (!aperture) return null;
    const vertices = [...new Set([...aperture.upper, ...aperture.lower])];
    if (!vertices.length) return null;

    let minimumX = Infinity, maximumX = -Infinity;
    let minimumY = Infinity, maximumY = -Infinity;
    socketCentre.set(0, 0, 0);
    body.updateWorldMatrix(true, false);
    for (const vertex of vertices) {
      body.getVertexPosition(vertex, aperturePoint).applyMatrix4(body.matrixWorld);
      socketCentre.add(aperturePoint);
      minimumX = Math.min(minimumX, aperturePoint.x); maximumX = Math.max(maximumX, aperturePoint.x);
      minimumY = Math.min(minimumY, aperturePoint.y); maximumY = Math.max(maximumY, aperturePoint.y);
    }
    socketCentre.multiplyScalar(1 / vertices.length);

    // Socket depth follows the head's neutral forward axis, not the current
    // gaze axis. MHR toes its eye bones inward for convergence; using that
    // rotated optical axis to place the *centre* shifted each globe sideways
    // by several millimetres and put irises on the cheeks.
    forward.set(0, 0, 1).transformDirection(root.matrixWorld).normalize();
    eyeCentre.copy(socketCentre)
      .addScaledVector(forward, -worldRadius + depthMm * 0.001)
      .addScaledVector(new THREE.Vector3(0, 1, 0), verticalMm * 0.001);

    // Convert the desired world-space centre into the rotating eye bone. The
    // residual offset is only the identity-specific socket correction; gaze
    // then pivots around the anatomical centre rather than the corneal face.
    groups[index].position.copy(eyeBones[index].worldToLocal(eyeCentre.clone()));
    groups[index].userData.socketFit = {
      side: aperture.side,
      centre: socketCentre.toArray(),
      width: maximumX - minimumX,
      height: maximumY - minimumY,
    };
    return groups[index].userData.socketFit;
  }

  function update(nextValues) {
    paintMhrGlobe(globeGeometry, nextValues);
    const authoredScale = Number.isFinite(Number(nextValues.mhrEyeGlobeScale))
      ? Number(nextValues.mhrEyeGlobeScale) : 0.98;
    const scale = THREE.MathUtils.clamp(authoredScale, 0.70, 1.12)
      * (1 + (Number(nextValues.eyeSize) || 0) * 0.05);
    const depthMm = Number.isFinite(Number(nextValues.mhrEyeDepth)) ? Number(nextValues.mhrEyeDepth) : -0.6;
    const verticalMm = Number.isFinite(Number(nextValues.mhrEyeVertical)) ? Number(nextValues.mhrEyeVertical) : 0;
    const gloss = Number.isFinite(Number(nextValues.mhrCorneaGloss))
      ? clamp(Number(nextValues.mhrCorneaGloss), 0, 1) : 0.38;
    corneaMaterial.opacity = THREE.MathUtils.lerp(0.035, 0.20, gloss);
    corneaMaterial.roughness = THREE.MathUtils.lerp(0.20, 0.025, gloss);
    corneaMaterial.clearcoat = THREE.MathUtils.lerp(0.18, 1, gloss);
    // Meta MHR's eye-null chain carries a legacy centimetre-to-metre scale.
    // Raw 6.7 mm circles inherited that 0.01 world scale and became invisible,
    // leaving only a pale slit in the shared body mesh. Cancel the bone's
    // accumulated scale while retaining its pose and rotation so these values
    // describe real metres at the corneal surface.
    root.updateMatrixWorld(true);
    for (let index = 0; index < groups.length; index += 1) {
      const globe = groups[index].getObjectByName(`${groups[index].name}_Globe`);
      const cornea = groups[index].getObjectByName(`${groups[index].name}_Cornea`);
      globe.position.set(0, 0, 0);
      cornea.position.copy(globe.position);
      const worldScale = eyeBones[index].getWorldScale(new THREE.Vector3());
      groups[index].scale.set(
        scale / Math.max(0.00001, worldScale.x),
        scale / Math.max(0.00001, worldScale.y),
        scale / Math.max(0.00001, worldScale.z),
      );
      fitToSocket(index, radius * scale, depthMm, verticalMm);
    }
    root.updateMatrixWorld(true);
  }

  function dispose() {
    for (const group of groups) group.parent?.remove(group);
    cutout?.dispose();
    globeGeometry.dispose(); corneaGeometry.dispose();
    globeMaterial.dispose(); corneaMaterial.dispose();
    delete body.userData.mhrAnatomicalEyes;
  }

  update(values);
  return {
    groups,
    apertures: cutout?.apertures || [],
    removedTriangles: cutout?.removedTriangles || 0,
    materials: { globe: globeMaterial, cornea: corneaMaterial },
    update,
    dispose,
  };
}

export function createMhrController(root, values) {
  const mesh = root.getObjectByName('body_mesh');
  if (!mesh?.isSkinnedMesh || !mesh.geometry.morphAttributes.position?.length) return null;
  const identityBaked = root.userData.mhrIdentityBaked === true || mesh.userData.mhrIdentityBaked === true;
  const geometry = mesh.geometry;
  const basePosition = new Float32Array(geometry.attributes.position.array);
  const baseNormal = geometry.attributes.normal ? new Float32Array(geometry.attributes.normal.array) : null;
  const morphPositions = geometry.morphAttributes.position;
  const morphNormals = geometry.morphAttributes.normal || [];
  const directions = identityBaked ? { body: {}, localized: {} } : buildFeatureDirections(geometry);
  if (!identityBaked) {
    directions.body = buildBodyDirections(geometry);
    directions.localized = buildLocalizedFeatureDeltas(geometry, directions);
  }
  const bones = collectBones(root);
  const rest = captureRest(bones);
  const rootRestPosition = root.position.clone();
  const rootRestScale = root.scale.clone();
  const tempQuaternion = new THREE.Quaternion();
  let currentSeated = (values.seated ?? 1) >= 0.5 ? 1 : 0;
  let targetSeated = currentSeated;
  let poseTransition = null;
  let latestValues = values;
  let identitySignature = '';
  let gesture = null;

  function smootherStep(value) {
    const t = clamp(value, 0, 1);
    return t * t * t * (t * (t * 6 - 15) + 10);
  }

  function startSeatedTransition(seated, duration = 2.25, nextValues = latestValues) {
    latestValues = nextValues || latestValues;
    const nextTarget = seated ? 1 : 0;
    targetSeated = nextTarget;
    if (Math.abs(currentSeated - nextTarget) < 0.0005) {
      currentSeated = nextTarget;
      poseTransition = null;
      applyRig(latestValues, currentSeated);
      return false;
    }
    poseTransition = {
      from: currentSeated,
      to: nextTarget,
      elapsed: 0,
      duration: clamp(Number(duration) || 2.25, 0.35, 5),
    };
    return true;
  }

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

  function aimBoneToward(name, childName, target) {
    const bone = bones.get(name), child = bones.get(childName);
    if (!bone || !child) return;
    root.updateMatrixWorld(true);
    const origin = bone.getWorldPosition(new THREE.Vector3());
    const current = child.getWorldPosition(new THREE.Vector3()).sub(origin);
    const desired = target.clone().sub(origin);
    if (current.lengthSq() < 1e-7 || desired.lengthSq() < 1e-7) return;
    current.normalize(); desired.normalize();
    const worldRotation = bone.getWorldQuaternion(new THREE.Quaternion());
    const delta = new THREE.Quaternion().setFromUnitVectors(current, desired);
    const desiredWorld = delta.multiply(worldRotation);
    const parentWorld = bone.parent?.getWorldQuaternion(new THREE.Quaternion()) || new THREE.Quaternion();
    bone.quaternion.copy(parentWorld.invert().multiply(desiredWorld));
    root.updateMatrixWorld(true);
  }

  function poseArms(nextValues, sit, elapsed = 0) {
    root.updateMatrixWorld(true);
    const pelvisBone = bones.get('c_spine0');
    if (!pelvisBone) return;
    const pelvis = pelvisBone.getWorldPosition(new THREE.Vector3());
    const forward = new THREE.Vector3(0, 0, 1).transformDirection(root.matrixWorld).setY(0).normalize();
    const right = new THREE.Vector3(1, 0, 0).transformDirection(root.matrixWorld).setY(0).normalize();
    const up = new THREE.Vector3(0, 1, 0);
    const openness = clamp(Number(nextValues.armOpenness) || 0, -1, 1);
    const bend = clamp(nextValues.elbowBend ?? 0.68, 0, 1);
    const asymmetry = clamp(Number(nextValues.armAsymmetry) || 0, -1, 1);
    const masculineLap = clamp(((Number(nextValues.gender) || 0.5) - 0.5) * 2, 0, 1);
    const fidget = clamp(Number(nextValues.fidget) || 0, 0, 3);
    const tremor = clamp(Number(nextValues.tremor) || 0, 0, 2);

    for (const side of ['r', 'l']) {
      const upper = bones.get(`${side}_uparm`), lower = bones.get(`${side}_lowarm`), wrist = bones.get(`${side}_wrist`);
      if (!upper || !lower || !wrist) continue;
      const shoulder = upper.getWorldPosition(new THREE.Vector3());
      const elbow = lower.getWorldPosition(new THREE.Vector3());
      const hand = wrist.getWorldPosition(new THREE.Vector3());
      const sideSign = Math.sign(shoulder.clone().sub(pelvis).dot(right)) || (side === 'r' ? 1 : -1);
      const phase = side === 'r' ? 0.4 : 2.7;
      const naturalHandStagger = side === 'r' ? 0.018 : -0.012;
      const idleLift = elapsed ? Math.sin(elapsed * 0.83 + phase) * 0.006 * fidget : 0;
      const idleForward = elapsed ? Math.sin(elapsed * 0.57 + phase * 1.3) * 0.005 * fidget : 0;
      const tremorWave = elapsed
        ? (Math.sin(elapsed * 11.4 + phase) + Math.sin(elapsed * 17.1 + phase * 1.7) * 0.55) * 0.0045 * tremor
        : 0;
      const upperLength = Math.max(0.18, shoulder.distanceTo(elbow));
      const lowerLength = Math.max(0.16, elbow.distanceTo(hand));

      const standingElbow = shoulder.clone()
        .addScaledVector(up, -upperLength * 0.94)
        .addScaledVector(forward, upperLength * (0.06 + bend * 0.08))
        .addScaledVector(right, sideSign * (0.012 + openness * 0.025));
      const seatedElbow = shoulder.clone()
        .addScaledVector(up, -upperLength * (0.80 - openness * 0.05) + idleLift * 0.45)
        .addScaledVector(forward, upperLength * (0.24 + bend * 0.18 + asymmetry * sideSign * 0.12) + idleForward * 0.35)
        .addScaledVector(right, sideSign * (0.006 + openness * 0.045));
      const elbowTarget = standingElbow.lerp(seatedElbow, sit);
      aimBoneToward(`${side}_uparm`, `${side}_lowarm`, elbowTarget);

      const standingHand = shoulder.clone()
        .addScaledVector(up, -(upperLength + lowerLength) * 0.93)
        .addScaledVector(forward, 0.025 + bend * 0.025)
        .addScaledVector(right, sideSign * (0.025 + openness * 0.04));
      const seatedHand = pelvis.clone()
        // Rest on the *surface* of the seated skirt/lap. The earlier target
        // sat inside its procedural drape, hiding both hands and producing
        // intermittent cloth intersections during idle motion.
        .addScaledVector(up, 0.225 - masculineLap * 0.045 + naturalHandStagger + openness * 0.020 + asymmetry * sideSign * 0.030 + idleLift + tremorWave)
        .addScaledVector(forward, 0.380 - masculineLap * 0.020 - naturalHandStagger * 0.6 + bend * 0.060 + asymmetry * sideSign * 0.045 + idleForward)
        .addScaledVector(right, sideSign * (0.105 + openness * 0.065) + tremorWave * 0.65);
      const handTarget = standingHand.lerp(seatedHand, sit);
      aimBoneToward(`${side}_lowarm`, `${side}_wrist`, handTarget);

      rotate(`${side}_wrist`, 'z', 0.08 + (Number(nextValues.wristAngle) || 0) * 0.38 + tremorWave * 2.2);
    }

    // MHR ships articulated fingers, but its neutral hand is a flat scan pose.
    // A small baseline curl reads relaxed; tension increases the curl without
    // turning every patient into a clenched fist.
    const tension = clamp(nextValues.handTension ?? 0.28, 0, 1);
    const curl = 0.12 + tension * 0.42;
    for (const side of ['r', 'l']) {
      for (const finger of ['index', 'middle', 'ring']) {
        rotate(`${side}_${finger}1`, 'z', curl * 0.48);
        rotate(`${side}_${finger}2`, 'z', curl * 0.68);
        rotate(`${side}_${finger}3`, 'z', curl * 0.52);
      }
      rotate(`${side}_pinky0`, 'z', curl * 0.22);
      rotate(`${side}_pinky1`, 'z', curl * 0.50);
      rotate(`${side}_pinky2`, 'z', curl * 0.68);
      rotate(`${side}_pinky3`, 'z', curl * 0.50);
      rotate(`${side}_thumb0`, 'y', 0.08 + tension * 0.10);
      rotate(`${side}_thumb1`, 'z', curl * 0.24);
      rotate(`${side}_thumb2`, 'z', curl * 0.32);
    }
    root.updateMatrixWorld(true);
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
    // Rig-only controls must never rebake the 45 identity deltas. Keeping the
    // signatures separate turns limb, stature and pose changes into cheap bone
    // updates rather than full CPU mesh rewrites.
    const signature = [...MHR_IDENTITY_IDS].map((id) => nextValues[id]).join('|');
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
    const localizedRequests = localizedFeatureRequests(nextValues);
    for (const [feature, amount] of localizedRequests) {
      const localized = directions.localized[feature];
      if (!localized || Math.abs(amount) < 0.00001) continue;
      for (let offset = 0; offset < position.length; offset += 1) position[offset] += localized.position[offset] * amount;
      if (normal && localized.normal) {
        for (let offset = 0; offset < normal.length; offset += 1) normal[offset] += localized.normal[offset] * amount;
      }
    }
    // Direct anatomical terms are not accompanied by source morph normals.
    // Rebuilding them keeps highlights stable at slider endpoints.
    geometry.computeVertexNormals();
    geometry.attributes.position.needsUpdate = true;
    if (geometry.attributes.normal) geometry.attributes.normal.needsUpdate = true;
    geometry.computeBoundingBox(); geometry.computeBoundingSphere();
    for (let component = 0; component < 45; component += 1) {
      const index = mesh.morphTargetDictionary?.[`shape_${component}`];
      if (index != null) mesh.morphTargetInfluences[index] = 0;
    }
    mesh.userData.mhrIdentityWeights = weights;
    mesh.userData.mhrLocalizedRequests = Object.fromEntries(localizedRequests);
    mesh.userData.mhrSemanticProfile = mhrSemanticProfile(nextValues);
    return true;
  }

  function applyRig(nextValues, seatedBlend = currentSeated, elapsed = 0) {
    resetRig();
    const stature = unitRange(nextValues.height ?? 0.5, 0.2, 0.8);
    const presentation = calibratedPresentation(bipolar(nextValues.gender ?? 0.5, 0, 1));
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
    const foot = 1 + (Number(nextValues.mhrFootLength) || 0) * 0.07 + presentation * 0.022;
    const hand = 1 + (Number(nextValues.mhrHandScale) || 0) * 0.12 + presentation * 0.035;
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
    // Rotate the actual eye-null bones, not a screen-facing iris layer. Both
    // complete globes therefore share gaze, saccade and profile parallax.
    const gazeStrength = clamp(Number(nextValues.gazeDrift) || 0, 0, 3);
    const gazeSeed = (Number(nextValues.seed) || 1) * 0.017;
    const gazeYaw = elapsed
      ? (Math.sin(elapsed * 0.43 + gazeSeed) * 0.055 + Math.sin(elapsed * 0.17 + gazeSeed * 2.1) * 0.025) * gazeStrength
      : 0;
    const gazePitch = elapsed
      ? (Math.sin(elapsed * 0.31 + gazeSeed * 1.4) * 0.035 + Math.sin(elapsed * 0.11 + 1.7) * 0.016) * gazeStrength
      : 0;
    // The source eye-null axes diverge by about 5.55 degrees per side. Cancel
    // that authored wall-eyed rest orientation before applying shared gaze.
    rotate('r_eye_null', 'y', 0.097 + gazeYaw);
    rotate('l_eye_null', 'y', -0.097 + gazeYaw);
    rotate('r_eye_null', 'x', gazePitch);
    rotate('l_eye_null', 'x', gazePitch);

    const heightScale = THREE.MathUtils.lerp(0.925, 1.075, stature);
    root.scale.copy(rootRestScale); root.scale.y *= heightScale;
    root.position.copy(rootRestPosition);
    root.position.y -= seatedBlend * 0.39 * heightScale;
    root.position.z -= seatedBlend * 0.055;

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
    poseArms(nextValues, sit, elapsed);

    // Lean the trunk over the feet while the pelvis changes height. This small
    // balance transfer keeps the transition from reading as a mannequin being
    // lowered vertically, and disappears at both stable endpoints.
    if (poseTransition) {
      const progress = clamp(poseTransition.elapsed / poseTransition.duration, 0, 1);
      const balanceTransfer = Math.sin(progress * Math.PI);
      rotate('c_spine0', 'z', balanceTransfer * 0.11);
      rotate('c_spine1', 'z', balanceTransfer * 0.07);
      rotate('c_head', 'z', balanceTransfer * -0.045);
    }

    const knees = (Number(nextValues.kneesTogether) || 0) * 0.12 * sit;
    rotate('r_upleg', 'y', -knees);
    rotate('l_upleg', 'y', knees);
    const posture = Number(nextValues.posture) || 0;
    rotate('c_spine2', 'z', posture * -0.055);
    rotate('c_spine3', 'z', posture * -0.045);
    rotate('c_head', 'x', Number(nextValues.headTurn) || 0);
    // The source neutral rig looks down by roughly six degrees. Compensate at
    // zero so a generated patient meets the player at eye level; the slider
    // remains a signed offset around that visually neutral presentation.
    rotate('c_head', 'y', 0.10 + (Number(nextValues.headTilt) || 0));

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
        else if (gesture.name === 'glance') {
          rotate('c_head', 'x', envelope * gesture.direction * 0.28);
          rotate('r_eye_null', 'y', envelope * gesture.direction * 0.18);
          rotate('l_eye_null', 'y', envelope * gesture.direction * 0.18);
        }
        else if (gesture.name === 'sigh') rotate('c_spine2', 'z', envelope * 0.055);
      }
    }
    root.updateMatrixWorld(true);
  }

  function applyValues(nextValues, { forceIdentity = false, snapPose = false } = {}) {
    latestValues = nextValues;
    const nextTarget = (nextValues.seated ?? 1) >= 0.5 ? 1 : 0;
    if (snapPose) {
      targetSeated = nextTarget;
      currentSeated = nextTarget;
      poseTransition = null;
    } else if (nextTarget !== targetSeated) startSeatedTransition(nextTarget, 2.25, nextValues);
    const identityChanged = applyIdentity(nextValues, forceIdentity);
    applyRig(nextValues, currentSeated);
    return identityChanged;
  }

  function update(dt, elapsed, nextValues, _mode = 'procedural', ambientMotion = true) {
    latestValues = nextValues;
    const requestedTarget = (nextValues.seated ?? 1) >= 0.5 ? 1 : 0;
    if (requestedTarget !== targetSeated) startSeatedTransition(requestedTarget, 2.25, nextValues);
    if (poseTransition) {
      poseTransition.elapsed = Math.min(poseTransition.duration, poseTransition.elapsed + Math.max(0, dt));
      const progress = smootherStep(poseTransition.elapsed / poseTransition.duration);
      currentSeated = THREE.MathUtils.lerp(poseTransition.from, poseTransition.to, progress);
      if (poseTransition.elapsed >= poseTransition.duration) {
        currentSeated = poseTransition.to;
        poseTransition = null;
      }
    } else currentSeated = targetSeated;
    applyRig(nextValues, currentSeated, ambientMotion ? elapsed : 0);
  }

  function playGesture(name, speed = 1) {
    if (!['nod', 'shake', 'sigh', 'glance'].includes(name)) return;
    gesture = { name, started: performance.now() / 1000, duration: 1.7 / speed, direction: Math.random() < 0.5 ? -1 : 1 };
  }

  applyValues(values, { forceIdentity: true, snapPose: true });
  return {
    mode: 'mhr-rig', mesh, bones, directions, applyValues, update, playGesture, startSeatedTransition,
    identityBaked,
    captureRest() {}, snapToRest() { applyRig(latestValues, currentSeated); },
    get seatedBlend() { return currentSeated; },
    get targetSeated() { return targetSeated; },
    get isPoseTransitioning() { return poseTransition != null; },
    get poseTransitionProgress() { return poseTransition ? clamp(poseTransition.elapsed / poseTransition.duration, 0, 1) : 1; },
  };
}
