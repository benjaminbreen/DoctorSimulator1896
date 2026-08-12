// One inventory for the live park crowd and the NPC review panel. Placement
// stays authored for now; this file does not add procedural spawning.
export const PEDESTRIAN_REACTION_FILE = '/models/ped-anim-react.glb';
export const PEDESTRIAN_FALL_REACTION_FILE = '/models/humanoid-reactions.glb';

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

export const PEDESTRIAN_SHARED_CLIPS = Object.freeze(['Sit Ground', 'Lie Down', 'Sit']);

export const PEDESTRIAN_ARCHETYPES = Object.freeze({
  m: Object.freeze({
    id: 'bowler-man',
    label: 'Bowler-hat man',
    modelPath: '/models/pedestrian-b.glb',
    animationSources: Object.freeze([
      '/models/pedestrian-b.glb',
      ...PEDESTRIAN_MAN_CLIP_FILES,
      PEDESTRIAN_REACTION_FILE,
      PEDESTRIAN_FALL_REACTION_FILE,
    ]),
    animations: Object.freeze([
      'Idle',
      'Walk',
      'Briefcase Idle',
      'Sit Ground',
      'Lie Down',
      'Sit',
      'Collision Reaction',
      'FallShoulder',
      'FallGeneric',
      'FallenIdle',
      'RiseFromFall',
    ]),
  }),
  w: Object.freeze({
    id: 'working-woman',
    label: 'Working woman',
    modelPath: '/models/pedestrian-c.glb',
    animationSources: Object.freeze([
      '/models/pedestrian-c.glb',
      ...PEDESTRIAN_WOMAN_CLIP_FILES,
      '/models/ped-anim-sit-ground.glb',
      '/models/ped-anim-lie.glb',
      '/models/ped-anim-sit.glb',
      PEDESTRIAN_REACTION_FILE,
      PEDESTRIAN_FALL_REACTION_FILE,
    ]),
    animations: Object.freeze([
      'Idle',
      'Walk',
      'Sit Ground',
      'Lie Down',
      'Sit',
      'Collision Reaction',
      'FallShoulder',
      'FallGeneric',
      'FallenIdle',
      'RiseFromFall',
    ]),
  }),
  d: Object.freeze({
    id: 'summer-dress-woman',
    label: 'Summer-dress woman',
    modelPath: '/models/pedestrian-d.glb',
    animationSources: Object.freeze([
      '/models/pedestrian-d.glb',
      ...PEDESTRIAN_WOMAN_CLIP_FILES,
      PEDESTRIAN_REACTION_FILE,
      PEDESTRIAN_FALL_REACTION_FILE,
    ]),
    animations: Object.freeze([
      'Idle', 'Walk', 'Collision Reaction',
      'FallShoulder', 'FallGeneric', 'FallenIdle', 'RiseFromFall',
    ]),
  }),
  s: Object.freeze({
    id: 'somber-seated-woman',
    label: 'Somber seated woman',
    modelPath: '/models/pedestrian-e.glb',
    animationSources: Object.freeze(['/models/pedestrian-e.glb']),
    animations: Object.freeze(['Bench Sit']),
  }),
  f: Object.freeze({
    id: 'forties-walking-woman',
    label: 'Woman in her forties',
    modelPath: '/models/pedestrian-f.glb',
    animationSources: Object.freeze([
      '/models/pedestrian-f.glb',
      PEDESTRIAN_REACTION_FILE,
      PEDESTRIAN_FALL_REACTION_FILE,
    ]),
    animations: Object.freeze([
      'Walk', 'Collision Reaction',
      'FallShoulder', 'FallGeneric', 'FallenIdle', 'RiseFromFall',
    ]),
  }),
});

export const PEDESTRIAN_STANDERS = Object.freeze([
  Object.freeze({ id: 'fifth-avenue-clerk', x: 108.4, z: 20, yaw: -1.6, onTerrain: false, clip: 'Briefcase Idle', who: 'm', age: 34, label: 'Fifth Avenue' }),
  Object.freeze({ id: 'west-boundary-worker', x: -8, z: 88.4, yaw: 3.0, onTerrain: false, clip: 'Idle', who: 'w', age: 61, label: 'West park boundary' }),
  Object.freeze({ id: 'pond-walk-visitor', x: 78, z: 64, yaw: -0.6, onTerrain: true, clip: 'Idle', who: 'd', age: 24, label: 'Pond walk' }),
]);

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
]);

export const PEDESTRIAN_ROUTES = Object.freeze([
  Object.freeze({
    id: 'fifth-avenue-walker',
    label: 'Fifth Avenue sidewalk',
    points: Object.freeze([[104, 60], [104.5, 20], [105, -20]]),
    onTerrain: false,
    who: 'd',
    age: 27,
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
  return [...standers, ...posers, ...sitters, ...walkers];
}
