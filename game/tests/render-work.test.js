import test from 'node:test';
import assert from 'node:assert/strict';
import { Group, Bone, Skeleton, SkinnedMesh, BufferGeometry, MeshBasicMaterial } from 'three';
import { freezeStaticTransforms } from '../src/scene/lib/staticScene.js';
import { manageActorTransforms } from '../src/scene/actorTransforms.js';
import { createFrameTiming } from '../src/scene/frameTiming.js';

test('a frozen subtree retains world placement and skips descendant updates', () => {
  const scene = new Group(), root = new Group(), child = new Group();
  scene.position.x = 10;
  root.position.x = 2;
  child.position.x = 3;
  scene.add(root); root.add(child);
  freezeStaticTransforms(root);
  assert.equal(child.matrixWorld.elements[12], 15);
  let updates = 0;
  const original = child.updateMatrixWorld;
  child.updateMatrixWorld = function (...args) { updates++; return original.apply(this, args); };
  for (let frame = 0; frame < 60; frame++) scene.updateMatrixWorld(true);
  assert.equal(updates, 0);
  const added = new Group(); added.position.x = 7; root.add(added);
  freezeStaticTransforms(root);
  assert.equal(added.matrixWorld.elements[12], 19);
});

test('managed skeletons update only for changed poses and follow actor movement', () => {
  const scene = new Group(), root = new Group(), bone = new Bone();
  const mesh = new SkinnedMesh(new BufferGeometry(), new MeshBasicMaterial());
  root.add(mesh); mesh.add(bone); scene.add(root);
  mesh.bind(new Skeleton([bone]));
  const pose = manageActorTransforms(root);
  let boneUpdates = 0;
  const original = bone.updateMatrix;
  bone.updateMatrix = function () { boneUpdates++; return original.call(this); };
  root.position.x = 3; bone.position.y = 2; pose.update(); mesh.skeleton.update();
  assert.equal(bone.matrixWorld.elements[12], 3);
  assert.equal(bone.matrixWorld.elements[13], 2);
  const updates = boneUpdates;
  for (let frame = 0; frame < 60; frame++) { scene.updateMatrixWorld(true); mesh.skeleton.update(); }
  assert.equal(boneUpdates, updates);
  root.position.x = 5; bone.position.y = 4; pose.update(); mesh.skeleton.update();
  assert.equal(bone.matrixWorld.elements[12], 5);
  assert.equal(bone.matrixWorld.elements[13], 4);
  pose.dispose();
  scene.updateMatrixWorld(true);
  assert.ok(boneUpdates > updates);
});

test('frame diagnostics retain stalls even when most frames are fast', () => {
  const timing = createFrameTiming();
  for (let i = 0; i < 100; i++) timing.sample(1 / 60);
  const snapshot = timing.sample(2);
  assert.equal(snapshot.worst, 2000);
  assert.equal(snapshot.longFrames, 1);
  assert.ok(snapshot.fps < 30);
  assert.ok(snapshot.p95 < 17);
});
