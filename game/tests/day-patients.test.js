import assert from 'node:assert/strict';
import test from 'node:test';
import { createDayPatients } from '../src/consultation/technicalPatients.js';
import {
  AUTHORED_PATIENT_POOL,
  FERDINAND_DE_CHAPUYS,
  createConsultationPatients,
} from '../src/consultation/patients.js';
import { validateConsultationPatient } from '../src/consultation/contract.js';
import { consultationTransition, startConsultation, buildDialogueRequest } from '../src/consultation/engine.js';
import { renderOfflineDialogue } from '../src/consultation/offlineRenderer.js';

test('every day, including day one, rolls a procedural cast', () => {
  const day1 = createConsultationPatients({ daySeed: 77, dayIndex: 0, count: 3 });
  assert.equal(day1.length, 3);
  assert.ok(day1.every((patient) => patient.contentStatus === 'procedural' && patient.id.startsWith('day0-')));
  const day2 = createConsultationPatients({ daySeed: 77, dayIndex: 2 });
  const day3 = createConsultationPatients({ daySeed: 78, dayIndex: 3 });
  assert.equal(day2.length, 4);
  assert.notDeepEqual(day2.map((p) => p.label), day3.map((p) => p.label));
  // Ids carry the day, so casebook records never collide across days.
  assert.ok(day2.every((p) => p.id.startsWith('day2-')));
  assert.ok(day3.every((p) => p.id.startsWith('day3-')));
});

test('every patient eligible for day one satisfies the authored contract', () => {
  for (const patient of AUTHORED_PATIENT_POOL) {
    assert.deepEqual(validateConsultationPatient(patient), [], patient.id);
  }
});

test('the authored playtest draw is deterministic and can include Chapuys', () => {
  const first = createConsultationPatients({ daySeed: 42, dayIndex: 0, count: 3, authored: true });
  const again = createConsultationPatients({ daySeed: 42, dayIndex: 0, count: 3, authored: true });
  assert.deepEqual(first.map((patient) => patient.id), again.map((patient) => patient.id));

  const seen = new Set();
  for (let daySeed = 1; daySeed <= 40; daySeed += 1) {
    for (const patient of createConsultationPatients({ daySeed, dayIndex: 0, count: 3, authored: true })) seen.add(patient);
  }
  assert.ok(seen.has(FERDINAND_DE_CHAPUYS));
  assert.equal(seen.size, AUTHORED_PATIENT_POOL.length);
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
