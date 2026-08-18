import * as THREE from 'three';

// Procedural motion layered over the baked consultation clips, written after
// the mixer each frame: the patient looks at the doctor and away again on her
// own rhythm, breathes at a rate the simulation sets, trembles if the record
// says she trembles, and performs an examination gesture when asked. The
// clips stay untouched; everything here is a delta on this frame's pose.

const BONE_SUFFIXES = {
  spine: 'spine',
  neck: 'neck',
  head: 'head',
  spine2: 'spine2',
  rightArm: 'rightarm',
  rightForeArm: 'rightforearm',
  rightHand: 'righthand',
  rightMiddle: 'righthandmiddle1',
  leftArm: 'leftarm',
  leftForeArm: 'leftforearm',
  leftHand: 'lefthand',
  leftMiddle: 'lefthandmiddle1',
};

// Breathing display rates per expression, breaths per minute. Display only:
// the clinical measurement lives in the patient record, not here.
const BREATH_RATES = {
  distressed: 20,
  fatigued: 16,
  default: 14,
};

// A gesture holds this long, then eases back to the clip.
const GESTURE_HOLD_SECONDS = 10;
// How gently a presented forearm turns to show the inner wrist.
const PRESENT_SUPINATION = 0.8;

// Examination gestures, by cue id. Targets are fractions of the arm's own
// segment lengths along world axes: `drop` down from the shoulder, `reach`
// toward the doctor, `lift` up from the elbow for the hand.
// `spread` pushes the arm outward from the camera line so an extended arm
// keeps its silhouette instead of foreshortening into the lens.
const GESTURES = {
  'present-wrist': {
    sides: ['right'],
    elbow: { drop: 0.38, reach: 0.62 },
    hand: { reach: 1.0, lift: 0.14 },
    spread: 0.25,
    supinate: true,
    watchHand: true,
  },
  'extend-both-arms': {
    sides: ['right', 'left'],
    elbow: { drop: 0.2, reach: 0.82 },
    hand: { reach: 1.02, lift: 0.06 },
    spread: 0.4,
    supinate: false,
    watchHand: true,
  },
};

const scratchQuat = new THREE.Quaternion();
const scratchQuatB = new THREE.Quaternion();
const scratchQuatC = new THREE.Quaternion();
const scratchQuatD = new THREE.Quaternion();
const scratchEuler = new THREE.Euler();
const scratchVecA = new THREE.Vector3();
const scratchVecB = new THREE.Vector3();
const scratchVecC = new THREE.Vector3();
const scratchMat = new THREE.Matrix4();
const WORLD_UP = new THREE.Vector3(0, 1, 0);

function worldPositionOf(bone, out) {
  bone.updateWorldMatrix(true, false);
  return out.setFromMatrixPosition(bone.matrixWorld);
}

// Swing `bone` so its child points at a world target, blended toward the
// clip's pose by `weight`. World-space vectors throughout: no assumptions
// about any bone's local axes, which is what made joint-angle offsets fail.
function aimBoneToward(bone, child, targetWorld, weight) {
  const rest = scratchQuatB.copy(bone.quaternion);
  const origin = worldPositionOf(bone, scratchVecA);
  const current = worldPositionOf(child, scratchVecB).sub(origin);
  const desired = scratchVecC.copy(targetWorld).sub(origin);
  if (current.lengthSq() < 1e-7 || desired.lengthSq() < 1e-7) return;
  current.normalize();
  desired.normalize();
  const worldQuat = bone.getWorldQuaternion(scratchQuatC);
  const delta = scratchQuat.setFromUnitVectors(current, desired);
  const desiredWorld = delta.multiply(worldQuat);
  const parentWorld = bone.parent.getWorldQuaternion(scratchQuatC);
  // Into a scratch, not bone.quaternion: slerpQuaternions copies its first
  // argument over `this` before reading the second, so aliasing the target
  // with the destination silently cancels the whole aim.
  const aimed = scratchQuatD.copy(parentWorld.invert().multiply(desiredWorld));
  bone.quaternion.slerpQuaternions(rest, aimed, weight);
  bone.updateWorldMatrix(true, false);
}

// Deterministic per-actor randomness for the gaze rhythm.
function makeRng(seed) {
  let state = (Math.trunc(seed) || 1) >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0xffffffff;
  };
}

function damp(current, target, lambda, dt) {
  return current + (target - current) * (1 - Math.exp(-lambda * dt));
}

