import assert from 'node:assert/strict';
import test from 'node:test';
import { POST } from '../../api/consult.mjs';
import { buildDialogueRequest, createConsultationRuntime, startConsultation } from '../src/consultation/engine.js';
import { renderLunaDialogue } from '../src/consultation/lunaRenderer.js';
import { NORA_BYRNE } from '../src/consultation/authoredPatients/noraByrne.js';

const patient = NORA_BYRNE;

function requestFor(input) {
  const state = startConsultation(patient);
  return buildDialogueRequest(patient, state, input);
}

function withFetch(handler, run) {
  const original = globalThis.fetch;
  globalThis.fetch = handler;
  return Promise.resolve(run()).finally(() => { globalThis.fetch = original; });
}

function reply(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

function consultRequest(body, headers = {}) {
  return new Request('http://localhost:5175/api/consult', {
    method: 'POST',
    headers: { origin: 'http://localhost:5175', host: 'localhost:5175', 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
}

const PAYLOAD = {
  schemaVersion: 1,
  task: 'render-patient-dialogue',
  player: { text: 'What do your hands feel like in the morning?', stance: 'question' },
  allowedNewFacts: [],
};

/* ------- renderer ------- */

test('an authored prompt is answered offline without a model call', () => {
  const prompt = patient.prompts[0];
  const rendered = renderLunaDialogue(requestFor({ promptId: prompt.id, text: prompt.text }), patient);
  assert.equal(typeof rendered.then, 'undefined');
  assert.equal(rendered.dialogue, prompt.dialogue);
});

test('a custom question matching an authored intent stays offline', () => {
  const intent = patient.inquiryIntents?.[0];
  assert.ok(intent, 'Nora needs an inquiry intent for this test');
  const request = requestFor({ custom: true, stance: 'question', text: intent.matchTerms[0] });
  assert.equal(typeof renderLunaDialogue(request, patient).then, 'undefined');
});

test('an unmatched custom question takes wording from the model but not decorum', async () => {
  const request = requestFor({ custom: true, stance: 'question', text: 'Do you keep a cat at home?' });
  assert.equal(request.resolvedRuleId, null);
  const rendered = await withFetch(
    async () => reply({
      dialogue: '“A tabby, doctor. She sleeps on the press.”',
      behavior: 'She almost smiles.',
      register: 'courteous',
      disclosedNow: [],
    }),
    () => renderLunaDialogue(request, patient),
  );
  assert.match(rendered.dialogue, /tabby/);
  assert.equal(rendered.behavior, 'She almost smiles.');
  assert.equal(rendered.appraisal.register, 'courteous');
  assert.equal(rendered.appraisal.terminates, false);
  assert.equal(rendered.appraisal.decorumBreach, 0);
});

test('an insult ends the visit deterministically without calling the model', async () => {
  const request = requestFor({ custom: true, stance: 'question', text: 'You are a liar.' });
  const rendered = await withFetch(
    () => assert.fail('the model must not be called for an insult'),
    () => renderLunaDialogue(request, patient),
  );
  assert.equal(rendered.appraisal.terminates, true);
});

test('a failed route falls back to the offline reply', async () => {
  const request = requestFor({ custom: true, stance: 'question', text: 'Do you keep a cat at home?' });
  for (const handler of [async () => reply({ error: 'nope' }, 502), async () => { throw new Error('offline'); }]) {
    const rendered = await withFetch(handler, () => renderLunaDialogue(request, patient));
    assert.match(rendered.dialogue, /cannot add much more/);
  }
});

test('the engine still rejects a fact the model was not allowed to disclose', async () => {
  const runtime = createConsultationRuntime([patient], (request, currentPatient) => (
    renderLunaDialogue(request, currentPatient)
  ));
  runtime.start(patient.id);
  runtime.dispatch({ type: 'begin-inquiry' });
  const state = await withFetch(
    async () => reply({
      dialogue: '“My sister died in the spring.”',
      behavior: 'She looks down.',
      register: 'clinical',
      disclosedNow: ['nora-bereavement'],
    }),
    () => runtime.speak({ custom: true, stance: 'question', text: 'Do you keep a cat at home?' }),
  );
  assert.ok(!state.disclosedFactIds.includes('nora-bereavement'));
  assert.match(state.errors.at(-1), /unauthorized disclosure/);
});

/* ------- route ------- */

test('the route refuses a request that is not same-origin', async () => {
  const response = await POST(consultRequest(PAYLOAD, { origin: 'http://elsewhere.test' }));
  assert.equal(response.status, 403);
  const bare = await POST(new Request('http://localhost:5175/api/consult', {
    method: 'POST', headers: { host: 'localhost:5175' }, body: '{}',
  }));
  assert.equal(bare.status, 403);
});

test('the route refuses a payload that is not a dialogue request', async () => {
  process.env.OPENAI_API_KEY ||= 'test-key';
  const response = await POST(consultRequest({ task: 'render-william-james-assessment' }, { 'x-forwarded-for': '10.0.0.1' }));
  assert.equal(response.status, 400);
});

test('the route rate limits one client and leaves another alone', async () => {
  process.env.OPENAI_API_KEY ||= 'test-key';
  const send = (ip) => POST(consultRequest({ task: 'nope' }, { 'x-forwarded-for': ip }));
  const statuses = [];
  for (let index = 0; index < 16; index += 1) statuses.push((await send('10.0.0.2')).status);
  assert.equal(statuses.filter((status) => status === 400).length, 15);
  assert.equal(statuses.at(-1), 429);
  assert.equal((await send('10.0.0.3')).status, 400);
});
