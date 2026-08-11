import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createColourWheel,
  step,
  fuse,
  fusionAt,
  agreement,
  targetFor,
  parseHex,
} from '../src/instruments/colourWheel.js';

function run(instrument, input, seconds = 3, dt = 1 / 120) {
  let first = { ...input };
  for (let t = 0; t < seconds; t += dt) {
    step(instrument, dt, first);
    first = { cranking: input.cranking };
  }
  return instrument.state;
}

test('the mix is an average in linear light, not in sRGB', () => {
  // Half black, half white. The sRGB midpoint is 128; the linear average is
  // about 188, which is the whole reason this is done in linear.
  const grey = parseHex(fuse(['#000000', '#ffffff'], [0.5, 0.5]))[0];
  assert.ok(grey > 180 && grey < 195, `${grey} is not the linear midpoint`);
});

test('a paper given the whole disc comes back unchanged', () => {
  assert.equal(fuse(['#8f2a20', '#215a3b'], [1, 0]), '#8f2a20');
});

test('fusion follows the flicker rate, not the speed', () => {
  // Six sectors fuse at half the revolutions three sectors need.
  assert.ok(fusionAt(8, 6) > fusionAt(8, 3));
  assert.equal(fusionAt(0, 3), 0);
  assert.equal(fusionAt(30, 3), 1);
});

test('cranking spins the disc up and letting go slows it', () => {
  const wheel = createColourWheel();
  const fast = run(wheel, { cranking: true }, 4).speed;
  assert.ok(fast > 15, `${fast} rev/s is not fusion speed`);
  // A heavy wheel coasts, which is the point of it — but not for ever.
  assert.ok(run(wheel, { cranking: false }, 4).speed < fast * 0.6);
  assert.equal(run(wheel, { cranking: false }, 12).speed, 0);
});

test('a sector cannot be widened out of nothing', () => {
  const wheel = createColourWheel();
  step(wheel, 0, { setFraction: { slot: 0, value: 0.8 } });
  const total = wheel.state.fractions.reduce((sum, f) => sum + f, 0);
  assert.ok(Math.abs(total - 1) < 1e-9, `sectors sum to ${total}`);
  assert.ok(Math.abs(wheel.state.fractions[0] - 0.8) < 1e-9);
});

test('the target is always reachable with the papers on the spindle', () => {
  const wheel = createColourWheel({ seed: 42 });
  const { fractions, colour } = wheel.state.target;
  assert.equal(fuse(wheel.colours, fractions), colour);
  assert.ok(fractions.every((f) => f > 0.01), 'a target should not be one pure paper');
});

test('setting the wheel to the target scores a perfect match', () => {
  const wheel = createColourWheel({ seed: 7 });
  const target = wheel.state.target.fractions;
  // Three passes: setting one sector renormalises the others, so the settings
  // chase each other for a round or two exactly as they do under the player's
  // hand. They converge.
  for (let pass = 0; pass < 3; pass += 1) {
    target.forEach((value, slot) => step(wheel, 0, { setFraction: { slot, value } }));
  }
  run(wheel, { cranking: true }, 4);
  step(wheel, 1 / 120, { record: true });
  assert.equal(wheel.state.phase, 'matched');
  assert.ok(wheel.state.match.agreement > 0.999, `${wheel.state.match.agreement}`);
});

test('a reading cannot be taken off a disc that is still flickering', () => {
  const wheel = createColourWheel();
  step(wheel, 1 / 120, { record: true });
  assert.equal(wheel.state.phase, 'set');
  assert.equal(wheel.state.match.tooSlow, true);
});

test('agreement is 1 for the same colour and low for opposites', () => {
  assert.equal(agreement('#8f2a20', '#8f2a20'), 1);
  assert.ok(agreement('#000000', '#ffffff') < 0.1);
});

test('a target is deterministic from its seed', () => {
  const colours = ['#8f2a20', '#215a3b', '#cfc9ba'];
  assert.deepEqual(targetFor(3, colours), targetFor(3, colours));
  assert.notDeepEqual(targetFor(3, colours), targetFor(4, colours));
});
