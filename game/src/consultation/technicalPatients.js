import { createActorInstance } from '../world/characters/actors.js';
import { generatePatient, patientToRendererCRecipe } from '../../../shared/patients/index.js';

export const DEFAULT_TECHNICAL_PATIENT_SEEDS = Object.freeze([2273, 4819, 4816]);

const PRESENTATION_DETAILS = Object.freeze({
  'neurasthenic-exhaustion': Object.freeze({
    diagnoses: ['Neurasthenic exhaustion', 'Anaemic debility'],
    treatments: ['Rest and regulated sleep', 'Galvanic treatment'],
  }),
  'melancholic-withdrawal': Object.freeze({
    diagnoses: ['Melancholia', 'Neurasthenic exhaustion'],
    treatments: ['Change of scene and companionship', 'Rest and nourishing diet'],
  }),
  'anxious-palpitations': Object.freeze({
    diagnoses: ['Nervous palpitation', 'Neurasthenic exhaustion'],
    treatments: ['Rest and regulated breathing', 'Galvanic treatment'],
  }),
  'persistent-insomnia': Object.freeze({
    diagnoses: ['Nervous insomnia', 'Neurasthenic exhaustion'],
    treatments: ['Regulated sleep and exercise', 'Bromide draught'],
  }),
  'bereavement-visions': Object.freeze({
    diagnoses: ['Morbid grief', 'Nervous exhaustion'],
    treatments: ['Companionship and observation', 'Rest and regulated sleep'],
  }),
  'compulsive-fears': Object.freeze({
    diagnoses: ['Fixed nervous apprehension', 'Neurasthenic exhaustion'],
    treatments: ['Regulated occupation and exercise', 'Rest and seclusion'],
  }),
  'functional-tremor': Object.freeze({
    diagnoses: ['Hysterical tremor', 'Neurasthenic exhaustion'],
    treatments: ['Rest and graduated exercise', 'Galvanic treatment'],
  }),
  'traumatic-fright': Object.freeze({
    diagnoses: ['Nervous shock', 'Neurasthenic exhaustion'],
    treatments: ['Rest and removal from reminders', 'Galvanic treatment'],
  }),
  'morphine-habit': Object.freeze({
    diagnoses: ['Morphine habit', 'Neurasthenic exhaustion'],
    treatments: ['Supervised gradual withdrawal', 'Rest and nourishing diet'],
  }),
  'postpartum-disturbance': Object.freeze({
    diagnoses: ['Puerperal mental disturbance', 'Melancholia'],
    treatments: ['Close nursing and rest', 'Removal from household duties'],
  }),
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
  return {
    id: `${prefix}-ask-${index + 1}`,
    text: `Tell me more about the ${topic}.`,
    stance: 'question',
    ...reactionForFact(profile, fact),
  };
}

function consultationFor(profile, index) {
  const prefix = String.fromCharCode(97 + index);
  const details = PRESENTATION_DETAILS[profile.clinical.id];
  const symptoms = profile.clinical.symptoms.map((symptom, symptomIndex) => (
    symptomFact(prefix, symptom, symptomIndex)
  ));
  const signs = physicalFacts(profile, prefix);
  const facts = [...symptoms, ...signs];
  const withheld = symptoms.filter((fact) => fact.disclosure === 'withheld');
  const diagnoses = details?.diagnoses || [profile.clinical.periodCategory, 'Neurasthenic exhaustion'];
  const treatments = details?.treatments || ['Rest and observation', 'Galvanic treatment'];
  const subject = profile.identity.sex === 'male' ? 'He' : 'She';
  const bearing = ['weary', 'sad'].includes(profile.clinical.affect)
    ? 'settles wearily into the chair and takes a moment before speaking'
    : 'takes the chair with a guarded expression and watches for your reaction';

  return {
    opening: {
      dialogue: `“${sentence(profile.clinical.presentingComplaint).replace(/\.$/, '')}”`,
      behavior: `${subject} ${bearing}. ${subject} says the trouble has lasted ${profile.clinical.duration}.`,
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
    })),
    treatments: treatments.map((label, treatmentIndex) => ({
      id: `${prefix}-treatment-${treatmentIndex + 1}`,
      label,
      reputation: treatmentIndex === 0 ? 4 : 1,
      record: treatmentIndex === 0 ? 3 : 0,
    })),
    requiredFactIds: [withheld[0].id, signs[0].id],
  };
}

function technicalPatient(seed, index, sex) {
  const id = `technical-${String.fromCharCode(97 + index)}`;
  const profile = generatePatient({ seed, sex });
  const consultation = consultationFor(profile, index);
  return Object.freeze({
    id,
    contentStatus: 'technical-fixture',
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

export function createTechnicalPatients(seeds = DEFAULT_TECHNICAL_PATIENT_SEEDS) {
  const normalized = DEFAULT_TECHNICAL_PATIENT_SEEDS.map((fallback, index) => Number(seeds[index]) || fallback);
  return Object.freeze([
    technicalPatient(normalized[0], 0, 'female'),
    technicalPatient(normalized[1], 1, 'male'),
    technicalPatient(normalized[2], 2, 'female'),
  ]);
}

export const TECHNICAL_PATIENTS = createTechnicalPatients();
