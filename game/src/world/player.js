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

import {
  beginReaction,
  createReactionState,
  reactionLocksMovement,
  stepReaction,
} from './actorReactions.js';

const listeners = new Set();

export const MAX = 100;
export const STARTING_NEURASTHENIA = 65;
export const PLAYER_EVENT_HISTORY = 40;
export const SEAT_REST_SECONDS = 8;
export const SEAT_COOLDOWN_SECONDS = 120;
export const THROW_NEURASTHENIA = 2;
export const NPC_STARTLE_NEURASTHENIA = 3;
export const WATER_WALK_INTERVAL_SECONDS = 2;
export const WATER_WALK_HEALTH_LOSS = 1;
export const PLAYER_AGE = 28;

const clamp = (value) => Math.min(MAX, Math.max(0, value));

let state = fresh();

function fresh() {
  return {
    health: MAX,
    neurasthenia: STARTING_NEURASTHENIA,
    fatigue: STARTING_NEURASTHENIA,
    // Everything that has happened, newest last. Short: this is a record of
    // the day, not a save file.
    log: [],
    // Set while the player is unable to act — knocked down, and coming round.
    downUntil: 0,
    reaction: createReactionState(),
    clock: 0,
    seatCooldowns: {},
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

export function beginPlayerReaction(event) {
  const reaction = beginReaction(
    state.reaction,
    event,
    state.clock,
    { age: PLAYER_AGE },
  );
  if (reaction === state.reaction) return state.reaction;
  state = { ...state, reaction };
  notify();
  return reaction;
}

export function advancePlayerReaction(options) {
  const reaction = stepReaction(state.reaction, state.clock, options);
  if (reaction === state.reaction) return reaction;
  state = { ...state, reaction };
  notify();
  return reaction;
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
  if (value >= 60) return 'frazzled';
  if (value >= 35) return 'strained';
  if (value > 0) return 'slightly unsettled';
  return 'settled';
}

function indefiniteArticle(name) {
  return /^[aeiou]/i.test(name) ? 'an' : 'a';
}

/** Nervous strain from committing to a throw. */
export function throwingEffect(type, itemName = type) {
  const name = String(itemName || 'object').trim().toLowerCase() || 'object';
  return {
    source: `throw:${type || name}`,
    label: `You threw ${indefiniteArticle(name)} ${name} like a reckless madman!`,
    changes: { neurasthenia: THROW_NEURASTHENIA },
  };
}

/** Nervous strain when the player causes an NPC's startle reaction. */
export function npcStartleEffect(npcId = 'unknown') {
  return {
    source: `npc-startle:${npcId}`,
    label: 'You startled a passer-by.',
    changes: { neurasthenia: NPC_STARTLE_NEURASTHENIA },
  };
}

/**
 * Accumulate active wading without writing a health event every frame.
 * Leaving the water clears a partial interval.
 */
export function waterWalkingStep(exposure, seconds, active = true) {
  if (!active) return { exposure: 0, damage: 0 };
  const total = Math.max(0, Number(exposure) || 0) + Math.max(0, Number(seconds) || 0);
  const intervals = Math.floor((total + 1e-9) / WATER_WALK_INTERVAL_SECONDS);
  return {
    exposure: total - intervals * WATER_WALK_INTERVAL_SECONDS,
    damage: intervals * WATER_WALK_HEALTH_LOSS,
  };
}

export function waterWalkingEffect(damage) {
  return {
    source: 'walking-in-water',
    label: 'You waded through cold water.',
    changes: { health: -Math.max(0, Number(damage) || 0) },
  };
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

/** Deterministic recovery for the existing Rest / Pass Time action. */
export function restEffect(hours) {
  const duration = Math.max(0, Math.min(8, Number(hours) || 0));
  return {
    health: Math.min(12, Math.round(duration * 2)),
    neurasthenia: Math.min(45, Math.round(duration * 10)),
  };
}

/** A brief, deliberately chosen rest on one chair or bench. */
export function seatRestEffect(seconds) {
  if ((Number(seconds) || 0) < SEAT_REST_SECONDS) {
    return { health: 0, neurasthenia: 0 };
  }
  return { health: 1, neurasthenia: 4 };
}

/** Apply one seat's rest if it is ready; seats cannot be farmed repeatedly. */
export function recoverFromSeat({ seatId, seconds, label = 'Sat down to rest' }) {
  const effect = seatRestEffect(seconds);
  if (!effect.health && !effect.neurasthenia) {
    return { event: null, state, reason: 'too-short' };
  }
  const lastRest = state.seatCooldowns[seatId];
  if (Number.isFinite(lastRest) && state.clock - lastRest < SEAT_COOLDOWN_SECONDS) {
    return {
      event: null,
      state,
      reason: 'cooldown',
      remaining: SEAT_COOLDOWN_SECONDS - (state.clock - lastRest),
    };
  }
  const healthChange = Math.min(effect.health, MAX - state.health);
  const nervousChange = Math.min(effect.neurasthenia, state.neurasthenia);
  if (!healthChange && !nervousChange) {
    return { event: null, state, reason: 'at-bounds' };
  }
  state = {
    ...state,
    seatCooldowns: { ...state.seatCooldowns, [seatId]: state.clock },
  };
  return applyPlayerEvent({
    source: `seat:${seatId}`,
    label,
    changes: { health: healthChange, neurasthenia: -nervousChange },
  });
}

/** Health and nervous strain from landing with a given downward speed. */
export function fallEffect(impactSpeed) {
  const speed = Math.max(0, Number(impactSpeed) || 0);
  if (speed < 8) return null;
  if (speed < 11) {
    return { amount: 4, neurasthenia: 3, source: 'fall', label: 'Landed hard' };
  }
  if (speed < 15) {
    return { amount: 10, neurasthenia: 6, down: 1, source: 'fall', label: 'Took a bad fall' };
  }
  return { amount: 22, neurasthenia: 12, down: 3, source: 'fall', label: 'Suffered a severe fall' };
}

/** Health and nervous strain from a relative-speed pushcart impact. */
export function pushcartImpactEffect(impactSpeed) {
  const speed = Math.max(0, Number(impactSpeed) || 0);
  if (speed < 4.75) return null;
  if (speed < 7.5) {
    return { amount: 3, neurasthenia: 2, source: 'pushcart', label: 'Struck a pushcart' };
  }
  if (speed < 11.5) {
    return { amount: 7, neurasthenia: 5, down: 0.6, source: 'pushcart', label: 'Collided with a pushcart' };
  }
  return { amount: 12, neurasthenia: 8, down: 1.5, source: 'pushcart', label: 'Hit a pushcart at speed' };
}

/** A horseless carriage is heavy enough that even its street pace is grave. */
export function carriageImpactEffect(impactSpeed) {
  const speed = Math.max(0, Number(impactSpeed) || 0);
  if (speed < 0.8) return null;
  if (speed < 2) {
    return {
      amount: 40,
      neurasthenia: 12,
      down: 3,
      source: 'horseless-carriage',
      label: 'Knocked down by a horseless carriage',
    };
  }
  if (speed < 4.5) {
    return {
      amount: 60,
      neurasthenia: 20,
      down: 6,
      source: 'horseless-carriage',
      label: 'Run down by a horseless carriage',
    };
  }
  return {
    amount: 75,
    neurasthenia: 28,
    down: 9,
    source: 'horseless-carriage',
    label: 'Struck hard by a horseless carriage',
  };
}

/**
 * Advance the player clock. Time alone never restores either meter: recovery
 * must come from an explicit action such as resting, eating, or sitting.
 */
export function tickPlayer(seconds) {
  if (seconds <= 0) return state;
  state = { ...state, clock: state.clock + seconds };
  return state;
}

export function isDown() {
  return state.clock < state.downUntil || reactionLocksMovement(state.reaction);
}
