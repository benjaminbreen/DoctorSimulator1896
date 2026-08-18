// One examination at a time: which object, what has been looked at, and what
// each look yielded.
//
// Framework-free and subscribable, on the pattern of world/interaction.js. The
// record in examinables.js decides what a procedure yields; nothing here
// invents a fact, and a procedure run twice adds nothing the second time.

import { examinable } from './examinables.js';
import { applyPlayerEvent } from '../world/player.js';

const listeners = new Set();
let session = null;
// Subjects that have already paid their quiet. Looking hard at a thing settles
// the nerves once; looking at it again is just looking at it again.
const settled = new Set();

function notify() {
  const snapshot = getExamination();
  for (const listener of listeners) listener(snapshot);
}

export function subscribe(listener) {
  listeners.add(listener);
  listener(getExamination());
  return () => listeners.delete(listener);
}

export function getExamination() {
  return session;
}

/**
 * Open an examination. `record` is supplied for a thing picked out of the
 * world, whose record is built on the spot; the three authored subjects look
 * theirs up by id. Everything downstream reads one shape either way.
 */
export function beginExamination(subjectId, record = examinable(subjectId)) {
  if (!record) return null;
  session = {
    subjectId,
    record,
    // Every observation, procedure result and answered question, in the order
    // they happened. The panel reads this straight through.
    entries: [{ id: 'opening', kind: 'observation', text: record.opening }],
    done: [],
    minutes: 0,
    pending: false,
    requestedAction: null,
  };
  notify();
  return session;
}

// Attention costs minutes and gives quiet back. The ledger entry is small and
// paid once per subject, so it is a reason to stop and look rather than a tap
// to be turned on.
const QUIET_PER_PROCEDURE = 1.8;
const QUIET_CAP = 5;

export function endExamination() {
  if (!session) return;
  const { subjectId, done, record } = session;
  session = null;
  if (done.length > 0 && !settled.has(subjectId)) {
    settled.add(subjectId);
    applyPlayerEvent({
      source: 'examination',
      label: `Looked closely at ${record.title.toLowerCase()}`,
      note: 'A few minutes of attention on one thing, and the nerves quieten.',
      changes: { neurasthenia: -Math.min(QUIET_CAP, done.length * QUIET_PER_PROCEDURE) },
    });
  }
  notify();
}

// Test seam: the ledger is module state and a run is a single session.
export function forgetExaminedSubjects() {
  settled.clear();
}

/** Remaining procedures, in authored order. */
export function openProcedures() {
  if (!session) return [];
  return session.record.procedures.filter((step) => !session.done.includes(step.id));
}

/**
 * Run one procedure. Returns the minutes it cost so the caller can advance the
 * clock, or null if it is unknown or already done.
 */
export function runProcedure(id) {
  if (!session) return null;
  const step = session.record.procedures.find((entry) => entry.id === id);
  if (!step || session.done.includes(id)) return null;
  session.done = [...session.done, id];
  session.minutes += step.minutes;
  session.entries = [...session.entries, {
    id: `procedure:${id}`,
    kind: 'procedure',
    label: step.label,
    text: step.observation,
    finding: step.finding,
  }];
  notify();
  return { minutes: step.minutes };
}

/** A custom question is in flight. Keeps the send button honest. */
export function setPending(value) {
  if (!session) return;
  session.pending = Boolean(value);
  notify();
}

export function recordQuestion(question, answer, source = 'offline') {
  if (!session) return;
  session.entries = [...session.entries, {
    id: `question:${session.entries.length}`,
    kind: 'question',
    question,
    text: answer,
    source,
  }];
  session.pending = false;
  notify();
}

/**
 * The panel's one action button. The scene watches for this rather than the
 * panel importing a scene component, so the dependency runs one way only.
 */
export function requestAction(id) {
  if (!session) return;
  session.requestedAction = id;
  notify();
}

/** What the model is allowed to know, sent with a custom question. */
export function disclosedFacts() {
  if (!session) return [];
  // Everything true of the object, plus what the player has actually looked at
  // — so an answer can say "you have already seen" without guessing.
  return {
    facts: session.record.facts,
    seen: session.entries
      .filter((entry) => entry.kind !== 'question')
      .map((entry) => entry.text),
  };
}
