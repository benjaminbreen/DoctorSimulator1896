import { smoothstep } from './surfaces.js';

// Procedural performance: walk cycle, layered idle, talk, blink, gaze, and
// expression, all written straight onto bone rotations each frame.

export function createAnimator(p, rig, headMesh) {
  const B = rig.bones;
  const rootY0 = rig.joints.Root.y;
  const state = {
    time: 0,
    phase: 0,
    walkBlend: p.animMode === 'walk' ? 1 : 0,
    blinkAt: 1.5,
    blink: 0,
    gazeYaw: 0, gazePitch: 0,
    gazeTargetYaw: 0, gazeTargetPitch: 0,
    gazeAt: 2,
  };

  const zero = () => {
    for (const name of rig.order) B[name].rotation.set(0, 0, 0);
    B.Root.position.y = rootY0;
    B.Root.position.x = 0;
  };

  function update(dt) {
    state.time += dt;
    const t = state.time;
    const walking = p.animMode === 'walk';
    state.walkBlend += ((walking ? 1 : 0) - state.walkBlend) * Math.min(1, dt * 6);
    const wb = state.walkBlend;

    zero();

    // posture: stoop carried in the spine, head compensates
    const stoop = p.posture * 0.35;
    B.Spine1.rotation.x += stoop * 0.5;
    B.Spine2.rotation.x += stoop * 0.35;
    B.Chest.rotation.x += stoop * 0.2;
    B.Neck.rotation.x -= stoop * 0.55;
    B.Head.rotation.x -= stoop * 0.35;

    // ---- walk layer ----
    if (wb > 0.001) {
      const steps = 1.85 * p.walkSpeed;
      state.phase += dt * Math.PI * steps;
      const ph = state.phase;
      const stride = 0.4 * p.stride * wb;

      for (const side of [1, -1]) {
        const S = side > 0 ? 'L' : 'R';
        const legPh = ph + (side > 0 ? 0 : Math.PI);
        const thigh = -Math.sin(legPh) * stride;
        B[`Thigh${S}`].rotation.x = thigh;
        const swing = Math.max(0, Math.sin(legPh + 1.15));
        B[`Shin${S}`].rotation.x = (swing ** 1.5 * 1.05 + 0.08) * wb * p.stride;
        B[`Foot${S}`].rotation.x = (-thigh - B[`Shin${S}`].rotation.x) * 0.55
          + Math.sin(legPh - 0.7) * 0.18 * wb;
        B[`Toe${S}`].rotation.x = Math.max(0, Math.sin(legPh + Math.PI * 0.92)) * 0.35 * wb;

        const armPh = legPh + Math.PI;
        B[`UpperArm${S}`].rotation.x = -Math.sin(armPh) * 0.3 * p.armSwing * wb;
        B[`Forearm${S}`].rotation.x = (-0.16 - Math.max(0, -Math.sin(armPh)) * 0.25) * p.armSwing * wb;
      }

      B.Root.position.y = rootY0 - Math.abs(Math.cos(ph)) * 0.016 * p.bounce * wb;
      B.Root.position.x = Math.sin(ph) * 0.012 * wb;
      B.Root.rotation.z = Math.sin(ph) * 0.045 * wb;
      B.Root.rotation.y = -Math.sin(ph) * 0.08 * p.stride * wb;
      B.Spine1.rotation.y = Math.sin(ph) * 0.05 * wb;
      B.Chest.rotation.y = Math.sin(ph) * 0.07 * wb;
      B.Head.rotation.y += Math.sin(ph) * -0.02 * wb;
      B.Chest.rotation.x += 0.03 * wb; // slight lean into the walk

      // skirt response: front/back at step frequency, sides sway
      B.SkirtF.rotation.x = (-0.04 - Math.max(0, Math.sin(2 * ph)) * 0.07) * wb * p.stride;
      B.SkirtB.rotation.x = (0.03 + Math.max(0, -Math.sin(2 * ph + 0.6)) * 0.05) * wb * p.stride;
      B.SkirtL.rotation.z = Math.sin(ph) * 0.05 * wb;
      B.SkirtR.rotation.z = Math.sin(ph) * 0.05 * wb;
    }

    // ---- idle layer ----
    const idleAmp = p.energy * (1 - wb * 0.65);
    const breathe = Math.sin(t * Math.PI * 2 * 0.24);
    B.Chest.rotation.x += breathe * 0.012 * idleAmp;
    B.ClavicleL.rotation.z = breathe * 0.008 * idleAmp;
    B.ClavicleR.rotation.z = -breathe * 0.008 * idleAmp;
    if (wb < 0.9) {
      const shift = Math.sin(t * Math.PI * 2 * 0.07);
      B.Root.position.x += shift * 0.008 * idleAmp;
      B.Root.rotation.z += shift * 0.012 * idleAmp;
      B.Spine1.rotation.z -= shift * 0.01 * idleAmp;
      B.UpperArmL.rotation.x += Math.sin(t * 0.6) * 0.012 * idleAmp;
      B.UpperArmR.rotation.x += Math.sin(t * 0.6 + 1.7) * 0.012 * idleAmp;
      // relaxed arms hang slightly bent
      B.ForearmL.rotation.x += -0.08;
      B.ForearmR.rotation.x += -0.08;
      B.SkirtL.rotation.z += Math.sin(t * 0.9) * 0.01 * idleAmp;
      B.SkirtR.rotation.z += Math.sin(t * 0.9 + 1.3) * 0.01 * idleAmp;
    }

    // ---- gaze ----
    state.gazeAt -= dt;
    if (state.gazeAt <= 0) {
      state.gazeAt = 1.6 + Math.random() * 3.5 / Math.max(0.2, p.gazeWander);
      state.gazeTargetYaw = (Math.random() - 0.5) * 0.7 * p.gazeWander;
      state.gazeTargetPitch = (Math.random() - 0.5) * 0.2 * p.gazeWander;
    }
    const ease = Math.min(1, dt * 4);
    state.gazeYaw += (state.gazeTargetYaw - state.gazeYaw) * ease;
    state.gazePitch += (state.gazeTargetPitch - state.gazePitch) * ease;
    B.Head.rotation.y += state.gazeYaw * 0.6;
    B.Head.rotation.x += state.gazePitch * 0.6;
    B.Neck.rotation.y += state.gazeYaw * 0.25;
    const eyeYaw = Math.max(-0.35, Math.min(0.35, state.gazeTargetYaw - state.gazeYaw * 0.6));
    B.EyeL.rotation.y = eyeYaw;
    B.EyeR.rotation.y = eyeYaw;

    // ---- blink ----
    state.blinkAt -= dt;
    if (state.blinkAt <= 0) {
      state.blinkAt = (1.4 + Math.random() * 4) / Math.max(0.15, p.blinkRate);
      state.blink = 0.22; // seconds remaining
    }
    let lid = 0;
    if (state.blink > 0) {
      state.blink -= dt;
      const bt = 1 - Math.max(0, state.blink) / 0.22;
      lid = bt < 0.4 ? bt / 0.4 : 1 - (bt - 0.4) / 0.6;
    }
    B.LidL.rotation.x = lid * 1.05;
    B.LidR.rotation.x = lid * 1.05;

    // ---- talk and expression ----
    let jaw = 0;
    if (p.animMode === 'talk') {
      jaw = Math.max(0, 0.05 + 0.10 * Math.sin(t * Math.PI * 2 * 4.2) + 0.08 * Math.sin(t * Math.PI * 2 * 6.3 + 1.2));
      B.Head.rotation.x += Math.sin(t * 1.9) * 0.02;
      B.Head.rotation.y += Math.sin(t * 1.3) * 0.03;
    }
    B.Jaw.rotation.x = jaw;

    const expr = p.expression;
    if (headMesh?.morphTargetInfluences) {
      headMesh.morphTargetInfluences[0] = Math.max(0, expr);
      headMesh.morphTargetInfluences[1] = Math.max(0, -expr);
    }
    const browLift = Math.max(0, expr) * 0.004 + smoothstep(0.4, 1, Math.max(0, expr)) * 0.002;
    const browKnit = Math.max(0, -expr);
    for (const S of ['L', 'R']) {
      const brow = B[`Brow${S}`];
      if (brow.userData.bindY === undefined) brow.userData.bindY = brow.position.y;
      brow.position.y = brow.userData.bindY + browLift * p.height - browKnit * 0.003 * p.height;
      brow.rotation.z = (S === 'L' ? -1 : 1) * browKnit * 0.18;
    }
  }

  return { update, state };
}
