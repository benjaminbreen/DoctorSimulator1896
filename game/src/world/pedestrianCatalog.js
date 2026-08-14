// One inventory for the live park crowd and the NPC review panel. Placement
// stays authored for now; this file does not add procedural spawning.
import { PEDESTRIAN_STROLLER_CIRCUITS } from './strollerPedestrians.js';
import { PARK_VISITOR_ITINERARY } from './parkVisitorItinerary.js';
import { shouldRecycleWebGLContextOnTravel } from '../scene/mobileGraphics.js';
import {
  HOTEL_DOORMAN_ANIMATIONS,
  HOTEL_DOORMAN_MODEL_FILE,
  HOTEL_DOORMAN_MOTION_FILE,
  HOTEL_DOORMAN_PLACEMENTS,
} from './hotelDoormen.js';
import {
  STREET_POLICEMAN_ANIMATIONS,
  STREET_POLICEMAN_MODEL_FILE,
  STREET_POLICEMAN_MOTION_FILE,
  STREET_POLICE_POSTS,
} from './streetPolice.js';
import {
  DANDY_ANIMATIONS,
  DANDY_MODEL_FILE,
  DANDY_MOTION_FILE,
  DANDY_PLACEMENTS,
} from './dandies.js';

export { PEDESTRIAN_STROLLER_CIRCUITS } from './strollerPedestrians.js';
export { PARK_VISITOR_ITINERARY } from './parkVisitorItinerary.js';

export const PEDESTRIAN_REACTION_FILE = '/models/ped-anim-react.glb';

export const PEDESTRIAN_MAN_CLIP_FILES = Object.freeze([
  '/models/ped-anim-walk.glb',
  '/models/ped-anim-briefcase.glb',
  '/models/ped-anim-sit-ground.glb',
  '/models/ped-anim-lie.glb',
  '/models/ped-anim-sit.glb',
]);

export const PEDESTRIAN_WOMAN_CLIP_FILES = Object.freeze([
  '/models/pedc-anim-walk.glb',
]);

// Kept separate from the visual master so these exact-rig Mixamo clips can be
// quality-gated on the other pedestrian meshes without loading duplicate art.
export const PEDESTRIAN_STRAWHAT_MOTION_FILE = '/models/strawhat-motions.glb';

// Background figures are close enough to deserve the full models on desktop,
// but phone screens cannot resolve their 1024px costume maps at park viewing
// distances. These variants retain the same skeleton and clips while reducing
// decoded texture memory and per-frame skinning cost.
const USE_MOBILE_BACKGROUND_MODELS = shouldRecycleWebGLContextOnTravel();
function backgroundModelPath(name) {
  return `/models/${name}${USE_MOBILE_BACKGROUND_MODELS ? '-mobile' : ''}.glb?v=crowd-opt-1`;
}

const BOWLER_MODEL = backgroundModelPath('pedestrian-b');
const WORKING_WOMAN_MODEL = backgroundModelPath('pedestrian-c');
const SUMMER_DRESS_MODEL = backgroundModelPath('pedestrian-d');
const SOMBER_WOMAN_MODEL = backgroundModelPath('pedestrian-e');
const FORTIES_WOMAN_MODEL = backgroundModelPath('pedestrian-f');
const STRAWHAT_MODEL = backgroundModelPath('strawhat-pedestrian');

export const PEDESTRIAN_SHARED_CLIPS = Object.freeze(['Sit Ground', 'Lie Down', 'Sit']);

// These clips were exported against the full 65-bone Mixamo hierarchy shared
// by pedestrian-c, -d, -f, and the Strawhat figure. Keeping the list explicit
// prevents the 33-bone bowler rig from being offered incompatible motions.
export const PEDESTRIAN_FULL_MIXAMO_CLIPS = Object.freeze([
  'StandingAcknowledging', 'StandingLeaningWall',
  'SittingCrossedLegTalking', 'SittingGesticulating', 'SittingAngry',
  'SittingDisapproval', 'SittingFidgeting', 'SittingHitReaction',
  'SittingHopeless', 'SittingIdle', 'SittingThinking',
  'SittingTalkingIntensely', 'SmokingOrEating',
  'StrollerIdle', 'StrollerWalk',
]);

