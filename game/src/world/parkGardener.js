import { terrainHeight } from './terrain.js';
import { DEFAULT_CLOCK_RATE } from './clock.js';

export const PARK_GARDENER_MODEL_FILE = '/models/central-park-gardener.glb';
export const PARK_GARDENER_MOTION_FILE = '/models/central-park-gardener-motions.glb';

export const PARK_GARDENER_ANIMATIONS = Object.freeze([
  'GardenerIdle',
  'Walking',
  'WalkingCarry',
  'Watering',
  'DigAndPlantSeeds',
  'KneelingDown',
  'BenchRest',
]);

export const PARK_GARDENER_DAY = Object.freeze({ startHour: 7, endHour: 18.5 });

// Measured from the shipped GLBs. One-shot schedule slots must last at least
// this long in real time even though the civil clock advances four times as
// quickly. The small blend allowance lets the incoming pose settle before the
// next state takes over.
export const PARK_GARDENER_CLIP_SECONDS = Object.freeze({
  KneelingDown: 2.8,
  Watering: 5.633,
  DigAndPlantSeeds: 5.533,
});
const CLIP_BLEND_ALLOWANCE = 0.3;

export function gardenerOneShotGameSeconds(animation) {
  const duration = PARK_GARDENER_CLIP_SECONDS[animation];
  if (!Number.isFinite(duration)) return 0;
  return Math.ceil((duration + CLIP_BLEND_ALLOWANCE) * DEFAULT_CLOCK_RATE);
}

const SITE_A = Object.freeze([28.5, -44]);
const SITE_B = Object.freeze([46, -34]);
const SITE_C = Object.freeze([62, -8]);
const REST_BENCH = Object.freeze([37, -44]);
const SPEECH_VIEW = Object.freeze([-29.2, 69.2]);

function atGround([x, z]) {
  return [x, terrainHeight(x, z), z];
}

function face(from, to) {
  return Math.atan2(to[0] - from[0], to[1] - from[1]);
}

function walk(from, to, amount) {
  const x = from[0] + (to[0] - from[0]) * amount;
  const z = from[1] + (to[1] - from[1]) * amount;
  return {
    position: [x, terrainHeight(x, z), z],
    yaw: face(from, to),
    animation: 'WalkingCarry',
    carryingCan: true,
    moving: true,
  };
}

const WORK_PHASES = Object.freeze([
  Object.freeze({ duration: 24, kind: 'walk', from: REST_BENCH, to: SITE_A }),
  Object.freeze({ duration: 24, phase: 'watering-dairy-bed', site: SITE_A, animation: 'Watering', carryingCan: true }),
  Object.freeze({ duration: 64, kind: 'walk', from: SITE_A, to: SITE_B }),
  Object.freeze({ duration: gardenerOneShotGameSeconds('KneelingDown'), phase: 'kneeling', site: SITE_B, animation: 'KneelingDown' }),
  Object.freeze({ duration: 28, phase: 'digging-and-planting', site: SITE_B, animation: 'DigAndPlantSeeds' }),
  Object.freeze({ duration: gardenerOneShotGameSeconds('KneelingDown'), phase: 'standing-after-digging', site: SITE_B, animation: 'KneelingDown', reverse: true }),
  Object.freeze({ duration: 94, kind: 'walk', from: SITE_B, to: SITE_C }),
  Object.freeze({ duration: 24, phase: 'watering-east-drive-bed', site: SITE_C, animation: 'Watering', carryingCan: true }),
  Object.freeze({ duration: 136, kind: 'walk', from: SITE_C, to: REST_BENCH }),
  Object.freeze({ duration: 48, phase: 'resting-on-dairy-bench', site: REST_BENCH, animation: 'BenchRest', yaw: 0.15 }),
]);

export const PARK_GARDENER_WORK_CYCLE_SECONDS = WORK_PHASES
  .reduce((sum, phase) => sum + phase.duration, 0);

export function parkGardenerScheduleState(timeOfDay) {
  const hour = ((Number(timeOfDay) || 0) % 24 + 24) % 24;
  if (hour < PARK_GARDENER_DAY.startHour || hour >= PARK_GARDENER_DAY.endHour) {
    return {
      phase: 'off-duty', active: false, position: [0, -100, 0], yaw: 0,
      animation: 'GardenerIdle', carryingCan: false,
    };
  }
  if (hour >= 9.5 && hour < 10) {
    return {
      phase: 'watching-roosevelt-speech',
      active: true,
      position: atGround(SPEECH_VIEW),
      yaw: face(SPEECH_VIEW, [-34, 73]),
      animation: 'GardenerIdle',
      carryingCan: false,
    };
  }

  let elapsed = ((hour - PARK_GARDENER_DAY.startHour) * 3600)
    % PARK_GARDENER_WORK_CYCLE_SECONDS;
  if (elapsed < 0) elapsed += PARK_GARDENER_WORK_CYCLE_SECONDS;
  for (let index = 0; index < WORK_PHASES.length; index += 1) {
    const phase = WORK_PHASES[index];
    if (elapsed <= phase.duration) {
      if (phase.kind === 'walk') {
        return {
          phase: `walking-to-task-${index}`,
          active: true,
          ...walk(phase.from, phase.to, elapsed / phase.duration),
        };
      }
      const position = atGround(phase.site);
      return {
        phase: phase.phase,
        active: true,
        position,
        yaw: phase.yaw ?? face(phase.site, [phase.site[0] + 1, phase.site[1] + 0.2]),
        animation: phase.animation,
        carryingCan: phase.carryingCan ?? false,
        reverse: phase.reverse ?? false,
      };
    }
    elapsed -= phase.duration;
  }
  return {
    phase: 'resting-on-dairy-bench', active: true, position: atGround(REST_BENCH),
    yaw: 0.15, animation: 'BenchRest', carryingCan: false,
  };
}
