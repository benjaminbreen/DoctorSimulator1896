// What the player has open in front of their face, if anything. A pocket
// verb sets it and the HUD draws it. It sits outside the HUD overlay stack
// so folding the paper up returns to the items drawer it was opened from.

const listeners = new Set();
let openEditionId = null;

function publish() {
  for (const listener of listeners) listener(openEditionId);
}

export function getReading() {
  return openEditionId;
}

export function subscribeReading(listener) {
  listeners.add(listener);
  listener(openEditionId);
  return () => listeners.delete(listener);
}

export function readEdition(id) {
  if (openEditionId === id) return;
  openEditionId = id;
  publish();
}

export function closeReading() {
  if (!openEditionId) return;
  openEditionId = null;
  publish();
}
