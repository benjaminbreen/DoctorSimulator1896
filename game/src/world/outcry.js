// Who shouts when something happens in the street, and what they shout.
//
// The simulation has already decided what happened and who saw it. This module
// only picks the one person worth hearing and hands their line to the
// announcement panel; it decides nothing about the world.
//
// DRAFT CONTENT: the period wording needs Ben's review before it is settled
// (docs/decisions.md, historical content).

import { listAgents } from './agents.js';
import { announce, CARRY } from './announcements.js';
import { CONCERN_LEVELS } from './witnessMemory.js';
import { ROOSEVELT_SPEECH_END_HOUR } from './teddyRoosevelt.js';
import { edition, headlineFor } from './newspapers.js';

// An officer challenges what he can see happen, not what happens on the next
// block. Roughly the eyeshot witnessMemory grants a bystander, tightened
// because a challenge is a stronger claim than a memory.
const OFFICER_EARSHOT = 22;
// Below 'concerned' nobody raises their voice.
const MIN_CRY_CONCERN = CONCERN_LEVELS.indexOf('concerned');

const HELP_CRIES = Object.freeze({
  player: [
    'You there — are you hurt? Somebody fetch a doctor!',
    'Sir! Sir, don’t move. Is there a doctor in the park?',
  ],
  person: [
    'A man is down in the road! Is there a doctor here?',
    'Somebody run for a doctor — quick, now, before that team comes round again!',
    'Help here! There is a person under those wheels!',
  ],
  pushcart: [
    'He has smashed the man’s cart to splinters and driven straight on!',
    'Did you see that? Straight through the cart, and never slowed!',
  ],
  vehicles: [
    'Mind yourselves — they have run into one another!',
    'Look at that, then. Two of them, square in the road.',
  ],
});

const POLICE_CHALLENGES = Object.freeze({
  pelting: [
    'You there! I saw that thrown. Stand where you are, sir.',
    'Throwing things in a public park, is it? Come here to me, sir.',
  ],
  theft: [
    'Put that back where you found it, sir. I have been watching you.',
    'That is another man’s goods you have in your hand. Set it down.',
  ],
});

// A driver who has just missed the player, or one the player is standing in
// front of. Both are past in a moment, so the lines are short.
const DRIVER_WARNINGS = Object.freeze({
  team: [
    'Look alive there! Do you want the wheels over you?',
    'Out of the road, sir! I cannot stop this for you!',
    'Mind yourself! I have two ton behind me!',
    'Hi! Off the carriageway, unless you fancy the hospital!',
  ],
  motor: [
    'Have a care! This machine does not stop for anybody!',
    'Out of the way of the motor, sir! Are you deaf as well as blind?',
    'Mind yourself — I cannot pull this up like a horse!',
  ],
  blocked: [
    'Will you kindly move, sir? I cannot drive through you.',
    'You are standing in the road, sir. In the road, in front of a motor carriage.',
    'Are you going to stand there all morning? Some of us are expected somewhere.',
  ],
});

// A whistle is the officer's own noise; the words are what follows it.
const POLICE_WHISTLE = Object.freeze([
  'Stand back there, the lot of you! Give them air!',
  'Hold that traffic! Nothing moves till I say so!',
  'Clear the road! You there, stop that team!',
]);

// The fallback for a boy with no paper assigned. Everything else he shouts
// comes off his own front page (newspapers.js).
const PAPER_CRIES = Object.freeze([
  'Papers! Morning papers, two cents!',
  'Paper, sir? All the day’s news for two cents!',
  'Get your Sun here! Convention news, full account!',
]);

// The man whose goods just left his cart, when no officer is there to say it
// for him.
const VENDOR_SCOLDS = Object.freeze([
  'Oi! That is not free, sir! A penny is the price!',
  'You put that back, sir, or you pay me for it!',
  'I saw that! I see everything off this cart, sir!',
]);

// Walked into hard enough to stagger somebody.
const BUMP_PROTESTS = Object.freeze([
  'Mind yourself, sir! There is a whole park to walk in!',
  'Steady on! You very nearly had me over.',
  'Sir. You might look where you are going.',
]);

// The man on the door, to somebody coming up to it.
const DOOR_GREETINGS = Object.freeze([
  'Good day, sir. Guest of the house?',
  'Sir. The door is this way, if you are stopping here.',
  'Afternoon, sir. Shall I have somebody take your bag?',
]);

