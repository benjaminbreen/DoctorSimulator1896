import test from 'node:test';
import assert from 'node:assert/strict';
import { createConsultationPatients, SAMUEL_TAYLOR } from '../src/consultation/patients.js';
import { validateConsultationPatient } from '../src/consultation/contract.js';
import {
  actorCueForConsultation,
  buildDialogueRequest,
  consultationTransition,
  startConsultation,
} from '../src/consultation/engine.js';
import { renderOfflineDialogue } from '../src/consultation/offlineRenderer.js';
import { availableDiagnoses, availableDialoguePrompts } from '../src/consultation/patientLogic.js';

const patient = SAMUEL_TAYLOR;

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
  return consultationTransition(state, patient, {
    type: 'speech-response',
    input,
    response: renderOfflineDialogue(buildDialogueRequest(patient, state, input), patient),
  });
}

function focusedEvidence() {
  let state = begin();
  state = consultationTransition(state, patient, { type: 'interpret', id: 'samuel-approach-exposure' });
  for (const id of ['samuel-ask-course', 'samuel-ask-work', 'samuel-response-test', 'samuel-ask-bowels']) {
    state = ask(state, id);
  }
  state = consultationTransition(state, patient, { type: 'examine', id: 'samuel-exam-mouth-hands' });
  state = ask(state, 'samuel-ask-income');
  return consultationTransition(state, patient, { type: 'examine', id: 'samuel-exam-abdomen' });
}

function finish(state, diagnosisId, treatmentId, factIds) {
  state = consultationTransition(state, patient, { type: 'begin-decision' });
  state = consultationTransition(state, patient, { type: 'select-diagnosis', id: diagnosisId });
  state = consultationTransition(state, patient, { type: 'select-treatment', id: treatmentId });
  state = consultationTransition(state, patient, { type: 'begin-case-note' });
  for (const id of factIds) state = consultationTransition(state, patient, { type: 'select-record-fact', id });
  return consultationTransition(state, patient, { type: 'submit-case-note' });
}

test('Samuel is a complete authored patient in the second queue position', () => {
  const patients = createConsultationPatients();
  assert.equal(patients[1], patient);
  assert.equal(patient.label, 'Mr. Samuel Taylor');
  assert.equal(patient.profile.social.occupation, 'compositor temporarily assigned to stereotype work');
  assert.equal(patient.profileStatus, 'authored-composite');
  assert.equal(patient.sources.length, 4);
  assert.equal(patient.actor.recipe.values.skinTone, '#afa59b');
  assert.deepEqual(validateConsultationPatient(patient), []);
});

test('Samuel opens with three different lines of inquiry and work unlocks the toxic exposure', () => {
  let state = begin();
  assert.deepEqual(availableDialoguePrompts(patient, state).map((item) => item.id), [
    'samuel-ask-course', 'samuel-ask-bowels', 'samuel-ask-bereavement',
  ]);
  state = ask(state, 'samuel-ask-course');
  assert.deepEqual(availableDialoguePrompts(patient, state).map((item) => item.id), [
    'samuel-ask-work', 'samuel-ask-bowels', 'samuel-ask-bereavement',
  ]);
  state = ask(state, 'samuel-ask-work');
  assert.ok(state.disclosedFactIds.includes('samuel-metal-work'));
  assert.ok(state.disclosedFactIds.includes('samuel-shop-hygiene'));
  assert.match(state.history.at(-1).dialogue, /metal pot/);
});

test('the foreman question forces a consequential response before clue collection continues', () => {
  let state = begin();
  state = ask(state, 'samuel-ask-course');
  state = ask(state, 'samuel-ask-work');
  assert.equal(state.pendingResponseId, 'samuel-foreman-question');
  assert.deepEqual(availableDialoguePrompts(patient, state).map((item) => item.id), [
    'samuel-response-test', 'samuel-response-moralize', 'samuel-response-certain',
  ]);
  assert.deepEqual(actorCueForConsultation(state), {
    body: 'sitting-disapproval', expression: 'frowning', gaze: 'doctor', speaking: true,
  });

  const rejected = consultationTransition(state, patient, { type: 'examine', id: 'samuel-exam-mouth-hands' });
  assert.match(rejected.errors.at(-1), /respond to the patient/);
  state = ask(state, 'samuel-response-test');
  assert.equal(state.pendingResponseId, null);
  assert.match(state.history.at(-1).dialogue, /Test the matter/);
  assert.deepEqual(actorCueForConsultation(state), {
    body: 'sitting-talking', expression: 'smiling', gaze: 'doctor', speaking: true,
  });
});

