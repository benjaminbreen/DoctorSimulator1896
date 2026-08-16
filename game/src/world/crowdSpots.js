// Places the ambient crowd can actually live in: doors that swallow and
// produce people, bench seats, and lawn spots. Each spot names an approach
// point that lies exactly on an authored walk, so the graph can route to it
// and the figure crosses only a short piece of open ground.

import { parkItems } from './centralPark.js';

// Doors stand a step off a sidewalk centerline; the landing is the point on
// that line the graph attaches to. Entering one hides the figure (they are
// indoors), so a door is also a spawn point that needs no distance check.
export const CROWD_DOORS = Object.freeze([
  Object.freeze({ id: 'new-netherland-door', x: 109.4, z: 70.2, landing: Object.freeze([108.6, 70.2]) }),
  Object.freeze({ id: 'metropolitan-club-door', x: 109.4, z: 44, landing: Object.freeze([108.6, 44]) }),
  Object.freeze({ id: 'cps-brownstone-west-door', x: -26, z: 98.6, landing: Object.freeze([-26, 97.6]) }),
  Object.freeze({ id: 'cps-brownstone-east-door', x: 30, z: 98.6, landing: Object.freeze([30, 97.6]) }),
  Object.freeze({ id: 'fifty-eighth-flat-door', x: 60, z: 129.4, landing: Object.freeze([60, 128.4]) }),
]);

// Benches with free seats. The three benches used by authored sitters stay
// theirs. `approach` must be an exact PATHS point (walkGraph splits there).
const BENCH_SPECS = [
  { benchId: 'pond-walk-bench-1', approach: [46, 64] },
  { benchId: 'pond-walk-bench-2', approach: [12, 66] },
  { benchId: 'center-drive-bench-1', approach: [60, 8] },
  { benchId: 'green-bench-0', approach: [-14, -62] },
  { benchId: 'north-walk-bench-2', approach: [-8, 8] },
];

// Open-lawn rest spots, each a short walk off a path point.
const LAWN_SPECS = [
  { id: 'pond-lawn-west', x: 52, z: 58, yaw: -0.5, approach: [58, 63] },
  { id: 'green-lawn-east', x: -22, z: -44, yaw: 0.7, approach: [-14, -38] },
  { id: 'hallett-lawn', x: -6, z: 12, yaw: 1.8, approach: [-8, 8] },
];

// Which archetypes can play which resting clip. The bowler rig (m) carries
// the plain shared sits; the full Mixamo rigs (w, f, h, l, r) sit with the
// library clip; only m and w have ground clips.
export const SPOT_CLIPS = Object.freeze({
  bench: Object.freeze({
    m: 'Sit', w: 'SittingIdle', f: 'SittingIdle', h: 'SittingIdle',
    l: 'SittingIdle', r: 'SittingIdle',
  }),
  lawn: Object.freeze({ m: 'Sit Ground', w: 'Sit Ground' }),
});

function benchSeat(benchId, along, approach, seat) {
  const bench = parkItems.find((item) => item.id === benchId);
  if (!bench) throw new Error(`Crowd bench not found: ${benchId}`);
  const yaw = bench.yaw ?? 0;
  return {
    id: `${benchId}-seat-${seat}`,
    kind: 'bench',
    x: bench.position[0] + Math.cos(yaw) * along,
    z: bench.position[2] - Math.sin(yaw) * along,
    yaw,
    approach,
  };
}

export const CROWD_SPOTS = Object.freeze([
  ...BENCH_SPECS.flatMap((spec, index) => [
    Object.freeze(benchSeat(spec.benchId, -0.45, spec.approach, 0)),
    Object.freeze(benchSeat(spec.benchId, 0.45, spec.approach, 1)),
  ]),
  ...LAWN_SPECS.map((spec) => Object.freeze({
    id: spec.id,
    kind: 'lawn',
    x: spec.x,
    z: spec.z,
    yaw: spec.yaw,
    approach: spec.approach,
  })),
]);

export function spotsForArchetype(archetype) {
  return CROWD_SPOTS.filter((spot) => SPOT_CLIPS[spot.kind][archetype]);
}

export function spotClip(spot, archetype) {
  return SPOT_CLIPS[spot.kind][archetype] ?? null;
}
