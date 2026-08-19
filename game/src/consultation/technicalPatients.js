import { createActorInstance } from '../world/characters/actors.js';
import { generatePatient, patientToRendererCRecipe } from '../../../shared/patients/index.js';

export const DEFAULT_TECHNICAL_PATIENT_SEEDS = Object.freeze([2273, 4819, 4816]);

// `modern` is the one-line modern debrief lead for a generated case.
// DRAFT CONTENT: these need Ben's review as historical/medical claims.
const PRESENTATION_DETAILS = Object.freeze({
  'neurasthenic-exhaustion': Object.freeze({
    diagnoses: ['Neurasthenic exhaustion', 'Anaemic debility'],
    modern: 'From a modern perspective this pattern of exhaustion, poor sleep, and worry most resembles what would now be assessed as depression, anxiety, or burnout, with overwork and money trouble as live contributors.',
  }),
  'melancholic-withdrawal': Object.freeze({
    diagnoses: ['Melancholia', 'Neurasthenic exhaustion'],
    modern: 'From a modern perspective the withdrawal, guilt, and loss of appetite describe a major depressive episode; the period label of melancholia covered much of the same ground.',
  }),
  'anxious-palpitations': Object.freeze({
    diagnoses: ['Nervous palpitation', 'Neurasthenic exhaustion'],
    modern: 'From a modern perspective episodic palpitations with fear of dying and no cardiac findings would suggest panic attacks, though a physical cardiac cause would still need excluding.',
  }),
  'persistent-insomnia': Object.freeze({
    diagnoses: ['Nervous insomnia', 'Neurasthenic exhaustion'],
    modern: 'From a modern perspective long-standing sleeplessness is usually sustained by worry, stimulants, and habit; chronic insomnia is treated today as a disorder in its own right.',
  }),
  'bereavement-visions': Object.freeze({
    diagnoses: ['Morbid grief', 'Nervous exhaustion'],
    modern: 'From a modern perspective sensing or seeing a dead relative in the months after a loss is a common grief experience, not by itself an illness or a psychosis.',
  }),
  'compulsive-fears': Object.freeze({
    diagnoses: ['Fixed nervous apprehension', 'Neurasthenic exhaustion'],
    modern: 'From a modern perspective intrusive fixed fears the patient recognises as excessive point toward obsessive-compulsive or anxiety disorders.',
  }),
  'functional-tremor': Object.freeze({
    diagnoses: ['Hysterical tremor', 'Neurasthenic exhaustion'],
    modern: 'From a modern perspective a tremor that varies with attention and stress, with normal strength and reflexes, resembles a functional movement disorder — real, involuntary, and not deceit.',
  }),
  'traumatic-fright': Object.freeze({
    diagnoses: ['Nervous shock', 'Neurasthenic exhaustion'],
    modern: 'From a modern perspective startle, dreams, and avoidance after a frightening accident describe a post-traumatic stress reaction; the period spoke of nervous shock or railway spine.',
  }),
  'morphine-habit': Object.freeze({
    diagnoses: ['Morphine habit', 'Neurasthenic exhaustion'],
    modern: 'From a modern perspective this is opioid dependence, very often begun with a physician’s own prescription; abrupt moral condemnation helped no one then and helps no one now.',
  }),
  'postpartum-disturbance': Object.freeze({
    diagnoses: ['Puerperal mental disturbance', 'Melancholia'],
    modern: 'From a modern perspective mood disturbance after childbirth spans postpartum depression through the rare emergency of postpartum psychosis; it was as real in 1896 as it is now.',
  }),
});

// Small deterministic hash for phrasing choices, separate from the profile
// generator's own random streams.
function hashPick(seed, salt, list) {
  let h = 2166136261;
  h ^= Math.imul(Math.trunc(seed) & 0xffffffff, 2654435761);
  h = Math.imul(h ^ (h >>> 13), 3266489917);
  h ^= salt;
  h = Math.imul(h ^ (h >>> 7), 2654435761);
  return list[(h >>> 8) % list.length];
}

// Consultation fee by clinic class, in cents.
const FEES = Object.freeze({
  elite: { full: 500, reduced: 250 },
  affluent: { full: 300, reduced: 150 },
  comfortable: { full: 200, reduced: 100 },
  sponsored: { full: 75, reduced: 25 },
});

