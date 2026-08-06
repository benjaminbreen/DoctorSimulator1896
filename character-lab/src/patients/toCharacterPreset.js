import { createRandom } from './random.js';
import { getOriginProfile } from './data/demographics.js';
import {
  DRESS_PALETTES, FACE_ARCHETYPES, FACE_VALUE_IDS, HAIR_STYLES, OUTFIT_RULES,
} from './data/appearance.js';
import { nearestHairShade } from '../hair/palette.js';
import { generateRestingFaceSignature } from './faceSignature.js';

const NEUTRAL_PERFORMANCE = {
  posture: 0.1, breathing: 1, breathingRate: 13, fidget: 0.85, gazeDrift: 0.9,
  weightShift: 0.9, tremor: 0.08, handTension: 0.35, gestureSpeed: 1,
};

const STYLE_VALUES = {
  'conservative-day': { bodiceFit: 0.96, waistHeight: 0.03, skirtFullness: 1.02, skirtLength: 1.02, skirtDrape: 0.67, bustleAmount: 0.1, sleeveVolume: 0.82, sleeveLength: 1.0, collarHeight: 0.95, collarSpread: 0.88, buttonCount: 7, buttonSpacing: 0.92 },
  'fashionable-1896': { bodiceFit: 0.93, waistHeight: 0.055, skirtFullness: 1.2, skirtLength: 1.02, skirtDrape: 0.72, bustleAmount: 0.18, sleeveVolume: 1.4, sleeveLength: 0.98, collarHeight: 1.08, collarSpread: 1.06, buttonCount: 6, buttonSpacing: 0.95 },
  'mourning-dress': { bodiceFit: 0.98, waistHeight: 0.025, skirtFullness: 1.08, skirtLength: 1.04, skirtDrape: 0.72, bustleAmount: 0.08, sleeveVolume: 0.92, sleeveLength: 1.02, collarHeight: 1.12, collarSpread: 0.82, buttonCount: 8, buttonSpacing: 0.86 },
  'working-day': { bodiceFit: 1.02, waistHeight: 0.015, skirtFullness: 0.88, skirtLength: 0.94, skirtDrape: 0.58, bustleAmount: 0.03, sleeveVolume: 0.72, sleeveLength: 0.94, collarHeight: 0.72, collarSpread: 1.08, buttonCount: 6, buttonSpacing: 1.0 },
  'visiting-dress': { bodiceFit: 0.94, waistHeight: 0.045, skirtFullness: 1.15, skirtLength: 1.01, skirtDrape: 0.7, bustleAmount: 0.15, sleeveVolume: 1.22, sleeveLength: 0.99, collarHeight: 1.0, collarSpread: 1.12, buttonCount: 6, buttonSpacing: 0.92 },
};

function clamped(definitions, id, value) {
  const definition = definitions.find((candidate) => candidate.id === id);
  if (!definition || definition.type !== 'range') return value;
  const stepped = definition.step >= 1 ? Math.round(value) : value;
  return Math.min(definition.max, Math.max(definition.min, stepped));
}

function jitter(random, amount) {
  return random.bell() * amount;
}

function outfitFor(patient, random) {
  if (patient.clinical.flags.includes('mourning') && random.chance(0.86)) return 'mourning-dress';
  const laboring = ['domestic-servant', 'laundress', 'seamstress', 'factory-worker'].includes(patient.social.occupationId);
  const candidates = OUTFIT_RULES.filter((outfit) => outfit.classes.includes(patient.social.classId)
    && patient.identity.age <= (outfit.maxAge ?? 120) && outfit.id !== 'mourning-dress');
  return random.weighted(candidates, (outfit) => outfit.weight * (laboring && outfit.id === 'working-day' ? 3.5 : 1)).id;
}

function paletteFor(outfit, random) {
  if (outfit === 'mourning-dress') return random.pick(DRESS_PALETTES.mourning);
  if (outfit === 'fashionable-1896' || outfit === 'visiting-dress') return random.pick(DRESS_PALETTES.fashionable);
  if (outfit === 'working-day') return random.pick(DRESS_PALETTES.working);
  return random.pick(DRESS_PALETTES.sober);
}

function ageMorph(age) {
  return 0.5 + ((age - 16) / 60) * 0.4;
}

function skinAge(age) {
  return Math.min(1, Math.max(0, (age - 18) / 58));
}

