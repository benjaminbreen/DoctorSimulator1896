import { APRON_W, GAPSTOW, localToWorld, walkY as gapstowWalkY } from './gapstow.js';
import { CAROUSEL } from './carousel.js';
import { terrainHeight } from './terrain.js';

export const SAILOR_BOY_MODEL_FILE = '/models/sailorsuit-boy.glb';
export const SAILOR_BOY_MOTION_FILE = '/models/sailorsuit-boy-motions.glb';

export const SAILOR_BOY_ANIMATIONS = Object.freeze([
  'SailorBoyIdle',
  'ChickenDance',
  'Running',
  'Pointing',
  'KneelingDown',
  'PlayPunching',
]);

export const SAILOR_BOY_RUN_SPEED = 2.35;

// One end is the carousel's north entry and the other is the dry bank beside
// the Pond. The middle follows the park walks and the complete Gapstow deck;
// returning along this same line guarantees a second bridge crossing.
export const SAILOR_BOY_ROUTE = Object.freeze([
  Object.freeze([6.1, -48.8]),
  Object.freeze([8, -47]),
  Object.freeze([16, -34]),
  Object.freeze([17, -14]),
  Object.freeze(localToWorld(APRON_W, 0)),
  Object.freeze(localToWorld(6, 0)),
  Object.freeze(localToWorld(3, 0)),
  Object.freeze(localToWorld(0, 0)),
  Object.freeze(localToWorld(-3, 0)),
  Object.freeze(localToWorld(-6, 0)),
  Object.freeze(localToWorld(-APRON_W, 0)),
  Object.freeze([-1, 3]),
  Object.freeze([-5, 5]),
]);

export const SAILOR_BOY_POND_LOOK_AT = Object.freeze([2, 23]);
export const SAILOR_BOY_CAROUSEL_LOOK_AT = Object.freeze([CAROUSEL.x, CAROUSEL.z]);

export function sailorBoyRouteLength(points = SAILOR_BOY_ROUTE) {
  let length = 0;
  for (let index = 0; index < points.length - 1; index += 1) {
    length += Math.hypot(
      points[index + 1][0] - points[index][0],
      points[index + 1][1] - points[index][1],
    );
  }
  return length;
}

export function sailorBoyRoutePoint(distance, points = SAILOR_BOY_ROUTE) {
  let remaining = Math.max(0, Number(distance) || 0);
  for (let index = 0; index < points.length - 1; index += 1) {
    const [x1, z1] = points[index];
    const [x2, z2] = points[index + 1];
    const length = Math.hypot(x2 - x1, z2 - z1);
    if (remaining <= length) {
      const amount = length > 0 ? remaining / length : 0;
      return [
        x1 + (x2 - x1) * amount,
        z1 + (z2 - z1) * amount,
        x2 - x1,
        z2 - z1,
      ];
    }
    remaining -= length;
  }
  const [x1, z1] = points.at(-2);
  const [x2, z2] = points.at(-1);
  return [x2, z2, x2 - x1, z2 - z1];
}

const ROUTE_LENGTH = sailorBoyRouteLength();
const TRAVEL_SECONDS = ROUTE_LENGTH / SAILOR_BOY_RUN_SPEED;

// Travel and performance now share one clock. The former implementation
// independently stopped a ping-pong route for gesture phases, so the boy
// repeatedly performed at whichever point happened to be current—often the
// bridge crown. These phases put every pause at an authored destination.
const BEHAVIOR_PHASES = Object.freeze([
  Object.freeze({
    phase: 'dancing-at-carousel', duration: 5.1, animation: 'ChickenDance',
    distance: 0, faceCarousel: true,
  }),
  Object.freeze({
    phase: 'catching-breath-at-carousel', duration: 3.5, animation: 'SailorBoyIdle',
    distance: 0, faceCarousel: true,
  }),
  Object.freeze({
    phase: 'crossing-to-pond', duration: TRAVEL_SECONDS, animation: 'Running',
    moving: true, from: 0, to: ROUTE_LENGTH, direction: 1,
  }),
  Object.freeze({
    phase: 'pointing-at-pond', duration: 2.3, animation: 'Pointing',
    distance: ROUTE_LENGTH, facePond: true,
  }),
  Object.freeze({
    phase: 'kneeling-down-by-pond', duration: 3.1, animation: 'KneelingDown',
    distance: ROUTE_LENGTH, facePond: true,
  }),
  Object.freeze({
    phase: 'kneeling-by-pond', duration: 3.8, animation: 'KneelingDown',
    distance: ROUTE_LENGTH, holdPose: true, facePond: true,
  }),
  Object.freeze({
    phase: 'standing-up-by-pond', duration: 3.1, animation: 'KneelingDown',
    distance: ROUTE_LENGTH, reverse: true, facePond: true,
  }),
  Object.freeze({
    phase: 'play-boxing-by-pond', duration: 1.6, animation: 'PlayPunching',
    distance: ROUTE_LENGTH, facePond: true,
  }),
  Object.freeze({
    phase: 'loitering-by-pond', duration: 3.5, animation: 'SailorBoyIdle',
    distance: ROUTE_LENGTH, facePond: true,
  }),
  Object.freeze({
    phase: 'crossing-back-to-carousel', duration: TRAVEL_SECONDS, animation: 'Running',
    moving: true, from: ROUTE_LENGTH, to: 0, direction: -1,
  }),
  Object.freeze({
    phase: 'back-at-carousel', duration: 2.5, animation: 'SailorBoyIdle',
    distance: 0, faceCarousel: true,
  }),
]);

export const SAILOR_BOY_BEHAVIOR_SECONDS = BEHAVIOR_PHASES
  .reduce((sum, phase) => sum + phase.duration, 0);

export function sailorBoyBehaviorState(elapsedSeconds) {
  let elapsed = ((Number(elapsedSeconds) || 0) % SAILOR_BOY_BEHAVIOR_SECONDS
    + SAILOR_BOY_BEHAVIOR_SECONDS) % SAILOR_BOY_BEHAVIOR_SECONDS;
  for (const phase of BEHAVIOR_PHASES) {
    if (elapsed < phase.duration) {
      const progress = phase.duration > 0 ? elapsed / phase.duration : 1;
      const distance = phase.moving
        ? phase.from + (phase.to - phase.from) * progress
        : phase.distance;
      return { ...phase, elapsed, progress, distance };
    }
    elapsed -= phase.duration;
  }
  return { ...BEHAVIOR_PHASES[0], elapsed: 0, progress: 0, distance: 0 };
}

export function sailorBoyGroundY(x, z) {
  const dx = x - GAPSTOW.x;
  const dz = z - GAPSTOW.z;
  const cos = Math.cos(GAPSTOW.yaw);
  const sin = Math.sin(GAPSTOW.yaw);
  const along = dx * cos - dz * sin;
  const across = dx * sin + dz * cos;
  if (Math.abs(along) <= APRON_W && Math.abs(across) <= 2.2) {
    return gapstowWalkY(along) + 0.02;
  }
  return terrainHeight(x, z);
}
