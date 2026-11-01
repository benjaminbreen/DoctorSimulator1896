import assert from 'node:assert/strict';
import test from 'node:test';
import { POST } from '../../api/consult.mjs';
import {
  actorCueForConsultation,
  buildDialogueRequest,
  createConsultationRuntime,
  startConsultation,
} from '../src/consultation/engine.js';
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
      expression: 'smiling',
      bodyCue: 'sitting-talking',
      disclosedNow: [],
    }),
    () => renderLunaDialogue(request, patient),
  );
  assert.match(rendered.dialogue, /tabby/);
  assert.equal(rendered.behavior, 'She almost smiles.');
  assert.equal(rendered.reactionExpression, 'smiling');
  assert.equal(rendered.bodyCue, 'sitting-talking');
  assert.equal(rendered.appraisal.register, 'courteous');
  assert.equal(rendered.appraisal.terminates, false);
  assert.equal(rendered.appraisal.decorumBreach, 0);
});

test('a model performance cue drives the actor when no authored rule matched', async () => {
  const runtime = createConsultationRuntime([patient], (request, currentPatient) => (
    renderLunaDialogue(request, currentPatient)
  ));
  runtime.start(patient.id);
  runtime.dispatch({ type: 'begin-inquiry' });
  const state = await withFetch(
    async () => reply({
      dialogue: '“No, Doctor, no cat. Mrs. Doyle would not allow one.”',
      behavior: 'She folds her hands in her lap.',
      register: 'clinical',
      expression: 'anxious',
      expressionIntensity: 0.65,
      gaze: 'down',
      bodyCue: 'sitting-self-soothing',
      disclosedNow: [],
    }),
    () => runtime.speak({ custom: true, stance: 'question', text: 'Do you keep a cat at home?' }),
  );
  assert.equal(state.history.at(-1).reactionExpression, 'anxious');
  assert.equal(state.history.at(-1).bodyCue, 'sitting-self-soothing');
  const cue = actorCueForConsultation(state);
  assert.equal(cue.expression, 'anxious');
  assert.equal(cue.body, 'sitting-self-soothing');
  assert.equal(cue.expressionIntensity, 0.65);
  assert.equal(cue.gaze, 'down');
});

test('the next model turn receives the previous performance and a failed call preserves it', async () => {
  const runtime = createConsultationRuntime([patient], renderLunaDialogue);
  runtime.start(patient.id);
  runtime.dispatch({ type: 'begin-inquiry' });
  let calls = 0;
  await withFetch(async (_url, options) => {
    const payload = JSON.parse(options.body);
    calls += 1;
    if (calls === 1) return reply({
      dialogue: '“That was unkind, Doctor.”', behavior: 'She looks away.',
      expression: 'frowning', expressionIntensity: 0.8, gaze: 'away',
      bodyCue: 'sitting-disapproval', register: 'hostile', disclosedNow: [],
    });
    assert.deepEqual(payload.currentEmotion, {
      expression: 'frowning', expressionIntensity: 0.8, gaze: 'away', bodyCue: 'sitting-disapproval',
    });
    assert.equal(payload.recentTurns.at(-1).expression, 'frowning');
    assert.equal(payload.recentTurns.at(-1).expressionIntensity, 0.8);
    assert.equal(payload.recentTurns.at(-1).gaze, 'away');
    return reply({ error: 'unavailable' }, 502);
  }, async () => {
    await runtime.speak({ custom: true, stance: 'question', text: 'Why should I take you seriously?' });
    await runtime.speak({ custom: true, stance: 'question', text: 'May we continue?' });
  });
  assert.equal(calls, 2);
  const cue = actorCueForConsultation(runtime.get());
  assert.equal(cue.expression, 'frowning');
  assert.equal(cue.expressionIntensity, 0.8);
  assert.equal(cue.gaze, 'away');
  assert.equal(cue.body, 'sitting-disapproval');
});

test('a cue outside the shared vocabulary is dropped, not displayed', async () => {
  const runtime = createConsultationRuntime([patient], (request, currentPatient) => (
    renderLunaDialogue(request, currentPatient)
  ));
  runtime.start(patient.id);
  runtime.dispatch({ type: 'begin-inquiry' });
  const state = await withFetch(
    async () => reply({
      dialogue: '“No, Doctor.”',
      behavior: 'She waits.',
      register: 'clinical',
      expression: 'grimacing',
      expressionIntensity: 4,
      gaze: 'ceiling',
      bodyCue: 'lying-down',
      disclosedNow: [],
    }),
    () => runtime.speak({ custom: true, stance: 'question', text: 'Do you keep a cat at home?' }),
  );
  assert.equal(state.history.at(-1).reactionExpression, null);
  assert.equal(state.history.at(-1).bodyCue, null);
  assert.equal(state.history.at(-1).gaze, null);
  assert.equal(state.history.at(-1).expressionIntensity, 1);
});

