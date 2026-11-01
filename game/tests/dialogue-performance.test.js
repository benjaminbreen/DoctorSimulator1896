import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createFaceController } from '../src/scene/characters/faceController.js';
import { createPatientMotion } from '../src/scene/characters/patientMotion.js';
import { normalizeDialogueResponse } from '../src/consultation/contract.js';
import { createCharacterRecipe } from '../../shared/characters/recipe.js';
import { createActorInstance, updateActorCue } from '../src/world/characters/actors.js';

test('expression intensity scales emotion without scaling gaze or speech', () => {
  const names = ['browDownLeft', 'speechOpen', 'speechWide', 'speechRound', 'eyeLookDownLeft', 'eyeBlinkLeft'];
  const run = (expressionIntensity) => {
    const mesh = {
      morphTargetDictionary: Object.fromEntries(names.map((name, index) => [name, index])),
      morphTargetInfluences: names.map(() => 0),
    };
    const recipe = createCharacterRecipe({
      animation: { expression: 'guarded', expressionIntensity, gaze: 'down', speaking: true },
    });
    const controller = createFaceController({ traverse: visit => visit(mesh) }, recipe);
    for (let frame = 0; frame < 40; frame += 1) controller.update(0.05);
    return Object.fromEntries(names.map((name, index) => [name, mesh.morphTargetInfluences[index]]));
  };
  const full = run(1), half = run(0.5), zero = run(0);
  assert.ok(full.browDownLeft > 0);
  assert.ok(Math.abs(half.browDownLeft / full.browDownLeft - 0.5) < 0.01);
  assert.equal(zero.browDownLeft, 0);
  assert.ok(zero.eyeLookDownLeft > 0);
  for (const name of names.filter(name => name.startsWith('speech') || name.startsWith('eye'))) {
    assert.equal(half[name], full[name]);
    assert.equal(zero[name], full[name]);
  }
});

test('invalid intensities and gaze are bounded before reaching the actor', () => {
  assert.equal(normalizeDialogueResponse({ expressionIntensity: -2 }).expressionIntensity, 0);
  assert.equal(normalizeDialogueResponse({ expressionIntensity: 3 }).expressionIntensity, 1);
  for (const value of [NaN, Infinity, '0.7', null]) {
    assert.equal(normalizeDialogueResponse({ expressionIntensity: value }).expressionIntensity, null);
  }
  assert.equal(normalizeDialogueResponse({ gaze: 'upside-down' }).gaze, null);
  assert.equal(createCharacterRecipe({ animation: { expressionIntensity: 0 } }).animation.expressionIntensity, 0);
});

test('a later authored expression releases a model intensity', () => {
  const actor = createActorInstance({ animation: { expression: 'guarded' } });
  const generated = updateActorCue(actor, { expression: 'frowning', expressionIntensity: 0.3 });
  assert.equal(generated.recipe.animation.expressionIntensity, 0.3);
  const authored = updateActorCue(generated, { expression: 'smiling' });
  assert.equal(authored.recipe.animation.expressionIntensity, undefined);
});

test('directed avoidance releases head tracking even while speaking', () => {
  const root = new THREE.Group();
  const neck = new THREE.Bone(), head = new THREE.Bone();
  neck.name = 'mixamorigNeck';
  head.name = 'mixamorigHead';
  head.position.y = 0.2;
  root.add(neck);
  neck.add(head);
  const camera = new THREE.PerspectiveCamera();
  camera.position.set(2, 0.5, 3);
  const motion = createPatientMotion(root, { identitySeed: 4 });
  const step = (gaze) => {
    motion.restorePose();
    neck.quaternion.identity();
    head.quaternion.identity();
    motion.update(1 / 60, { gaze, expression: 'guarded', speaking: true }, camera);
  };
  for (let frame = 0; frame < 120; frame += 1) step('doctor');
  const engaged = head.quaternion.angleTo(new THREE.Quaternion());
  assert.ok(engaged > 0.05);
  for (let frame = 0; frame < 240; frame += 1) step('away');
  assert.ok(head.quaternion.angleTo(new THREE.Quaternion()) < engaged * 0.1);
});
