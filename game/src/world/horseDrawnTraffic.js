import { buildCoachworkPreset, COACHWORKS_PRESETS } from './coachworks.js';
import { clamp, dampAngle, shortestArc } from '../movement/mathUtils.js';
import { createCarriageState, ROUTES, sampleRoute, stepCarriage } from './horselessCarriage.js';

function routeStartNear(routeIndex, targetX, targetZ, headingX = null) {
  const route = ROUTES[routeIndex];
  let best = { distance: Infinity, s: 0 };
  for (let s = 0; s < route.total; s += 0.25) {
    const [x, z, tx] = sampleRoute(route, s);
    if (headingX !== null && Math.sign(tx) !== Math.sign(headingX)) continue;
    const distance = Math.hypot(x - targetX, z - targetZ);
    if (distance < best.distance) best = { distance, s };
  }
  return best.s;
}

// Five active rigs keep the original three-route spread and add working
// wagons to the two underused road stretches marked in the overhead review.
export const HORSE_DRAWN_ROSTER = Object.freeze([
  { id: 'hansom', type: 'hansom', route: 0, start: 78, lane: -1.45, cruise: 2.8 },
  { id: 'brougham', type: 'brougham', route: 1, start: 230, lane: 1.5, cruise: 2.45 },
  {
    id: 'omnibus', type: 'omnibus', route: 4,
    start: ROUTES[4].total * 0.86, lane: 0.18, cruise: 2.15,
  },
  {
    id: 'east-sixtieth-delivery', type: 'utility', route: 5,
    // Keep the long articulated rig close to the road centre so its coach
    // stays inside East 60th while the horse begins the Madison Avenue turn.
    start: routeStartNear(5, 140, 56, 1), lane: 0.18, cruise: 2.25,
  },
  {
    id: 'west-fifty-eighth-delivery', type: 'utility', route: 6,
    start: routeStartNear(6, -65, 137.25, 1), lane: 0.18, cruise: 2.35,
  },
]);

export const HORSE_DRAWN_MAX_ACTIVE = HORSE_DRAWN_ROSTER.length;
export const HORSE_DRAWN_FIXED_DT = 1 / 60;

// Measurements are in the coachwork's +X-forward frame. The socket and axle
// values match the procedural presets, so the visible gear and kinematic rig
// share the same pivots instead of merely being placed near one another.
function axleMeasurements(type) {
  const values = COACHWORKS_PRESETS[type];
  const twoWheels = type === 'hansom';
  const spread = Math.min(values.axleSpread, values.bodyLength * 0.78);
  const frontAxle = twoWheels ? -values.bodyLength * 0.08 : spread / 2;
  const rearAxle = twoWheels ? frontAxle : -spread / 2;
  return {
    frontAxle,
    rearAxle,
    socketForward: Math.max(frontAxle, values.bodyLength / 2) + 0.08,
  };
}

export const HORSE_RIG_CONFIG = Object.freeze({
  utility: {
    ...axleMeasurements('utility'),
    drawbarLength: 2.55, maxSteer: 0.34,
    maxHorseAngle: 0.15, drawTurnRate: 1.02, shaftSpread: 0.6,
  },
  hansom: {
    ...axleMeasurements('hansom'),
    drawbarLength: 2.45, maxSteer: 0.43,
    maxHorseAngle: 0.18, drawTurnRate: 1.35, shaftSpread: 0.48,
  },
  brougham: {
    ...axleMeasurements('brougham'),
    drawbarLength: 2.45, maxSteer: 0.36,
    maxHorseAngle: 0.16, drawTurnRate: 1.1, shaftSpread: 0.48,
  },
  omnibus: {
    ...axleMeasurements('omnibus'),
    drawbarLength: 2.55, maxSteer: 0.3,
    maxHorseAngle: 0.14, drawTurnRate: 0.88, shaftSpread: 0.66,
  },
});

function forward(yaw) {
  return [Math.sin(yaw), Math.cos(yaw)];
}

function clampAngleAround(angle, center, limit) {
  return center + clamp(shortestArc(center, angle), -limit, limit);
}