test('a first insult can get a model reaction without surrendering the warning or trust penalty', async () => {
  const request = requestFor({ custom: true, stance: 'question', text: 'You are a liar.' });
  let calls = 0;
  const rendered = await withFetch(
    async (_url, options) => {
      calls += 1;
      const payload = JSON.parse(options.body);
      assert.equal(payload.conversationRepair.action, 'insult');
      assert.equal(payload.conversationRepair.visitEnds, false);
      assert.deepEqual(payload.allowedNewFacts, []);
      return reply({ dialogue: '“Do not call me that.”', register: 'courteous',
        expression: 'frowning', expressionIntensity: 0.8, gaze: 'doctor', bodyCue: 'sitting-disapproval' });
    },
    () => renderLunaDialogue(request, patient),
  );
  assert.equal(calls, 1);
  assert.equal(rendered.appraisal.terminates, false);
  assert.equal(rendered.appraisal.register, 'hostile');
  assert.equal(rendered.appraisal.decorumBreach, 1);
  assert.equal(rendered.reactionExpression, 'frowning');
});

test('a failed insult call still gives an offended reaction and a chance to apologize', async () => {
  const request = requestFor({ custom: true, stance: 'question', text: 'You are a liar.' });
  const rendered = await withFetch(async () => reply({}, 502), () => renderLunaDialogue(request, patient));
  assert.equal(rendered.appraisal.terminates, false);
  assert.equal(rendered.reactionExpression, 'frowning');
  assert.equal(rendered.bodyCue, 'sitting-disapproval');
  assert.deepEqual(rendered.disclosedNow, []);
});

test('a repeated insult ends the visit without a model call', async () => {
  const state = { ...startConsultation(patient), insultCount: 1, awaitingApology: true };
  const request = buildDialogueRequest(patient, state, { custom: true, text: 'You are a fraud.' });
  const rendered = await withFetch(() => assert.fail('no model call for a fixed exit'), () => renderLunaDialogue(request, patient));
  assert.equal(rendered.appraisal.terminates, true);
});

test('a failed route falls back to the offline reply', async () => {
  const request = requestFor({ custom: true, stance: 'question', text: 'Do you keep a cat at home?' });
  for (const handler of [async () => reply({ error: 'nope' }, 502), async () => { throw new Error('offline'); }]) {
    const rendered = await withFetch(handler, () => renderLunaDialogue(request, patient));
    assert.match(rendered.dialogue, /ask me another way/);
    assert.equal(rendered.bodyCue, 'sitting-talking');
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
      expression: 'smiling', expressionIntensity: 1, gaze: 'down',
    }),
    () => runtime.speak({ custom: true, stance: 'question', text: 'Do you keep a cat at home?' }),
  );
  assert.ok(!state.disclosedFactIds.includes('nora-bereavement'));
  assert.match(state.errors.at(-1), /unauthorized disclosure/);
  assert.equal(state.history.at(-1).expressionIntensity, null);
  assert.equal(state.history.at(-1).gaze, null);
  assert.equal(state.history.at(-1).reactionExpression, null);
});

/* ------- route ------- */

test('the route requests bounded performance fields and returns them', async () => {
  process.env.OPENAI_API_KEY ||= 'test-key';
  await withFetch(async (_url, options) => {
    const format = JSON.parse(options.body).text.format;
    assert.equal(format.strict, true);
    assert.deepEqual(format.schema.properties.expressionIntensity, { type: 'number', minimum: 0, maximum: 1 });
    assert.deepEqual(format.schema.properties.gaze.enum, ['doctor', 'away', 'down', 'neutral']);
    assert.ok(format.schema.required.includes('gaze'));
    assert.ok(format.schema.required.includes('expressionIntensity'));
    return reply({ output: [{ content: [{ type: 'output_text', text: JSON.stringify({
      dialogue: '“I would rather not, Doctor.”', behavior: 'She looks down.',
      register: 'prying', expression: 'ashamed', expressionIntensity: 0.45,
      gaze: 'down', bodyCue: 'sitting-self-soothing',
    }) }] }] });
  }, async () => {
    const response = await POST(consultRequest(PAYLOAD, { 'x-forwarded-for': '10.0.0.5' }));
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.expressionIntensity, 0.45);
    assert.equal(body.gaze, 'down');
    assert.deepEqual(body.disclosedNow, []);
  });
});

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

test('the route reports an invalid key without returning provider account details', async () => {
  const originalKey = process.env.OPENAI_API_KEY;
  const originalError = console.error;
  process.env.OPENAI_API_KEY = 'test-key';
  console.error = () => {};
  try {
    await withFetch(async () => reply({ error: {
      code: 'invalid_api_key', message: 'Account-specific provider details',
    } }, 401), async () => {
      const response = await POST(consultRequest(PAYLOAD, { 'x-forwarded-for': '10.0.0.4' }));
      assert.equal(response.status, 502);
      assert.deepEqual(await response.json(), {
        error: 'dialogue service failed', upstreamStatus: 401, upstreamCode: 'invalid_api_key',
      });
    });
  } finally {
    console.error = originalError;
    if (originalKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = originalKey;
  }
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
