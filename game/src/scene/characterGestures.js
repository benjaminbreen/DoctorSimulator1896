import * as THREE from 'three';

// A clamped LoopOnce action retains its final root transform. Fading a
// previously faded idle back in can leave that root transform briefly in
// charge, which is especially visible when two Mixamo exports disagree about
// their armature basis: the whole character appears to fall onto its face.
// Stop the one-shot outright and evaluate a full-weight looping idle now.
export function restoreLoopingIdle(mixer, idle, oneShot = null) {
  oneShot?.stop();
  idle.reset();
  idle.enabled = true;
  idle.paused = false;
  idle.setLoop(THREE.LoopRepeat, Infinity);
  idle.setEffectiveTimeScale(1);
  idle.setEffectiveWeight(1);
  idle.play();
  mixer.update(0);
  return idle;
}
