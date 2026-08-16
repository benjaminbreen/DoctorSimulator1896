// Procedural speakers for the ambient crowd. A definition is built on demand
// from the agent snapshot: identity, current task, bulletin, and what they
// witnessed. DRAFT CONTENT — the period voice below needs Ben's review.

import { getAgent, listAgents } from './agents.js';
import { registerNpcDialogueProvider } from './npcDialogue.js';
import { hashSeed, knownArchetype, pickSeeded, rollIdentity } from './npcIdentity.js';
import { parkBulletin } from './parkBulletin.js';
import { CONCERN_LEVELS, witnessedBy } from './witnessMemory.js';
import { grievanceAgainst } from './grievances.js';
import { getRunSeed } from './runSeed.js';

// What the ribbon shows for a stranger. The player never learns a name
// unless they ask for it in conversation.
const DESCRIPTORS = Object.freeze({
  m: { descriptor: 'A man in a bowler hat', pronoun: 'He' },
  w: { descriptor: 'A woman in working dress', pronoun: 'She' },
  f: { descriptor: 'A woman in her forties', pronoun: 'She' },
  h: { descriptor: 'A straw-hatted stroller', pronoun: 'She' },
  s: { descriptor: 'A woman in mourning dress', pronoun: 'She' },
  g: { descriptor: 'The park keeper', pronoun: 'He' },
  p: { descriptor: 'A policeman', pronoun: 'He' },
  d: { descriptor: 'A woman in a summer dress', pronoun: 'She' },
  dm: { descriptor: 'A hotel doorman', pronoun: 'He' },
  y: { descriptor: 'A well-dressed young man', pronoun: 'He' },
  b: { descriptor: 'A boy in a sailor suit', pronoun: 'He' },
  // Built ahead of their models; wire a scene actor with the archetype and
  // they speak.
  v: { descriptor: 'A pushcart vendor', pronoun: 'He' },
  c: { descriptor: 'A cab driver', pronoun: 'He' },
  x: { descriptor: 'A newsboy', pronoun: 'He' },
  n: { descriptor: 'A nursemaid with a perambulator', pronoun: 'She' },
  r: { descriptor: 'A woman in rational dress', pronoun: 'She' },
  l: { descriptor: 'A woman in a lilac dress', pronoun: 'She' },
  o: { descriptor: 'An old man on a bench', pronoun: 'He' },
});

// Some stations answer with their own manner before activity matters.
const ARCHETYPE_OPENINGS = Object.freeze({
  p: ['Something the matter, sir?', 'Keep to the walk, sir — the teams come through quick. What is it?'],
  dm: ['Good day, sir. Guest of the house?', 'Sir. The door is this way, if you’re stopping here.'],
  y: ['Ah — good day. Do I know you?', 'Yes? Well, good day to you, sir.'],
  b: ['Sir?', 'I wasn’t doing anything, sir.'],
  v: ['Fine goods, sir, best price on the avenue. What’ll you have?', 'Buy or don’t buy, sir, but the cart must earn its corner.'],
  c: ['Cab, sir? Anywhere in the city, and quicker than walking.', 'Mind the wheels there, sir. Needing a cab?'],
  x: ['Paper, sir? All the day’s news for a penny.', 'Extra — well, near enough an extra. Paper, sir?'],
  n: ['Softly, sir, if you please — the baby is only just asleep.', 'Good day, sir. Mind the perambulator, if you would.'],
  r: ['A fine day for wheeling, sir — I’ve left mine at home.', 'Good day. You may stare at the costume if you must; most do.'],
  o: ['Sit down if you like, young man. The bench holds two.', 'Good day to you. I’m in no hurry if you’re not.'],
});

// Where the scheduler truthfully has them headed. Ground truth for the
// model; also the offline answer to "where are you bound".
const BOUND = Object.freeze({
  commuter: 'on the way to work, behind time already',
  errand: 'out on a household errand',
  stroller: 'taking the air, with nowhere particular to be',
  promenader: 'out for the daily promenade',
  rest: 'resting here a while before moving on',
  resident: 'on the way home',
  keeper: 'at work keeping the park',
  police: 'on duty at this post, and not free to leave it',
  doorman: 'at his post by the hotel door, and not free to leave it',
  idler: 'idling where he can be seen, in no hurry at all',
  play: 'at play, and meant to be home by supper',
  vendor: 'working his cart, and not about to leave it unwatched',
  cabman: 'waiting on a fare, and glad of talk meanwhile',
  newsboy: 'selling the day’s papers',
  nursing: 'airing her charge, on the usual loop',
  wheeling: 'out on her wheel, taking the drives',
  bench: 'settled on his bench for the afternoon, in no hurry at all',
});

const ACTIVITY_LABELS = Object.freeze({
  walking: 'Passing by',
  resting: 'Resting',
  waiting: 'Waiting at the curb',
  standing: 'Loitering',
  sitting: 'At rest on a bench',
  working: 'At work',
});

// A role can outrank the activity in the ribbon: a policeman standing still
// is on his beat, not loitering.
const ROLE_LABELS = Object.freeze({
  police: 'On his post',
  doorman: 'At the hotel door',
  idler: 'Idling',
  play: 'At play',
  keeper: 'At work in the park',
  vendor: 'At his cart',
  cabman: 'On the box',
  newsboy: 'Crying the papers',
  nursing: 'Minding the perambulator',
  wheeling: 'Awheel',
  bench: 'On his bench',
});

