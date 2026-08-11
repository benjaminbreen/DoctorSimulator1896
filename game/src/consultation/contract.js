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
  if (patient.contentStatus !== 'technical-fixture' && patient.contentStatus !== 'verified') {
    errors.push('contentStatus must be technical-fixture or verified');
  }
  if (!patient.actor?.recipe) errors.push('an actor recipe is required');
  if (patient.profileStatus === 'draft-procedural' && !patient.profile?.identity?.fullName) {
    errors.push('a generated patient profile is required');
  }
  if (!patient.opening?.dialogue) errors.push('an authored opening is required');
  if (!(patient.facts?.length > 0)) errors.push('at least one fact is required');
  if (!(patient.examinations?.length > 0)) errors.push('at least one examination is required');
  if (!(patient.diagnoses?.length > 0)) errors.push('at least one diagnosis is required');
  if (!(patient.treatments?.length > 0)) errors.push('at least one treatment is required');

  for (const [label, items] of [
    ['fact', patient.facts], ['examination', patient.examinations],
    ['diagnosis', patient.diagnoses], ['treatment', patient.treatments],
  ]) {
    const values = items || [];
    if (ids(values).size !== values.length) errors.push(`${label} ids must be unique`);
  }

  const factIds = ids(patient.facts);
  for (const examination of patient.examinations || []) {
    if (!factIds.has(examination.factId)) errors.push(`examination ${examination.id} has unknown fact ${examination.factId}`);
  }
  for (const factId of patient.caseNote?.requiredFactIds || []) {
    if (!factIds.has(factId)) errors.push(`case note requires unknown fact ${factId}`);
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
    appraisal: {
      register,
      decorumBreach: Math.max(0, Math.min(3, Math.trunc(Number(appraisal.decorumBreach) || 0))),
      intent: typeof appraisal.intent === 'string' ? appraisal.intent.trim().slice(0, 80) : '',
      terminates: Boolean(appraisal.terminates),
    },
  };
}
