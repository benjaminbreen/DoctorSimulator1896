import test from 'node:test';
import assert from 'node:assert/strict';
import { CARMELA_RUSSO as patient } from '../src/consultation/patients.js';
import { actorCueForConsultation, buildDialogueRequest, consultationTransition, startConsultation } from '../src/consultation/engine.js';
import { renderOfflineDialogue } from '../src/consultation/offlineRenderer.js';
import { buildJamesModelPayload } from '../src/consultation/modelBoundary.js';
import { getPatientRecord, syncConsultationRecord } from '../src/hud/casebookState.js';

const act = (state, type, id) => consultationTransition(state, patient, { type, id });
function prescribe(treatmentId = 'drug-stop-tonic') {
  let state = act(startConsultation(patient), 'begin-inquiry');
  for (const id of ['carmela-ask-pattern', 'carmela-ask-tonics']) {
    const prompt = patient.prompts.find(item => item.id === id);
    const input = { promptId: id, text: prompt.text, stance: prompt.stance };
    state = consultationTransition(state, patient, {
      type: 'speech-response', input, response: renderOfflineDialogue(buildDialogueRequest(patient, state, input), patient),
    });
  }
  state = act(state, 'begin-decision');
  state = act(state, 'select-diagnosis', 'carmela-dx-nervous-coca');
  return act(state, 'select-treatment', treatmentId);
}
function agree(state, responses) {
  state = act(state, 'begin-case-note');
  for (const id of responses) state = act(state, 'respond-treatment', id);
  return state;
}
function finish(state) {
  state = act(state, 'begin-case-note');
  state = act(state, 'select-record-fact', 'carmela-episode-pattern');
  return act(state, 'submit-case-note');
}

test('the discussion reveals practical constraints and records the agreed plan before signing', () => {
  const selected = prescribe();
  let state = act(selected, 'begin-case-note');
  assert.equal(state.stage, 'treatment-discussion');
  assert.equal(act(state, 'submit-case-note').stage, 'treatment-discussion');
  assert.match(act(state, 'respond-treatment', 'gradual').errors.at(-1), /current treatment concern/);
  state = act(state, 'respond-treatment', 'work');
  assert.ok(state.disclosedFactIds.includes('carmela-shop-stakes'));
  assert.equal(actorCueForConsultation(state).expression, 'guarded');
  state = act(state, 'respond-treatment', 'gradual');
  assert.equal(state.treatmentAgreement.id, 'gradual-counter');
  assert.equal(state.elapsedMinutes, selected.elapsedMinutes);
  assert.equal(finish(state).stage, 'result');
});

test('trial, immediate support and a slower start have different outcomes and return accounts', () => {
  const selected = prescribe();
  const trial = finish(agree(selected, ['trial']));
  const gradual = finish(agree(selected, ['work', 'gradual']));
  const supported = finish(agree(selected, ['work', 'supported']));
  assert.ok(trial.result.oneMonth.recovery < gradual.result.oneMonth.recovery);
  assert.ok(supported.result.oneMonth.cost < gradual.result.oneMonth.cost);
  assert.ok(supported.result.immediate.satisfaction > gradual.result.immediate.satisfaction);
  assert.notEqual(trial.result.returnVisit.opening, gradual.result.returnVisit.opening);
  assert.match(trial.result.returnVisit.questions.find(q => q.id === 'shop').dialogue, /Elena/);
  assert.match(gradual.result.agreedPlan, /one customer/);
});

test('declined rest is not scored as if she closed the shop, and the doctor can change the plan', () => {
  const rest = act(prescribe('rest-cure-home'), 'begin-case-note');
  const revised = act(rest, 'respond-treatment', 'revise');
  assert.equal(revised.stage, 'decision');
  assert.equal(revised.treatmentAgreement, null);
  const declined = finish(act(rest, 'respond-treatment', 'insist'));
  assert.equal(declined.result.oneMonth.cost, 0);
  assert.match(declined.result.oneMonth.narrative, /did not take/);
  assert.match(declined.result.returnVisit.opening, /couldn’t close the shop/);
});

test('changed and contradictory prescriptions must be discussed again', () => {
  let state = agree(prescribe(), ['trial']);
  state = act(state, 'revise-treatment');
  state = act(state, 'select-treatment', 'drug-coca-wine');
  assert.equal(state.treatmentAgreement, null);
  state = act(state, 'begin-case-note');
  assert.equal(state.discussionStep, 'conflicting-wine');
  assert.equal(act(state, 'respond-treatment', 'trial').treatmentAgreement, null);
  state = act(state, 'respond-treatment', 'revise');
  state = act(state, 'select-treatment', 'drug-coca-wine');
  assert.equal(act(state, 'begin-case-note').discussionStep, 'wine');
});

test('a second medicine keeps its effects and does not inherit the single-treatment return story', () => {
  let state = act(prescribe(), 'select-treatment', 'drug-digitalis');
  state = finish(agree(state, ['work', 'gradual']));
  assert.ok(state.result.oneMonth.recovery < 10);
  assert.doesNotMatch(state.result.returnVisit.opening, /twelve days/);
  assert.match(state.result.oneMonth.narrative, /nausea/i);
});

test('the return visit preserves the result, time, original transcript and one completed casebook visit', () => {
  const values = new Map();
  const storage = { getItem: k => values.get(k) ?? null, setItem: (k, v) => values.set(k, v) };
  const stamp = { date: { year: 1896, month: 6, date: 15 }, hours: 10 };
  let state = agree(prescribe(), ['work', 'gradual']);
  syncConsultationRecord(patient, state, stamp, storage);
  state = finish(state);
  syncConsultationRecord(patient, state, stamp, storage);
  const result = state.result;
  const transcript = buildJamesModelPayload(patient, state, result).record.transcript;
  const minutes = state.elapsedMinutes;
  state = act(state, 'begin-return-visit');
  assert.equal(state.stage, 'return-visit');
  assert.match(act(state, 'discuss-return-plan').errors.at(-1), /ask how/);
  state = act(state, 'ask-return-visit', 'shop');
  syncConsultationRecord(patient, state, { ...stamp, hours: 10.5 }, storage);
  assert.equal(act(state, 'ask-return-visit', 'shop').returnVisit.asked.length, 1);
  state = act(state, 'discuss-return-plan');
  state = act(state, 'agree-return-plan', 'reassess');
  assert.equal(state.returnVisit.phase, 'complete');
  state = act(state, 'end-return-visit');
  syncConsultationRecord(patient, state, { ...stamp, hours: 10.75 }, storage);
  assert.equal(state.result, result);
  assert.equal(state.elapsedMinutes, minutes);
  assert.deepEqual(buildJamesModelPayload(patient, state, result).record.transcript, transcript);
  const visits = getPatientRecord(patient, storage).visits;
  assert.equal(visits.length, 1);
  assert.equal(visits[0].status, 'complete');
  assert.ok(visits[0].observations.some(entry => entry.label === 'One-month review (look ahead)'));
  assert.match(visits[0].agreedPlan, /one customer/);
});
