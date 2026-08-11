import * as THREE from 'three';


const BODY_KEYS = [
  'pelvis', 'spine01', 'spine02', 'spine03', 'neck', 'head',
  'clavicleL', 'clavicleR', 'upperarmL', 'upperarmR',
  'lowerarmL', 'lowerarmR', 'handL', 'handR',
  'thighL', 'thighR', 'calfL', 'calfR', 'footL', 'footR',
];

const copyTransform = (object) => ({
  position: object.position.clone(),
  quaternion: object.quaternion.clone(),
  scale: object.scale.clone(),
});

function capturePose(objects) {
  return new Map(objects.map((object) => [object, copyTransform(object)]));
}

function restorePose(pose) {
  for (const [object, transform] of pose) {
    object.position.copy(transform.position);
    object.quaternion.copy(transform.quaternion);
    object.scale.copy(transform.scale);
  }
}

function smootherStep(value) {
  const t = THREE.MathUtils.clamp(value, 0, 1);
  return t * t * t * (t * (t * 6 - 15) + 10);
}

function trackedObjects(root, bones, clips) {
  const objects = new Set(bones.all || []);
  for (const clip of clips) {
    for (const track of clip.tracks) {
      const nodeName = track.name.slice(0, track.name.lastIndexOf('.'));
      const object = root.getObjectByName(nodeName);
      if (object && !object.isMesh) objects.add(object);
    }
  }
  return [...objects];
}

function sampleClipPose(root, clip, objects, time = 0) {
  const sampled = capturePose(objects);
  const byName = new Map(objects.map((object) => [object.name, object]));
  const sampleTime = THREE.MathUtils.clamp(time, 0, clip.duration);
  for (const track of clip.tracks) {
    const separator = track.name.lastIndexOf('.');
    const object = byName.get(track.name.slice(0, separator));
    const transform = object ? sampled.get(object) : null;
    if (!transform) continue;
    const property = track.name.slice(separator + 1);
    const value = track.createInterpolant().evaluate(sampleTime);
    if (property === 'position') transform.position.fromArray(value);
    else if (property === 'quaternion') transform.quaternion.fromArray(value).normalize();
    else if (property === 'scale') transform.scale.fromArray(value);
  }
  return sampled;
}

function feetCentre(bones) {
  if (!bones.footL || !bones.footR) return null;
  return bones.footL.getWorldPosition(new THREE.Vector3())
    .add(bones.footR.getWorldPosition(new THREE.Vector3()))
    .multiplyScalar(0.5);
}

function localDelta(parent, fromWorld, toWorld) {
  if (!parent) return toWorld.clone().sub(fromWorld);
  parent.updateMatrixWorld(true);
  return parent.worldToLocal(toWorld.clone()).sub(parent.worldToLocal(fromWorld.clone()));
}

/* Renderer B's approved sit-to-stand is a live pose blend rather than a baked
   clip. Renderer C uses the same approach: capture the exact visible seated
   pose, slerp to its authored standing rest, and anchor the feet in world space. */
