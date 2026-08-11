let fastTravelUsed = false;
const listeners = new Set();

export function hasUsedFastTravel() {
  return fastTravelUsed;
}

export function markFastTravelUsed() {
  if (fastTravelUsed) return;
  fastTravelUsed = true;
  for (const listener of listeners) listener(true);
}

export function subscribeOnboardingProgress(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
