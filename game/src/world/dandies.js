import { terrainHeight } from './terrain.js';
import { WALK_TOP } from './streetGrid.js';

export const DANDY_MODEL_FILE = '/models/tophat-dandy.glb';
export const DANDY_MOTION_FILE = '/models/tophat-dandy-motions.glb';

export const DANDY_ANIMATIONS = Object.freeze([
  'DandyIdle',
  'WalkingStickIdle',
  'WalkingStickWalk',
  'StandingAcknowledging',
  'CockyHeadTurn',
]);

export const DANDY_PLACEMENTS = Object.freeze([
  Object.freeze({
    id: 'office-building-lobby-dandy',
    zone: 'foyer',
    location: "Player's building lobby",
    position: Object.freeze([2.2, 0, -4.1]),
    yaw: -0.55,
    age: 34,
  }),
  Object.freeze({
    id: 'new-netherland-lobby-dandy',
    zone: 'new-netherland-lobby',
    location: 'New Netherland Hotel lobby',
    position: Object.freeze([2.25, 0, 1.45]),
    yaw: -2.15,
    age: 31,
  }),
  Object.freeze({
    id: 'metropolitan-club-lobby-dandy',
    zone: 'metropolitan-club-lobby',
    location: 'Metropolitan Club lobby',
    position: Object.freeze([1.9, 0, 2.25]),
    yaw: -1.9,
    age: 38,
  }),
  Object.freeze({
    id: 'central-park-south-dandy',
    zone: 'central-park',
    location: 'Cop Cot shelter and Central Park South',
    position: Object.freeze([-32.4, terrainHeight(-32.4, 71.8), 71.8]),
    yaw: Math.atan2(-34 - (-32.4), 73 - 71.8),
    age: 33,
    talksWithRooseveltUntil: 10,
    route: Object.freeze({
      points: Object.freeze([
        Object.freeze([-32.4, 71.8]),
        Object.freeze([-28, 62]),
        Object.freeze([-16, 68]),
        Object.freeze([-2, 68]),
        Object.freeze([24, 64]),
        Object.freeze([46, 64]),
        Object.freeze([72, 64]),
        Object.freeze([86, 66]),
        Object.freeze([94, 80]),
        Object.freeze([94, 97.6]),
        Object.freeze([82, 97.6]),
        Object.freeze([43, 97.6]),
        Object.freeze([4, 97.6]),
        Object.freeze([-34, 97.6]),
        Object.freeze([-72, 97.6]),
      ]),
      startFraction: 0,
      speed: 1.16,
    }),
  }),
]);

export function dandiesForZone(zone) {
  return DANDY_PLACEMENTS.filter((placement) => placement.zone === zone);
}

export function dandyConversationActive(placement, timeOfDay) {
  if (!Number.isFinite(placement?.talksWithRooseveltUntil)) return false;
  const hour = ((Number(timeOfDay) || 0) % 24 + 24) % 24;
  return hour < placement.talksWithRooseveltUntil;
}

export function dandyGroundY(x, z) {
  return x < 96 && z < 84 ? terrainHeight(x, z) : WALK_TOP;
}

export function dandyRouteLength(points) {
  let length = 0;
  for (let index = 0; index < points.length - 1; index += 1) {
    length += Math.hypot(
      points[index + 1][0] - points[index][0],
      points[index + 1][1] - points[index][1],
    );
  }
  return length;
}

export function dandyRoutePoint(points, distance) {
  let remaining = Math.max(0, distance);
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
