import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createPatientMotion } from '../src/scene/characters/patientMotion.js';
import { createCharacterRecipe } from '../../shared/characters/recipe.js';

function scene(scale = 1, padDepth = null) {
  const root = new THREE.Group();
  root.scale.setScalar(scale);
  root.rotation.y = Math.PI;
  root.position.set(.3, .15, -.2);
  const hip = new THREE.Bone(); hip.name = 'mixamorigHips'; root.add(hip);
  const upper = new THREE.Bone(); upper.name = 'mixamorigRightArm'; upper.position.set(-.2, 1.1, 0); root.add(upper);
  const lower = new THREE.Bone(); lower.name = 'mixamorigRightForeArm'; lower.position.set(-.05, -.38, .12); upper.add(lower);
  const hand = new THREE.Bone(); hand.name = 'mixamorigRightHand'; hand.position.set(.05, 0, .26); lower.add(hand);
  const middle = new THREE.Bone(); middle.name = 'mixamorigRightHandMiddle1'; middle.position.z = .1; hand.add(middle);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([-.4,.6,.15, .4,.6,.15, -.4,.6,.8, .4,.6,.8], 3));
  geometry.setIndex([0,2,1, 1,2,3]);
  geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(new Uint16Array(16), 4));
  geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute([1,0,0,0, 1,0,0,0, 1,0,0,0, 1,0,0,0], 4));
  const cloth = new THREE.SkinnedMesh(geometry, new THREE.MeshBasicMaterial()); root.add(cloth);
  root.updateMatrixWorld(true);
  cloth.bind(new THREE.Skeleton([hip]));
  let pad;
  if (padDepth !== null) {
    const padGeometry = new THREE.BoxGeometry(.04, .02, .08, 1, 1, 2).translate(-.2, .72 - padDepth + .01, .43);
    const count = padGeometry.attributes.position.count;
    padGeometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(new Uint16Array(count * 4), 4));
    const weights = new Float32Array(count * 4);
    for (let i = 0; i < count; i++) weights[i * 4] = 1;
    padGeometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(weights, 4));
    pad = new THREE.SkinnedMesh(padGeometry, new THREE.MeshBasicMaterial()); root.add(pad);
    root.updateMatrixWorld(true); pad.bind(new THREE.Skeleton([hand]));
  }
  const camera = new THREE.PerspectiveCamera(); camera.position.set(0, 1, -3);
  return { root, upper, lower, hand, middle, pad, camera, motion: createPatientMotion(root, { identitySeed: 4 }) };
}

const at = bone => bone.getWorldPosition(new THREE.Vector3());

test('resting palms meet the cloth without changing arm lengths at different model scales', () => {
  for (const scale of [1, 1.75]) {
    const { upper, lower, hand, middle, camera, motion } = scene(scale);
    const lengths = [at(upper).distanceTo(at(lower)), at(lower).distanceTo(at(hand))];
    const idle = createCharacterRecipe({ animation: { gaze: 'neutral' } }).animation;
    for (let i = 0; i < 120; i++) {
      motion.restorePose();
      motion.update(1 / 60, idle, camera);
    }
    const palm = at(hand).lerp(at(middle), .6);
    assert.ok(Math.abs(palm.y - (.15 + .618 * scale)) < .002, `palm at ${palm.y}`);
    assert.ok(Math.abs(at(upper).distanceTo(at(lower)) - lengths[0]) < 1e-6);
    assert.ok(Math.abs(at(lower).distanceTo(at(hand)) - lengths[1]) < 1e-6);
  }
});

test('standing, walking, speech gestures and examination gestures release lap contact', () => {
  for (const animation of [
    { body: 'standing-idle' }, { body: 'walk' }, { body: 'sitting-talking' },
    { body: 'clinic-idle', gesture: 'present-wrist' }, { body: 'clinic-idle', gesture: 'remove-hat' },
  ]) {
    const { upper, lower, hand, camera, motion } = scene();
    for (let i = 0; i < 60; i++) { motion.restorePose(); motion.update(1 / 60, { body: 'clinic-idle', gesture: 'none' }, camera); }
    motion.restorePose();
    const before = [upper, lower, hand].map(bone => bone.quaternion.clone());
    motion.update(1 / 60, { ...animation, gaze: 'neutral' }, camera);
    if (animation.gesture === 'present-wrist') {
      const baseline = scene();
      for (let i = 0; i < 60; i++) {
        baseline.motion.restorePose();
        baseline.motion.update(1 / 60, { body: 'walk', gaze: 'neutral' }, baseline.camera);
      }
      baseline.motion.restorePose();
      baseline.motion.update(1 / 60, { ...animation, gaze: 'neutral' }, baseline.camera);
      [upper, lower, hand].forEach((bone, index) => {
        const expected = [baseline.upper, baseline.lower, baseline.hand][index];
        assert.ok(bone.quaternion.angleTo(expected.quaternion) < 1e-6, 'lap contact must release the examination arm');
      });
    } else {
      [upper, lower, hand].forEach((bone, index) => assert.ok(bone.quaternion.angleTo(before[index]) < 1e-6));
    }
  }
});


test('different palm pad depths make contact without landing on the hand mesh itself', () => {
  for (const depth of [.01, .022]) {
    const { root, pad, camera, motion } = scene(1, depth);
    for (let i = 0; i < 120; i++) { motion.restorePose(); motion.update(1 / 60, { body: 'clinic-idle', gesture: 'none' }, camera); }
    root.updateMatrixWorld(true);
    let bottom = Infinity;
    const point = new THREE.Vector3();
    for (let i = 0; i < pad.geometry.attributes.position.count; i++) {
      pad.getVertexPosition(i, point); pad.localToWorld(point); bottom = Math.min(bottom, point.y);
    }
    assert.ok(Math.abs(bottom - .752) < .002, `palm underside at ${bottom}`);
  }
});
