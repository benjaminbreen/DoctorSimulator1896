import * as THREE from 'three';

/* Layered procedural idle + one-shot gestures, tunable live from preset values.
   Modes:
   - 'procedural': the mixer holds frame 0 (the authored pose); every controlled
     bone is written absolutely as rest + offsets, so all sliders act instantly.
   - 'clip' / 'clip+procedural': a baked GLB clip plays; only additive layers that
     do not fight the clip (gaze, tremor, hand tension, gestures) are applied.
*/

const noise = (t, a, b, c) => (Math.sin(t * a) + Math.sin(t * b + 1.7) + Math.sin(t * c + 4.2)) / 3;

const GESTURES = {
  nod: { duration: 1.7 },
  shake: { duration: 1.9 },
  sigh: { duration: 2.9 },
  glance: { duration: 3.4 },
};

export function createIdle(bones) {
  const rest = new Map();
  const controlled = ['pelvis', 'spine01', 'spine02', 'spine03', 'neck', 'head',
    'clavicleL', 'clavicleR', 'upperarmL', 'upperarmR', 'lowerarmL', 'lowerarmR',
    'handL', 'handR', 'thighL', 'thighR'];
  let gesture = null;
  let glanceDir = 1;
  let seatedHandBlend = null;
  const saccade = { targetY: 0, targetX: 0, currentY: 0, currentX: 0, nextAt: 0 };

  function captureRest() {
    rest.clear();
    for (const bone of bones.all) rest.set(bone, bone.rotation.clone());
  }

  function snapToRest() {
    for (const [bone, euler] of rest) bone.rotation.copy(euler);
  }

  function playGesture(name, speed = 1) {
    if (!GESTURES[name]) return;
    glanceDir = Math.random() < 0.5 ? -1 : 1;
    gesture = { name, t0: performance.now() / 1000, duration: GESTURES[name].duration / speed };
  }

  const envelope = (tt) => Math.sin(Math.min(1, Math.max(0, tt)) * Math.PI) ** 1.35;

  function skeletonRoot() {
    let root = bones.pelvis || bones.head;
    while (root?.parent) root = root.parent;
    return root;
  }

  function aimBoneToward(bone, child, target, root) {
    if (!bone || !child || !root) return;
    root.updateMatrixWorld(true);
    const origin = bone.getWorldPosition(new THREE.Vector3());
    const current = child.getWorldPosition(new THREE.Vector3()).sub(origin);
    const desired = target.clone().sub(origin);
    if (current.lengthSq() < 1e-7 || desired.lengthSq() < 1e-7) return;
    current.normalize(); desired.normalize();
    const worldRotation = bone.getWorldQuaternion(new THREE.Quaternion());
    const delta = new THREE.Quaternion().setFromUnitVectors(current, desired);
    const desiredWorld = delta.multiply(worldRotation);
    const parentWorld = bone.parent?.getWorldQuaternion(new THREE.Quaternion()) || new THREE.Quaternion();
    bone.quaternion.copy(parentWorld.invert().multiply(desiredWorld));
    root.updateMatrixWorld(true);
  }

  function poseSeatedHands(v, blend, t) {
    const root = skeletonRoot();
    if (!root || !bones.pelvis) return;
    root.updateMatrixWorld(true);
    const pelvis = bones.pelvis.getWorldPosition(new THREE.Vector3());
    const right = new THREE.Vector3(1, 0, 0).transformDirection(root.matrixWorld).setY(0).normalize();
    const forward = new THREE.Vector3(0, 0, 1).transformDirection(root.matrixWorld).setY(0).normalize();
    const up = new THREE.Vector3(0, 1, 0);
    const openness = THREE.MathUtils.clamp(Number(v.armOpenness) || 0, -1, 1);
    const bend = THREE.MathUtils.clamp(v.elbowBend ?? 0.68, 0, 1);
    const asymmetry = THREE.MathUtils.clamp(Number(v.armAsymmetry) || 0, -1, 1);
    const fidget = THREE.MathUtils.clamp(Number(v.fidget) || 0, 0, 3);
    const foldedHeight = THREE.MathUtils.clamp(Number(v.foldedHandHeight) || 0, -0.14, 0.14);
    const foldedForward = THREE.MathUtils.clamp(Number(v.foldedHandForward) || 0, -0.14, 0.14);
    const foldedSpread = THREE.MathUtils.clamp(Number(v.foldedHandSpread) || 1, 0.55, 1.45);

    for (const side of ['L', 'R']) {
      const upper = bones[`upperarm${side}`];
      const lower = bones[`lowerarm${side}`];
      const hand = bones[`hand${side}`];
      const thigh = bones[`thigh${side}`];
      const calf = bones[`calf${side}`];
      if (!upper || !lower || !hand || !thigh || !calf) continue;
      root.updateMatrixWorld(true);
      const shoulder = upper.getWorldPosition(new THREE.Vector3());
      const elbow = lower.getWorldPosition(new THREE.Vector3());
      const wrist = hand.getWorldPosition(new THREE.Vector3());
      const hip = thigh.getWorldPosition(new THREE.Vector3());
      const knee = calf.getWorldPosition(new THREE.Vector3());
      const sideSign = Math.sign(shoulder.clone().sub(pelvis).dot(right)) || (side === 'R' ? 1 : -1);
      const phase = side === 'R' ? 0.4 : 2.7;
      const idleLift = Math.sin(t * 0.83 + phase) * 0.004 * fidget;
      const idleForward = Math.sin(t * 0.57 + phase * 1.3) * 0.003 * fidget;
      const upperLength = Math.max(0.18, shoulder.distanceTo(elbow));

      const kneeElbow = shoulder.clone()
        .addScaledVector(up, -upperLength * (0.79 - openness * 0.04))
        .addScaledVector(forward, upperLength * (0.18 + bend * 0.12) + idleForward)
        .addScaledVector(right, sideSign * (0.025 + openness * 0.035));
      const foldedElbow = shoulder.clone()
        .addScaledVector(up, -upperLength * (0.76 - openness * 0.04))
        .addScaledVector(forward, upperLength * (0.27 + bend * 0.16) + idleForward)
        .addScaledVector(right, sideSign * (0.008 + openness * 0.035));
      const elbowTarget = kneeElbow.lerp(foldedElbow, blend);
      aimBoneToward(upper, lower, elbowTarget, root);

      const kneeHand = hip.clone().lerp(knee, 0.70)
        .addScaledVector(up, 0.085 + idleLift)
        .addScaledVector(forward, 0.018 + idleForward)
        .addScaledVector(right, sideSign * (0.012 + openness * 0.025));
      // Folded hands are deliberately layered rather than interlaced. The
      // vertical and fore-aft stagger keeps fingers from sharing one volume.
      const foldedStagger = sideSign > 0 ? 1 : -1;
      const foldedHand = pelvis.clone()
        .addScaledVector(up, 0.105 + foldedHeight + foldedStagger * 0.024 + idleLift)
        .addScaledVector(forward, 0.275 + foldedForward - foldedStagger * 0.014 + idleForward)
        .addScaledVector(right, sideSign * (0.042 * foldedSpread + openness * 0.040) + asymmetry * 0.025);
      const handTarget = kneeHand.lerp(foldedHand, blend);
      aimBoneToward(lower, hand, handTarget, root);

      root.updateMatrixWorld(true);
      const fingerRoot = bones.fingerRoots?.[side];
      if (fingerRoot) {
        const kneeDirection = knee.clone().sub(hip).normalize();
        const foldedDirection = right.clone().multiplyScalar(-sideSign)
          .addScaledVector(forward, 0.28).normalize();
        const fingerDirection = kneeDirection.lerp(foldedDirection, blend).normalize();
        const handOrigin = hand.getWorldPosition(new THREE.Vector3());
        aimBoneToward(hand, fingerRoot, handOrigin.addScaledVector(fingerDirection, 0.20), root);
      }
      hand.rotateZ((Number(v.wristAngle) || 0) * 0.14 + sideSign * blend * 0.035);
    }
    root.updateMatrixWorld(true);
  }

  function gestureOffsets(t, v, apply) {
    if (!gesture) return;
    const tt = (t - gesture.t0) / gesture.duration;
    if (tt >= 1) { gesture = null; return; }
    const e = envelope(tt);
    switch (gesture.name) {
      case 'nod':
        apply('head', 'x', e * 0.16 * Math.sin(tt * Math.PI * 3));
        break;
      case 'shake':
        apply('head', 'y', e * 0.13 * Math.sin(tt * Math.PI * 4));
        break;
      case 'sigh': {
        const inhale = Math.sin(Math.min(1, tt * 1.6) * Math.PI);
        const drop = THREE.MathUtils.smoothstep(tt, 0.55, 1);
        apply('spine02', 'x', inhale * 0.035 - drop * 0.02);
        apply('spine03', 'x', -inhale * 0.03 + drop * 0.024);
        apply('clavicleL', 'z', inhale * 0.05 - drop * 0.035);
        apply('clavicleR', 'z', -inhale * 0.05 + drop * 0.035);
        apply('head', 'x', drop * 0.06);
        break;
      }
      case 'glance': {
        const hold = THREE.MathUtils.smoothstep(tt, 0.05, 0.3) * (1 - THREE.MathUtils.smoothstep(tt, 0.62, 0.95));
        apply('head', 'y', hold * 0.44 * glanceDir);
        apply('head', 'x', hold * -0.03);
        break;
      }
    }
  }

  function update(dt, t, v, mode) {
    const procedural = mode === 'procedural';
    const targetHandBlend = v.seatedHandPose === 'hands-on-knees' ? 0 : 1;
    if (seatedHandBlend == null) seatedHandBlend = targetHandBlend;
    else seatedHandBlend += (targetHandBlend - seatedHandBlend) * (1 - Math.exp(-dt * 5.2));

    // saccadic gaze retargeting
    if (t >= saccade.nextAt) {
      const big = Math.random() < 0.18;
      const drift = Math.min(v.gazeDrift, 1.5); // keep large slider values from spinning the head
      saccade.targetY = (Math.random() - 0.5) * (big ? 0.5 : 0.22) * drift * 2;
      saccade.targetX = (Math.random() - 0.5) * 0.1 * drift * 2;
      saccade.nextAt = t + THREE.MathUtils.lerp(1.6, 5.2, Math.random());
    }
    const ease = 1 - Math.exp(-dt * 7);
    saccade.currentY += (saccade.targetY - saccade.currentY) * ease;
    saccade.currentX += (saccade.targetX - saccade.currentX) * ease;

    const offsets = new Map();
    const apply = (key, axis, amount) => {
      const bone = bones[key];
      if (!bone || !amount) return;
      const entry = offsets.get(bone) || { x: 0, y: 0, z: 0 };
      entry[axis] += amount;
      offsets.set(bone, entry);
    };

    if (procedural) {
      const phase = t * Math.PI * 2 * (v.breathingRate / 60);
      const breath = Math.sin(phase) * v.breathing;
      apply('spine02', 'x', breath * 0.022);
      apply('spine03', 'x', -breath * 0.03);
      apply('clavicleL', 'z', breath * 0.02);
      apply('clavicleR', 'z', -breath * 0.02);
      apply('neck', 'x', breath * 0.006);

      const shift = noise(t * 0.09, 1, 0.47, 0.23) * v.weightShift;
      apply('pelvis', 'y', shift * 0.03);
      apply('spine01', 'z', -shift * 0.022);
      apply('spine03', 'z', shift * 0.014);

      apply('spine03', 'x', v.posture * -0.06);
      apply('head', 'y', v.headTurn);
      apply('head', 'z', v.headTilt);

      apply('head', 'y', noise(t * 0.5, 1.1, 0.63, 0.29) * 0.024 * v.fidget);
      apply('head', 'z', noise(t * 0.5 + 9, 0.9, 0.5, 0.31) * 0.014 * v.fidget);
      apply('handL', 'z', noise(t * 0.7, 1.2, 0.7, 0.4) * 0.05 * v.fidget);
      apply('handR', 'z', noise(t * 0.7 + 3, 1.15, 0.62, 0.44) * -0.05 * v.fidget);
    }

    // layers safe in every mode
    // knee adduction: measured live — thigh_l local +z / thigh_r local −z bring
    // the knees together over the exported seated pose (decorum slider)
    const seatedAmount = (v.seated ?? 1) >= 0.5 ? 1 : 0;
    const adduct = (v.kneesTogether ?? 0) * 0.64 * seatedAmount;
    apply('thighL', 'z', adduct);
    apply('thighR', 'z', -adduct);
    apply('head', 'y', saccade.currentY * (procedural ? 1 : 0.55));
    apply('head', 'x', saccade.currentX * (procedural ? 1 : 0.55));
    const tremorWave = Math.sin(t * 11.4) + Math.sin(t * 17.1 + 2.2) * 0.6;
    apply('handL', 'x', tremorWave * 0.024 * v.tremor);
    apply('handR', 'x', -tremorWave * 0.022 * v.tremor);
    gestureOffsets(t, v, apply);

    if (procedural) {
      for (const key of controlled) {
        const bone = bones[key];
        if (!bone) continue;
        const base = rest.get(bone);
        if (base) bone.rotation.copy(base);
      }
    }
    for (const [bone, delta] of offsets) {
      bone.rotation.x += delta.x; bone.rotation.y += delta.y; bone.rotation.z += delta.z;
    }

    if (procedural && (v.seated ?? 1) >= 0.5) poseSeatedHands(v, seatedHandBlend, t);

    // finger tension + tremor jitter (absolute-safe: tiny additive)
    const curl = (procedural ? 0.14 + 0.46 * v.handTension + seatedHandBlend * 0.06 : 0.12 * v.handTension);
    for (const finger of bones.fingers) {
      const base = rest.get(finger);
      if (base) finger.rotation.copy(base);
      const segment = Number(finger.name.match(/(?:_0|(?:index|middle|ring|pinky))([1-3])(?:_[lr])?$/i)?.[1] || 1);
      const segmentFactor = [0, 0.42, 0.66, 0.52][segment];
      finger.rotation.x += curl * segmentFactor + Math.sin(t * 12.7 + finger.id) * 0.012 * v.tremor;
    }
    for (const thumb of bones.thumbs || []) {
      const base = rest.get(thumb);
      if (base) thumb.rotation.copy(base);
      const segment = Number(thumb.name.match(/(?:_0|thumb)([1-3])(?:_[lr])?$/i)?.[1] || 1);
      thumb.rotation.x += curl * [0, 0.20, 0.34, 0.28][segment];
    }
  }

  return {
    update, captureRest, snapToRest, playGesture,
    gestureActive: () => gesture?.name || null,
    get seatedHandBlend() { return seatedHandBlend; },
  };
}
