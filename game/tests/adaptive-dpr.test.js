import test from 'node:test';
import assert from 'node:assert/strict';
import { createAdaptiveDprController } from '../src/scene/adaptiveDpr.js';

function sampleFor(controller, seconds, fps, active = true) {
  for (let frame = 0; frame < seconds * fps; frame++) controller.sample(fps, 1 / fps, 1.5, active);
}

test('Auto responds to sustained 40 FPS without waiting for a collapse below 30', () => {
  const controller = createAdaptiveDprController(1.5);
  sampleFor(controller, 5, 40);
  assert.equal(controller.dpr, 1.5);
  sampleFor(controller, 2, 40);
  assert.equal(controller.dpr, 1.25);
});

test('Auto holds detail at a stable 60 FPS and after a single long frame', () => {
  const controller = createAdaptiveDprController(1.5);
  sampleFor(controller, 10, 60);
  controller.sample(.5, 2, 1.5);
  sampleFor(controller, 10, 60);
  assert.equal(controller.dpr, 1.5);
});

test('Auto recovers only after a long stable interval', () => {
  const controller = createAdaptiveDprController(1.5);
  sampleFor(controller, 7, 40);
  sampleFor(controller, 12, 60);
  assert.equal(controller.dpr, 1.25);
  sampleFor(controller, 9, 60);
  assert.equal(controller.dpr, 1.5);
});

test('loading and hidden tabs do not lower quality, repeated long frames do', () => {
  const controller = createAdaptiveDprController(1.5);
  sampleFor(controller, 20, 10, false);
  assert.equal(controller.dpr, 1.5);
  sampleFor(controller, 5, 60);
  for (let frame = 0; frame < 25; frame++) controller.sample(5, .2, 1.5);
  assert.equal(controller.dpr, 1.25);
});


test('a stale diagnostic average cannot lower quality after a recovered stall', () => {
  const controller = createAdaptiveDprController(1.5);
  sampleFor(controller, 10, 60);
  controller.sample(20, 2, 1.5);
  for (let frame = 0; frame < 600; frame++) controller.sample(20, 1 / 60, 1.5);
  assert.equal(controller.dpr, 1.5);
});


test('Auto restores resolution when reducing pixels does not improve frame rate', () => {
  const controller = createAdaptiveDprController(1.5);
  sampleFor(controller, 7, 30);
  assert.equal(controller.dpr, 1.25);
  sampleFor(controller, 60, 30);
  assert.equal(controller.dpr, 1.5);
  sampleFor(controller, 3, 15);
  assert.equal(controller.dpr, 1.25, 'a new load level can try again');
});
