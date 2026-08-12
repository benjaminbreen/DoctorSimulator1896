import test from 'node:test';
import assert from 'node:assert/strict';
import {
  facadeWindowAt,
  impactNormal,
  resolvedImpactVelocity,
} from '../src/world/projectileImpacts.js';
import { THROWABLE_TYPES } from '../src/world/throwables.js';
import { streetItems } from '../src/world/streetGrid.js';

test('ground impacts lose most vertical and horizontal energy', () => {
  const incoming = [7, -8, 2];
  const result = resolvedImpactVelocity(incoming, [0, 1, 0], THROWABLE_TYPES.cabbage);
  assert.ok(result[1] >= 0 && result[1] < 1.1, `vertical rebound ${result[1]}`);
  assert.ok(Math.hypot(...result) < Math.hypot(...incoming) * 0.5);
});

test('wall impacts deflect outward without cannonball ricochet speed', () => {
  const incoming = [12, 1, 3];
  const normal = impactNormal([1, 0, 0], incoming);
  const result = resolvedImpactVelocity(incoming, normal, THROWABLE_TYPES.apple);
  assert.ok(normal[0] < 0);
  assert.ok(result[0] < 0);
  assert.ok(Math.hypot(...result) <= THROWABLE_TYPES.apple.impactSpeedCap + 1e-9);
});

test('procedural facade hit testing finds panes but not masonry', () => {
  const building = streetItems.find(
    (item) => item.kind === 'backdrop' && item.windowFaces?.length,
  );
  assert.ok(building);
  // Probe the generated pane records until one known pane centre is found.
  const [cx, cy, cz] = building.position;
  const [sx, sy, sz] = building.size;
  const token = building.windowFaces[0];
  const normal = token.endsWith('z')
    ? [0, 0, token[0] === '+' ? 1 : -1]
    : [token[0] === '+' ? 1 : -1, 0, 0];
  const point = [
    cx + normal[0] * (sx / 2),
    cy + sy * 0.25,
    cz + normal[2] * (sz / 2),
  ];
  // The rough probe may land between panes; scan a small facade grid.
  let pane = null;
  for (let y = cy - sy * 0.35; y < cy + sy * 0.4 && !pane; y += 0.08) {
    for (let across = -0.45; across <= 0.45 && !pane; across += 0.01) {
      const candidate = [...point];
      candidate[1] = y;
      if (normal[2]) candidate[0] = cx + sx * across;
      else candidate[2] = cz + sz * across;
      pane = facadeWindowAt(candidate, [building]);
    }
  }
  assert.ok(pane, building.id);
  assert.equal(facadeWindowAt([cx, cy + sy * 0.48, cz], [building]), null);
});