const commonInterpretations = Object.freeze([
  Object.freeze({ id: 'read-history-first', text: 'I should hear how this began and what was happening in the patient’s life before I draw conclusions.', nextMode: 'patient' }),
  Object.freeze({ id: 'read-examine-first', text: 'An examination may disclose an ordinary bodily cause before I question the patient further.', nextMode: 'examination' }),
  Object.freeze({ id: 'read-diagnose-first', text: 'This resembles the nervous disorder named in the initial complaint; I will question the patient with that possibility in mind.', nextMode: 'patient' }),
]);

function sentence(value) {
  const text = String(value || '').trim();
  if (!text) return '';
  return `${text[0].toUpperCase()}${text.slice(1).replace(/[.!?]+$/, '')}.`;
}

function words(value) {
  return String(value || '').toLowerCase().match(/[a-z]+/g) || [];
}

function uniqueTerms(...values) {
  return [...new Set(values.flatMap(words).filter((word) => word.length > 3))];
}

function expressionFor(profile) {
  if (['weary', 'sad'].includes(profile.clinical.affect)) return 'fatigued';
  return 'guarded';
}

const SAMUEL_TAYLOR_APPEARANCE = Object.freeze({
  // A light, neutral-brown complexion for Samuel that removes the generated
  // red cast. Keep it local so rerolled patients retain their generated palette.
  skinTone: '#afa59b',
});

function generatedActor(profile, id) {
  const generatedRecipe = patientToRendererCRecipe(profile, {
    id,
    animation: { body: 'clinic-idle', expression: expressionFor(profile), gaze: 'doctor', speaking: false },
    // Both current cohort masters share the same forward axis. ClinicIdle is
    // the seated pose; this places its hips on the consultation chair and
    // turns the patient toward the doctor across the desk.
    placement: { position: [0.45, 0.22, -1.7], rotation: [0, Math.PI, 0], scale: 1 },
  });
  const samuel = profile.seed === 4819 && profile.identity.fullName === 'Mr. Samuel Taylor';
  const recipe = samuel
    ? { ...generatedRecipe, values: { ...generatedRecipe.values, ...SAMUEL_TAYLOR_APPEARANCE } }
    : generatedRecipe;
  return createActorInstance({ id, recipe });
}

function symptomFact(prefix, symptom, index) {
  const id = `${prefix}-symptom-${index + 1}`;
  const disclosed = index === 0;
  return {
    id,
    kind: 'symptom',
    label: sentence(symptom).replace(/\.$/, ''),
    value: sentence(symptom),
    notebookSummary: sentence(`Patient reports ${symptom}`),
    confidence: 'high',
    measurement: false,
    disclosure: disclosed ? 'open' : 'withheld',
    releaseOn: uniqueTerms(symptom),
    patientWording: sentence(`The trouble includes ${symptom}`),
    noteTerms: uniqueTerms(symptom),
  };
}

function physicalFacts(profile, prefix) {
  const rate = profile.clinical.performance.breathingRate;
  const tremor = profile.clinical.performance.tremor;
  const tremorValue = tremor >= 1
    ? 'A marked tremor is visible while the hands are supported.'
    : tremor >= 0.4
      ? 'A fine tremor is visible while the hands are supported.'
      : 'No marked tremor is visible while the hands are supported.';
  return [
    {
      id: `${prefix}-sign-breathing`, kind: 'sign', label: 'Respiration',
      value: `Respiration is ${rate} breaths per minute.`, confidence: 'high',
      measurement: true, disclosure: 'observed', noteTerms: ['respiration', 'breaths', String(rate)],
    },
    {
      id: `${prefix}-sign-tremor`, kind: 'sign', label: 'Hands',
      value: tremorValue, confidence: 'moderate', measurement: false,
      disclosure: 'observed', noteTerms: ['tremor', 'hands'],
    },
  ];
}

function examinationsFor(prefix, signs) {
  return [
    {
      id: `${prefix}-exam-breathing`, label: 'Count respiration', factId: signs[0].id,
      reply: signs[0].value,
      uncertainty: 'One count must be weighed with the patient’s account and manner of breathing.',
    },
    {
      id: `${prefix}-exam-hands`, label: 'Observe hands', factId: signs[1].id,
      reply: signs[1].value,
      uncertainty: 'The patient knows the hands are being watched.',
    },
  ];
}

