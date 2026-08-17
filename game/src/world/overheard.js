// What the player catches in passing: a scrap of somebody else's talk, raised
// as a notice rather than spoken at him. Nothing here is addressed to the
// player and nothing here changes the world — walk on and you miss it.
//
// Two sources, both already true in the simulation: the quirk exchanges the
// crowd runs (a gallant rebuffed, a quarrel), and two people seated together
// on one bench, who talk about what they both know.
//
// DRAFT CONTENT: the period wording needs Ben's review (docs/decisions.md).

import { listAgents } from './agents.js';
import { notice } from './notices.js';
import { CONCERN_LEVELS, witnessedBy } from './witnessMemory.js';
import {
  ROOSEVELT_SPEECH_START_HOUR,
  ROOSEVELT_PARK_DEPARTURE_HOUR,
} from './teddyRoosevelt.js';

// Close enough to make out words. A quarrel carries further than bench talk.
const QUIRK_EARSHOT = 10;
const BENCH_EARSHOT = 7;
// Two people on one bench, rather than two strangers resting at either end.
const COMPANY = 1.9;
// One scrap at a time, and the same pair does not perform for you twice.
const GLOBAL_GAP_MS = 20000;
const PAIR_GAP_MS = 150000;
const MAX_PAIRS_REMEMBERED = 32;

const QUIRK_TALK = Object.freeze({
  'gallant-rebuffed': [
    'I am sure I do not know you, sir, and I do not care to.',
    'Take your hat off to somebody else. Good day.',
    'If you speak to me again I shall find a policeman.',
  ],
  'gallant-received': [
    'Well — good morning to you too, I suppose.',
    'You are very forward, sir. It is a fine day for it.',
    'Mind yourself, sir, my husband is only a step behind.',
  ],
  quarrel: [
    'Watch where you are going, can you not? There is a whole park to walk in.',
    'You walked straight into me, sir. Straight into me.',
    'I shall walk where I please and you may do the same — elsewhere.',
  ],
});

// Two sitters talk about whichever of these they both have. An incident one of
// them saw beats the day's news, and the news beats the weather.
const BENCH_TALK = Object.freeze({
  incident: [
    'and the noise it made — I hear it still.',
    'they carried him off, and nobody could say whose fault it was.',
    'I said to her, that is what comes of driving like that in a public park.',
  ],
  speech: [
    'the Commissioner himself, out in the open air, like a preacher.',
    'well, he may say what he likes about the saloons. The saloons are still there.',
    'my brother is on the force, and he says the man is everywhere at once.',
  ],
  day: [
    'a penny for the carousel, and she wants to go round twice.',
    'the milk at the Dairy is a cent dearer than it was, and no better.',
    'if it is as warm as this in June, what will August be.',
  ],
  late: [
    'we ought to have started home an hour ago.',
    'the lamps are lit already. Where does the evening go.',
    'it is not the walk I mind, it is the walk back.',
  ],
});

const spokenPairs = new Map();
let lastAt = -Infinity;

function pick(lines, seed) {
  return lines[Math.abs(Math.trunc(seed)) % lines.length];
}

function tooSoon(key, now) {
  if (now - lastAt < GLOBAL_GAP_MS) return true;
  return now - (spokenPairs.get(key) ?? -Infinity) < PAIR_GAP_MS;
}

function remember(key, now) {
  if (spokenPairs.size >= MAX_PAIRS_REMEMBERED) {
    spokenPairs.delete(spokenPairs.keys().next().value);
  }
  spokenPairs.set(key, now);
  lastAt = now;
}

// The scrap is raised under one key, so a second exchange replaces the first
// rather than stacking a wall of other people's business on the screen.
function raise(speaker, line, key, now) {
  remember(key, now);
  return notice(`${speaker}: “…${line}”`, { key: 'overheard', seconds: 6 });
}

/**
 * A quirk exchange within earshot. The gallant's line is the woman's answer —
 * she is the one worth quoting — so the speaker depends on the kind.
 */
export function overhearQuirk({
  kind, selfName, partnerName, x, z, playerX, playerZ, seed = 0, now = Date.now(),
} = {}) {
  const lines = QUIRK_TALK[kind];
  if (!lines) return null;
  if (Math.hypot(playerX - x, playerZ - z) > QUIRK_EARSHOT) return null;
  const key = `quirk:${kind}:${selfName}:${partnerName}`;
  if (tooSoon(key, now)) return null;
  const speaker = kind.startsWith('gallant') ? partnerName : selfName;
  if (!speaker) return null;
  return raise(speaker, pick(lines, seed), key, now);
}

/** Seated agents sharing a bench, nearest to the player first. */
export function benchPairs(agents = listAgents(), playerX = 0, playerZ = 0) {
  const seated = [];
  for (const agent of agents) {
    const activity = agent?.dialogueContext?.activity;
    if (activity !== 'sitting' && activity !== 'resting') continue;
    if (!agent.dialogueName || !Number.isFinite(agent.x)) continue;
    if (Math.hypot(agent.x - playerX, agent.z - playerZ) > BENCH_EARSHOT) continue;
    seated.push(agent);
  }
  const pairs = [];
  for (let i = 0; i < seated.length; i += 1) {
    for (let j = i + 1; j < seated.length; j += 1) {
      const distance = Math.hypot(seated[i].x - seated[j].x, seated[i].z - seated[j].z);
      // No facing test: two people at one bench end are already turned the
      // same way, and a seated figure's yaw is not reported.
      if (distance > COMPANY) continue;
      pairs.push({ a: seated[i], b: seated[j], distance });
    }
  }
  return pairs;
}

/**
 * What a pair have in common to talk about. An incident either of them saw
 * outranks the day; the hours match the ones parkBulletin keeps.
 */
export function benchSubject(pair, hour = 12) {
  const shaken = [pair.a, pair.b].some((agent) => witnessedBy(agent.dialogueId)
    .some((entry) => CONCERN_LEVELS.indexOf(entry.concern) >= CONCERN_LEVELS.indexOf('concerned')));
  if (shaken) return 'incident';
  const h = ((Number(hour) || 0) % 24 + 24) % 24;
  if (h >= ROOSEVELT_SPEECH_START_HOUR && h < ROOSEVELT_PARK_DEPARTURE_HOUR) return 'speech';
  if (h >= 8 && h < 19) return 'day';
  return 'late';
}

/** The nearest seated pair in earshot says something to each other. */
export function overhearBenchTalk({
  playerX, playerZ, hour = 12, seed = 0, now = Date.now(), agents = listAgents(),
} = {}) {
  const pairs = benchPairs(agents, playerX, playerZ);
  if (pairs.length === 0) return null;
  const pair = pairs.reduce((best, entry) => (entry.distance < best.distance ? entry : best));
  const key = `bench:${pair.a.id}:${pair.b.id}`;
  if (tooSoon(key, now)) return null;
  const subject = benchSubject(pair, hour);
  // The one nearer the player is the one he can hear.
  const speaker = Math.hypot(pair.a.x - playerX, pair.a.z - playerZ)
    <= Math.hypot(pair.b.x - playerX, pair.b.z - playerZ) ? pair.a : pair.b;
  return raise(speaker.dialogueName, pick(BENCH_TALK[subject], seed), key, now);
}

export function resetOverheardForTests() {
  spokenPairs.clear();
  lastAt = -Infinity;
}