function lipColorForSkin(skinTone, random) {
  const channels = [1, 3, 5].map((index) => parseInt(skinTone.slice(index, index + 2), 16));
  const variation = random.bell() * 10;
  const tinted = [
    channels[0] * 0.72 + 35 + variation,
    channels[1] * 0.55 + 15 + variation * 0.35,
    channels[2] * 0.58 + 18 + variation * 0.45,
  ].map((value) => Math.round(Math.min(255, Math.max(0, value))));
  return `#${tinted.map((value) => value.toString(16).padStart(2, '0')).join('')}`;
}

function bodyMass(patient, random) {
  const classCenter = { elite: 0.56, affluent: 0.53, comfortable: 0.49, sponsored: 0.44 }[patient.social.classId];
  const ageAdjustment = patient.identity.age > 50 ? 0.035 : patient.identity.age < 23 ? -0.035 : 0;
  const complaintAdjustment = ['melancholic-withdrawal', 'neurasthenic-exhaustion', 'morphine-habit'].includes(patient.clinical.id) ? -0.045 : 0;
  return classCenter + ageAdjustment + complaintAdjustment + jitter(random, 0.16);
}

function hairStyleWeight(style, age) {
  const band = age < 30 ? 0 : age < 50 ? 1 : 2;
  return style.weight * (style.ageWeights?.[band] ?? 1);
}

function groomingDisarray(patient, random) {
  const classPolish = { elite: 0.78, affluent: 0.66, comfortable: 0.50, sponsored: 0.38 }[patient.social.classId];
  const performance = patient.clinical.performance || NEUTRAL_PERFORMANCE;
  const agitation = Math.max(0, (performance.fidget - 0.7) / 1.1) * 0.18;
  const fatigue = ['weary', 'sad'].includes(patient.clinical.affect) ? 0.10 : 0;
  return Math.min(1, Math.max(0, 0.54 - classPolish * 0.46 + agitation + fatigue + jitter(random, 0.17)));
}

function descriptionFor(patient) {
  const work = patient.social.occupation ?? patient.social.householdPosition;
  return `${patient.identity.age}-year-old ${patient.identity.origin.label} ${work} from ${patient.social.residence}, presenting with ${patient.clinical.presentingComplaint}.`;
}

