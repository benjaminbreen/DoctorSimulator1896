// Server-side dialogue route for custom consultation questions. The browser
// never sees the API key. The same handler serves Vercel and the Vite dev
// server; see the consultRoute plugin in game/vite.config.js.

const MODEL = 'gpt-5.6-luna';
const ENDPOINT = 'https://api.openai.com/v1/responses';
const REGISTERS = ['neutral', 'courteous', 'clinical', 'prying', 'hostile'];
const MAX_BODY_BYTES = 24000;
const MAX_OUTPUT_TOKENS = 400;
const UPSTREAM_TIMEOUT_MS = 9000;
const WINDOW_MS = 60000;
const WINDOW_LIMIT = 15;

const SYSTEM = `You are a patient in a New York consulting room in 1896, answering a physician who has just asked you something. Reply as the patient, never as a narrator.

The simulation owns every fact. You own only the wording.

- knownFacts are things you have already told this physician. You may refer to them freely.
- allowedNewFacts are things you may disclose now. Disclose one only if the question genuinely reaches it, and list its id in disclosedNow.
- If the question reaches nothing in either list, answer in character without new information: say you cannot say, ask what the physician means, or repeat something already known. Never invent a symptom, a diagnosis, a treatment, a date, a place, or another person.
- Never mention a fact from allowedNewFacts without listing its id.

Write dialogue in the first person inside curly quotes, one to three sentences, in the patient's own voice as described. Ordinary period speech, not modern clinical language and not costume-drama diction. You do not know modern medicine.

Write behavior as one short third-person sentence describing what the physician can see you do. No quotes, no thoughts, no account of your illness.

Set register by judging the physician's question, not your own reply: courteous if it is kind or reassuring, clinical if it is a plain professional question, prying if it is intrusive or accusing, hostile if it is contemptuous, neutral if none of these fit.`;

// Fixed window per client. The Vercel WAF rule is the real limit; this covers
// local dev and repeated hits on one warm instance.
const windows = new Map();

function overRateLimit(key, now = Date.now()) {
  for (const [id, entry] of windows) if (entry.resetAt <= now) windows.delete(id);
  const entry = windows.get(key);
  if (!entry) {
    windows.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return false;
  }
  entry.count += 1;
  return entry.count > WINDOW_LIMIT;
}

function clientKey(request) {
  const forwarded = request.headers.get('x-forwarded-for') || '';
  return forwarded.split(',')[0].trim() || request.headers.get('x-real-ip') || 'local';
}

// Same-origin only. A browser sends Origin on every cross-origin POST and on
// same-origin POSTs too, so a missing Origin means the caller is not the game.
function sameOrigin(request) {
  const origin = request.headers.get('origin');
  const host = request.headers.get('host');
  if (!origin || !host) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

function isDialoguePayload(body) {
  return body?.task === 'render-patient-dialogue'
    && body.schemaVersion === 1
    && typeof body.player?.text === 'string'
    && body.player.text.trim().length > 0;
}

const JAMES_SYSTEM = `You are William James of Harvard, writing in 1896 a short private letter to a young New York physician whose case record you have just read. The record contains the whole visit: what the doctor asked, in his own words, what the patient answered, what was examined and found, the diagnosis, the prescription, and how it went a month on.

Write as James: blunt, warm, funny where the record earns it, plain about what was botched. Quote or closely paraphrase at least one thing the doctor actually said or did — the letter must read as if you sat in the corner of that consulting room. Praise what deserves praise in one clause, not a paragraph. If the treatment was quackery or the questioning timid, say so without cruelty. One digression of a single clause is allowed; no more.

Hard rules: no numbers, grades, or scores of any kind. No facts beyond the record: never name a person, relation, symptom, or event the record does not contain. No medical knowledge unavailable in 1896. 60 to 120 words between salutation and signature — stop early rather than run long. Open "My dear Doctor," and sign "Wm. James".`;

function isJamesPayload(body) {
  return body?.task === 'render-william-james-assessment'
    && body.schemaVersion === 1
    && typeof body.record?.patient?.name === 'string'
    && Array.isArray(body.record?.transcript);
}

const JAMES_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: { letter: { type: 'string' } },
  required: ['letter'],
};

