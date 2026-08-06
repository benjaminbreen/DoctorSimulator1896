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
    'clavicleL', 'clavicleR', 'handL', 'handR', 'thighL', 'thighR'];
  let gesture = null;
  let glanceDir = 1;
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
    const adduct = (v.kneesTogether ?? 0) * 0.6;
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

    // finger tension + tremor jitter (absolute-safe: tiny additive)
    const curl = (procedural ? 0.32 : 0.12) * v.handTension;
    for (const finger of bones.fingers) {
      const base = rest.get(finger);
      if (procedural && base) finger.rotation.copy(base);
      finger.rotation.x += curl * 0.35 + Math.sin(t * 12.7 + finger.id) * 0.012 * v.tremor;
    }
  }

  return { update, captureRest, snapToRest, playGesture, gestureActive: () => gesture?.name || null };
}
