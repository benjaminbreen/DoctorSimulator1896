// Live positions of background movers. Scene components report their
// figures and vehicles here each frame so other movers (the horseless
// carriages) can steer around them. Framework-free, same style as
// interaction.js.

const agents = new Map();

export const DIALOGUE_REACH = 2.35;
export const DIALOGUE_FACING = Math.cos(0.72);

// Returns the live entry. A caller reporting a whole crowd every frame should
// write its own fields onto that rather than passing `details`: the object
// literal is copied and discarded immediately, and at sixty frames a second
// the garbage is what the player feels.
export function reportAgent(id, x, z, r = 0.45, details = null) {
  let entry = agents.get(id);
  if (entry) {
    entry.x = x;
    entry.z = z;
    entry.r = r;
  } else {
    entry = { id, x, z, r };
    agents.set(id, entry);
  }
  if (details) Object.assign(entry, details);
  return entry;
}

export function removeAgent(id) {
  agents.delete(id);
}

export function listAgents() {
  return agents.values();
}

export function getAgent(id) {
  return agents.get(id) ?? null;
}

// The nearest opt-in speaking NPC in a comfortable conversational range and
// in front of the player. Most background agents have no dialogueId and are
// therefore scenery as far as this interaction is concerned.
export function findReachableDialogueAgent(position, yaw, entries = agents.values()) {
  let best = null;
  let bestDistance = DIALOGUE_REACH * DIALOGUE_REACH;
  const facingX = -Math.sin(yaw);
  const facingZ = -Math.cos(yaw);
  for (const entry of entries) {
    if (!entry?.dialogueId || !Number.isFinite(entry.x) || !Number.isFinite(entry.z)) continue;
    const dx = entry.x - position[0];
    const dz = entry.z - position[2];
    const distance = dx * dx + dz * dz;
    if (distance > bestDistance) continue;
    const length = Math.sqrt(distance) || 1e-6;
    if ((dx / length) * facingX + (dz / length) * facingZ < DIALOGUE_FACING) continue;
    best = entry;
    bestDistance = distance;
  }
  return best;
}
