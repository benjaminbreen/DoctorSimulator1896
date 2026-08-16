// Shared debug handle, exposed as window.__game so movement, camera, and
// lighting can be driven headlessly (screenshot verification without input).

import { receiveGood } from './world/pocket.js';

export const gameDebug = {
  tuning: null,
  set: null,
  player: {
    position: [0, 0, 0], velocity: [0, 0, 0], grounded: false, yaw: 0,
    visible: true, running: false, posture: 'normal', cameraHeight: 1.45,
    climbing: false, climbSerial: 0,
  },
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
  // Set only by the headless shot harness. The avatar freezes in a quiet idle
  // pose so teleporting between candidate compositions cannot leak a jump,
  // fall, climb, or run animation into the captured frame.
  shotPose: null,
  // A screenshot-search-only rotation of the physically derived outdoor sun.
  // Normal gameplay leaves this null and therefore keeps the historical sky.
  shotSunAzimuthDeg: null,
  // Incremented when the shot harness applies a candidate so the PMREM probe
  // updates before capture instead of retaining the previous candidate's sky.
  shotEnvironmentRevision: 0,
  camera: null,
  scene: null,
  renderer: null,
  sceneMetrics() {
    const scene = gameDebug.scene;
    if (!scene) return null;
    let meshes = 0;
    let instancedMeshes = 0;
    let landmarkBatches = 0;
    let landmarkInstances = 0;
    let estimatedTriangles = 0;
    scene.traverse((object) => {
      if (object.isMesh) meshes += 1;
      if (object.isInstancedMesh) {
        instancedMeshes += 1;
        if (object.name?.startsWith('landmark-')) {
          landmarkBatches += 1;
          landmarkInstances += object.count ?? 0;
        }
      }
      const geometry = object.geometry;
      if (!geometry) return;
      const triangles = geometry.index
        ? geometry.index.count / 3
        : (geometry.attributes?.position?.count ?? 0) / 3;
      estimatedTriangles += triangles * (object.isInstancedMesh ? object.count : 1);
    });
    return {
      meshes,
      instancedMeshes,
      landmarkBatches,
      landmarkInstances,
      estimatedTriangles: Math.round(estimatedTriangles),
    };
  },
  room: null,
  actors: { requested: [], loaded: [] },
  // Live, existing crowd positions exposed for the screenshot harness. The
  // ordinary game does not read these; Hopper shots use them as composition
  // anchors instead of inventing extra people.
  pedestrians: [],
  shotTrackedPersonId: null,
  // A shot-only placement of one of the existing standing-woman pedestrian
  // models. It is mounted only on ?shot=1 pages and never changes gameplay.
  shotWoman: {
    visible: false,
    position: [0, 0, 0],
    yaw: 0,
    archetype: 'w',
    scenario: null,
  },
  shotWomanReady: false,
  // Written by HorselessCarriage every frame: carriages is one state
  // {route, x, z, s, lat, speed, yaw} per vehicle; carriage is the first.
  carriage: null,
  carriages: [],
  horseDrawnTraffic: [],
  pushcarts: {},
  streetPolice: [],
  // Set by PlayerRig so the debug handle can enter instrument mode directly.
  enterInstrument: null,
  // Set by PlayerRig so dialogue can be opened for visual and API testing.
  talk: null,
  // Present while the mobile controls are mounted; the screenshot harness
  // can drive the same virtual input that pointer gestures use.
  mobileInput: null,
  // Set by PlayerAvatar: the rigged figure's root and the smoking clip's
  // action, so the opium ritual can reach bones and pace smoke to the loop.
  avatarRoot: null,
  smokingAction: null,
  // PlayerAvatar writes the animated hand position for object launch and aim.
  throwableHandPosition: [0, 1.2, 0],
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
  // Hand over a good without walking to a vendor and paying for it.
  gameDebug.give = receiveGood;
  if (typeof window !== 'undefined') window.__game = gameDebug;
}
