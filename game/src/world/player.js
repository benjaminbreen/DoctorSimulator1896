// What condition the player is in.
//
// Framework-free and subscribable, like the interaction store and the notices:
// the things that change it are simulations running in the frame loop, and
// they should not have to know React exists.
//
// Two scalars, both 0 to 100. Health is better when high; neurasthenia is
// better when low. `fatigue` remains as a compatibility alias while older
// code is moved to the clearer name.
//
// Every change records where it came from. That is not bookkeeping for its own
// sake: this is a game about experiments on people, and being able to say
// "three shocks and a burn, all from the induction coil" is the point.

const listeners = new Set();

export const MAX = 100;
export const PLAYER_EVENT_HISTORY = 40;

const clamp = (value) => Math.min(MAX, Math.max(0, value));

// Recovery per minute of game time, when nothing is making it worse. Slow
// enough that an afternoon of taking shocks is felt for the rest of the day.
const HEALTH_PER_MINUTE = 1.4;
const FATIGUE_PER_MINUTE = 3.5;

let state = fresh();

function fresh() {
  return {
    health: MAX,
    neurasthenia: 0,
    fatigue: 0,
    // Everything that has happened, newest last. Short: this is a record of
    // the day, not a save file.
    log: [],
    // Set while the player is unable to act — knocked down, and coming round.
    downUntil: 0,
    clock: 0,
  };
}

function notify() {
  for (const listener of listeners) listener(state);
}

export function subscribePlayer(listener) {
  listeners.add(listener);
  listener(state);
  return () => listeners.delete(listener);
}

export function getPlayer() {
  return state;
}

export function resetPlayer() {
  state = fresh();
  notify();
}

/**
 * How the player is doing, in words. Bands rather than a number, because a
 * person knows they are shaky, not that they are at sixty-one percent.
 */
export function condition(player = state) {
  const { health } = player;
  const nervous = player.neurasthenia ?? player.fatigue ?? 0;
  if (health <= 15) return 'in a bad way';
  if (health <= 40) return 'badly shaken';
  if (health <= 70) return 'shaken';
  if (nervous >= 80) return 'exhausted';
  if (nervous >= 50) return 'tiring';
  return 'well';
}

export function healthCondition(value = state.health) {
  if (value <= 15) return 'critical';
  if (value <= 40) return 'badly hurt';
  if (value <= 70) return 'shaken';
  if (value < MAX) return 'sound';
  return 'full health';
}

export function neurastheniaCondition(value = state.neurasthenia) {
  if (value >= 80) return 'severe nervous exhaustion';
  if (value >= 60) return 'pronounced nervous strain';
  if (value >= 35) return 'strained';
  if (value > 0) return 'slightly unsettled';
  return 'settled';
}

/**
 * Apply one named game event to either meter. Changes are signed: positive
 * health restores it, while positive neurasthenia increases nervous strain.
 * The log stores the clamped change that actually happened, not the request.
 */
export function applyPlayerEvent({ source = 'unknown', label = source, changes = {}, note = null, down = 0 }) {
  const health = clamp(state.health + (Number(changes.health) || 0));
  const neurasthenia = clamp(state.neurasthenia + (Number(changes.neurasthenia) || 0));
  const applied = {
    health: health - state.health,
    neurasthenia: neurasthenia - state.neurasthenia,
  };
  const changed = applied.health !== 0 || applied.neurasthenia !== 0;
  const downUntil = down > 0 ? Math.max(state.downUntil, state.clock + down) : state.downUntil;

  const event = changed
    ? {
        at: state.clock,
        source,
        label,
        note,
        changes: applied,
        // Old readers can keep working while they migrate to `changes`.
        amount: -applied.health,
        tires: applied.neurasthenia,
      }
    : null;

  if (!event && downUntil === state.downUntil) return { event: null, state };
  state = {
    ...state,
    health,
    neurasthenia,
    fatigue: neurasthenia,
    downUntil,
    log: event ? [...state.log, event].slice(-PLAYER_EVENT_HISTORY) : state.log,
  };
  notify();
  return { event, state };
}

/** Most recent named events that actually changed one meter, newest first. */
export function recentMeterEvents(metric, limit = 3, player = state) {
  if (metric !== 'health' && metric !== 'neurasthenia') return [];
  const count = Math.max(0, Math.floor(limit));
  if (count === 0) return [];
  return player.log
    .filter((event) => event.changes?.[metric])
    .slice(-count)
    .reverse();
}

/**
 * Hurt the player.
 *
 * `amount` is health, `tires` is fatigue, both in points. `source` is the
 * thing that did it and `note` is what it felt like. `down` is seconds the
 * player is off their feet, for a shock hard enough to put them there.
 */
export function harm(options = {}) {
  const {
    amount = 0, tires = 0, source = 'unknown', label = source, note = null, down = 0,
  } = options;
  const nervous = options.neurasthenia ?? tires;
  const before = state.health;
  applyPlayerEvent({
    source,
    label,
    note,
    down,
    changes: { health: -amount, neurasthenia: nervous },
  });
  return { taken: before - state.health, health: state.health };
}

/** Sleep, a meal, an hour in a chair. */
export function recover(options = {}) {
  const {
    health = 0, fatigue = 0, source = 'rest', label = source, note = null,
  } = options;
  const nervous = options.neurasthenia ?? fatigue;
  applyPlayerEvent({
    source,
    label,
    note,
    changes: { health, neurasthenia: -nervous },
  });
  return state;
}

/**
 * Advance the clock. `seconds` is game time, and the drift back toward well is
 * applied here rather than by whoever hurt you — so a shock does not have to
 * know anything about how long it takes to wear off.
 */
export function tickPlayer(seconds) {
  if (seconds <= 0) return state;
  const minutes = seconds / 60;
  const health = clamp(state.health + HEALTH_PER_MINUTE * minutes);
  const neurasthenia = clamp(state.neurasthenia - FATIGUE_PER_MINUTE * minutes);
  const clock = state.clock + seconds;
  // Only notify when something a reader would notice actually moved. This is
  // called every frame.
  const moved = Math.round(health) !== Math.round(state.health)
    || Math.round(neurasthenia) !== Math.round(state.neurasthenia);
  state = { ...state, health, neurasthenia, fatigue: neurasthenia, clock };
  if (moved) notify();
  return state;
}

export function isDown() {
  return state.clock < state.downUntil;
}