function reactionForFact(profile, fact) {
  const subject = `${fact.label} ${fact.value}`.toLowerCase();
  if (profile.clinical.affect === 'sad' || /guilt|withdrawal|appetite|shame/.test(subject)) {
    return { reactionExpression: 'discouraged', bodyCue: 'sitting-distressed' };
  }
  if (profile.clinical.affect === 'concerned' || /fear|trembling|palpitation/.test(subject)) {
    return { reactionExpression: 'frowning', bodyCue: 'sitting-disapproval' };
  }
  return { reactionExpression: 'guarded', bodyCue: 'sitting-talking' };
}

function makePrompt(prefix, fact, index, profile) {
  const topic = fact.releaseOn[0] || fact.label.toLowerCase();
  const text = hashPick(profile.seed, index, [
    `Tell me more about the ${topic}.`,
    `When did the ${topic} begin?`,
    `What seems to bring on the ${topic}?`,
    `How does the ${topic} affect your days?`,
  ]);
  return {
    id: `${prefix}-ask-${index + 1}`,
    text,
    stance: 'question',
    ...reactionForFact(profile, fact),
  };
}

// The generated outcome model: evidence and fee from the profile, narrative
// lines from small shared tables. Everything the result modal and the James
// letter need, none of it hand-written per patient.
function outcomeModelFor(profile, facts, withheld, signs) {
  const details = PRESENTATION_DETAILS[profile.clinical.id];
  const surname = profile.identity.displayName;
  const fee = FEES[profile.social.classId] || FEES.comfortable;
  const weary = ['weary', 'sad'].includes(profile.clinical.affect);
  return {
    evidenceFactIds: facts.map((fact) => fact.id),
    criticalFactIds: [...withheld.map((fact) => fact.id), signs[0].id],
    fee,
    departureLines: {
      high: weary
        ? `“Thank you, Doctor. I am tired, but I feel I have been listened to.”`
        : `“Thank you, Doctor. That was plainer dealing than I expected.”`,
      middle: `“Thank you, Doctor. I shall try what you advise and see what follows.”`,
      low: `“Good day, Doctor. I shall not take more of your time.”`,
    },
    followUpDepartureLine: '“Very well, Doctor. I would rather return than have the trouble named too quickly.”',
    followUpMonthText: `${surname} is still awaiting a settled plan. The complaint continues much as before.`,
    immediateNarratives: {
      high: `${surname} rises with visible relief and thanks you warmly. The visit was worth its cost.`,
      middle: `${surname} thanks you with reserve, uncertain but not dissatisfied.`,
      low: `${surname} rises stiffly. The brief thanks cannot conceal disappointment.`,
    },
    monthNarratives: {
      improved: 'Health and ordinary function have improved.',
      'little-change': 'There has been little material change.',
      worse: 'The symptoms and ordinary function have worsened.',
      harmed: 'The chosen course has produced substantial harm.',
    },
    james: { address: 'My dear Doctor', close: 'Yours faithfully, William James' },
    modernDebrief: details?.modern
      || 'From a modern perspective this presentation would be assessed on its own terms rather than under the period label.',
  };
}

