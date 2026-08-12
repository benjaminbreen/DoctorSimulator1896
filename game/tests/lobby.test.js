import test from 'node:test';
import assert from 'node:assert/strict';
import foyer from '../src/world/foyer.blueprint.json' with { type: 'json' };
import lighting from '../src/world/foyer.lighting.json' with { type: 'json' };
import { validateBlueprint } from '../src/world/blueprint.js';
import { lobbyItems } from '../src/world/lobby.js';

test('the office lobby is a narrow circulation space, not the old parlor shell', () => {
  assert.deepEqual(validateBlueprint(foyer), []);
  assert.ok(foyer.dimensions.width < 10);
  assert.ok(foyer.dimensions.depth > foyer.dimensions.width);
  assert.equal(foyer.walls.filter((wall) => wall.openings.some((opening) => opening.type === 'window')).length, 1);
  assert.equal(foyer.transitions.find((transition) => transition.id === 'to-waiting-room')?.to.zone, 'waiting-room');
  assert.ok(!foyer.furniture.some((item) => item.id.startsWith('bench-') || item.id.startsWith('plant-')));
});

test('the lobby dressing supplies its architectural identity', () => {
  const items = lobbyItems(foyer);
  const ids = new Set(items.map((item) => item.id));
  assert.ok([...ids].some((id) => id.startsWith('lobby-dado-')));
  assert.ok([...ids].some((id) => id.startsWith('vestibule-door-')));
  assert.ok([...ids].some((id) => id.startsWith('elevator-1-bar-')));
  assert.ok([...ids].some((id) => id.startsWith('elevator-2-bar-')));
  assert.ok(ids.has('porter-mail-rack'));
  assert.ok(items.filter((item) => item.id.startsWith('lobby-ceiling-cross-')).length >= 5);
});

test('every configured lobby light has a scene marker', () => {
  const markers = new Set(foyer.props.filter((prop) => prop.kind === 'lightMarker').map((prop) => prop.id));
  for (const light of lighting.gaslights) assert.ok(markers.has(light.propId), light.propId);
  const windows = new Set(foyer.walls.flatMap((wall) => wall.openings).map((opening) => opening.id));
  for (const portal of lighting.windowPortals) assert.ok(windows.has(portal.windowId), portal.windowId);
});

