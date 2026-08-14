import test from 'node:test';
import assert from 'node:assert/strict';
import { CARMELA_RUSSO, createConsultationPatients } from '../src/consultation/patients.js';
import { validateConsultationPatient } from '../src/consultation/contract.js';
import {
  actorCueForConsultation,
  buildDialogueRequest,
  consultationTiming,
  consultationTransition,
  startConsultation,
} from '../src/consultation/engine.js';
import { renderOfflineDialogue } from '../src/consultation/offlineRenderer.js';
import { availableDialoguePrompts, availableDiagnoses } from '../src/consultation/patientLogic.js';

const patient = CARMELA_RUSSO;

function begin() {
  return consultationTransition(startConsultation(patient), patient, { type: 'begin-inquiry' });
}

function ask(state, id) {
  const prompt = patient.prompts.find((item) => item.id === id);
  const input = {
    promptId: id,
    text: prompt.text,
    stance: prompt.stance,
    responseTo: prompt.resolvesPendingResponseId || null,
  };
  const request = buildDialogueRequest(patient, state, input);
  return consultationTransition(state, patient, {
    type: 'speech-response', input, response: renderOfflineDialogue(request, patient),
  });
}

function discoverFocusedEvidence() {
  let state = begin();
  state = consultationTransition(state, patient, { type: 'interpret', id: 'carmela-approach-sequence' });
  for (const id of [
    'carmela-ask-pattern', 'carmela-ask-calamity', 'carmela-response-steady',
    'carmela-ask-tonics', 'carmela-ask-red-flags',
  ]) state = ask(state, id);
  state = consultationTransition(state, patient, { type: 'examine', id: 'carmela-exam-cardiorespiratory' });
  state = ask(state, 'carmela-ask-shop');
  return state;
}

function finish(state, diagnosisId, treatmentId) {
  state = consultationTransition(state, patient, { type: 'begin-decision' });
  state = consultationTransition(state, patient, { type: 'select-diagnosis', id: diagnosisId });
  state = consultationTransition(state, patient, { type: 'select-treatment', id: treatmentId });
  state = consultationTransition(state, patient, { type: 'begin-case-note' });
  for (const id of ['carmela-episode-pattern', 'carmela-coca-wine', 'carmela-cardiac-exam']) {
    state = consultationTransition(state, patient, { type: 'select-record-fact', id });
  }
  return consultationTransition(state, patient, { type: 'submit-case-note' });
}

test('Carmela is a complete authored patient in the third queue position', () => {
  const patients = createConsultationPatients();
  assert.equal(patients[2], patient);
  assert.equal(patient.label, 'Mrs. Carmela Russo');
  assert.equal(patient.profile.identity.migration.arrivalYear, 1861);
  assert.equal(patient.profile.social.occupation, 'proprietor of a provisions shop');
  assert.equal(patient.contentStatus, 'research-draft');
  assert.equal(patient.profileStatus, 'authored-composite');
  assert.equal(patient.sources.length, 5);
  assert.deepEqual(validateConsultationPatient(patient), []);
});

test('Carmela starts with three distinct affordances and branches into the hidden tonic', () => {
  let state = begin();
  assert.deepEqual(availableDialoguePrompts(patient, state).map((item) => item.id), [
    'carmela-ask-pattern', 'carmela-ask-red-flags', 'carmela-ask-shop',
  ]);
  state = ask(state, 'carmela-ask-pattern');
  assert.ok(state.disclosedFactIds.includes('carmela-robbery-fright'));
  assert.deepEqual(availableDialoguePrompts(patient, state).map((item) => item.id), [
    'carmela-ask-tonics', 'carmela-ask-calamity', 'carmela-ask-red-flags',
  ]);
  state = ask(state, 'carmela-ask-tonics');
  assert.ok(state.disclosedFactIds.includes('carmela-coca-wine'));
  assert.ok(state.disclosedFactIds.includes('carmela-dose-link'));
  assert.match(state.history.at(-1).dialogue, /Mariani wine—the coca wine/);
});

