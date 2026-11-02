import assert from 'node:assert/strict';
import test from 'node:test';
import { CONDITIONS } from '../../shared/patients/cases/conditions.js';
import { createCasePatient, createCaseDayPatients, voiceCasePatient } from '../src/consultation/casePatients.js';
import { cleanVoice, requestPatientVoice } from '../src/consultation/patientVoice.js';
import { validateConsultationPatient } from '../src/consultation/contract.js';
import { consultationTransition, startConsultation, buildDialogueRequest } from '../src/consultation/engine.js';
import { availableDialoguePrompts, availableExaminations } from '../src/consultation/patientLogic.js';
import { renderOfflineDialogue } from '../src/consultation/offlineRenderer.js';

const SEEDS = Array.from({ length: 25 }, (_, index) => 1000 + index * 7919);

function say(state, patient, prompt) {
  const input = { promptId: prompt.id, text: prompt.text, stance: prompt.stance };
  if (state.pendingResponseId) input.responseTo = state.pendingResponseId;
  const request = buildDialogueRequest(patient, state, input);
  return consultationTransition(state, patient, {
    type: 'speech-response', input, response: renderOfflineDialogue(request, patient),
  });
}

test('every condition assembles valid, fully filled patients across seeds', () => {
  for (const condition of CONDITIONS) {
    for (const seed of SEEDS) {
      const patient = createCasePatient(condition.id, { id: `t-${condition.id}`, seed });
      assert.deepEqual(validateConsultationPatient(patient), [], `${condition.id} seed ${seed}`);
      const text = JSON.stringify({ ...patient, actor: null });
      assert.doesNotMatch(text, /\{[a-zA-Z]+\}/, `${condition.id} seed ${seed} has an unfilled placeholder`);
    }
  }
});

test('a condition can be played offline from the three choices to a paid result', () => {
  for (const condition of CONDITIONS) {
    const patient = createCasePatient(condition.id, { id: `p-${condition.id}`, seed: 4242 });
    let state = consultationTransition(startConsultation(patient), patient, { type: 'begin-inquiry' });
    // Always take the first offered choice, as a hurried player would.
    for (let turn = 0; turn < 12; turn += 1) {
      const [prompt] = availableDialoguePrompts(patient, state);
      if (!prompt) break;
      state = say(state, patient, prompt);
      assert.equal(state.errors.length, 0, `${condition.id}: ${state.errors.at(-1)}`);
    }
    for (const exam of availableExaminations(patient, state)) {
      state = consultationTransition(state, patient, { type: 'examine', id: exam.id });
    }
    const known = new Set([...state.disclosedFactIds, ...state.observedFactIds]);
    assert.ok(patient.outcomeModel.criticalFactIds.some((id) => known.has(id)), `${condition.id}: no critical fact reachable`);
    state = consultationTransition(state, patient, { type: 'begin-decision' });
    state = consultationTransition(state, patient, { type: 'select-diagnosis', id: patient.diagnoses[0].id });
    state = consultationTransition(state, patient, { type: 'select-treatment', id: Object.keys(patient.treatmentOverrides)[0] });
    state = consultationTransition(state, patient, { type: 'begin-case-note' });
    state = consultationTransition(state, patient, { type: 'select-record-fact', id: [...known][0] });
    state = consultationTransition(state, patient, { type: 'write-case-note', text: 'Notes.' });
    state = consultationTransition(state, patient, { type: 'submit-case-note' });
    assert.equal(state.stage, 'result', `${condition.id}: ${state.errors.at(-1)}`);
    assert.ok(state.result.immediate.paymentCents > 0);
  }
});

test('a case day is deterministic, varied, and keeps the referral rules', () => {
  const a = createCaseDayPatients({ daySeed: 42, dayIndex: 2 });
  const b = createCaseDayPatients({ daySeed: 42, dayIndex: 2 });
  assert.deepEqual(a.map((p) => p.label), b.map((p) => p.label));
  assert.equal(new Set(a.map((p) => p.conditionId)).size, a.length);
  const [daughter] = createCaseDayPatients({ daySeed: 5, dayIndex: 2, referral: { familyName: 'Price' } });
  assert.equal(daughter.profile.identity.fullName.split(' ').at(-1), 'Price');
  assert.equal(daughter.profile.identity.sex, 'female');
  assert.match(daughter.opening.behavior, /her mother, Mrs\. Price/);
});

test('a voice pass changes wording only, and replies follow the voiced facts', () => {
  const patient = createCasePatient('occupational-cramp', { id: 'v', seed: 1234 });
  const voice = Object.fromEntries(patient.voiceLines.map((line) => [line.id, `VOICED ${line.id}`]));
  const voiced = voiceCasePatient(patient, voice);
  assert.deepEqual(validateConsultationPatient(voiced), []);
  assert.deepEqual(voiced.facts.map((fact) => fact.value), patient.facts.map((fact) => fact.value));
  assert.deepEqual(voiced.prompts.map((prompt) => [prompt.id, prompt.effects, prompt.discloseFactIds]),
    patient.prompts.map((prompt) => [prompt.id, prompt.effects, prompt.discloseFactIds]));
  const ask = voiced.prompts.find((prompt) => prompt.id === 'v-ask-course');
  assert.equal(ask.text, 'VOICED choice:ask-course');
  assert.match(ask.dialogue, /VOICED fact:spread/);
  assert.equal(voiced.actor, patient.actor);
  assert.equal(voiceCasePatient(patient, null), patient);
});

test('model voice is filtered to known lines and sane text', async () => {
  const lines = [{ id: 'opening', text: 'My hand hurts.' }, { id: 'fact:a', text: 'It began in May.' }];
  const voice = cleanVoice(lines, { lines: [
    { id: 'opening', text: '“My hand is bad, Doctor.”' },
    { id: 'fact:a', text: 'It began in {month}.' },
    { id: 'fact:invented', text: 'My brother died of it.' },
  ] });
  assert.deepEqual(voice, { opening: 'My hand is bad, Doctor.' });
  assert.equal(cleanVoice(lines, { lines: [{ id: 'opening', text: 'x'.repeat(500) }] }), null);

  const patient = createCasePatient('functional-cough', { id: 'w', seed: 77 });
  const reply = { lines: [{ id: 'opening', text: 'This cough, sir. It won’t leave me be.' }] };
  const fetched = await requestPatientVoice(patient, async () => ({ ok: true, json: async () => reply }));
  assert.equal(voiceCasePatient(patient, fetched).opening.dialogue, '“This cough, sir. It won’t leave me be.”');
  const other = createCasePatient('functional-cough', { id: 'w2', seed: 78 });
  assert.equal(await requestPatientVoice(other, async () => { throw new Error('offline'); }), null);
});
