import test from 'node:test';
import assert from 'node:assert/strict';
import { POSTED_NPCS, POSTED_NPC_MODEL_FILES, POSTED_NPC_MOTION_FILES } from '../src/world/postedNpcs.js';
import { PUSHCART_SPECS } from '../src/world/pushcarts.js';
import { ROADS, ROAD_TOP, WALK_TOP } from '../src/world/streetGrid.js';
import { rollIdentity } from '../src/world/npcIdentity.js';

function roadUnder(x, z) {
  return ROADS.find((road) => (road.axis === 'z'
    ? z >= road.lo && z <= road.hi && x >= road.from && x <= road.to
    : x >= road.lo && x <= road.hi && z >= road.from && z <= road.to));
}

test('a figure on pavement height is not standing in a roadway', () => {
  for (const npc of POSTED_NPCS) {
    const [x, y, z] = npc.position;
    const road = roadUnder(x, z);
    if (y === WALK_TOP) {
      assert.equal(road, undefined, `${npc.id} stands on pavement inside road ${road?.id}`);
    } else {
      // Roadway figures are deliberate: the vendors work beside carts that
      // sit in the street, which is what lets a wagon hit them.
      assert.equal(y, ROAD_TOP, `${npc.id} uses neither pavement nor roadway height`);
      assert.ok(road, `${npc.id} stands at road height but off every roadway`);
    }
  }
});

test('every vendor owns a real cart and stands within reach of it', () => {
  const carts = new Map(PUSHCART_SPECS.map((cart) => [cart.id, cart]));
  const owners = POSTED_NPCS.filter((npc) => npc.ownsId);
  assert.ok(owners.length > 0, 'at least one figure owns a cart');
  for (const npc of owners) {
    const cart = carts.get(npc.ownsId);
    assert.ok(cart, `${npc.id} owns unknown cart ${npc.ownsId}`);
    const gap = Math.hypot(cart.position[0] - npc.position[0], cart.position[2] - npc.position[2]);
    assert.ok(gap < 4, `${npc.id} stands ${gap.toFixed(1)}m from its own cart`);
    // A manned cart belongs at the curb, not out in the roadbed.
    assert.equal(
      roadUnder(cart.position[0], cart.position[2]),
      undefined,
      `${cart.id} sits in a roadway instead of at the curb`,
    );
  }
  // The cabbage cart is the authored collision set piece and stays in the road.
  const cabbage = carts.get('cart-savoy');
  assert.ok(roadUnder(cabbage.position[0], cabbage.position[2]), 'cart-savoy must stay hittable');
  assert.equal(new Set(owners.map((npc) => npc.ownsId)).size, owners.length, 'one owner per cart');
});

test('posted figures roll identities and load stable asset lists', () => {
  assert.equal(POSTED_NPC_MODEL_FILES.length, POSTED_NPCS.length);
  assert.equal(POSTED_NPC_MOTION_FILES.length, POSTED_NPCS.length);
  assert.equal(new Set(POSTED_NPCS.map((npc) => npc.id)).size, POSTED_NPCS.length);
  for (const npc of POSTED_NPCS) {
    assert.ok(rollIdentity(npc.archetype, 7), `${npc.id} archetype '${npc.archetype}' has no table`);
    assert.ok(npc.idleClip && npc.dialogueName && npc.role);
  }
});
