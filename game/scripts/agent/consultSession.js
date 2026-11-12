// A consultation played as text. It drives the same runtime the game UI
// drives (createConsultationRuntime), so rules and outcomes cannot differ.
// observe() returns only what a player would see on screen; the authored
// ground truth appears only in log(), which is written after the visit.

import { consultationTiming, createConsultationRuntime } from '../../src/consultation/engine.js';
import { renderOfflineDialogue } from '../../src/consultation/offlineRenderer.js';
import {
  availableDiagnoses, availableDialoguePrompts, availableExaminations, classifyCustomThought,
} from '../../src/consultation/patientLogic.js';
import { buildCaseNotebook } from '../../src/consultation/caseNotebook.js';
import {
  TREATMENT_CATEGORIES, resolveTreatment, searchTreatments, treatmentsInCategory,
} from '../../src/consultation/treatments.js';
import { treatmentDiscussionStep } from '../../src/consultation/treatmentDiscussion.js';
import { collectAccount, settlementOptions } from '../../src/consultation/settlement.js';

const CATEGORIES = TREATMENT_CATEGORIES.filter((item) => !item.custom);

function shelfItem(item) {
  return { id: item.id, label: item.label, detail: item.detail, feeCents: item.feeCents };
}

// What the last thing that happened looked like from the doctor's chair.
function describeEvent(event) {
  if (!event) return null;
  const clean = (entry) => Object.fromEntries(Object.entries(entry).filter(([, value]) => value));
  switch (event.kind) {
    case 'opening': return clean({ patient: event.dialogue, behavior: event.behavior });
    case 'speech': return clean({ you: event.input, patient: event.dialogue, behavior: event.behavior, minutes: event.minutes });
    case 'examination': return clean({
      examination: event.label, finding: event.reply, uncertainty: event.uncertainty, behavior: event.behavior,
    });
    case 'interpretation': return { thought: event.text };
    case 'discussion':
    case 'return-visit': return clean({ you: event.input, patient: event.dialogue });
    case 'overtime': return { note: `You take ${event.minutes} minutes of overtime.` };
    case 'termination': return { note: 'The visit has ended without a decision.' };
    default: return null;
  }
}

function visibleResult(result) {
  if (!result) return null;
  if (!result.immediate) return { record: result.record, reputation: result.reputation };
  return {
    immediate: {
      narrative: result.immediate.narrative,
      departureLine: result.immediate.departureLine,
      payment: result.immediate.paymentLabel,
      paymentCents: result.immediate.paymentCents,
      satisfactionOutOfTen: result.immediate.satisfactionOutOfTen ?? Math.round(result.immediate.satisfaction) / 10,
      wordOfMouth: result.immediate.wordOfMouth,
    },
    oneMonth: { band: result.oneMonth.band, narrative: result.oneMonth.narrative },
    scores: result.scores,
    jamesLetter: result.james?.letter || null,
    modernDebrief: result.modernDebrief || null,
  };
}

