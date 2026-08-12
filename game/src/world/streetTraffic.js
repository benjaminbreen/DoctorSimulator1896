import { clamp, shortestArc } from '../movement/mathUtils.js';
import { ROUTES, sampleRoute } from './horselessCarriage.js';

const APPROACH_DISTANCE = 15;
const STOP_LINE_DISTANCE = 3.2;
const EXIT_CLEARANCE = 5;
const PASS_LOOKAHEAD = 16;
const PASS_CLEARANCE = 20;
const SAME_LANE_HALF_WIDTH = 1.15;
const SAME_DIRECTION_DOT = 0.72;

function forwardDistance(route, from, to) {
  return ((to - from) % route.total + route.total) % route.total;
}

function signedDistance(route, origin, value) {
  const forward = forwardDistance(route, origin, value);
  return forward > route.total / 2 ? forward - route.total : forward;
}

function routeTraffic(agents, selfId) {
  const unique = new Map();
  for (const agent of agents) {
    if (!agent.trafficId || agent.trafficId === selfId || agent.route == null || agent.s == null) continue;
    if (!unique.has(agent.trafficId)) unique.set(agent.trafficId, agent);
  }
  return [...unique.values()];
}

function nearbyIntersection(route, s, vehicleLength) {
  let nearest = null;
  for (const intersection of route.intersections ?? []) {
    const progress = signedDistance(route, intersection.s, s);
    if (progress < -APPROACH_DISTANCE || progress > vehicleLength + EXIT_CLEARANCE) continue;
    if (!nearest || Math.abs(progress) < Math.abs(nearest.progress)) nearest = { ...intersection, progress };
  }
  return nearest;
}

function nearestMatchingIntersection(route, id, s) {
  let nearest = null;
  for (const entry of route.intersections ?? []) {
    if (entry.id !== id) continue;
    const distance = Math.abs(signedDistance(route, entry.s, s));
    if (!nearest || distance < nearest.distance) nearest = { entry, distance };
  }
  return nearest?.entry ?? null;
}

function intersectionCandidate(agent, intersection) {
  const route = ROUTES[agent.route];
  const matching = nearestMatchingIntersection(route, intersection.id, agent.s);
  if (!matching) return null;
  const progress = signedDistance(route, matching.s, agent.s);
  const length = agent.length ?? 3;
  if (progress < -APPROACH_DISTANCE || progress > length + EXIT_CLEARANCE) return null;
  return { agent, progress, occupied: progress + length * 0.5 >= -1.2 };
}

function priority(candidate) {
  const wait = candidate.agent.trafficWait ?? 0;
  return [candidate.occupied ? 0 : 1, -Math.min(wait, 12), candidate.agent.priority ?? 50, candidate.agent.trafficId];
}

function comesBefore(a, b) {
  const aa = priority(a);
  const bb = priority(b);
  for (let i = 0; i < aa.length; i += 1) {
    if (aa[i] === bb[i]) continue;
    return aa[i] < bb[i];
  }
  return false;
}

function roadIsStraight(route, s) {
  const [, , ax, az] = sampleRoute(route, s);
  const [, , bx, bz] = sampleRoute(route, s + 10);
  return Math.abs(shortestArc(Math.atan2(ax, az), Math.atan2(bx, bz))) < 0.07;
}

function physicalTrafficPosition(agent) {
  return [agent.trafficX ?? agent.x, agent.trafficZ ?? agent.z];
}

// Distinct loops share stretches of Central Park South. Route distance cannot
// compare them, so use actual lane position and heading for nearby traffic.
function nearbyPhysicalLeader(state, config, traffic) {
  const selfYaw = state.yaw;
  const fx = Math.sin(selfYaw);
  const fz = Math.cos(selfYaw);
  const selfOffset = config.trafficSOffset ?? 0;
  const selfX = state.x + fx * selfOffset;
  const selfZ = state.z + fz * selfOffset;
  let nearest = null;

  for (const agent of traffic) {
    if (agent.route === state.route) continue;
    if (!Number.isFinite(agent.yaw)) continue;
    const otherFx = Math.sin(agent.yaw);
    const otherFz = Math.cos(agent.yaw);
    if (fx * otherFx + fz * otherFz < SAME_DIRECTION_DOT) continue;
    const [otherX, otherZ] = physicalTrafficPosition(agent);
    const dx = otherX - selfX;
    const dz = otherZ - selfZ;
    const ahead = dx * fx + dz * fz;
    const side = dx * -fz + dz * fx;
    if (ahead <= 0.1 || Math.abs(side) > SAME_LANE_HALF_WIDTH) continue;
    if (ahead > PASS_LOOKAHEAD + (agent.length ?? 3)) continue;
    const gap = ahead - (agent.length ?? 3) * 0.5 - config.length * 0.5;
    if (!nearest || gap < nearest.gap) nearest = { agent, gap, physical: true };
  }
  return nearest;
}

function passingLaneClear(route, state, lane, traffic, originS = state.s) {
  return !traffic.some((agent) => {
    if (agent.route !== state.route) {
      // Different loops can share a street in the opposite direction. A
      // conservative world-space check keeps passing out of oncoming traffic.
      return Math.hypot(agent.x - state.x, agent.z - state.z) < 32;
    }
    if (Math.abs((agent.lane ?? 0) - lane) > 0.8) return false;
    const ahead = forwardDistance(route, originS, agent.s);
    const behind = forwardDistance(route, agent.s, originS);
    return ahead < PASS_CLEARANCE || behind < PASS_CLEARANCE * 0.65;
  });
}

