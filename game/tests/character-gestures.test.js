import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { restoreLoopingIdle } from '../src/scene/characterGestures.js';

test('returning from a clamped gesture immediately restores the upright idle root', () => {
  const scene = new THREE.Object3D();
  const root = new THREE.Object3D();
  root.name = 'Hips';
  scene.add(root);
  const idleClip = new THREE.AnimationClip('Idle', 1, [
    new THREE.QuaternionKeyframeTrack(
      'Hips.quaternion',
      [0, 1],
      [0, 0, 0, 1, 0, 0, 0, 1],
    ),
  ]);
  const flat = new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2, 0, 0));
  const gestureClip = new THREE.AnimationClip('Gesture', 0.5, [
    new THREE.QuaternionKeyframeTrack(
      'Hips.quaternion',
      [0, 0.5],
      [0, 0, 0, 1, flat.x, flat.y, flat.z, flat.w],
    ),
  ]);
  const mixer = new THREE.AnimationMixer(scene);
  const idle = mixer.clipAction(idleClip).play();
  const gesture = mixer.clipAction(gestureClip);
  idle.setEffectiveWeight(0);
  gesture.reset().setLoop(THREE.LoopOnce, 1).play();
  gesture.clampWhenFinished = true;
  mixer.update(0.5);
  assert.ok(Math.abs(root.quaternion.x) > 0.6, 'gesture leaves the root flat');

  restoreLoopingIdle(mixer, idle, gesture);
  assert.ok(root.quaternion.angleTo(new THREE.Quaternion()) < 1e-6);
  assert.equal(idle.getEffectiveWeight(), 1);
  assert.equal(gesture.isRunning(), false);
});
