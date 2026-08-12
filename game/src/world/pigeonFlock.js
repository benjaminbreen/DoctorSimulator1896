// Deterministic flight data for the park's distant pigeons. Rendering owns
// the wingbeat; this module decides when and where each bird flies.

export const PIGEON_COUNT = 14;
export const SOLO_PIGEON_COUNT = 2;
export const PIGEON_CYCLE_SECONDS = 72;
export const PIGEON_ACTIVE_SECONDS = 28;
export const PIGEON_ROUTE_STAGGER = PIGEON_CYCLE_SECONDS / 2;

export const PIGEON_ROUTES = [
  {
    start: [-138, 28, 76],
    control: [4, 41, 18],
    end: [142, 31, -68],
    bank: -0.08,
  },
  {
    start: [126, 33, -116],
    control: [-2, 43, -4],
    end: [-136, 29, 112],
    bank: 0.1,
  },
];

// These routes stay below the distant flock and cross different parts of the
// park. Their endpoints sit beyond the playable bounds, hiding each loop.
export const SOLO_PIGEON_ROUTES = [
  {
    start: [-112, 14, -58],
    control: [-18, 21, -31],
    end: [112, 15, 22],
    duration: 38,
    offset: 0,
    bank: -0.06,
  },
  {
    start: [111, 18, 69],
    control: [17, 23, 43],
    end: [-111, 13, 57],
    duration: 43,
    offset: 17,
    bank: 0.07,
  },
];

function hash01(seed) {
  const value = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return value - Math.floor(value);
}

function pigeonCycleTime(seconds, routeIndex, continuous) {
  const duration = continuous ? PIGEON_ACTIVE_SECONDS : PIGEON_CYCLE_SECONDS;
  const stagger = continuous ? PIGEON_ACTIVE_SECONDS / 2 : PIGEON_ROUTE_STAGGER;
  const shifted = seconds + routeIndex * stagger;
  return ((shifted % duration) + duration) % duration;
}

export function pigeonCycleState(seconds, routeIndex, continuous = false) {
  const cycleTime = pigeonCycleTime(seconds, routeIndex, continuous);
  return {
    active: continuous || cycleTime < PIGEON_ACTIVE_SECONDS,
    progress: Math.min(1, cycleTime / PIGEON_ACTIVE_SECONDS),
  };
}

// A loose chevron reads as a flock without boid simulation. The small seeded
// offsets stop the two ranks from looking drilled or perfectly mirrored.
export function buildPigeonFlock(seed = 1896, count = PIGEON_COUNT) {
  const birds = [];
  const perRoute = Math.ceil(count / PIGEON_ROUTES.length);
  for (let index = 0; index < count; index += 1) {
    const route = Math.min(PIGEON_ROUTES.length - 1, Math.floor(index / perRoute));
    const local = index - route * perRoute;
    const rank = local === 0 ? 0 : Math.ceil(local / 2);
    const side = local === 0 ? 0 : local % 2 === 1 ? -1 : 1;
    const birdSeed = seed + index * 31.7;
    birds.push({
      id: `pigeon-${index}`,
      route,
      offsetX: side * rank * (1.35 + hash01(birdSeed + 1) * 0.35),
      offsetY: (hash01(birdSeed + 2) - 0.5) * 1.25,
      offsetZ: -rank * (0.85 + hash01(birdSeed + 3) * 0.4),
      scale: 0.72 + hash01(birdSeed + 4) * 0.2,
      flapPhase: hash01(birdSeed + 5) * Math.PI * 2,
      shade: 0.72 + hash01(birdSeed + 6) * 0.28,
    });
  }
  return birds;
}

export function buildSoloPigeons(seed = 1902, count = SOLO_PIGEON_COUNT) {
  return Array.from({ length: count }, (_, index) => ({
    id: `solo-pigeon-${index}`,
    solo: true,
    soloIndex: index,
    route: index % SOLO_PIGEON_ROUTES.length,
    scale: 0.78 + hash01(seed + index * 19.3) * 0.14,
    flapPhase: hash01(seed + index * 23.7 + 1) * Math.PI * 2,
    shade: 0.76 + hash01(seed + index * 29.1 + 2) * 0.24,
  }));
}

function quadratic(a, b, c, t) {
  const inverse = 1 - t;
  return inverse * inverse * a + 2 * inverse * t * b + t * t * c;
}

function quadraticTangent(a, b, c, t) {
  return 2 * (1 - t) * (b - a) + 2 * t * (c - b);
}

// Writes into `out` when supplied so the render loop creates no garbage.
export function pigeonStateAt(bird, seconds, out = {}, continuous = false) {
  const cycleTime = pigeonCycleTime(seconds, bird.route, continuous);
  out.active = continuous || cycleTime < PIGEON_ACTIVE_SECONDS;
  if (!out.active) return out;

  const route = PIGEON_ROUTES[bird.route];
  const t = cycleTime / PIGEON_ACTIVE_SECONDS;
  const [sx, sy, sz] = route.start;
  const [cx, cy, cz] = route.control;
  const [ex, ey, ez] = route.end;
  const dx = quadraticTangent(sx, cx, ex, t);
  const dy = quadraticTangent(sy, cy, ey, t);
  const dz = quadraticTangent(sz, cz, ez, t);
  const horizontal = Math.hypot(dx, dz) || 1;
  const length = Math.hypot(dx, dy, dz) || 1;
  const rightX = dz / horizontal;
  const rightZ = -dx / horizontal;
  const forwardX = dx / length;
  const forwardY = dy / length;
  const forwardZ = dz / length;
  const float = Math.sin(seconds * 0.43 + bird.flapPhase) * 0.28;

  out.x = quadratic(sx, cx, ex, t)
    + rightX * bird.offsetX + forwardX * bird.offsetZ;
  out.y = quadratic(sy, cy, ey, t)
    + bird.offsetY + forwardY * bird.offsetZ + float;
  out.z = quadratic(sz, cz, ez, t)
    + rightZ * bird.offsetX + forwardZ * bird.offsetZ;
  out.yaw = Math.atan2(dx, dz);
  out.pitch = -Math.atan2(dy, horizontal);
  out.bank = route.bank + Math.sin(t * Math.PI * 2 + bird.flapPhase) * 0.035;
  return out;
}

export function soloPigeonStateAt(bird, seconds, out = {}) {
  const route = SOLO_PIGEON_ROUTES[bird.route];
  const cycleTime = ((seconds + route.offset) % route.duration + route.duration) % route.duration;
  const t = cycleTime / route.duration;
  const [sx, sy, sz] = route.start;
  const [cx, cy, cz] = route.control;
  const [ex, ey, ez] = route.end;
  const dx = quadraticTangent(sx, cx, ex, t);
  const dy = quadraticTangent(sy, cy, ey, t);
  const dz = quadraticTangent(sz, cz, ez, t);
  const horizontal = Math.hypot(dx, dz) || 1;

  out.active = true;
  out.x = quadratic(sx, cx, ex, t);
  out.y = quadratic(sy, cy, ey, t) + Math.sin(seconds * 0.55 + bird.flapPhase) * 0.22;
  out.z = quadratic(sz, cz, ez, t);
  out.yaw = Math.atan2(dx, dz);
  out.pitch = -Math.atan2(dy, horizontal);
  out.bank = route.bank + Math.sin(t * Math.PI * 2 + bird.flapPhase) * 0.045;
  return out;
}
