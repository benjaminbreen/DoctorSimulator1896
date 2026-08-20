// One inventory for the live park crowd and the NPC review panel. Set
// pieces stay authored; the ambient walkers come from the crowd pool.
import { CROWD_SLOT_ARCHETYPES } from './crowdScheduler.js';
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

// Getting off a bench to come and complain. Exported from a 33-bone Mixamo
// download, whose bone names are a subset of the 65-bone rig's, so it binds
// on every pedestrian figure — the fingers simply do not move.
export const PEDESTRIAN_STANDUP_FILE = '/models/ped-anim-standup.glb';

// Background figures are close enough to deserve the full models on desktop,
// but phone screens cannot resolve their 1024px costume maps at park viewing
// distances. These variants retain the same skeleton and clips while reducing
// decoded texture memory and per-frame skinning cost.
const USE_MOBILE_BACKGROUND_MODELS = shouldRecycleWebGLContextOnTravel();
function backgroundModelPath(name) {
  return `/models/${name}${USE_MOBILE_BACKGROUND_MODELS ? '-mobile' : ''}.glb?v=crowd-opt-3`;
}

function backgroundLodPath(name) {
  return `/models/${name}-lod.glb?v=crowd-lod-2`;
}

const BOWLER_MODEL = backgroundModelPath('pedestrian-b');
const WORKING_WOMAN_MODEL = backgroundModelPath('pedestrian-c');
const SUMMER_DRESS_MODEL = backgroundModelPath('pedestrian-d');
const SOMBER_WOMAN_MODEL = backgroundModelPath('pedestrian-e');
const FORTIES_WOMAN_MODEL = backgroundModelPath('pedestrian-f');
const STRAWHAT_MODEL = backgroundModelPath('strawhat-pedestrian');
// 65-bone rigs sharing the strawhat motion pack; no motion files of their own.
const NURSEMAID_MODEL = '/models/nursemaid.glb';
const LILAC_WOMAN_MODEL = '/models/lilac-dress-woman.glb';
const RATIONAL_WOMAN_MODEL = '/models/rational-dress-woman.glb';
const HOTEL_MAID_MODEL = '/models/hotel-maid.glb';
const HOTEL_BELLHOP_MODEL = '/models/hotel-bellhop.glb';

const LOD_MODEL_NAMES = Object.freeze({
  m: 'pedestrian-b',
  w: 'pedestrian-c',
  d: 'pedestrian-d',
  s: 'pedestrian-e',
  f: 'pedestrian-f',
  h: 'strawhat-pedestrian',
  n: 'nursemaid',
  l: 'lilac-dress-woman',
  r: 'rational-dress-woman',
  hm: 'hotel-maid',
  bh: 'hotel-bellhop',
});

export const PEDESTRIAN_LOD_ARCHETYPES = Object.freeze(Object.keys(LOD_MODEL_NAMES));
export const PEDESTRIAN_LOD_FILES = Object.freeze(
  PEDESTRIAN_LOD_ARCHETYPES.map((key) => backgroundLodPath(LOD_MODEL_NAMES[key])),
);

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
  'StandingArguing', 'QuickFormalBow', 'AnnoyedHeadShake', 'PlayingViolin',
]);

