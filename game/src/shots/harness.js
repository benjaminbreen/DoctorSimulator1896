// Headless shot harness. Installed as window.__shot when the page is loaded
// with ?shot=1; the Hopper search driver (tools/hopper) uses it to place the
// camera, pose the figure, set lighting, and read back what is in frame.
//
// probe() is the deterministic half of the reward: where the figure and the
// windows actually are in the frame, taken from the scene rather than guessed
// from pixels.

import * as THREE from 'three';
import { gameDebug } from '../debug.js';
import { terrainHeight, pondDepth, pathsDistance } from '../world/terrain.js';

const FIGURE_HEIGHT = 1.72;
const CAMERA_MARGIN = 0.45;
const FIGURE_MARGIN = 0.5;

// What a shot file carries. Rebuild-mode parameters are left out on purpose:
// changing one remounts the canvas, which would cost a second per sample.
export const TUNABLE_IDS = [
  'timeOfDay', 'exposure', 'ambientIntensity', 'hemisphereIntensity',
  'windowIntensity', 'windowElevationDeg', 'windowColor',
  'gaslightIntensity', 'gaslightFlicker', 'shadowRadius',
  'fogDensity', 'envIntensity', 'skyBrightness', 'skyHaze',
  'bloomIntensity', 'aoIntensity',
];

function roomBounds(room) {
  const [cx, , cz] = room.floor.position;
  const [w, , d] = room.floor.size;
  const floorY = room.floor.position[1] + room.floor.size[1] / 2;
  const ceilingY = room.ceiling ? room.ceiling.position[1] - room.ceiling.size[1] / 2 : floorY + 6;
  return { minX: cx - w / 2, maxX: cx + w / 2, minZ: cz - d / 2, maxZ: cz + d / 2, floorY, ceilingY };
}

// Outdoors the floor is the terrain, so ground height is per-point.
function groundAt(room, x, z) {
  return room.exterior ? terrainHeight(x, z) : roomBounds(room).floorY;
}

// Clearance for a camera outdoors: the highest ground within arm's reach, so
// a spot on a rising slope does not bury the lens in the hillside.
function clearanceAt(x, z) {
  let highest = terrainHeight(x, z);
  for (const [dx, dz] of [[1.4, 0], [-1.4, 0], [0, 1.4], [0, -1.4]]) {
    highest = Math.max(highest, terrainHeight(x + dx, z + dz));
  }
  return highest;
}

// Axis-aligned test against a yawed box, done in the box's own frame.
function insideBox(x, z, box, pad) {
  const yaw = box.yaw ?? 0;
  const dx = x - box.position[0];
  const dz = z - box.position[2];
  const cos = Math.cos(-yaw);
  const sin = Math.sin(-yaw);
  const lx = dx * cos - dz * sin;
  const lz = dx * sin + dz * cos;
  return Math.abs(lx) <= box.size[0] / 2 + pad && Math.abs(lz) <= box.size[2] / 2 + pad;
}

function blockers(room) {
  return [...room.wallBoxes, ...room.blockerBoxes, ...room.furnitureBoxes.filter((i) => i.collider !== false)];
}

// Projects a world point to fractional screen coordinates: [0,1] from the top
// left, with `inFront` false when it sits behind the camera.
function project(camera, point) {
  const v = new THREE.Vector3(point[0], point[1], point[2]);
  v.project(camera);
  return { x: (v.x + 1) / 2, y: (1 - v.y) / 2, inFront: v.z < 1 };
}

