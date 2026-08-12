// Shared debug handle, exposed as window.__game so movement, camera, and
// lighting can be driven headlessly (screenshot verification without input).

export const gameDebug = {
  tuning: null,
  set: null,
  player: { position: [0, 0, 0], velocity: [0, 0, 0], grounded: false, yaw: 0, visible: true },
  pendingTeleport: null,
  pendingYaw: null,
  teleport(x, y, z) {
    gameDebug.pendingTeleport = [x, y, z];
  },
  look: null,
  setLook: null,
  stats: {
    fps: 0,
    cameraDistance: 0,
    cameraYaw: null,
    boot: { zone: null, stage: null, elapsedMs: null, complete: false },
  },
  exportPreset: null,
  // Set by the shot harness to take the camera away from CameraRig:
  // { position: [x,y,z], yaw, pitch, fov }.
  freeCamera: null,
  camera: null,
  scene: null,
  room: null,
  actors: { requested: [], loaded: [] },
  // Written by HorselessCarriage every frame: carriages is one state
  // {route, x, z, s, lat, speed, yaw} per vehicle; carriage is the first.
  carriage: null,
  carriages: [],
  // Set by PlayerRig so the debug handle can enter instrument mode directly.
  enterInstrument: null,
  // Present while the mobile controls are mounted; the screenshot harness
  // can drive the same virtual input that pointer gestures use.
  mobileInput: null,
  // Set by PlayerAvatar: the rigged figure's root and the smoking clip's
  // action, so the opium ritual can reach bones and pace smoke to the loop.
  avatarRoot: null,
  smokingAction: null,
};

// Enter instrument mode on the first piece in the room offering the named
// instrument, without walking to it. Verifying an instrument view otherwise
// means teleporting, aiming and pressing a key, and any of the three can miss.
export function useInstrumentByName(name) {
  const item = (gameDebug.room?.furnitureBoxes ?? []).find(
    (entry) => entry.affordance?.instrument === name,
  );
  if (!item || !gameDebug.enterInstrument) return false;
  gameDebug.enterInstrument({ id: item.id, item, instrument: name });
  return true;
}

export function installDebugHandle(runtime) {
  gameDebug.tuning = runtime.values;
  gameDebug.set = runtime.set;
  gameDebug.reset = runtime.resetToDefaults;
  gameDebug.exportPreset = runtime.toPreset;
  gameDebug.use = useInstrumentByName;
  if (typeof window !== 'undefined') window.__game = gameDebug;
}