// Constraining disclosedNow to the allowed ids means the model cannot name an
// unauthorized fact at all. The engine still rejects any that slip through.
function replySchema(allowedIds) {
  const properties = {
    dialogue: { type: 'string' },
    behavior: { type: 'string' },
    register: { type: 'string', enum: REGISTERS },
  };
  if (allowedIds.length > 0) {
    properties.disclosedNow = { type: 'array', items: { type: 'string', enum: allowedIds } };
  }
  return {
    type: 'object',
    additionalProperties: false,
    properties,
    required: Object.keys(properties),
  };
}

function replyText(data) {
  for (const item of data?.output || []) {
    for (const part of item?.content || []) {
      if (part?.type === 'refusal') throw new Error('the model refused the request');
      if (part?.type === 'output_text' && typeof part.text === 'string') return part.text;
    }
  }
  throw new Error('the model returned no text');
}

function json(body, status) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
}

export async function POST(request) {
  if (!sameOrigin(request)) return json({ error: 'forbidden' }, 403);
  if (overRateLimit(clientKey(request))) return json({ error: 'too many requests' }, 429);

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return json({ error: 'dialogue service is not configured' }, 503);

  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) return json({ error: 'payload too large' }, 413);

  let payload;
  try {
    payload = JSON.parse(raw);
  } catch {
    return json({ error: 'invalid payload' }, 400);
  }
  if (isJamesPayload(payload)) {
    try {
      const reply = await callModel(apiKey, {
        instructions: JAMES_SYSTEM,
        input: JSON.stringify(payload.record),
        schemaName: 'james_letter',
        schema: JAMES_SCHEMA,
        maxTokens: 600,
      });
      return json({ letter: String(reply.letter || '').trim() }, 200);
    } catch (error) {
      console.error(`james letter failed: ${error.message}`);
      return json({ error: 'assessment service failed' }, 502);
    }
  }

  if (!isDialoguePayload(payload)) return json({ error: 'invalid payload' }, 400);

  const allowedIds = (payload.allowedNewFacts || []).map((fact) => String(fact.id));
  // `output` described the reply shape before the JSON schema did that job.
  const { output, ...record } = payload;

  try {
    const reply = await callModel(apiKey, {
      instructions: SYSTEM,
      input: JSON.stringify(record),
      schemaName: 'patient_reply',
      schema: replySchema(allowedIds),
      maxTokens: MAX_OUTPUT_TOKENS,
    });
    return json({
      dialogue: String(reply.dialogue || '').trim(),
      behavior: String(reply.behavior || '').trim(),
      register: REGISTERS.includes(reply.register) ? reply.register : 'neutral',
      disclosedNow: Array.isArray(reply.disclosedNow)
        ? reply.disclosedNow.filter((id) => allowedIds.includes(id))
        : [],
    }, 200);
  } catch (error) {
    console.error(`consult failed: ${error.message}`);
    return json({ error: 'dialogue service failed' }, 502);
  }
}

async function callModel(apiKey, { instructions, input, schemaName, schema, maxTokens }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
  try {
    const upstream = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        model: MODEL,
        reasoning: { effort: 'none' },
        max_output_tokens: maxTokens,
        instructions,
        input,
        text: {
          format: { type: 'json_schema', name: schemaName, strict: true, schema },
        },
      }),
    });
    if (!upstream.ok) {
      const detail = await upstream.text();
      throw new Error(`upstream ${upstream.status}: ${detail.slice(0, 500)}`);
    }
    return JSON.parse(replyText(await upstream.json()));
  } finally {
    clearTimeout(timer);
  }
}
