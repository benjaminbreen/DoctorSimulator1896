// Server-side renderer for custom questions asked during a close examination.
// The client sends the object's whole fact list; the model may state nothing
// outside it. Same handler serves Vercel and the Vite dev server.

const MODEL = 'gpt-5.6-luna';
const ENDPOINT = 'https://api.openai.com/v1/responses';
const MAX_BODY_BYTES = 12000;
const MAX_OUTPUT_TOKENS = 220;
const UPSTREAM_TIMEOUT_MS = 9000;
const WINDOW_MS = 60000;
const WINDOW_LIMIT = 20;

const SYSTEM = `You describe what a physician sees when he examines an object closely in New York, 1896. You are his own attention, not a narrator and not a character. Never use "I".

The simulation owns every fact. You own only the wording.

- facts is everything true of this object. Answer only from it.
- seen is what he has already noted. You may refer back to it; do not simply repeat it word for word.
- If the question reaches nothing in facts, say plainly that looking will not settle it, and say what looking does settle instead. Never invent a detail, a maker, a name, a date, a place, or another person. Never guess who owned the thing.
- Do not diagnose, decide an outcome, offer a task, or change anything in the world.

Write one to three sentences of plain observation in the present tense. Period-plain English: no modern laboratory vocabulary, no costume-drama diction, no metaphor, no flourish at the end. Describe the thing, not the mood.`;

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
  return forwarded.split(',')[0].trim() || request.headers.get('x-real-ip') || 'local-examine';
}

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

function json(body, status) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function validLines(list, max) {
  return Array.isArray(list)
    && list.length <= max
    && list.every((line) => typeof line === 'string' && line.length <= 400);
}

function validPayload(payload) {
  return Boolean(payload)
    && payload.task === 'answer-examination-question'
    && typeof payload.subjectId === 'string' && payload.subjectId.length <= 64
    && typeof payload.question === 'string'
    && payload.question.trim().length > 0 && payload.question.length <= 400
    && validLines(payload.facts, 24)
    && validLines(payload.seen ?? [], 12);
}

function replyText(body) {
  const parts = [];
  for (const item of body.output ?? []) {
    for (const piece of item.content ?? []) {
      if (typeof piece.text === 'string') parts.push(piece.text);
    }
  }
  return parts.join('').trim();
}

function cleanAnswer(text) {
  const trimmed = String(text ?? '').replace(/\s+/g, ' ').trim();
  if (!trimmed) return null;
  return trimmed.slice(0, 600);
}

export async function POST(request) {
  if (!sameOrigin(request)) return json({ error: 'forbidden' }, 403);
  if (overRateLimit(clientKey(request))) return json({ error: 'too many requests' }, 429);

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return json({ error: 'examination service is not configured' }, 503);

  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) return json({ error: 'payload too large' }, 413);
  let payload;
  try {
    payload = JSON.parse(raw);
  } catch {
    return json({ error: 'invalid payload' }, 400);
  }
  if (!validPayload(payload)) return json({ error: 'invalid payload' }, 400);

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
        store: false,
        max_output_tokens: MAX_OUTPUT_TOKENS,
        instructions: SYSTEM,
        input: JSON.stringify({
          facts: payload.facts,
          seen: payload.seen ?? [],
          question: payload.question.trim(),
        }),
        text: {
          format: {
            type: 'json_schema',
            name: 'examination_answer',
            strict: true,
            schema: {
              type: 'object',
              additionalProperties: false,
              properties: { answer: { type: 'string' } },
              required: ['answer'],
            },
          },
        },
      }),
    });
    if (!upstream.ok) {
      const detail = await upstream.text();
      console.error(`examine upstream ${upstream.status}: ${detail.slice(0, 500)}`);
      return json({ error: 'examination service failed' }, 502);
    }
    const reply = JSON.parse(replyText(await upstream.json()));
    const answer = cleanAnswer(reply.answer);
    if (!answer) throw new Error('the model returned an unusable answer');
    return json({ answer }, 200);
  } catch (error) {
    console.error(`examine failed: ${error.message}`);
    return json({ error: 'examination service failed' }, 502);
  } finally {
    clearTimeout(timer);
  }
}
