import { clamp } from '../movement/mathUtils.js';

// Vehicle-to-vehicle contacts are resolved in the traffic simulation rather
// than by Rapier. The visible/player colliders are kinematic and therefore
// cannot push one another apart. A few plan-view circles are enough for the
// small street fleet and avoid adding more physics bodies or shape casts.

const trafficBodies = new Map();
const pendingImpacts = new Map();
const contactPairs = new Map();
let collectingFrame = null;
const CONTACT_RELEASE_FRAMES = 8;
const IMPACT_SPEED_THRESHOLD = 0.12;

function pairKey(a, b) {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

function queueImpact(id, impact) {
  const queue = pendingImpacts.get(id);
  if (queue) queue.push(impact);
  else pendingImpacts.set(id, [impact]);
}

export function trafficCircleChain(x, z, yaw, offsets, radius) {
  const fx = Math.sin(yaw);
  const fz = Math.cos(yaw);
  return offsets.map((offset) => ({
    x: x + fx * offset,
    z: z + fz * offset,
    r: radius,
  }));
}

export function trafficContactBetween(a, b) {
  let deepest = null;
  for (const ac of a.circles) {
    for (const bc of b.circles) {
      const dx = ac.x - bc.x;
      const dz = ac.z - bc.z;
      const distance = Math.hypot(dx, dz);
      const penetration = ac.r + bc.r - distance;
      if (penetration <= 0 || (deepest && penetration <= deepest.penetration)) continue;
      const rvx = (a.vx ?? 0) - (b.vx ?? 0);
      const rvz = (a.vz ?? 0) - (b.vz ?? 0);
      const relativeSpeed = Math.hypot(rvx, rvz);
      const rawNx = distance > 1e-5 ? dx / distance : relativeSpeed > 1e-5 ? -rvx / relativeSpeed : 1;
      const rawNz = distance > 1e-5 ? dz / distance : relativeSpeed > 1e-5 ? -rvz / relativeSpeed : 0;
      const nx = Object.is(rawNx, -0) ? 0 : rawNx;
      const nz = Object.is(rawNz, -0) ? 0 : rawNz;
      deepest = {
        nx,
        nz,
        penetration,
        closingSpeed: Math.max(0, -(rvx * nx + rvz * nz)),
      };
    }
  }
  return deepest;
}

function resolveCollectedBodies(frameToken) {
  const bodies = [...trafficBodies.values()];
  const activeThisFrame = new Set();
  for (let aIndex = 0; aIndex < bodies.length; aIndex += 1) {
    for (let bIndex = aIndex + 1; bIndex < bodies.length; bIndex += 1) {
      const current = bodies[aIndex];
      const other = bodies[bIndex];
      const key = pairKey(current.id, other.id);
      const previous = contactPairs.get(key);
      const contact = trafficContactBetween(current, other);
      if (!contact) continue;

      activeThisFrame.add(key);
      const firstContact = !previous?.active;
      contactPairs.set(key, { active: true, lastFrame: frameToken, misses: 0 });
      const inverseA = 1 / current.mass;
      const inverseB = 1 / other.mass;
      const inverseTotal = inverseA + inverseB;
      const correctionA = contact.penetration * (inverseA / inverseTotal) + 0.005;
      const correctionB = contact.penetration * (inverseB / inverseTotal) + 0.005;
      const massTotal = current.mass + other.mass;
      const influenceA = other.mass / massTotal;
      const influenceB = current.mass / massTotal;
      const impactSpeed = firstContact && contact.closingSpeed >= IMPACT_SPEED_THRESHOLD
        ? contact.closingSpeed
        : 0;
      const hard = impactSpeed >= 2.8;
      const currentWins = (current.priority ?? 50) !== (other.priority ?? 50)
        ? (current.priority ?? 50) < (other.priority ?? 50)
        : current.id < other.id;

      queueImpact(current.id, {
        otherId: other.id,
        nx: contact.nx,
        nz: contact.nz,
        separation: correctionA,
        kick: impactSpeed ? Math.min(0.95, impactSpeed * (0.08 + influenceA * 0.12)) : 0,
        speedLoss: impactSpeed * influenceA * 0.72,
        closingSpeed: impactSpeed,
        hard,
        yield: impactSpeed > 0 && !currentWins,
      });
      queueImpact(other.id, {
        otherId: current.id,
        nx: contact.nx === 0 ? 0 : -contact.nx,
        nz: contact.nz === 0 ? 0 : -contact.nz,
        separation: correctionB,
        kick: impactSpeed ? Math.min(0.95, impactSpeed * (0.08 + influenceB * 0.12)) : 0,
        speedLoss: impactSpeed * influenceB * 0.72,
        closingSpeed: impactSpeed,
        hard,
        yield: impactSpeed > 0 && currentWins,
      });
    }
  }

  for (const [key, previous] of contactPairs) {
    if (previous.active && !activeThisFrame.has(key)) {
      const misses = (previous.misses ?? 0) + 1;
      contactPairs.set(key, {
        ...previous,
        active: misses < CONTACT_RELEASE_FRAMES,
        lastFrame: frameToken,
        misses,
      });
    }
  }
}

// Every vehicle publishes one immutable snapshot. Resolution happens only when
// the next render frame starts, so component callback order cannot mix current
// positions with another vehicle's previous position.
export function beginTrafficFrame(frameToken) {
  if (collectingFrame === null) {
    collectingFrame = frameToken;
    return;
  }
  if (collectingFrame === frameToken) return;
  resolveCollectedBodies(collectingFrame);
  trafficBodies.clear();
  collectingFrame = frameToken;
}

export function reportTrafficBody(body, frameToken) {
  if (!body?.id || !body.circles?.length) return;
  beginTrafficFrame(frameToken);
  trafficBodies.set(body.id, {
    ...body,
    mass: Math.max(1, body.mass ?? 700),
  });
}

export function takeTrafficImpacts(id) {
  const impacts = pendingImpacts.get(id) ?? [];
  pendingImpacts.delete(id);
  return impacts;
}

export function applyTrafficImpacts(state, impacts) {
  if (!impacts?.length) return state;
  let speed = state.speed;
  let yaw = state.yaw;
  let knockX = state.knockX ?? 0;
  let knockZ = state.knockZ ?? 0;
  let knockRoll = state.knockRoll ?? 0;
  let knockPitch = state.knockPitch ?? 0;
  let crashTime = state.crashTime ?? 0;
  let collisionRecovery = state.collisionRecovery ?? null;
  let recoveryImpactSpeed = -1;
  let hard = false;

  for (const impact of impacts) {
    const shove = clamp(impact.separation + impact.kick, 0, 1.15);
    const fx = Math.sin(yaw);
    const fz = Math.cos(yaw);
    const side = impact.nx * fz - impact.nz * fx;
    const front = impact.nx * fx + impact.nz * fz;
    knockX = clamp(knockX + impact.nx * shove, -1.8, 1.8);
    knockZ = clamp(knockZ + impact.nz * shove, -1.8, 1.8);
    knockRoll = clamp(knockRoll - side * (0.07 + impact.closingSpeed * 0.025), -0.28, 0.28);
    knockPitch = clamp(knockPitch + front * impact.closingSpeed * 0.018, -0.16, 0.16);
    if (impact.closingSpeed > 0) {
      speed = Math.max(0, speed - impact.speedLoss);
      yaw -= side * Math.min(0.16, impact.closingSpeed * 0.025);
      crashTime = Math.max(
        crashTime,
        impact.hard ? 1.4 + Math.min(0.8, (impact.closingSpeed - 2.8) * 0.3) : 0.22,
      );
      const recoveryFx = Math.sin(yaw);
      const recoveryFz = Math.cos(yaw);
      const rightward = impact.nx * -recoveryFz + impact.nz * recoveryFx;
      const fallbackSide = impact.yield ? -1 : 1;
      const escapeDirection = Math.abs(rightward) > 0.08 ? Math.sign(rightward) : fallbackSide;
      const candidate = {
        role: impact.yield ? 'yield' : 'proceed',
        otherId: impact.otherId,
        time: impact.hard ? (impact.yield ? 5 : 2.4) : (impact.yield ? 2.2 : 1),
        hold: impact.yield ? (impact.hard ? 1.8 : 0.55) : 0,
        escapeLane: clamp((state.lat ?? 0) + escapeDirection * 0.95, -2.1, 2.1),
      };
      // In a multi-vehicle collision, yielding to any participant wins. Among
      // equivalent roles, keep the strongest impact's escape decision.
      if (!collisionRecovery
        || (candidate.role === 'yield' && collisionRecovery.role !== 'yield')
        || (candidate.role === collisionRecovery.role && impact.closingSpeed > recoveryImpactSpeed)) {
        collisionRecovery = candidate;
        recoveryImpactSpeed = impact.closingSpeed;
      }
    }
    hard ||= impact.hard;
  }

  return {
    ...state,
    speed,
    yaw,
    knockX,
    knockZ,
    knockRoll,
    knockPitch,
    crashTime,
    collisionRecovery,
    avoidTarget: hard ? null : state.avoidTarget,
  };
}

export function removeTrafficBody(id) {
  trafficBodies.delete(id);
  pendingImpacts.delete(id);
  for (const key of contactPairs.keys()) {
    if (key.startsWith(`${id}|`) || key.endsWith(`|${id}`)) contactPairs.delete(key);
  }
}

export function resetTrafficContacts() {
  trafficBodies.clear();
  pendingImpacts.clear();
  contactPairs.clear();
  collectingFrame = null;
}
