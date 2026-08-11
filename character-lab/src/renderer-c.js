import {
  RENDERER_C_LIVE_BODY_IDS,
  RENDERER_C_LIVE_FACE_IDS,
} from '../../shared/characters/rendererCRecipe.js';
import { appearancePaletteForAncestry } from '../../shared/characters/appearancePalettes.js';
import {
  deriveAgeAppearance,
  rendererCAgeValueToYears,
  rendererCYearsToAgeValue,
} from '../../shared/characters/ageAppearance.js';

export { RENDERER_C_LIVE_BODY_IDS, RENDERER_C_LIVE_FACE_IDS };
export { applyRendererCAppearance, createRendererCController } from '../../shared/characters/rendererCRuntime.js';
export {
  rendererCWomenPalette,
  RENDERER_C_FABRICS,
  RENDERER_C_WOMEN_WARDROBE_IDS,
  setRendererCWomenWardrobeVisible,
} from '../../shared/characters/rendererCWardrobeSurface.js';
export const RENDERER_C_LIVE_IDS = new Set([
  ...RENDERER_C_LIVE_FACE_IDS,
  ...RENDERER_C_LIVE_BODY_IDS,
  'rendererCAnchor', 'age', 'ageGeometry', 'height', 'african', 'asian', 'caucasian',
]);

export const RENDERER_C_COHORTS = Object.freeze({
  women: Object.freeze({ label: 'Women', gender: 0.025, muscleCenter: 0.27 }),
  men: Object.freeze({ label: 'Men', gender: 0.94, muscleCenter: 0.38 }),
});

export const RENDERER_C_AGE_BANDS = Object.freeze({
  '20s': Object.freeze({ label: '20s', age: rendererCYearsToAgeValue(25), years: 25 }),
  '30s': Object.freeze({ label: '30s', age: rendererCYearsToAgeValue(35), years: 35 }),
  '40s': Object.freeze({ label: '40s', age: rendererCYearsToAgeValue(45), years: 45 }),
  '50s': Object.freeze({ label: '50s', age: rendererCYearsToAgeValue(55), years: 55 }),
  '60s': Object.freeze({ label: '60s', age: rendererCYearsToAgeValue(65), years: 65 }),
  '70s': Object.freeze({ label: '70s', age: rendererCYearsToAgeValue(75), years: 75 }),
  '80s': Object.freeze({ label: '80s+', age: rendererCYearsToAgeValue(85), years: 85 }),
});

export const RENDERER_C_ANCESTRIES = Object.freeze({
  european: Object.freeze({ label: 'European American', african: 0, asian: 0, caucasian: 1 }),
  'european-african': Object.freeze({ label: 'Mixed European / African', african: 0.45, asian: 0, caucasian: 0.55 }),
  'european-asian': Object.freeze({ label: 'Mixed European / Asian', african: 0, asian: 0.38, caucasian: 0.62 }),
  african: Object.freeze({ label: 'African American', african: 1, asian: 0, caucasian: 0 }),
  asian: Object.freeze({ label: 'Asian American', african: 0, asian: 1, caucasian: 0 }),
});

const HAIR_COLORS = ['#241812', '#3c2418', '#65422e', '#8a684b', '#b08b62', '#171311'];
const GARMENT_PALETTES = Object.freeze([
  Object.freeze({ dressColor: '#38202f', secondaryColor: '#817064', trimColor: '#b08a62' }),
  Object.freeze({ dressColor: '#183326', secondaryColor: '#c2b79a', trimColor: '#74523c' }),
  Object.freeze({ dressColor: '#202d43', secondaryColor: '#65313a', trimColor: '#b49b72' }),
  Object.freeze({ dressColor: '#663526', secondaryColor: '#4f5638', trimColor: '#c0a16f' }),
  Object.freeze({ dressColor: '#555765', secondaryColor: '#826274', trimColor: '#c2ae91' }),
  Object.freeze({ dressColor: '#171719', secondaryColor: '#343137', trimColor: '#676069' }),
]);
const WOMEN_FABRICS = ['cotton', 'wool', 'wool', 'silk', 'velvet', 'brocade'];
const DRESS_DETAIL_PATTERNS = ['plain', 'double-stitch', 'chevron', 'diamond', 'braid', 'vine'];

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
  const appearancePalette = appearancePaletteForAncestry(ancestry);
  const skinOrder = shuffledIndices(appearancePalette.skinTones.length, random);
  const eyeOrder = shuffledIndices(appearancePalette.eyeColors.length, random);
  const candidates = [];
  for (let index = 0; index < count; index += 1) {
    const anchorIndex = order[index % order.length];
    const anchor = anchors[anchorIndex];
    const candidateAge = clamp(ageDefinition.age + (random() * 2 - 1) * 0.012, 0.5, 0.86);
    const ageAppearance = deriveAgeAppearance({
      ageYears: rendererCAgeValueToYears(candidateAge),
      seed: `${seed}:${index + 1}`,
    });
    const garmentPalette = pick(GARMENT_PALETTES, random);
    const values = {
      ...localTuning(random, cohort),
      ...ageAppearance,
      rendererCAnchor: anchorIndex,
      gender: cohortDefinition.gender,
      age: candidateAge,
      african: ancestryDefinition.african,
      asian: ancestryDefinition.asian,
      caucasian: ancestryDefinition.caucasian,
      height: clamp((cohort === 'men' ? 0.54 : 0.46) + (random() * 2 - 1) * 0.13, 0.25, 0.76),
      weight: clamp(0.48 + (random() * 2 - 1) * 0.15, 0.25, 0.76),
      muscle: clamp(cohortDefinition.muscleCenter + (random() * 2 - 1) * 0.10, 0.19, 0.68),
      proportions: clamp(0.5 + (random() * 2 - 1) * 0.12, 0.3, 0.7),
      skinTone: appearancePalette.skinTones[skinOrder[index % skinOrder.length]],
      eyeColor: appearancePalette.eyeColors[eyeOrder[index % eyeOrder.length]],
      hairColor: pick(HAIR_COLORS, random),
      browColor: pick(HAIR_COLORS.slice(0, 4), random),
      ...garmentPalette,
      womenPalette: 'custom',
      fabricType: pick(WOMEN_FABRICS, random),
      fabricScale: clamp(0.82 + random() * 0.42, 0.45, 2.5),
      fabricRelief: clamp(0.52 + random() * 0.48, 0, 1.5),
      fabricSheen: clamp(0.38 + random() * 0.62, 0, 1.5),
      dressDetailPattern: pick(DRESS_DETAIL_PATTERNS, random),
      dressDetailAmount: clamp(0.48 + random() * 0.48, 0, 1.5),
      dressDetailScale: clamp(0.72 + random() * 0.72, 0.5, 2.5),
      necklineHeight: clamp(0.74 + random() * 0.20, 0, 1),
      cuffWidth: clamp(0.42 + random() * 0.34, 0, 1),
      trimWidth: clamp(0.24 + random() * 0.38, 0, 1),
      placketWidth: clamp(0.22 + random() * 0.28, 0, 1),
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
