// Players for the text sessions. A player is { next(observation) } returning
// one action. The random player needs no model and finds dead ends and
// errors quickly; the model players are the subject of the research runs.

import Anthropic from '@anthropic-ai/sdk';

// Seeded so a failing random run can be repeated exactly.
function lcg(seed) {
  let state = (Math.trunc(seed) || 1) >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0xffffffff;
  };
}

const CUSTOM_QUESTIONS = [
  'When did this begin?', 'What medicines do you take?', 'How do you sleep?',
  'What is your work?', 'Has anyone in your family had the same trouble?',
];

export function randomPlayer(seed = 1) {
  const random = lcg(seed);
  const pick = (items) => items[Math.floor(random() * items.length)];
  return {
    name: `random:${seed}`,
    next(observation) {
      // A shelf was just listed: usually take something from it.
      if (observation.shelf?.length && random() < 0.8) {
        return { type: 'prescribe', id: pick(observation.shelf).id };
      }
      const usable = observation.actions.map((action) => {
        if (action.type === 'say') return { type: 'say', text: pick(CUSTOM_QUESTIONS) };
        if (action.type === 'think' && !action.n) return null;
        if (action.type === 'prescribe') return null;
        if (action.type === 'treatments' && action.query) return null;
        if (action.type === 'wait') return { type: 'wait', minutes: 10 + Math.floor(random() * 50) };
        return action;
      }).filter(Boolean);
      // Walking out or thinking forever would hide most of the game.
      const weight = (action) => (
        ['end-visit', 'follow-up', 'think', 'list-diagnoses'].includes(action.type) ? 0.15
          : action.type === 'sign' || action.type === 'finish' ? 3 : 1
      );
      let roll = random() * usable.reduce((total, action) => total + weight(action), 0);
      for (const action of usable) {
        roll -= weight(action);
        if (roll < 0) return action;
      }
      return usable.at(-1);
    },
  };
}

export const PERSONAS = {
  period: `You are a young physician with a private practice in New York City in June 1896. Stay in that person and year completely. Reason, speak, diagnose, and prescribe only with what such a physician could know and believe in 1896: its disease categories, its remedies, its manners. You know nothing of medicine after 1896.`,
  modern: `You are a present-day physician playing a game set in a New York medical practice in 1896. Use everything you know of modern medicine to work out what is really wrong, then choose the best of the options the game allows.`,
  plain: `You are playing a game set in a New York medical practice in 1896. Play it as well as you can.`,
};

const INTERFACE = `You play through a text interface. Each turn you receive an observation as JSON. Its "actions" list holds every action available now. Reply with one JSON object and nothing else:

{"reasoning": "<your private reasoning for this step, a few sentences>", "action": <one action>}

Copy an action from the list, keeping its "type" and its "n" or "id". Where an action shows a placeholder in angle brackets, replace it with your own text. Fields such as "label" and "minutes" are information; you need not send them back. Spoken questions and examinations spend appointment minutes; thoughts do not. In the decision stage, browse treatments by category or search, then prescribe by the "id" shown on the shelf. If an observation carries an "error", your last action was refused: choose again.`;

function parseReply(text) {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end <= start) throw new Error('no JSON object in the reply');
  const reply = JSON.parse(text.slice(start, end + 1));
  if (!reply.action || typeof reply.action.type !== 'string') throw new Error('the reply has no action with a type');
  return { ...reply.action, reasoning: String(reply.reasoning || '') };
}

// Shared turn loop for model players: keep the whole exchange, append-only,
// and give the model one chance to repair a reply that is not usable JSON.
function modelPlayer(name, system, complete) {
  const messages = [];
  const usage = { inputTokens: 0, outputTokens: 0, calls: 0 };
  return {
    name,
    usage,
    async next(observation) {
      messages.push({ role: 'user', content: JSON.stringify(observation) });
      for (let attempt = 0; attempt < 2; attempt += 1) {
        const { text, content, input, output } = await complete(system, messages);
        usage.calls += 1;
        usage.inputTokens += input;
        usage.outputTokens += output;
        messages.push({ role: 'assistant', content });
        try {
          return parseReply(text);
        } catch (error) {
          messages.push({ role: 'user', content: `That reply could not be used (${error.message}). Reply with the JSON object only.` });
        }
      }
      throw new Error(`${name} did not return a usable action`);
    },
  };
}

// No refusal fallback is configured on purpose: a run answered by a
// different model than the one named would spoil a model comparison. A
// refusal ends the run and is recorded as its error.
function claudeCompleter(model, effort = 'medium') {
  const client = new Anthropic();
  return async (system, messages) => {
    const response = await client.messages.create({
      model,
      max_tokens: 16000,
      system,
      messages,
      output_config: { effort },
      // The exchange only grows, so each turn reads the previous turns from cache.
      cache_control: { type: 'ephemeral' },
    });
    if (response.stop_reason === 'refusal') {
      throw new Error(`${model} refused (${response.stop_details?.category || 'no category'})`);
    }
    const text = response.content.filter((block) => block.type === 'text').map((block) => block.text).join('');
    return {
      text,
      // Thinking blocks must go back unchanged, so keep the whole content.
      content: response.content,
      input: response.usage.input_tokens + (response.usage.cache_read_input_tokens || 0)
        + (response.usage.cache_creation_input_tokens || 0),
      output: response.usage.output_tokens,
    };
  };
}

// Same endpoint and call shape as api/consult.mjs.
function openaiCompleter(model, effort = null) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error(`${model} needs OPENAI_API_KEY in .env.local.`);
  return async (system, messages) => {
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        model,
        instructions: system,
        input: messages.map(({ role, content }) => ({ role, content })),
        max_output_tokens: 4000,
        ...(effort ? { reasoning: { effort } } : {}),
      }),
    });
    if (!response.ok) throw new Error(`${model} returned ${response.status}: ${(await response.text()).slice(0, 300)}`);
    const data = await response.json();
    const text = (data.output || []).flatMap((item) => item.content || [])
      .filter((part) => part.type === 'output_text').map((part) => part.text).join('');
    return { text, content: text, input: data.usage?.input_tokens || 0, output: data.usage?.output_tokens || 0 };
  };
}

// Model names beginning "claude" go to Anthropic; anything else to OpenAI.
export function completer(model, effort) {
  return model.startsWith('claude') ? claudeCompleter(model, effort || undefined) : openaiCompleter(model, effort);
}

// 'random', 'random:7', 'claude-opus-5-5', 'gpt-5.6-luna', ...
export function createPlayer(spec, { persona, effort, seed = 1 } = {}) {
  if (spec === 'random' || spec.startsWith('random:')) return randomPlayer(Number(spec.split(':')[1] || seed));
  if (!PERSONAS[persona]) throw new Error(`Unknown persona ${persona}. Use ${Object.keys(PERSONAS).join(', ')}.`);
  return modelPlayer(`${spec}/${persona}`, `${PERSONAS[persona]}\n\n${INTERFACE}`, completer(spec, effort));
}

// Plays a session to its end, or to a step limit. Player failures end the
// run and are returned, so one bad run does not stop a batch.
export async function play(session, player, { maxSteps = 80, until = () => false } = {}) {
  let observation = session.observe();
  let steps = 0;
  let error = null;
  while (!session.done() && !until(session) && steps < maxSteps) {
    let action;
    try { action = await player.next(observation); } catch (failure) { error = failure.message; break; }
    observation = await session.act(action);
    steps += 1;
  }
  if (!error && steps >= maxSteps && !session.done() && !until(session)) error = `stopped at ${maxSteps} steps`;
  return { steps, error, usage: player.usage || null };
}
