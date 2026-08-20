import { CHARACTER_BODY_CUES, CHARACTER_EXPRESSIONS } from '../../../shared/characters/recipe.js';
import { TREATMENT_LIBRARY } from './treatments.js';

const TREATMENT_IDS = new Set(TREATMENT_LIBRARY.map((item) => item.id));

export const CONSULTATION_STAGES = Object.freeze([
  'opening', 'inquiry', 'decision', 'case-note', 'result', 'terminated',
]);

export const CONSULTATION_MODES = Object.freeze(['patient', 'examination']);
export const SPEECH_STANCES = Object.freeze(['question', 'reassure', 'challenge', 'suggest']);
export const APPRAISAL_REGISTERS = Object.freeze(['neutral', 'courteous', 'clinical', 'prying', 'hostile']);

function ids(items) {
  return new Set((items || []).map((item) => item.id));
}

export function validateConsultationPatient(patient) {
  const errors = [];
  if (!patient?.id) return ['patient id is required'];
  if (!['technical-fixture', 'procedural', 'research-draft', 'verified'].includes(patient.contentStatus)) {
    errors.push('contentStatus must be technical-fixture, procedural, research-draft, or verified');
  }
  if (!patient.actor?.recipe) errors.push('an actor recipe is required');
  if (patient.profileStatus === 'draft-procedural' && !patient.profile?.identity?.fullName) {
    errors.push('a generated patient profile is required');
  }
  if (!patient.opening?.dialogue) errors.push('an authored opening is required');
  if (!(patient.facts?.length > 0)) errors.push('at least one fact is required');
  if (!(patient.examinations?.length > 0)) errors.push('at least one examination is required');
  if (!(patient.diagnoses?.length > 0)) errors.push('at least one diagnosis is required');
  // Treatments come from the shared library; a patient supplies overrides only
  // for the ones that matter in its case.
  for (const id of Object.keys(patient.treatmentOverrides || {})) {
    if (!TREATMENT_IDS.has(id)) errors.push(`treatment override ${id} is not in the library`);
  }

  for (const [label, items] of [
    ['fact', patient.facts], ['examination', patient.examinations],
    ['diagnosis', patient.diagnoses],
  ]) {
    const values = items || [];
    if (ids(values).size !== values.length) errors.push(`${label} ids must be unique`);
  }

  const factIds = ids(patient.facts);
  const validateFactReferences = (owner, references) => {
    for (const factId of references || []) {
      if (!factIds.has(factId)) errors.push(`${owner} has unknown fact ${factId}`);
    }
  };
  for (const examination of patient.examinations || []) {
    const references = examination.factIds || [examination.factId];
    for (const factId of references.filter(Boolean)) {
      if (!factIds.has(factId)) errors.push(`examination ${examination.id} has unknown fact ${factId}`);
    }
  }
  for (const factId of patient.caseNote?.requiredFactIds || []) {
    if (!factIds.has(factId)) errors.push(`case note requires unknown fact ${factId}`);
  }
  for (const fact of patient.facts || []) {
    validateFactReferences(`fact ${fact.id}`, [...(fact.requiresFactIds || []), ...(fact.requiresAnyFactIds || [])]);
  }
  for (const rule of [...(patient.prompts || []), ...(patient.inquiryIntents || [])]) {
    validateFactReferences(`inquiry rule ${rule.id}`, [
      ...(rule.requiresFactIds || []), ...(rule.requiresAnyFactIds || []), ...(rule.discloseFactIds || []),
    ]);
  }
  validateFactReferences('outcome model', [
    ...(patient.outcomeModel?.evidenceFactIds || []), ...(patient.outcomeModel?.criticalFactIds || []),
  ]);
  if (patient.profileStatus === 'authored-composite') {
    if (!patient.groundTruth?.etiologyId) errors.push('an authored composite requires deterministic ground truth');
    if (!(patient.sources?.length > 0)) errors.push('an authored composite requires source provenance');
    if (!patient.outcomeModel) errors.push('an authored composite requires an outcome model');
  }
  return errors;
}

export function normalizeDialogueResponse(response = {}) {
  const appraisal = response.appraisal || {};
  const register = APPRAISAL_REGISTERS.includes(appraisal.register)
    ? appraisal.register
    : 'neutral';
  return {
    dialogue: typeof response.dialogue === 'string' && response.dialogue.trim()
      ? response.dialogue.trim().slice(0, 800)
      : 'The patient waits for you to continue.',
    behavior: typeof response.behavior === 'string' ? response.behavior.trim().slice(0, 300) : '',
    disclosedNow: Array.isArray(response.disclosedNow)
      ? [...new Set(response.disclosedNow.map(String))].slice(0, 6)
      : [],
    reactionExpression: CHARACTER_EXPRESSIONS.includes(response.reactionExpression)
      ? response.reactionExpression
      : null,
    bodyCue: CHARACTER_BODY_CUES.includes(response.bodyCue) ? response.bodyCue : null,
    appraisal: {
      register,
      decorumBreach: Math.max(0, Math.min(3, Math.trunc(Number(appraisal.decorumBreach) || 0))),
      intent: typeof appraisal.intent === 'string' ? appraisal.intent.trim().slice(0, 80) : '',
      terminates: Boolean(appraisal.terminates),
    },
  };
}
