// Being hit by a thrown object is not a street incident that passes. The
// person comes over and says so.
//
// One state machine per actor, stepped by whichever scene component owns that
// figure. The component supplies the current position and takes back a
// position to move to; this module owns the timing, the walk, and the words.

import { notice } from './notices.js';
import { recordGrievance } from './grievances.js';

// Close enough to be spoken to, and no closer: they stop an arm's length off.
const SPEAK_DISTANCE = 1.75;
const APPROACH_SPEED = 1.5;
// Getting off a bench takes about as long as the stand-up clip.
const ROUSE_SECONDS = 1.35;
const SPEAK_SECONDS = 5;
// They give up if the player outruns them or hides behind the terrain.
const CHASE_SECONDS = 22;
const ABANDON_DISTANCE = 40;

export const CONFRONT_PHASE = Object.freeze({
  ROUSING: 'rousing',
  APPROACHING: 'approaching',
  SPEAKING: 'speaking',
  DONE: 'done',
});

// Grouped by who they are, not by what was thrown: a policeman answers a
// cabbage and an apple the same way, and one line per object would be forty
// lines saying the same thing. {item} is the object's label, lowercased.
const LINES = Object.freeze({
  police: Object.freeze([
    'Did you just throw a {item} at an officer of the LAW? Are you MAD, sir? Give me one reason I should not run you in this instant.',
    'That is an ASSAULT on a police officer, sir. A {item}! I have taken men to the Tombs for less.',
    'You will stand STILL, sir. Throwing a {item} at a patrolman on his post — what in HEAVEN possessed you?',
  ]),
  doorman: Object.freeze([
    'A {item}, sir. At MY door. In front of the GUESTS. You will take yourself off this pavement.',
    'Did you THROW that at me? I have stood this door eleven years and never been used so, sir. NEVER.',
  ]),
  gentleman: Object.freeze([
    'Did you THROW a {item} at ME? What in the WORLD were you thinking, sir?',
    'A {item}, sir! At a stranger in a public park! Have you no BREEDING whatever?',
    'You will apologise this INSTANT, sir, or I shall find a policeman and we shall see about it.',
    'I am struck by a {item} in broad daylight. Is this what the city has COME to?',
  ]),
  lady: Object.freeze([
    'Did you THROW a {item} at me? At ME, sir? Explain yourself AT ONCE.',
    'How DARE you, sir. A {item}! I have a mind to call for an officer and I may YET.',
    'I am walking in a public park and a grown man throws a {item} at my HEAD. You should be ASHAMED.',
    'You will not do that again, sir. Not to me, and not to ANYONE. Do you understand me?',
  ]),
  tradesman: Object.freeze([
    'Oi! A {item}, was it? I work for my living, sir, and I will not be PELTED at it.',
    'You throw that at me again and we shall SEE who is laughing. A {item}! At a working man!',
    'That is a fine joke to a gentleman, I dare say. It is not a joke to ME.',
  ]),
  keeper: Object.freeze([
    'This is a public park, sir, and I KEEP it. Throwing a {item} about like a schoolboy — get off my beds.',
    'A {item}. At the man who tends the ground you are STANDING on. Have you nothing better to do?',
  ]),
  boy: Object.freeze([
    'Hey! You hit me with a {item}! I am TELLING, mister, and my mother will have the police on you!',
    'What did you do THAT for? That HURT! You are a rotten sort of a man!',
  ]),
});

// Rig letters and agent kinds both land here, so a caller can pass whichever
// it has to hand.
const GROUPS = Object.freeze({
  p: 'police', policeman: 'police',
  dm: 'doorman', doorman: 'doorman',
  m: 'gentleman', y: 'gentleman', o: 'gentleman', teddy: 'gentleman',
  w: 'lady', d: 'lady', s: 'lady', f: 'lady', h: 'lady',
  l: 'lady', r: 'lady', n: 'lady',
  v: 'tradesman', c: 'tradesman', x: 'tradesman',
  g: 'keeper', gardener: 'keeper',
  b: 'boy',
});

export function confrontationGroup(archetype, kind) {
  return GROUPS[archetype] ?? GROUPS[kind] ?? 'gentleman';
}

function hash(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  }
  return (h ^ (h >>> 15)) >>> 0;
}

