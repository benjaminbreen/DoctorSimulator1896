import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createTachistoscope,
  step,
  exposureFor,
  cardFor,
  scoreAnswer,
  predictedExposure,
  LIMITS,
} from '../src/instruments/tachistoscope.js';

// Run the instrument at a fixed step until it settles, so the physics is
// tested the same way every time.
function run(instrument, input, seconds = 2, dt = 1 / 240) {
  let first = { ...input };
  for (let t = 0; t < seconds; t += dt) {
    step(instrument, dt, first);
    first = {};
  }
  return instrument.state;
}

test('exposure falls out of the drop height, not a constant', () => {
  // v = sqrt(2gd): a higher shutter is moving faster when the slot arrives,
  // so the card is seen for less time.
  const high = exposureFor(0.5, 0.03);
  const low = exposureFor(0.1, 0.03);
  assert.ok(high < low, 'a longer drop should give a shorter exposure');
  // And a wider slot holds it open longer at the same speed.
  assert.ok(exposureFor(0.3, 0.06) > exposureFor(0.3, 0.02));
});

test('the default setting lands in the range these were used at', () => {
  const exposure = predictedExposure(createTachistoscope());
  assert.ok(exposure > 0.005 && exposure < 0.06, `${exposure}s is out of range`);
});

test('settings are clamped to what the frame can do', () => {
  const instrument = createTachistoscope();
  step(instrument, 0, { setDrop: 99, setSlot: -4, setLetters: 40 });
  assert.equal(instrument.state.drop, LIMITS.drop[1]);
  assert.equal(instrument.state.slot, LIMITS.slot[0]);
  assert.equal(instrument.state.letters, LIMITS.letters[1]);
});

test('releasing the shutter exposes the card once, then stops', () => {
  const instrument = createTachistoscope();
  const state = run(instrument, { release: true, seed: 5 });
  assert.equal(state.phase, 'read');
  assert.ok(state.exposedFor > 0, 'the card was never uncovered');
  assert.equal(state.exposed, false, 'the slot is still over the aperture');
  // The measured exposure should match the predicted one within a step or two.
  const predicted = exposureFor(state.drop, state.slot, instrument.aperture);
  assert.ok(
    Math.abs(state.exposedFor - predicted) < 0.01,
    `measured ${state.exposedFor}s against predicted ${predicted}s`,
  );
});

test('a taller drop really does show the card for less time', () => {
  const slow = run(createTachistoscope({ drop: 0.1 }), { release: true, seed: 5 });
  const fast = run(createTachistoscope({ drop: 0.5 }), { release: true, seed: 5 });
  assert.ok(fast.exposedFor < slow.exposedFor);
});

test('the card is deterministic from its seed', () => {
  assert.equal(cardFor(1234, 5), cardFor(1234, 5));
  assert.notEqual(cardFor(1234, 5), cardFor(1235, 5));
  assert.equal(cardFor(1234, 5).length, 5);
  // No letters that a 20ms exposure turns into digits.
  assert.ok(!/[IOQ]/.test(cardFor(99, 7)));
});

test('scoring counts letters in the right place', () => {
  assert.deepEqual(scoreAnswer('ABCDE', 'ABCDE').right, 5);
  assert.deepEqual(scoreAnswer('ABCDE', 'ABXDE').right, 4);
  // Right letters in the wrong place do not count: position was the test.
  assert.deepEqual(scoreAnswer('ABCDE', 'BACDE').right, 3);
  assert.deepEqual(scoreAnswer('ABCDE', '').right, 0);
});

test('a trial runs set to scored and can be cocked again', () => {
  const instrument = createTachistoscope();
  run(instrument, { release: true, seed: 7 });
  step(instrument, 0, { answer: instrument.state.card });
  step(instrument, 0, { submit: true });
  assert.equal(instrument.state.phase, 'scored');
  assert.equal(instrument.state.score.right, instrument.state.card.length);
  assert.equal(instrument.state.trials, 1);
  step(instrument, 0, { cock: true });
  assert.equal(instrument.state.phase, 'set');
  assert.equal(instrument.state.fallen, 0);
  assert.equal(instrument.state.trials, 1, 'cocking should not clear the tally');
});

test('the shutter cannot be released twice in one fall', () => {
  const instrument = createTachistoscope();
  step(instrument, 1 / 240, { release: true, seed: 3 });
  const card = instrument.state.card;
  step(instrument, 1 / 240, { release: true, seed: 9 });
  assert.equal(instrument.state.card, card);
});