export function streetTrafficAdvice(state, agents, config, dt) {
  const route = ROUTES[state.route];
  const traffic = routeTraffic(agents, config.id);
  const selfS = state.s + (config.trafficSOffset ?? 0);
  const baseLane = config.lane;
  const previous = state.traffic ?? { mode: 'lane', lane: baseLane, targetId: null, wait: 0 };
  let mode = previous.mode;
  let lane = previous.lane ?? baseLane;
  let targetId = previous.targetId ?? null;
  let speedLimit = config.cruise;
  let heldAtIntersection = false;

  const intersection = nearbyIntersection(route, selfS, config.length);
  if (intersection) {
    const self = {
      agent: {
        trafficId: config.id,
        route: state.route,
        s: selfS,
        length: config.length,
        priority: config.priority,
        trafficWait: previous.wait,
      },
      progress: intersection.progress,
      occupied: intersection.progress + config.length * 0.5 >= -1.2,
    };
    const candidates = [self, ...traffic
      .map((agent) => intersectionCandidate(agent, intersection))
      .filter(Boolean)];
    const winner = candidates.reduce((best, candidate) => comesBefore(candidate, best) ? candidate : best);
    if (winner.agent.trafficId !== config.id && intersection.progress < -0.5) {
      const frontProgress = intersection.progress + config.length * 0.5;
      const room = Math.max(0, -frontProgress - STOP_LINE_DISTANCE);
      speedLimit = Math.min(speedLimit, room * 0.52);
      heldAtIntersection = room < 2 || state.speed < 0.35;
    }

    // Never enter a box whose exit is occupied in this lane.
    const exitBlocked = traffic.some((agent) => {
      if (agent.route !== state.route || Math.abs((agent.lane ?? 0) - baseLane) > 0.9) return false;
      const matching = nearestMatchingIntersection(route, intersection.id, agent.s);
      if (!matching) return false;
      const progress = signedDistance(route, matching.s, agent.s);
      return progress > 0 && progress < (agent.length ?? 3) + EXIT_CLEARANCE;
    });
    if (exitBlocked && intersection.progress < -0.5) {
      const frontProgress = intersection.progress + config.length * 0.5;
      const room = Math.max(0, -frontProgress - STOP_LINE_DISTANCE);
      speedLimit = Math.min(speedLimit, room * 0.52);
      heldAtIntersection ||= room < 2 || state.speed < 0.35;
    }
    mode = 'lane';
    lane = baseLane;
    targetId = null;
  }

  const sameRoute = traffic.filter((agent) => agent.route === state.route);
  const routeLeader = sameRoute
    .map((agent) => ({ agent, gap: forwardDistance(route, selfS, agent.s) }))
    .filter(({ agent, gap }) => gap > 0.1 && gap < PASS_LOOKAHEAD + (agent.length ?? 3))
    .map(({ agent, gap }) => ({
      agent,
      gap: gap - (agent.length ?? 3) * 0.5 - config.length * 0.5,
      physical: false,
    }))
    .sort((a, b) => a.gap - b.gap)[0];
  const physicalLeader = nearbyPhysicalLeader(state, config, traffic);
  const leader = !routeLeader || (physicalLeader && physicalLeader.gap < routeLeader.gap)
    ? physicalLeader
    : routeLeader;

  if (mode === 'passing') {
    const target = traffic.find((agent) => agent.trafficId === targetId);
    if (!target || target.route !== state.route || intersection) {
      mode = 'lane';
      lane = baseLane;
      targetId = null;
    } else {
      const lead = forwardDistance(route, target.s, selfS);
      if (lead > 7 && lead < route.total / 2) {
        mode = 'lane';
        lane = baseLane;
        targetId = null;
      }
    }
  }

  if (leader && mode !== 'passing') {
    const { gap } = leader;
    const passingLane = -Math.sign(baseLane || 1) * Math.abs(baseLane);
    const canPass = !leader.physical
      && !intersection
      && leader.agent.speed < config.cruise - 0.45
      && gap < PASS_LOOKAHEAD
      && roadIsStraight(route, selfS)
      && passingLaneClear(route, state, passingLane, traffic, selfS);
    if (canPass) {
      mode = 'passing';
      lane = passingLane;
      targetId = leader.agent.trafficId;
    } else {
      const gapError = gap - config.minGap;
      const leaderSpeed = leader.agent.speed ?? 0;
      // When already too close, become slower than the leader so the desired
      // gap can reopen. Matching its speed would preserve an overlap forever.
      const followingSpeed = gapError < 0
        ? Math.max(0, leaderSpeed + gapError * 0.65)
        : leaderSpeed + gapError * 0.38;
      speedLimit = Math.min(speedLimit, followingSpeed);
    }
  }

  const laneLambda = mode === 'passing' ? 0.72 : 0.9;
  const wait = heldAtIntersection
    ? Math.min(20, previous.wait + dt)
    : Math.max(0, previous.wait - dt * 2);
  return {
    cruise: clamp(speedLimit, 0, config.cruise),
    lane,
    laneLambda,
    traffic: { mode, lane, targetId, wait },
    intersection: intersection?.id ?? null,
  };
}

export function trafficAgentDetails(state, config) {
  const yaw = state.yaw;
  const trafficOffset = config.trafficSOffset ?? 0;
  return {
    trafficId: config.id,
    route: state.route,
    s: state.s + (config.trafficSOffset ?? 0),
    lane: state.lat,
    speed: state.speed,
    yaw,
    trafficX: state.x + Math.sin(yaw) * trafficOffset,
    trafficZ: state.z + Math.cos(yaw) * trafficOffset,
    length: config.length,
    priority: config.priority,
    trafficWait: state.traffic?.wait ?? 0,
  };
}