export const PEDESTRIAN_ARCHETYPES = Object.freeze({
  m: Object.freeze({
    id: 'bowler-man',
    label: 'Bowler-hat man',
    modelPath: BOWLER_MODEL,
    animationSources: Object.freeze([
      BOWLER_MODEL,
      ...PEDESTRIAN_MAN_CLIP_FILES,
      PEDESTRIAN_REACTION_FILE,
    ]),
    animations: Object.freeze([
      'Idle',
      'Walk',
      'Briefcase Idle',
      'Sit Ground',
      'Lie Down',
      'Sit',
      'Collision Reaction',
    ]),
  }),
  w: Object.freeze({
    id: 'working-woman',
    label: 'Working woman',
    modelPath: WORKING_WOMAN_MODEL,
    animationSources: Object.freeze([
      WORKING_WOMAN_MODEL,
      ...PEDESTRIAN_WOMAN_CLIP_FILES,
      '/models/ped-anim-sit-ground.glb',
      '/models/ped-anim-lie.glb',
      '/models/ped-anim-sit.glb',
      PEDESTRIAN_STRAWHAT_MOTION_FILE,
    ]),
    animations: Object.freeze([
      'Idle',
      'Walk',
      'Sit Ground',
      'Lie Down',
      'Sit',
      ...PEDESTRIAN_FULL_MIXAMO_CLIPS,
      'Collision Reaction',
    ]),
  }),
  d: Object.freeze({
    id: 'summer-dress-woman',
    label: 'Summer-dress woman',
    modelPath: SUMMER_DRESS_MODEL,
    animationSources: Object.freeze([
      SUMMER_DRESS_MODEL,
      ...PEDESTRIAN_WOMAN_CLIP_FILES,
      PEDESTRIAN_STRAWHAT_MOTION_FILE,
    ]),
    animations: Object.freeze([
      'Idle', 'Walk', ...PEDESTRIAN_FULL_MIXAMO_CLIPS, 'Collision Reaction',
    ]),
  }),
  s: Object.freeze({
    id: 'somber-seated-woman',
    label: 'Somber seated woman',
    modelPath: SOMBER_WOMAN_MODEL,
    animationSources: Object.freeze([SOMBER_WOMAN_MODEL]),
    animations: Object.freeze(['Bench Sit']),
  }),
  f: Object.freeze({
    id: 'forties-walking-woman',
    label: 'Woman in her forties',
    modelPath: FORTIES_WOMAN_MODEL,
    animationSources: Object.freeze([
      FORTIES_WOMAN_MODEL,
      STRAWHAT_MODEL,
      PEDESTRIAN_STRAWHAT_MOTION_FILE,
    ]),
    animations: Object.freeze([
      'Walk', 'StandingIdle', ...PEDESTRIAN_FULL_MIXAMO_CLIPS, 'Collision Reaction',
    ]),
  }),
  h: Object.freeze({
    id: 'strawhat-pedestrian',
    label: 'Straw-hatted pedestrian',
    modelPath: STRAWHAT_MODEL,
    animationSources: Object.freeze([
      STRAWHAT_MODEL,
      PEDESTRIAN_STRAWHAT_MOTION_FILE,
    ]),
    animations: Object.freeze([
      'StandingIdle', 'Walk', 'Collision Reaction',
      ...PEDESTRIAN_FULL_MIXAMO_CLIPS,
      'Driving', 'HonkingHorn',
    ]),
  }),
  o: Object.freeze({
    id: 'hotel-doorman',
    label: 'New Netherland doorman',
    modelPath: HOTEL_DOORMAN_MODEL_FILE,
    animationSources: Object.freeze([
      HOTEL_DOORMAN_MODEL_FILE,
      HOTEL_DOORMAN_MOTION_FILE,
    ]),
    animations: HOTEL_DOORMAN_ANIMATIONS,
  }),
  p: Object.freeze({
    id: 'street-policeman',
    label: 'Street policeman',
    modelPath: STREET_POLICEMAN_MODEL_FILE,
    animationSources: Object.freeze([
      STREET_POLICEMAN_MODEL_FILE,
      STREET_POLICEMAN_MOTION_FILE,
      HOTEL_DOORMAN_MOTION_FILE,
    ]),
    animations: STREET_POLICEMAN_ANIMATIONS,
  }),
  y: Object.freeze({
    id: 'tophat-dandy',
    label: 'Top-hat dandy',
    modelPath: DANDY_MODEL_FILE,
    animationSources: Object.freeze([DANDY_MODEL_FILE, DANDY_MOTION_FILE]),
    animations: DANDY_ANIMATIONS,
    prop: 'walking-stick',
  }),
});

