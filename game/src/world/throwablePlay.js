import { clamp } from '../movement/mathUtils.js';
import { throwableDefinition } from './throwables.js';
import { applyPlayerEvent, throwingEffect } from './player.js';

export const THROWABLE_REACH = 1.8;
export const THROWABLE_CHARGE_SECONDS = 1.15;
export const THROWABLE_RELEASE_DELAY = 0.66;
// The Mixamo pickup reaches the ground at about 1.1s and settles into its
// carrying pose at 2.73s. It plays at 1.6x in PlayerAvatar, so these gameplay
// timings put the transfer on the actual hand-contact frame.
export const THROWABLE_PICKUP_SECONDS = 1.71;
export const THROWABLE_PICKUP_TRANSFER = 0.69;

const sources = new Map();
const listeners = new Set();

let state = {
  phase: 'empty',
  heldId: null,
  heldType: null,
  pickupElapsed: 0,
  pickupTaken: false,
  pickupPosition: null,
  pickupSerial: 0,
  charge: 0,
  windup: 0,
  pendingVelocity: null,
  throwSerial: 0,
};

function publish(patch) {
  state = { ...state, ...patch };
  for (const listener of listeners) listener(state);
  return state;
}

export function getThrowablePlay() {
  return state;
}

export function subscribeThrowablePlay(listener) {
  listeners.add(listener);
  listener(state);
  return () => listeners.delete(listener);
}

// Sources report their current world position. Entries are mutated in place
// because carts may move every frame; the small reach scan allocates nothing.
export function reportThrowableSource(id, type, position, take) {
  if (!throwableDefinition(type)) return false;
  const current = sources.get(id);
  if (current) {
    current.type = type;
    current.position[0] = position[0];
    current.position[1] = position[1];
    current.position[2] = position[2];
    current.take = take;
  } else {
    sources.set(id, { id, type, position: [...position], take });
  }
  return true;
}

export function removeThrowableSource(id) {
  sources.delete(id);
}

// Game yaw 0 faces -Z. Prefer an object in front, but allow a broad side
// reach so picking something from a cart edge does not feel fussy.
export function findReachableThrowable(position, yaw, reach = THROWABLE_REACH) {
  const fx = Math.sin(yaw);
  const fz = -Math.cos(yaw);
  let best = null;
  let bestDistance = reach;
  for (const source of sources.values()) {
    const dx = source.position[0] - position[0];
    const dy = source.position[1] - (position[1] + 1);
    const dz = source.position[2] - position[2];
    const distance = Math.hypot(dx, dy * 0.45, dz);
    if (distance >= bestDistance) continue;
    const horizontal = Math.hypot(dx, dz);
    if (horizontal > 0.2 && (dx * fx + dz * fz) / horizontal < -0.15) continue;
    best = source;
    bestDistance = distance;
  }
  return best;
}

export function pickUpThrowable(id) {
  if (state.phase !== 'empty') return false;
  const source = sources.get(id);
  if (!source || !throwableDefinition(source.type)) return false;
  publish({
    phase: 'picking-up',
    heldId: id,
    heldType: source.type,
    pickupElapsed: 0,
    pickupTaken: false,
    pickupPosition: [...source.position],
    pickupSerial: state.pickupSerial + 1,
    charge: 0,
  });
  return true;
}

// Buying something, or taking it out of the pocket, puts it straight in the
// hand: there is no world object to walk over to and no pickup to animate.
export function grantThrowable(type) {
  if (state.phase !== 'empty' || !throwableDefinition(type)) return false;
  publish({
    phase: 'held',
    heldId: null,
    heldType: type,
    pickupElapsed: 0,
    pickupTaken: false,
    pickupPosition: null,
    charge: 0,
  });
  return true;
}

// The inverse. Returns the type so the caller can pocket it; without this the
// only way to empty a hand is to throw what is in it.
export function stowThrowable() {
  if (state.phase !== 'held') return null;
  const type = state.heldType;
  publish({ phase: 'empty', heldId: null, heldType: null, charge: 0 });
  return type;
}

function abandonPickup() {
  publish({
    phase: 'empty',
    heldId: null,
    heldType: null,
    pickupElapsed: 0,
    pickupTaken: false,
    pickupPosition: null,
  });
}

// Keep the source in the scene until the animated fingers reach it. The
// player controller calls this while pickup owns and freezes the body.
export function advanceThrowablePickup(dt) {
  if (state.phase !== 'picking-up') return false;
  const pickupElapsed = Math.min(
    THROWABLE_PICKUP_SECONDS,
    state.pickupElapsed + Math.max(0, dt),
  );
  let pickupTaken = state.pickupTaken;
  if (!pickupTaken && pickupElapsed >= THROWABLE_PICKUP_TRANSFER) {
    const source = sources.get(state.heldId);
    if (!source || source.take?.() === false) {
      abandonPickup();
      return false;
    }
    sources.delete(state.heldId);
    pickupTaken = true;
    publish({ pickupElapsed, pickupTaken: true });
  } else {
    state = { ...state, pickupElapsed };
  }
  if (pickupElapsed >= THROWABLE_PICKUP_SECONDS) {
    if (!pickupTaken) {
      abandonPickup();
      return false;
    }
    publish({
      phase: 'held',
      pickupElapsed: 0,
      pickupTaken: false,
      pickupPosition: null,
    });
  }
  return true;
}

