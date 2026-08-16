// Server-side voice renderer for map NPC conversations. The simulation rolls
// each speaker's identity and selects what they know before Luna is called;
// Luna improvises the person within that. The API key remains in this server
// process on Vercel and in Vite dev.

import { buildCrowdDefinition } from '../game/src/world/crowdDialogue.js';

const MODEL = 'gpt-5.6-luna';
const ENDPOINT = 'https://api.openai.com/v1/responses';
const MAX_BODY_BYTES = 12000;
const MAX_OUTPUT_TOKENS = 300;
const UPSTREAM_TIMEOUT_MS = 9000;
const WINDOW_MS = 60000;
const WINDOW_LIMIT = 20;

// DRAFT period-voice guidance: the usage examples below need Ben's review
// before they are treated as settled (docs/decisions.md, historical content).
const SYSTEM = `You improvise one reply spoken aloud by a stranger in or beside Central Park, New York.

Who you are:
- The identity block is this person, rolled for this playthrough: name, age, occupation, one detail of circumstance, and a temperament. Inhabit it. If asked your name or business, give it plainly.
- Improvise the rest of your life freely around that identity — family, habits, small opinions — keeping it ordinary and consistent with everything given and with recentTurns.

What you know:
- commonKnowledge (the date, the hour, the place) is always yours to state.
- whereabouts is truthfully where you are headed or what you are doing.
- bulletin lines are what everyone in the park knows just now. Bring one up when it fits, in your own words.
- witnessed lines are things you saw with your own eyes minutes ago. Each states how much it weighed on you — play that weight honestly. A shaken witness brings it up unasked; an annoyed one grumbles if it comes up; an unmoved one shrugs. If it happened to the very person you are speaking with, address it.
- If you sell goods, the sells list is your stock and its true price. You may hawk it. When the player hands money over, the sale has already happened — take it graciously and hand the thing across; never refuse, re-price, or ask for more.
- A grievance means this player stole from you and you know it. Say so plainly and demand payment. If they have just paid, drop it at once and be gruffly civil again — a penny settled is a penny settled.
- Beyond these, invent no public event and no named third person of consequence. Asked about something you cannot know, answer as a real stranger would: a guess, an opinion, a question back, or what you do know instead. A flat "couldn't say" is a last resort.
- Do not diagnose the player, decide an outcome, offer a quest, or change game state.

Voice, 1890s American:
- Plain, direct, spoken English. Contractions are natural. Answer the question first, then add a human touch if one fits.
- Address a man as "sir" and a woman as "ma'am" unless the conversation has grown familiar.
- Period phrasing where it comes naturally: "I reckon," "a good ways," "directly," "of an evening," "the cars" for streetcars, "a wheel" for a bicycle.
- No slang or idiom coined after the period. Equally, no stage-Victorian stuffiness: real people did not say "I dare say, my good man."
- Register follows station: a laborer is blunt and short, a clerk more careful, a person of means more measured. Follow the given temperament.
- One to four sentences. Return the spoken line without quotation marks.

behavior is one visible action, at most eight words, no thoughts and no new facts. A phrase, not a sentence: "folds her hands", "glances up the path", "shifts the basket to her other arm".`;

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
  'August', 'September', 'October', 'November', 'December'];

// Rolled habits, phrased for the model rather than sent as raw tags.
const INCLINATIONS = {
  'flower-fancier': 'You have a weakness for the flower beds and will stop to admire them.',
  gallant: 'You fancy yourself charming with the ladies; the ladies mostly do not agree.',
  quarrelsome: 'You have a short temper and a long memory for slights.',
};

function hourPhrase(hour, minute) {
  const period = hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : hour < 21 ? 'evening' : 'night';
  const onTwelve = hour % 12 === 0 ? 12 : hour % 12;
  const clock = minute >= 45 ? `getting on toward ${onTwelve % 12 + 1} o'clock`
    : minute >= 15 ? `past ${onTwelve} o'clock`
      : `about ${onTwelve} o'clock`;
  return `${clock} in the ${period}`;
}

function commonKnowledge(worldTime) {
  const t = { year: 1896, month: 6, date: 15, hour: 12, minute: 0, ...worldTime };
  return [
    `The date is ${MONTHS[t.month - 1]} ${t.date}, ${t.year}.`,
    `The hour is ${hourPhrase(t.hour, t.minute)}.`,
    'This is Central Park in New York City.',
  ];
}

