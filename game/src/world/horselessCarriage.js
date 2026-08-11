// The 1895 horseless carriages: electric road wagons working the streets
// around the park's southeast corner. Routes, steering, and avoidance are
// deterministic; the scene component only draws the states this module
// computes. Cosmetic variety (liveries, riders) lives in the scene layer.

import { clamp, damp, dampAngle, shortestArc } from '../movement/mathUtils.js';

export const ROAD_TOP = 1.16;
// The wheel ruts sit 12 mm proud of the roadbed; ride on them, not in them.
export const RIDE_HEIGHT = ROAD_TOP + 0.02;

// Route corners on the road centerlines from streetGrid ROADS. Opposite
// directions on a shared street land in opposite lanes (each keeps right),
// so routes 0 and 2 pass head-on along Fifth like real two-way traffic.
const ROUTE_CORNERS = [
  // The block around the Plaza hotels.
  [[103, 91], [103, 135], [167, 135], [167, 91]],
  // The long loop down Fifth to 57th and back up Madison.
  [[103, 91], [103, 179], [167, 179], [167, 91]],
  // West along Central Park South to the Sixth Avenue El and back by 58th.
  [[103, 91], [-40, 91], [-40, 135], [103, 135]],
];
const CORNER_RADIUS = 7;
const CORNER_SEGMENTS = 6;

export const CARRIAGE_TUNING = {
  cruise: 4.2, // m/s — about ten miles an hour
  accelLambda: 0.7,
  brakeLambda: 5,
  swerveLambda: 1.8,
  lookahead: 10, // scaled down at low speed in stepCarriage
  clearance: 1.5,
  minGap: 2.4,
  maxLat: 2.4, // keeps the hubs inside the narrowest road band
  lane: 1.5, // right-hand side of the roadway
};

// Corners filleted with quadratic arcs so the polyline itself is smooth.
function buildLoop(corners) {
  const points = [];
  const count = corners.length;
  for (let i = 0; i < count; i += 1) {
    const prev = corners[(i + count - 1) % count];
    const cur = corners[i];
    const next = corners[(i + 1) % count];
    const inLen = Math.hypot(cur[0] - prev[0], cur[1] - prev[1]);
    const outLen = Math.hypot(next[0] - cur[0], next[1] - cur[1]);
    const inDir = [(cur[0] - prev[0]) / inLen, (cur[1] - prev[1]) / inLen];
    const outDir = [(next[0] - cur[0]) / outLen, (next[1] - cur[1]) / outLen];
    const a = [cur[0] - inDir[0] * CORNER_RADIUS, cur[1] - inDir[1] * CORNER_RADIUS];
    const b = [cur[0] + outDir[0] * CORNER_RADIUS, cur[1] + outDir[1] * CORNER_RADIUS];
    for (let k = 0; k <= CORNER_SEGMENTS; k += 1) {
      const t = k / CORNER_SEGMENTS;
      const u = 1 - t;
      points.push([
        u * u * a[0] + 2 * u * t * cur[0] + t * t * b[0],
        u * u * a[1] + 2 * u * t * cur[1] + t * t * b[1],
      ]);
    }
  }
  return points;
}

export const ROUTES = ROUTE_CORNERS.map((corners) => {
  const points = buildLoop(corners);
  const lengths = points.map((point, i) => {
    const next = points[(i + 1) % points.length];
    return Math.hypot(next[0] - point[0], next[1] - point[1]);
  });
  return { points, lengths, total: lengths.reduce((sum, len) => sum + len, 0) };
});

// Position and unit tangent at a distance along a route: [x, z, tx, tz].
export function sampleRoute(route, dist) {
  let remaining = ((dist % route.total) + route.total) % route.total;
  for (let i = 0; i < route.points.length; i += 1) {
    const len = route.lengths[i];
    if (remaining <= len) {
      const [x1, z1] = route.points[i];
      const [x2, z2] = route.points[(i + 1) % route.points.length];
      const t = remaining / len;
      return [x1 + (x2 - x1) * t, z1 + (z2 - z1) * t, (x2 - x1) / len, (z2 - z1) / len];
    }
    remaining -= len;
  }
  const [x1, z1] = route.points[route.points.length - 1];
  const [x2, z2] = route.points[0];
  const len = route.lengths[route.lengths.length - 1];
  return [x2, z2, (x2 - x1) / len, (z2 - z1) / len];
}

export function createCarriageState(routeIndex = 0, startDist = 0, lane = CARRIAGE_TUNING.lane) {
  const route = ROUTES[routeIndex];
  const [x, z, tx, tz] = sampleRoute(route, startDist);
  return {
    route: routeIndex,
    s: startDist,
    lat: lane,
    speed: 0,
    yaw: Math.atan2(tx, tz),
    steer: 0,
    wheelSpin: 0,
    x: x + -tz * lane,
    z: z + tx * lane,
    bend: 0,
    avoiding: false,
    blocked: false,
  };
}

