import { terrainHeight } from './terrain.js';
import { SHELTERS } from './rusticwork.js';

export const TEDDY_ROOSEVELT_MODEL_FILE = '/models/teddy-roosevelt.glb';
export const TEDDY_ROOSEVELT_MOTION_FILE = '/models/teddy-roosevelt-motions.glb';

export const TEDDY_ROOSEVELT_ANIMATIONS = Object.freeze([
  'RooseveltIdle',
  'GesticulatingSpeech',
  'GivingSpeech',
  'Walking',
]);

export const ROOSEVELT_SPEECH_START_HOUR = 9.5;
export const ROOSEVELT_SPEECH_END_HOUR = 10;
export const ROOSEVELT_CLUB_DEPARTURE_HOUR = 15;
export const ROOSEVELT_PARK_DEPARTURE_HOUR = 18;

const copCot = SHELTERS.find((shelter) => shelter.id === 'cop-cot');

export const ROOSEVELT_SPEECH_SITE = Object.freeze({
  zone: 'central-park',
  location: 'Cop Cot rustic shelter above the southwest Pond shore',
  shelterId: copCot.id,
  position: Object.freeze([copCot.x, terrainHeight(copCot.x, copCot.z), copCot.z]),
  yaw: copCot.yaw + Math.PI,
});

export const ROOSEVELT_CLUB_SITE = Object.freeze({
  zone: 'metropolitan-club-lobby',
  location: 'Metropolitan Club lobby',
  position: Object.freeze([-1.85, 0, 2.25]),
  yaw: 2.3,
});

const ROOSEVELT_PARK_ROUTE = Object.freeze([
  [94, 80], [88, 70], [82, 54], [76, 38], [68, 22], [60, 8], [52, -6],
  [42, -18], [30, -28], [16, -34], [0, -36], [-18, -34], [-38, -28],
  [-58, -20], [-48, 16], [-38, 52], [-28, 62], [-2, 68], [24, 64],
  [46, 64], [72, 64], [86, 66], [94, 80],
].map((point) => Object.freeze(point)));

function routeLength(points) {
  let total = 0;
  for (let index = 0; index < points.length - 1; index += 1) {
    total += Math.hypot(
      points[index + 1][0] - points[index][0],
      points[index + 1][1] - points[index][1],
    );
  }
  return total;
}

export const ROOSEVELT_PARK_ROUTE_LENGTH = routeLength(ROOSEVELT_PARK_ROUTE);

export function rooseveltRoutePoint(distance) {
  let remaining = ((distance % ROOSEVELT_PARK_ROUTE_LENGTH) + ROOSEVELT_PARK_ROUTE_LENGTH)
    % ROOSEVELT_PARK_ROUTE_LENGTH;
  for (let index = 0; index < ROOSEVELT_PARK_ROUTE.length - 1; index += 1) {
    const [x1, z1] = ROOSEVELT_PARK_ROUTE[index];
    const [x2, z2] = ROOSEVELT_PARK_ROUTE[index + 1];
    const length = Math.hypot(x2 - x1, z2 - z1);
    if (remaining <= length) {
      const amount = length > 0 ? remaining / length : 0;
      const x = x1 + (x2 - x1) * amount;
      const z = z1 + (z2 - z1) * amount;
      return { position: [x, terrainHeight(x, z), z], yaw: Math.atan2(x2 - x1, z2 - z1) };
    }
    remaining -= length;
  }
  const [x, z] = ROOSEVELT_PARK_ROUTE[0];
  return { position: [x, terrainHeight(x, z), z], yaw: 0 };
}

export function rooseveltScheduleState(timeOfDay, zone) {
  const hour = ((Number(timeOfDay) || 0) % 24 + 24) % 24;
  if (hour < ROOSEVELT_SPEECH_START_HOUR) {
    return {
      phase: 'talking-with-dandy',
      active: zone === ROOSEVELT_SPEECH_SITE.zone,
      position: ROOSEVELT_SPEECH_SITE.position,
      yaw: ROOSEVELT_SPEECH_SITE.yaw,
      baseAnimation: 'RooseveltIdle',
      hasSoapbox: false,
    };
  }
  if (hour < ROOSEVELT_SPEECH_END_HOUR) {
    return {
      phase: 'cop-cot-speech',
      active: zone === ROOSEVELT_SPEECH_SITE.zone,
      position: ROOSEVELT_SPEECH_SITE.position,
      yaw: ROOSEVELT_SPEECH_SITE.yaw,
      baseAnimation: 'RooseveltIdle',
      hasSoapbox: true,
    };
  }
  if (hour < ROOSEVELT_CLUB_DEPARTURE_HOUR) {
    return {
      phase: 'metropolitan-club',
      active: zone === ROOSEVELT_CLUB_SITE.zone,
      position: ROOSEVELT_CLUB_SITE.position,
      yaw: ROOSEVELT_CLUB_SITE.yaw,
      baseAnimation: 'RooseveltIdle',
      hasSoapbox: false,
    };
  }
  if (hour < ROOSEVELT_PARK_DEPARTURE_HOUR) {
    const distance = (hour - ROOSEVELT_CLUB_DEPARTURE_HOUR) * 3600 * (1.3 / 4);
    return {
      phase: 'walking-in-central-park',
      active: zone === 'central-park',
      ...rooseveltRoutePoint(distance),
      baseAnimation: 'Walking',
      hasSoapbox: false,
    };
  }
  return {
    phase: 'departed', active: false, position: [0, -100, 0], yaw: 0,
    baseAnimation: 'RooseveltIdle', hasSoapbox: false,
  };
}

export function rooseveltSpeechMotion(index = 0) {
  return index % 2 === 0 ? 'GesticulatingSpeech' : 'GivingSpeech';
}

export function rooseveltSpeechPause(phase, index = 0) {
  if (phase === 'cop-cot-speech') return 1.4 + (index % 2) * 0.8;
  return 8 + ((index * 7) % 5) * 1.8;
}
