import test from 'node:test';
import assert from 'node:assert/strict';
import { NORA_BYRNE, createConsultationPatients } from '../src/consultation/patients.js';
import { validateConsultationPatient } from '../src/consultation/contract.js';
import {
  buildDialogueRequest,
  actorCueForConsultation,
  consultationTiming,
  consultationTransition,
  createConsultationRuntime,
  startConsultation,
} from '../src/consultation/engine.js';
import { renderOfflineDialogue } from '../src/consultation/offlineRenderer.js';
import { availableDialoguePrompts, classifyCustomThought } from '../src/consultation/patientLogic.js';
import { buildCaseNotebook } from '../src/consultation/caseNotebook.js';
import {
  buildDialogueModelPayload,
  buildJamesModelPayload,
  buildModernDebriefModelPayload,
  buildThoughtModelPayload,
} from '../src/consultation/modelBoundary.js';

const patient = NORA_BYRNE;

function begin() {
  return consultationTransition(startConsultation(patient), patient, { type: 'begin-inquiry' });
}

function speak(state, input) {
  const request = buildDialogueRequest(patient, state, input);
  return consultationTransition(state, patient, {
    type: 'speech-response', input, response: renderOfflineDialogue(request, patient),
  });
}

function askPrompt(state, promptId) {
  const prompt = patient.prompts.find((item) => item.id === promptId);
  return speak(state, {
    promptId, text: prompt.text, stance: prompt.stance,
    responseTo: prompt.resolvesPendingResponseId || null,
  });
}

function discoverCoreEvidence() {
  let state = begin();
  for (const promptId of [
    'nora-ask-onset', 'nora-ask-work', 'nora-ask-hand-agency',
    'nora-response-respect', 'nora-ask-memory', 'nora-ask-messages',
  ]) state = askPrompt(state, promptId);
  state = consultationTransition(state, patient, { type: 'examine', id: 'nora-exam-neurologic' });
  state = consultationTransition(state, patient, { type: 'continue-overtime' });
  state = consultationTransition(state, patient, { type: 'examine', id: 'nora-exam-general' });
  return state;
}

function finish(state, diagnosisId, treatmentId) {
  state = consultationTransition(state, patient, { type: 'begin-decision' });
  state = consultationTransition(state, patient, { type: 'select-diagnosis', id: diagnosisId });
  state = consultationTransition(state, patient, { type: 'select-treatment', id: treatmentId });
  state = consultationTransition(state, patient, { type: 'begin-case-note' });
  const recordFacts = [
    'nora-automatic-writing', 'nora-missing-time', 'nora-sensory-pattern',
    ...state.disclosedFactIds,
  ].filter((id, index, values) => state.disclosedFactIds.includes(id) && values.indexOf(id) === index).slice(0, 3);
  for (const id of recordFacts) {
    state = consultationTransition(state, patient, { type: 'select-record-fact', id });
  }
  state = consultationTransition(state, patient, {
    type: 'write-case-note',
    text: 'Following her sister Mary’s death, the patient experienced automatic writing, missing time and amnesia. Examination found glove-like left-hand numbness. Continued copyist work and lodging are important.',
  });
  return consultationTransition(state, patient, { type: 'submit-case-note' });
}

test('Nora is the first playable patient and satisfies the authored contract', () => {
  const patients = createConsultationPatients();
  assert.equal(patients[0], patient);
  assert.equal(patient.label, 'Miss Nora Byrne');
  assert.equal(patient.profile.identity.age, 28);
  assert.equal(patient.contentStatus, 'research-draft');
  assert.equal(patient.profileStatus, 'authored-composite');
  assert.equal(patient.sources.length, 4);
  assert.ok(patient.groundTruth.exclusions.includes('malingering'));
  assert.equal(patient.actor.recipe.asset.path, '/models/characters/nora-byrne.glb?v=4');
  assert.equal(patient.actor.recipe.asset.motionPath, '/models/characters/nora-byrne-motions.glb');
  assert.equal(patient.actor.recipe.asset.kind, 'authored-character');
  assert.deepEqual(patient.actor.recipe.placement.position, [0.45, 0.22, -1.7]);
  assert.deepEqual(patient.actor.recipe.placement.rotation, [0, Math.PI, 0]);
  assert.equal(patient.actor.recipe.placement.scale, 1.82);
  assert.deepEqual(validateConsultationPatient(patient), []);
});

