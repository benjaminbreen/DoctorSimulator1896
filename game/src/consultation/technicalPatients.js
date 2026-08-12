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
  Object.freeze({ id: 'read-distress', text: 'The patient appears genuinely distressed.' }),
  Object.freeze({ id: 'read-reserve', text: 'The patient is withholding part of the account.' }),
  Object.freeze({ id: 'read-physical', text: 'A physical sign deserves more weight than the manner of speaking.' }),
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

function generatedActor(profile, id) {
  const female = profile.identity.sex === 'female';
  const recipe = patientToRendererCRecipe(profile, {
    id,
    animation: { body: 'clinic-idle', expression: expressionFor(profile), gaze: 'doctor', speaking: false },
    // The two cohort masters currently use opposite forward axes. Keep that
    // asset correction here and lift both figures to the chair's seat height.
    placement: female
      ? { position: [0.45, 0.22, -1.7], rotation: [0, Math.PI, 0], scale: 1 }
      : { position: [0.45, 0.22, -1.7], rotation: [0, 0, 0], scale: 1 },
  });
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

function makePrompt(prefix, fact, index) {
  const topic = fact.releaseOn[0] || fact.label.toLowerCase();
  return {
    id: `${prefix}-ask-${index + 1}`,
    text: `Tell me more about the ${topic}.`,
    stance: 'question',
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

  return {
    opening: {
      dialogue: `“${sentence(profile.clinical.presentingComplaint).replace(/\.$/, '')}”`,
      behavior: `${subject} describes the trouble as having lasted ${profile.clinical.duration}.`,
    },
    facts,
    examinations: examinationsFor(prefix, signs),
    prompts: [
      ...withheld.slice(0, 3).map((fact, factIndex) => makePrompt(prefix, fact, factIndex)),
      { id: `${prefix}-reassure`, text: 'You may speak plainly here; nothing leaves this room.', stance: 'reassure' },
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
    caseNote: { minimumWords: 12, requiredFactIds: consultation.requiredFactIds },
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
