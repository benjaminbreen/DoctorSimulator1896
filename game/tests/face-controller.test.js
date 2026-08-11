import test from 'node:test';
import assert from 'node:assert/strict';
import {
  FACE_WEIGHT_LIMITS,
  createFaceController,
  speechJawWeight,
} from '../src/scene/characters/faceController.js';

const NAMES = [
  'jawOpen', 'mouthFunnel', 'mouthPressLeft', 'mouthPressRight',
  'browDownLeft', 'browDownRight', 'eyeBlinkLeft', 'eyeBlinkRight',
];

function faceFixture() {
  const object = {
    morphTargetDictionary: Object.fromEntries(NAMES.map((name, index) => [name, index])),
    morphTargetInfluences: NAMES.map(() => 0),
  };
  return {
    object,
    root: { traverse: (visit) => visit(object) },
    value: (name) => object.morphTargetInfluences[object.morphTargetDictionary[name]],
  };
}

function recipe(overrides = {}) {
  return {
    appearanceSeed: 189602,
    restingFace: {},
    animation: {
      body: 'sitting-talking', expression: 'guarded', gaze: 'away', speaking: true,
      ...overrides,
    },
  };
}

test('speech uses a restrained jaw-only envelope with closed-mouth rests', () => {
  const samples = Array.from({ length: 300 }, (_, index) => speechJawWeight(index / 100, 189602));
  assert.ok(samples.some((value) => value > 0.015));
  assert.ok(samples.some((value) => value === 0));
  assert.ok(samples.every((value) => value >= 0 && value <= FACE_WEIGHT_LIMITS.jawOpen));
});

test('speaking suppresses guarded mouth pressure but keeps the upper face', () => {
  const fixture = faceFixture();
  const speakingRecipe = { ...recipe(), restingFace: { jawOpen: 0.03, mouthFunnel: 0.08 } };
  const controller = createFaceController(fixture.root, speakingRecipe);
  controller.update(0.1);
  assert.equal(fixture.value('mouthPressLeft'), 0);
  assert.equal(fixture.value('mouthPressRight'), 0);
  assert.equal(fixture.value('mouthFunnel'), 0);
  assert.ok(fixture.value('browDownLeft') > 0);
  assert.equal(fixture.value('jawOpen'), speechJawWeight(0.1, speakingRecipe.appearanceSeed));
});

test('ending speech clears the jaw and restores the selected expression', () => {
  const fixture = faceFixture();
  const controller = createFaceController(fixture.root, recipe());
  controller.update(0.1);
  controller.update(0.1, recipe({ speaking: false }).animation);
  assert.equal(fixture.value('jawOpen'), 0);
  assert.equal(fixture.value('mouthPressLeft'), 0.10);
  assert.equal(fixture.value('mouthPressRight'), 0.09);
});

test('resting-face values are capped before reaching a mesh', () => {
  const fixture = faceFixture();
  const controller = createFaceController(fixture.root, {
    ...recipe({ expression: 'neutral', speaking: false }),
    restingFace: { mouthPressLeft: 0.9, browDownLeft: 0.8 },
  });
  controller.update(0.1);
  assert.equal(fixture.value('mouthPressLeft'), FACE_WEIGHT_LIMITS.mouthPressLeft);
  assert.equal(fixture.value('browDownLeft'), 0.35);
});
