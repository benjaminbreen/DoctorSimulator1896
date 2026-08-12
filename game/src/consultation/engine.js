import {
  CONSULTATION_MODES,
  CONSULTATION_STAGES,
  SPEECH_STANCES,
  normalizeDialogueResponse,
  validateConsultationPatient,
} from './contract.js';
import { relationshipEffects, resolveInquiryRule, ruleIsAvailable } from './patientLogic.js';
import { resolveAuthoredOutcome } from './outcomes.js';

const SPEECH_MINUTES = 5;
const EXAMINATION_MINUTES = 3;

function addUnique(values, additions) {
  return [...new Set([...(values || []), ...(additions || [])])];
}

function wordCount(value) {
  return String(value || '').trim().split(/\s+/).filter(Boolean).length;
}

function requireStage(state, ...allowed) {
  return allowed.includes(state.stage) ? null : `action is not available during ${state.stage}`;
}

function withError(state, error) {
  return { ...state, errors: [...state.errors, error] };
}

function record(state, event) {
  return { ...state, history: [...state.history, event] };
}

function factById(patient, id) {
  return patient.facts.find((fact) => fact.id === id) || null;
}

function notebookNoteFor(rule, acceptedFact, rejected) {
  if (rejected.length) return { noteSummary: null, noteKey: null };
  const noteSummary = String(
    rule?.noteSummary || acceptedFact?.notebookSummary || acceptedFact?.value || '',
  ).trim().slice(0, 300) || null;
  const noteKey = noteSummary
    ? rule?.noteKey || rule?.discloseFactIds?.[0] || acceptedFact?.id || rule?.id || null
    : null;
  return { noteSummary, noteKey };
}

export function eligibleDisclosureIds(patient, state, input) {
  const text = String(input?.text || '').toLowerCase();
  const known = new Set(state.disclosedFactIds);
  const rule = resolveInquiryRule(patient, state, input);
  const authorizedByRule = new Set(rule?.discloseFactIds || []);
  return patient.facts.filter((fact) => {
    if (known.has(fact.id) || fact.disclosure !== 'withheld') return false;
    const tokens = fact.releaseOn || [];
    return ruleIsAvailable(fact, state)
      && (authorizedByRule.has(fact.id) || tokens.some((token) => text.includes(String(token).toLowerCase())));
  }).map((fact) => fact.id);
}

export function buildDialogueRequest(patient, state, input) {
  const stance = SPEECH_STANCES.includes(input?.stance) ? input.stance : 'question';
  const rule = resolveInquiryRule(patient, state, input);
  const allowedDisclosureIds = eligibleDisclosureIds(patient, state, input);
  return {
    patientId: patient.id,
    playerInput: String(input?.text || '').trim().slice(0, 600),
    stance,
    promptId: input?.promptId || null,
    custom: Boolean(input?.custom),
    resolvedRuleId: rule?.id || null,
    trust: state.trust,
    elapsedMinutes: state.elapsedMinutes,
    disclosedFacts: state.disclosedFactIds.map((id) => factById(patient, id)).filter(Boolean),
    allowedDisclosureIds,
    allowedDisclosureFacts: allowedDisclosureIds.map((id) => factById(patient, id)).filter(Boolean),
    recentTurns: state.history.filter((event) => event.kind === 'speech').slice(-4),
  };
}

function trustAfterResponse(trust, stance, appraisal) {
  const registerChange = {
    courteous: 2, clinical: 0, neutral: 0, prying: -3, hostile: -8,
  }[appraisal.register] ?? 0;
  const stanceChange = stance === 'reassure' ? 1 : stance === 'challenge' ? -1 : 0;
  return Math.max(0, Math.min(100, trust + registerChange + stanceChange - appraisal.decorumBreach * 12));
}