test('Nora dialogue decisions emit authored performance cues', () => {
  let state = begin();
  state = askPrompt(state, 'nora-ask-onset');
  assert.equal(actorCueForConsultation(state).body, 'sitting-self-soothing');
  state = askPrompt(state, 'nora-ask-hand-agency');
  state = askPrompt(state, 'nora-response-respect');
  state = askPrompt(state, 'nora-ask-memory');
  assert.equal(actorCueForConsultation(state).body, 'sitting-disbelief');
  state = begin();
  state = askPrompt(state, 'nora-ask-hand-agency');
  state = askPrompt(state, 'nora-response-dismiss');
  assert.equal(actorCueForConsultation(state).body, 'sitting-disapproval');
});

test('the authored option selector offers at most three eligible questions and advances the branch', () => {
  let state = begin();
  const initial = availableDialoguePrompts(patient, state);
  assert.deepEqual(initial.map((item) => item.id), ['nora-ask-onset', 'nora-ask-hand-agency', 'nora-ask-work']);
  state = askPrompt(state, 'nora-ask-onset');
  const next = availableDialoguePrompts(patient, state);
  assert.ok(next.length <= 3);
  assert.ok(next.some((item) => item.id === 'nora-ask-hand-agency'));
  assert.ok(!next.some((item) => item.id === 'nora-ask-onset'));
});

test('patient responses add concise, deduplicated casebook notes', () => {
  let state = begin();
  state = askPrompt(state, 'nora-ask-onset');
  assert.equal(state.history.at(-1).noteSummary, 'Sleep disturbance worsened around her sister Mary’s illness and death in January.');
  let notebook = buildCaseNotebook(patient, state);
  assert.deepEqual(notebook.observations.map((entry) => entry.text), [
    'Sleep disturbance worsened around her sister Mary’s illness and death in January.',
  ]);

  state = askPrompt(state, 'nora-ask-onset');
  notebook = buildCaseNotebook(patient, state);
  assert.equal(notebook.observations.length, 1);
  assert.equal(notebook.latestEntryId, 'patient-note-1');
});

test('custom inquiry follows the same deterministic evidence rules as the concise choices', () => {
  const state = begin();
  const visibleIds = availableDialoguePrompts(patient, state).map((item) => item.id);
  assert.ok(visibleIds.includes('nora-ask-hand-agency'));
  const next = speak(state, {
    custom: true, stance: 'question',
    text: 'Does your hand ever write words with a pencil without your deciding what to say?',
  });
  assert.ok(next.disclosedFactIds.includes('nora-automatic-writing'));
  assert.equal(next.history.at(-1).custom, true);
  assert.equal(next.history.at(-1).resolvedRuleId, 'nora-intent-automatic-writing');
});

test('locked evidence cannot be forced by naming an unavailable authored prompt', () => {
  const state = begin();
  const prompt = patient.prompts.find((item) => item.id === 'nora-ask-memory');
  const input = { promptId: prompt.id, text: prompt.text, stance: prompt.stance };
  const request = buildDialogueRequest(patient, state, input);
  assert.equal(request.resolvedRuleId, null);
  assert.ok(!request.allowedDisclosureIds.includes('nora-missing-time'));
  const next = speak(state, input);
  assert.ok(!next.disclosedFactIds.includes('nora-missing-time'));
  assert.doesNotMatch(next.history.at(-1).dialogue, /three times|part of the hour/i);
});

test('a model cannot release Nora facts outside the deterministic allowance', () => {
  const state = begin();
  const input = { custom: true, stance: 'question', text: 'How is your sleep?' };
  const next = consultationTransition(state, patient, {
    type: 'speech-response', input,
    response: {
      dialogue: '“Mary writes through my hand.”',
      disclosedNow: ['nora-automatic-writing', 'nora-missing-time'],
      appraisal: { register: 'clinical', decorumBreach: 0, intent: 'question', terminates: false },
    },
  });
  assert.ok(!next.disclosedFactIds.includes('nora-automatic-writing'));
  assert.ok(!next.disclosedFactIds.includes('nora-missing-time'));
  assert.doesNotMatch(next.history.at(-1).dialogue, /Mary writes through my hand/);
  assert.match(next.errors.at(-1), /unauthorized disclosure/);
});

test('custom thought records a classified hypothesis without changing time or patient satisfaction', () => {
  const state = begin();
  const text = 'Perhaps this is divided consciousness with automatic acts outside ordinary memory.';
  const classification = classifyCustomThought(patient, text);
  const next = consultationTransition(state, patient, { type: 'interpret-custom', text, classification });
  assert.equal(classification.id, 'dissociation');
  assert.equal(next.elapsedMinutes, state.elapsedMinutes);
  assert.equal(next.satisfaction, state.satisfaction);
  assert.equal(next.customInterpretations[0].text, text);
  assert.deepEqual(buildCaseNotebook(patient, next).observations, []);
});