// The keeper, finding somebody standing in his planting.
const BED_REPRIMANDS = Object.freeze([
  'Off the beds, sir! Those went in a fortnight ago!',
  'Sir! That is planting you are standing in — use the walk!',
  'Mind where you put your feet! I have to answer for those beds!',
]);

// Said to a player who is down in the road and cannot get up yet.
const HELP_THE_PLAYER = Object.freeze([
  'Don’t try to stand, sir. Lie still — somebody has gone for help.',
  'Easy now, sir. Can you hear me? Don’t move your head.',
  'He’s down! Give him air, the rest of you — sir, can you speak?',
]);

// The late watch, moving a lingerer along.
const NIGHT_WATCH = Object.freeze([
  'Move along now, sir. The park is no place to be at this hour.',
  'Nothing open at this time of night, sir. Best get yourself home.',
  'You have business out here at this hour, sir? Then be about it.',
]);

// Hotel and club staff, on a stranger walking in.
const LOBBY_GREETINGS = Object.freeze([
  'Good day, sir. Are you expected at the house?',
  'Sir. Anything I can carry for you, or shall I fetch the desk?',
  'Welcome, sir. Is somebody looking for you?',
]);

// The club is members and their guests, and the hall boy knows every face.
const CLUB_CHALLENGES = Object.freeze([
  'I beg your pardon, sir — members and their guests only. Are you meeting somebody?',
  'This is a private club, sir. I do not believe I know your face.',
  'Sir. If you are not a member, you will want the street door again.',
]);

// The Commissioner at the Cop Cot. Paraphrase in his manner, not quotation:
// nothing here is offered as something Roosevelt is recorded as saying.
const ORATION = Object.freeze([
  'A patrolman is paid to walk his post, and I mean to know whether he walks it!',
  'There is no such thing as a little corruption, gentlemen. There is honesty, and there is the other thing.',
  'The excise law is a law. I did not write it, and I will not wink at it.',
  'I want men on this force who are brave, and clean, and who need no watching!',
  'You will find me on the streets at two in the morning, and I advise the roundsmen to expect me.',
]);

function pick(lines, seed) {
  return lines[Math.abs(Math.trunc(seed)) % lines.length];
}

// The nearest sworn officer who could have seen it happen.
export function officerWithinEarshot(x, z, radius = OFFICER_EARSHOT, agents = listAgents()) {
  let best = null;
  let bestDistance = radius;
  for (const agent of agents) {
    const isOfficer = agent?.kind === 'policeman' || agent?.dialogueContext?.archetype === 'p';
    if (!isOfficer || !Number.isFinite(agent.x)) continue;
    const distance = Math.hypot(agent.x - x, agent.z - z);
    if (distance > bestDistance) continue;
    best = agent;
    bestDistance = distance;
  }
  return best;
}

// The bystander who took it hardest, excluding whoever it happened to: the
// person under the wheels is not the one shouting for help.
export function loudestWitness(witnesses = []) {
  let best = null;
  for (const entry of witnesses) {
    if (!entry?.agent?.dialogueName || entry.involvedSelf) continue;
    if (CONCERN_LEVELS.indexOf(entry.concern) < MIN_CRY_CONCERN) continue;
    if (!best || CONCERN_LEVELS.indexOf(entry.concern) > CONCERN_LEVELS.indexOf(best.concern)
      || (entry.concern === best.concern && entry.distance < best.distance)) best = entry;
  }
  return best;
}

function challengeOfficer(kind, x, z, seed) {
  const officer = officerWithinEarshot(x, z);
  if (!officer) return null;
  return announce({
    line: pick(POLICE_CHALLENGES[kind], seed),
    speaker: officer.dialogueName ?? 'A policeman',
    station: 'On his post',
    carry: CARRY.law,
    key: `law:${kind}:${officer.id}`,
    seconds: 7,
    anchorId: officer.id,
  });
}

/**
 * A street event has just been recorded. Somebody says so.
 *
 * `witnesses` is what recordWitnesses graded. A pelting is the player's doing,
 * so the officer's challenge outranks any bystander; the victim's own answer
 * is the confrontation's business, not this one's.
 */
