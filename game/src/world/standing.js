// Professional standing: one number for the practice's reputation, adjusted
// by kept and broken appointments, consultations, callers, and errands.
// Module state with subscribers, like notices and the purse.

const START = 52;

let standing = START;
let log = [];
const listeners = new Set();

function notify() {
  for (const listener of listeners) listener(standing);
}

export function getStanding() {
  return standing;
}

export function getStandingLog() {
  return [...log];
}

export function standingDelta() {
  return standing - START;
}

export function adjustStanding(delta, reason) {
  const amount = Number(delta) || 0;
  if (amount === 0) return standing;
  standing = Math.max(0, Math.min(100, standing + amount));
  log = [...log, { delta: amount, reason: String(reason || '') }];
  notify();
  return standing;
}

export function subscribeStanding(listener) {
  listeners.add(listener);
  listener(standing);
  return () => listeners.delete(listener);
}

export function resetStandingForTests() {
  standing = START;
  log = [];
  notify();
}
