// Shared debug handle, exposed as window.__game so movement, camera, and
// lighting can be driven headlessly (screenshot verification without input).

export const gameDebug = {
  tuning: null,
  set: null,
  player: { position: [0, 0, 0], grounded: false, yaw: 0 },
  pendingTeleport: null,
  teleport(x, y, z) {
    gameDebug.pendingTeleport = [x, y, z];
  },
  look: null,
  setLook: null,
  stats: { fps: 0, cameraDistance: 0 },
  exportPreset: null,
};

export function installDebugHandle(runtime) {
  gameDebug.tuning = runtime.values;
  gameDebug.set = runtime.set;
  gameDebug.reset = runtime.resetToDefaults;
  gameDebug.exportPreset = runtime.toPreset;
  if (typeof window !== 'undefined') window.__game = gameDebug;
}