export function raiseStreetOutcry(event, witnesses = []) {
  if (!event) return null;
  if (event.kind === 'pelting') {
    if (event.targetKind === 'policeman') return null;
    return challengeOfficer('pelting', event.x, event.z, event.id);
  }
  const crier = loudestWitness(witnesses);
  if (!crier) return null;
  const lines = event.targetKind === 'player' ? HELP_CRIES.player
    : HELP_CRIES[event.targetKind] ?? HELP_CRIES.person;
  const hurt = lines === HELP_CRIES.player || lines === HELP_CRIES.person;
  return announce({
    line: pick(lines, event.id + crier.distance),
    speaker: crier.agent.dialogueName,
    station: 'A witness',
    carry: hurt ? CARRY.alarm : CARRY.street,
    key: `outcry:${event.id}`,
    seconds: hurt ? 7 : 5,
    anchorId: crier.agent.id,
  });
}

/** The player has helped himself to a cart. An officer in sight says so. */
export function raiseTheftOutcry({ x, z, seed = 0 } = {}) {
  if (!Number.isFinite(x) || !Number.isFinite(z)) return null;
  return challengeOfficer('theft', x, z, seed);
}

/**
 * A vehicle has come within a yard of the player, or is stopped because he is
 * standing in front of it. `kind` picks whose mouth it comes out of.
 */
export function raiseDriverWarning({
  x, y, z, unitId = '', kind = 'team', seed = 0,
} = {}) {
  return announce({
    line: pick(DRIVER_WARNINGS[kind] ?? DRIVER_WARNINGS.team, seed),
    speaker: 'The driver',
    station: 'On the box',
    carry: CARRY.alarm,
    key: `driver:${kind}:${unitId}`,
    seconds: 5,
    position: [x, y, z],
  });
}

/** An officer takes charge of a crash on his beat. */
export function raisePoliceWhistle(event, officer) {
  if (!event || !officer) return null;
  return announce({
    line: pick(POLICE_WHISTLE, event.id),
    speaker: officer.dialogueName ?? 'A policeman',
    station: 'On his post',
    carry: CARRY.law,
    key: `whistle:${event.id}`,
    seconds: 6,
    anchorId: officer.id,
  });
}

// Prices come from the vendor's own stock list, so the cry and the sale agree.
function priceWords(cents) {
  if (cents === 1) return 'a penny';
  if (cents < 100) return `${cents} cents`;
  const dollars = cents / 100;
  return `${Number.isInteger(dollars) ? dollars : dollars.toFixed(2)} dollars`;
}

/** A tradesman calls to the player as he comes within range of the pitch. */
export function raiseHawk({
  archetype, speaker, sells = [], anchorId, seed = 0,
} = {}) {
  const good = sells[Math.abs(Math.trunc(seed)) % Math.max(1, sells.length)];
  const line = archetype === 'c'
    ? 'Cab, sir? Anywhere in the city, and quicker than walking.'
    : good && `${good.label[0].toLocaleUpperCase('en-US')}${good.label.slice(1)}, sir — ${priceWords(good.priceCents)}, and fresh this morning.`;
  if (!line) return null;
  return announce({
    line,
    speaker,
    station: 'Crying his trade',
    carry: CARRY.street,
    key: `hawk:${anchorId}`,
    seconds: 5,
    anchorId,
  });
}

/**
 * A newsboy cries the papers. Once the Commissioner has spoken he has
 * something to sell them on; the hours match parkBulletin's.
 */
export function raiseNewsboyCry({
  hour, paper, speaker = 'A newsboy', anchorId, seed = 0,
} = {}) {
  const h = ((Number(hour) || 0) % 24 + 24) % 24;
  const sheet = edition(paper);
  const headline = headlineFor(paper, h, seed);
  // The speech is the one thing he saw himself, and only while it is news.
  const spoken = h >= ROOSEVELT_SPEECH_END_HOUR && h < ROOSEVELT_SPEECH_END_HOUR + 1.5;
  // Every third cry leads with the masthead and the price: it is how a boy
  // working one corner breaks up the same eight headlines all day.
  const priceWord = sheet?.priceCents === 1 ? 'One cent' : `${sheet?.priceCents} cents`;
  const line = spoken
    ? 'Commissioner Roosevelt speaks in the park this morning! Read it in to-morrow\u2019s paper!'
    : (!headline || !sheet
      ? pick(PAPER_CRIES, seed)
      : (Math.abs(Math.trunc(seed) + h) % 3 === 0
        ? `${sheet.masthead}! ${priceWord}! ${headline}`
        : headline));
  return announce({
    line,
    speaker,
    station: 'Crying the papers',
    carry: CARRY.street,
    key: `papers:${anchorId}`,
    seconds: 6,
    anchorId,
  });
}

