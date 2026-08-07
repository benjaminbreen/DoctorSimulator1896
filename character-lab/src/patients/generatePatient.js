import { createRandom, normalizeSeed } from './random.js';
import { ORIGIN_PROFILES, RESIDENCES } from './data/demographics.js';
import {
  CLINIC_CLASSES, OCCUPATIONS, REFERRAL_SOURCES, SPOUSE_OCCUPATIONS, maritalWeightsForAge,
} from './data/social.js';
import { DURATION_BANDS, PRESENTATIONS } from './data/clinical.js';

const YEAR = 1896;

function pickPairs(random, pairs) {
  return random.weighted(pairs, (pair) => pair[1])[0];
}

function ageForPatient(random) {
  const band = random.weighted([
    { minimum: 16, maximum: 24, weight: 10 }, { minimum: 25, maximum: 34, weight: 20 },
    { minimum: 35, maximum: 44, weight: 25 }, { minimum: 45, maximum: 59, weight: 28 },
    { minimum: 60, maximum: 76, weight: 17 },
  ]);
  return random.integer(band.minimum, band.maximum);
}

function generationLabel(generation) {
  if (generation === 0) return 'immigrant, born abroad';
  if (generation === 1) return 'New Yorker of immigrant parents';
  if (generation === 2) return 'second-generation American';
  return 'from an established New York family';
}

function selectOccupation(random, socialClass, age, maritalStatus, sex) {
  const candidates = OCCUPATIONS.filter((occupation) => occupation.classes.includes(socialClass.id)
    && age >= (occupation.minAge ?? 0) && age <= (occupation.maxAge ?? 120)
    && (!occupation.sexes || occupation.sexes.includes(sex)));
  return random.weighted(candidates, (occupation) => {
    if (occupation.id !== 'household') return occupation.weight;
    if (maritalStatus === 'married' || maritalStatus === 'widowed') return occupation.weight * 1.8;
    return occupation.weight * 0.3;
  });
}

function householdFor(random, age, maritalStatus, socialClass, sex) {
  const spouseOccupation = sex === 'female' && (maritalStatus === 'married' || maritalStatus === 'widowed')
    ? random.pick(SPOUSE_OCCUPATIONS[socialClass.id]) : null;
  let children = 0;
  if ((maritalStatus === 'married' || maritalStatus === 'widowed') && age >= 22) {
    const maximum = age < 30 ? 2 : age < 42 ? 4 : 6;
    children = Math.max(0, Math.round(random.between(-0.4, maximum)));
  }
  const dependents = children + (random.chance(socialClass.id === 'sponsored' ? 0.32 : 0.13) ? 1 : 0);
  return { maritalStatus, spouseOccupation, spouseDeceased: maritalStatus === 'widowed', children, dependents };
}

function textForSex(value, sex) {
  if (sex !== 'male') return value;
  return value
    .replaceAll('dependent upon her', 'dependent upon him')
    .replaceAll('employing her', 'employing him')
    .replaceAll('her husband', 'his wife')
    .replaceAll('elder sister', 'elder brother')
    .replace(/\bshe\b/g, 'he')
    .replace(/\bher\b/g, 'his');
}

function clinicalPresentation(random, context) {
  const candidates = PRESENTATIONS.filter((presentation) => context.age >= presentation.ageRange[0]
    && context.age <= presentation.ageRange[1] && (!presentation.requires || presentation.requires(context)));
  const source = random.weighted(candidates);
  const severity = Number(random.between(0.38, 0.84).toFixed(2));
  return {
    id: source.id,
    periodCategory: source.periodCategory,
    theme: source.theme,
    presentingComplaint: textForSex(random.pick(source.complaints), context.sex),
    symptoms: [...source.symptoms],
    duration: random.weighted(DURATION_BANDS).label,
    severity,
    affect: pickPairs(random, source.affects),
    flags: [...(source.flags ?? [])],
    performance: { ...source.performance },
  };
}

/**
 * Generate a complete game-domain patient. It has no knowledge of Blender,
 * Three.js, morph names, or slider ranges; the preset adapter owns that bridge.
 */
export function generatePatient(options = {}) {
  const seed = normalizeSeed(options.seed ?? 1896);
  const identityRandom = createRandom(seed, 'identity');
  const socialRandom = createRandom(seed, 'social');
  const clinicalRandom = createRandom(seed, 'clinical');

  const sampledSex = identityRandom.chance(0.5) ? 'female' : 'male';
  const sex = options.sex === 'female' || options.sex === 'male' ? options.sex : sampledSex;
  const age = ageForPatient(identityRandom);
  const socialClass = socialRandom.weighted(CLINIC_CLASSES);
  const origin = identityRandom.weighted(ORIGIN_PROFILES, (profile) => profile.cityWeight * profile.access[socialClass.id]);
  const generation = pickPairs(identityRandom, origin.generations);
  const givenName = identityRandom.pick(sex === 'male' ? origin.maleGivenNames : origin.givenNames);
  const familyName = identityRandom.pick(origin.surnames);
  const maritalStatus = pickPairs(socialRandom, maritalWeightsForAge(age));
  const title = sex === 'male' ? 'Mr.' : maritalStatus === 'single' ? 'Miss' : 'Mrs.';
  const household = householdFor(socialRandom, age, maritalStatus, socialClass, sex);
  const occupation = selectOccupation(socialRandom, socialClass, age, maritalStatus, sex);
  const payer = pickPairs(socialRandom, socialClass.payer);
  const referralSource = textForSex(socialRandom.pick(REFERRAL_SOURCES[payer]), sex);
  const presentation = clinicalPresentation(clinicalRandom, { age, maritalStatus, socialClass: socialClass.id, sex });
  const residence = socialRandom.pick(RESIDENCES[socialClass.id]);

  const householdPosition = sex === 'female' && occupation.id === 'household'
    ? household.spouseOccupation
      ? `${household.spouseDeceased ? 'widow' : 'wife'} of a ${household.spouseOccupation}`
      : 'woman of independent household'
    : occupation.label;

  return {
    schemaVersion: 1,
    seed,
    setting: { city: 'New York', year: YEAR, month: 3, clinicType: 'private nervous-disorders specialist' },
    identity: {
      sex, age, birthYear: YEAR - age, givenName, familyName, title,
      displayName: `${title} ${familyName}`,
      fullName: `${title} ${givenName} ${familyName}`,
      origin: { id: origin.id, label: origin.label, generation, generationLabel: generationLabel(generation) },
      religion: pickPairs(identityRandom, origin.religions),
      language: pickPairs(identityRandom, origin.languages),
    },
    social: {
      classId: socialClass.id, classLabel: socialClass.label, occupationId: occupation.id,
      occupation: occupation.id === 'household' ? null : occupation.label,
      householdPosition, household, residence, payer, referralSource,
    },
    clinical: presentation,
    generation: {
      populationFrame: 'NYC residents weighted by access and referral to a private specialist',
      demographicBasis: 'calibrated procedural approximation',
      confidence: { identity: 'medium', clinicSelection: 'speculative', clinicalPresentation: 'medium' },
      notes: [
        'Group frequencies describe a fictional clinic sample, not a census reconstruction.',
        'Ancestry influences visual probability ranges but never determines personality or complaint.',
        'The period category is historical vocabulary; the internal theme is not a retrospective diagnosis.',
      ],
    },
  };
}