// One simulation step. Obstacles are {x, z, r} in world coordinates (the
// player, pedestrians, and other carriages). Returns a new state object.
export function stepCarriage(state, dt, obstacles = [], params = {}) {
  const p = { ...CARRIAGE_TUNING, ...params };
  const route = ROUTES[state.route];
  const [cx, cz, tx, tz] = sampleRoute(route, state.s);
  // Right-hand normal of travel; positive lat is the right side of the road.
  const rx = -tz;
  const rz = tx;

  // Slow into bends: compare the tangent here with the tangent a few metres on.
  const [, , ax, az] = sampleRoute(route, state.s + 5);
  const bend = Math.abs(shortestArc(Math.atan2(tx, tz), Math.atan2(ax, az)));
  let target = p.cruise * (1 - 0.7 * clamp(bend / 0.7, 0, 1));
  let desiredLat = state.lat;

  // A walking pace needs less warning than a trot.
  const look = p.lookahead * (0.55 + 0.45 * clamp(state.speed / p.cruise, 0, 1));

  // Obstacles ahead, in route coordinates relative to the centerline.
  const relevant = [];
  let touching = false;
  for (const ob of obstacles) {
    const ox = ob.x - cx;
    const oz = ob.z - cz;
    const ahead = ox * tx + oz * tz;
    const side = ox * rx + oz * rz;
    const r = ob.r ?? 0.5;
    // A person against the hull (alongside or under the bumper): hold still
    // rather than drive off through them. Vehicles rely on the brake logic,
    // or two stopped carriages would wait on each other forever.
    if (r < 1 && ahead > -2.2 && ahead < 2.4 && Math.abs(side - state.lat) < 1.05 + r * 0.3) touching = true;
    // The window reaches a little behind so the carriage does not cut back
    // into someone it is still passing.
    if (ahead < -3.5 || ahead > look + r) continue;
    if (Math.abs(side) > p.maxLat + p.clearance + r) continue;
    relevant.push({ ahead, side, r });
  }
  const blocks = (latLine, ob, slack = 1) => Math.abs(latLine - ob.side) < (p.clearance + ob.r) * slack;
  const inLine = relevant.filter((ob) => ob.ahead > 0.3 && blocks(state.lat, ob, 0.95));

  if (inLine.length === 0) {
    // Clear ahead: drift back to the lane if the lane itself is clear.
    if (!relevant.some((ob) => blocks(p.lane, ob))) desiredLat = p.lane;
  } else {
    // Try lateral lines that clear every obstacle around; pick the nearest.
    const candidates = [p.lane];
    for (const ob of relevant) {
      candidates.push(ob.side - (p.clearance + ob.r), ob.side + (p.clearance + ob.r));
    }
    let best = null;
    for (const lat of candidates) {
      if (Math.abs(lat) > p.maxLat) continue;
      if (relevant.some((ob) => blocks(lat, ob, 0.9))) continue;
      if (best === null || Math.abs(lat - state.lat) < Math.abs(best - state.lat)) best = lat;
    }
    if (best !== null) {
      desiredLat = best;
      target = Math.min(target, p.cruise * 0.55);
    } else {
      // Nowhere to swerve: brake to a stop short of the nearest blocker.
      const nearest = inLine.reduce((a, b) => (a.ahead < b.ahead ? a : b));
      const room = clamp((nearest.ahead - p.minGap) / (look - p.minGap), 0, 1);
      target = Math.min(target, p.cruise * room * room);
      if (nearest.ahead <= p.minGap + 0.2) target = 0;
    }
  }

  if (touching) target = 0;
  // Why we are slowing, for the driver's pantomime: avoiding = working
  // around something; blocked = held at a stop by something in the way.
  const avoiding = inLine.length > 0;
  const blocked = touching || (avoiding && target < 0.1);

  const braking = target < state.speed;
  const speed = damp(state.speed, target, braking ? p.brakeLambda : p.accelLambda, dt);
  const s = (state.s + speed * dt) % route.total;
  // Swerve rate scales with speed: a stopped carriage cannot slide sideways.
  const lat = damp(state.lat, desiredLat, p.swerveLambda * clamp(speed / 2, 0, 1), dt);

  const [nx, nz, ntx, ntz] = sampleRoute(route, s);
  const x = nx + -ntz * lat;
  const z = nz + ntx * lat;

  const dx = x - state.x;
  const dz = z - state.z;
  const heading = Math.hypot(dx, dz) > 1e-5 ? Math.atan2(dx, dz) : Math.atan2(ntx, ntz);
  const yaw = dampAngle(state.yaw, heading, 8, dt);
  const steer = damp(state.steer, clamp(shortestArc(yaw, heading) * 3, -0.5, 0.5), 6, dt);

  return {
    route: state.route,
    s,
    lat,
    speed,
    yaw,
    steer,
    wheelSpin: state.wheelSpin + speed * dt,
    x,
    z,
    bend,
    avoiding,
    blocked,
  };
}
