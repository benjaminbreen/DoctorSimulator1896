import * as THREE from 'three';


export const RENDERER_C_LIVE_FACE_IDS = Object.freeze([
  'headWidth', 'faceHeight', 'headDepth',
  'noseWidth', 'noseLength', 'noseDepth', 'noseBridge', 'noseCurve',
  'noseTipAngle', 'nostrilWidth',
  'jawWidth', 'chinHeight', 'chinProminence', 'chinPrognathism',
  'eyeSize', 'eyeSpacing', 'eyeVerticalPosition', 'eyeDepth',
  'eyeHeightInner', 'eyeHeightCenter', 'eyeHeightOuter',
  'browHeight', 'browAngle',
  'mouthWidth', 'mouthDepth', 'lipFullness',
  'cheekVolume', 'cheekboneProminence', 'cheekHeight',
]);

export const RENDERER_C_LIVE_BODY_IDS = Object.freeze(['weight', 'muscle', 'proportions']);
export const RENDERER_C_LIVE_IDS = new Set([
  ...RENDERER_C_LIVE_FACE_IDS,
  ...RENDERER_C_LIVE_BODY_IDS,
  'age', 'height', 'african', 'asian', 'caucasian',
]);

export const RENDERER_C_COHORTS = Object.freeze({
  women: Object.freeze({ label: 'Women', gender: 0.025, muscleCenter: 0.27 }),
  men: Object.freeze({ label: 'Men', gender: 0.94, muscleCenter: 0.38 }),
});

export const RENDERER_C_AGE_BANDS = Object.freeze({
  '20s': Object.freeze({ label: '20s', age: 0.515 }),
  '30s': Object.freeze({ label: '30s', age: 0.555 }),
  '40s': Object.freeze({ label: '40s', age: 0.64 }),
  '50s': Object.freeze({ label: '50s', age: 0.72 }),
  '60s': Object.freeze({ label: '60s', age: 0.80 }),
});

export const RENDERER_C_ANCESTRIES = Object.freeze({
  european: Object.freeze({ label: 'European American', african: 0, asian: 0, caucasian: 1 }),
  'european-african': Object.freeze({ label: 'Mixed European / African', african: 0.45, asian: 0, caucasian: 0.55 }),
  'european-asian': Object.freeze({ label: 'Mixed European / Asian', african: 0, asian: 0.38, caucasian: 0.62 }),
  african: Object.freeze({ label: 'African American', african: 1, asian: 0, caucasian: 0 }),
  asian: Object.freeze({ label: 'Asian American', african: 0, asian: 1, caucasian: 0 }),
});

const EYE_COLORS = ['#496d89', '#65868a', '#758b63', '#735b3f', '#4b3a2d', '#8b734c'];
const EUROPEAN_SKIN = ['#d9ad91', '#c89578', '#edc7ad', '#b97f66', '#e0b59e', '#ca987f'];
const AFRICAN_SKIN = ['#6f4938', '#80533e', '#5f3d31', '#95664d', '#704737'];
const ASIAN_SKIN = ['#d3a17f', '#c58e6d', '#e1b394', '#b87e62', '#ce9674'];
const HAIR_COLORS = ['#241812', '#3c2418', '#65422e', '#8a684b', '#b08b62', '#171311'];
const GARMENT_COLORS = ['#183326', '#202b25', '#28364a', '#3d2630', '#2d2b3f', '#37402d'];

function clamp(value, minimum = -1, maximum = 1) {
  return Math.max(minimum, Math.min(maximum, value));
}

function hashSeed(value) {
  const text = String(value);
  let state = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    state ^= text.charCodeAt(index);
    state = Math.imul(state, 16777619);
  }
  return state >>> 0;
}

function randomSource(seed) {
  let state = hashSeed(seed) || 1;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffledIndices(count, random) {
  const indices = Array.from({ length: count }, (_, index) => index);
  for (let index = indices.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1));
    [indices[index], indices[swap]] = [indices[swap], indices[index]];
  }
  return indices;
}

function pick(values, random) {
  return values[Math.floor(random() * values.length) % values.length];
}

function mixedSkinPalette(ancestry) {
  if (ancestry === 'african') return AFRICAN_SKIN;
  if (ancestry === 'asian') return ASIAN_SKIN;
  if (ancestry === 'european-african') return [...EUROPEAN_SKIN.slice(2), ...AFRICAN_SKIN.slice(1, 4)];
  if (ancestry === 'european-asian') return [...EUROPEAN_SKIN.slice(1), ...ASIAN_SKIN.slice(1, 4)];
  return EUROPEAN_SKIN;
}