test('the strong Samuel route reaches a decision in twenty-three minutes without exhausting his history', () => {
  const state = focusedEvidence();
  assert.equal(state.elapsedMinutes, 23);
  assert.equal(state.history.filter((event) => event.kind === 'speech' && event.countsAsQuestion !== false).length, 4);
  assert.equal(state.observedFactIds.length, 3);
  assert.ok(state.disclosedFactIds.includes('samuel-income'));
  assert.ok(!state.disclosedFactIds.includes('samuel-bereavement'));
  assert.ok(!state.disclosedFactIds.includes('samuel-safety'));
});

test('the physical clue cluster promotes chronic plumbism while retaining plausible period alternatives', () => {
  const diagnoses = availableDiagnoses(patient, focusedEvidence());
  assert.equal(diagnoses[0].id, 'samuel-dx-lead');
  assert.ok(diagnoses.some((item) => item.id === 'samuel-dx-neurasthenia'));
  assert.ok(diagnoses.some((item) => item.id === 'samuel-dx-melancholia'));
});

test('source control and clean reassignment produce full payment and meaningful recovery', () => {
  const result = finish(
    focusedEvidence(),
    'samuel-dx-lead',
    'samuel-tx-reassign',
    ['samuel-metal-work', 'samuel-digestion', 'samuel-gum-line'],
  );
  assert.equal(result.stage, 'result');
  assert.equal(result.caseNote, '');
  assert.equal(result.result.summary.minutesUsed, 23);
  assert.equal(result.result.summary.questionsAsked, 4);
  assert.equal(result.result.summary.examinationsPerformed, 2);
  assert.equal(result.result.immediate.paymentCents, 300);
  assert.ok(result.result.oneMonth.healthChange > 0);
  assert.match(result.result.oneMonth.narrative, /proofs and press records/);
});

test('a humane mood-only plan can satisfy Samuel immediately while the missed exposure worsens him', () => {
  let state = begin();
  for (const id of [
    'samuel-ask-course', 'samuel-ask-bereavement', 'samuel-ask-safety',
    'samuel-ask-work', 'samuel-response-test',
  ]) state = ask(state, id);
  const result = finish(
    state,
    'samuel-dx-melancholia',
    'samuel-tx-companionship',
    ['samuel-course', 'samuel-bereavement', 'samuel-safety'],
  );
  assert.equal(result.result.immediate.paymentCents, 300);
  assert.ok(result.result.immediate.satisfactionOutOfTen >= 7);
  assert.ok(result.result.oneMonth.healthChange < 0);
  assert.match(result.result.oneMonth.narrative, /wrists gave way/);
});

test('moralizing and seclusion damage trust, satisfaction, and payment', () => {
  let state = begin();
  state = ask(state, 'samuel-ask-course');
  state = ask(state, 'samuel-ask-work');
  state = ask(state, 'samuel-response-moralize');
  state = ask(state, 'samuel-ask-bowels');
  state = consultationTransition(state, patient, { type: 'examine', id: 'samuel-exam-mouth-hands' });
  const result = finish(
    state,
    'samuel-dx-melancholia',
    'samuel-tx-seclusion',
    ['samuel-metal-work', 'samuel-digestion', 'samuel-gum-line'],
  );
  assert.equal(result.result.immediate.paymentCents, 150);
  assert.ok(result.result.immediate.satisfactionOutOfTen < 5);
  assert.ok(result.result.oneMonth.functionChange < 0);
});