export function createPatientMotion(root, recipe) {
  const bones = {};
  // Finger segments per hand, with their distance from the knuckle: a fine
  // tremor is most visible at the fingertips.
  const fingers = { right: [], left: [] };
  root.traverse((object) => {
    if (!object.isBone) return;
    const name = object.name.toLowerCase().replace(/^mixamorig:?/, '');
    for (const [key, suffix] of Object.entries(BONE_SUFFIXES)) {
      if (name === suffix) bones[key] = object;
    }
    const finger = name.match(/^(right|left)hand(thumb|index|middle|ring|pinky)([1-3])$/);
    if (finger) fingers[finger[1]].push({ bone: object, segment: Number(finger[3]) });
  });

  const rng = makeRng((recipe?.identitySeed ?? 1) * 7919);
  const state = {
    time: 0,
    // Gaze: 1 engages the target, 0 follows the clip. The target is the
    // doctor, or the patient's own presented hand during a gesture.
    gazeWeight: 0,
    gazeTarget: 1,
    gazeAtHand: false,
    nextGazeShift: 2 + rng() * 3,
    breathPhase: 0,
    breathRate: BREATH_RATES.default,
    gestureWeight: 0,
    gestureHeld: 0,
    presentedHand: new THREE.Vector3(),
    hasPresentedHand: false,
  };

  const update = (dt, animation, camera) => {
    if (!camera || dt <= 0) return;
    state.time += dt;

    const gesture = GESTURES[animation.gesture] || null;
    const presenting = Boolean(gesture) && state.gestureHeld < GESTURE_HOLD_SECONDS;
    state.gestureHeld = gesture ? state.gestureHeld + dt : 0;
    state.gestureWeight = damp(state.gestureWeight, presenting ? 1 : 0, 3.2, dt);
    const gestureLive = state.gestureWeight > 0.01 && gesture;

    /* ---- gaze: the doctor, the presented hand, or away ---- */
    if (state.time >= state.nextGazeShift) {
      const engaged = animation.speaking || animation.gaze === 'doctor';
      const lookProbability = engaged ? 0.75 : 0.45;
      state.gazeTarget = rng() < lookProbability ? 1 : 0;
      // While a gesture holds, she mostly watches her own hand — patients
      // watch their tremor when asked to extend — glancing up between.
      state.gazeAtHand = presenting && gesture?.watchHand && rng() < 0.65;
      const holdRange = state.gazeTarget === 1 ? [2.5, 6] : [1.5, 4];
      state.nextGazeShift = state.time + holdRange[0] + rng() * (holdRange[1] - holdRange[0]);
    }
    state.gazeWeight = damp(state.gazeWeight, state.gazeTarget, 2.2, dt);

    const gazePoint = state.gazeAtHand && state.hasPresentedHand && state.gestureWeight > 0.5
      ? state.presentedHand
      : camera.position;
    if (bones.head && state.gazeWeight > 0.01) {
      // Aim in the head's parent space: yaw and pitch toward the point,
      // clamped so the neck never cranes, split across neck and head.
      const head = bones.head;
      head.updateWorldMatrix(true, false);
      scratchVecA.setFromMatrixPosition(head.matrixWorld);
      scratchVecB.copy(gazePoint).sub(scratchVecA);
      scratchMat.copy(head.parent.matrixWorld).invert();
      scratchVecB.transformDirection(scratchMat);
      const yaw = THREE.MathUtils.clamp(Math.atan2(scratchVecB.x, scratchVecB.z), -0.6, 0.6);
      const pitch = THREE.MathUtils.clamp(Math.asin(-scratchVecB.y), -0.5, 0.35);
      const blend = state.gazeWeight;
      scratchEuler.set(pitch * 0.6, yaw * 0.65, 0);
      scratchQuat.setFromEuler(scratchEuler);
      head.quaternion.slerp(scratchQuat.multiply(head.quaternion), blend * 0.85);
      if (bones.neck) {
        scratchEuler.set(pitch * 0.25, yaw * 0.35, 0);
        scratchQuat.setFromEuler(scratchEuler);
        bones.neck.quaternion.slerp(scratchQuat.multiply(bones.neck.quaternion), blend * 0.7);
      }
    }

    /* ---- breathing: rate follows the cue's expression ---- */
    const targetRate = BREATH_RATES[animation.expression] ?? BREATH_RATES.default;
    state.breathRate = damp(state.breathRate, targetRate, 0.8, dt);
    state.breathPhase += (state.breathRate / 60) * Math.PI * 2 * dt;
    const breathWave = Math.sin(state.breathPhase);
    if (bones.spine2) {
      // Amplitude rises with rate: quick breathing reads shallow but visible.
      const amplitude = 0.012 + (state.breathRate - 14) * 0.0011;
      bones.spine2.rotation.x += breathWave * amplitude;
      if (bones.neck) bones.neck.rotation.x -= breathWave * amplitude * 0.4;
    }

    /* ---- examination gesture: world-space arm aiming ---- */
    state.hasPresentedHand = false;
    if (gestureLive) {
      const weight = state.gestureWeight;
      // The held pose rides the breath and drifts a little, so the hold
      // never reads as frozen. Allocations only run during the gesture.
      const sway = breathWave * 0.008 + Math.sin(state.time * 0.43) * 0.004;
      for (const side of gesture.sides) {
        const upper = bones[`${side}Arm`];
        const lower = bones[`${side}ForeArm`];
        const hand = bones[`${side}Hand`];
        const middle = bones[`${side}Middle`];
        if (!upper || !lower || !hand) continue;
        const shoulder = worldPositionOf(upper, new THREE.Vector3());
        const elbow = worldPositionOf(lower, new THREE.Vector3());
        const wrist = worldPositionOf(hand, new THREE.Vector3());
        const upperLength = Math.max(0.15, shoulder.distanceTo(elbow));
        const foreLength = Math.max(0.15, elbow.distanceTo(wrist));
        const toward = new THREE.Vector3().copy(camera.position).sub(shoulder);
        toward.y = 0;
        if (toward.lengthSq() < 1e-6) toward.set(0, 0, 1);
        else toward.normalize();
        // Outward from the camera line, on this arm's own side.
        const lateral = new THREE.Vector3().crossVectors(toward, WORLD_UP);
        const sideSign = side === 'right' ? 1 : -1;
        const spread = gesture.spread ?? 0;

        const elbowTarget = shoulder.clone()
          .addScaledVector(WORLD_UP, -upperLength * gesture.elbow.drop)
          .addScaledVector(toward, upperLength * gesture.elbow.reach)
          .addScaledVector(lateral, sideSign * upperLength * spread * 0.55);
        aimBoneToward(upper, lower, elbowTarget, weight);

        const handTarget = worldPositionOf(lower, new THREE.Vector3())
          .addScaledVector(toward, foreLength * gesture.hand.reach)
          .addScaledVector(WORLD_UP, foreLength * gesture.hand.lift + sway)
          .addScaledVector(lateral, sideSign * foreLength * spread);
        aimBoneToward(lower, hand, handTarget, weight);
        if (gesture.supinate) {
          // Turn the inner wrist up into the doctor's view.
          lower.rotateY(PRESENT_SUPINATION * weight);
        }
        if (middle) {
          const fingerTarget = worldPositionOf(hand, new THREE.Vector3())
            .addScaledVector(toward, 0.2)
            .addScaledVector(WORLD_UP, 0.02);
          aimBoneToward(hand, middle, fingerTarget, weight);
        }
        if (side === gesture.sides[0]) {
          worldPositionOf(hand, state.presentedHand);
          state.hasPresentedHand = true;
        }
      }

      // An authored pose from the character lab overrides the procedural
      // aim: presentation.gesturePoses[gestureId] maps bone names (without
      // the mixamorig prefix) to [x, y, z, w] local quaternions.
      const authored = recipe?.presentation?.gesturePoses?.[animation.gesture];
      if (authored) {
        root.traverse((object) => {
          if (!object.isBone) return;
          const stored = authored[object.name.toLowerCase().replace(/^mixamorig:?/, '')];
          if (!stored) return;
          scratchQuat.fromArray(stored);
          object.quaternion.slerp(scratchQuat, weight);
        });
      }
    }

    /* ---- tremor: the record's sign, strongest at the fingertips ---- */
    const tremor = Number(recipe?.presentation?.tremor) || 0;
    if (tremor > 0 && bones.rightHand) {
      const t = state.time;
      // Extension makes a fine tremor easier to see; so does attention.
      const scale = tremor * (1 + state.gestureWeight * 0.6);
      const wave = (
        Math.sin(t * 43.7) * 0.5 + Math.sin(t * 29.3 + 1.7) * 0.35 + Math.sin(t * 61.1 + 4.1) * 0.15
      ) * 0.02 * scale;
      bones.rightHand.rotation.x += wave;
      if (bones.leftHand) bones.leftHand.rotation.x += wave * 0.8;
      for (const side of ['right', 'left']) {
        const sideFactor = side === 'right' ? 1 : 0.8;
        for (const { bone, segment } of fingers[side]) {
          const jitter = Math.sin(t * (47.3 + segment * 8.1) + bone.id) * 0.012
            * scale * sideFactor * (0.4 + segment * 0.45);
          bone.rotation.x += jitter;
        }
      }
    }
  };

  return { update, bones };
}