export function installShotHarness(runtime) {
  if (typeof window === 'undefined') return;

  const api = {
    // True once the canvas has mounted and a room is derived.
    get ready() {
      return Boolean(gameDebug.room && gameDebug.camera);
    },

    // Legal sampling volume plus the fixed scene facts the sampler needs.
    world() {
      const room = gameDebug.room;
      if (!room) return null;
      return {
        zone: runtime.values.zone,
        exterior: room.exterior,
        bounds: roomBounds(room),
        windows: room.windowHoles.map((h) => ({
          position: h.position,
          width: h.width,
          height: h.height,
          normal: h.normal,
        })),
      };
    },

    // Rejects camera or figure positions inside geometry, and reports the
    // ground height and path distance the sampler needs. One call for a whole
    // batch: a round trip per candidate would dominate the search.
    sample(points, kind = 'camera') {
      const room = gameDebug.room;
      if (!room) return points.map(() => ({ legal: false }));
      const b = roomBounds(room);
      const margin = kind === 'camera' ? CAMERA_MARGIN : FIGURE_MARGIN;
      const boxes = blockers(room);
      return points.map(([x, z]) => {
        if (x < b.minX + margin || x > b.maxX - margin) return { legal: false };
        if (z < b.minZ + margin || z > b.maxZ - margin) return { legal: false };
        if (boxes.some((box) => insideBox(x, z, box, margin * 0.6))) return { legal: false };
        // pondDepth is signed: negative inside the water. Keep clear of the
        // margin too, or the camera sits in the shallows.
        if (room.exterior && pondDepth(x, z) < 0.3) return { legal: false };
        return {
          legal: true,
          ground: room.exterior ? clearanceAt(x, z) : groundAt(room, x, z),
          // Distance to the nearest path: the park is 330m across and mostly
          // lawn, so the sampler leans toward where people would be.
          pathDistance: room.exterior ? pathsDistance(x, z) : 0,
        };
      });
    },

    // One shot: tuning values, then the figure, then the camera.
    apply(shot) {
      for (const [id, value] of Object.entries(shot.tuning ?? {})) runtime.set(id, value);
      if (shot.figure) {
        // Teleport to the capsule's resting height: a few settle frames are
        // not enough for gravity to bring a figure down, so it would hang in
        // air. Outdoors that height follows the terrain.
        const [fx, fz] = shot.figure.position;
        const ground = gameDebug.room ? groundAt(gameDebug.room, fx, fz) : 0;
        const standing = runtime.values.capsuleHalfHeight + runtime.values.capsuleRadius;
        gameDebug.teleport(fx, ground + standing, fz);
        gameDebug.pendingYaw = shot.figure.yaw ?? 0;
      }
      if (shot.camera) {
        runtime.set('fov', shot.camera.fov);
        gameDebug.freeCamera = {
          position: shot.camera.position,
          yaw: shot.camera.yaw,
          pitch: shot.camera.pitch,
        };
      }
    },

    // Ground truth about the framing, read after the shot has settled.
    probe() {
      const camera = gameDebug.camera;
      const room = gameDebug.room;
      if (!camera || !room) return null;
      const p = gameDebug.player.position;
      const feet = project(camera, [p[0], p[1], p[2]]);
      const head = project(camera, [p[0], p[1] + FIGURE_HEIGHT, p[2]]);
      const onScreen =
        feet.inFront && head.x > -0.15 && head.x < 1.15 && (head.y < 1.1 || feet.y > -0.1);
      const eye = camera.position;
      const distance = Math.hypot(p[0] - eye.x, p[1] - eye.y, p[2] - eye.z);

      const windows = room.windowHoles
        .map((h) => {
          const c = project(camera, h.position);
          const top = project(camera, [h.position[0], h.position[1] + h.height / 2, h.position[2]]);
          return { x: c.x, y: c.y, inFront: c.inFront, heightFrac: Math.abs(c.y - top.y) * 2 };
        })
        .filter((w) => w.inFront && w.x > -0.2 && w.x < 1.2 && w.y > -0.2 && w.y < 1.2);

      return {
        figure: {
          onScreen,
          x: feet.x,
          footY: feet.y,
          headY: head.y,
          heightFrac: Math.abs(feet.y - head.y),
          distance,
          // Positive when the figure faces roughly away from the camera.
          awayness: Math.cos(gameDebug.player.yaw - Math.atan2(p[0] - eye.x, p[2] - eye.z)),
        },
        windows,
        camera: {
          position: [camera.position.x, camera.position.y, camera.position.z],
          fov: camera.fov,
        },
      };
    },

    clear() {
      gameDebug.freeCamera = null;
    },

    // Reads the current framing back out as a shot file, so a found shot you
    // have nudged by hand can go back into out/ or into a lighting preset.
    capture() {
      const camera = gameDebug.camera;
      const free = gameDebug.freeCamera;
      if (!camera) return null;
      const player = gameDebug.player;
      return {
        zone: runtime.values.zone,
        camera: {
          position: [camera.position.x, camera.position.y, camera.position.z],
          yaw: free ? free.yaw : gameDebug.stats.cameraYaw,
          pitch: free ? free.pitch : gameDebug.look?.pitch ?? 0,
          fov: camera.fov,
        },
        figure: { position: [player.position[0], player.position[2]], yaw: player.yaw },
        tuning: Object.fromEntries(TUNABLE_IDS.map((id) => [id, runtime.values[id]])),
      };
    },
  };

  window.__shot = api;
  return api;
}
