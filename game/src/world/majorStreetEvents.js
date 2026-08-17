// Small append-only street-event stream. Producers report only real vehicle
// contacts; observers keep their own cursor, so two policemen can react to
// the same crash without racing to drain a shared mailbox.

import { recordWitnesses } from './witnessMemory.js';
import { raiseStreetOutcry } from './outcry.js';

const events = [];
let serial = 0;
const MAX_EVENTS = 32;

export function reportMajorStreetEvent(event) {
  if (!event || !Number.isFinite(event.x) || !Number.isFinite(event.z)) return null;
  const entry = Object.freeze({
    id: ++serial,
    kind: event.kind ?? 'vehicle-impact',
    sourceId: event.sourceId ?? null,
    targetId: event.targetId ?? null,
    targetKind: event.targetKind ?? null,
    x: event.x,
    z: event.z,
  });
  events.push(entry);
  if (events.length > MAX_EVENTS) events.splice(0, events.length - MAX_EVENTS);
  // Bystanders in eyeshot remember what they saw; dialogue reads this back.
  // One of them, or the nearest officer, says something out loud about it.
  raiseStreetOutcry(entry, recordWitnesses(entry));
  return entry;
}

export function majorStreetEventsSince(afterId = 0) {
  return events.filter((event) => event.id > afterId);
}

export function latestMajorStreetEventId() {
  return events.at(-1)?.id ?? 0;
}

export function resetMajorStreetEventsForTests() {
  events.length = 0;
  serial = 0;
}