/** Map a domain patient onto the existing Blender/Three.js preset contract. */
export function patientToCharacterPreset(patient, basePreset, definitions, options = {}) {
  const preset = structuredClone(basePreset);
  const values = preset.values;
  const appearanceSeed = Number(options.appearanceSeed ?? patient.seed);
  const faceRandom = createRandom(appearanceSeed, 'appearance.face');
  const bodyRandom = createRandom(appearanceSeed, 'appearance.body');
  const hairRandom = createRandom(appearanceSeed, 'appearance.hair');
  const dressRandom = createRandom(appearanceSeed, 'appearance.dress');
  const stylizedRandom = createRandom(appearanceSeed, 'appearance.stylized');
  // Performance belongs to the patient's clinical record, not to an alternate
  // visual interpretation of that patient.
  const performanceRandom = createRandom(Number(options.performanceSeed ?? patient.seed), 'appearance.performance');
  const origin = getOriginProfile(patient.identity.origin.id);
  const surfaceAge = skinAge(patient.identity.age);

  values.seed = appearanceSeed;
  values.gender = clamped(definitions, 'gender', 0.04 + jitter(bodyRandom, 0.05));
  values.age = clamped(definitions, 'age', ageMorph(patient.identity.age));
  values.height = clamped(definitions, 'height', 0.48 + jitter(bodyRandom, 0.28));
  values.weight = clamped(definitions, 'weight', bodyMass(patient, bodyRandom));
  const laboring = ['domestic-servant', 'laundress', 'factory-worker'].includes(patient.social.occupationId);
  values.muscle = clamped(definitions, 'muscle', 0.34 + (laboring ? 0.09 : 0) + jitter(bodyRandom, 0.18));
  values.proportions = clamped(definitions, 'proportions', 0.49 + jitter(bodyRandom, 0.16));
  values.shoulderWidth = clamped(definitions, 'shoulderWidth', -0.1 + jitter(bodyRandom, 0.24));
  values.torsoLength = clamped(definitions, 'torsoLength', 0.02 + jitter(bodyRandom, 0.22));

  [values.african, values.asian, values.caucasian] = origin.heritage;
  values.skinTone = bodyRandom.pick(origin.skinTones);
  values.eyeColor = bodyRandom.pick(origin.eyeColors);
  values.skinRoughness = clamped(definitions, 'skinRoughness', 1.02 + surfaceAge * 0.32 + jitter(bodyRandom, 0.18));

  const face = faceRandom.weighted(FACE_ARCHETYPES);
  values.headShape = face.headShape;
  values.headShapeStrength = clamped(definitions, 'headShapeStrength', 0.5 + jitter(faceRandom, 0.18));
  for (const id of FACE_VALUE_IDS) values[id] = clamped(definitions, id, face[id] + jitter(faceRandom, 0.11));
  values.browHeight = clamped(definitions, 'browHeight', -0.03 + jitter(faceRandom, 0.16));
  values.faceAsymmetry = clamped(definitions, 'faceAsymmetry', 0.055 + Math.abs(jitter(faceRandom, 0.08)));

  const hairCandidates = HAIR_STYLES.filter((style) => style.classes.includes(patient.social.classId)
    && patient.identity.age <= (style.maxAge ?? 120));
  values.hairStyle = hairRandom.weighted(hairCandidates, (style) => hairStyleWeight(style, patient.identity.age)).id;
  values.hairColor = hairRandom.pick(origin.hairColors);
  values.hairShade = nearestHairShade(values.hairColor);
  values.hairVolume = clamped(definitions, 'hairVolume', 1 + jitter(hairRandom, 0.22));
  values.hairHeight = clamped(definitions, 'hairHeight', 1 + jitter(hairRandom, 0.18));
  values.sideVolume = clamped(definitions, 'sideVolume', 1.02 + jitter(hairRandom, 0.24));
  const styleSweep = {
    'loose-chignon': 0.48, 'cropped-waves': 0.34, 'short-parted': 0.38,
    pompadour: 0.82, 'swept-back': 0.92, 'low-bun': 0.74,
  }[values.hairStyle] ?? 0.68;
  values.flowSweep = clamped(definitions, 'flowSweep', styleSweep + jitter(hairRandom, 0.12));
  values.partWidth = clamped(definitions, 'partWidth', 0.28 + jitter(hairRandom, 0.22));
  values.bunSize = clamped(definitions, 'bunSize', 1 + jitter(hairRandom, 0.28));
  values.hairlineHeight = clamped(definitions, 'hairlineHeight', jitter(hairRandom, 0.20));
  values.templeRecession = clamped(definitions, 'templeRecession', 0.12 + Math.max(0, patient.identity.age - 44) / 115 + jitter(hairRandom, 0.12));
  values.wispAmount = clamped(definitions, 'wispAmount', 0.24 + groomingDisarray(patient, hairRandom) * 0.58);
  values.waveAmount = clamped(definitions, 'waveAmount', 0.38 + jitter(hairRandom, 0.34));
  values.strandContrast = clamped(definitions, 'strandContrast', 0.42 + jitter(hairRandom, 0.24));
  values.greyAmount = clamped(definitions, 'greyAmount', Math.max(0, patient.identity.age - 42) / 38 + jitter(hairRandom, 0.13));
  values.stylizedPlaneContrast = clamped(definitions, 'stylizedPlaneContrast', 0.25 + surfaceAge * 0.16 + jitter(stylizedRandom, 0.10));
  values.stylizedTriangleBlend = clamped(definitions, 'stylizedTriangleBlend', 0.48 - surfaceAge * 0.18 + jitter(stylizedRandom, 0.12));
  values.stylizedSkinDetail = clamped(definitions, 'stylizedSkinDetail', 0.24 + surfaceAge * 0.50 + jitter(stylizedRandom, 0.10));
  values.stylizedPoreScale = clamped(definitions, 'stylizedPoreScale', 0.78 + surfaceAge * 0.62 + jitter(stylizedRandom, 0.22));
  values.stylizedPigmentVariation = clamped(definitions, 'stylizedPigmentVariation', 0.16 + surfaceAge * 0.52 + jitter(stylizedRandom, 0.11));
  values.stylizedFreckleAmount = clamped(definitions, 'stylizedFreckleAmount', 0.04 + surfaceAge * 0.15 + Math.max(0, jitter(stylizedRandom, 0.10)));
  values.stylizedSkinWarmth = clamped(definitions, 'stylizedSkinWarmth', 0.31 - surfaceAge * 0.10 + jitter(stylizedRandom, 0.10));
  values.stylizedCheekBlush = clamped(definitions, 'stylizedCheekBlush', 0.44 - surfaceAge * 0.08 + jitter(stylizedRandom, 0.16));
  values.stylizedNoseRedness = clamped(definitions, 'stylizedNoseRedness', 0.24 + surfaceAge * 0.16 + jitter(stylizedRandom, 0.13));
  values.stylizedForeheadWarmth = clamped(definitions, 'stylizedForeheadWarmth', 0.17 + surfaceAge * 0.05 + jitter(stylizedRandom, 0.10));
  values.stylizedLipTint = clamped(definitions, 'stylizedLipTint', 0.60 - surfaceAge * 0.19 + jitter(stylizedRandom, 0.12));
  values.stylizedLipColor = lipColorForSkin(values.skinTone, stylizedRandom);
  values.stylizedEyeContrast = clamped(definitions, 'stylizedEyeContrast', 0.40 - surfaceAge * 0.17 + jitter(stylizedRandom, 0.10));
  values.stylizedSurfaceRoughness = clamped(definitions, 'stylizedSurfaceRoughness', 0.72 + surfaceAge * 0.18 + jitter(stylizedRandom, 0.07));
  values.stylizedLightSoftness = clamped(definitions, 'stylizedLightSoftness', 0.78 + jitter(stylizedRandom, 0.12));

  values.outfitStyle = outfitFor(patient, dressRandom);
  [values.dressColor, values.trimColor] = paletteFor(values.outfitStyle, dressRandom);
  values.fabricRoughness = clamped(definitions, 'fabricRoughness', 1.42 + jitter(dressRandom, 0.14));
  for (const [id, center] of Object.entries(STYLE_VALUES[values.outfitStyle])) {
    values[id] = clamped(definitions, id, center + jitter(dressRandom, id === 'buttonCount' ? 1.5 : 0.06));
  }

  const severity = patient.clinical.severity;
  for (const [id, neutral] of Object.entries(NEUTRAL_PERFORMANCE)) {
    const target = patient.clinical.performance[id] ?? neutral;
    const amount = ['breathingRate'].includes(id) ? 0.8 : 0.08;
    values[id] = clamped(definitions, id, neutral + (target - neutral) * severity + jitter(performanceRandom, amount));
  }
  values.kneesTogether = clamped(definitions, 'kneesTogether', 0.74 + jitter(performanceRandom, 0.12));
  values.headTilt = clamped(definitions, 'headTilt', jitter(performanceRandom, 0.09));
  values.headTurn = clamped(definitions, 'headTurn', jitter(performanceRandom, 0.16));
  const sadPresentations = new Set(['melancholic-withdrawal', 'bereavement-visions', 'postpartum-disturbance']);
  const tiredPresentations = new Set(['neurasthenic-exhaustion', 'persistent-insomnia', 'morphine-habit', 'postpartum-disturbance']);
  values.sadness = clamped(definitions, 'sadness', (sadPresentations.has(patient.clinical.id) ? 0.42 : 0.03) * severity + jitter(performanceRandom, 0.05));
  values.fatigueExpression = clamped(definitions, 'fatigueExpression', (tiredPresentations.has(patient.clinical.id) ? 0.54 : 0.05) * severity + jitter(performanceRandom, 0.07));
  values.seated = 1;
  values.idleMode = 'procedural';

  preset.name = patient.identity.displayName;
  preset.description = descriptionFor(patient);
  preset.patient = {
    ...patient,
    appearance: {
      seed: appearanceSeed,
      faceSignatureSeed: appearanceSeed,
      restingFace: generateRestingFaceSignature(appearanceSeed),
      faceArchetype: face.id, bodyMass: values.weight, stature: values.height,
      skinTone: values.skinTone, eyeColor: values.eyeColor, hairColor: values.hairColor,
      hairShade: values.hairShade, hairStyle: values.hairStyle, flowSweep: values.flowSweep,
      greyAmount: values.greyAmount, outfitStyle: values.outfitStyle,
      dressColor: values.dressColor, trimColor: values.trimColor,
      skinRendering: {
        microDetail: values.stylizedSkinDetail,
        poreScale: values.stylizedPoreScale,
        pigmentVariation: values.stylizedPigmentVariation,
        freckleAmount: values.stylizedFreckleAmount,
        lipTint: values.stylizedLipTint,
        eyeWhiteContrast: values.stylizedEyeContrast,
        surfaceRoughness: values.stylizedSurfaceRoughness,
      },
    },
  };
  return preset;
}
