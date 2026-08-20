import test from 'node:test';
import assert from 'node:assert/strict';
import { neurastheniaVisual } from '../src/hud/neurastheniaVisual.js';

test('tunnel vision closes and darkens as nervous strain rises', () => {
  const calm = neurastheniaVisual(40);
  const strained = neurastheniaVisual(70);
  const crisis = neurastheniaVisual(95);
  assert.equal(calm.visible, false);
  assert.ok(strained.opacity < crisis.opacity);
  assert.ok(strained.aperture > crisis.aperture);
});
