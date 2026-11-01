import test from 'node:test';
import assert from 'node:assert/strict';
import {
  FACE_WEIGHT_LIMITS,
  createFaceController,
  speechJawWeight,
} from '../src/scene/characters/faceController.js';
import {
  FACIAL_EXPRESSION_RECIPES,
  FACIAL_GAZE_RECIPES,
  speechFaceWeights,
  blinkFaceWeights, blinkEyelids, idleGazeWeights,
} from '../../shared/characters/facePerformance.js';

// Expressions ease between cues; steady state arrives well inside a second.
function settle(controller, animation) {
  for (let step = 0; step < 40; step += 1) controller.update(0.05, animation);
}

function assertNear(actual, expected, message) {
  assert.ok(Math.abs(actual - expected) < 0.01, `${message}: ${actual} !~ ${expected}`);
}

const NAMES = [
  'jawOpen', 'mouthFunnel', 'mouthPressLeft', 'mouthPressRight',
  'browDownLeft', 'browDownRight', 'eyeBlinkLeft', 'eyeBlinkRight',
  'browInnerUp', 'mouthFrownLeft', 'mouthFrownRight',
  'mouthSmileLeft', 'mouthSmileRight', 'cheekSquintLeft', 'cheekSquintRight',
  'eyeLookOutLeft', 'eyeLookInRight', 'eyeLookDownLeft', 'eyeLookDownRight',
  'eyeSquintLeft', 'eyeSquintRight', 'eyeWideLeft', 'eyeWideRight',
  'noseSneerLeft', 'noseSneerRight', 'mouthStretchLeft', 'mouthStretchRight',
];