export function startConsultation(patient) {
  const errors = validateConsultationPatient(patient);
  if (errors.length) throw new Error(`Invalid consultation patient: ${errors.join('; ')}`);
  const disclosedFactIds = patient.facts
    .filter((fact) => fact.disclosure === 'open')
    .map((fact) => fact.id);
  return {
    schemaVersion: 2,
    patientId: patient.id,
    stage: 'opening',
    mode: 'patient',
    elapsedMinutes: 0,
    trust: patient.initialTrust ?? 50,
    satisfaction: patient.initialSatisfaction ?? 50,
    disclosedFactIds,
    observedFactIds: [],
    interpretationIds: [],
    customInterpretations: [],
    provisionalDiagnosisId: null,
    diagnosisId: null,
    treatmentId: null,
    caseNote: '',
    result: null,
    errors: [],
    history: [{ kind: 'opening', dialogue: patient.opening.dialogue, behavior: patient.opening.behavior || '' }],
  };
}

export function consultationTransition(state, patient, action) {
  if (!CONSULTATION_STAGES.includes(state.stage)) return withError(state, `unknown stage ${state.stage}`);
  switch (action?.type) {
    case 'begin-inquiry': {
      const error = requireStage(state, 'opening');
      return error ? withError(state, error) : { ...state, stage: 'inquiry' };
    }
    case 'set-mode': {
      const error = requireStage(state, 'inquiry');
      if (error) return withError(state, error);
      if (!CONSULTATION_MODES.includes(action.mode)) return withError(state, `unknown mode ${action.mode}`);
      return { ...state, mode: action.mode };
    }
    case 'interpret': {
      const error = requireStage(state, 'inquiry');
      if (error) return withError(state, error);
      const interpretation = patient.interpretations.find((item) => item.id === action.id);
      if (!interpretation) return withError(state, `unknown interpretation ${action.id}`);
      return record({
        ...state,
        interpretationIds: addUnique(state.interpretationIds, [interpretation.id]),
        provisionalDiagnosisId: interpretation.provisionalDiagnosisId || state.provisionalDiagnosisId,
      }, { kind: 'interpretation', id: interpretation.id, text: interpretation.text });
    }
    case 'interpret-custom': {
      const error = requireStage(state, 'inquiry');
      if (error) return withError(state, error);
      const text = String(action.text || '').trim().slice(0, 600);
      if (!text) return withError(state, 'an interpretation requires text');
      const entry = { text, classification: action.classification || null };
      return record({
        ...state,
        customInterpretations: [...state.customInterpretations, entry],
      }, {
        kind: 'interpretation', id: `custom-${state.customInterpretations.length + 1}`,
        text, custom: true, classification: entry.classification,
      });
    }
    case 'examine': {
      const error = requireStage(state, 'inquiry');
      if (error) return withError(state, error);
      const examination = patient.examinations.find((item) => item.id === action.id);
      if (!examination) return withError(state, `unknown examination ${action.id}`);
      const fact = factById(patient, examination.factId);
      const effects = examination.effects || {};
      return record({
        ...state,
        elapsedMinutes: state.elapsedMinutes + (examination.minutes ?? EXAMINATION_MINUTES),
        trust: Math.max(0, Math.min(100, state.trust + (effects.trust || 0))),
        satisfaction: Math.max(0, Math.min(100, state.satisfaction + (effects.satisfaction || 0))),
        disclosedFactIds: addUnique(state.disclosedFactIds, [fact.id]),
        observedFactIds: addUnique(state.observedFactIds, [fact.id]),
      }, {
        kind: 'examination', id: examination.id, label: examination.label,
        reply: examination.reply, fact,
        bodyCue: examination.bodyCue || null,
        behavior: examination.behavior || '', uncertainty: examination.uncertainty || '',
      });
    }
    case 'speech-response': {
      const error = requireStage(state, 'inquiry');
      if (error) return withError(state, error);
      const request = buildDialogueRequest(patient, state, action.input);
      if (!request.playerInput) return withError(state, 'speech requires text');
      const response = normalizeDialogueResponse(action.response);
      const allowed = new Set(request.allowedDisclosureIds);
      const accepted = response.disclosedNow.filter((id) => allowed.has(id));
      const rejected = response.disclosedNow.filter((id) => !allowed.has(id));
      const acceptedFact = accepted.length ? factById(patient, accepted[0]) : null;
      const dialogue = rejected.length
        ? acceptedFact ? `“${acceptedFact.patientWording || acceptedFact.value}”` : 'The patient waits for you to continue.'
        : response.dialogue;
      const behavior = rejected.length ? 'The patient remains attentive.' : response.behavior;
      const effects = relationshipEffects(patient, state, action.input);
      const rule = [...(patient.prompts || []), ...(patient.inquiryIntents || [])]
        .find((candidate) => candidate.id === request.resolvedRuleId);
      const notebookNote = notebookNoteFor(rule, acceptedFact, rejected);
      const trust = Math.max(0, Math.min(100,
        trustAfterResponse(state.trust, request.stance, response.appraisal) + (effects.trust || 0),
      ));
      const satisfaction = Math.max(0, Math.min(100, state.satisfaction + (effects.satisfaction || 0)));
      const terminated = response.appraisal.terminates || trust <= 0;
      const next = record({
        ...state,
        stage: terminated ? 'terminated' : state.stage,
        elapsedMinutes: state.elapsedMinutes + SPEECH_MINUTES,
        trust,
        satisfaction,
        disclosedFactIds: addUnique(state.disclosedFactIds, accepted),
        errors: rejected.length
          ? [...state.errors, `dialogue attempted unauthorized disclosure: ${rejected.join(', ')}`]
          : state.errors,
      }, {
        kind: 'speech', input: request.playerInput, stance: request.stance,
        promptId: request.promptId, custom: request.custom, resolvedRuleId: request.resolvedRuleId,
        bodyCue: rule?.bodyCue || null,
        dialogue, behavior,
        ...notebookNote,
        disclosedNow: accepted, appraisal: response.appraisal,
      });
      return next;
    }
    case 'dialogue-error': {
      const error = requireStage(state, 'inquiry');
      return error ? withError(state, error) : withError(state, String(action.error || 'dialogue service unavailable'));
    }
    case 'begin-decision': {
      const error = requireStage(state, 'inquiry');
      if (error) return withError(state, error);
      const inquiryCount = state.history.filter((event) => ['speech', 'examination'].includes(event.kind)).length;
      return inquiryCount > 0 ? { ...state, stage: 'decision', mode: 'patient' } : withError(state, 'ask or examine before deciding');
    }
    case 'select-diagnosis': {
      const error = requireStage(state, 'decision');
      if (error) return withError(state, error);
      return patient.diagnoses.some((item) => item.id === action.id)
        ? { ...state, diagnosisId: action.id }
        : withError(state, `unknown diagnosis ${action.id}`);
    }
    case 'select-treatment': {
      const error = requireStage(state, 'decision');
      if (error) return withError(state, error);
      return patient.treatments.some((item) => item.id === action.id)
        ? { ...state, treatmentId: action.id }
        : withError(state, `unknown treatment ${action.id}`);
    }
    case 'begin-case-note': {
      const error = requireStage(state, 'decision');
      if (error) return withError(state, error);
      if (!state.diagnosisId || !state.treatmentId) return withError(state, 'select a diagnosis and treatment first');
      return { ...state, stage: 'case-note' };
    }
    case 'write-case-note': {
      const error = requireStage(state, 'case-note');
      return error ? withError(state, error) : { ...state, caseNote: String(action.text || '').slice(0, 6000) };
    }
    case 'submit-case-note': {
      const error = requireStage(state, 'case-note');
      if (error) return withError(state, error);
      const minimum = patient.caseNote?.minimumWords ?? 20;
      if (wordCount(state.caseNote) < minimum) return withError(state, `case note requires at least ${minimum} words`);
      const diagnosis = patient.diagnoses.find((item) => item.id === state.diagnosisId);
      const treatment = patient.treatments.find((item) => item.id === state.treatmentId);
      const required = patient.caseNote?.requiredFactIds || [];
      const knownFacts = new Set([...state.disclosedFactIds, ...state.observedFactIds]);
      const mentioned = required.filter((factId) => {
        const fact = factById(patient, factId);
        return knownFacts.has(factId)
          && fact?.noteTerms?.some((term) => state.caseNote.toLowerCase().includes(term.toLowerCase()));
      });
      const noteRatio = required.length ? mentioned.length / required.length : 1;
      const noteCoverage = Math.round(noteRatio * 100);
      const authoredResult = resolveAuthoredOutcome(patient, state, noteCoverage);
      return record({
        ...state,
        stage: 'result',
        result: authoredResult || {
          reputation: Math.round((diagnosis.reputation + treatment.reputation + noteRatio * 4) * 10) / 10,
          record: Math.round((diagnosis.record + treatment.record + noteRatio * 4) * 10) / 10,
          noteCoverage,
          diagnosisId: diagnosis.id,
          treatmentId: treatment.id,
        },
      }, { kind: 'result', diagnosisId: diagnosis.id, treatmentId: treatment.id });
    }
    default:
      return withError(state, `unknown action ${action?.type}`);
  }
}

