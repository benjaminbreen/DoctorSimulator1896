import { PATHS } from './centralPark.js';

function pathPoints(id) {
  const path = PATHS.find((entry) => entry.id === id);
  if (!path) throw new Error(`Unknown stroller path: ${id}`);
  return path.points;
}

function frozenPoints(points) {
  return Object.freeze(points.map(([x, z]) => Object.freeze([x, z])));
}

const greenWalk = pathPoints('green-walk');
const pondWalk = pathPoints('pond-walk');
const northWalk = pathPoints('north-walk');
const centerDrive = pathPoints('center-drive');
const centerDrivePondJunction = centerDrive.findIndex(([x, z]) => x === 52 && z === -6);

// The Pond circuit uses real connected walks: east-to-west along the outer
// shore, back over the north walk, then down Center Drive to Scholars' Gate.
// The short final link from the gate to the Pond walk lies on the Plaza apron.
const pondCircuit = [
  ...pondWalk,
  ...northWalk.slice(0, -1).reverse(),
  ...centerDrive.slice(0, centerDrivePondJunction + 1).reverse().slice(1),
  pondWalk[0],
];

export const PEDESTRIAN_STROLLER_CIRCUITS = Object.freeze([
  Object.freeze({
    id: 'green-walk-strawhat-stroller',
    label: 'The Green circuit',
    points: frozenPoints(greenWalk),
    onTerrain: true,
    loop: true,
    who: 'h',
    age: 42,
    strollerVariant: 'navy',
    startFraction: 0.08,
    speed: 0.92,
    schedule: Object.freeze({ walkSeconds: 36, pauseSeconds: 7, phaseSeconds: 3 }),
  }),
  Object.freeze({
    id: 'pond-circuit-nursemaid-stroller',
    label: 'Pond and north-shore circuit',
    points: frozenPoints(pondCircuit),
    onTerrain: true,
    crossesGapstow: true,
    loop: true,
    who: 'n',
    age: 47,
    labelOverride: 'Middle-aged nursemaid',
    strollerVariant: 'green',
    startFraction: 0.56,
    speed: 0.84,
    schedule: Object.freeze({ walkSeconds: 51, pauseSeconds: 11, phaseSeconds: 23 }),
  }),
]);

export function strollerScheduleState(schedule, elapsedSeconds) {
  const walkSeconds = Math.max(0.1, Number(schedule?.walkSeconds) || 0.1);
  const pauseSeconds = Math.max(0, Number(schedule?.pauseSeconds) || 0);
  const cycleSeconds = walkSeconds + pauseSeconds;
  const phaseSeconds = Number(schedule?.phaseSeconds) || 0;
  const elapsed = Number.isFinite(elapsedSeconds) ? elapsedSeconds : 0;
  const cycleTime = ((elapsed + phaseSeconds) % cycleSeconds + cycleSeconds) % cycleSeconds;
  return {
    paused: pauseSeconds > 0 && cycleTime >= walkSeconds,
    cycleTime,
    cycleSeconds,
  };
}
