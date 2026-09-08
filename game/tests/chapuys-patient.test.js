import test from 'node:test';
import assert from 'node:assert/strict';
import { AUTHORED_PATIENT_POOL, FERDINAND_DE_CHAPUYS } from '../src/consultation/patients.js';
import { validateConsultationPatient } from '../src/consultation/contract.js';
import {
  actorCueForConsultation,
  buildDialogueRequest,
  consultationTransition,
  startConsultation,
} from '../src/consultation/engine.js';
import { renderOfflineDialogue } from '../src/consultation/offlineRenderer.js';
import { availableDiagnoses, availableDialoguePrompts } from '../src/consultation/patientLogic.js';

const patient = FERDINAND_DE_CHAPUYS;

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
  state = consultationTransition(state, patient, { type: 'interpret', id: 'chapuys-approach-automatism' });
  for (const id of [
    'chapuys-ask-sequence',
    'chapuys-ask-witnesses',
    'chapuys-ask-pattern',
    'chapuys-response-evidence',
    'chapuys-ask-galvanism',
    'chapuys-ask-family',
  ]) state = ask(state, id);
  state = consultationTransition(state, patient, { type: 'examine', id: 'chapuys-exam-neurologic' });
  return consultationTransition(state, patient, { type: 'examine', id: 'chapuys-exam-general' });
}

function finish(state, diagnosisId, treatmentId, factIds) {
  state = consultationTransition(state, patient, { type: 'begin-decision' });
  state = consultationTransition(state, patient, { type: 'select-diagnosis', id: diagnosisId });
  state = consultationTransition(state, patient, { type: 'select-treatment', id: treatmentId });
  state = consultationTransition(state, patient, { type: 'begin-case-note' });
  for (const id of factIds) state = consultationTransition(state, patient, { type: 'select-record-fact', id });
  return consultationTransition(state, patient, { type: 'submit-case-note' });
}

test('Chapuys is a complete Savoyard authored patient with the wine-merchant model', () => {
  assert.ok(AUTHORED_PATIENT_POOL.includes(patient));
  assert.equal(patient.profile.identity.origin.id, 'savoyard-french');
  assert.equal(patient.profile.identity.migration.birthplace, 'near Chambéry, Savoie');
  assert.equal(patient.profile.social.occupationId, 'wine-merchant');
  assert.equal(patient.actor.recipe.asset.path, '/models/characters/wine-merchant.glb?v=1');
  assert.deepEqual(patient.actor.recipe.asset.motionClips, ['ClinicIdle', 'StandingIdle']);
  assert.match(patient.opening.dialogue, /simply be \*absent\*/);
  assert.match(patient.dialogueStyle, /Markdown italics/);
  assert.deepEqual(validateConsultationPatient(patient), []);
});

test('his opening affords chronology, prior treatment, and practical stakes', () => {
  let state = begin();
  assert.deepEqual(availableDialoguePrompts(patient, state).map((item) => item.id), [
    'chapuys-ask-sequence',
    'chapuys-ask-galvanism',
    'chapuys-ask-family',
  ]);

  state = ask(state, 'chapuys-ask-sequence');
  assert.ok(state.disclosedFactIds.includes('chapuys-last-episode'));
  assert.ok(state.disclosedFactIds.includes('chapuys-professional-access'));
  assert.deepEqual(availableDialoguePrompts(patient, state).map((item) => item.id), [
    'chapuys-ask-witnesses',
    'chapuys-ask-pattern',
    'chapuys-ask-seizure',
  ]);
});

test('the sober-interval challenge requires a consequential answer', () => {
  let state = begin();
  state = ask(state, 'chapuys-ask-sequence');
  state = ask(state, 'chapuys-ask-pattern');
  assert.equal(state.pendingResponseId, 'chapuys-interval-question');
  assert.deepEqual(availableDialoguePrompts(patient, state).map((item) => item.id), [
    'chapuys-response-evidence',
    'chapuys-response-moralize',
    'chapuys-response-nerves',
  ]);
  assert.deepEqual(actorCueForConsultation(state), {
    body: 'sitting-disapproval', expression: 'frowning', gaze: 'doctor', speaking: true,
  });

  const blocked = consultationTransition(state, patient, { type: 'examine', id: 'chapuys-exam-neurologic' });
  assert.match(blocked.errors.at(-1), /respond to the patient/);
  state = ask(state, 'chapuys-response-evidence');
  assert.equal(state.pendingResponseId, null);
  assert.ok(state.trust > patient.initialTrust);
});

test('a focused evidence route finishes in twenty-seven minutes', () => {
  const state = focusedEvidence();
  assert.equal(state.elapsedMinutes, 27);
  assert.equal(state.history.filter((event) => event.kind === 'speech' && event.countsAsQuestion !== false).length, 5);
  assert.equal(state.observedFactIds.length, 2);
  assert.ok(state.disclosedFactIds.includes('chapuys-witnessed-activity'));
  assert.ok(state.disclosedFactIds.includes('chapuys-prodrome'));
  assert.equal(availableDiagnoses(patient, state)[0].id, 'chapuys-dx-periodic-inebriety');
});

test('a flattering nervous explanation feels better immediately but protects him less', () => {
  const good = finish(
    focusedEvidence(),
    'chapuys-dx-periodic-inebriety',
    'diet-abstinence',
    ['chapuys-last-episode', 'chapuys-witnessed-activity', 'chapuys-prodrome'],
  );

  let flattering = begin();
  flattering = consultationTransition(flattering, patient, { type: 'interpret', id: 'chapuys-approach-nerves' });
  for (const id of [
    'chapuys-ask-sequence',
    'chapuys-ask-pattern',
    'chapuys-response-nerves',
    'chapuys-ask-galvanism',
    'chapuys-ask-family',
  ]) flattering = ask(flattering, id);
  flattering = consultationTransition(flattering, patient, { type: 'examine', id: 'chapuys-exam-neurologic' });
  flattering = finish(
    flattering,
    'chapuys-dx-neurasthenia',
    'elec-galvanization',
    ['chapuys-missing-days', 'chapuys-galvanism', 'chapuys-family-stakes'],
  );

  assert.equal(good.result.oneMonth.band, 'improved');
  assert.equal(flattering.result.oneMonth.band, 'little-change');
  assert.ok(flattering.result.immediate.satisfaction > good.result.immediate.satisfaction);
  assert.ok(good.result.scores.diagnosis > flattering.result.scores.diagnosis);
});
