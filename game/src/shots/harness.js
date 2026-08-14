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
import { constructedSurfaceAt } from '../world/constructedSurfaces.js';
import { doorWorld, facadeEntranceLayout } from '../world/facade.js';

const FIGURE_HEIGHT = 1.72;
const CAMERA_MARGIN = 0.45;
const FIGURE_MARGIN = 0.5;

// What a shot file carries. Rebuild-mode parameters are left out on purpose:
// changing one remounts the canvas, which would cost a second per sample.
export const TUNABLE_IDS = [
  'timeOfDay', 'exposure', 'ambientIntensity', 'hemisphereIntensity',
  'windowIntensity', 'windowElevationDeg', 'windowColor',
  'gaslightIntensity', 'gaslightFlicker', 'gaslightColor', 'shadowRadius',
  'fogDensity', 'envIntensity', 'skyBrightness', 'skyHaze',
  'skyLitWindows', 'shaftIntensity', 'moteDensity',
  'sunIntensity', 'sunDiscSize', 'sunGlow', 'sunShadowRadius',
  'skyTurbidity', 'skyRayleigh', 'skyMie', 'skyGain', 'skySaturation',
  'nightSkyBrightness', 'citySkyGlow', 'starBrightness', 'moonlightIntensity',
  'cloudCover', 'cloudCumulus', 'cloudScale', 'cloudSpeed',
  'skyFill', 'groundBounce',
  'bloomIntensity', 'bloomThreshold', 'aoIntensity',
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

function insideBox3D(x, y, z, box, pad) {
  return insideBox(x, z, box, pad)
    && Math.abs(y - box.position[1]) <= box.size[1] / 2 + pad;
}

function blockers(room) {
  return [...room.wallBoxes, ...room.blockerBoxes, ...room.furnitureBoxes.filter((i) => i.collider !== false)];
}

// Existing city blocks are ordinary collider-backed furniture entries. Their
// top faces and façades make useful photographic vantages without introducing
// a second set of Hopper-only geometry.
function architectureBoxes(room) {
  if (!room.exterior) return [];
  return room.furnitureBoxes
    .filter((item) => (
      item.collider !== false
      && (item.kind === 'backdrop' || item.kind === 'block-infill')
      && item.size?.[0] >= 3
      && item.size?.[1] >= 6
      && item.size?.[2] >= 3
    ))
    .map((item) => ({
      id: item.id,
      position: item.position,
      size: item.size,
      yaw: item.yaw ?? 0,
      roofY: item.position[1] + item.size[1] / 2,
    }));
}

// Existing procedural stoops are already derived from facade records. Expose
// their top landings to the shot sampler so a figure can be photographed in a
// real doorway without introducing any screenshot-only geometry.
function entranceAnchors(room) {
  if (!room.exterior) return [];
  return room.furnitureBoxes
    .filter((item) => item.kind === 'backdrop' && item.frontageFamily && !item.landmarkModel)
    .map((item) => {
      const entrance = facadeEntranceLayout(item);
      if (!entrance?.steps?.length) return null;
      const topStep = entrance.steps[entrance.steps.length - 1];
      const door = doorWorld(item, Math.max(0.16, entrance.depth * 0.16));
      return {
        id: item.id,
        position: [
          door.x,
          topStep.position[1] + topStep.size[1] / 2 + 0.02,
          door.z,
        ],
        normal: [...entrance.face.normal],
        raised: entrance.raised,
        stepCount: entrance.stepCount,
      };
    })
    .filter(Boolean);
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

    // The tuning schema is the single zone registry visible to the running
    // game, including generated interiors. `--zone all` uses this rather than
    // making the search driver maintain a second list.
    zones() {
      return runtime.definitions.find((definition) => definition.id === 'zone')?.options ?? [];
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
        architecture: architectureBoxes(room),
        entrances: entranceAnchors(room),
        people: room.exterior
          ? gameDebug.pedestrians.map((person) => ({
            id: person.id,
            archetype: person.archetype,
            gender: person.gender,
            position: [...person.position],
            yaw: person.yaw,
            setting: constructedSurfaceAt(person.position[0], person.position[2]) > 0.5
              ? 'street'
              : 'park',
          }))
          : [],
        shotWomanReady: gameDebug.shotWomanReady,
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
          // Cameras need conservative slope clearance; figures need the
          // exact terrain under their feet. Reusing the camera clearance for
          // figures made them hover above uneven outdoor ground.
          ground: room.exterior && kind === 'camera'
            ? clearanceAt(x, z)
            : groundAt(room, x, z),
          // Distance to the nearest path: the park is 330m across and mostly
          // lawn, so the sampler leans toward where people would be.
          pathDistance: room.exterior ? pathsDistance(x, z) : 0,
          setting: room.exterior && constructedSurfaceAt(x, z) > 0.5 ? 'street' : 'park',
        };
      });
    },

    // Elevated cameras are validated in all three dimensions. The ordinary
    // sampler rejects every x/z inside a building, which is correct for a
    // walking figure but would also reject a lens safely above a roof.
    sampleCameraPositions(points) {
      const room = gameDebug.room;
      if (!room?.exterior) return points.map(() => ({ legal: false }));
      const b = roomBounds(room);
      const boxes = blockers(room);
      return points.map(([x, y, z]) => {
        if (![x, y, z].every(Number.isFinite)) return { legal: false };
        if (x < b.minX + CAMERA_MARGIN || x > b.maxX - CAMERA_MARGIN) return { legal: false };
        if (z < b.minZ + CAMERA_MARGIN || z > b.maxZ - CAMERA_MARGIN) return { legal: false };
        const ground = clearanceAt(x, z);
        if (y < ground + 0.8 || y > ground + 65) return { legal: false };
        if (boxes.some((box) => insideBox3D(x, y, z, box, CAMERA_MARGIN * 0.7))) {
          return { legal: false };
        }
        return { legal: true, ground, pathDistance: pathsDistance(x, z) };
      });
    },

    // One shot: tuning values, then the figure, then the camera.
    apply(shot) {
      gameDebug.shotEnvironmentRevision += 1;
      const shotAzimuth = Number(shot.tuning?.sunAzimuthDeg);
      gameDebug.shotSunAzimuthDeg = Number.isFinite(shotAzimuth)
        ? ((shotAzimuth % 360) + 360) % 360
        : null;
      for (const [id, value] of Object.entries(shot.tuning ?? {})) {
        if (id !== 'sunAzimuthDeg') runtime.set(id, value);
      }
      if (shot.figure) {
        // Architecture and window studies should not acquire an accidental
        // player merely because every candidate carries a legal anchor point.
        // Older saved figure shots have no `visible` field, so retain their
        // original behaviour unless their composition identifies them.
        const visible = shot.figure.visible
          ?? (shot.meta?.composition ? shot.meta.composition === 'figure' : true);
        gameDebug.player.visible = visible;
        gameDebug.shotPose = visible ? (shot.figure.pose ?? 'still') : null;
        // PlayerRig's rigid-body origin is at the feet; its capsule collider
        // is already offset upward internally. Adding the capsule height here
        // used to suspend every searched figure about 0.84m above the floor.
        const [fx, fz] = shot.figure.position;
        const ground = gameDebug.room ? groundAt(gameDebug.room, fx, fz) : 0;
        gameDebug.teleport(fx, ground, fz);
        gameDebug.pendingYaw = shot.figure.yaw ?? 0;
      }
      const woman = shot.subject?.kind === 'woman' && shot.subject.visible !== false;
      gameDebug.shotWoman.visible = woman;
      if (woman) {
        gameDebug.shotWoman.position = [...shot.subject.position];
        gameDebug.shotWoman.yaw = shot.subject.yaw ?? 0;
        gameDebug.shotWoman.archetype = shot.subject.archetype ?? 'w';
        gameDebug.shotWoman.scenario = shot.subject.scenario ?? shot.meta?.composition ?? null;
      }
      gameDebug.shotTrackedPersonId = shot.subject?.kind === 'pedestrian'
        ? shot.subject.id
        : null;
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
      const trackedPerson = gameDebug.shotTrackedPersonId
        ? gameDebug.pedestrians.find((person) => person.id === gameDebug.shotTrackedPersonId)
        : null;
      const woman = gameDebug.shotWoman.visible ? gameDebug.shotWoman : null;
      const p = woman?.position ?? trackedPerson?.position ?? gameDebug.player.position;
      const subjectYaw = woman?.yaw ?? trackedPerson?.yaw ?? gameDebug.player.yaw;
      const feet = project(camera, [p[0], p[1], p[2]]);
      const head = project(camera, [p[0], p[1] + FIGURE_HEIGHT, p[2]]);
      const onScreen =
        feet.inFront && head.x > -0.15 && head.x < 1.15 && (head.y < 1.1 || feet.y > -0.1);
      const eye = camera.position;
      const distance = Math.hypot(p[0] - eye.x, p[1] - eye.y, p[2] - eye.z);
      const visible = Boolean(woman || trackedPerson || gameDebug.player.visible !== false);

      const windows = room.windowHoles
        .map((h) => {
          const c = project(camera, h.position);
          const top = project(camera, [h.position[0], h.position[1] + h.height / 2, h.position[2]]);
          return { x: c.x, y: c.y, inFront: c.inFront, heightFrac: Math.abs(c.y - top.y) * 2 };
        })
        .filter((w) => w.inFront && w.x > -0.2 && w.x < 1.2 && w.y > -0.2 && w.y < 1.2);

      return {
        figure: {
          visible,
          onScreen: visible && onScreen,
          grounded: woman || trackedPerson ? true : gameDebug.player.grounded,
          x: feet.x,
          footY: feet.y,
          headY: head.y,
          heightFrac: Math.abs(feet.y - head.y),
          distance,
          // Positive when the figure faces roughly away from the camera.
          awayness: Math.cos(subjectYaw - Math.atan2(p[0] - eye.x, p[2] - eye.z)),
          ...(woman ? {
            subjectArchetype: gameDebug.shotWoman.archetype,
            subjectScenario: gameDebug.shotWoman.scenario,
          } : {}),
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
      gameDebug.shotPose = null;
      gameDebug.shotSunAzimuthDeg = null;
      gameDebug.shotTrackedPersonId = null;
      gameDebug.shotWoman.visible = false;
      gameDebug.shotWoman.scenario = null;
      gameDebug.player.visible = true;
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
        figure: {
          position: [player.position[0], player.position[2]],
          yaw: player.yaw,
          visible: player.visible !== false,
          pose: gameDebug.shotPose ?? undefined,
        },
        tuning: {
          ...Object.fromEntries(TUNABLE_IDS.map((id) => [id, runtime.values[id]])),
          ...(Number.isFinite(gameDebug.shotSunAzimuthDeg)
            ? { sunAzimuthDeg: gameDebug.shotSunAzimuthDeg }
            : {}),
        },
      };
    },
  };

  window.__shot = api;
  return api;
}
