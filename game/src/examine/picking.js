// What the player clicked on.
//
// The ray is cast against the rendered scene, but the answer comes from the
// simulation: the hit point is matched against the world's own item list, so a
// click resolves to the bench or the boulder the builders placed rather than
// to whichever mesh happened to be in front. Pure, so it can be tested without
// a renderer.

// How far outside its own box a thing may still claim a click, and how far a
// click may reach for a candidate that contains nothing.
const PAD = 0.25;
const REACH = 1.2;

function volume(size) {
  return Math.max(1e-6, size[0] * size[1] * size[2]);
}

function contains(candidate, point) {
  const [px, py, pz] = candidate.position;
  const [sx, sy, sz] = candidate.size;
  return Math.abs(point[0] - px) <= sx / 2 + PAD
    && Math.abs(point[1] - py) <= sy / 2 + PAD
    && Math.abs(point[2] - pz) <= sz / 2 + PAD;
}

/** Items that are actually in the world to be looked at. */
export function pickableItems(items) {
  return items.filter((item) => item.render !== false
    && item.kind !== 'block-infill'
    && item.kind !== 'wallArt'
    && Array.isArray(item.size)
    && Array.isArray(item.position));
}

/**
 * The candidate a click at `point` lands on, or null for open ground.
 *
 * A thing whose box contains the point wins over one that merely sits near it,
 * and the smallest of those wins — clicking a bottle standing on a bench
 * should give the bottle, not the bench, and not the building behind both.
 */
export function pickSubject(candidates, point) {
  let best = null;
  let bestVolume = Infinity;
  for (const candidate of candidates) {
    if (!contains(candidate, point)) continue;
    const size = volume(candidate.size);
    if (size < bestVolume) {
      best = candidate;
      bestVolume = size;
    }
  }
  if (best) return best;

  let nearest = null;
  let nearestDistance = REACH * REACH;
  for (const candidate of candidates) {
    const [px, py, pz] = candidate.position;
    const distance = (point[0] - px) ** 2 + (point[1] - py) ** 2 + (point[2] - pz) ** 2;
    if (distance < nearestDistance) {
      nearest = candidate;
      nearestDistance = distance;
    }
  }
  return nearest;
}

/**
 * What a click that hit nothing in the item list is standing on. The park's
 * water body is the only surface worth telling apart from plain ground.
 */
export function surfaceClassAt(point, water) {
  if (!water) return 'ground';
  if (Math.abs(point[1] - water.level) > 0.4) return 'ground';
  return insideOutline(water.outline, point[0], point[2]) ? 'water' : 'ground';
}

function insideOutline(outline, x, z) {
  let inside = false;
  for (let i = 0, j = outline.length - 1; i < outline.length; j = i, i += 1) {
    const [xi, zi] = outline[i];
    const [xj, zj] = outline[j];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}
