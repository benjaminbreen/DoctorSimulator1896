// The 1895 horseless carriages: electric road wagons working the streets
// around the park's southeast corner. Routes, steering, and avoidance are
// deterministic; the scene component only draws the states this module
// computes. Cosmetic variety (liveries, riders) lives in the scene layer.

import { clamp, damp, dampAngle, shortestArc } from '../movement/mathUtils.js';
import { ROAD_TOP as STREET_ROAD_TOP, ROADS, WORLD_BOUNDS } from './streetGrid.js';

export const ROAD_TOP = STREET_ROAD_TOP;
// The wheel ruts sit 12 mm proud of the roadbed; ride on them, not in them.
export const RIDE_HEIGHT = ROAD_TOP + 0.02;

function roadCenter(id) {
  const road = ROADS.find((entry) => entry.id === id);
  if (!road) throw new Error(`Unknown traffic road: ${id}`);
  return (road.lo + road.hi) / 2;
}

const FIFTH = roadCenter('fifth-ave');
const MADISON = roadCenter('madison-ave');
const SIXTH = roadCenter('sixth-ave');
const CPS = roadCenter('cps');
const EAST_SIXTIETH = roadCenter('east-sixtieth');
const FIFTY_EIGHTH = roadCenter('fifty-eighth');
const FIFTY_SEVENTH = roadCenter('fifty-seventh');
const PORTAL_WEST = WORLD_BOUNDS.minX - 12;
const PORTAL_EAST = WORLD_BOUNDS.maxX + 12;
// The through-loop path is already offset from the road centre. Its two traces
// remain far enough apart for a smooth hidden U-turn beyond the world edge;
// the traffic coordinator merges its westbound trace with the nearby local
// lane using physical position and heading.
const CPS_LANE_OFFSET = 2.25;
const FIFTY_EIGHTH_LANE_OFFSET = 2.25;

const waypoint = (x, z, id = `${x},${z}`) => ({ position: [x, z], id });

// The route catalogue is derived from the authored road bands. Four district
// loops spread local traffic across the east and west blocks. The fifth is a
// shallow off-map loop: its two long sides are the two directions of Central
// Park South, while both U-turns happen beyond the playable boundary.
export const TRAFFIC_ROUTE_SPECS = Object.freeze([
  {
    id: 'east-fifty-eighth',
    corners: [[FIFTH, CPS], [FIFTH, FIFTY_EIGHTH], [MADISON, FIFTY_EIGHTH], [MADISON, CPS]],
  },
  {
    id: 'east-fifty-seventh',
    corners: [[FIFTH, CPS], [FIFTH, FIFTY_SEVENTH], [MADISON, FIFTY_SEVENTH], [MADISON, CPS]],
  },
  {
    id: 'west-fifty-eighth',
    corners: [[FIFTH, CPS], [SIXTH, CPS], [SIXTH, FIFTY_EIGHTH], [FIFTH, FIFTY_EIGHTH]],
  },
  {
    id: 'west-fifty-seventh',
    corners: [[FIFTH, CPS], [SIXTH, CPS], [SIXTH, FIFTY_SEVENTH], [FIFTH, FIFTY_SEVENTH]],
  },
  {
    id: 'central-park-south-through',
    corners: [
      // Increasing x is eastbound, whose right-hand lane is south (+z).
      waypoint(PORTAL_WEST, CPS + CPS_LANE_OFFSET, 'cps-west-portal-a'),
      waypoint(SIXTH, CPS + CPS_LANE_OFFSET, `${SIXTH},${CPS}`),
      waypoint(FIFTH, CPS + CPS_LANE_OFFSET, `${FIFTH},${CPS}`),
      waypoint(MADISON, CPS + CPS_LANE_OFFSET, `${MADISON},${CPS}`),
      waypoint(PORTAL_EAST, CPS + CPS_LANE_OFFSET, 'cps-east-portal-a'),
      // Decreasing x is westbound, whose right-hand lane is north (-z).
      waypoint(PORTAL_EAST, CPS - CPS_LANE_OFFSET, 'cps-east-portal-b'),
      waypoint(MADISON, CPS - CPS_LANE_OFFSET, `${MADISON},${CPS}`),
      waypoint(FIFTH, CPS - CPS_LANE_OFFSET, `${FIFTH},${CPS}`),
      waypoint(SIXTH, CPS - CPS_LANE_OFFSET, `${SIXTH},${CPS}`),
      waypoint(PORTAL_WEST, CPS - CPS_LANE_OFFSET, 'cps-west-portal-b'),
    ],
  },
  {
    id: 'east-sixtieth',
    corners: [
      [FIFTH, CPS],
      [FIFTH, EAST_SIXTIETH],
      [MADISON, EAST_SIXTIETH],
      [MADISON, CPS],
    ],
  },
  {
    id: 'fifty-eighth-through',
    corners: [
      waypoint(PORTAL_WEST, FIFTY_EIGHTH + FIFTY_EIGHTH_LANE_OFFSET, '58th-west-portal-a'),
      waypoint(SIXTH, FIFTY_EIGHTH + FIFTY_EIGHTH_LANE_OFFSET, `${SIXTH},${FIFTY_EIGHTH}`),
      waypoint(FIFTH, FIFTY_EIGHTH + FIFTY_EIGHTH_LANE_OFFSET, `${FIFTH},${FIFTY_EIGHTH}`),
      waypoint(MADISON, FIFTY_EIGHTH + FIFTY_EIGHTH_LANE_OFFSET, `${MADISON},${FIFTY_EIGHTH}`),
      waypoint(PORTAL_EAST, FIFTY_EIGHTH + FIFTY_EIGHTH_LANE_OFFSET, '58th-east-portal-a'),
      waypoint(PORTAL_EAST, FIFTY_EIGHTH - FIFTY_EIGHTH_LANE_OFFSET, '58th-east-portal-b'),
      waypoint(MADISON, FIFTY_EIGHTH - FIFTY_EIGHTH_LANE_OFFSET, `${MADISON},${FIFTY_EIGHTH}`),
      waypoint(FIFTH, FIFTY_EIGHTH - FIFTY_EIGHTH_LANE_OFFSET, `${FIFTH},${FIFTY_EIGHTH}`),
      waypoint(SIXTH, FIFTY_EIGHTH - FIFTY_EIGHTH_LANE_OFFSET, `${SIXTH},${FIFTY_EIGHTH}`),
      waypoint(PORTAL_WEST, FIFTY_EIGHTH - FIFTY_EIGHTH_LANE_OFFSET, '58th-west-portal-b'),
    ],
  },
]);
const CORNER_RADIUS = 7;
const CURVE_ARC_STEPS = 24;