test('Nora examinations establish a differential without treating animation as measurement', () => {
  let state = begin();
  state = consultationTransition(state, patient, { type: 'examine', id: 'nora-exam-neurologic' });
  assert.ok(state.observedFactIds.includes('nora-sensory-pattern'));
  assert.ok(state.observedFactIds.includes('nora-normal-neurology'));
  assert.match(state.history.at(-1).reply, /glove-like boundary/);
  assert.match(state.history.at(-1).reply, /strength and reflexes remain normal/);
});

test('the appointment clock forces a closing choice and permits one deliberate overtime period', () => {
  let state = begin();
  for (const promptId of [
    'nora-ask-onset', 'nora-ask-work', 'nora-ask-hand-agency',
    'nora-response-respect', 'nora-ask-memory', 'nora-ask-messages',
  ]) state = askPrompt(state, promptId);
  state = consultationTransition(state, patient, { type: 'examine', id: 'nora-exam-neurologic' });
  assert.equal(state.elapsedMinutes, 30);
  assert.equal(consultationTiming(patient, state).deadlineReached, true);

  const rejected = consultationTransition(state, patient, { type: 'examine', id: 'nora-exam-general' });
  assert.equal(rejected.elapsedMinutes, 30);
  assert.match(rejected.errors.at(-1), /appointment has ended/);

  state = consultationTransition(state, patient, { type: 'continue-overtime' });
  assert.equal(consultationTiming(patient, state).authorizedMinutes, 35);
  state = consultationTransition(state, patient, { type: 'examine', id: 'nora-exam-general' });
  assert.equal(state.elapsedMinutes, 35);
  const secondExtension = consultationTransition(state, patient, { type: 'continue-overtime' });
  assert.match(secondExtension.errors.at(-1), /no further overtime/);
});

test('a deliberate follow-up produces reduced payment and complete modal summary data', () => {
  let state = begin();
  state = askPrompt(state, 'nora-ask-onset');
  state = askPrompt(state, 'nora-ask-work');
  state = consultationTransition(state, patient, { type: 'examine', id: 'nora-exam-neurologic' });
  state = consultationTransition(state, patient, { type: 'schedule-follow-up' });
  assert.equal(state.stage, 'result');
  assert.equal(state.result.kind, 'follow-up-outcome');
  assert.equal(state.result.immediate.paymentCents, patient.outcomeModel.fee.reduced);
  assert.equal(state.result.summary.questionsAsked, 2);
  assert.equal(state.result.summary.examinationsPerformed, 1);
  assert.equal(state.result.summary.minutesUsed, 15);
  assert.ok(state.result.immediate.departureLine);
  assert.ok(state.result.immediate.satisfactionOutOfTen >= 0);
});

test('immediate approval can diverge from one-month health', () => {
  const evidence = discoverCoreEvidence();
  const supportive = finish(evidence, 'nora-dx-automatism', 'mind-remove-influence');
  const spirit = finish(evidence, 'nora-dx-spirit', 'mind-endorse');
  assert.equal(supportive.stage, 'result');
  assert.equal(spirit.stage, 'result');
  assert.equal(supportive.result.kind, 'authored-outcome');
  assert.ok(spirit.result.immediate.satisfaction > supportive.result.immediate.satisfaction);
  assert.ok(spirit.result.oneMonth.recovery < 0);
  assert.ok(supportive.result.oneMonth.recovery > 0);
  assert.match(spirit.result.oneMonth.narrative, /valued subject at the circle/);
  assert.equal(supportive.result.noteCoverage, 100);
  assert.equal(supportive.result.evidenceCoverage, 100);
  assert.equal(supportive.result.summary.questionsAsked, 5);
  assert.equal(supportive.result.summary.examinationsPerformed, 2);
  assert.equal(supportive.result.summary.minutesUsed, 35);
  assert.match(supportive.result.immediate.departureLine, /Thank you/);
});

test('diagnostic scores depend on discovered evidence as well as the selected label', () => {
  let thin = begin();
  thin = consultationTransition(thin, patient, { type: 'examine', id: 'nora-exam-neurologic' });
  const thinResult = finish(thin, 'nora-dx-automatism', 'mind-remove-influence');
  const fullResult = finish(discoverCoreEvidence(), 'nora-dx-automatism', 'mind-remove-influence');
  assert.ok(fullResult.result.scores.diagnosis > thinResult.result.scores.diagnosis);
  assert.ok(fullResult.result.scores.observation > thinResult.result.scores.observation);
  assert.ok(fullResult.result.noteCoverage > thinResult.result.noteCoverage);
});

