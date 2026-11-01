import test from 'node:test';
import assert from 'node:assert/strict';
import { actorCueForConsultation, buildDialogueRequest, consultationTransition, startConsultation } from '../src/consultation/engine.js';
import { availableDialoguePrompts } from '../src/consultation/patientLogic.js';
import { renderOfflineDialogue } from '../src/consultation/offlineRenderer.js';
import { NORA_BYRNE as patient } from '../src/consultation/authoredPatients/noraByrne.js';

const begin = () => consultationTransition(startConsultation(patient), patient, { type: 'begin-inquiry' });
function say(state, text, extra = {}) {
  const input = { text, custom: true, stance: 'question', ...extra };
  return consultationTransition(state, patient, {
    type: 'speech-response', input,
    response: renderOfflineDialogue(buildDialogueRequest(patient, state, input), patient),
  });
}

test('an apology repairs some trust, leaves the patient guarded, and preserves the warning', () => {
  const start = begin();
  const offended = say(start, 'You are a liar.');
  const prompt = availableDialoguePrompts(patient, offended).find(p => p.id === 'apologize');
  assert.ok(prompt);
  const repaired = say(offended, prompt.text, { custom: false, promptId: prompt.id, stance: prompt.stance });
  assert.equal(repaired.stage, 'inquiry');
  assert.equal(repaired.awaitingApology, false);
  assert.equal(repaired.insultCount, 1);
  assert.ok(repaired.trust > offended.trust && repaired.trust < start.trust);
  assert.equal(repaired.elapsedMinutes - offended.elapsedMinutes, 1);
  assert.equal(actorCueForConsultation(repaired).expression, 'guarded');
  assert.deepEqual(repaired.disclosedFactIds, start.disclosedFactIds);
  assert.ok(!availableDialoguePrompts(patient, repaired).some(p => p.id === 'apologize'));
  assert.equal(say(repaired, 'You are a fraud.').stage, 'terminated');
});

test('an apology can mention the earlier insult but cannot conceal a fresh one', () => {
  const offended = say(begin(), 'You are an idiot.');
  assert.equal(say(offended, 'I am sorry I called you an idiot.').awaitingApology, false);
  assert.equal(say(offended, 'Sorry. I should not have said that.').awaitingApology, false);
  assert.equal(say(offended, 'I am sorry, but you are a liar.').stage, 'terminated');
});

test('an insult cannot release facts or bypass a pending clinical answer', () => {
  const start = { ...begin(), pendingResponseId: 'patient-question' };
  const text = `You are a liar. ${patient.inquiryIntents[0].matchTerms[0]}`;
  const request = buildDialogueRequest(patient, start, { text, custom: true });
  assert.equal(request.resolvedRuleId, null);
  assert.deepEqual(request.allowedDisclosureIds, []);
  const offended = say(start, text);
  assert.equal(offended.pendingResponseId, start.pendingResponseId);
  const repaired = say(offended, 'I apologize.');
  assert.equal(repaired.pendingResponseId, start.pendingResponseId);
  assert.deepEqual(repaired.disclosedFactIds, start.disclosedFactIds);
  assert.equal(repaired.stage, 'inquiry');
});

test('a first insult still leaves room to apologize at low trust and at the time limit', () => {
  const offended = say({ ...begin(), trust: 3, elapsedMinutes: 25 }, 'You are a liar.');
  assert.equal(offended.stage, 'inquiry');
  assert.ok(offended.trust > 0);
  const repaired = say(offended, 'I apologize.');
  assert.equal(repaired.stage, 'inquiry');
  assert.equal(repaired.awaitingApology, false);
  assert.equal(repaired.elapsedMinutes, 31);
});

test('an already vulnerable patient can show hurt in the offline fallback', () => {
  const request = buildDialogueRequest(patient, begin(), { text: 'You are a liar.' });
  request.currentEmotion.expression = 'discouraged';
  const response = renderOfflineDialogue(request, patient);
  assert.equal(response.reactionExpression, 'discouraged');
  assert.equal(response.gaze, 'down');
  assert.equal(response.appraisal.terminates, false);
});