export function crowdSpeakerDetails({
  archetype, role, activity, hour, seed, age,
}) {
  if (!knownArchetype(archetype)) return null;
  return {
    dialogueId: null, // filled by the caller with the agent id
    dialogueName: DESCRIPTORS[archetype].descriptor,
    dialogueContext: { archetype, role, activity, hour, seed, age },
  };
}

// Live entry point: read the agent snapshot, mix the playthrough seed into
// the identity roll, and attach whatever this agent witnessed. The context
// travels with the definition so the dialogue endpoint can rebuild the
// identical definition server-side.
export function crowdDialogueDefinition(id) {
  let agent = getAgent(id);
  if (!agent?.dialogueContext) {
    // Scheduled actors (the park keeper) report under their actor id but
    // speak under their dialogue id.
    for (const candidate of listAgents()) {
      if (candidate.dialogueId === id) {
        agent = candidate;
        break;
      }
    }
  }
  const context = agent?.dialogueContext;
  if (!context) return null;
  return buildCrowdDefinition(id, {
    ...context,
    identitySeed: hashSeed(getRunSeed(), context.seed ?? 1),
    witnessed: witnessedBy(id),
    grievance: grievanceAgainst(id),
    sells: agent.sells ?? null,
  });
}

// Pure builder: same context in, same definition out, on either side of the
// network. identitySeed already has the playthrough seed mixed in.
export function buildCrowdDefinition(id, context) {
  const descriptor = DESCRIPTORS[context.archetype];
  if (!descriptor) return null;
  const seed = Math.trunc(context.identitySeed ?? context.seed ?? 1);
  const identity = rollIdentity(context.archetype, seed, { age: context.age });
  const witnessed = Array.isArray(context.witnessed) ? context.witnessed.slice(0, 4) : [];
  const sawPlayerHit = witnessed.some((entry) => entry.involvedPlayer);
  // The single strongest reaction decides the opening; 'unmoved' entries
  // still reach the model but do not hijack the greeting.
  const worstConcern = witnessed.reduce(
    (worst, entry) => Math.max(worst, CONCERN_LEVELS.indexOf(entry.concern ?? 'concerned')),
    -1,
  );

  const grievance = context.grievance ?? null;
  const sells = Array.isArray(context.sells) ? context.sells : [];

  const opening = grievance
    ? pickSeeded([
      'You! I saw you take that. Do you think I keep this cart for charity?',
      'A penny is the price, sir, and you did not pay it. Put it back or pay up.',
    ], seed, 7)
    : witnessed.some((entry) => entry.involvedSelf)
    ? pickSeeded([
      'You saw what that devil did? Right into my livelihood, and drove on!',
      'Look at this — look what they’ve done, and not so much as a word of sorry!',
    ], seed, 2)
    : sawPlayerHit && worstConcern >= 2
      ? pickSeeded([
        'Merciful heavens — are you hurt, sir? I saw the whole thing.',
        'Sir! That was a near thing in the street just now. Are you quite all right?',
      ], seed, 2)
      : worstConcern >= 3
        ? pickSeeded([
          'Did you see that in the street, sir? It gave me a proper start.',
          'Sir. A bad business in the street just now — I can hardly settle myself.',
        ], seed, 2)
        : worstConcern === 2
          ? pickSeeded([
            'A bad moment in the street just now, sir. I hope nobody was much hurt.',
            'You saw that business in the street? Somebody might have been killed.',
          ], seed, 2)
          : worstConcern === 1
            ? pickSeeded([
              'Mind how you cross, sir — the drivers are careless today.',
              'Such carelessness on the drive just now. Well — was there something?',
            ], seed, 2)
            : ARCHETYPE_OPENINGS[context.archetype]
              ? pickSeeded(ARCHETYPE_OPENINGS[context.archetype], seed, 2)
              : context.activity === 'resting' || context.activity === 'sitting'
                ? pickSeeded([
                  'Good day, sir. You find me resting my feet.',
                  'Sir. There is room on the seat, if you want it.',
                ], seed, 2)
                : pickSeeded([
                  'Good day to you, sir. Was there something?',
                  'Sir? I can spare a moment, no more.',
                ], seed, 2);

  const suggestedQuestions = [
    ...(worstConcern >= 1 ? ['What did you just see happen?'] : []),
    'Where are you bound?',
    'What is the news of the street?',
    'What is there to see in the park?',
  ].slice(0, 3);

  return {
    id,
    name: descriptor.descriptor,
    role: ROLE_LABELS[context.role] ?? ACTIVITY_LABELS[context.activity] ?? 'Passing by',
    historicalStatus: 'fictional',
    identity,
    whereabouts: BOUND[context.role] ?? BOUND.stroller,
    bulletin: parkBulletin(context.hour ?? 12),
    witnessed,
    grievance,
    sells,
    opening,
    suggestedQuestions,
    greetingDialogue: pickSeeded([
      'Good day to you, sir.',
      'And a good day to you.',
    ], seed, 3),
    fallbackDialogue: pickSeeded([
      'Couldn’t tell you, sir, though I’d not be surprised either way.',
      'You have me there. I only know what I see on my own way through.',
      'That is beyond me, sir. I keep to my own affairs and the park keeps to its.',
    ], seed, 5),
    offlineBehavior: 'glances up the path',
    clientContext: {
      archetype: context.archetype,
      role: context.role,
      activity: context.activity,
      hour: Number.isFinite(context.hour) ? context.hour : 12,
      seed,
      identitySeed: seed,
      age: context.age,
      witnessed,
      ...(grievance ? { grievance } : {}),
      ...(sells.length > 0 ? { sells } : {}),
    },
  };
}

export function installCrowdDialogue() {
  registerNpcDialogueProvider(crowdDialogueDefinition);
}
