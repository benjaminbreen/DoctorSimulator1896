// Deterministic full-body reactions shared by the player and ordinary actors.
// This module owns timing and control state, not Three.js AnimationActions.

export const REACTION_PHASE = Object.freeze({
  NORMAL: 'normal',
  STAGGER: 'stagger',
  FALLING: 'falling',
  PRONE: 'prone',
  RISING: 'rising',
  EDGE_SLIP: 'edge-slip',
});

export const REACTION_MOTION = Object.freeze({
  stagger: Object.freeze({ clip: 'Collision Reaction', duration: 3.38, timeScale: 1 }),
  fallShoulder: Object.freeze({ clip: 'FallShoulder', duration: 2.58, timeScale: 1.2 }),
  fallGeneric: Object.freeze({ clip: 'FallGeneric', duration: 2.27, timeScale: 1 }),
  prone: Object.freeze({ clip: 'FallenIdle', duration: 1.5, timeScale: 1 }),
  rise: Object.freeze({ clip: 'RiseFromFall', duration: 5.18, timeScale: 2.2 }),
  edgeSlip: Object.freeze({ clip: 'EdgeSlip', duration: 2.47, timeScale: 1 }),
});

const clamp = (value, low, high) => Math.min(high, Math.max(low, value));
const smoothstep = (value) => value * value * (3 - 2 * value);

export function createReactionState(serial = 0) {
  return {
    serial,
    phase: REACTION_PHASE.NORMAL,
    variant: null,
    cause: null,
    phaseUntil: Infinity,
    proneUntil: Infinity,
    direction: [0, 0],
  };
}

// A smooth curve avoids visible decade boundaries in a mixed crowd. Age only
// controls the quiet time on the ground; the authored rise remains shared.
export function proneHoldSeconds(age) {
  const t = smoothstep(clamp(((Number(age) || 40) - 22) / 45, 0, 1));
  return 0.45 + t * 7.55;
}

export function classifyPedestrianImpact({ cause, relativeSpeed = 0, running = false }) {
  const speed = Math.max(0, Number(relativeSpeed) || 0);
  if (cause === 'horseless-carriage') {
    return speed >= 0.8 ? 'knockdown' : null;
  }
  if (cause === 'player-body') {
    if (running && speed >= 5.25) return 'knockdown';
    return speed >= 0.35 ? 'stagger' : null;
  }
  return null;
}

// Ordinary pedestrians only startle. Preserve the old impact thresholds, but
// collapse what used to be a knockdown into the same upright reaction so a
// route walker can never resume while a prone animation is still displayed.
export function classifyPedestrianStartle(event) {
  return classifyPedestrianImpact(event) ? 'stagger' : null;
}

function normalizedDirection(direction) {
  const x = Number(direction?.[0]) || 0;
  const z = Number(direction?.[1]) || 0;
  const length = Math.hypot(x, z);
  return length > 1e-5 ? [x / length, z / length] : [0, 0];
}

function fallVariant(event) {
  if (event.variant === 'generic') return 'fallGeneric';
  // A body or vehicle strike reads best with the shoulder-led clip. The
  // generic slot remains available for falls and future non-directional hits.
  return event.cause === 'player-body' || event.cause === 'horseless-carriage'
    ? 'fallShoulder'
    : 'fallGeneric';
}

export function beginReaction(current, event, now, actor = {}) {
  const response = event.response ?? classifyPedestrianImpact(event);
  if (!response) return current;
  const serial = (current?.serial ?? 0) + 1;
  const direction = normalizedDirection(event.direction);

  if (response === 'stagger') {
    if (current.phase !== REACTION_PHASE.NORMAL) return current;
    return {
      serial,
      phase: REACTION_PHASE.STAGGER,
      variant: 'stagger',
      cause: event.cause ?? null,
      phaseUntil: now + REACTION_MOTION.stagger.duration,
      proneUntil: Infinity,
      direction,
    };
  }

  if (response === 'edge-slip') {
    if (current.phase !== REACTION_PHASE.NORMAL) return current;
    return {
      serial,
      phase: REACTION_PHASE.EDGE_SLIP,
      variant: 'edgeSlip',
      cause: event.cause ?? 'ledge',
      phaseUntil: now + REACTION_MOTION.edgeSlip.duration,
      proneUntil: Infinity,
      direction,
    };
  }

  if (response !== 'knockdown') return current;
  const variant = fallVariant(event);
  const fallEnd = now + REACTION_MOTION[variant].duration;
  const ageHold = proneHoldSeconds(actor.age);
  const severityHold = Math.max(0, Number(event.proneSeconds) || 0);
  const requestedUntil = Number(event.proneUntil) || -Infinity;
  const proneUntil = Math.max(fallEnd + ageHold + severityHold, requestedUntil);

  // Another solid hit while down extends recovery without replaying the fall
  // every collision frame. A hit during a rise is allowed to put the actor
  // down again because their standing collider has already returned.
  if (current.phase === REACTION_PHASE.FALLING || current.phase === REACTION_PHASE.PRONE) {
    return {
      ...current,
      serial,
      cause: event.cause ?? current.cause,
      proneUntil: Math.max(current.proneUntil, proneUntil),
      direction,
    };
  }

  return {
    serial,
    phase: REACTION_PHASE.FALLING,
    variant,
    cause: event.cause ?? null,
    phaseUntil: fallEnd,
    proneUntil,
    direction,
  };
}

export function stepReaction(current, now, { canStand = true } = {}) {
  if (!current || current.phase === REACTION_PHASE.NORMAL) return current;
  if (now < current.phaseUntil) return current;

  if (current.phase === REACTION_PHASE.STAGGER || current.phase === REACTION_PHASE.EDGE_SLIP) {
    return createReactionState(current.serial + 1);
  }
  if (current.phase === REACTION_PHASE.FALLING) {
    return {
      ...current,
      serial: current.serial + 1,
      phase: REACTION_PHASE.PRONE,
      variant: 'prone',
      phaseUntil: current.proneUntil,
    };
  }
  if (current.phase === REACTION_PHASE.PRONE) {
    if (now < current.proneUntil || !canStand) return current;
    return {
      ...current,
      serial: current.serial + 1,
      phase: REACTION_PHASE.RISING,
      variant: 'rise',
      phaseUntil: now + REACTION_MOTION.rise.duration,
    };
  }
  if (current.phase === REACTION_PHASE.RISING) {
    return createReactionState(current.serial + 1);
  }
  return current;
}

export function reactionLocksMovement(reaction) {
  return Boolean(reaction && ![
    REACTION_PHASE.NORMAL,
    REACTION_PHASE.STAGGER,
  ].includes(reaction.phase));
}

export function reactionUsesProneCollider(reaction) {
  return reaction?.phase === REACTION_PHASE.PRONE;
}
