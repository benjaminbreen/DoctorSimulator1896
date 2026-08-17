// Where a piece of money lands when the player lets go of it. The HUD does
// the 3D projection and hands this flat screen-space data; the choice itself
// is pure so it can be tested without a camera.

// A figure is a tall thin target, so the hit box is an ellipse around the
// projected body rather than a circle around the feet.
const HIT_HALF_WIDTH = 60;
const HIT_HALF_HEIGHT = 95;

// Someone must be near enough to hand money to; across the lawn is a drop.
export const OFFER_RANGE = 9;

export function pickDropTarget(point, candidates = []) {
  let best = null;
  let bestScore = 1;
  for (const candidate of candidates) {
    if (!candidate || candidate.behindCamera) continue;
    if (candidate.distance > OFFER_RANGE) continue;
    const dx = (point.x - candidate.screenX) / HIT_HALF_WIDTH;
    const dy = (point.y - candidate.screenY) / HIT_HALF_HEIGHT;
    const score = dx * dx + dy * dy;
    if (score > 1 || score >= bestScore) continue;
    best = candidate;
    bestScore = score;
  }
  return best ? { kind: 'npc', id: best.id, name: best.name } : { kind: 'ground' };
}
