import { createRandom } from './random.js';
import { getOriginProfile } from './data/demographics.js';
import {
  DRESS_PALETTES, FACE_ARCHETYPES, FACE_VALUE_IDS, HAIR_STYLES, OUTFIT_RULES,
} from './data/appearance.js';

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

function bodyMass(patient, random) {
  const classCenter = { elite: 0.56, affluent: 0.53, comfortable: 0.49, sponsored: 0.44 }[patient.social.classId];
  const ageAdjustment = patient.identity.age > 50 ? 0.035 : patient.identity.age < 23 ? -0.035 : 0;
  const complaintAdjustment = ['melancholic-withdrawal', 'neurasthenic-exhaustion', 'morphine-habit'].includes(patient.clinical.id) ? -0.045 : 0;
  return classCenter + ageAdjustment + complaintAdjustment + jitter(random, 0.16);
}

function descriptionFor(patient) {
  const work = patient.social.occupation ?? patient.social.householdPosition;
  return `${patient.identity.age}-year-old ${patient.identity.origin.label} ${work} from ${patient.social.residence}, presenting with ${patient.clinical.presentingComplaint}.`;
}

/** Map a domain patient onto the existing Blender/Three.js preset contract. */
export function patientToCharacterPreset(patient, basePreset, definitions) {
  const preset = structuredClone(basePreset);
  const values = preset.values;
  const faceRandom = createRandom(patient.seed, 'appearance.face');
  const bodyRandom = createRandom(patient.seed, 'appearance.body');
  const hairRandom = createRandom(patient.seed, 'appearance.hair');
  const dressRandom = createRandom(patient.seed, 'appearance.dress');
  const stylizedRandom = createRandom(patient.seed, 'appearance.stylized');
  const performanceRandom = createRandom(patient.seed, 'appearance.performance');
  const origin = getOriginProfile(patient.identity.origin.id);

  values.seed = patient.seed;
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
  values.skinRoughness = clamped(definitions, 'skinRoughness', 1.28 + jitter(bodyRandom, 0.28));

  const face = faceRandom.weighted(FACE_ARCHETYPES);
  values.headShape = face.headShape;
  values.headShapeStrength = clamped(definitions, 'headShapeStrength', 0.5 + jitter(faceRandom, 0.18));
  for (const id of FACE_VALUE_IDS) values[id] = clamped(definitions, id, face[id] + jitter(faceRandom, 0.11));
  values.browHeight = clamped(definitions, 'browHeight', -0.03 + jitter(faceRandom, 0.16));
  values.faceAsymmetry = clamped(definitions, 'faceAsymmetry', 0.055 + Math.abs(jitter(faceRandom, 0.08)));

  const hairCandidates = HAIR_STYLES.filter((style) => style.classes.includes(patient.social.classId)
    && patient.identity.age <= (style.maxAge ?? 120));
  values.hairStyle = hairRandom.weighted(hairCandidates).id;
  values.hairColor = hairRandom.pick(origin.hairColors);
  values.hairVolume = clamped(definitions, 'hairVolume', 1 + jitter(hairRandom, 0.22));
  values.hairHeight = clamped(definitions, 'hairHeight', 1 + jitter(hairRandom, 0.18));
  values.sideVolume = clamped(definitions, 'sideVolume', 1.02 + jitter(hairRandom, 0.24));
  values.partWidth = clamped(definitions, 'partWidth', 0.28 + jitter(hairRandom, 0.22));
  values.bunSize = clamped(definitions, 'bunSize', 1 + jitter(hairRandom, 0.28));
  values.hairlineHeight = clamped(definitions, 'hairlineHeight', jitter(hairRandom, 0.20));
  values.templeRecession = clamped(definitions, 'templeRecession', 0.12 + Math.max(0, patient.identity.age - 44) / 115 + jitter(hairRandom, 0.12));
  values.wispAmount = clamped(definitions, 'wispAmount', 0.48 + jitter(hairRandom, 0.28));
  values.waveAmount = clamped(definitions, 'waveAmount', 0.38 + jitter(hairRandom, 0.34));
  values.strandContrast = clamped(definitions, 'strandContrast', 0.42 + jitter(hairRandom, 0.24));
  values.greyAmount = clamped(definitions, 'greyAmount', Math.max(0, patient.identity.age - 42) / 38 + jitter(hairRandom, 0.13));
  values.stylizedPlaneContrast = clamped(definitions, 'stylizedPlaneContrast', 0.44 + jitter(stylizedRandom, 0.18));
  values.stylizedEyeContrast = clamped(definitions, 'stylizedEyeContrast', 0.3 + jitter(stylizedRandom, 0.16));
  values.stylizedSurfaceRoughness = clamped(definitions, 'stylizedSurfaceRoughness', 0.92 + jitter(stylizedRandom, 0.08));

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
  values.seated = 1;
  values.idleMode = 'procedural';

  preset.name = patient.identity.displayName;
  preset.description = descriptionFor(patient);
  preset.patient = {
    ...patient,
    appearance: {
      faceArchetype: face.id, bodyMass: values.weight, stature: values.height,
      skinTone: values.skinTone, eyeColor: values.eyeColor, hairColor: values.hairColor,
      hairStyle: values.hairStyle, greyAmount: values.greyAmount, outfitStyle: values.outfitStyle,
      dressColor: values.dressColor, trimColor: values.trimColor,
    },
  };
  return preset;
}
