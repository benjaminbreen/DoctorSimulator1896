import { createCharacterRecipe } from './recipe.js';
import { AGE_APPEARANCE_VALUE_IDS } from './ageAppearance.js';

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
export const RENDERER_C_VALUE_IDS = Object.freeze([
  ...RENDERER_C_LIVE_FACE_IDS,
  ...RENDERER_C_LIVE_BODY_IDS,
  ...AGE_APPEARANCE_VALUE_IDS,
  'age', 'height', 'african', 'asian', 'caucasian',
]);

function hashText(value) {
  const text = String(value);
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function rendererCCohortForPatient(patient) {
  return patient?.identity?.sex === 'male' ? 'men' : 'women';
}

export function rendererCAgeBandForPatient(patient) {
  const age = Number(patient?.identity?.age) || 30;
  if (age < 30) return '20s';
  if (age < 40) return '30s';
  if (age < 50) return '40s';
  if (age < 60) return '50s';
  if (age < 70) return '60s';
  if (age < 80) return '70s';
  return '80s';
}

export function rendererCAncestryForValues(values = {}) {
  const african = Number(values.african) || 0;
  const asian = Number(values.asian) || 0;
  if (african >= 0.68) return 'african';
  if (asian >= 0.68) return 'asian';
  if (african >= 0.18) return 'european-african';
  if (asian >= 0.18) return 'european-asian';
  return 'european';
}

export function selectRendererCAnchor({ seed, cohort, anchorCount }) {
  const count = Math.max(1, Math.trunc(Number(anchorCount) || 0));
  return hashText(`renderer-c:${cohort}:${seed}`) % count;
}

function supportedValues(values, anchorIndex) {
  const selected = { rendererCAnchor: anchorIndex };
  for (const id of RENDERER_C_VALUE_IDS) {
    if (Number.isFinite(Number(values?.[id]))) selected[id] = Number(values[id]);
  }
  for (const id of [
    'skinTone', 'eyeColor', 'hairColor', 'browColor', 'lashColor', 'dressColor', 'secondaryColor',
    'trimColor', 'greyPattern', 'fabricType', 'womenPalette', 'womenGarmentMode',
    'dressDetailPattern',
  ]) {
    if (typeof values?.[id] === 'string') selected[id] = values[id];
  }
  for (const id of [
    'skinRoughness', 'fabricRoughness', 'fabricScale', 'fabricRelief', 'fabricSheen',
    'necklineHeight', 'cuffWidth', 'trimWidth', 'placketWidth', 'collarHeight',
    'collarThickness', 'cuffThickness',
    'buttonCount', 'buttonSpacing', 'waistHeight',
    'dressDetailAmount', 'dressDetailScale',
  ]) {
    if (Number.isFinite(Number(values?.[id]))) selected[id] = Number(values[id]);
  }
  return selected;
}

export function resolveRendererCRecipe({
  id,
  patient,
  values = {},
  restingFace = {},
  manifest = null,
  appearanceSeed,
  anchorCount = 8,
  animation,
  lod = 'consultation',
  placement,
  overrides = {},
} = {}) {
  const cohort = overrides.cohort || rendererCCohortForPatient(patient);
  const cohortManifest = manifest?.cohorts?.[cohort] || manifest;
  const anchors = cohortManifest?.anchors || [];
  const count = anchors.length || anchorCount;
  const seed = Number(appearanceSeed ?? patient?.seed) || 1;
  const anchorIndex = Number.isInteger(overrides.anchorIndex)
    ? Math.max(0, Math.min(count - 1, overrides.anchorIndex))
    : selectRendererCAnchor({ seed, cohort, anchorCount: count });
  const anchor = anchors[anchorIndex];

  return createCharacterRecipe({
    id: id || `patient-${patient?.seed || seed}`,
    renderer: 'renderer-c',
    cohort,
    identitySeed: Number(patient?.seed) || seed,
    appearanceSeed: seed,
    anchor: { index: anchorIndex, id: anchor?.id || null },
    values: supportedValues(values, anchorIndex),
    presentation: {
      hairStyle: values.hairStyle || null,
      outfitId: values.outfitStyle || null,
      dressColor: values.dressColor || null,
      secondaryColor: values.secondaryColor || null,
      trimColor: values.trimColor || null,
      fabricType: values.fabricType || null,
      womenPalette: values.womenPalette || null,
      menswearPalette: values.menswearPalette || null,
      fabricPattern: values.fabricPattern || null,
    },
    restingFace,
    animation: animation || { body: 'clinic-idle', expression: 'neutral', gaze: 'doctor' },
    lod,
    asset: cohortManifest?.path ? { path: cohortManifest.path } : null,
    placement,
  });
}