export const CARRIAGE_TUNING = {
  cruise: 4.2, // m/s — about ten miles an hour
  accelLambda: 0.7,
  brakeLambda: 5,
  swerveLambda: 1.8,
  lookahead: 14, // scaled down at low speed in stepCarriage
  clearance: 1.5,
  minGap: 2.4,
  maxLat: 2.4, // keeps the hubs inside the narrowest road band
  lane: 1.5, // right-hand side of the roadway
  rearClearance: 3.5,
};

function pointDistance(a, b) {
  return Math.hypot(b[0] - a[0], b[1] - a[1]);
}

function quadraticPoint(p0, p1, p2, t) {
  const u = 1 - t;
  return [
    u * u * p0[0] + 2 * u * t * p1[0] + t * t * p2[0],
    u * u * p0[1] + 2 * u * t * p1[1] + t * t * p2[1],
  ];
}

function curveSegment(p0, p1, p2) {
  const arc = [{ t: 0, distance: 0 }];
  let previous = p0;
  let length = 0;
  for (let i = 1; i <= CURVE_ARC_STEPS; i += 1) {
    const t = i / CURVE_ARC_STEPS;
    const point = quadraticPoint(p0, p1, p2, t);
    length += pointDistance(previous, point);
    arc.push({ t, distance: length });
    previous = point;
  }
  return { kind: 'curve', p0, p1, p2, length, arc };
}

function distanceAtCurveT(segment, targetT) {
  const scaled = targetT * CURVE_ARC_STEPS;
  const index = Math.min(CURVE_ARC_STEPS - 1, Math.floor(scaled));
  const mix = scaled - index;
  return segment.arc[index].distance
    + (segment.arc[index + 1].distance - segment.arc[index].distance) * mix;
}