function consultationFor(profile, prefix) {
  const details = PRESENTATION_DETAILS[profile.clinical.id];
  const symptoms = profile.clinical.symptoms.map((symptom, symptomIndex) => (
    symptomFact(prefix, symptom, symptomIndex)
  ));
  const signs = physicalFacts(profile, prefix);
  const facts = [...symptoms, ...signs];
  const withheld = symptoms.filter((fact) => fact.disclosure === 'withheld');
  const diagnoses = details?.diagnoses || [profile.clinical.periodCategory, 'Neurasthenic exhaustion'];
  const subject = profile.identity.sex === 'male' ? 'He' : 'She';
  const bearing = ['weary', 'sad'].includes(profile.clinical.affect)
    ? 'settles wearily into the chair and takes a moment before speaking'
    : 'takes the chair with a guarded expression and watches for your reaction';

  return {
    opening: {
      dialogue: `“${sentence(profile.clinical.presentingComplaint).replace(/\.$/, '')}”`,
      behavior: `${subject} ${bearing}. ${subject} says the trouble has lasted ${profile.clinical.duration}. Sent to you by ${profile.social.referralSource}.`,
    },
    facts,
    examinations: examinationsFor(prefix, signs),
    prompts: [
      ...withheld.slice(0, 3).map((fact, factIndex) => makePrompt(prefix, fact, factIndex, profile)),
      {
        id: `${prefix}-reassure`,
        text: 'You may speak plainly here; nothing leaves this room.',
        stance: 'reassure',
        reactionExpression: 'smiling',
        bodyCue: 'sitting-talking',
        effects: { trust: 2, satisfaction: 3 },
      },
    ],
    diagnoses: diagnoses.map((label, diagnosisIndex) => ({
      id: `${prefix}-diagnosis-${diagnosisIndex + 1}`,
      label,
      reputation: diagnosisIndex === 0 ? 4 : 1,
      record: diagnosisIndex === 0 ? 4 : 1,
      evaluation: diagnosisIndex === 0
        ? { quality: 7, patientAcceptance: 4 }
        : { quality: 4, patientAcceptance: 2 },
    })),
    outcomeModel: outcomeModelFor(profile, facts, withheld.slice(0, 3), signs),
    requiredFactIds: [withheld[0].id, signs[0].id],
  };
}

function proceduralPatient({ id, prefix, seed, sex, contentStatus = 'procedural', amendProfile = null }) {
  const profile = generatePatient({ seed, sex });
  if (amendProfile) amendProfile(profile);
  const consultation = consultationFor(profile, prefix);
  return Object.freeze({
    id,
    contentStatus,
    profileStatus: 'draft-procedural',
    initialTrust: 50,
    profile,
    actor: generatedActor(profile, id),
    interpretations: commonInterpretations,
    caseNote: { minimumWords: 0, requiredFactIds: consultation.requiredFactIds },
    ...consultation,
    label: profile.identity.fullName,
  });
}

function technicalPatient(seed, index, sex) {
  const letter = String.fromCharCode(97 + index);
  return proceduralPatient({
    id: `technical-${letter}`, prefix: letter, seed, sex, contentStatus: 'technical-fixture',
  });
}

export function createTechnicalPatients(seeds = DEFAULT_TECHNICAL_PATIENT_SEEDS) {
  const normalized = DEFAULT_TECHNICAL_PATIENT_SEEDS.map((fallback, index) => Number(seeds[index]) || fallback);
  return Object.freeze([
    technicalPatient(normalized[0], 0, 'female'),
    technicalPatient(normalized[1], 1, 'male'),
    technicalPatient(normalized[2], 2, 'female'),
  ]);
}

export const TECHNICAL_PATIENTS = createTechnicalPatients();

// The morning list for a procedural day: distinct citizens rolled from the
// day seed. Ids carry the day so casebook records never collide across days.
// A referral (the matron's daughter, booked on the street) takes the first
// slot: her rolled life, the mother's surname.
export function createDayPatients({ daySeed = 1, dayIndex = 1, count = 4, referral = null } = {}) {
  let state = ((Math.trunc(daySeed) || 1) * 2654435761) >>> 0;
  const next = () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0xffffffff;
  };
  return Object.freeze(Array.from({ length: count }, (_, index) => {
    const letter = String.fromCharCode(97 + index);
    const id = `day${dayIndex}-${letter}`;
    const seed = Math.floor(next() * 1e9) + 1;
    const rolledSex = next() < 0.55 ? 'female' : 'male';
    const referred = referral && index === 0;
    return proceduralPatient({
      id,
      prefix: id,
      seed,
      sex: referred ? 'female' : rolledSex,
      contentStatus: 'procedural',
      amendProfile: referred ? (profile) => {
        const given = profile.identity.givenName;
        profile.identity = {
          ...profile.identity,
          familyName: referral.familyName,
          title: 'Miss',
          displayName: `Miss ${referral.familyName}`,
          fullName: `Miss ${given} ${referral.familyName}`,
        };
        profile.social = {
          ...profile.social,
          referralSource: `her mother, Mrs. ${referral.familyName}`,
        };
      } : null,
    });
  }));
}