export const PEDESTRIAN_STANDERS = Object.freeze([
  Object.freeze({ id: 'fifth-avenue-clerk', x: 108.4, z: 20, yaw: -1.6, onTerrain: false, clip: 'Briefcase Idle', who: 'm', age: 34, label: 'Fifth Avenue' }),
  Object.freeze({ id: 'west-boundary-worker', x: -8, z: 88.4, yaw: 3.0, onTerrain: false, clip: 'Idle', who: 'w', age: 61, label: 'West park boundary' }),
  Object.freeze({ id: 'metropolitan-club-wall-leaner', wallId: 'metropolitan-club', x: 109, z: 47, yaw: -Math.PI / 2, onTerrain: false, clip: 'StandingLeaningWall', who: 'w', age: 38, label: 'Metropolitan Club wall' }),
  Object.freeze({ id: 'central-park-south-wall-leaner', wallId: 'cps-south-b-0', x: -26.7, z: 98.7, yaw: Math.PI, onTerrain: false, clip: 'StandingLeaningWall', who: 'f', age: 49, label: 'Central Park South apartment wall' }),
  Object.freeze({
    id: 'roosevelt-speech-bowler-a',
    x: -38.7, z: 75.7, yaw: Math.atan2(4.7, -2.7), onTerrain: true, clip: 'Idle', who: 'm', age: 44,
    label: 'Roosevelt speech audience at Cop Cot',
    schedule: Object.freeze({ startHour: 9.5, endHour: 10 }),
  }),
  Object.freeze({
    id: 'roosevelt-speech-bowler-b',
    x: -35.8, z: 68.4, yaw: Math.atan2(1.8, 4.6), onTerrain: true, clip: 'Idle', who: 'm', age: 57,
    label: 'Roosevelt speech audience at Cop Cot',
    schedule: Object.freeze({ startHour: 9.5, endHour: 10 }),
  }),
]);

export function pedestrianScheduleActive(schedule, timeOfDay) {
  if (!schedule) return true;
  const hour = ((Number(timeOfDay) || 0) % 24 + 24) % 24;
  return hour >= schedule.startHour && hour < schedule.endHour;
}

export const PEDESTRIAN_POSERS = Object.freeze([
  Object.freeze({ id: 'pond-lawn-sitter', x: 75, z: 57, yaw: -0.9, clip: 'Sit Ground', who: 'm', age: 45, label: 'Pond lawn' }),
  Object.freeze({ id: 'pond-lawn-recliner', x: 70, z: 56, yaw: 0.6, clip: 'Lie Down', who: 'm', age: 68, label: 'Pond lawn' }),
]);

export const PEDESTRIAN_BENCH_SITTERS = Object.freeze([
  Object.freeze({
    id: 'north-walk-bench-sitter',
    benchId: 'north-walk-bench-0',
    along: 0.6,
    clip: 'Bench Sit',
    who: 's',
    age: 52,
    label: 'North walk bench',
  }),
  Object.freeze({
    id: 'green-bench-strawhat-sitter',
    benchId: 'green-bench-1',
    along: -0.45,
    clip: 'SittingIdle',
    ambientClips: Object.freeze(['SittingFidgeting', 'SittingThinking']),
    who: 'h',
    age: 42,
    label: 'The Green bench',
  }),
  Object.freeze({
    id: 'center-drive-bench-conversation-a',
    benchId: 'center-drive-bench-0',
    along: -0.42,
    yawOffset: 0.16,
    clip: 'SittingIdle',
    ambientClips: Object.freeze(['SittingTalkingIntensely', 'SittingDisapproval']),
    who: 'w',
    age: 35,
    label: 'Center Drive bench conversation',
  }),
  Object.freeze({
    id: 'center-drive-bench-conversation-b',
    benchId: 'center-drive-bench-0',
    along: 0.42,
    yawOffset: -0.16,
    clip: 'SittingIdle',
    ambientClips: Object.freeze(['SittingGesticulating', 'SittingCrossedLegTalking']),
    who: 'd',
    age: 31,
    label: 'Center Drive bench conversation',
  }),
]);