// Pick one pole heading that satisfies both joints. Doing these clamps one
// after the other is not equivalent: the second clamp can undo the first and
// let the horses turn at a right angle to the coach.
function constrainedLinkAngle(desired, leaderYaw, trailerYaw, leaderLimit, trailerLimit) {
  const leader = trailerYaw + shortestArc(trailerYaw, leaderYaw);
  const target = trailerYaw + shortestArc(trailerYaw, desired);
  const low = Math.max(leader - leaderLimit, trailerYaw - trailerLimit);
  const high = Math.min(leader + leaderLimit, trailerYaw + trailerLimit);
  if (low <= high) return clamp(target, low, high);

  // The guide is normally slowed before the intervals separate. Keep a safe
  // bridge angle if a collision shove or old save state starts outside them.
  return trailerYaw + shortestArc(trailerYaw, leader) * (
    trailerLimit / Math.max(leaderLimit + trailerLimit, 1e-5)
  );
}

function initialRig(guide, rig) {
  const [fx, fz] = forward(guide.yaw);
  const harnessX = guide.x - fx * 0.05;
  const harnessZ = guide.z - fz * 0.05;
  const towLength = rig.drawbarLength + (rig.socketForward - rig.frontAxle);
  const frontAxleX = harnessX - fx * towLength;
  const frontAxleZ = harnessZ - fz * towLength;
  const rearAxleX = frontAxleX - fx * (rig.frontAxle - rig.rearAxle);
  const rearAxleZ = frontAxleZ - fz * (rig.frontAxle - rig.rearAxle);
  return {
    drawYaw: guide.yaw,
    frontAxleX,
    frontAxleZ,
    rearAxleX,
    rearAxleZ,
    socketX: frontAxleX + fx * (rig.socketForward - rig.frontAxle),
    socketZ: frontAxleZ + fz * (rig.socketForward - rig.frontAxle),
    coachX: rearAxleX - fx * rig.rearAxle,
    coachZ: rearAxleZ - fz * rig.rearAxle,
    coachYaw: guide.yaw,
    axleYaw: guide.yaw,
    articulation: 0,
    horseArticulation: 0,
  };
}

export function createHorseDrawnState(routeIndex, start, lane, type) {
  const guide = createCarriageState(routeIndex, start, lane);
  return {
    ...guide,
    horseX: guide.x,
    horseZ: guide.z,
    horseYaw: guide.yaw,
    ...initialRig(guide, HORSE_RIG_CONFIG[type]),
    traffic: { mode: 'lane', lane, targetId: null, wait: 0 },
  };
}

