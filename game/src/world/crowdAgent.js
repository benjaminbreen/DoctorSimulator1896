// Per-agent motion for the ambient crowd: catch-up after interruptions,
// neighbour avoidance, and the look-both-ways check at crossings. The
// scheduler decides where a slot should be; this decides how it gets there.

const CATCH_UP_FACTOR = 1.18;
const NEIGHBOUR_RADIUS = 1.4;
const AVOID_MAX_LATERAL = 0.55;
const CROSSING_LOOKOUT = 2.0;
const CROSSING_HORIZON_SECONDS = 3.2;
const CROSSING_CORRIDOR = 2.6;
// Reactions to the player pressing close: stop short of walking into them,
// lean out of their way on approach, and step around if they keep blocking.
const YIELD_AHEAD = 1.15;
const YIELD_HALF_WIDTH = 0.55;
const DODGE_AHEAD = 2.4;
const DODGE_HALF_WIDTH = 1.2;
const DETOUR_AFTER_SECONDS = 2.4;
const DETOUR_LATERAL = 1.25;

export function polylineTotal(points) {
  let total = 0;
  for (let i = 0; i < points.length - 1; i += 1) {
    total += Math.hypot(points[i + 1][0] - points[i][0], points[i + 1][1] - points[i][1]);
  }
  return total;
}

// [x, z, tx, tz, segmentIndex] at an arc distance along a polyline.
export function samplePolyline(points, distance) {
  let remaining = Math.max(0, distance);
  for (let i = 0; i < points.length - 1; i += 1) {
    const dx = points[i + 1][0] - points[i][0];
    const dz = points[i + 1][1] - points[i][1];
    const length = Math.hypot(dx, dz);
    if (remaining <= length && length > 0) {
      const t = remaining / length;
      return [
        points[i][0] + dx * t,
        points[i][1] + dz * t,
        dx / length,
        dz / length,
        i,
      ];
    }
    remaining -= length;
  }
  const i = points.length - 2;
  const dx = points[i + 1][0] - points[i][0];
  const dz = points[i + 1][1] - points[i][1];
  const length = Math.hypot(dx, dz) || 1;
  return [points[i + 1][0], points[i + 1][1], dx / length, dz / length, i];
}

export function createCrowdAgentState() {
  return {
    distance: 0,
    lateral: 0,
    holdUntil: 0,
    yieldTime: 0,
    lapseUntil: 0,
    assignmentIndex: null,
    materialized: false,
  };
}

// How the agent responds to someone standing or walking in its way.
// Returns null when the intruder is irrelevant to this step.
export function intruderResponse(x, z, tx, tz, intruder, yieldTime) {
  if (!intruder) return null;
  const dx = intruder.x - x;
  const dz = intruder.z - z;
  const ahead = dx * tx + dz * tz;
  const side = dx * -tz + dz * tx;
  if (ahead < 0 || ahead > DODGE_AHEAD || Math.abs(side) > DODGE_HALF_WIDTH) return null;
  const detour = yieldTime > DETOUR_AFTER_SECONDS;
  if (ahead <= YIELD_AHEAD && Math.abs(side) <= YIELD_HALF_WIDTH && !detour) {
    return { kind: 'yield', faceYaw: Math.atan2(dx, dz) };
  }
  // Push to whichever side the intruder is not; head-on defaults right.
  const away = -Math.sign(side || -1);
  return {
    kind: detour ? 'detour' : 'dodge',
    lateral: away * (detour ? DETOUR_LATERAL : AVOID_MAX_LATERAL * 1.5),
  };
}

// Finite lateral avoidance: neighbours ahead push the agent sideways, low
// attention weakens the push. Two inattentive agents on a collision course
// can therefore still clip shoulders — the reaction system takes it there.
export function avoidanceOffset(x, z, tx, tz, neighbours, attention) {
  let push = 0;
  for (const other of neighbours) {
    const dx = other.x - x;
    const dz = other.z - z;
    const ahead = dx * tx + dz * tz;
    if (ahead < 0 || ahead > NEIGHBOUR_RADIUS) continue;
    const side = dx * -tz + dz * tx;
    if (Math.abs(side) > NEIGHBOUR_RADIUS) continue;
    const weight = (1 - ahead / NEIGHBOUR_RADIUS) * (1 - Math.abs(side) / NEIGHBOUR_RADIUS);
    push -= Math.sign(side || 1) * weight;
  }
  const scaled = push * 0.45 * (0.4 + attention * 0.6);
  return Math.max(-AVOID_MAX_LATERAL, Math.min(AVOID_MAX_LATERAL, scaled));
}

// Does any vehicle reach the crossing corridor within the horizon? Vehicles
// are the traffic agents (trafficId set) with a velocity worth fearing.
export function crossingThreat(x, z, tx, tz, vehicles) {
  for (const vehicle of vehicles) {
    const speed = Math.max(0.4, vehicle.speed ?? 0);
    const vx = Math.sin(vehicle.yaw ?? 0) * speed;
    const vz = Math.cos(vehicle.yaw ?? 0) * speed;
    for (let t = 0; t <= CROSSING_HORIZON_SECONDS; t += 0.4) {
      const px = vehicle.x + vx * t - x;
      const pz = vehicle.z + vz * t - z;
      const along = px * tx + pz * tz;
      const side = px * -tz + pz * tx;
      if (along > -1 && along < CROSSING_CORRIDOR + (vehicle.r ?? 1.5)
        && Math.abs(side) < CROSSING_CORRIDOR + (vehicle.r ?? 1.5)) {
        return vehicle;
      }
    }
  }
  return null;
}