export function beginThrowableCharge() {
  if (state.phase !== 'held') return false;
  publish({ phase: 'charging', charge: 0 });
  return true;
}

// A knockdown cancels a pending gesture without silently deleting an object.
// Untaken pickups return to the source; an object already in hand stays held.
export function interruptThrowablePlay() {
  if (state.phase === 'picking-up') {
    if (!state.pickupTaken) abandonPickup();
    else publish({
      phase: 'held',
      pickupElapsed: 0,
      pickupTaken: false,
      pickupPosition: null,
    });
    return true;
  }
  if (state.phase === 'charging' || state.phase === 'windup') {
    publish({
      phase: 'held',
      charge: 0,
      windup: 0,
      pendingVelocity: null,
    });
    return true;
  }
  return false;
}

export function chargeThrowable(dt) {
  if (state.phase !== 'charging') return state.charge;
  const charge = clamp(state.charge + Math.max(0, dt) / THROWABLE_CHARGE_SECONDS, 0, 1);
  publish({ charge });
  return charge;
}

// The camera supplies the horizontal aim. A small upward bias prevents the
// usual third-person downward view from turning every throw into a dribble.
export function throwAimDirection(direction) {
  const rawX = Number(direction?.x ?? direction?.[0] ?? 0);
  const rawY = Number(direction?.y ?? direction?.[1] ?? 0);
  const rawZ = Number(direction?.z ?? direction?.[2] ?? -1);
  const x = Number.isFinite(rawX) ? rawX : 0;
  const y = Number.isFinite(rawY) ? rawY : 0;
  const z = Number.isFinite(rawZ) ? rawZ : -1;
  const horizontal = Math.hypot(x, z) || 1;
  const up = clamp(y + 0.34, 0.14, 0.62);
  const across = Math.sqrt(1 - up * up);
  return [(x / horizontal) * across, up, (z / horizontal) * across];
}

export function throwableSpeed(charge = state.charge, type = state.heldType) {
  const definition = throwableDefinition(type);
  if (!definition) return 0;
  const eased = 1 - (1 - clamp(charge, 0, 1)) ** 2;
  return definition.throwMin + (definition.throwMax - definition.throwMin) * eased;
}

export function throwableVelocity(direction, charge = state.charge, type = state.heldType) {
  const aimed = throwAimDirection(direction);
  const speed = throwableSpeed(charge, type);
  return aimed.map((component) => component * speed);
}

export function queueThrowableThrow(direction) {
  const definition = throwableDefinition(state.heldType);
  if (state.phase !== 'charging' || !definition) return false;
  const type = state.heldType;
  publish({
    phase: 'windup',
    windup: THROWABLE_RELEASE_DELAY,
    pendingVelocity: throwableVelocity(direction, state.charge, state.heldType),
    throwSerial: state.throwSerial + 1,
  });
  applyPlayerEvent(throwingEffect(type, definition.label));
  return true;
}

// Called by the scene once per physics frame. The object stays on the hand
// until the shared throw clip reaches its release pose, then becomes a body.
export function advanceThrowableThrow(dt, origin) {
  if (state.phase !== 'windup') return null;
  const windup = state.windup - Math.max(0, dt);
  if (windup > 0) {
    state = { ...state, windup };
    return null;
  }
  const launch = {
    id: state.throwSerial,
    sourceId: state.heldId,
    type: state.heldType,
    origin: [...origin],
    velocity: [...state.pendingVelocity],
  };
  publish({
    phase: 'empty',
    heldId: null,
    heldType: null,
    pickupElapsed: 0,
    pickupTaken: false,
    pickupPosition: null,
    charge: 0,
    windup: 0,
    pendingVelocity: null,
  });
  return launch;
}

export function estimateThrowableRange(charge = state.charge, type = state.heldType, height = 1.2) {
  const speed = throwableSpeed(charge, type);
  const up = 0.34 * speed;
  const across = Math.sqrt(Math.max(0, speed * speed - up * up));
  const flight = (up + Math.sqrt(up * up + 2 * 9.81 * height)) / 9.81;
  return across * flight;
}

export function resetThrowablePlayForTests() {
  sources.clear();
  publish({
    phase: 'empty',
    heldId: null,
    heldType: null,
    pickupElapsed: 0,
    pickupTaken: false,
    pickupPosition: null,
    pickupSerial: 0,
    charge: 0,
    windup: 0,
    pendingVelocity: null,
    throwSerial: 0,
  });
}
