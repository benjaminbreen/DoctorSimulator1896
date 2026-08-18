// Where the camera stands to look closely at a thing, and how far the wheel
// may pull it back.
//
// A long lens close in is what puts the room out of focus behind the object:
// the depth-of-field pass keys off this same target, so the framing and the
// bokeh are the one decision. Distance is a multiplier on the framing radius
// rather than a field of view, because a specimen should turn under the eye,
// not swell and shrink.

const FOV = 30;
const MIN_DISTANCE = 0.6;
const MAX_DISTANCE = 2.6;
// How far above the object's own height the eye starts. You look down at a
// thing on a table, not level with it.
const LIFT = 0.42;

let distance = 1;

export function resetExamineDistance() {
  distance = 1;
}

export function adjustExamineDistance(delta) {
  // Multiplicative, so a notch moves the eye by the same fraction whether it
  // is over a glove or over a bookcase.
  distance = Math.min(MAX_DISTANCE, Math.max(MIN_DISTANCE, distance * Math.exp(delta)));
}

export function examineDistance() {
  return distance;
}

function clamp(value, low, high) {
  return Math.min(high, Math.max(low, value));
}

/**
 * The camera pose for examining `item`, seen from where the player stands.
 *
 * `focus` and `span` ride on the affordance so a piece whose visible mass is
 * not its body centre (a bouquet over a vase) can say so without the framing
 * having to guess from a collider.
 */
export function examineFraming(item, viewer) {
  const [fx, fy, fz] = item.affordance?.focus ?? [0, 0, 0];
  const target = [item.position[0] + fx, item.position[1] + fy, item.position[2] + fz];
  const span = item.affordance?.span ?? Math.max(...(item.size ?? [0.2, 0.2, 0.2]));
  let radius = clamp(span * 3.2, 0.32, 4);

  // Stand off along the line the player already occupies, so stepping into the
  // examination does not spin the object out from under them.
  const dxRaw = viewer[0] - target[0];
  const dzRaw = viewer[2] - target[2];
  const flat = Math.hypot(dxRaw, dzRaw);
  let dx = dxRaw;
  let dz = dzRaw;
  if (flat < 1e-4) {
    dx = 0;
    dz = 1;
  } else {
    dx /= flat;
    dz /= flat;
  }
  // Never stand further off than the player already is: a wall examined from
  // four metres would put the eye through the wall behind them.
  radius = Math.min(radius, Math.hypot(flat, viewer[1] - target[1]) + 0.4);
  const scale = radius / Math.hypot(1, LIFT);
  return {
    position: [target[0] + dx * scale, target[1] + LIFT * scale, target[2] + dz * scale],
    target,
    fov: FOV,
    radius,
  };
}
