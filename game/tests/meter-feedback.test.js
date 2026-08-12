import test from 'node:test';
import assert from 'node:assert/strict';
import {
  mergeMeterFeedback,
  meterFeedbackStrength,
  meterFeedbackStyle,
} from '../src/world/meterFeedback.js';

test('all four signed meter changes have distinct visual treatments', () => {
  assert.equal(meterFeedbackStyle('health', 2).kind, 'health-gain');
  assert.equal(meterFeedbackStyle('health', -2).kind, 'health-loss');
  assert.equal(meterFeedbackStyle('neurasthenia', 5).kind, 'neurasthenia-gain');
  assert.equal(meterFeedbackStyle('neurasthenia', -5).kind, 'neurasthenia-loss');
  assert.equal(meterFeedbackStyle('unknown', 2), null);
  assert.equal(meterFeedbackStyle('health', 0), null);
  assert.ok(meterFeedbackStrength(10) > meterFeedbackStrength(2));
  assert.equal(meterFeedbackStrength(100), 1);
});

test('nearby changes combine unless the same meter reverses direction', () => {
  const first = mergeMeterFeedback(null, {
    source: 'a', label: 'First', changes: { health: -2, neurasthenia: 0 },
  }, 1000, 1);
  const combined = mergeMeterFeedback(first, {
    source: 'b', label: 'Second', changes: { health: -3, neurasthenia: 4 },
  }, 1200, 2);
  assert.deepEqual(combined.event.changes, { health: -5, neurasthenia: 4 });
  assert.equal(combined.id, 2);

  const reversed = mergeMeterFeedback(combined, {
    source: 'c', label: 'Recovered', changes: { health: 2 },
  }, 1250, 3);
  assert.deepEqual(reversed.event.changes, { health: 2 });
  assert.equal(reversed.event.label, 'Recovered');
});