test('model payloads expose only the facts appropriate to their role', () => {
  const state = begin();
  const input = { custom: true, stance: 'question', text: 'Can your hand write with a pencil without intention?' };
  const request = buildDialogueRequest(patient, state, input);
  const dialogue = buildDialogueModelPayload(request, patient);
  assert.deepEqual(dialogue.allowedNewFacts.map((fact) => fact.id), ['nora-automatic-writing']);
  assert.ok(!JSON.stringify(dialogue).includes('nora-missing-time'));
  assert.ok(!JSON.stringify(dialogue).includes(patient.groundTruth.etiologyId));

  const thought = buildThoughtModelPayload(patient, state, 'Could this be divided awareness?');
  assert.deepEqual(thought.knownFacts.map((fact) => fact.id), ['nora-sleep', 'nora-tremor']);
  assert.ok(!JSON.stringify(thought).includes(patient.groundTruth.etiologyId));

  const completed = finish(discoverCoreEvidence(), 'nora-dx-automatism', 'mind-remove-influence');
  const james = buildJamesModelPayload(patient, completed, completed.result);
  const modern = buildModernDebriefModelPayload(patient, completed, completed.result);
  assert.ok(!JSON.stringify(james).includes(patient.groundTruth.etiologyId));
  assert.equal(modern.groundTruth.etiologyId, patient.groundTruth.etiologyId);
  assert.deepEqual(modern.record.fixedScores, completed.result.scores);
});

test('the outcome evaluates the player’s private reasoning without changing patient truth', () => {
  const evidence = discoverCoreEvidence();
  const carefulText = 'The automatic acts and amnesia suggest divided consciousness.';
  const carelessText = 'She is probably malingering for attention.';
  const careful = consultationTransition(evidence, patient, {
    type: 'interpret-custom', text: carefulText,
    classification: classifyCustomThought(patient, carefulText),
  });
  const careless = consultationTransition(evidence, patient, {
    type: 'interpret-custom', text: carelessText,
    classification: classifyCustomThought(patient, carelessText),
  });
  const carefulResult = finish(careful, 'nora-dx-automatism', 'mind-remove-influence');
  const carelessResult = finish(careless, 'nora-dx-automatism', 'mind-remove-influence');
  assert.ok(carefulResult.result.scores.interpretation > carelessResult.result.scores.interpretation);
  assert.equal(carefulResult.result.oneMonth.recovery, carelessResult.result.oneMonth.recovery);
});

test('the runtime supports an asynchronous dialogue adapter and reports failures without advancing time', async () => {
  const runtime = createConsultationRuntime([patient], async (request, currentPatient) => (
    renderOfflineDialogue(request, currentPatient)
  ));
  runtime.start(patient.id);
  runtime.dispatch({ type: 'begin-inquiry' });
  const state = await runtime.speak({ custom: true, stance: 'question', text: 'Did your sister die recently?' });
  assert.ok(state.disclosedFactIds.includes('nora-bereavement'));
  assert.equal(state.elapsedMinutes, 5);

  const failing = createConsultationRuntime([patient], async () => {
    throw new Error('service unavailable');
  });
  failing.start(patient.id);
  failing.dispatch({ type: 'begin-inquiry' });
  const failed = await failing.speak({ custom: true, stance: 'question', text: 'How are you?' });
  assert.equal(failed.elapsedMinutes, 0);
  assert.match(failed.errors.at(-1), /service unavailable/);
});

test('a late model response cannot overwrite a newer consultation action', async () => {
  let release;
  let savedRequest;
  const runtime = createConsultationRuntime([patient], (request) => {
    savedRequest = request;
    return new Promise((resolve) => { release = resolve; });
  });
  runtime.start(patient.id);
  runtime.dispatch({ type: 'begin-inquiry' });
  const pending = runtime.speak({ custom: true, stance: 'question', text: 'Did your sister die recently?' });
  runtime.dispatch({ type: 'examine', id: 'nora-exam-neurologic' });
  release(renderOfflineDialogue(savedRequest, patient));
  const state = await pending;
  assert.equal(state.elapsedMinutes, 5);
  assert.equal(state.history.at(-1).kind, 'examination');
  assert.ok(!state.disclosedFactIds.includes('nora-bereavement'));
});
