// One inventory for the live park crowd and the NPC review panel. Placement
// stays authored for now; this file does not add procedural spawning.
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
    modelPath: '/models/pedestrian-c.glb',
    animationSources: Object.freeze([
      '/models/pedestrian-c.glb',
      ...PEDESTRIAN_WOMAN_CLIP_FILES,
      '/models/ped-anim-sit-ground.glb',
      '/models/ped-anim-lie.glb',
      '/models/ped-anim-sit.glb',
      PEDESTRIAN_REACTION_FILE,
    ]),
    animations: Object.freeze([
      'Idle',
      'Walk',
      'Sit Ground',
      'Lie Down',
      'Sit',
      'Collision Reaction',
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
    ]),
    animations: Object.freeze(['Idle', 'Walk', 'Collision Reaction']),
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
    ]),
    animations: Object.freeze(['Walk', 'Collision Reaction']),
  }),
});

// [x, z, yaw, onTerrain, clip, archetype, review label]
export const PEDESTRIAN_STANDERS = Object.freeze([
  Object.freeze([108.4, 20, -1.6, false, 'Briefcase Idle', 'm', 'Fifth Avenue']),
  Object.freeze([-8, 88.4, 3.0, false, 'Idle', 'w', 'West park boundary']),
  Object.freeze([78, 64, -0.6, true, 'Idle', 'd', 'Pond walk']),
]);

// [x, z, yaw, clip, archetype, review label]
export const PEDESTRIAN_POSERS = Object.freeze([
  Object.freeze([75, 57, -0.9, 'Sit Ground', 'm', 'Pond lawn']),
  Object.freeze([70, 56, 0.6, 'Lie Down', 'm', 'Pond lawn']),
]);

export const PEDESTRIAN_BENCH_SITTERS = Object.freeze([
  Object.freeze({
    benchId: 'north-walk-bench-0',
    along: 0.6,
    clip: 'Bench Sit',
    who: 's',
    label: 'North walk bench',
  }),
]);

export const PEDESTRIAN_ROUTES = Object.freeze([
  Object.freeze({
    label: 'Fifth Avenue sidewalk',
    points: Object.freeze([[104, 60], [104.5, 20], [105, -20]]),
    onTerrain: false,
    who: 'd',
  }),
  Object.freeze({
    label: 'North sidewalk',
    points: Object.freeze([[40, 97.6], [0, 97.6], [-44, 97.6]]),
    onTerrain: false,
    who: 'm',
  }),
  Object.freeze({
    label: 'North shore path',
    points: Object.freeze([[84, 72], [60, 71], [34, 76], [8, 80]]),
    onTerrain: true,
    who: 'w',
  }),
  Object.freeze({
    label: 'Dairy approach',
    points: Object.freeze([[52, -6], [38, -10], [26, -12], [17, -14], [11.2, -14.2]]),
    onTerrain: true,
    who: 'f',
  }),
]);

export function currentPedestrianCast() {
  const standers = PEDESTRIAN_STANDERS.map((row, index) => ({
    id: `pedestrian-stander-${index}`,
    kind: 'pedestrian',
    archetype: row[5],
    role: 'Loitering',
    animation: row[4],
    location: row[6],
  }));
  const posers = PEDESTRIAN_POSERS.map((row, index) => ({
    id: `pedestrian-poser-${index}`,
    kind: 'pedestrian',
    archetype: row[4],
    role: 'Resting',
    animation: row[3],
    location: row[5],
  }));
  const sitters = PEDESTRIAN_BENCH_SITTERS.map((row, index) => ({
    id: `pedestrian-bench-${index}`,
    kind: 'pedestrian',
    archetype: row.who,
    role: 'Seated',
    animation: row.clip,
    location: row.label,
  }));
  const walkers = PEDESTRIAN_ROUTES.map((row, index) => ({
    id: `pedestrian-walker-${index}`,
    kind: 'pedestrian',
    archetype: row.who,
    role: 'Walking',
    animation: 'Walk',
    location: row.label,
  }));
  return [...standers, ...posers, ...sitters, ...walkers];
}