export function confrontationLine(group, itemLabel, seed = '') {
  const lines = LINES[group] ?? LINES.gentleman;
  const line = lines[hash(`${group}:${seed}`) % lines.length];
  return line.replace('{item}', String(itemLabel || 'thing').toLowerCase());
}

const active = new Map();

/**
 * Something hit this actor. Start them toward the player.
 *
 * `seated` delays the walk by the length of the stand-up clip. Re-provoking
 * someone already on their way only refreshes the deadline — being hit twice
 * does not restart the approach.
 */
export function provokeConfrontation(actorId, {
  itemLabel = 'thing',
  archetype = null,
  kind = null,
  name = null,
  dialogueId = null,
  seated = false,
  now = 0,
} = {}) {
  if (!actorId) return null;
  const existing = active.get(actorId);
  if (existing && existing.phase !== CONFRONT_PHASE.DONE) {
    existing.giveUpAt = now + CHASE_SECONDS;
    return existing;
  }
  const group = confrontationGroup(archetype, kind);
  const state = {
    actorId,
    group,
    name: name || 'Someone',
    itemLabel,
    phase: seated ? CONFRONT_PHASE.ROUSING : CONFRONT_PHASE.APPROACHING,
    phaseUntil: seated ? now + ROUSE_SECONDS : Infinity,
    giveUpAt: now + CHASE_SECONDS,
    line: confrontationLine(group, itemLabel, `${actorId}:${itemLabel}`),
    spoken: false,
  };
  active.set(actorId, state);
  if (dialogueId) recordGrievance(dialogueId, 'pelted', Date.now());
  return state;
}

export function confrontationFor(actorId) {
  const state = active.get(actorId);
  return state && state.phase !== CONFRONT_PHASE.DONE ? state : null;
}

export function confrontationHoldsPost(actorId) {
  return Boolean(confrontationFor(actorId));
}

/**
 * Advance one actor and say where they should be.
 *
 * Returns null when there is nothing to do, so a caller can keep its normal
 * placement. Otherwise `{ phase, x, z, yaw, walking }` — x/z is a straight
 * line toward the player, which is enough on open pavement and keeps the
 * angry party off the walk graph.
 */
export function stepConfrontation(actorId, {
  x, z, playerX, playerZ, delta = 0, now = 0,
}) {
  const state = active.get(actorId);
  if (!state || state.phase === CONFRONT_PHASE.DONE) return null;

  const toPlayerX = playerX - x;
  const toPlayerZ = playerZ - z;
  const distance = Math.hypot(toPlayerX, toPlayerZ);
  const yaw = Math.atan2(toPlayerX, toPlayerZ);

  if (state.phase === CONFRONT_PHASE.ROUSING) {
    if (now < state.phaseUntil) return { phase: state.phase, x, z, yaw, walking: false };
    state.phase = CONFRONT_PHASE.APPROACHING;
  }

  if (state.phase === CONFRONT_PHASE.APPROACHING) {
    if (now >= state.giveUpAt || distance > ABANDON_DISTANCE) {
      state.phase = CONFRONT_PHASE.DONE;
      return null;
    }
    if (distance > SPEAK_DISTANCE) {
      const step = Math.min(APPROACH_SPEED * Math.min(delta, 0.1), distance - SPEAK_DISTANCE);
      return {
        phase: state.phase,
        x: x + (toPlayerX / distance) * step,
        z: z + (toPlayerZ / distance) * step,
        yaw,
        walking: true,
      };
    }
    state.phase = CONFRONT_PHASE.SPEAKING;
    state.phaseUntil = now + SPEAK_SECONDS;
  }

  if (!state.spoken) {
    state.spoken = true;
    notice(`${state.name}: “${state.line}”`, {
      tone: 'warn',
      seconds: SPEAK_SECONDS + 3,
      key: `confront:${actorId}`,
    });
  }
  if (now >= state.phaseUntil) state.phase = CONFRONT_PHASE.DONE;
  return { phase: CONFRONT_PHASE.SPEAKING, x, z, yaw, walking: false };
}

export function releaseConfrontation(actorId) {
  active.delete(actorId);
}

export function resetConfrontationsForTests() {
  active.clear();
}
