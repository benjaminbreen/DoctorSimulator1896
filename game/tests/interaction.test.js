import test from 'node:test';
import assert from 'node:assert/strict';
import { isFocusedInteraction } from '../src/world/interaction.js';

test('a seat keeps exploration controls while focused interactions replace them', () => {
  assert.equal(isFocusedInteraction(null), false);
  assert.equal(isFocusedInteraction({ id: 'parlor-chair', kind: 'seat' }), false);
  assert.equal(isFocusedInteraction({ id: 'colour-wheel', instrument: 'colour-wheel' }), true);
  assert.equal(isFocusedInteraction({ id: 'carousel-ride' }), true);
});
