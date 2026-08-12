export const REQUIRED_REACTIONS = 3;
export const MAX_REACTION_SECONDS = 1.5;

function delayFor(seed, attempt) {
  const value = Math.sin((seed + attempt * 91.73) * 12.9898) * 43758.5453;
  return 1.5 + (value - Math.floor(value)) * 3;
}

export function createReactionChronoscope(options = {}) {
  return {
    id: 'reaction-chronoscope',
    label: 'Hipp chronoscope',
    framing: {
      offset: [0.05, 0.48, 2.35],
      target: [0.04, 0.28, 0],
      fov: 42,
    },
    seed: options.seed ?? 1896,
    state: {
      phase: 'idle',
      attempt: 0,
      waitingElapsed: 0,
      signalDelay: 0,
      reactionElapsed: 0,
      cueFlash: 0,
      signalCount: 0,
      keyStrikes: 0,
      eventCount: 0,
      lastEvent: null,
      readings: [],
      falseStarts: 0,
      misses: 0,
      best: null,
    },
  };
}

function arm(instrument) {
  const state = instrument.state;
  state.attempt += 1;
  state.phase = 'waiting';
  state.waitingElapsed = 0;
  state.reactionElapsed = 0;
  state.cueFlash = 0;
  state.signalDelay = delayFor(instrument.seed, state.attempt);
  state.lastEvent = { type: 'armed', attempt: state.attempt };
  state.eventCount += 1;
}

function finish(state, event) {
  state.lastEvent = event;
  state.eventCount += 1;
  state.phase = state.readings.length >= REQUIRED_REACTIONS ? 'complete' : 'result';
}

export function stepReactionChronoscope(instrument, dt, input = {}) {
  const state = instrument.state;
  let expiredThisStep = false;
  state.cueFlash = Math.max(0, state.cueFlash - dt);

  if (state.phase === 'waiting') {
    state.waitingElapsed += dt;
    if (state.waitingElapsed >= state.signalDelay) {
      state.phase = 'signal';
      state.reactionElapsed = state.waitingElapsed - state.signalDelay;
      state.cueFlash = 0.34;
      state.signalCount += 1;
      state.lastEvent = { type: 'signal', attempt: state.attempt };
      state.eventCount += 1;
    }
  } else if (state.phase === 'signal') {
    state.reactionElapsed += dt;
    if (state.reactionElapsed >= MAX_REACTION_SECONDS) {
      state.misses += 1;
      finish(state, { type: 'miss', attempt: state.attempt });
      expiredThisStep = true;
    }
  }

  // A press arriving on the expiry frame belongs to the expired trial. It
  // must not silently arm the next one as a side effect of changing phase.
  if (!input.press || expiredThisStep) return state;
  state.keyStrikes += 1;

  if (state.phase === 'idle' || state.phase === 'result') {
    arm(instrument);
    return state;
  }

  if (state.phase === 'waiting') {
    state.falseStarts += 1;
    finish(state, { type: 'false-start', attempt: state.attempt });
    return state;
  }

  if (state.phase === 'signal') {
    const reading = state.reactionElapsed;
    state.readings.push(reading);
    state.best = state.best == null ? reading : Math.min(state.best, reading);
    finish(state, { type: 'reading', attempt: state.attempt, seconds: reading });
    return state;
  }

  if (state.phase === 'complete') {
    state.phase = 'idle';
    state.attempt = 0;
    state.waitingElapsed = 0;
    state.signalDelay = 0;
    state.reactionElapsed = 0;
    state.cueFlash = 0;
    state.readings = [];
    state.falseStarts = 0;
    state.misses = 0;
    state.best = null;
    state.lastEvent = { type: 'reset' };
    state.eventCount += 1;
  }

  return state;
}
