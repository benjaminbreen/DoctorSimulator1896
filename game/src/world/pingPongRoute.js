export const PING_PONG_PHASE = Object.freeze({
  WALKING: 'walking',
  PAUSING: 'pausing',
  TURNING: 'turning',
});

function seeded01(seed, turnCount, salt) {
  const value = Math.sin(
    (Number(seed) + 1) * 127.1 + (turnCount + 1) * 311.7 + salt * 74.31,
  ) * 43758.5453;
  return value - Math.floor(value);
}

export function routeEndpointPauseSeconds(seed, turnCount) {
  return 0.9 + seeded01(seed, turnCount, 1) * 1.3;
}

export function routeEndpointTurnSeconds(seed, turnCount) {
  return 0.58 + seeded01(seed, turnCount, 2) * 0.34;
}

export function createPingPongRouteState({
  distance = 0,
  direction = 1,
  seed = 0,
} = {}) {
  return {
    distance: Math.max(0, Number(distance) || 0),
    direction: direction < 0 ? -1 : 1,
    seed: Number(seed) || 0,
    phase: PING_PONG_PHASE.WALKING,
    phaseStartedAt: 0,
    phaseUntil: 0,
    turnCount: 0,
  };
}

// Mutates one small actor-owned state object to avoid allocating per frame.
// Direction changes only after the endpoint pause, giving callers time to
// blend from the walk into an idle before rotating the figure.
export function stepPingPongRoute(state, {
  delta,
  now,
  length,
  speed,
}) {
  const previousPhase = state.phase;
  const routeLength = Math.max(0, Number(length) || 0);
  const frameTravel = Math.max(0, Number(delta) || 0) * Math.max(0, Number(speed) || 0);

  if (state.phase === PING_PONG_PHASE.WALKING) {
    const next = state.distance + frameTravel * state.direction;
    const reachedEnd = state.direction > 0 && next >= routeLength;
    const reachedStart = state.direction < 0 && next <= 0;
    if (reachedEnd || reachedStart || routeLength === 0) {
      state.distance = reachedEnd ? routeLength : 0;
      state.phase = PING_PONG_PHASE.PAUSING;
      state.phaseStartedAt = now;
      state.phaseUntil = now + routeEndpointPauseSeconds(state.seed, state.turnCount);
    } else {
      state.distance = next;
    }
  } else if (state.phase === PING_PONG_PHASE.PAUSING && now >= state.phaseUntil) {
    state.direction *= -1;
    state.phase = PING_PONG_PHASE.TURNING;
    state.phaseStartedAt = now;
    state.phaseUntil = now + routeEndpointTurnSeconds(state.seed, state.turnCount);
  } else if (state.phase === PING_PONG_PHASE.TURNING && now >= state.phaseUntil) {
    state.phase = PING_PONG_PHASE.WALKING;
    state.phaseStartedAt = now;
    state.phaseUntil = 0;
    state.turnCount += 1;
  }

  return {
    phase: state.phase,
    phaseChanged: state.phase !== previousPhase,
    moving: state.phase === PING_PONG_PHASE.WALKING,
  };
}

export function routeTurnProgress(state, now) {
  if (state.phase !== PING_PONG_PHASE.TURNING) return state.phase === PING_PONG_PHASE.WALKING ? 1 : 0;
  const duration = Math.max(1e-6, state.phaseUntil - state.phaseStartedAt);
  const amount = Math.min(1, Math.max(0, (now - state.phaseStartedAt) / duration));
  return amount * amount * (3 - 2 * amount);
}

export function interpolateRouteTurnYaw(from, to, amount) {
  const difference = Math.atan2(Math.sin(to - from), Math.cos(to - from));
  return from + difference * Math.min(1, Math.max(0, amount));
}
