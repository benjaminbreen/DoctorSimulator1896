import {
  resolveRendererCRecipe,
  rendererCAncestryForValues,
  RENDERER_C_LIVE_FACE_IDS,
} from '../characters/rendererCRecipe.js';
import { appearancePaletteForAncestry } from '../characters/appearancePalettes.js';
import {
  deriveAgeAppearance,
  rendererCYearsToAgeValue,
} from '../characters/ageAppearance.js';
import { createRandom } from './random.js';
import { getOriginProfile } from './data/demographics.js';
import { generateRestingFaceSignature } from './faceSignature.js';

const LABORING_OCCUPATIONS = new Set([
  'domestic-servant', 'laundress', 'seamstress', 'factory-worker',
  'laborer', 'porter', 'railroad-worker', 'skilled-tradesman',
]);

const GARMENT_COLORS = ['#183326', '#202b25', '#28364a', '#3d2630', '#2d2b3f', '#37402d'];
const TRIM_COLORS = ['#4d4037', '#625346', '#51485a', '#6a554c'];
const WOMEN_PALETTES = [
  { dressColor: '#38202f', secondaryColor: '#817064', trimColor: '#b08a62' },
  { dressColor: '#183326', secondaryColor: '#c2b79a', trimColor: '#74523c' },
  { dressColor: '#202d43', secondaryColor: '#65313a', trimColor: '#b49b72' },
  { dressColor: '#663526', secondaryColor: '#4f5638', trimColor: '#c0a16f' },
  { dressColor: '#555765', secondaryColor: '#826274', trimColor: '#c2ae91' },
];

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function mixHex(left, right, amount) {
  const channels = (value) => [1, 3, 5].map((index) => parseInt(value.slice(index, index + 2), 16));
  const a = channels(left); const b = channels(right);
  return `#${a.map((value, index) => Math.round(value + (b[index] - value) * amount)
    .toString(16).padStart(2, '0')).join('')}`;
}

function outfitFor(patient) {
  if (patient.identity.sex === 'female') return 'golden-dress';
  return LABORING_OCCUPATIONS.has(patient.social.occupationId) ? 'working-clothes' : 'sack-suit';
}

/** Resolve a patient into the same bounded Renderer C recipe used by the lab. */
export function patientToRendererCRecipe(patient, options = {}) {
  const appearanceSeed = Number(options.appearanceSeed ?? patient.seed);
  const faceRandom = createRandom(appearanceSeed, 'renderer-c.face');
  const bodyRandom = createRandom(appearanceSeed, 'renderer-c.body');
  const colorRandom = createRandom(appearanceSeed, 'renderer-c.color');
  const origin = getOriginProfile(patient.identity.origin.id);
  const female = patient.identity.sex === 'female';
  const laboring = LABORING_OCCUPATIONS.has(patient.social.occupationId);
  const classWeight = { elite: 0.55, affluent: 0.52, comfortable: 0.48, sponsored: 0.44 }[patient.social.classId] ?? 0.48;
  const womenPalette = colorRandom.pick(WOMEN_PALETTES);

  const values = {
    ...deriveAgeAppearance({ ageYears: patient.identity.age, seed: appearanceSeed }),
    age: rendererCYearsToAgeValue(patient.identity.age),
    height: clamp((female ? 0.46 : 0.54) + bodyRandom.bell() * 0.13, 0.25, 0.76),
    weight: clamp(classWeight + bodyRandom.bell() * 0.14, 0.25, 0.76),
    muscle: clamp((female ? 0.27 : 0.38) + (laboring ? 0.07 : 0) + bodyRandom.bell() * 0.1, 0.19, 0.68),
    proportions: clamp(0.5 + bodyRandom.bell() * 0.12, 0.3, 0.7),
    african: origin.heritage[0], asian: origin.heritage[1], caucasian: origin.heritage[2],
    hairColor: colorRandom.pick(origin.hairColors),
    dressColor: female ? womenPalette.dressColor : colorRandom.pick(GARMENT_COLORS),
    secondaryColor: female ? womenPalette.secondaryColor : colorRandom.pick(TRIM_COLORS),
    trimColor: female ? womenPalette.trimColor : colorRandom.pick(TRIM_COLORS),
    womenPalette: 'custom',
    womenGarmentMode: 'golden-dress',
    fabricType: female
      ? colorRandom.weighted(laboring
        ? [{ id: 'cotton', weight: 4 }, { id: 'wool', weight: 3 }]
        : [{ id: 'wool', weight: 4 }, { id: 'silk', weight: 2 }, { id: 'brocade', weight: 2 }, { id: 'velvet', weight: 1 }]).id
      : 'wool',
    fabricScale: clamp(0.9 + colorRandom.bell() * 0.2, 0.55, 1.4),
    fabricRelief: clamp(0.68 + colorRandom.bell() * 0.18, 0.3, 1.1),
    fabricSheen: clamp((laboring ? 0.38 : 0.68) + colorRandom.bell() * 0.2, 0.1, 1.15),
    skinRoughness: clamp(0.84 + ((patient.identity.age - 18) / 58) * 0.14, 0.82, 1),
    fabricRoughness: 0.96,
    necklineHeight: clamp(0.82 + colorRandom.bell() * 0.09, 0.68, 0.98),
    cuffWidth: clamp(0.58 + colorRandom.bell() * 0.16, 0.28, 0.9),
    trimWidth: clamp((laboring ? 0.24 : 0.44) + colorRandom.bell() * 0.16, 0.08, 0.85),
    placketWidth: clamp(0.32 + colorRandom.bell() * 0.1, 0.14, 0.62),
    buttonCount: Math.round(clamp(6 + colorRandom.bell() * 1.5, 4, 9)),
    buttonSpacing: clamp(0.95 + colorRandom.bell() * 0.08, 0.75, 1.2),
    waistHeight: clamp(0.03 + colorRandom.bell() * 0.03, -0.05, 0.1),
    outfitStyle: outfitFor(patient),
  };
  const appearancePalette = appearancePaletteForAncestry(rendererCAncestryForValues(values));
  values.skinTone = colorRandom.pick(appearancePalette.skinTones);
  values.eyeColor = colorRandom.pick(appearancePalette.eyeColors);
  values.browColor = mixHex(values.hairColor, '#21150f', 0.42);
  values.lashColor = mixHex(values.hairColor, '#100b09', 0.68);

  for (const id of RENDERER_C_LIVE_FACE_IDS) {
    const spread = id.startsWith('nose') ? 0.1 : id.startsWith('eye') ? 0.07 : 0.08;
    values[id] = Number((faceRandom.bell() * spread).toFixed(4));
  }

  return resolveRendererCRecipe({
    id: options.id || `patient-${patient.seed}`,
    patient,
    values,
    restingFace: generateRestingFaceSignature(appearanceSeed),
    appearanceSeed,
    anchorCount: options.anchorCount ?? 8,
    animation: options.animation,
    asset: options.asset,
    // The shared cohort masters can complete a spoken gesture and release
    // their gaze locally. Authored one-off assets keep their existing timing
    // unless they explicitly opt in.
    performanceStyle: options.performanceStyle
      || (options.asset ? null : 'responsive-consultation'),
    lod: options.lod || 'consultation',
    placement: options.placement,
  });
}