export function createRendererCMotionController(root, bones, clips) {
  const standingClip = clips.find((clip) => clip.name === 'StandingIdle');
  if (!root || !standingClip || !bones?.pelvis || !bones?.footL || !bones?.footR) return null;
  const objects = trackedObjects(root, bones, [standingClip]);
  const rigNode = root.getObjectByName('Patient_Rig') || bones.pelvis.parent;
  if (rigNode && !objects.includes(rigNode)) objects.push(rigNode);
  const standingPose = sampleClipPose(root, standingClip, objects, 0);
  const standingRig = rigNode ? standingPose.get(rigNode) : null;
  let transition = null;
  let currentSeated = 1;
  let activeName = null;
  let standingOffset = new THREE.Vector3();

  function interpolatePose(start, amount) {
    for (const object of objects) {
      const from = start.get(object);
      const to = standingPose.get(object);
      if (!from || !to) continue;
      object.position.lerpVectors(from.position, to.position, amount);
      object.quaternion.slerpQuaternions(from.quaternion, to.quaternion, amount);
      object.scale.lerpVectors(from.scale, to.scale, amount);
    }

    // Transfer the MHR balance shift: the trunk moves over the planted feet
    // during lift-off, then returns to neutral before the standing idle begins.
    const balance = Math.sin(amount * Math.PI) ** 1.35;
    bones.spine01?.rotateX(-0.13 * balance);
    bones.spine03?.rotateX(-0.075 * balance);
    root.updateMatrixWorld(true);

    // Keep the gaze level while the trunk moves over the planted feet. Resolve
    // the desired world orientation back into the head's local quaternion
    // after applying the spine balance correction.
    if (bones.head && transition?.headFrom && transition?.headTo) {
      const desiredHeadWorld = transition.headFrom.clone().slerp(transition.headTo, amount);
      const parentWorld = bones.head.parent?.getWorldQuaternion(new THREE.Quaternion())
        || new THREE.Quaternion();
      bones.head.quaternion.copy(parentWorld.invert().multiply(desiredHeadWorld));
      root.updateMatrixWorld(true);
    }

    if (transition?.feet && rigNode) {
      const actual = feetCentre(bones);
      if (actual) {
        rigNode.position.add(localDelta(rigNode.parent, actual, transition.feet));
        root.updateMatrixWorld(true);
      }
      if (standingRig) standingOffset.copy(rigNode.position).sub(standingRig.position);
    }
  }

  function startStanding(next = 'StandingIdle', duration = 2.5) {
    if (transition) transition.next = next;
    if (currentSeated < 0.001 && !transition) {
      activeName = next;
      return false;
    }
    root.updateMatrixWorld(true);
    const start = capturePose(objects);
    const headFrom = bones.head?.getWorldQuaternion(new THREE.Quaternion()) || null;
    restorePose(standingPose);
    root.updateMatrixWorld(true);
    const headTo = bones.head?.getWorldQuaternion(new THREE.Quaternion()) || null;
    restorePose(start);
    root.updateMatrixWorld(true);
    transition = {
      start,
      feet: feetCentre(bones),
      headFrom,
      headTo,
      elapsed: 0,
      duration: THREE.MathUtils.clamp(Number(duration) || 2.5, 1.4, 4),
      next,
    };
    currentSeated = 1;
    activeName = 'StandUp';
    standingOffset.set(0, 0, 0);
    return true;
  }

  function setTransitionProgress(progress) {
    if (!transition) return null;
    const eased = smootherStep(progress);
    currentSeated = 1 - eased;
    interpolatePose(transition.start, eased);
    if (progress < 1) return null;
    const next = transition.next;
    transition = null;
    currentSeated = 0;
    activeName = next;
    return next;
  }

  function update(delta) {
    if (!transition) return null;
    // Loading the identity grid or resuming a background browser tab can yield
    // a multi-second Clock delta. Treat that as a pause, not as elapsed motion,
    // or the patient teleports from the chair to the standing endpoint.
    const frameDelta = THREE.MathUtils.clamp(Number(delta) || 0, 0, 1 / 15);
    transition.elapsed = Math.min(transition.duration, transition.elapsed + frameDelta);
    return setTransitionProgress(transition.elapsed / transition.duration);
  }

  function snapSeated() {
    transition = null;
    currentSeated = 1;
    activeName = null;
    standingOffset.set(0, 0, 0);
  }

  function prepareStandingClip(name) {
    transition = null;
    currentSeated = 0;
    activeName = name;
  }

  function applyClipOffset() {
    if (!rigNode || currentSeated > 0.001 || standingOffset.lengthSq() < 1e-10) return;
    rigNode.position.add(standingOffset);
    root.updateMatrixWorld(true);
  }

  return {
    startStanding,
    setTransitionProgress,
    update,
    snapSeated,
    prepareStandingClip,
    applyClipOffset,
    get activeName() { return activeName; },
    get currentSeated() { return currentSeated; },
    get isTransitioning() { return transition != null; },
    get standingOffset() { return standingOffset.clone(); },
  };
}
