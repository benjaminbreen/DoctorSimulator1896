import test from 'node:test';
import assert from 'node:assert/strict';
import {
  actorCueForConsultation,
  buildDialogueRequest,
  consultationTransition,
  createConsultationRuntime,
  startConsultation,
} from '../src/consultation/engine.js';
import { renderOfflineDialogue } from '../src/consultation/offlineRenderer.js';
import { createTechnicalPatients, TECHNICAL_PATIENTS } from '../src/consultation/technicalPatients.js';
import { validateConsultationPatient } from '../src/consultation/contract.js';

const patient = TECHNICAL_PATIENTS[0];

function beginInquiry() {
  return consultationTransition(startConsultation(patient), patient, { type: 'begin-inquiry' });
}

test('all three technical patients satisfy the consultation contract', () => {
  assert.equal(TECHNICAL_PATIENTS.length, 3);
  for (const fixture of TECHNICAL_PATIENTS) {
    assert.equal(fixture.contentStatus, 'technical-fixture');
    assert.equal(fixture.profileStatus, 'draft-procedural');
    assert.doesNotMatch(fixture.label, /technical patient/i);
    assert.equal(fixture.actor.recipe.identitySeed, fixture.profile.seed);
    assert.equal(fixture.actor.recipe.cohort, fixture.profile.identity.sex === 'male' ? 'men' : 'women');
    assert.deepEqual(validateConsultationPatient(fixture), []);
    assert.deepEqual(fixture.actor.recipe.placement.position, [0.45, 0, -1.7]);
  }
});

test('patient profile and appearance generation is reproducible but rerollable', () => {
  const first = createTechnicalPatients([2273, 4819, 4816]);
  const same = createTechnicalPatients([2273, 4819, 4816]);
  const rerolled = createTechnicalPatients([2274, 4820, 4817]);
  assert.deepEqual(first.map((item) => item.profile), same.map((item) => item.profile));
  assert.deepEqual(first.map((item) => item.actor.recipe), same.map((item) => item.actor.recipe));
  assert.notEqual(first[0].label, rerolled[0].label);
  assert.notDeepEqual(first[0].actor.recipe.values, rerolled[0].actor.recipe.values);
});

test('foreign-born profiles retain a coherent migration record', () => {
  const patient = TECHNICAL_PATIENTS[0].profile;
  assert.equal(patient.identity.origin.id, 'irish-american');
  assert.equal(patient.identity.migration.birthplace, 'Ireland');
  assert.ok(patient.identity.migration.arrivalAge < patient.identity.age);
  assert.equal(
    patient.identity.migration.arrivalYear,
    patient.setting.year - patient.identity.age + patient.identity.migration.arrivalAge,
  );
});

test('private interpretation records a hypothesis without advancing time', () => {
  const state = beginInquiry();
  const next = consultationTransition(state, patient, { type: 'interpret', id: 'read-distress' });
  assert.equal(next.elapsedMinutes, 0);
  assert.deepEqual(next.interpretationIds, ['read-distress']);
  assert.equal(next.history.at(-1).kind, 'interpretation');
});

test('offline dialogue discloses only a fact earned by the current question', () => {
  const state = beginInquiry();
  const input = { stance: 'question', text: 'What happens when you try to sleep at night?' };
  const request = buildDialogueRequest(patient, state, input);
  assert.deepEqual(request.allowedDisclosureIds, ['a-sleep']);
  const response = renderOfflineDialogue(request, patient);
  const next = consultationTransition(state, patient, { type: 'speech-response', input, response });
  assert.equal(next.elapsedMinutes, 5);
  assert.ok(next.disclosedFactIds.includes('a-sleep'));
  assert.equal(next.history.at(-1).disclosedNow[0], 'a-sleep');
  assert.equal(actorCueForConsultation(next).speaking, true);
});

test('the sim rejects an LLM attempt to disclose an unearned fact', () => {
  const state = beginInquiry();
  const next = consultationTransition(state, patient, {
    type: 'speech-response',
    input: { stance: 'question', text: 'How are you today?' },
    response: {
      dialogue: '“There is nothing else.”',
      disclosedNow: ['a-pulse'],
      appraisal: { register: 'neutral', decorumBreach: 0, intent: 'question', terminates: false },
    },
  });
  assert.equal(next.disclosedFactIds.includes('a-pulse'), false);
  assert.match(next.errors.at(-1), /unauthorized disclosure/);
});