export function createConsultationRuntime(patients, renderDialogue, options = {}) {
  const patientMap = new Map(patients.map((patient) => [patient.id, patient]));
  let state = null;
  const listeners = new Set();
  const publish = () => listeners.forEach((listener) => listener(state));
  const dispatch = (action) => {
    if (!state) return null;
    const elapsedBefore = state.elapsedMinutes;
    state = consultationTransition(state, patientMap.get(state.patientId), action);
    const elapsed = state.elapsedMinutes - elapsedBefore;
    if (elapsed > 0) options.onAdvanceMinutes?.(elapsed, action);
    publish();
    return state;
  };
  return {
    patients: () => [...patientMap.values()],
    get: () => state,
    start(patientId) {
      const patient = patientMap.get(patientId);
      if (!patient) throw new Error(`Unknown patient ${patientId}`);
      state = startConsultation(patient);
      publish();
      return state;
    },
    reset() {
      state = null;
      publish();
      return state;
    },
    dispatch,
    speak(input) {
      if (!state) return null;
      const patient = patientMap.get(state.patientId);
      const request = buildDialogueRequest(patient, state, input);
      const expectedPatientId = state.patientId;
      const expectedHistoryLength = state.history.length;
      const currentRequestStillApplies = () => (
        state?.patientId === expectedPatientId
        && state.stage === 'inquiry'
        && state.history.length === expectedHistoryLength
      );
      const applyResponse = (response) => (
        currentRequestStillApplies()
          ? dispatch({ type: 'speech-response', input, response })
          : state
      );
      const applyError = (error) => (
        currentRequestStillApplies()
          ? dispatch({ type: 'dialogue-error', error: error?.message || error })
          : state
      );
      let rendered;
      try {
        rendered = renderDialogue(request, patient);
      } catch (error) {
        return applyError(error);
      }
      if (rendered && typeof rendered.then === 'function') {
        return rendered.then(applyResponse).catch(applyError);
      }
      return applyResponse(rendered);
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

export function actorCueForConsultation(state) {
  if (!state) return { body: 'clinic-idle', expression: 'neutral', gaze: 'doctor', speaking: false };
  if (state.stage === 'terminated') {
    return { body: 'stand-up', expression: 'distressed', gaze: 'away', speaking: false };
  }
  if (state.stage === 'result') {
    return { body: 'clinic-idle', expression: 'relieved', gaze: 'doctor', speaking: false };
  }
  const last = state.history[state.history.length - 1];
  if (last?.kind === 'speech') {
    const difficult = ['prying', 'hostile'].includes(last.appraisal?.register);
    return {
      body: last.bodyCue || (difficult ? 'sitting-disapproval' : 'sitting-talking'),
      expression: difficult ? 'distressed' : 'guarded',
      gaze: difficult ? 'away' : 'doctor',
      speaking: true,
    };
  }
  if (last?.kind === 'examination') {
    return { body: last.bodyCue || 'clinic-idle', expression: 'guarded', gaze: 'doctor', speaking: false };
  }
  return { body: 'clinic-idle', expression: 'neutral', gaze: 'doctor', speaking: false };
}