// The seeded lapse: a distracted, hurried walker steps out anyway. The
// incident gate is the caller's rate budget; without it no lapse happens.
export function crossingLapse(traits, roll, incidentAllowed) {
  if (!incidentAllowed) return false;
  const chance = (1 - traits.attention) * (0.25 + traits.hurry * 0.5) * 0.5;
  return roll < chance;
}

// Advance the visible agent toward the scheduler's logical distance.
// Returns the pose plus flags the scene layer needs for animation choice.
export function stepCrowdAgent(agent, {
  dt,
  now,
  logicalDistance,
  dwelling,
  assignment,
  neighbours = [],
  vehicles = [],
  intruder = null,
  frozen = false,
  crossingRoll = 1,
  incidentAllowed = false,
}) {
  const points = assignment.polyline;
  if (!points) {
    return { moving: false, dwelling: true, lapse: false };
  }
  if (agent.assignmentIndex !== assignment.index) {
    // New assignment: the figure starts wherever the walk starts. If it was
    // interrupted mid-route the scene layer decides whether the hop is
    // visible; logically the slot has already arrived.
    agent.assignmentIndex = assignment.index;
    agent.distance = 0;
    agent.lateral = 0;
    agent.holdUntil = 0;
  }

  const behind = Math.max(0, Math.min(logicalDistance, assignment.length) - agent.distance);
  let speed = behind > 0.05 ? assignment.pace * Math.min(CATCH_UP_FACTOR, 1 + behind / 6) : 0;
  let lapse = false;

  const [x, z, tx, tz, segmentIndex] = samplePolyline(points, agent.distance);
  const segment = assignment.segments?.[segmentIndex] ?? null;
  const nextSegment = assignment.segments?.[segmentIndex + 1] ?? null;

  // Someone in the way outranks the schedule: stop short of walking into
  // them, lean aside on approach, and after blocking long enough, go around.
  const intrusion = intruderResponse(x, z, tx, tz, intruder, agent.yieldTime);
  if (intrusion?.kind === 'yield') {
    agent.yieldTime += dt;
    speed = 0;
  } else if (intrusion) {
    speed *= intrusion.kind === 'detour' ? 0.65 : 0.75;
  } else {
    agent.yieldTime = Math.max(0, agent.yieldTime - dt * 1.5);
  }
  if (frozen) speed = 0;

  if (now < agent.holdUntil) {
    speed = 0;
  } else if (speed > 0) {
    // Approaching or on a road crossing: look both ways.
    const onRoad = segment?.surface === 'road';
    const segmentEnd = (() => {
      let total = 0;
      for (let i = 0; i <= segmentIndex; i += 1) {
        total += Math.hypot(points[i + 1][0] - points[i][0], points[i + 1][1] - points[i][1]);
      }
      return total;
    })();
    const nearingCrossing = !onRoad
      && nextSegment?.surface === 'road'
      && segmentEnd - agent.distance < CROSSING_LOOKOUT;
    // A committed lapse is latched: the walker keeps going until clear of
    // the road, so one budgeted incident is one whole crossing, not a
    // single-frame twitch that spends the budget for nothing.
    if (nearingCrossing && now >= agent.lapseUntil) {
      const threat = crossingThreat(x, z, tx, tz, vehicles);
      if (threat) {
        lapse = crossingLapse(assignment.traits, crossingRoll, incidentAllowed);
        if (lapse) {
          agent.lapseUntil = now + 3.5;
        } else {
          speed = 0;
          agent.holdUntil = now + 0.6;
        }
      }
    }
  }

  if (speed > 0) {
    agent.distance = Math.min(assignment.length, agent.distance + speed * dt);
    const target = intrusion?.lateral
      ?? avoidanceOffset(x, z, tx, tz, neighbours, assignment.traits.attention);
    agent.lateral += (target - agent.lateral) * Math.min(1, dt * 3.2);
  } else {
    agent.lateral += (0 - agent.lateral) * Math.min(1, dt * 2);
  }

  const [fx, fz, ftx, ftz, fSegment] = samplePolyline(points, agent.distance);
  const arrived = agent.distance >= assignment.length - 0.05;
  return {
    x: fx + -ftz * agent.lateral,
    z: fz + ftx * agent.lateral,
    yaw: Math.atan2(ftx, ftz),
    tx: ftx,
    tz: ftz,
    moving: speed > 0,
    dwelling: dwelling || arrived,
    lapse,
    yielding: intrusion?.kind === 'yield',
    faceYaw: intrusion?.kind === 'yield' ? intrusion.faceYaw : null,
    segment: assignment.segments?.[fSegment] ?? null,
  };
}
