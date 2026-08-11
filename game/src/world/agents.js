// Live positions of background movers. Scene components report their
// figures and vehicles here each frame so other movers (the horseless
// carriages) can steer around them. Framework-free, same style as
// interaction.js.

const agents = new Map();

export function reportAgent(id, x, z, r = 0.45) {
  const entry = agents.get(id);
  if (entry) {
    entry.x = x;
    entry.z = z;
    entry.r = r;
    return;
  }
  agents.set(id, { id, x, z, r });
}

export function removeAgent(id) {
  agents.delete(id);
}

export function listAgents() {
  return agents.values();
}