function validWorldTime(t) {
  return Boolean(t)
    && Number.isFinite(t.year) && t.year >= 1890 && t.year <= 1910
    && Number.isFinite(t.month) && t.month >= 1 && t.month <= 12
    && Number.isFinite(t.date) && t.date >= 1 && t.date <= 31
    && Number.isFinite(t.hour) && t.hour >= 0 && t.hour < 24
    && Number.isFinite(t.minute) && t.minute >= 0 && t.minute < 60;
}

// Witnessed entries arrive as validated enums, never free text, and become
// sentences only here — a compromised client cannot inject prompt content.
const WITNESS_TARGETS = new Set(['pedestrian', 'player', 'pushcart', 'doorman',
  'policeman', 'horse-drawn-vehicle', 'horseless-carriage', 'horse-team']);
const CONCERNS = new Set(['unmoved', 'annoyed', 'concerned', 'shaken', 'outraged']);

function validWitnessed(list) {
  if (list === undefined) return true;
  return Array.isArray(list) && list.length <= 4 && list.every((entry) => Boolean(entry)
    && (entry.targetKind === null || WITNESS_TARGETS.has(entry.targetKind))
    && typeof entry.involvedPlayer === 'boolean'
    && (entry.involvedSelf === undefined || typeof entry.involvedSelf === 'boolean')
    && (entry.concern === undefined || CONCERNS.has(entry.concern))
    && Number.isFinite(entry.minutesAgo) && entry.minutesAgo >= 0 && entry.minutesAgo <= 120);
}

// How much the sight weighed on this particular witness. The simulation
// grades it from proximity and rolled composure; the model must play the
// grade, not escalate every fender-scrape into a tragedy.
const CONCERN_PHRASES = {
  unmoved: 'It hardly registered; you would mention it only if asked, and briefly.',
  annoyed: 'To you it was a nuisance, not a tragedy — careless driving, worth a grumble at most.',
  concerned: 'It troubled you; you hope nobody was badly hurt, and it may color your talk.',
  shaken: 'It genuinely shook you. It is the first thing on your mind and it shows.',
  outraged: 'You are the injured party and you are angry about it — this is YOUR loss, and you want it known.',
};

function witnessSentence(entry) {
  const when = entry.minutesAgo <= 2 ? 'moments ago' : `some ${Math.round(entry.minutesAgo)} minutes ago`;
  const weight = CONCERN_PHRASES[entry.concern] ?? CONCERN_PHRASES.concerned;
  if (entry.involvedSelf) {
    return `${when[0].toUpperCase()}${when.slice(1)}, a vehicle struck your own cart and goods in the street near here. ${CONCERN_PHRASES.outraged}`;
  }
  if (entry.involvedPlayer) {
    return `With your own eyes, ${when}, you saw a vehicle strike the very person you are now speaking with, in the street near here. ${weight}`;
  }
  if (entry.targetKind === 'pushcart') {
    return `With your own eyes, ${when}, you saw a vehicle smash into a vendor's pushcart in the street near here. ${weight}`;
  }
  if (entry.targetKind === 'pedestrian' || entry.targetKind === 'doorman' || entry.targetKind === 'policeman') {
    return `With your own eyes, ${when}, you saw a vehicle strike somebody in the street near here. ${weight}`;
  }
  return `With your own eyes, ${when}, you saw two vehicles collide in the street near here. ${weight}`;
}

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
  return forwarded.split(',')[0].trim() || request.headers.get('x-real-ip') || 'local-npc';
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

// Speakers exist only in the client's simulation. Their deterministic context
// arrives with the request and rebuilds the identical definition here, so the
// model still sees only simulation-owned identity and knowledge.
const GRIEVANCE_KINDS = new Set(['theft']);

function validGrievance(g) {
  if (g === undefined) return true;
  return Boolean(g) && GRIEVANCE_KINDS.has(g.kind)
    && Number.isFinite(g.count) && g.count >= 0 && g.count <= 999
    && Number.isFinite(g.minutesAgo) && g.minutesAgo >= 0 && g.minutesAgo <= 600;
}

// Goods are echoed back to the model, so they are re-derived from the
// simulation's own list rather than trusted from the wire.
function validSells(list) {
  if (list === undefined) return true;
  return Array.isArray(list) && list.length <= 4 && list.every((good) => Boolean(good)
    && typeof good.id === 'string' && good.id.length <= 32
    && typeof good.label === 'string' && good.label.length <= 48
    && Number.isFinite(good.priceCents) && good.priceCents >= 0 && good.priceCents <= 10000);
}