export function stepHorseDrawnState(state, dt, obstacles, params, advice) {
  const rig = HORSE_RIG_CONFIG[params.type];
  const collider = horseDrawnCollider(params.type);
  const totalArticulation = rig.maxHorseAngle + rig.maxSteer;
  const guide = stepCarriage(state, dt, obstacles, {
    cruise: Math.min(params.cruise, advice?.cruise ?? params.cruise),
    lane: advice?.lane ?? params.lane,
    swerveLambda: advice?.laneLambda ?? 0.9,
    maxLat: 2.15,
    clearance: params.type === 'omnibus' ? 1.9 : 1.65,
    minGap: params.type === 'omnibus' ? 4.4 : 3.4,
    lookahead: params.type === 'omnibus' ? 14 : 12,
    rearClearance: rig.drawbarLength + rig.socketForward + collider.coachHalf[0] + 0.35,
  });

  // The horse reference is at the feet below the barrel. The draw gear meets
  // the back-band just behind it, rather than aiming at the horse's centre.
  const horseYaw = clampAngleAround(guide.yaw, state.coachYaw, totalArticulation * 0.96);
  const [horseFx, horseFz] = forward(horseYaw);
  const harnessX = guide.x - horseFx * 0.05;
  const harnessZ = guide.z - horseFz * 0.05;
  const desiredDrawYaw = Math.atan2(
    harnessX - state.frontAxleX,
    harnessZ - state.frontAxleZ,
  );
  const linkedTarget = constrainedLinkAngle(
    desiredDrawYaw,
    horseYaw,
    state.coachYaw,
    rig.maxHorseAngle,
    rig.maxSteer,
  );
  const dampedDrawYaw = dampAngle(state.drawYaw, linkedTarget, 10, dt);
  const drawStep = clamp(
    shortestArc(state.drawYaw, dampedDrawYaw),
    -rig.drawTurnRate * dt,
    rig.drawTurnRate * dt,
  );
  const drawYaw = constrainedLinkAngle(
    state.drawYaw + drawStep,
    horseYaw,
    state.coachYaw,
    rig.maxHorseAngle,
    rig.maxSteer,
  );
  const [drawFx, drawFz] = forward(drawYaw);
  const socketFromAxle = rig.socketForward - rig.frontAxle;
  const towLength = rig.drawbarLength + socketFromAxle;
  const frontAxleX = harnessX - drawFx * towLength;
  const frontAxleZ = harnessZ - drawFz * towLength;

  const wheelbase = rig.frontAxle - rig.rearAxle;
  let coachYaw;
  let rearAxleX;
  let rearAxleZ;
  if (wheelbase < 0.05) {
    coachYaw = clampAngleAround(
      dampAngle(state.coachYaw, drawYaw, 9, dt),
      drawYaw,
      rig.maxSteer,
    );
    rearAxleX = frontAxleX;
    rearAxleZ = frontAxleZ;
  } else {
    const noSlipYaw = Math.atan2(
      frontAxleX - state.rearAxleX,
      frontAxleZ - state.rearAxleZ,
    );
    // Project the rear axle behind the new front axle like the second car of a
    // short train. The wheelbase stays exact and the body cannot lag until it
    // becomes orthogonal to the team.
    coachYaw = clampAngleAround(
      dampAngle(state.coachYaw, noSlipYaw, 12, dt),
      drawYaw,
      rig.maxSteer,
    );
    const [bodyFx, bodyFz] = forward(coachYaw);
    rearAxleX = frontAxleX - bodyFx * wheelbase;
    rearAxleZ = frontAxleZ - bodyFz * wheelbase;
  }

  const [bodyFx, bodyFz] = forward(coachYaw);
  const coachX = rearAxleX - bodyFx * rig.rearAxle;
  const coachZ = rearAxleZ - bodyFz * rig.rearAxle;
  const socketX = frontAxleX + drawFx * socketFromAxle;
  const socketZ = frontAxleZ + drawFz * socketFromAxle;

  return {
    ...guide,
    horseX: guide.x,
    horseZ: guide.z,
    horseYaw,
    drawYaw,
    frontAxleX,
    frontAxleZ,
    rearAxleX,
    rearAxleZ,
    socketX,
    socketZ,
    coachX,
    coachZ,
    coachYaw,
    axleYaw: drawYaw,
    articulation: shortestArc(coachYaw, drawYaw),
    horseArticulation: shortestArc(drawYaw, horseYaw),
    traffic: advice?.traffic ?? state.traffic,
    intersection: advice?.intersection ?? null,
  };
}

function mixAngle(a, b, t) {
  return a + shortestArc(a, b) * t;
}

// The scene renders between fixed simulation states. This makes an uneven
// browser frame cadence look smooth without changing deterministic motion.
// A near miss: the team is moving, the player is close, and he is in front of
// the horses rather than beside or behind them. Contact is somebody else's
// business — this is only the shout that comes before it.
const NEAR_MISS_RADIUS = 3.4;
const NEAR_MISS_SPEED = 2;
const NEAR_MISS_AHEAD = Math.cos(0.9);

export function isNearMiss(state, player) {
  if (!state || !player || (state.speed ?? 0) < NEAR_MISS_SPEED) return false;
  const dx = player[0] - state.horseX;
  const dz = player[2] - state.horseZ;
  const distance = Math.hypot(dx, dz);
  if (distance > NEAR_MISS_RADIUS || distance < 1e-3) return false;
  return (dx / distance) * Math.sin(state.horseYaw)
    + (dz / distance) * Math.cos(state.horseYaw) >= NEAR_MISS_AHEAD;
}

export function interpolateHorseDrawnState(previous, current, alpha) {
  const t = clamp(alpha, 0, 1);
  const out = { ...current };
  for (const key of [
    'horseX', 'horseZ', 'coachX', 'coachZ', 'frontAxleX', 'frontAxleZ',
    'rearAxleX', 'rearAxleZ', 'socketX', 'socketZ', 'wheelSpin', 'speed',
  ]) out[key] = previous[key] + (current[key] - previous[key]) * t;
  for (const key of ['horseYaw', 'coachYaw', 'drawYaw', 'axleYaw']) {
    out[key] = mixAngle(previous[key], current[key], t);
  }
  out.articulation = shortestArc(out.coachYaw, out.drawYaw);
  out.horseArticulation = shortestArc(out.drawYaw, out.horseYaw);
  return out;
}

