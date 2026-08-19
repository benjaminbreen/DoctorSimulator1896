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
import { buildCaseNotebook } from '../src/consultation/caseNotebook.js';

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
    assert.equal(fixture.actor.recipe.placement.position[0], 0.45);
    assert.equal(fixture.actor.recipe.placement.position[2], -1.7);
    assert.equal(fixture.actor.recipe.placement.rotation[1], Math.PI);
  }
});

test('Samuel faces the doctor from the seated clinic pose with his tuned complexion', () => {
  const samuel = TECHNICAL_PATIENTS[1];
  assert.equal(samuel.label, 'Mr. Samuel Taylor');
  assert.equal(samuel.actor.recipe.animation.body, 'clinic-idle');
  assert.deepEqual(samuel.actor.recipe.placement, {
    position: [0.45, 0.22, -1.7],
    rotation: [0, Math.PI, 0],
    scale: 1,
  });
  assert.equal(samuel.actor.recipe.values.skinTone, '#afa59b');
  assert.equal(samuel.actor.recipe.presentation.performanceStyle, 'responsive-consultation');
});

test('Samuel reacts to painful questions and reassurance with authored performances', () => {
  const samuel = TECHNICAL_PATIENTS[1];
  let state = consultationTransition(startConsultation(samuel), samuel, { type: 'begin-inquiry' });
  const painful = samuel.prompts.find((item) => item.id === 'b-ask-1');
  let input = { promptId: painful.id, text: painful.text, stance: painful.stance };
  state = consultationTransition(state, samuel, {
    type: 'speech-response', input,
    response: renderOfflineDialogue(buildDialogueRequest(samuel, state, input), samuel),
  });
  assert.deepEqual(actorCueForConsultation(state), {
    body: 'sitting-distressed', expression: 'discouraged', gaze: 'doctor', speaking: true,
  });

  const reassurance = samuel.prompts.find((item) => item.id === 'b-reassure');
  input = { promptId: reassurance.id, text: reassurance.text, stance: reassurance.stance };
  state = consultationTransition(state, samuel, {
    type: 'speech-response', input,
    response: renderOfflineDialogue(buildDialogueRequest(samuel, state, input), samuel),
  });
  assert.deepEqual(actorCueForConsultation(state), {
    body: 'sitting-talking', expression: 'smiling', gaze: 'doctor', speaking: true,
  });
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

test('the generated clinical presentation owns the playable case', () => {
  const patients = createTechnicalPatients([2273, 4819, 4816]);
  for (const fixture of patients) {
    const clinical = fixture.profile.clinical;
    assert.equal(fixture.opening.dialogue, `“${clinical.presentingComplaint[0].toUpperCase()}${clinical.presentingComplaint.slice(1)}”`);
    assert.deepEqual(
      fixture.facts.filter((fact) => fact.kind === 'symptom').map((fact) => fact.value.toLowerCase().replace(/\.$/, '')),
      clinical.symptoms,
    );
    assert.equal(fixture.facts.find((fact) => fact.label === 'Respiration').value, `Respiration is ${clinical.performance.breathingRate} breaths per minute.`);
    assert.equal(fixture.diagnoses[0].label.toLowerCase(), clinical.periodCategory);
    assert.ok(fixture.caseNote.requiredFactIds.every((id) => fixture.facts.some((fact) => fact.id === id)));
  }

  const rerolled = createTechnicalPatients([2274, 4820, 4817]);
  assert.notDeepEqual(
    patients.map((fixture) => fixture.opening.dialogue),
    rerolled.map((fixture) => fixture.opening.dialogue),
  );
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
  const next = consultationTransition(state, patient, { type: 'interpret', id: 'read-history-first' });
  assert.equal(next.elapsedMinutes, 0);
  assert.deepEqual(next.interpretationIds, ['read-history-first']);
  assert.equal(next.history.at(-1).kind, 'interpretation');
});

test('an optional technical case note can be submitted with zero prose', () => {
  let state = beginInquiry();
  const prompt = patient.prompts[0];
  const input = { promptId: prompt.id, text: prompt.text, stance: prompt.stance };
  state = consultationTransition(state, patient, {
    type: 'speech-response', input,
    response: renderOfflineDialogue(buildDialogueRequest(patient, state, input), patient),
  });
  state = consultationTransition(state, patient, { type: 'begin-decision' });
  state = consultationTransition(state, patient, { type: 'select-diagnosis', id: patient.diagnoses[0].id });
  state = consultationTransition(state, patient, { type: 'select-treatment', id: 'drug-morphine' });
  state = consultationTransition(state, patient, { type: 'begin-case-note' });
  assert.equal(patient.caseNote.minimumWords, 0);
  assert.equal(state.caseNote, '');
  state = consultationTransition(state, patient, { type: 'submit-case-note' });
  assert.equal(state.stage, 'result');
  assert.equal(state.errors.length, 0);
});

test('case notebook starts with identity only and grows from player actions', () => {
  const [exam] = patient.examinations;
  const fact = patient.facts.find((entry) => entry.disclosure === 'withheld');
  let state = beginInquiry();
  let notebook = buildCaseNotebook(patient, state);
  assert.deepEqual(notebook.patient, {
    name: patient.label,
    age: patient.profile.identity.age,
    residence: patient.profile.social.residence,
  });
  assert.deepEqual(notebook.observations, []);
  assert.deepEqual(notebook.clues, []);
  assert.deepEqual(notebook.diagnoses, []);

  state = consultationTransition(state, patient, { type: 'interpret', id: 'read-history-first' });
  state = consultationTransition(state, patient, { type: 'examine', id: exam.id });
  const input = { stance: 'question', text: `Tell me more about the ${fact.releaseOn[0]}.` };
  state = consultationTransition(state, patient, {
    type: 'speech-response', input,
    response: renderOfflineDialogue(buildDialogueRequest(patient, state, input), patient),
  });
  notebook = buildCaseNotebook(patient, state);
  assert.deepEqual(notebook.observations.map((entry) => entry.kind), [exam.label, 'Patient account']);
  assert.equal(notebook.observations.at(-1).text, fact.notebookSummary);
  assert.deepEqual(notebook.clues.map((clue) => clue.label), [fact.label]);
  assert.equal(notebook.diagnosesAvailable, false);

  state = consultationTransition(state, patient, { type: 'begin-decision' });
  notebook = buildCaseNotebook(patient, state);
  assert.equal(notebook.diagnosesAvailable, true);
  assert.deepEqual(notebook.diagnoses.map((item) => item.label), patient.diagnoses.map((item) => item.label));
  assert.doesNotMatch(notebook.diagnoses.map((item) => item.label).join(' '), /working diagnosis/i);
});

test('offline dialogue discloses only a fact earned by the current question', () => {
  const fact = patient.facts.find((entry) => entry.disclosure === 'withheld');
  const state = beginInquiry();
  const input = { stance: 'question', text: `Tell me about the ${fact.releaseOn[0]}.` };
  const request = buildDialogueRequest(patient, state, input);
  assert.deepEqual(request.allowedDisclosureIds, [fact.id]);
  const response = renderOfflineDialogue(request, patient);
  const next = consultationTransition(state, patient, { type: 'speech-response', input, response });
  assert.equal(next.elapsedMinutes, 5);
  assert.ok(next.disclosedFactIds.includes(fact.id));
  assert.equal(next.history.at(-1).disclosedNow[0], fact.id);
  assert.equal(actorCueForConsultation(next).speaking, true);
});

test('the sim rejects an LLM attempt to disclose an unearned fact', () => {
  const fact = patient.facts.find((entry) => entry.disclosure === 'withheld');
  const state = beginInquiry();
  const next = consultationTransition(state, patient, {
    type: 'speech-response',
    input: { stance: 'question', text: 'How are you today?' },
    response: {
      dialogue: '“There is nothing else.”',
      disclosedNow: [fact.id],
      appraisal: { register: 'neutral', decorumBreach: 0, intent: 'question', terminates: false },
    },
  });
  assert.equal(next.disclosedFactIds.includes(fact.id), false);
  assert.match(next.errors.at(-1), /unauthorized disclosure/);
});

test('examination advances time and records a deterministic observation', () => {
  const exam = patient.examinations[0];
  const fact = patient.facts.find((entry) => entry.id === exam.factId);
  const state = beginInquiry();
  const next = consultationTransition(state, patient, { type: 'examine', id: exam.id });
  assert.equal(next.elapsedMinutes, 3);
  assert.ok(next.observedFactIds.includes(fact.id));
  assert.equal(next.history.at(-1).fact.value, fact.value);
  assert.deepEqual(actorCueForConsultation(next), {
    body: 'clinic-idle', expression: 'guarded', gaze: 'doctor', gesture: 'none', speaking: false,
  });
});

test('a complete consultation reaches distinct reputation and record ledgers', () => {
  const exam = patient.examinations[0];
  const fact = patient.facts.find((entry) => entry.disclosure === 'withheld');
  let state = beginInquiry();
  state = consultationTransition(state, patient, { type: 'examine', id: exam.id });
  const input = { stance: 'reassure', text: `Please tell me more about the ${fact.releaseOn[0]}.` };
  state = consultationTransition(state, patient, {
    type: 'speech-response', input,
    response: renderOfflineDialogue(buildDialogueRequest(patient, state, input), patient),
  });
  state = consultationTransition(state, patient, { type: 'begin-decision' });
  state = consultationTransition(state, patient, { type: 'select-diagnosis', id: 'a-diagnosis-1' });
  state = consultationTransition(state, patient, { type: 'select-treatment', id: 'drug-morphine' });
  state = consultationTransition(state, patient, { type: 'begin-case-note' });
  state = consultationTransition(state, patient, {
    type: 'write-case-note',
    text: `The patient reports ${patient.facts[0].value.toLowerCase()} Examination and questioning establish ${patient.caseNote.requiredFactIds.map((id) => patient.facts.find((entry) => entry.id === id).value.toLowerCase()).join(' and ')} today.`,
  });
  state = consultationTransition(state, patient, { type: 'submit-case-note' });
  assert.equal(state.stage, 'result');
  // Technical patients now carry a generated outcome model, so the result is
  // the full authored-path outcome rather than the bare ledger pair.
  assert.equal(state.result.diagnosisId, 'a-diagnosis-1');
  assert.deepEqual(state.result.treatmentIds, ['drug-morphine']);
  assert.equal(state.result.noteCoverage, 100);
  assert.ok(typeof state.result.reputation === 'number');
  assert.ok(typeof state.result.record === 'number');
  assert.ok(Number(state.result.immediate.paymentCents) >= 0);
  assert.notEqual(state.result.reputation, state.result.record, 'ledgers stay distinct');
});

test('the runtime publishes states and its offline renderer is deterministic', () => {
  const secondPatient = TECHNICAL_PATIENTS[1];
  const disclosed = secondPatient.facts.find((fact) => fact.disclosure === 'withheld');
  const runtime = createConsultationRuntime(TECHNICAL_PATIENTS, renderOfflineDialogue);
  const snapshots = [];
  const unsubscribe = runtime.subscribe((state) => snapshots.push(state));
  runtime.start('technical-b');
  runtime.dispatch({ type: 'begin-inquiry' });
  const first = runtime.speak({ stance: 'question', text: `Tell me about the ${disclosed.releaseOn[0]}.` });
  unsubscribe();
  assert.equal(snapshots.length, 3);
  assert.ok(first.disclosedFactIds.includes(disclosed.id));
  const secondState = consultationTransition(startConsultation(secondPatient), secondPatient, { type: 'begin-inquiry' });
  const request = buildDialogueRequest(secondPatient, secondState, { stance: 'question', text: disclosed.releaseOn[0] });
  assert.deepEqual(renderOfflineDialogue(request, secondPatient), renderOfflineDialogue(request, secondPatient));
});

test('the runtime reports only deterministic consultation time costs', () => {
  const exam = patient.examinations[0];
  const fact = patient.facts.find((entry) => entry.disclosure === 'withheld');
  const advances = [];
  const runtime = createConsultationRuntime([patient], renderOfflineDialogue, {
    onAdvanceMinutes: (minutes, action) => advances.push([minutes, action.type]),
  });
  runtime.start(patient.id);
  runtime.dispatch({ type: 'begin-inquiry' });
  runtime.dispatch({ type: 'interpret', id: 'read-history-first' });
  runtime.dispatch({ type: 'examine', id: exam.id });
  runtime.speak({ stance: 'question', text: `Tell me about the ${fact.releaseOn[0]}.` });
  assert.deepEqual(advances, [[3, 'examine'], [5, 'speech-response']]);
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