test('the mid-consultation attack demands a response before another action', () => {
  let state = begin();
  state = ask(state, 'carmela-ask-pattern');
  state = ask(state, 'carmela-ask-calamity');
  assert.equal(state.pendingResponseId, 'carmela-attack-question');
  assert.deepEqual(actorCueForConsultation(state), {
    body: 'sitting-distressed', expression: 'discouraged', gaze: 'doctor', speaking: true,
  });
  assert.deepEqual(availableDialoguePrompts(patient, state).map((item) => item.id), [
    'carmela-response-steady', 'carmela-response-dismiss', 'carmela-response-omen',
  ]);

  const rejected = consultationTransition(state, patient, { type: 'examine', id: 'carmela-exam-cardiorespiratory' });
  assert.match(rejected.errors.at(-1), /respond to the patient/);
  state = ask(state, 'carmela-response-steady');
  assert.equal(state.pendingResponseId, null);
  assert.match(state.history.at(-1).dialogue, /plain speaking/);
  assert.deepEqual(actorCueForConsultation(state), {
    body: 'sitting-talking', expression: 'smiling', gaze: 'doctor', speaking: true,
  });
});

test('the focused Carmela route exactly fills the appointment without becoming a checklist', () => {
  const state = discoverFocusedEvidence();
  assert.equal(state.elapsedMinutes, 30);
  assert.equal(consultationTiming(patient, state).deadlineReached, true);
  assert.ok(state.disclosedFactIds.includes('carmela-shop-stakes'));
  assert.ok(state.observedFactIds.includes('carmela-cardiac-exam'));
  assert.ok(!state.observedFactIds.includes('carmela-general-exam'));
  assert.equal(state.history.filter((event) => event.kind === 'speech' && event.countsAsQuestion !== false).length, 5);
});

test('discovered evidence promotes stimulant-amplified palpitation in the short diagnosis list', () => {
  const state = discoverFocusedEvidence();
  const diagnoses = availableDiagnoses(patient, state);
  assert.equal(diagnoses[0].id, 'carmela-dx-nervous-coca');
  assert.ok(diagnoses.some((item) => item.id === 'carmela-dx-morbid-fear'));
  assert.ok(diagnoses.some((item) => item.id === 'carmela-dx-presentiment'));
});

test('a flattering supernatural path feels good immediately but worsens Carmela at one month', () => {
  const evidence = discoverFocusedEvidence();
  const focused = finish(evidence, 'carmela-dx-nervous-coca', 'carmela-tx-stop-coca');
  const warning = finish(evidence, 'carmela-dx-presentiment', 'carmela-tx-heed-warning');
  assert.equal(focused.stage, 'result');
  assert.equal(focused.result.summary.questionsAsked, 5);
  assert.equal(focused.result.summary.examinationsPerformed, 1);
  assert.equal(focused.result.summary.minutesUsed, 30);
  assert.equal(focused.result.immediate.paymentCents, 300);
  assert.ok(focused.result.oneMonth.healthChange > 0);
  assert.ok(warning.result.immediate.satisfaction > focused.result.immediate.satisfaction);
  assert.ok(warning.result.oneMonth.healthChange < 0);
  assert.match(warning.result.oneMonth.narrative, /sphere of danger has widened/);
});

test('dismissal and economically impossible rest can reduce Carmela’s fee', () => {
  let state = begin();
  state = ask(state, 'carmela-ask-pattern');
  state = ask(state, 'carmela-ask-calamity');
  state = ask(state, 'carmela-response-dismiss');
  assert.deepEqual(actorCueForConsultation(state), {
    body: 'sitting-disapproval', expression: 'frowning', gaze: 'doctor', speaking: true,
  });
  state = ask(state, 'carmela-ask-shop');
  state = consultationTransition(state, patient, { type: 'examine', id: 'carmela-exam-cardiorespiratory' });
  const result = finish(state, 'carmela-dx-irritable-heart', 'carmela-tx-rest-cure');
  assert.equal(result.result.immediate.paymentCents, 150);
  assert.equal(result.result.immediate.paymentLabel, 'Reduced fee paid');
  assert.ok(result.result.immediate.satisfactionOutOfTen < 5);
});
