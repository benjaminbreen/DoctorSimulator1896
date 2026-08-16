import { WALK_TOP } from './streetGrid.js';
import { terrainHeight } from './terrain.js';

export const STREET_POLICEMAN_MODEL_FILE = '/models/street-policeman.glb';
export const STREET_POLICEMAN_MOTION_FILE = '/models/street-policeman-motions.glb';
// A posted officer is stationary and deliberately centred between the two
// traffic lanes. Cars can therefore use a tighter planning buffer than they
// use for an unpredictable walking pedestrian. The emergency hull check in
// stepCarriage remains unchanged if a vehicle is actually driven too close.
export const POLICE_TRAFFIC_CLEARANCE = 0.72;

export const STREET_POLICEMAN_ANIMATIONS = Object.freeze([
  'PolicemanIdle',
  'BlowAKiss',
  'Waving',
  'MildlyAnnoyed',
  'StandingArguing',
  'Acknowledging',
  'CockyHeadTurn',
  'ThoughtfulHeadShake',
  'ArmsCrossedFidget',
  'RightTurn',
  'LeftTurn',
  'Walk',
]);

export const POLICE_BUMP_SEQUENCE = Object.freeze(['MildlyAnnoyed', 'StandingArguing']);

const ROOSEVELT_POSITION = Object.freeze([-34, 73]);
// These are two additional officers assigned to the gathering. The posted
// Central Park South officers remain at their traffic stations throughout.
export const POLICE_SPEECH_AUDIENCE = Object.freeze([
  Object.freeze({ position: Object.freeze([-29.3, 75.4]), yaw: -2.03 }),
  Object.freeze({ position: Object.freeze([-38.6, 69.4]), yaw: 0.91 }),
]);

export function policeSpeechAudienceState(postIndex, timeOfDay) {
  const hour = ((Number(timeOfDay) || 0) % 24 + 24) % 24;
  if (hour < 9.5 || hour >= 10) return null;
  const audience = POLICE_SPEECH_AUDIENCE[postIndex % POLICE_SPEECH_AUDIENCE.length];
  const [x, z] = audience.position;
  return {
    position: [x, terrainHeight(x, z), z],
    yaw: Math.atan2(ROOSEVELT_POSITION[0] - x, ROOSEVELT_POSITION[1] - z),
  };
}

function seeded01(postIndex, eventIndex, salt) {
  const value = Math.sin(
    (postIndex + 1) * 127.1 + (eventIndex + 1) * 311.7 + salt * 74.31,
  ) * 43758.5453;
  return value - Math.floor(value);
}

export function policeTurnInterval(postIndex, eventIndex) {
  return 10 + seeded01(postIndex, eventIndex, 1) * 20;
}

export function policeTurnMotion(postIndex, eventIndex) {
  return seeded01(postIndex, eventIndex, 2) < 0.5 ? 'LeftTurn' : 'RightTurn';
}

export function policeFidgetInterval(postIndex, eventIndex) {
  return 34 + seeded01(postIndex, eventIndex, 3) * 38;
}

export function policeSidestepOffset(agents, position, amount = 0.72) {
  const traffic = agents.filter((agent) => {
    if (!agent?.trafficId || (agent.speed ?? 0) < 0.4 || !Number.isFinite(agent.yaw)) return false;
    const dx = position[0] - agent.x;
    const dz = position[2] - agent.z;
    const fx = Math.sin(agent.yaw);
    const fz = Math.cos(agent.yaw);
    const ahead = dx * fx + dz * fz;
    const side = dx * -fz + dz * fx;
    return ahead > -2.5 && ahead < 13 + (agent.r ?? 0) && Math.abs(side) < 3.2;
  });
  if (traffic.length === 0) return 0;

  const candidates = [-amount, 0, amount];
  const clearance = (offset, agent) => {
    const dx = position[0] - agent.x;
    const dz = position[2] + offset - agent.z;
    return Math.abs(dx * -Math.cos(agent.yaw) + dz * Math.sin(agent.yaw));
  };
  return candidates.reduce((best, candidate) => {
    const score = Math.min(...traffic.map((agent) => clearance(candidate, agent)));
    return score > best.score + 1e-6 ? { offset: candidate, score } : best;
  }, { offset: 0, score: Math.min(...traffic.map((agent) => clearance(0, agent))) }).offset;
}

export function majorEventForPolice(events, position, radius = 26) {
  return events
    .filter((event) => Math.hypot(event.x - position[0], event.z - position[2]) <= radius)
    .sort((left, right) => right.id - left.id)[0] ?? null;
}

export function policeFacingForEvent(event, position) {
  return Math.atan2(event.x - position[0], event.z - position[2]);
}

// These stand on the Central Park South centre line shown in the overhead
// reference: far enough from either travel lane for traffic to pass on both
// sides, but close enough to direct it.
export const STREET_POLICE_POSTS = Object.freeze([
  Object.freeze({
    id: 'central-park-south-west-policeman',
    label: 'Central Park South policeman',
    location: 'Central Park South near Sixth Avenue',
    position: Object.freeze([-50, WALK_TOP - 0.13, 91]),
    yaw: 0,
    age: 39,
  }),
  Object.freeze({
    id: 'grand-army-plaza-policeman',
    label: 'Grand Army Plaza policeman',
    location: 'Central Park South at Grand Army Plaza',
    position: Object.freeze([92, WALK_TOP - 0.13, 91]),
    yaw: Math.PI,
    age: 46,
  }),
]);

const VEHICLE_GESTURES = Object.freeze([
  'Waving',
  'MildlyAnnoyed',
  'StandingArguing',
  'Acknowledging',
]);

export function policeVehicleGesture(passCount = 0) {
  return VEHICLE_GESTURES[Math.max(0, Math.floor(passCount)) % VEHICLE_GESTURES.length];
}

export function isApproachingFemalePedestrian(agent, position, radius = 5.2) {
  if (!agent || agent.kind !== 'pedestrian' || agent.gender !== 'female') return false;
  const dx = position[0] - agent.x;
  const dz = position[2] - agent.z;
  const distance = Math.hypot(dx, dz);
  if (distance > radius + (agent.r ?? 0) || distance < 1e-5) return false;
  const velocity = agent.velocity ?? [0, 0];
  return ((velocity[0] ?? 0) * dx + (velocity[1] ?? 0) * dz) / distance > 0.25;
}

export function isPassingTraffic(agent, position, radius = 8.5) {
  if (!agent?.trafficId || (agent.speed ?? 0) < 0.4) return false;
  return Math.hypot(agent.x - position[0], agent.z - position[2]) <= radius + (agent.r ?? 0);
}