// Corners are continuous curves joined tangentially to the street straights.
// Arc-length lookup keeps a constant road speed through the whole turn.
function buildLoop(spec) {
  const corners = spec.corners.map((entry) => (
    Array.isArray(entry) ? waypoint(entry[0], entry[1]) : entry
  ));
  const count = corners.length;
  const trimmed = corners.map((cur, i) => {
    const prev = corners[(i + count - 1) % count];
    const next = corners[(i + 1) % count];
    const inLen = pointDistance(prev.position, cur.position);
    const outLen = pointDistance(cur.position, next.position);
    const radius = Math.min(CORNER_RADIUS, inLen * 0.32, outLen * 0.32);
    const inDir = [
      (cur.position[0] - prev.position[0]) / inLen,
      (cur.position[1] - prev.position[1]) / inLen,
    ];
    const outDir = [
      (next.position[0] - cur.position[0]) / outLen,
      (next.position[1] - cur.position[1]) / outLen,
    ];
    return {
      id: cur.id,
      corner: cur.position,
      enter: [cur.position[0] - inDir[0] * radius, cur.position[1] - inDir[1] * radius],
      exit: [cur.position[0] + outDir[0] * radius, cur.position[1] + outDir[1] * radius],
    };
  });

  const segments = [];
  const routeCorners = [];
  let total = 0;
  for (let i = 0; i < count; i += 1) {
    const current = trimmed[i];
    const next = trimmed[(i + 1) % count];
    const curve = curveSegment(current.enter, current.corner, current.exit);
    routeCorners.push({
      id: current.id,
      position: current.corner,
      s: total + distanceAtCurveT(curve, 0.5),
    });
    segments.push({ ...curve, start: total });
    total += curve.length;
    const line = {
      kind: 'line',
      p0: current.exit,
      p1: next.enter,
      length: pointDistance(current.exit, next.enter),
      start: total,
    };
    segments.push(line);
    total += line.length;
  }
  return {
    id: spec.id,
    segments,
    corners: routeCorners,
    intersections: routeCorners,
    total,
  };
}

export const ROUTES = TRAFFIC_ROUTE_SPECS.map(buildLoop);

// Explicit starts make the opening readable and keep traffic out of one Plaza
// knot. Vehicle 2 retains the authored run into the Savoy cabbage cart.
export const HORSELESS_TRAFFIC_ROSTER = Object.freeze([
  { id: 0, route: 4, start: ROUTES[4].total * 0.18 },
  { id: 1, route: 3, start: 30 },
  { id: 2, route: 2, start: 302 },
]);

// Driver identity is cosmetic, but the rate is a plain simulation input so
// tests and future procedural spawners share the same one-in-four contract.
export const STRAWHAT_DRIVER_RATE = 0.25;

export function carriageDriverKind(roll) {
  return roll < STRAWHAT_DRIVER_RATE ? 'strawhat-woman' : 'coated-man';
}

function curveTAtDistance(segment, target) {
  for (let i = 0; i < segment.arc.length - 1; i += 1) {
    const a = segment.arc[i];
    const b = segment.arc[i + 1];
    if (target > b.distance) continue;
    const mix = b.distance === a.distance ? 0 : (target - a.distance) / (b.distance - a.distance);
    return a.t + (b.t - a.t) * mix;
  }
  return 1;
}

// Position and continuous unit tangent at a distance: [x, z, tx, tz].
export function sampleRoute(route, dist) {
  let remaining = ((dist % route.total) + route.total) % route.total;
  for (const segment of route.segments) {
    if (remaining <= segment.length) {
      if (segment.kind === 'line') {
        const t = segment.length === 0 ? 0 : remaining / segment.length;
        const dx = segment.p1[0] - segment.p0[0];
        const dz = segment.p1[1] - segment.p0[1];
        return [
          segment.p0[0] + dx * t,
          segment.p0[1] + dz * t,
          dx / segment.length,
          dz / segment.length,
        ];
      }
      const t = curveTAtDistance(segment, remaining);
      const [x, z] = quadraticPoint(segment.p0, segment.p1, segment.p2, t);
      const dx = 2 * (1 - t) * (segment.p1[0] - segment.p0[0])
        + 2 * t * (segment.p2[0] - segment.p1[0]);
      const dz = 2 * (1 - t) * (segment.p1[1] - segment.p0[1])
        + 2 * t * (segment.p2[1] - segment.p1[1]);
      const tangentLength = Math.hypot(dx, dz);
      return [x, z, dx / tangentLength, dz / tangentLength];
    }
    remaining -= segment.length;
  }
  return sampleRoute(route, 0);
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
    knockX: 0,
    knockZ: 0,
    knockRoll: 0,
    knockPitch: 0,
    avoidTarget: null,
    collisionRecovery: null,
  };
}