export function createHorseDrawnRoster() {
  return HORSE_DRAWN_ROSTER.map((entry) => {
    const preset = COACHWORKS_PRESETS[entry.type];
    const [coach] = buildCoachworkPreset(entry.type, `horse-drawn-${entry.id}`, [0, 0, 0]);
    return {
      ...entry,
      team: preset.team,
      coach,
      state: createHorseDrawnState(
        entry.route,
        entry.start % ROUTES[entry.route].total,
        entry.lane,
        entry.type,
      ),
    };
  });
}

export function horseDrawnTrafficConfig(unit) {
  const collision = horseDrawnCollider(unit.type);
  const rear = HORSE_RIG_CONFIG[unit.type].drawbarLength
    + HORSE_RIG_CONFIG[unit.type].socketForward + collision.coachHalf[0];
  return {
    id: `horse-drawn-${unit.id}`,
    lane: unit.lane,
    cruise: unit.cruise,
    minGap: unit.type === 'omnibus' ? 4.4 : 3.4,
    length: collision.horseHalf[0] + rear,
    trafficSOffset: (collision.horseHalf[0] - rear) / 2,
    priority: 20 + unit.route * 4,
  };
}

export function horseTeamOffsets(team) {
  if (team === 'pair') return [-0.63, 0.63];
  return [0];
}

export function horseTeamPoses(state, team) {
  const offsets = horseTeamOffsets(team);
  const fan = clamp(state.horseArticulation * 0.18, -0.025, 0.025);
  return offsets.map((side) => ({
    x: state.horseX - Math.cos(state.horseYaw) * side,
    z: state.horseZ + Math.sin(state.horseYaw) * side,
    yaw: state.horseYaw + Math.sign(side) * fan,
    side,
  }));
}

export function horseDrawnBoardingProfile(type) {
  if (type === 'hansom') {
    const values = COACHWORKS_PRESETS.hansom;
    return {
      label: 'Climb onto the cab',
      access: [-values.bodyLength * 0.58, 0.04, 0],
      target: [-0.12, values.rideHeight + values.bodyHeight + 0.08, 0],
      roof: {
        center: [-0.02, 0],
        half: [values.bodyLength * 0.33, values.bodyWidth * 0.42],
        top: values.rideHeight + values.bodyHeight + 0.12,
      },
    };
  }
  if (type === 'omnibus') {
    const values = COACHWORKS_PRESETS.omnibus;
    const cabinLength = values.bodyLength * 0.86;
    const cabinX = -values.bodyLength * 0.06;
    const rear = cabinX - cabinLength / 2;
    const stairZ = -values.bodyWidth * 0.28;
    return {
      label: 'Climb onto the omnibus',
      access: [rear - 0.38, 0.08, stairZ],
      target: [rear + 0.18, values.rideHeight + values.bodyHeight + 0.15, stairZ],
      roof: {
        center: [cabinX, 0],
        half: [cabinLength * 0.43, values.bodyWidth * 0.39],
        top: values.rideHeight + values.bodyHeight + 0.15,
      },
    };
  }
  return null;
}

export function horseDrawnCollider(type) {
  if (type === 'omnibus') {
    return { coachHalf: [2.22, 1.55, 1.12], horseHalf: [1.15, 0.95, 0.88], coachY: 1.55, horseY: 0.95 };
  }
  if (type === 'brougham') {
    return { coachHalf: [1.5, 1.23, 0.96], horseHalf: [1.15, 0.95, 0.46], coachY: 1.23, horseY: 0.95 };
  }
  if (type === 'utility') {
    return { coachHalf: [1.58, 1.2, 0.96], horseHalf: [1.15, 0.95, 1.12], coachY: 1.2, horseY: 0.95 };
  }
  return { coachHalf: [1.48, 1.2, 0.96], horseHalf: [1.15, 0.95, 0.46], coachY: 1.2, horseY: 0.95 };
}
