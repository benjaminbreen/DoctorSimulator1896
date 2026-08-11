import test from 'node:test';
import assert from 'node:assert/strict';
import { dressWindows, portalDimming } from '../src/world/windowDressing.js';

function window(id, normal = [0, 0, 1]) {
  return { id, type: 'window', normal, width: 1.3, height: 2.2, thickness: 0.24 };
}

test('a parlor gets lace and drapery, never blinds', () => {
  const plans = dressWindows([window('a')], { wealth: 'grand', role: 'parlor', seed: 3 });
  const plan = plans.get('a');
  assert.equal(plan.lace, true);
  assert.equal(plan.heavy, true);
  assert.equal(plan.valance, true);
  assert.equal(plan.blind, null);
  assert.ok(plan.shade);
});

test('an office gets a blind instead of shade and lace', () => {
  const plan = dressWindows([window('a')], { role: 'office', seed: 3 }).get('a');
  assert.ok(plan.blind);
  assert.equal(plan.shade, null);
  assert.equal(plan.lace, false);
  assert.equal(plan.valance, false);
});

test('a humble parlor keeps the shade and lace but loses the drapery', () => {
  const plan = dressWindows([window('a')], { wealth: 'humble', seed: 5 }).get('a');
  assert.equal(plan.heavy, false);
  assert.equal(plan.valance, false);
  assert.equal(plan.lace, true);
});

test('doors and other openings are not dressed', () => {
  const plans = dressWindows([{ id: 'd', type: 'door', normal: [0, 0, 1] }], {});
  assert.equal(plans.size, 0);
});

test('shades on one wall are drawn to nearly the same height', () => {
  const plans = dressWindows(
    [window('a'), window('b'), window('c')],
    { role: 'parlor', seed: 9 },
  );
  const drops = ['a', 'b', 'c'].map((id) => plans.get(id).shade.drop);
  const spread = Math.max(...drops) - Math.min(...drops);
  assert.ok(spread < 0.13, `same-wall shades should agree, spread was ${spread}`);
});

test('windows on different walls are drawn independently', () => {
  const plans = dressWindows(
    [window('a', [0, 0, 1]), window('b', [1, 0, 0])],
    { role: 'parlor', seed: 9 },
  );
  assert.notEqual(plans.get('a').shade.drop, plans.get('b').shade.drop);
});

test('the same seed always plans the same room', () => {
  const holes = [window('a'), window('b', [1, 0, 0])];
  const first = dressWindows(holes, { role: 'parlor', seed: 12 });
  const second = dressWindows(holes, { role: 'parlor', seed: 12 });
  assert.deepEqual([...first.entries()], [...second.entries()]);
});

test('every layer takes light, and none of it takes all of it', () => {
  const bare = dressWindows([window('a')], { role: 'service', seed: 1 }).get('a');
  const dressed = dressWindows([window('a')], { wealth: 'grand', seed: 1 }).get('a');
  assert.ok(dressed.openFraction < bare.openFraction);
  for (const plan of [bare, dressed]) {
    assert.ok(plan.openFraction > 0 && plan.openFraction <= 1);
    assert.ok(portalDimming(plan) > plan.openFraction);
    assert.ok(portalDimming(plan) <= 1);
  }
});

test('an undressed window is not dimmed', () => {
  assert.equal(portalDimming(undefined), 1);
});