export const PEDESTRIAN_ROUTES = Object.freeze([
  Object.freeze({
    id: 'metropolitan-club-strawhat-walker',
    label: 'Metropolitan Club sidewalk',
    points: Object.freeze([[107.2, 84], [107.2, 59], [107.6, 43], [107.2, 25]]),
    onTerrain: false,
    who: 'h',
    age: 42,
  }),
  Object.freeze({
    id: 'north-sidewalk-walker',
    label: 'North sidewalk',
    points: Object.freeze([[40, 97.6], [0, 97.6], [-44, 97.6]]),
    onTerrain: false,
    who: 'm',
    age: 63,
  }),
  Object.freeze({
    id: 'north-shore-walker',
    label: 'North shore path',
    points: Object.freeze([[84, 72], [60, 71], [34, 76], [8, 80]]),
    onTerrain: true,
    who: 'w',
    age: 36,
  }),
  Object.freeze({
    id: 'dairy-approach-walker',
    label: 'Dairy approach',
    points: Object.freeze([[52, -6], [38, -10], [26, -12], [17, -14], [11.2, -14.2]]),
    onTerrain: true,
    who: 'f',
    age: 46,
  }),
]);

export function currentPedestrianCast() {
  const standers = PEDESTRIAN_STANDERS.map((row) => ({
    id: row.id,
    kind: 'pedestrian',
    archetype: row.who,
    age: row.age,
    role: 'Loitering',
    animation: row.clip,
    location: row.label,
  }));
  const posers = PEDESTRIAN_POSERS.map((row) => ({
    id: row.id,
    kind: 'pedestrian',
    archetype: row.who,
    age: row.age,
    role: 'Resting',
    animation: row.clip,
    location: row.label,
  }));
  const sitters = PEDESTRIAN_BENCH_SITTERS.map((row) => ({
    id: row.id,
    kind: 'pedestrian',
    archetype: row.who,
    age: row.age,
    role: 'Seated',
    animation: row.clip,
    location: row.label,
  }));
  const walkers = PEDESTRIAN_ROUTES.map((row) => ({
    id: row.id,
    kind: 'pedestrian',
    archetype: row.who,
    age: row.age,
    role: 'Walking',
    animation: 'Walk',
    location: row.label,
  }));
  const strollerWalkers = PEDESTRIAN_STROLLER_CIRCUITS.map((row) => ({
    id: row.id,
    kind: 'pedestrian',
    archetype: row.who,
    age: row.age,
    role: 'Pushing a stroller',
    animation: 'StrollerWalk',
    location: row.label,
    strollerVariant: row.strollerVariant,
    labelOverride: row.labelOverride,
  }));
  const scheduledVisitor = {
    id: PARK_VISITOR_ITINERARY.id,
    kind: 'pedestrian',
    archetype: PARK_VISITOR_ITINERARY.who,
    age: PARK_VISITOR_ITINERARY.age,
    role: 'Scheduled visitor',
    animation: 'Walk',
    location: PARK_VISITOR_ITINERARY.label,
  };
  const doormen = HOTEL_DOORMAN_PLACEMENTS.map((row) => ({
    id: row.id,
    kind: 'pedestrian',
    archetype: 'o',
    age: row.age,
    role: 'Doorman',
    animation: 'DoormanIdle',
    location: row.location,
    labelOverride: row.label,
  }));
  const policemen = STREET_POLICE_POSTS.map((row) => ({
    id: row.id,
    kind: 'pedestrian',
    archetype: 'p',
    age: row.age,
    role: 'Policeman',
    animation: 'PolicemanIdle',
    location: row.location,
    labelOverride: row.label,
  }));
  const dandies = DANDY_PLACEMENTS.map((row) => ({
    id: row.id,
    kind: 'pedestrian',
    archetype: 'y',
    age: row.age,
    role: row.route ? 'Walking with a cane' : 'Loitering',
    animation: row.route ? 'WalkingStickWalk' : 'WalkingStickIdle',
    location: row.location,
  }));
  return [
    ...standers,
    ...posers,
    ...sitters,
    ...walkers,
    ...strollerWalkers,
    scheduledVisitor,
    ...doormen,
    ...policemen,
    ...dandies,
  ];
}
