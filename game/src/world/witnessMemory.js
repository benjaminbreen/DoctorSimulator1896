// Per-agent memory of street incidents seen firsthand. When an event fires,
// every agent within eyeshot gets an entry graded by how much this particular
// person cares: severity of the thing, how close they stood, and their rolled
// composure. Dialogue reads it back so a shaken widow and an unbothered
// patrolman describe the same crash differently.

import { listAgents } from './agents.js';
import { hashSeed, rollIdentity } from './npcIdentity.js';
import { getRunSeed } from './runSeed.js';

const EYESHOT = 40;
const NEAR = 12;
const NEARBY = 25;
const MAX_PER_AGENT = 4;
const MAX_AGENTS_REMEMBERED = 64;
// Real milliseconds a memory stays vivid. At the default 4x clock this is
// about twenty game minutes.
const MEMORY_MS = 5 * 60 * 1000;
const GAME_MINUTES_PER_MS = 4 / 60000;

export const CONCERN_LEVELS = Object.freeze(['unmoved', 'annoyed', 'concerned', 'shaken', 'outraged']);

const memories = new Map();

// How bad the thing itself is, before anyone's temperament weighs in.
function severity(event) {
  if (event.kind === 'pelting') return 0.7;
  if (event.targetKind === 'player' || event.targetKind === 'pedestrian'
    || event.targetKind === 'doorman' || event.targetKind === 'policeman') return 1;
  if (event.targetKind === 'pushcart') return 0.55;
  return 0.4;
}

export function concernScore({ severity: base, distance, composure, involvedSelf }) {
  if (involvedSelf) return 1.5;
  const proximity = distance <= NEAR ? 1 : Math.max(0.35, 1 - (distance - NEAR) / (EYESHOT - NEAR) * 0.65);
  return base * proximity * (1.4 - composure);
}

export function concernFromScore(score) {
  if (score >= 1.2) return 'outraged';
  if (score >= 0.75) return 'shaken';
  if (score >= 0.42) return 'concerned';
  if (score >= 0.22) return 'annoyed';
  return 'unmoved';
}

export function concernLevel(input) {
  return concernFromScore(concernScore(input));
}

// Returns what each witness made of it, so a caller can pick somebody to
// shout (outcry.js). The memory itself is the point; the list is a byproduct.
export function recordWitnesses(event, agents = listAgents(), now = Date.now()) {
  const graded = [];
  for (const agent of agents) {
    if (!agent?.dialogueId) continue;
    const distance = Math.hypot(agent.x - event.x, agent.z - event.z);
    if (distance > EYESHOT) continue;
    // A vendor's cart or a driver's rig: `ownsId` marks property so its
    // owner reacts as the injured party, not a bystander.
    const involvedSelf = event.targetId === agent.id
      || event.sourceId === agent.id
      || (agent.ownsId != null && (event.targetId === agent.ownsId || event.sourceId === agent.ownsId));
    const context = agent.dialogueContext ?? {};
    const identity = rollIdentity(
      context.archetype,
      hashSeed(getRunSeed(), context.seed ?? 1),
      { age: context.age },
    );
    let seen = memories.get(agent.dialogueId);
    if (!seen) {
      // Bound the map: drop the oldest entry (Map keeps insertion order).
      if (memories.size >= MAX_AGENTS_REMEMBERED) {
        memories.delete(memories.keys().next().value);
      }
      seen = [];
      memories.set(agent.dialogueId, seen);
    }
    const score = concernScore({
      severity: severity(event),
      distance,
      composure: identity?.composure ?? 0.6,
      involvedSelf,
    });
    graded.push({
      agent, concern: concernFromScore(score), distance, involvedSelf,
    });
    seen.push({
      eventId: event.id,
      kind: event.kind ?? 'vehicle-impact',
      targetKind: event.targetKind ?? null,
      involvedPlayer: event.targetKind === 'player' || event.sourceId === 'player',
      involvedSelf,
      // The peak reaction, kept as a number so time can wear it down on the
      // way out. Where it happened is kept too: dialogue says "a few steps
      // off" or "over the way", not "near here" for everything in eyeshot.
      score,
      nearness: distance <= NEAR ? 'here' : distance <= NEARBY ? 'nearby' : 'off',
      at: now,
    });
    if (seen.length > MAX_PER_AGENT) seen.splice(0, seen.length - MAX_PER_AGENT);
  }
  return graded;
}

// What this agent still remembers, freshest last, with age in game minutes.
// Concern fades linearly over the window, so the same sight is a shock at one
// minute and a grumble at ten. Everything downstream ranks on the faded value.
export function witnessedBy(dialogueId, now = Date.now()) {
  const seen = memories.get(dialogueId);
  if (!seen) return [];
  const fresh = seen.filter((entry) => now - entry.at <= MEMORY_MS);
  if (fresh.length === 0) memories.delete(dialogueId);
  else if (fresh.length !== seen.length) memories.set(dialogueId, fresh);
  return fresh.map((entry) => ({
    kind: entry.kind,
    targetKind: entry.targetKind,
    involvedPlayer: entry.involvedPlayer,
    involvedSelf: entry.involvedSelf,
    concern: concernFromScore(entry.score * (1 - (now - entry.at) / MEMORY_MS)),
    nearness: entry.nearness,
    minutesAgo: Math.max(1, Math.round((now - entry.at) * GAME_MINUTES_PER_MS)),
  }));
}

export function resetWitnessMemoryForTests() {
  memories.clear();
}