// The route remains authoritative; a thrown object adds a short-lived visual
// and physical shove around it. This keeps traffic deterministic afterward.
export function applyCarriageProjectileHit(state, velocity, power = 1) {
  const vx = Number(velocity?.x ?? velocity?.[0]) || 0;
  const vz = Number(velocity?.z ?? velocity?.[2]) || 0;
  const horizontal = Math.hypot(vx, vz);
  if (horizontal < 0.01) return state;
  const nx = vx / horizontal;
  const nz = vz / horizontal;
  const shove = clamp(horizontal * 0.065, 0.35, 1.15) * clamp(power, 0.1, 2);
  const forwardX = Math.sin(state.yaw);
  const forwardZ = Math.cos(state.yaw);
  const side = nx * forwardZ - nz * forwardX;
  const front = nx * forwardX + nz * forwardZ;
  return {
    ...state,
    speed: Math.max(0, state.speed - shove * 1.6),
    knockX: clamp((state.knockX ?? 0) + nx * shove, -1.35, 1.35),
    knockZ: clamp((state.knockZ ?? 0) + nz * shove, -1.35, 1.35),
    knockRoll: clamp((state.knockRoll ?? 0) - side * shove * 0.15, -0.22, 0.22),
    knockPitch: clamp((state.knockPitch ?? 0) + front * shove * 0.09, -0.13, 0.13),
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
  const crashTime = Math.max(0, (state.crashTime ?? 0) - dt);
  if ((state.crashTime ?? 0) > 0) target = 0;
  let desiredLat = state.lat;
  const priorRecovery = state.collisionRecovery;
  const collisionRecovery = priorRecovery && priorRecovery.time > dt
    ? {
      ...priorRecovery,
      time: priorRecovery.time - dt,
      hold: Math.max(0, (priorRecovery.hold ?? 0) - dt),
    }
    : null;

  // A walking pace needs less warning than a trot.
  const look = p.lookahead * (0.55 + 0.45 * clamp(state.speed / Math.max(p.cruise, 0.01), 0, 1));

  // Obstacles ahead, in route coordinates relative to the centerline.
  const relevant = [];
  let touching = false;
  for (const ob of obstacles) {
    const ox = ob.x - cx;
    const oz = ob.z - cz;
    const ahead = ox * tx + oz * tz;
    const side = ox * rx + oz * rz;
    const r = ob.r ?? 0.5;
    const soft = ob.trafficPolicy === 'soft';
    // A person against the hull (alongside or under the bumper): hold still
    // rather than drive off through them. Vehicles rely on the brake logic,
    // or two stopped carriages would wait on each other forever.
    if (!soft && r < 1 && ahead > -2.2 && ahead < 2.4 && Math.abs(side - state.lat) < 1.05 + r * 0.3) touching = true;
    // The window reaches a little behind so the carriage does not cut back
    // into someone it is still passing.
    if (ahead < -p.rearClearance || ahead > look + r) continue;
    if (Math.abs(side) > p.maxLat + p.clearance + r) continue;
    const trafficClearance = Number.isFinite(ob.trafficClearance)
      ? Math.max(0, ob.trafficClearance)
      : null;
    relevant.push({ ahead, side, r, soft, trafficClearance });
  }
  const obstacleClearance = (ob) => (
    ob.trafficClearance ?? (ob.soft ? p.clearance * 0.62 : p.clearance)
  ) + ob.r;
  const blocks = (latLine, ob, slack = 1) => Math.abs(latLine - ob.side) < obstacleClearance(ob) * slack;
  const inLine = relevant.filter((ob) => ob.ahead > 0.3 && blocks(state.lat, ob, 0.95));
  const laneThreats = relevant.filter((ob) => ob.ahead > -p.rearClearance && blocks(p.lane, ob, 0.95));
  let avoidTarget = Number.isFinite(state.avoidTarget) ? state.avoidTarget : null;
  let maneuvering = false;

  if (avoidTarget !== null && laneThreats.length === 0) avoidTarget = null;

  if (avoidTarget !== null) {
    const targetThreats = relevant.filter((ob) => ob.ahead > 0.3 && blocks(avoidTarget, ob, 0.9));
    if (targetThreats.length === 0) {
      // Hold the chosen side until the obstacle is behind the rear of the
      // vehicle. Without this latch, several circles from one fallen cart can
      // make the controller repeatedly abandon and restart the pass.
      desiredLat = avoidTarget;
      target = Math.min(target, p.cruise * 0.62);
      maneuvering = true;
    } else {
      // A moving obstacle or oncoming road user has closed the committed
      // corridor. Wait cleanly for it to reopen instead of choosing a new side
      // every frame.
      if (targetThreats.every((ob) => ob.soft)) {
        // If a fallen handcart rolls into the chosen gap, shoulder through it.
        // The Rapier body will still be shoved; it simply cannot deadlock the
        // route controller.
        avoidTarget = null;
        desiredLat = state.lat;
        target = Math.min(target, p.cruise * 0.72);
      } else {
        const nearest = targetThreats.reduce((a, b) => (a.ahead < b.ahead ? a : b));
        const room = clamp((nearest.ahead - p.minGap) / Math.max(0.1, look - p.minGap), 0, 1);
        target = Math.min(target, p.cruise * room * room);
        if (nearest.ahead <= p.minGap + 0.2) target = 0;
      }
    }
  } else if (inLine.length === 0) {
    // Clear ahead: drift back to the lane if the lane itself is clear.
    if (!relevant.some((ob) => blocks(p.lane, ob))) desiredLat = p.lane;
  } else {
    // Try lateral lines that clear every obstacle around; pick the nearest.
    const candidates = [p.lane];
    for (const ob of relevant) {
      candidates.push(ob.side - obstacleClearance(ob), ob.side + obstacleClearance(ob));
    }
    let best = null;
    for (const lat of candidates) {
      if (Math.abs(lat) > p.maxLat) continue;
      if (relevant.some((ob) => blocks(lat, ob, 0.9))) continue;
      if (best === null || Math.abs(lat - state.lat) < Math.abs(best - state.lat)) best = lat;
    }
    if (best !== null) {
      avoidTarget = best;
      desiredLat = avoidTarget;
      target = Math.min(target, p.cruise * 0.62);
      maneuvering = true;
    } else {
      if (inLine.every((ob) => ob.soft)) {
        // Produce carts are an inconvenience, not a road closure. Keep enough
        // speed to knock the dynamic body or loose goods aside.
        target = Math.min(target, p.cruise * 0.72);
      } else {
        // Nowhere to swerve: brake to a stop short of the nearest hard blocker.
        const nearest = inLine.reduce((a, b) => (a.ahead < b.ahead ? a : b));
        const room = clamp((nearest.ahead - p.minGap) / (look - p.minGap), 0, 1);
        target = Math.min(target, p.cruise * room * room);
        if (nearest.ahead <= p.minGap + 0.2) target = 0;
      }
    }
  }

  if (touching) target = 0;
  if (collisionRecovery?.role === 'yield') {
    if (collisionRecovery.hold > 0) {
      // One member of a collided pair owns the road while the other holds.
      // This asymmetry lets the first vehicle actually clear the hull.
      target = 0;
    } else {
      // Leave on the side selected at impact and keep that choice until the
      // recovery window ends.
      desiredLat = collisionRecovery.escapeLane;
      target = Math.min(target, p.cruise * 0.52);
      maneuvering = true;
    }
  }
  // Why we are slowing, for the driver's pantomime: avoiding = working
  // around something; blocked = held at a stop by something in the way.
  const avoiding = inLine.length > 0 || avoidTarget !== null;
  const blocked = crashTime > 0 || touching || (avoiding && target < 0.1);

  const braking = target < state.speed;
  const speed = damp(state.speed, target, braking ? p.brakeLambda : p.accelLambda, dt);
  const s = (state.s + speed * dt) % route.total;
  // Ordinary lane keeping scales with speed. During a clear committed pass,
  // use the intended speed as well: braking no longer destroys the steering
  // authority needed to finish getting around the obstruction.
  const lateralScale = maneuvering && target > 0.15
    ? clamp(Math.max(speed, target) / 2, 0.3, 1)
    : clamp(speed / 2, 0, 1);
  const lat = damp(state.lat, desiredLat, p.swerveLambda * lateralScale, dt);

  const [nx, nz, ntx, ntz] = sampleRoute(route, s);
  const baseX = nx + -ntz * lat;
  const baseZ = nz + ntx * lat;
  const previousBaseX = state.x - (state.knockX ?? 0);
  const previousBaseZ = state.z - (state.knockZ ?? 0);
  // Do not immediately pull a separated pair back into contact. Collision
  // displacement fades slowly during recovery, then recentres normally.
  const knockLambda = collisionRecovery ? 0.45 : 4.8;
  const knockX = damp(state.knockX ?? 0, 0, knockLambda, dt);
  const knockZ = damp(state.knockZ ?? 0, 0, knockLambda, dt);
  const x = baseX + knockX;
  const z = baseZ + knockZ;

  const dx = baseX - previousBaseX;
  const dz = baseZ - previousBaseZ;
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
    knockX,
    knockZ,
    knockRoll: damp(state.knockRoll ?? 0, 0, 5.8, dt),
    knockPitch: damp(state.knockPitch ?? 0, 0, 5.8, dt),
    avoidTarget,
    crashTime,
    collisionRecovery,
  };
}
