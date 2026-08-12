// Small cross-scene mailbox for physical impacts. Producers know a stable
// actor ID; the owning simulation drains that actor's queue next frame.

const queues = new Map();

export function queueActorImpact(actorId, impact) {
  if (!actorId || !impact) return false;
  const queue = queues.get(actorId);
  if (queue) queue.push(impact);
  else queues.set(actorId, [impact]);
  return true;
}

export function takeActorImpacts(actorId) {
  const queue = queues.get(actorId);
  if (!queue) return [];
  queues.delete(actorId);
  return queue;
}

export function clearActorImpacts(actorId) {
  queues.delete(actorId);
}

export function resetActorImpactsForTests() {
  queues.clear();
}