/** The vendor says it himself, when there is no officer to say it for him. */
export function raiseVendorScold({ speaker = 'A pushcart vendor', anchorId, seed = 0 } = {}) {
  return announce({
    line: pick(VENDOR_SCOLDS, seed),
    speaker,
    station: 'At his cart',
    carry: CARRY.alarm,
    key: `scold:${anchorId}`,
    seconds: 6,
    anchorId,
  });
}

/** Somebody the player has just walked into hard enough to stagger. */
export function raiseBumpProtest({ speaker, anchorId, seed = 0 } = {}) {
  if (!speaker) return null;
  return announce({
    line: pick(BUMP_PROTESTS, seed),
    speaker,
    station: null,
    carry: CARRY.street,
    key: `bump:${anchorId}`,
    seconds: 5,
    anchorId,
  });
}

/** The doorman, as somebody comes up to his door. */
export function raiseDoorGreeting({ speaker = 'A hotel doorman', anchorId, seed = 0 } = {}) {
  return announce({
    line: pick(DOOR_GREETINGS, seed),
    speaker,
    station: 'At the hotel door',
    carry: CARRY.street,
    key: `door:${anchorId}`,
    seconds: 6,
    anchorId,
  });
}

/** The keeper catches the player standing in his planting. */
export function raiseBedReprimand({ speaker = 'The park keeper', anchorId, seed = 0 } = {}) {
  return announce({
    line: pick(BED_REPRIMANDS, seed),
    speaker,
    station: 'At work in the park',
    carry: CARRY.street,
    key: `beds:${anchorId}`,
    seconds: 5,
    anchorId,
  });
}

/**
 * The player is down in the road. The nearest bystander who can see it says
 * so; if there is nobody about, nobody speaks, which is its own answer.
 */
export function raiseHelpForPlayer({ x, z, radius = 18, seed = 0 } = {}) {
  let best = null;
  let bestDistance = radius;
  for (const agent of listAgents()) {
    if (!agent?.dialogueName || !Number.isFinite(agent.x)) continue;
    const distance = Math.hypot(agent.x - x, agent.z - z);
    if (distance > bestDistance) continue;
    best = agent;
    bestDistance = distance;
  }
  if (!best) return null;
  return announce({
    line: pick(HELP_THE_PLAYER, seed),
    speaker: best.dialogueName,
    station: 'Kneeling beside you',
    carry: CARRY.alarm,
    key: `down:${best.id}`,
    seconds: 7,
    anchorId: best.id,
  });
}

/** An officer moving a lingerer along after dark. */
export function raiseNightWatch({ speaker = 'A policeman', anchorId, seed = 0 } = {}) {
  return announce({
    line: pick(NIGHT_WATCH, seed),
    speaker,
    station: 'On his post',
    carry: CARRY.law,
    key: `watch:${anchorId}`,
    seconds: 6,
    anchorId,
  });
}

/**
 * Lobby staff on a stranger walking in. `challenge` is for the club, where
 * not being a member is the whole of what he has to say to you.
 */
export function raiseLobbyGreeting({
  speaker = 'A bellhop', anchorId, challenge = false, seed = 0,
} = {}) {
  return announce({
    line: pick(challenge ? CLUB_CHALLENGES : LOBBY_GREETINGS, seed),
    speaker,
    station: challenge ? 'At the club door' : 'On call in the lobby',
    carry: challenge ? CARRY.law : CARRY.street,
    key: `lobby:${anchorId}`,
    seconds: 6,
    anchorId,
  });
}

/** One line of the Cop Cot speech, spoken over the crowd. */
export function raiseOration(index, position) {
  return announce({
    line: ORATION[Math.abs(Math.trunc(index)) % ORATION.length],
    speaker: 'Mr. Roosevelt',
    station: 'Police Commissioner',
    carry: CARRY.oration,
    key: `oration:${Math.abs(Math.trunc(index)) % ORATION.length}`,
    seconds: 7,
    position,
  });
}
