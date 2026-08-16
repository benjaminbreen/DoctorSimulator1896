// What an NPC holds against the player personally. Taking fruit off a man's
// cart is not a street incident anyone witnessed — it is a thing done to him —
// so it lives here rather than in witnessMemory, and it only ever names the
// player as the culprit.

const MEMORY_MS = 8 * 60 * 1000;
const GAME_MINUTES_PER_MS = 4 / 60000;

const grievances = new Map();

export function recordGrievance(dialogueId, kind = 'theft', now = Date.now()) {
  if (!dialogueId) return null;
  const entry = { kind, at: now, count: (grievances.get(dialogueId)?.count ?? 0) + 1 };
  grievances.set(dialogueId, entry);
  return entry;
}

export function grievanceAgainst(dialogueId, now = Date.now()) {
  const entry = grievances.get(dialogueId);
  if (!entry) return null;
  if (now - entry.at > MEMORY_MS) {
    grievances.delete(dialogueId);
    return null;
  }
  return {
    kind: entry.kind,
    count: entry.count,
    minutesAgo: Math.max(1, Math.round((now - entry.at) * GAME_MINUTES_PER_MS)),
  };
}

// Paying for what you took clears it. The count stays on the entry only
// while it is live, so a settled man starts fresh if you rob him again.
// Only a debt can be paid off: a penny does not settle a thrown apple.
export function settleGrievance(dialogueId) {
  if (grievances.get(dialogueId)?.kind !== 'theft') return false;
  return grievances.delete(dialogueId);
}

export function resetGrievancesForTests() {
  grievances.clear();
}
