import test from 'node:test';
import assert from 'node:assert/strict';
import { createAdaptiveDprController } from '../src/scene/adaptiveDpr.js';

function sampleFor(controller, seconds, fps, max = 1.5, active = true) {
  for (let frame = 0; frame < seconds * 60; frame += 1) {
    controller.sample(fps, 1 / 60, max, active);
  }
}

test('Auto lowers DPR only after low FPS is sustained', () => {
  const controller = createAdaptiveDprController(1.5);

  sampleFor(controller, 7, 25);
  assert.equal(controller.dpr, 1.5);

  sampleFor(controller, 2, 25);
  assert.equal(controller.dpr, 1.25);
});

test('Auto keeps full DPR at 30 FPS or better', () => {
  const controller = createAdaptiveDprController(1.5);
  sampleFor(controller, 30, 30);
  assert.equal(controller.dpr, 1.5);
});

test('Auto raises DPR cautiously after FPS recovers', () => {
  const controller = createAdaptiveDprController(1.5);
  sampleFor(controller, 9, 25);
  assert.equal(controller.dpr, 1.25);

  sampleFor(controller, 16, 60);
  assert.equal(controller.dpr, 1.5);
});

test('Auto ignores loading, hidden tabs, and long frames', () => {
  const controller = createAdaptiveDprController(1.5);
  sampleFor(controller, 20, 20, 1.5, false);
  assert.equal(controller.dpr, 1.5);

  for (let frame = 0; frame < 100; frame += 1) {
    controller.sample(5, 0.2, 1.5, true);
  }
  assert.equal(controller.dpr, 1.5);
});
