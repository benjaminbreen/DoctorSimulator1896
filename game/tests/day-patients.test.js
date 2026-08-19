import assert from 'node:assert/strict';
import test from 'node:test';
import { createDayPatients } from '../src/consultation/technicalPatients.js';
import { createConsultationPatients, NORA_BYRNE } from '../src/consultation/patients.js';
import { consultationTransition, startConsultation, buildDialogueRequest } from '../src/consultation/engine.js';
import { renderOfflineDialogue } from '../src/consultation/offlineRenderer.js';

test('day one is authored; later days roll distinct procedural casts', () => {
  assert.equal(createConsultationPatients()[0], NORA_BYRNE);
  const day2 = createConsultationPatients({ daySeed: 77, dayIndex: 2 });
  const day3 = createConsultationPatients({ daySeed: 78, dayIndex: 3 });
  assert.equal(day2.length, 4);
  assert.notDeepEqual(day2.map((p) => p.label), day3.map((p) => p.label));
  // Ids carry the day, so casebook records never collide across days.
  assert.ok(day2.every((p) => p.id.startsWith('day2-')));
  assert.ok(day3.every((p) => p.id.startsWith('day3-')));
});

test('a rolled cast is deterministic per seed', () => {
  const a = createDayPatients({ daySeed: 42, dayIndex: 2 });
  const b = createDayPatients({ daySeed: 42, dayIndex: 2 });
  assert.deepEqual(a.map((p) => p.label), b.map((p) => p.label));
});

test('a street referral takes the first slot under her mother’s name', () => {
  const cast = createDayPatients({
    daySeed: 5, dayIndex: 2, referral: { matronName: 'Maud Price', familyName: 'Price' },
  });
  const daughter = cast[0];
  assert.equal(daughter.profile.identity.familyName, 'Price');
  assert.equal(daughter.profile.identity.title, 'Miss');
  assert.equal(daughter.profile.identity.sex, 'female');
  assert.match(daughter.opening.behavior, /her mother, Mrs\. Price/);
});

test('a procedural patient can be played to a paid result', () => {
  const [patient] = createDayPatients({ daySeed: 9, dayIndex: 2 });
  assert.ok(patient.outcomeModel, 'generated patients carry an outcome model');
  assert.ok(patient.outcomeModel.fee.full > 0);

  let state = consultationTransition(startConsultation(patient), patient, { type: 'begin-inquiry' });
  state = consultationTransition(state, patient, { type: 'interpret', id: 'read-history-first' });
  // Ask the authored openers, then examine: the initial round before Luna.
  for (const prompt of patient.prompts.filter((p) => p.stance === 'question')) {
    const input = { promptId: prompt.id, text: prompt.text, stance: prompt.stance };
    const request = buildDialogueRequest(patient, state, input);
    state = consultationTransition(state, patient, {
      type: 'speech-response', input, response: renderOfflineDialogue(request, patient),
    });
  }
  state = consultationTransition(state, patient, { type: 'examine', id: patient.examinations[0].id });
  state = consultationTransition(state, patient, { type: 'begin-decision' });
  state = consultationTransition(state, patient, { type: 'select-diagnosis', id: patient.diagnoses[0].id });
  state = consultationTransition(state, patient, { type: 'select-treatment', id: 'rest-hour-lying' });
  state = consultationTransition(state, patient, { type: 'begin-case-note' });
  state = consultationTransition(state, patient, { type: 'write-case-note', text: 'Notes on the case.' });
  state = consultationTransition(state, patient, { type: 'submit-case-note' });

  assert.equal(state.stage, 'result');
  assert.ok(state.result, 'the consultation resolves');
  assert.ok(Number(state.result.immediate.paymentCents) > 0, 'the visit is paid');
  assert.ok(state.result.modernDebrief.length > 20, 'a modern debrief exists');
});