function localTuning(random, cohort) {
  const signed = (spread) => (random() * 2 - 1) * spread;
  return {
    headWidth: signed(0.08),
    faceHeight: signed(0.07),
    headDepth: signed(0.06),
    noseWidth: signed(0.11),
    noseLength: signed(0.12),
    noseDepth: signed(0.11),
    noseBridge: signed(0.10),
    noseCurve: signed(0.10),
    noseTipAngle: signed(0.09),
    nostrilWidth: signed(0.09),
    jawWidth: signed(cohort === 'men' ? 0.045 : 0.055),
    chinHeight: cohort === 'men' ? -0.06 - random() * 0.055 : signed(0.045) - 0.015,
    chinProminence: cohort === 'men' ? -0.055 - random() * 0.05 : signed(0.045) - 0.01,
    chinPrognathism: cohort === 'men' ? -0.035 - random() * 0.035 : signed(0.035) - 0.01,
    eyeSize: signed(0.07),
    eyeSpacing: signed(0.08),
    eyeVerticalPosition: signed(0.045),
    eyeDepth: signed(0.075),
    eyeHeightInner: signed(0.055),
    eyeHeightCenter: signed(0.055),
    eyeHeightOuter: signed(0.055),
    browHeight: signed(0.07),
    browAngle: signed(0.08),
    mouthWidth: signed(0.08),
    mouthDepth: signed(0.06),
    lipFullness: signed(0.08),
    cheekVolume: signed(0.075),
    cheekboneProminence: signed(0.085),
    cheekHeight: signed(0.06),
  };
}

export function generateRendererCCandidates({
  cohort = 'women', ageBand = '30s', ancestry = 'european', seed = 1896, count = 8, manifest,
} = {}) {
  const cohortDefinition = RENDERER_C_COHORTS[cohort] || RENDERER_C_COHORTS.women;
  const ageDefinition = RENDERER_C_AGE_BANDS[ageBand] || RENDERER_C_AGE_BANDS['30s'];
  const ancestryDefinition = RENDERER_C_ANCESTRIES[ancestry] || RENDERER_C_ANCESTRIES.european;
  const anchors = manifest?.anchors || [];
  if (!anchors.length) return [];
  const random = randomSource(`renderer-c:${cohort}:${ageBand}:${ancestry}:${seed}`);
  const order = shuffledIndices(anchors.length, random);
  const skinPalette = mixedSkinPalette(ancestry);
  const candidates = [];
  for (let index = 0; index < count; index += 1) {
    const anchorIndex = order[index % order.length];
    const anchor = anchors[anchorIndex];
    const values = {
      ...localTuning(random, cohort),
      rendererCAnchor: anchorIndex,
      gender: cohortDefinition.gender,
      age: clamp(ageDefinition.age + (random() * 2 - 1) * 0.012, 0.5, 0.86),
      african: ancestryDefinition.african,
      asian: ancestryDefinition.asian,
      caucasian: ancestryDefinition.caucasian,
      height: clamp((cohort === 'men' ? 0.54 : 0.46) + (random() * 2 - 1) * 0.13, 0.25, 0.76),
      weight: clamp(0.48 + (random() * 2 - 1) * 0.15, 0.25, 0.76),
      muscle: clamp(cohortDefinition.muscleCenter + (random() * 2 - 1) * 0.10, 0.19, 0.68),
      proportions: clamp(0.5 + (random() * 2 - 1) * 0.12, 0.3, 0.7),
      skinTone: pick(skinPalette, random),
      eyeColor: index < anchors.length ? anchor.eyeColor : pick(EYE_COLORS, random),
      hairColor: pick(HAIR_COLORS, random),
      browColor: pick(HAIR_COLORS.slice(0, 4), random),
      dressColor: pick(GARMENT_COLORS, random),
    };
    candidates.push({
      id: `${seed}-${index + 1}`,
      number: index + 1,
      cohort,
      ageBand,
      ancestry,
      anchorIndex,
      anchor,
      label: anchor.label,
      values,
    });
  }
  return candidates;
}

function morphWeight(root, name, value) {
  let changed = false;
  root.traverse((object) => {
    const index = object.morphTargetDictionary?.[name];
    if (index === undefined) return;
    if (Math.abs((object.morphTargetInfluences[index] || 0) - value) > 1e-5) changed = true;
    object.morphTargetInfluences[index] = value;
  });
  return changed;
}

