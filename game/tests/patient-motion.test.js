import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createPatientMotion } from '../src/scene/characters/patientMotion.js';

test('breathing and gaze stay bounded when the mixer skips unchanged tracks', () => {
  const root = new THREE.Group();
  const spine = new THREE.Bone();
  spine.name = 'mixamorigSpine2';
  const neck = new THREE.Bone();
  neck.name = 'mixamorigNeck';
  neck.position.y = 0.3;
  const head = new THREE.Bone();
  head.name = 'mixamorigHead';
  head.position.y = 0.2;
  root.add(spine);
  spine.add(neck);
  neck.add(head);
  const mixer = new THREE.AnimationMixer(root);
  const tracks = [spine, neck, head].map((bone) => new THREE.QuaternionKeyframeTrack(
    `${bone.name}.quaternion`, [0, 1], [0, 0, 0, 1, 0, 0, 0, 1],
  ));
  mixer.clipAction(new THREE.AnimationClip('hold', 1, tracks)).play();
  const camera = new THREE.PerspectiveCamera();
  camera.position.set(0.1, 0.7, 3);
  const motion = createPatientMotion(root, { identitySeed: 4 });
  for (let frame = 0; frame < 3600; frame += 1) {
    motion.restorePose();
    mixer.update(1 / 60);
    motion.update(1 / 60, { gaze: 'doctor', expression: 'neutral' }, camera);
    assert.ok(Math.abs(spine.rotation.x) < 0.02, 'breathing must not fold the torso over time');
    assert.ok(head.quaternion.angleTo(new THREE.Quaternion()) < 0.5, 'gaze must stay near the clip pose');
  }
  motion.restorePose();
  assert.ok(spine.quaternion.angleTo(new THREE.Quaternion()) < 1e-6);
  assert.ok(head.quaternion.angleTo(new THREE.Quaternion()) < 1e-6);
});
