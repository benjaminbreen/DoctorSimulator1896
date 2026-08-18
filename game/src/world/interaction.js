// What the player is looking at, and what they are using.
//
// Two pieces of state, kept out of the tuning runtime because they are the
// game's, not the panel's: the affordance in reach this frame, and the
// instrument currently in use. Framework-free and subscribable, so the frame
// loop can write it and React can read it without either owning the other.

const listeners = new Set();

const store = {
  // The affordance within reach, written every frame by PlayerRig.
  reach: null,
  // The instrument in use, or null. Set on entering, cleared on leaving.
  using: null,
  // Armed with Enter: the next click on the world picks something to examine.
  // It lives here because it is a mode of interacting with the world, and
  // because PlayerRig has to know not to spend the same click on anything else.
  picking: false,
};

function notify() {
  for (const listener of listeners) listener(snapshot());
}

function snapshot() {
  return { reach: store.reach, using: store.using, picking: store.picking };
}

export function subscribe(listener) {
  listeners.add(listener);
  listener(snapshot());
  return () => listeners.delete(listener);
}

export function getInteraction() {
  return snapshot();
}

// Seats still need the shared Use action so a touch player can stand again.
// Other focused interactions replace exploration with their own controls.
export function isFocusedInteraction(entry) {
  return Boolean(entry && entry.kind !== 'seat');
}

// Written from the frame loop, so it must not notify unless it changed —
// otherwise every frame re-renders the HUD.
export function setReach(entry) {
  const before = store.reach?.id ?? null;
  const after = entry?.id ?? null;
  if (before === after) return;
  store.reach = entry;
  notify();
}

// Entering, and also updating: the stage works the framing pose out from the
// instrument's own dimensions and calls this again with it. Guarding on id
// would drop that second call, which is how the camera ends up never moving.
//
// The entry carries the running instrument itself. It has to live here rather
// than in a module the scene and the chrome both import, because those two
// sit either side of the canvas and a hot update can leave them holding
// different copies of a module singleton — which shows up as chrome reading a
// null instrument forever while the scene runs one perfectly well.
export function useInstrument(entry) {
  if (store.using === entry) return;
  store.using = entry;
  notify();
}

export function stopUsing() {
  if (!store.using) return;
  store.using = null;
  notify();
}

export function armPicking() {
  if (store.picking || store.using) return;
  store.picking = true;
  notify();
}

export function cancelPicking() {
  if (!store.picking) return;
  store.picking = false;
  notify();
}

/**
 * Affordance for a furniture item, or null. Three tiers:
 *   absent              a table: no prompt at all
 *   kind 'act'          a chair: a verb performed in place
 *   kind 'instrument'   a tachistoscope: the focused instrument mode
 */
export function affordanceOf(item) {
  return item.affordance ?? null;
}

// How close the player must be, and how nearly facing it. A hand's reach
// plus a pace, and a 70-degree cone so a room full of apparatus does not
// offer three prompts at once.
export const REACH = 1.5;
export const FACING = Math.cos(0.62);

// The nearest affordance in reach and roughly in front. `items` is the
// pre-filtered list of items that have one, so this stays cheap per frame.
export function findReachable(items, position, yaw) {
  let best = null;
  let bestDistance = REACH * REACH;
  // Player yaw 0 faces -z, matching the movement code.
  const facingX = -Math.sin(yaw);
  const facingZ = -Math.cos(yaw);
  for (const item of items) {
    const dx = item.position[0] - position[0];
    const dz = item.position[2] - position[2];
    const distance = dx * dx + dz * dz;
    if (distance > bestDistance) continue;
    const length = Math.sqrt(distance) || 1e-6;
    if ((dx / length) * facingX + (dz / length) * facingZ < FACING) continue;
    best = item;
    bestDistance = distance;
  }
  return best;
}
