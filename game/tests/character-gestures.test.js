import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { fadeInAction, restoreLoopingIdle } from '../src/scene/characterGestures.js';

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

// The pedestrian rigs are exported lying face-down: they only stand because a
// clip drives the hips. So an empty mixer is not a neutral pose, it is a body
// on the pavement, and this is the fourth time that has shipped.
test('a base action resumed after a full fade-out stands the figure back up', () => {
  const scene = new THREE.Object3D();
  const root = new THREE.Object3D();
  root.name = 'Hips';
  // Bind pose: face-down, as every character export in this game is.
  root.quaternion.setFromEuler(new THREE.Euler(Math.PI / 2, 0, 0));
  scene.add(root);
  const upright = new THREE.AnimationClip('Walk', 1, [
    new THREE.QuaternionKeyframeTrack('Hips.quaternion', [0, 1], [0, 0, 0, 1, 0, 0, 0, 1]),
  ]);
  const recoil = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, 0.3));
  const reaction = new THREE.AnimationClip('Collision Reaction', 3.6, [
    new THREE.QuaternionKeyframeTrack(
      'Hips.quaternion',
      [0, 3.6],
      [recoil.x, recoil.y, recoil.z, recoil.w, recoil.x, recoil.y, recoil.z, recoil.w],
    ),
  ]);
  const mixer = new THREE.AnimationMixer(scene);
  const base = mixer.clipAction(upright).play();
  const stagger = mixer.clipAction(reaction);
  stagger.setLoop(THREE.LoopOnce, 1);
  stagger.clampWhenFinished = true;
  mixer.update(0.1);

  // A bump: the base fades out over 0.14s, and the flinch runs for 0.55s.
  base.fadeOut(0.14);
  stagger.reset().fadeIn(0.12).play();
  mixer.update(0.55);
  assert.equal(base.enabled, false, 'three disables an action once its fade-out completes');

  // The flinch ends and the base is faded back in.
  stagger.setEffectiveTimeScale(0);
  stagger.fadeOut(0.25);
  fadeInAction(base, 0.28);
  mixer.update(0.4);
  assert.ok(base.getEffectiveWeight() > 0.9, 'the base carries the figure again');
  assert.ok(
    root.quaternion.angleTo(new THREE.Quaternion()) < 1e-3,
    'the figure is upright, not back in its face-down bind pose',
  );
});
