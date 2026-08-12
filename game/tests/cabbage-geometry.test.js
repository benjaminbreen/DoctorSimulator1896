import test from 'node:test';
import assert from 'node:assert/strict';
import { Vector3 } from 'three';
import { createCabbageGeometry } from '../src/scene/cabbageGeometry.js';
import { PUSHCART_SPECS } from '../src/world/pushcarts.js';

function finiteAttribute(attribute) {
  for (const value of attribute.array) if (!Number.isFinite(value)) return false;
  return true;
}

test('the shared cabbage mesh is squat, coloured, and stays within its triangle budget', () => {
  const geometry = createCabbageGeometry();
  const position = geometry.getAttribute('position');
  const color = geometry.getAttribute('color');
  const normal = geometry.getAttribute('normal');
  const triangles = geometry.getIndex().count / 3;

  assert.ok(finiteAttribute(position));
  assert.ok(finiteAttribute(color));
  assert.ok(finiteAttribute(normal));
  assert.ok(triangles >= 220, 'the outer leaf layer is missing');
  assert.ok(triangles <= 260, `${triangles} triangles exceeds the cabbage budget`);

  const size = geometry.boundingBox.getSize(new Vector3());
  assert.ok(Math.max(size.x, size.z) > size.y * 1.2, 'the head should read wider than tall');

  let darkest = Infinity;
  let lightest = -Infinity;
  for (let index = 0; index < color.count; index += 1) {
    darkest = Math.min(darkest, color.getY(index));
    lightest = Math.max(lightest, color.getY(index));
  }
  assert.ok(lightest - darkest > 0.3, 'leaf seams need visible colour separation');

  // The centre is the seventh vertex of each outer leaf. Its normal must
  // point away from the head or front-face culling will erase that leaf.
  const coreVertices = 1 + 18 * 6 + 1;
  for (let leaf = 0; leaf < 6; leaf += 1) {
    const centre = coreVertices + leaf * 7 + 6;
    const angle = (leaf / 6) * Math.PI * 2 + 0.08;
    const outward = normal.getX(centre) * Math.cos(angle) + normal.getZ(centre) * Math.sin(angle);
    assert.ok(outward > 0.5, `outer leaf ${leaf} faces into the head`);
  }
  geometry.dispose();
});

test('cart cabbages keep one rendered part and a simple ball collider', () => {
  const cart = PUSHCART_SPECS.find((spec) => spec.id === 'cart-savoy');
  const cabbages = cart.pieces.filter((piece) => piece.parts[0]?.shape === 'cabbage');

  assert.ok(cabbages.length >= 10);
  for (const cabbage of cabbages) {
    assert.equal(cabbage.throwable, 'cabbage');
    assert.equal(cabbage.parts.length, 1);
    assert.equal(cabbage.collider.type, 'ball');
    assert.equal(cabbage.parts[0].vertexColors, true);
  }
});

test('cart apples advertise the generic apple throwable type', () => {
  const cart = PUSHCART_SPECS.find((spec) => spec.load === 'apples');
  const apples = cart.pieces.filter((piece) => piece.throwable === 'apple');
  assert.ok(apples.length >= 20);
  for (const apple of apples) {
    assert.equal(apple.collider.type, 'ball');
    assert.equal(apple.parts[0].shape, 'sphere');
  }
});