export const PEDESTRIAN_ARCHETYPES = Object.freeze({
  m: Object.freeze({
    id: 'bowler-man',
    label: 'Bowler-hat man',
    modelPath: BOWLER_MODEL,
    lodModelPath: backgroundLodPath(LOD_MODEL_NAMES.m),
    animationSources: Object.freeze([
      BOWLER_MODEL,
      ...PEDESTRIAN_MAN_CLIP_FILES,
      PEDESTRIAN_REACTION_FILE,
      PEDESTRIAN_STANDUP_FILE,
    ]),
    animations: Object.freeze([
      'Idle',
      'Walk',
      'Briefcase Idle',
      'Sit Ground',
      'Lie Down',
      'Sit',
      'Collision Reaction',
      'StandUp',
    ]),
  }),
  w: Object.freeze({
    id: 'working-woman',
    label: 'Working woman',
    modelPath: WORKING_WOMAN_MODEL,
    lodModelPath: backgroundLodPath(LOD_MODEL_NAMES.w),
    animationSources: Object.freeze([
      WORKING_WOMAN_MODEL,
      ...PEDESTRIAN_WOMAN_CLIP_FILES,
      '/models/ped-anim-sit-ground.glb',
      '/models/ped-anim-lie.glb',
      '/models/ped-anim-sit.glb',
      PEDESTRIAN_STRAWHAT_MOTION_FILE,
      PEDESTRIAN_STANDUP_FILE,
    ]),
    animations: Object.freeze([
      'Idle',
      'Walk',
      'Sit Ground',
      'Lie Down',
      'Sit',
      ...PEDESTRIAN_FULL_MIXAMO_CLIPS,
      'Collision Reaction',
      'StandUp',
    ]),
  }),
  d: Object.freeze({
    id: 'summer-dress-woman',
    label: 'Summer-dress woman',
    modelPath: SUMMER_DRESS_MODEL,
    lodModelPath: backgroundLodPath(LOD_MODEL_NAMES.d),
    animationSources: Object.freeze([
      SUMMER_DRESS_MODEL,
      ...PEDESTRIAN_WOMAN_CLIP_FILES,
      PEDESTRIAN_STRAWHAT_MOTION_FILE,
      PEDESTRIAN_STANDUP_FILE,
    ]),
    animations: Object.freeze([
      'Idle', 'Walk', ...PEDESTRIAN_FULL_MIXAMO_CLIPS, 'Collision Reaction', 'StandUp',
    ]),
  }),
  // She sits all day, and only leaves the bench to complain about a thrown
  // object — hence the walk and the quarrelling pose but no standing idle.
  s: Object.freeze({
    id: 'somber-seated-woman',
    label: 'Somber seated woman',
    modelPath: SOMBER_WOMAN_MODEL,
    lodModelPath: backgroundLodPath(LOD_MODEL_NAMES.s),
    animationSources: Object.freeze([
      SOMBER_WOMAN_MODEL,
      ...PEDESTRIAN_WOMAN_CLIP_FILES,
      PEDESTRIAN_STRAWHAT_MOTION_FILE,
      PEDESTRIAN_STANDUP_FILE,
    ]),
    animations: Object.freeze([
      'Bench Sit', 'Walk', 'StandingArguing', 'Collision Reaction', 'StandUp',
    ]),
  }),
  n: Object.freeze({
    id: 'nursemaid',
    label: 'Nursemaid',
    modelPath: NURSEMAID_MODEL,
    lodModelPath: backgroundLodPath(LOD_MODEL_NAMES.n),
    animationSources: Object.freeze([
      NURSEMAID_MODEL,
      PEDESTRIAN_STRAWHAT_MOTION_FILE,
      PEDESTRIAN_STANDUP_FILE,
    ]),
    animations: Object.freeze([
      'NursemaidIdle', ...PEDESTRIAN_FULL_MIXAMO_CLIPS, 'Walk', 'Collision Reaction', 'StandUp',
    ]),
  }),
  l: Object.freeze({
    id: 'lilac-dress-woman',
    label: 'Lilac-dress woman',
    modelPath: LILAC_WOMAN_MODEL,
    lodModelPath: backgroundLodPath(LOD_MODEL_NAMES.l),
    animationSources: Object.freeze([
      LILAC_WOMAN_MODEL,
      PEDESTRIAN_STRAWHAT_MOTION_FILE,
      PEDESTRIAN_STANDUP_FILE,
    ]),
    animations: Object.freeze([
      'StandingIdle', 'Walk', ...PEDESTRIAN_FULL_MIXAMO_CLIPS, 'Collision Reaction', 'StandUp',
    ]),
  }),
  r: Object.freeze({
    id: 'rational-dress-woman',
    label: 'Rational-dress woman',
    modelPath: RATIONAL_WOMAN_MODEL,
    lodModelPath: backgroundLodPath(LOD_MODEL_NAMES.r),
    animationSources: Object.freeze([
      RATIONAL_WOMAN_MODEL,
      PEDESTRIAN_STRAWHAT_MOTION_FILE,
      PEDESTRIAN_STANDUP_FILE,
    ]),
    animations: Object.freeze([
      'StandingIdle', 'Walk', ...PEDESTRIAN_FULL_MIXAMO_CLIPS, 'Collision Reaction', 'StandUp',
    ]),
  }),
  // Her baked-in Walk reads badly (skirt drags, feet slide), so she no longer
  // takes crowd slots — she stands, and is kept as a consultation-scene model.
  f: Object.freeze({
    id: 'forties-walking-woman',
    label: 'Woman in her forties',
    modelPath: FORTIES_WOMAN_MODEL,
    lodModelPath: backgroundLodPath(LOD_MODEL_NAMES.f),
    animationSources: Object.freeze([
      FORTIES_WOMAN_MODEL,
      STRAWHAT_MODEL,
      PEDESTRIAN_STRAWHAT_MOTION_FILE,
      PEDESTRIAN_STANDUP_FILE,
    ]),
    animations: Object.freeze([
      'Walk', 'StandingIdle', ...PEDESTRIAN_FULL_MIXAMO_CLIPS, 'Collision Reaction', 'StandUp',
    ]),
  }),
  h: Object.freeze({
    id: 'strawhat-pedestrian',
    label: 'Straw-hatted pedestrian',
    modelPath: STRAWHAT_MODEL,
    lodModelPath: backgroundLodPath(LOD_MODEL_NAMES.h),
    animationSources: Object.freeze([
      STRAWHAT_MODEL,
      PEDESTRIAN_STRAWHAT_MOTION_FILE,
      PEDESTRIAN_STANDUP_FILE,
    ]),
    animations: Object.freeze([
      'StandingIdle', 'Walk', 'Collision Reaction', 'StandUp',
      ...PEDESTRIAN_FULL_MIXAMO_CLIPS,
      'Driving', 'HonkingHorn',
    ]),
  }),
  hm: Object.freeze({
    id: 'hotel-maid',
    label: 'Hotel maid',
    modelPath: HOTEL_MAID_MODEL,
    lodModelPath: backgroundLodPath(LOD_MODEL_NAMES.hm),
    animationSources: Object.freeze([
      HOTEL_MAID_MODEL,
      PEDESTRIAN_STRAWHAT_MOTION_FILE,
      PEDESTRIAN_STANDUP_FILE,
    ]),
    animations: Object.freeze([
      'StandingIdle', 'Walk', ...PEDESTRIAN_FULL_MIXAMO_CLIPS, 'Collision Reaction', 'StandUp',
    ]),
  }),
  bh: Object.freeze({
    id: 'hotel-bellhop',
    label: 'Hotel bellhop',
    modelPath: HOTEL_BELLHOP_MODEL,
    lodModelPath: backgroundLodPath(LOD_MODEL_NAMES.bh),
    animationSources: Object.freeze([
      HOTEL_BELLHOP_MODEL,
      PEDESTRIAN_STRAWHAT_MOTION_FILE,
      PEDESTRIAN_STANDUP_FILE,
    ]),
    animations: Object.freeze([
      'StandingIdle', 'Walk', ...PEDESTRIAN_FULL_MIXAMO_CLIPS, 'Collision Reaction', 'StandUp',
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

// Authored loiterers keep hours: they are somewhere else the rest of the day.
export const PEDESTRIAN_STANDERS = Object.freeze([
  // Waiting for the Belt Line car, on the walk in front of the Scholars'
  // Gate shelter, facing the tracks.
  Object.freeze({ id: 'belt-line-wait-a', x: 64.9, z: 83.6, yaw: 0.12, onTerrain: true, clip: 'Idle', who: 'w', age: 41, label: 'Belt Line stop', schedule: Object.freeze({ startHour: 8, endHour: 11.5 }) }),
  Object.freeze({ id: 'belt-line-wait-b', x: 67.6, z: 83.3, yaw: -0.15, onTerrain: true, clip: 'Briefcase Idle', who: 'm', age: 29, label: 'Belt Line stop', schedule: Object.freeze({ startHour: 9, endHour: 13 }) }),
  Object.freeze({ id: 'fifth-avenue-clerk', x: 108.4, z: 20, yaw: -1.6, onTerrain: false, clip: 'Briefcase Idle', who: 'm', age: 34, label: 'Fifth Avenue', schedule: Object.freeze({ startHour: 8.25, endHour: 9.75 }) }),
  Object.freeze({ id: 'west-boundary-worker', x: -8, z: 88.4, yaw: 3.0, onTerrain: false, clip: 'Idle', who: 'w', age: 61, label: 'West park boundary', schedule: Object.freeze({ startHour: 6.5, endHour: 9.5 }) }),
  Object.freeze({ id: 'metropolitan-club-wall-leaner', wallId: 'metropolitan-club', x: 109, z: 47, yaw: -Math.PI / 2, onTerrain: false, clip: 'StandingLeaningWall', who: 'w', age: 38, label: 'Metropolitan Club wall', schedule: Object.freeze({ startHour: 8.5, endHour: 12 }) }),
  Object.freeze({ id: 'central-park-south-wall-leaner', wallId: 'cps-south-b-0', x: -26.7, z: 98.7, yaw: Math.PI, onTerrain: false, clip: 'StandingLeaningWall', who: 'f', age: 49, label: 'Central Park South apartment wall', schedule: Object.freeze({ startHour: 14, endHour: 18.5 }) }),
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
  // Lawn loungers keep daylight hours; nobody sunbathes at midnight.
  Object.freeze({ id: 'pond-lawn-sitter', x: 75, z: 57, yaw: -0.9, clip: 'Sit Ground', who: 'm', age: 45, label: 'Pond lawn', schedule: Object.freeze({ startHour: 7, endHour: 19.5 }) }),
  Object.freeze({ id: 'pond-lawn-recliner', x: 70, z: 56, yaw: 0.6, clip: 'Lie Down', who: 'm', age: 68, label: 'Pond lawn', schedule: Object.freeze({ startHour: 8.5, endHour: 18 }) }),
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
    schedule: Object.freeze({ startHour: 13, endHour: 17.5 }),
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
    schedule: Object.freeze({ startHour: 9, endHour: 13 }),
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
    schedule: Object.freeze({ startHour: 10, endHour: 12.75 }),
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
    schedule: Object.freeze({ startHour: 10, endHour: 12.75 }),
  }),
]);

// Ambient route walkers were replaced by the scheduled crowd pool
// (crowdScheduler.js + walkGraph.js); slots below appear in the cast list.
export const CROWD_CAST_AGES = Object.freeze(
  CROWD_SLOT_ARCHETYPES.map((_, index) => 24 + ((index * 7) % 40)),
);

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
  const walkers = CROWD_SLOT_ARCHETYPES.map((who, index) => ({
    id: `crowd-${index}`,
    kind: 'pedestrian',
    archetype: who,
    age: CROWD_CAST_AGES[index],
    role: 'Ambient crowd',
    animation: 'Walk',
    location: 'Streets and park walks',
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