test('examination advances time and records a deterministic observation', () => {
  const state = beginInquiry();
  const next = consultationTransition(state, patient, { type: 'examine', id: 'a-check-hands' });
  assert.equal(next.elapsedMinutes, 3);
  assert.ok(next.observedFactIds.includes('a-tremor'));
  assert.equal(next.history.at(-1).fact.value, 'Fine tremor at rest');
  assert.deepEqual(actorCueForConsultation(next), {
    body: 'clinic-idle', expression: 'guarded', gaze: 'doctor', speaking: false,
  });
});

test('a complete consultation reaches distinct reputation and record ledgers', () => {
  let state = beginInquiry();
  state = consultationTransition(state, patient, { type: 'examine', id: 'a-check-hands' });
  const input = { stance: 'reassure', text: 'Please tell me what happens when you sleep and wake at night.' };
  state = consultationTransition(state, patient, {
    type: 'speech-response', input,
    response: renderOfflineDialogue(buildDialogueRequest(patient, state, input), patient),
  });
  state = consultationTransition(state, patient, { type: 'begin-decision' });
  state = consultationTransition(state, patient, { type: 'select-diagnosis', id: 'a-diagnosis-1' });
  state = consultationTransition(state, patient, { type: 'select-treatment', id: 'a-treatment-1' });
  state = consultationTransition(state, patient, { type: 'begin-case-note' });
  state = consultationTransition(state, patient, {
    type: 'write-case-note',
    text: 'Repeated waking interrupts sleep, while a fine hand tremor remains visible at rest during examination today.',
  });
  state = consultationTransition(state, patient, { type: 'submit-case-note' });
  assert.equal(state.stage, 'result');
  assert.deepEqual(state.result, {
    reputation: 12,
    record: 4,
    noteCoverage: 100,
    diagnosisId: 'a-diagnosis-1',
    treatmentId: 'a-treatment-1',
  });
});

test('the runtime publishes states and its offline renderer is deterministic', () => {
  const runtime = createConsultationRuntime(TECHNICAL_PATIENTS, renderOfflineDialogue);
  const snapshots = [];
  const unsubscribe = runtime.subscribe((state) => snapshots.push(state));
  runtime.start('technical-b');
  runtime.dispatch({ type: 'begin-inquiry' });
  const first = runtime.speak({ stance: 'question', text: 'Does bright light trouble you?' });
  unsubscribe();
  assert.equal(snapshots.length, 3);
  assert.ok(first.disclosedFactIds.includes('b-light'));
  const request = buildDialogueRequest(TECHNICAL_PATIENTS[1], beginInquiry(), { stance: 'question', text: 'bright light' });
  assert.deepEqual(renderOfflineDialogue(request, TECHNICAL_PATIENTS[1]), renderOfflineDialogue(request, TECHNICAL_PATIENTS[1]));
});

test('the runtime can return to patient selection', () => {
  const runtime = createConsultationRuntime(TECHNICAL_PATIENTS, renderOfflineDialogue);
  const snapshots = [];
  const unsubscribe = runtime.subscribe((state) => snapshots.push(state));
  runtime.start('technical-a');
  assert.equal(runtime.get().patientId, 'technical-a');
  assert.equal(runtime.reset(), null);
  assert.equal(runtime.get(), null);
  assert.equal(snapshots.at(-1), null);
  unsubscribe();
});

test('a severe decorum breach ends the consultation without letting the LLM set trust directly', () => {
  const state = beginInquiry();
  const input = { stance: 'challenge', text: 'You are a liar.' };
  const response = renderOfflineDialogue(buildDialogueRequest(patient, state, input), patient);
  const next = consultationTransition(state, patient, { type: 'speech-response', input, response });
  assert.equal(next.stage, 'terminated');
  assert.equal(next.trust, 5);
  assert.equal(actorCueForConsultation(next).body, 'stand-up');
});