export function createConsultSession({
  patient,
  renderDialogue = renderOfflineDialogue,
  renderLetter = null,
  // 'shortlist' shows the game's three evidence-ranked diagnoses, with the
  // full list one action away, as in the UI. 'full' shows every diagnosis in
  // authored order and never the ranking.
  hints = 'shortlist',
  onAdvanceMinutes = null,
} = {}) {
  const runtime = createConsultationRuntime([patient], renderDialogue, { onAdvanceMinutes });
  runtime.start(patient.id);
  runtime.dispatch({ type: 'begin-inquiry' });

  const steps = [];
  let offered = {};
  let shelf = null;
  let showAllDiagnoses = hints === 'full';
  let askedForFullList = false;
  let settlement = null;
  let finished = false;
  let letter = null;

  const state = () => runtime.get();

  function buildActions() {
    const current = state();
    const actions = [];
    offered = {};
    const offer = (key, items) => { offered[key] = items; return items; };

    if (finished || current.stage === 'terminated') return actions;

    if (current.stage === 'inquiry') {
      const timing = consultationTiming(patient, current);
      const waiting = Boolean(current.pendingResponseId);
      const timeUp = timing.deadlineReached && !waiting;
      if (!timeUp || current.awaitingApology) {
        offer('ask', availableDialoguePrompts(patient, current)).forEach((prompt, index) => {
          actions.push({ type: 'ask', n: index + 1, text: prompt.text, minutes: prompt.minutes ?? 5 });
        });
        actions.push({ type: 'say', text: '<your own words to the patient>', minutes: 5 });
      }
      offer('think', patient.interpretations || []).forEach((item, index) => {
        actions.push({ type: 'think', n: index + 1, text: item.text, minutes: 0 });
      });
      actions.push({ type: 'think', text: '<your own working idea>', minutes: 0 });
      if (!waiting && !timeUp) {
        offer('examine', availableExaminations(patient, current)).forEach((exam, index) => {
          actions.push({ type: 'examine', n: index + 1, label: exam.label, minutes: exam.minutes ?? 3 });
        });
      }
      if (!waiting) {
        actions.push({ type: 'decide' }, { type: 'follow-up' });
        if (timing.deadlineReached && timing.canExtendOvertime) actions.push({ type: 'overtime' });
      }
      actions.push({ type: 'end-visit' });
      return actions;
    }

    if (current.stage === 'decision') {
      const diagnoses = showAllDiagnoses ? patient.diagnoses : availableDiagnoses(patient, current);
      offer('diagnose', diagnoses).forEach((item, index) => {
        actions.push({
          type: 'diagnose', n: index + 1, label: item.label, description: item.description,
          ...(item.id === current.diagnosisId ? { selected: true } : {}),
        });
      });
      if (!showAllDiagnoses) actions.push({ type: 'list-diagnoses' });
      for (const category of CATEGORIES) {
        actions.push({
          type: 'treatments', category: category.id, label: category.label,
          count: treatmentsInCategory(category.id).length,
        });
      }
      actions.push({ type: 'treatments', query: '<search words>' });
      actions.push({ type: 'prescribe', id: '<treatment id; repeat to remove; at most 3>' });
      if (current.diagnosisId && current.treatmentIds.length) actions.push({ type: 'sign' });
      actions.push({ type: 'end-visit' });
      return actions;
    }

    if (current.stage === 'treatment-discussion') {
      const step = treatmentDiscussionStep(patient, current);
      if (step) {
        offer('respond', step.choices).forEach((choice, index) => {
          actions.push({ type: 'respond', n: index + 1, text: choice.text });
        });
      } else {
        actions.push({ type: 'sign' });
      }
      actions.push({ type: 'revise' }, { type: 'end-visit' });
      return actions;
    }

    if (current.stage === 'result') {
      if (!settlement && current.result?.immediate) {
        offer('settle', settlementOptions(patient, current.result)).forEach((option) => {
          actions.push({ type: 'settle', id: option.id, label: option.label, hint: option.hint });
        });
      }
      if (current.result?.returnVisit && current.returnVisit?.phase !== 'complete') {
        actions.push({ type: 'return-visit' });
      }
      actions.push({ type: 'finish' });
      return actions;
    }

    if (current.stage === 'return-visit') {
      const visit = current.result.returnVisit;
      if (current.returnVisit.phase === 'questions') {
        offer('review', visit.questions.filter((item) => !current.returnVisit.asked.includes(item.id)))
          .forEach((item, index) => actions.push({ type: 'review', n: index + 1, text: item.text }));
        if (current.returnVisit.asked.length) actions.push({ type: 'next-steps' });
      }
      if (current.returnVisit.phase === 'plan') {
        offer('agree', visit.plans).forEach((item, index) => {
          actions.push({ type: 'agree', n: index + 1, text: item.text });
        });
      }
      actions.push({ type: 'end-review' });
    }
    return actions;
  }

  // So an action sent before the first observe() resolves against the opening choices.
  buildActions();

  function observe(error = null) {
    const current = state();
    const timing = consultationTiming(patient, current);
    const notebook = buildCaseNotebook(patient, current);
    const selected = (current.treatmentIds || []).map((id) => shelfItem(resolveTreatment(patient, id)));
    const observation = {
      mode: 'consultation',
      stage: finished ? 'finished' : current.stage,
      patient: notebook.patient,
      clock: {
        usedMinutes: timing.usedMinutes,
        scheduledMinutes: timing.scheduledMinutes,
        remainingMinutes: timing.authorizedRemaining,
        timeUp: timing.deadlineReached,
      },
      last: describeEvent(current.history.findLast((event) => describeEvent(event))),
      ...(current.pendingResponseId ? { patientAwaitsYourAnswer: true } : {}),
      ...(current.awaitingApology ? { patientAwaitsApology: true } : {}),
      notebook: {
        observations: notebook.observations.map(({ kind, text }) => ({ kind, text })),
        clues: notebook.clues.map(({ label, text }) => ({ label, text })),
      },
    };
    if (['decision', 'treatment-discussion'].includes(current.stage)) {
      const diagnosis = patient.diagnoses.find((item) => item.id === current.diagnosisId);
      observation.decision = { diagnosis: diagnosis?.label || null, prescription: selected };
      if (current.treatmentAgreement) observation.decision.agreedPlan = current.treatmentAgreement.summary;
    }
    if (shelf) observation.shelf = shelf;
    if (current.result) {
      observation.result = visibleResult(current.result);
      if (letter) observation.result.jamesLetter = letter;
      if (settlement) observation.result.settlement = settlement;
    }
    observation.actions = buildActions();
    if (error) observation.error = error;
    shelf = null;
    return observation;
  }

  function pick(key, action) {
    const list = offered[key] || [];
    if (action.id) return list.find((item) => item.id === action.id) || null;
    return Number.isInteger(action.n) ? list[action.n - 1] || null : null;
  }

  // Returns an error string, or null when the action was carried out.
  async function perform(action) {
    const dispatch = (engineAction) => runtime.dispatch(engineAction);
    switch (action.type) {
      case 'observe': return null;
      case 'ask': {
        const prompt = pick('ask', action);
        if (!prompt) return 'no such question on offer';
        await runtime.speak({
          text: prompt.text, stance: prompt.stance, promptId: prompt.id,
          responseTo: prompt.resolvesPendingResponseId || null,
        });
        return null;
      }
      case 'say': {
        const text = String(action.text || '').trim();
        if (!text) return 'say needs text';
        await runtime.speak({ text, stance: 'question', custom: true });
        return null;
      }
      case 'think': {
        if (action.text && !action.n && !action.id) {
          const text = String(action.text).trim();
          dispatch({ type: 'interpret-custom', text, classification: classifyCustomThought(patient, text) });
          return null;
        }
        const item = pick('think', action);
        if (!item) return 'no such working idea on offer';
        dispatch({ type: 'interpret', id: item.id });
        return null;
      }
      case 'examine': {
        const exam = pick('examine', action);
        if (!exam) return 'no such examination on offer';
        dispatch({ type: 'examine', id: exam.id });
        return null;
      }
      case 'overtime': dispatch({ type: 'continue-overtime' }); return null;
      case 'follow-up': dispatch({ type: 'schedule-follow-up' }); return null;
      case 'end-visit': dispatch({ type: 'end-early' }); return null;
      case 'decide': dispatch({ type: 'begin-decision' }); return null;
      case 'list-diagnoses':
        if (state().stage !== 'decision') return 'the diagnosis list opens after you decide';
        showAllDiagnoses = true;
        askedForFullList = true;
        return null;
      case 'diagnose': {
        const item = pick('diagnose', action);
        if (!item) return 'no such diagnosis on offer';
        dispatch({ type: 'select-diagnosis', id: item.id });
        return null;
      }
      case 'treatments': {
        if (state().stage !== 'decision') return 'the treatment shelf opens after you decide';
        const items = action.query
          ? searchTreatments(patient, action.query)
          : treatmentsInCategory(action.category).map((base) => resolveTreatment(patient, base.id));
        shelf = items.map(shelfItem);
        return null;
      }
      case 'prescribe': dispatch({ type: 'select-treatment', id: action.id }); return null;
      case 'sign': dispatch({ type: 'conclude' }); return null;
      case 'revise': dispatch({ type: 'revise-treatment' }); return null;
      case 'respond': {
        const choice = pick('respond', action);
        if (!choice) return 'no such reply on offer';
        dispatch({ type: 'respond-treatment', id: choice.id });
        return null;
      }
      case 'settle': {
        const option = pick('settle', action);
        if (!option) return 'no such way to settle the fee';
        const current = state();
        // An account is paid, or not, by how the month went.
        const collected = option.id === 'account' ? collectAccount(patient, current.result) : null;
        settlement = {
          id: option.id,
          cents: collected ? collected.cents : option.cents,
          standing: collected ? collected.standing : option.standing || 0,
          ...(collected ? { note: collected.line } : {}),
        };
        return null;
      }
      case 'return-visit': dispatch({ type: 'begin-return-visit' }); return null;
      case 'review': {
        const item = pick('review', action);
        if (!item) return 'no such question on offer';
        dispatch({ type: 'ask-return-visit', id: item.id });
        return null;
      }
      case 'next-steps': dispatch({ type: 'discuss-return-plan' }); return null;
      case 'agree': {
        const item = pick('agree', action);
        if (!item) return 'no such next step on offer';
        dispatch({ type: 'agree-return-plan', id: item.id });
        return null;
      }
      case 'end-review': dispatch({ type: 'end-return-visit' }); return null;
      case 'finish':
        if (!['result', 'terminated'].includes(state().stage)) return 'the visit is not over';
        finished = true;
        return null;
      default: return `unknown action ${action.type}`;
    }
  }

  async function act(action) {
    if (finished) return observe('the visit is finished');
    if (!action || typeof action.type !== 'string') return observe('an action is an object with a type');
    const before = state();
    let error = await perform(action);
    const after = state();
    if (!error && after.errors.length > before.errors.length) error = after.errors.at(-1);
    if (action.type !== 'observe') {
      steps.push({
        action,
        ...(action.reasoning ? { reasoning: action.reasoning } : {}),
        minutesBefore: before.elapsedMinutes,
        minutesAfter: after.elapsedMinutes,
        ...(error ? { error } : {}),
      });
    }
    if (after.stage === 'result' && before.stage !== 'result' && renderLetter && after.result?.immediate) {
      letter = await renderLetter(patient, after, after.result);
    }
    return observe(error);
  }

  // The research record. Everything a later reader needs to score the run,
  // including the answers the player was never shown.
  function log() {
    const current = state();
    const known = new Set([...current.disclosedFactIds, ...current.observedFactIds]);
    const found = (ids) => ({
      found: (ids || []).filter((id) => known.has(id)).length,
      of: (ids || []).length,
    });
    const quality = (item) => item?.evaluation?.quality ?? null;
    const best = [...patient.diagnoses].sort((a, b) => (quality(b) ?? 0) - (quality(a) ?? 0))[0];
    const chosen = patient.diagnoses.find((item) => item.id === current.diagnosisId) || null;
    const speech = current.history.filter((event) => event.kind === 'speech');
    return {
      patient: { id: patient.id, name: patient.label, contentStatus: patient.contentStatus },
      hints,
      steps,
      transcript: current.history.map((event) => ({
        kind: event.kind, ...describeEvent(event),
        ...(event.custom ? { custom: true } : {}),
        ...(event.promptId ? { promptId: event.promptId } : {}),
      })),
      outcome: {
        stage: current.stage,
        minutesUsed: current.elapsedMinutes,
        questions: speech.length,
        customQuestions: speech.filter((event) => event.custom).length,
        examinations: current.history.filter((event) => event.kind === 'examination').length,
        thoughts: current.history.filter((event) => event.kind === 'interpretation').length,
        rejectedActions: steps.filter((step) => step.error).length,
        askedForFullDiagnosisList: askedForFullList,
        diagnosis: chosen ? { id: chosen.id, label: chosen.label } : null,
        treatments: (current.treatmentIds || []).map((id) => resolveTreatment(patient, id).label),
        agreedPlan: current.treatmentAgreement?.summary || null,
        settlement,
        result: visibleResult(current.result),
      },
      groundTruth: {
        ...patient.groundTruth,
        bestDiagnosis: best ? { id: best.id, label: best.label, quality: quality(best) } : null,
        chosenDiagnosisQuality: quality(chosen),
        choseBestDiagnosis: Boolean(chosen && best && chosen.id === best.id),
        evidence: found(patient.outcomeModel?.evidenceFactIds),
        criticalEvidence: found(patient.outcomeModel?.criticalFactIds),
        finalTrust: current.trust,
      },
    };
  }

  return {
    observe: () => observe(),
    act,
    log,
    done: () => finished || state().stage === 'terminated',
    // For callers that own the wider game (the day session, tests).
    state,
    settlement: () => settlement,
  };
}
