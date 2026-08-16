export const HOTEL_DOORMAN_MODEL_FILE = '/models/hotel-doorman.glb';
export const HOTEL_DOORMAN_MOTION_FILE = '/models/hotel-doorman-motions.glb';

export const HOTEL_DOORMAN_ANIMATIONS = Object.freeze([
  'DoormanIdle',
  'HeadNod',
  'CockyHeadTurn',
  'ThoughtfulHeadShake',
  'Acknowledging',
  'Waving',
  'MildlyAnnoyed',
  'HoldingSignIdle',
  'StandingArguing',
  'HoldingObjectOneHand',
  'StandingLeaningWall',
  'StandingIdleAlternate',
  'Walk',
]);

export const HOTEL_DOORMAN_PLACEMENTS = Object.freeze([
  Object.freeze({
    id: 'new-netherland-exterior-doorman',
    label: 'New Netherland exterior doorman',
    zone: 'central-park',
    location: 'New Netherland Hotel entrance',
    age: 44,
    position: Object.freeze([108.2, 1.29, 73.05]),
    yaw: -Math.PI / 2,
    greetsPedestrians: true,
  }),
  Object.freeze({
    id: 'new-netherland-lobby-doorman',
    label: 'New Netherland lobby doorman',
    zone: 'new-netherland-lobby',
    location: 'New Netherland Hotel lobby',
    age: 44,
    position: Object.freeze([-6.25, 0, 1.65]),
    yaw: -Math.PI / 2,
    greetsPedestrians: false,
  }),
]);

const BUMP_MOTIONS = Object.freeze([
  'Acknowledging',
  'MildlyAnnoyed',
  'StandingArguing',
]);

// Zero is the first collision. Further collisions remain argumentative instead
// of wrapping back to a polite response.
export function doormanBumpMotion(previousBumps = 0) {
  const index = Math.min(BUMP_MOTIONS.length - 1, Math.max(0, Math.floor(previousBumps)));
  return BUMP_MOTIONS[index];
}

export function isPassingPedestrian(agent, position, radius = 3.8) {
  if (!agent || agent.kind !== 'pedestrian') return false;
  const velocity = agent.velocity ?? [0, 0];
  if (Math.hypot(velocity[0] ?? 0, velocity[1] ?? 0) < 0.35) return false;
  return Math.hypot(agent.x - position[0], agent.z - position[2]) <= radius + (agent.r ?? 0);
}

export function hotelDoormenForZone(zone) {
  return HOTEL_DOORMAN_PLACEMENTS.filter((placement) => placement.zone === zone);
}