function faceFixture(extraNames = []) {
  const names = [...NAMES, ...extraNames];
  const object = {
    morphTargetDictionary: Object.fromEntries(names.map((name, index) => [name, index])),
    morphTargetInfluences: names.map(() => 0),
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

test('the fitted head has stronger upper-face reactions while legacy faces retain their limits', () => {
  const fitted = faceFixture(['speechOpen', 'speechWide', 'speechRound']);
  const legacy = faceFixture();
  const cue = recipe({ expression: 'anxious', speaking: true, gaze: 'doctor' });
  const fittedController = createFaceController(fitted.root, cue);
  const legacyController = createFaceController(legacy.root, cue);
  settle(fittedController, cue.animation);
  settle(legacyController, cue.animation);
  assert.ok(fitted.value('browInnerUp') > .6);
  assert.ok(fitted.value('eyeWideLeft') > .6);
  assert.ok(legacy.value('browInnerUp') <= .35);
  assert.ok(fitted.value('mouthStretchLeft') > .15);
  assert.equal(fitted.value('mouthPressLeft'), 0);
  const oldBrow = fitted.value('browInnerUp');
  fittedController.update(.05, recipe({ expression: 'relieved', speaking: false }).animation);
  assert.ok(fitted.value('browInnerUp') < oldBrow && fitted.value('browInnerUp') > .12);
  settle(fittedController, recipe({ expression: 'relieved', speaking: false }).animation);
  assert.equal(fitted.value('speechOpen'), 0);
  assert.ok(fitted.value('mouthSmileLeft') > .25);
  assert.ok(fitted.value('cheekSquintLeft') > .3);
});

test('fitted eyelids close fully through a wide-eye expression and reopen without losing it', () => {
  const fixture = faceFixture(['speechOpen','speechWide','speechRound']);
  const cue = recipe({expression:'anxious',speaking:false,gaze:'doctor'});
  const controller = createFaceController(fixture.root,cue);
  controller.update(.1);
  assert.equal(fixture.value('eyeBlinkLeft'),0);
  let closed = false, reopened = false;
  for(let i=0;i<650;i++) {
    controller.update(.01);
    if(fixture.value('eyeBlinkLeft')===1 && fixture.value('eyeBlinkRight')===1) {
      closed = true;
      assert.equal(fixture.value('eyeWideLeft'),0);
      assert.equal(fixture.value('eyeWideRight'),0);
    }
    if(closed && fixture.value('eyeBlinkLeft')===0 && fixture.value('eyeWideLeft')>.6) reopened=true;
  }
  assert.ok(closed && reopened);
});

test('blink timing has open rests and a complete seal without an initial blink', () => {
  assert.deepEqual(blinkFaceWeights(.1,7),{eyeBlinkLeft:0,eyeBlinkRight:0});
  const samples=Array.from({length:2000},(_,i)=>blinkFaceWeights(i/100,7));
  assert.ok(samples.some(s=>s.eyeBlinkLeft===1 && s.eyeBlinkRight===1));
  const closed=blinkEyelids({eyeWideLeft:.8,eyeSquintRight:.7}, {eyeBlinkLeft:1,eyeBlinkRight:1});
  assert.equal(closed.eyeWideLeft,0);assert.equal(closed.eyeSquintRight,0);
  assert.ok(samples.every(s=>Object.values(s).every(v=>v>=0 && v<=1)));
});

test('a fitted speaking cue starts its own phrase after a long quiet interval', () => {
  const fixture=faceFixture(['speechOpen','speechWide','speechRound']);
  const cue=recipe({speaking:false,gaze:'doctor'});
  const controller=createFaceController(fixture.root,cue);
  for(let i=0;i<60;i++) controller.update(.1,cue.animation);
  controller.update(.1,{...cue.animation,speaking:true});
  assertNear(fixture.value('speechOpen'),speechFaceWeights(.1,cue.appearanceSeed).speechOpen,'first syllable');
  controller.update(.1,cue.animation);
  assert.equal(fixture.value('speechOpen'),0);
  assert.ok(Object.values(speechFaceWeights(2.4,cue.appearanceSeed)).every(v=>v===0));
});

test('small attention shifts preserve explicitly averted gaze', () => {
  assert.ok(Object.values(idleGazeWeights(3.6,7,'doctor')).some(v=>v>0));
  assert.deepEqual(idleGazeWeights(3.6,7,'down'),{});
  assert.deepEqual(idleGazeWeights(3.6,7,'away'),{});
});

test('fitted-mouth speech alternates open, wide and rounded shapes with closed rests', () => {
  const samples = Array.from({ length: 500 }, (_, index) => speechFaceWeights(index/100, 189602));
  assert.ok(samples.some((s) => s.speechWide > .1));
  assert.ok(samples.some((s) => s.speechRound > .1));
  assert.ok(samples.some((s) => Object.values(s).every((v) => v === 0)));
  assert.ok(samples.every((s) => Object.entries(s).every(([name, v]) => v >= 0 && v <= FACE_WEIGHT_LIMITS[name])));
});

test('fitted speech drives skin and lips together and releases both when speech ends', () => {
  const names = [...NAMES, 'speechOpen', 'speechWide', 'speechRound'];
  const meshes = [0, 1].map(() => ({
    morphTargetDictionary: Object.fromEntries(names.map((name, i) => [name, i])),
    morphTargetInfluences: names.map(() => 0),
  }));
  const root = { traverse: (visit) => meshes.forEach(visit) };
  const controller = createFaceController(root, recipe());
  controller.update(.1);
  const index = names.indexOf('speechOpen');
  assert.ok(meshes[0].morphTargetInfluences[index] > .1);
  assert.equal(meshes[0].morphTargetInfluences[index], meshes[1].morphTargetInfluences[index]);
  assert.equal(meshes[0].morphTargetInfluences[0], 0);
  controller.update(.1, recipe({ speaking: false }).animation);
  assert.ok(meshes.every((mesh) => names.filter((name) => name.startsWith('speech')).every((name) => mesh.morphTargetInfluences[names.indexOf(name)] === 0)));
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
  settle(controller, recipe({ speaking: false }).animation);
  assert.equal(fixture.value('jawOpen'), 0);
  assertNear(fixture.value('mouthPressLeft'), FACIAL_EXPRESSION_RECIPES.guarded.mouthPressLeft, 'press left');
  assertNear(fixture.value('mouthPressRight'), FACIAL_EXPRESSION_RECIPES.guarded.mouthPressRight, 'press right');
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

test('consultation reactions drive distinct smiles, frowns, and discouraged faces', () => {
  const fixture = faceFixture();
  const controller = createFaceController(fixture.root, recipe({ speaking: false, gaze: 'doctor' }));

  settle(controller, recipe({ expression: 'smiling', speaking: false, gaze: 'doctor' }).animation);
  assertNear(fixture.value('mouthSmileLeft'), FACIAL_EXPRESSION_RECIPES.smiling.mouthSmileLeft, 'smile');
  assert.equal(fixture.value('mouthFrownLeft'), 0);

  settle(controller, recipe({ expression: 'frowning', speaking: false, gaze: 'doctor' }).animation);
  assert.equal(fixture.value('mouthSmileLeft'), 0);
  assertNear(fixture.value('mouthFrownLeft'), FACIAL_EXPRESSION_RECIPES.frowning.mouthFrownLeft, 'frown');
  assertNear(fixture.value('browDownLeft'), 0.35, 'brow clamp');

  settle(controller, recipe({ expression: 'discouraged', speaking: false, gaze: 'down' }).animation);
  assertNear(fixture.value('browInnerUp'), 0.35, 'inner brow clamp');
  assertNear(fixture.value('mouthFrownLeft'), FACIAL_EXPRESSION_RECIPES.discouraged.mouthFrownLeft, 'discouraged frown');
  assertNear(fixture.value('eyeLookDownLeft'), FACIAL_GAZE_RECIPES.down.eyeLookDownLeft, 'gaze down');
});

test('pained, anxious, and ashamed reactions read on the face', () => {
  const fixture = faceFixture();
  const controller = createFaceController(fixture.root, recipe({ speaking: false, gaze: 'doctor' }));

  settle(controller, recipe({ expression: 'pained', speaking: false, gaze: 'doctor' }).animation);
  assertNear(fixture.value('eyeSquintLeft'), FACIAL_EXPRESSION_RECIPES.pained.eyeSquintLeft, 'pained squint');
  assertNear(fixture.value('mouthStretchLeft'), FACIAL_EXPRESSION_RECIPES.pained.mouthStretchLeft, 'pained stretch');

  settle(controller, recipe({ expression: 'anxious', speaking: false, gaze: 'doctor' }).animation);
  assertNear(fixture.value('eyeSquintLeft'), 0, 'squint released');
  assertNear(fixture.value('eyeWideLeft'), FACIAL_EXPRESSION_RECIPES.anxious.eyeWideLeft, 'anxious eyes');
  assertNear(fixture.value('browInnerUp'), 0.35, 'anxious brow clamp');

  settle(controller, recipe({ expression: 'ashamed', speaking: false, gaze: 'down' }).animation);
  assertNear(fixture.value('mouthPressLeft'), FACIAL_EXPRESSION_RECIPES.ashamed.mouthPressLeft, 'ashamed press');
  assertNear(fixture.value('eyeLookDownLeft'), FACIAL_GAZE_RECIPES.down.eyeLookDownLeft, 'ashamed gaze down');
});

test('emotional mouth corners remain legible while the patient speaks', () => {
  const fixture = faceFixture();
  const controller = createFaceController(fixture.root, recipe({ expression: 'smiling', gaze: 'doctor' }));
  settle(controller, recipe({ expression: 'smiling', gaze: 'doctor' }).animation);
  assertNear(fixture.value('mouthSmileLeft'), FACIAL_EXPRESSION_RECIPES.smiling.mouthSmileLeft, 'smile in speech');
  assert.equal(fixture.value('mouthPressLeft'), 0);
  const jaw = fixture.value('jawOpen');
  assert.ok(jaw >= 0 && jaw <= FACE_WEIGHT_LIMITS.jawOpen);
});

test('settled consultation gaze looks away from the doctor', () => {
  const fixture = faceFixture();
  const controller = createFaceController(fixture.root, recipe({ expression: 'neutral', speaking: false }));
  settle(controller, recipe({ expression: 'neutral', speaking: false, gaze: 'away' }).animation);
  assertNear(fixture.value('eyeLookOutLeft'), FACIAL_GAZE_RECIPES.away.eyeLookOutLeft, 'gaze out');
  assertNear(fixture.value('eyeLookInRight'), FACIAL_GAZE_RECIPES.away.eyeLookInRight, 'gaze in');
});