function signedMorph(root, parameterId, value) {
  const normalized = clamp(Number(value) || 0);
  const positive = Math.max(0, normalized);
  const negative = Math.max(0, -normalized);
  const positiveChanged = morphWeight(root, `rc_live_${parameterId}_pos`, positive);
  const negativeChanged = morphWeight(root, `rc_live_${parameterId}_neg`, negative);
  return positiveChanged || negativeChanged;
}

function bodySignedValue(parameterId, value, cohort) {
  const centers = { weight: 0.48, muscle: RENDERER_C_COHORTS[cohort]?.muscleCenter ?? 0.32, proportions: 0.50 };
  const ranges = {
    weight: [0.24, 0.78],
    muscle: [0.18, 0.72],
    proportions: [0.28, 0.74],
  };
  const center = centers[parameterId];
  const [low, high] = ranges[parameterId];
  return value >= center ? (value - center) / (high - center) : (value - center) / (center - low);
}

function setVariants(variants, anchor) {
  const slotProperties = { brows: 'browSlot', lashes: 'lashSlot', hair: 'hairSlot', eyes: 'eyeSlot', teeth: 'teethSlot' };
  for (const [role, objects] of variants) {
    const slot = anchor[slotProperties[role]] ?? anchor.browSlot;
    for (const object of objects) object.visible = Number(object.userData.renderer_c_variant_slot) === slot;
  }
}

export function createRendererCController(root, manifest, initialValues = {}) {
  const anchors = manifest?.anchors || [];
  const variants = new Map();
  root.traverse((object) => {
    const role = object.userData?.renderer_c_variant_role;
    if (!['brows', 'lashes', 'hair', 'eyes', 'teeth'].includes(role)) return;
    if (!variants.has(role)) variants.set(role, []);
    variants.get(role).push(object);
  });
  let activeAnchor = -1;

  function applyValues(values, { force = false } = {}) {
    let changed = false;
    const anchorIndex = THREE.MathUtils.clamp(Math.round(Number(values.rendererCAnchor) || 0), 0, Math.max(0, anchors.length - 1));
    for (let index = 0; index < anchors.length; index += 1) {
      changed = morphWeight(root, anchors[index].morph, index === anchorIndex ? 1 : 0) || changed;
    }
    if (force || anchorIndex !== activeAnchor) {
      setVariants(variants, anchors[anchorIndex] || {});
      activeAnchor = anchorIndex;
      changed = true;
    }

    const age = Number(values.age ?? manifest.neutralAge ?? 0.555);
    changed = morphWeight(root, manifest.demographicMorphs.ageYoung, clamp((0.555 - age) / 0.05, 0, 1)) || changed;
    changed = morphWeight(root, manifest.demographicMorphs.ageOld, clamp((age - 0.555) / (0.84 - 0.555), 0, 1)) || changed;
    changed = morphWeight(root, manifest.demographicMorphs.asian, clamp(Number(values.asian) || 0, 0, 1)) || changed;
    changed = morphWeight(root, manifest.demographicMorphs.african, clamp(Number(values.african) || 0, 0, 1)) || changed;

    for (const parameterId of RENDERER_C_LIVE_FACE_IDS) {
      changed = signedMorph(root, parameterId, values[parameterId]) || changed;
    }
    for (const parameterId of RENDERER_C_LIVE_BODY_IDS) {
      changed = signedMorph(root, parameterId, bodySignedValue(parameterId, Number(values[parameterId]), manifest.cohort)) || changed;
    }
    const heightCenter = manifest.cohort === 'men' ? 0.53 : 0.47;
    const heightScale = 1 + ((Number(values.height) || heightCenter) - heightCenter) * 0.28;
    root.scale.set(1, heightScale, 1);
    root.updateMatrixWorld(true);
    return changed;
  }

  applyValues(initialValues, { force: true });
  return {
    manifest,
    anchors,
    variants,
    applyValues,
    get activeAnchor() { return activeAnchor; },
  };
}

export function applyRendererCCandidate(preset, candidate) {
  Object.assign(preset.values, candidate.values);
  preset.rendererC = {
    cohort: candidate.cohort,
    ageBand: candidate.ageBand,
    ancestry: candidate.ancestry,
    candidateId: candidate.id,
    anchorId: candidate.anchor.id,
    anchorLabel: candidate.anchor.label,
  };
  return preset;
}