function validCrowdContext(context) {
  return Boolean(context)
    && typeof context.archetype === 'string' && context.archetype.length <= 2
    && typeof context.role === 'string' && context.role.length <= 32
    && typeof context.activity === 'string' && context.activity.length <= 32
    && Number.isFinite(context.hour) && context.hour >= 0 && context.hour < 24
    && Number.isFinite(context.identitySeed)
    && (context.age === undefined || Number.isFinite(context.age))
    && validWitnessed(context.witnessed)
    && validGrievance(context.grievance)
    && validSells(context.sells);
}

function validPayload(body) {
  return body?.schemaVersion === 2
    && body.task === 'render-npc-dialogue'
    && typeof body.npcId === 'string'
    && body.npcId.length <= 64
    && validCrowdContext(body.crowdContext)
    && Boolean(buildCrowdDefinition(body.npcId, body.crowdContext))
    && typeof body.playerText === 'string'
    && body.playerText.trim().length > 0
    && body.playerText.length <= 400
    && (!body.recentTurns || (Array.isArray(body.recentTurns) && body.recentTurns.length <= 6))
    && (body.worldTime === undefined || validWorldTime(body.worldTime));
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

// A strict JSON schema constrains the shape, not what goes inside a string:
// a model that loses the thread mid-generation can still return well-formed
// JSON full of braces and stray scripts. Anything outside plain English
// punctuation is a generation failure, not a line of dialogue.
const PLAIN_LINE = /^[A-Za-z0-9À-ÖØ-öø-ÿ .,;:!?'’‘"“”()\-—–\n]+$/;

function cleanLine(value, maxWords) {
  const text = String(value ?? '').trim();
  if (!text) return '';
  if (!PLAIN_LINE.test(text)) return null;
  if (text.split(/\s+/).length > maxWords) return null;
  return text;
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
  if (!validPayload(payload)) return json({ error: 'invalid payload' }, 400);

  const npc = buildCrowdDefinition(payload.npcId, payload.crowdContext);
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
          identity: {
            appearance: npc.name,
            name: npc.identity.name,
            sex: npc.identity.sex,
            age: npc.identity.age,
            profession: npc.identity.profession,
            detail: npc.identity.detail,
            temperament: npc.identity.temperament,
            ...(INCLINATIONS[npc.identity.quirk]
              ? { inclination: INCLINATIONS[npc.identity.quirk] }
              : {}),
            currentlyDoing: npc.role,
          },
          whereabouts: npc.whereabouts,
          commonKnowledge: commonKnowledge(payload.worldTime),
          bulletin: npc.bulletin,
          witnessed: npc.witnessed.map(witnessSentence),
          ...(npc.sells.length > 0 ? {
            sells: npc.sells.map((good) => `${good.label}, price ${good.priceCents} cent${good.priceCents === 1 ? '' : 's'}`),
          } : {}),
          ...(npc.grievance ? {
            grievance: `This same person took ${npc.grievance.count > 1 ? `${npc.grievance.count} items` : 'goods'} from your cart without paying, ${npc.grievance.minutesAgo <= 2 ? 'moments ago' : `about ${npc.grievance.minutesAgo} minutes ago`}.`,
          } : {}),
          playerText: payload.playerText.trim(),
          recentTurns: (payload.recentTurns || []).slice(-6).map((turn) => ({
            player: String(turn?.player || '').slice(0, 400),
            npc: String(turn?.npc || '').slice(0, 600),
          })),
        }),
        text: {
          format: {
            type: 'json_schema',
            name: 'npc_reply',
            strict: true,
            schema: {
              type: 'object',
              additionalProperties: false,
              properties: {
                dialogue: { type: 'string' },
                behavior: { type: 'string' },
              },
              required: ['dialogue', 'behavior'],
            },
          },
        },
      }),
    });
    if (!upstream.ok) {
      const detail = await upstream.text();
      console.error(`npc dialogue upstream ${upstream.status}: ${detail.slice(0, 500)}`);
      return json({ error: 'dialogue service failed' }, 502);
    }
    const reply = JSON.parse(replyText(await upstream.json()));
    const dialogue = cleanLine(reply.dialogue, 120);
    if (!dialogue) throw new Error('the model returned unusable dialogue');
    // Behavior is decorative: drop a bad one and let the ribbon go without.
    return json({ dialogue, behavior: cleanLine(reply.behavior, 12) ?? '' }, 200);
  } catch (error) {
    console.error(`npc dialogue failed: ${error.message}`);
    return json({ error: 'dialogue service failed' }, 502);
  } finally {
    clearTimeout(timer);
  }
}
