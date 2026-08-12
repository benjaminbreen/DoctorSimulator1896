import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createInductionCoil,
  step,
  secondaryVolts,
  shockCurrent,
  sparkReach,
  bandFor,
  effectForShock,
  LIMITS,
} from '../src/instruments/inductionCoil.js';

function run(instrument, input, seconds = 1, dt = 1 / 120) {
  let first = { ...input };
  for (let t = 0; t < seconds; t += dt) {
    step(instrument, dt, first);
    first = {};
  }
  return instrument.state;
}

test('running the secondary in raises the shock, running it out kills it', () => {
  assert.ok(secondaryVolts(0, 2) > secondaryVolts(10, 2));
  assert.ok(secondaryVolts(10, 2) > secondaryVolts(20, 2));
  // The far end of the slide is a prickle, not nothing and not a shock.
  const far = shockCurrent(secondaryVolts(20, 1));
  assert.ok(far > 0.05 && far < 2, `${far} mA at the end of the scale`);
});

test('cells scale the output', () => {
  assert.ok(secondaryVolts(8, 3) > secondaryVolts(8, 1));
  assert.ok(Math.abs(secondaryVolts(8, 2) / secondaryVolts(8, 1) - 2) < 1e-9);
});

test('the worst setting is past the let-go threshold', () => {
  const milliamps = shockCurrent(secondaryVolts(0, 3));
  assert.ok(milliamps > 30, `${milliamps} mA should be dangerous`);
  assert.equal(bandFor(milliamps).tone, 'hurt');
});

test('shock consequences are deterministic and rise with the current', () => {
  assert.deepEqual(effectForShock(0.5), {
    health: 0,
    neurasthenia: 0,
    down: 0,
    label: 'Tested the induction coil',
  });
  assert.ok(effectForShock(12).health > effectForShock(7).health);
  assert.ok(effectForShock(35).health > effectForShock(12).health);
  assert.equal(effectForShock(35).down, 1.5);
  assert.equal(effectForShock(35, 2).health, effectForShock(35).health * 2);
});

test('a spark only jumps a gap the volts can reach', () => {
  const coil = createInductionCoil({ distance: 0, cells: 3, gap: LIMITS.gap[0] });
  step(coil, 0, { key: true });
  assert.equal(coil.state.sparking, true);
  step(coil, 0, { setGap: LIMITS.gap[1] });
  assert.equal(coil.state.sparking, false, 'six millimetres is beyond it');
  // And the reach is the honest one: three kilovolts a millimetre.
  assert.ok(Math.abs(sparkReach(9000) - 3) < 1e-9);
});

test('the hammer breaks the circuit about sixty times a second', () => {
  const coil = createInductionCoil();
  const state = run(coil, { key: true }, 1);
  assert.ok(Math.abs(state.breaks - coil.hammerRate) <= 2, `${state.breaks} breaks in a second`);
});

test('nothing runs with the key open', () => {
  const coil = createInductionCoil({ distance: 0, cells: 3 });
  const state = run(coil, {}, 0.5);
  assert.equal(state.breaks, 0);
  assert.equal(state.volts, 0);
  assert.equal(state.sparking, false);
});

test('taking the electrodes with the key open does nothing', () => {
  const coil = createInductionCoil({ distance: 0, cells: 3 });
  step(coil, 0, { grasp: true });
  assert.equal(coil.state.holding, true);
  assert.equal(coil.state.lastShock, null);
});

test('a sustained severe shock throws you clear after causing harm', () => {
  const coil = createInductionCoil({ distance: 0, cells: 3 });
  step(coil, 0, { grasp: true });
  step(coil, 0, { key: true });
  assert.equal(coil.state.lastShock.tone, 'hurt');
  assert.equal(coil.state.running, true);
  run(coil, {}, 2.1);
  assert.equal(coil.state.running, false, 'a sustained contraction throws the subject clear');
  assert.equal(coil.state.holding, false);
  assert.ok(coil.state.shocks >= 3, 'onset plus timed exposure events');
  assert.ok(coil.state.lastShock.effect.health > 0);
});

test('a mild shock leaves the machine running', () => {
  const coil = createInductionCoil({ distance: 18, cells: 1 });
  step(coil, 0, { key: true });
  step(coil, 0, { grasp: true });
  assert.notEqual(coil.state.lastShock.tone, 'hurt');
  assert.equal(coil.state.running, true);
});

test('settings are clamped to the slide and the battery', () => {
  const coil = createInductionCoil();
  step(coil, 0, { setDistance: 900, setCells: 9, setGap: -4 });
  assert.equal(coil.state.distance, LIMITS.distance[1]);
  assert.equal(coil.state.cells, LIMITS.cells[1]);
  assert.equal(coil.state.gap, LIMITS.gap[0]);
});

test('the worst shock taken is remembered', () => {
  const coil = createInductionCoil({ distance: 16, cells: 1 });
  step(coil, 0, { grasp: true });
  step(coil, 0, { key: true });
  const mild = coil.state.worst;
  step(coil, 0, { setDistance: 2 });
  run(coil, {}, 1.1);
  assert.ok(coil.state.worst > mild);
  assert.ok(coil.state.shocks >= 2);
});
