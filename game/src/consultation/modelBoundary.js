import { resolveTreatmentPlan } from './treatments.js';

function factForModel(fact) {
  return {
    id: fact.id,
    label: fact.label,
    value: fact.value,
    patientWording: fact.patientWording || null,
  };
}

function patientForModel(patient) {
  return {
    id: patient.id,
    name: patient.label,
    age: patient.profile.identity.age,
    occupation: patient.profile.social.occupation,
    residence: patient.profile.social.residence,
    voice: patient.dialogueStyle || 'Plain period-appropriate English. Do not add facts.',
  };
}

export function buildDialogueModelPayload(request, patient) {
  return {
    schemaVersion: 1,
    task: 'render-patient-dialogue',
    patient: patientForModel(patient),
    player: { text: request.playerInput, stance: request.stance },
    trust: request.trust,
    elapsedMinutes: request.elapsedMinutes,
    knownFacts: request.disclosedFacts.map(factForModel),
    allowedNewFacts: request.allowedDisclosureFacts.map(factForModel),
    recentTurns: request.recentTurns.map((turn) => ({
      player: turn.input,
      patient: turn.dialogue,
      register: turn.appraisal?.register || 'neutral',
    })),
    output: {
      dialogue: 'string',
      behavior: 'string',
      disclosedNow: 'array of ids drawn only from allowedNewFacts',
      appraisal: 'register, decorumBreach, intent, terminates',
    },
  };
}

export function buildThoughtModelPayload(patient, state, text) {
  const facts = patient.facts.filter((fact) => state.disclosedFactIds.includes(fact.id));
  return {
    schemaVersion: 1,
    task: 'classify-private-interpretation',
    patient: patientForModel(patient),
    playerText: String(text || '').slice(0, 600),
    knownFacts: facts.map(factForModel),
    priorInterpretations: state.history
      .filter((event) => event.kind === 'interpretation')
      .map((event) => event.text),
    output: { hypothesis: 'string', evidenceIds: 'known fact ids', certainty: 'low, medium, or high' },
  };
}

function periodRecord(patient, state, result) {
  const known = patient.facts.filter((fact) => state.disclosedFactIds.includes(fact.id));
  return {
    patient: patientForModel(patient),
    knownFacts: known.map(factForModel),
    interpretations: state.history.filter((event) => event.kind === 'interpretation').map((event) => event.text),
    diagnosis: patient.diagnoses.find((item) => item.id === state.diagnosisId)?.label,
    treatment: resolveTreatmentPlan(patient, state.treatmentIds)?.treatments.map((item) => item.label).join('; '),
    caseNote: state.caseNote,
    immediate: result.immediate,
    oneMonth: result.oneMonth,
    fixedScores: result.scores,
  };
}

// What James actually reads: the visit as it happened, in the doctor's and
// patient's own words, trimmed to fit the route's body limit.
function transcriptForModel(state) {
  const cut = (text, length = 240) => String(text || '').slice(0, length);
  return state.history
    .filter((event) => ['opening', 'speech', 'examination'].includes(event.kind))
    .slice(-16)
    .map((event) => {
      if (event.kind === 'opening') return { patient: cut(event.dialogue) };
      if (event.kind === 'speech') return { doctor: cut(event.input), patient: cut(event.dialogue) };
      return { examined: event.label, found: cut(event.reply) };
    });
}

export function buildJamesModelPayload(patient, state, result) {
  return {
    schemaVersion: 1,
    task: 'render-william-james-assessment',
    record: {
      patient: patientForModel(patient),
      transcript: transcriptForModel(state),
      interpretations: state.history
        .filter((event) => event.kind === 'interpretation')
        .map((event) => String(event.text || '').slice(0, 240)),
      diagnosis: patient.diagnoses.find((item) => item.id === state.diagnosisId)?.label || null,
      treatment: resolveTreatmentPlan(patient, state.treatmentIds)?.treatments.map((item) => item.label).join('; ') || null,
      caseNote: String(state.caseNote || '').slice(0, 600),
      selectedEvidence: (state.caseRecordFactIds || [])
        .map((id) => patient.facts.find((fact) => fact.id === id)?.label)
        .filter(Boolean),
      howTheVisitEnded: result.immediate?.departureLine || null,
      oneMonthLater: result.oneMonth?.narrative || null,
    },
  };
}

export function buildModernDebriefModelPayload(patient, state, result) {
  return {
    schemaVersion: 1,
    task: 'render-modern-debrief',
    record: periodRecord(patient, state, result),
    groundTruth: patient.groundTruth,
    treatmentEffects: resolveTreatmentPlan(patient, state.treatmentIds)?.evaluation,
    instruction: 'Explain the supplied cause, evidence, decision quality, and outcome. Do not add or revise facts or scores.',
  };
}
