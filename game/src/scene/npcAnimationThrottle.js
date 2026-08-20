const NEAR_DISTANCE_SQUARED = 25 ** 2;
const FREEZE_DISTANCE_SQUARED = 60 ** 2;
const MID_DISTANCE_STRIDE = 3;

// Distant skeletons keep the right animation speed, but pay for pose
// evaluation less often. Hidden and very distant figures hold their pose.
export function updateNpcAnimation(actor, delta, distanceSquared, frame, offset = 0, active = true) {
  if (!active || distanceSquared >= FREEZE_DISTANCE_SQUARED) {
    actor.animationPending = 0;
    return false;
  }
  actor.animationPending = Math.min((actor.animationPending ?? 0) + delta, 0.3);
  const stride = distanceSquared < NEAR_DISTANCE_SQUARED ? 1 : MID_DISTANCE_STRIDE;
  if (stride > 1 && (frame + offset) % stride !== 0) return false;
  actor.mixer.update(actor.animationPending);
  actor.animationPending = 0;
  return true;
}
