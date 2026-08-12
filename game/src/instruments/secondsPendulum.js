const GRAVITY = 9.81;

export const TARGET_SECONDS = 10;
export const SECONDS_LENGTH = GRAVITY / (Math.PI * Math.PI);

export function pendulumPeriod(length = SECONDS_LENGTH) {
  return 2 * Math.PI * Math.sqrt(length / GRAVITY);
}

export function createSecondsPendulum(options = {}) {
  return {
    id: 'seconds-pendulum',
    label: 'Seconds pendulum',
    framing: {
      offset: [0, 0.72, 2.45],
      target: [0, 0.64, 0],
      fov: 34,
    },
    length: options.length ?? SECONDS_LENGTH,
    amplitude: options.amplitude ?? 0.27,
    damping: options.damping ?? 0.003,
    state: {
      phase: 'reference',
      angle: options.amplitude ?? 0.27,
      referenceElapsed: 0,
      trialElapsed: 0,
      result: null,
      trials: 0,
      totalAbsoluteError: 0,
      bestAbsoluteError: null,
    },
  };
}

export function stepSecondsPendulum(instrument, dt, input = {}) {
  const state = instrument.state;

  if (state.phase === 'reference') {
    state.referenceElapsed += dt;
    const angularSpeed = Math.sqrt(GRAVITY / instrument.length);
    state.angle = instrument.amplitude
      * Math.cos(angularSpeed * state.referenceElapsed)
      * Math.exp(-instrument.damping * state.referenceElapsed);
  } else if (state.phase === 'timing') {
    state.trialElapsed += dt;
    state.angle = 0;
  }

  if (!input.toggle) return state;

  if (state.phase === 'reference') {
    state.phase = 'timing';
    state.angle = 0;
    state.trialElapsed = 0;
    state.result = null;
    return state;
  }

  if (state.phase === 'timing') {
    const elapsed = state.trialElapsed;
    const error = elapsed - TARGET_SECONDS;
    const absoluteError = Math.abs(error);
    state.phase = 'result';
    state.result = { elapsed, error, absoluteError };
    state.trials += 1;
    state.totalAbsoluteError += absoluteError;
    state.bestAbsoluteError = state.bestAbsoluteError == null
      ? absoluteError
      : Math.min(state.bestAbsoluteError, absoluteError);
    return state;
  }

  state.phase = 'reference';
  state.angle = instrument.amplitude;
  state.referenceElapsed = 0;
  state.trialElapsed = 0;
  state.result = null;
  return state;
}
