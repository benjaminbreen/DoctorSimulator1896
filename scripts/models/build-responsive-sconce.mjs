// Split the existing sconce's disconnected shades at their lower fittings.
// All triangles, UVs and materials survive; the source GLB stays untouched.
import path from 'node:path';
import assert from 'node:assert/strict';
import { prune } from '@gltf-transform/functions';
import { createIO, compressAccessors, triangleCount } from '../lib/glb-pipeline.mjs';

const dir = path.resolve(import.meta.dirname, '../../game/public/models/victorian');
const io = await createIO();
const document = await io.read(path.join(dir, 'Sconce.glb'));
const root = document.getRoot();
const node = root.listNodes().find((entry) => entry.getMesh());
const mesh = node.getMesh();
const primitive = mesh.listPrimitives()[0];
const position = primitive.getAttribute('POSITION');
const indices = primitive.getIndices();
const before = triangleCount(root);
const parents = Array.from({ length: position.getCount() }, (_, i) => i);
const find = (i) => parents[i] === i ? i : (parents[i] = find(parents[i]));
const join = (a, b) => { parents[find(a)] = find(b); };
const welded = new Map();
for (let i = 0; i < position.getCount(); i += 1) {
  const key = position.getElement(i, []).map((v) => v.toFixed(5)).join(',');
  if (welded.has(key)) join(i, welded.get(key));
  else welded.set(key, i);
}
for (let i = 0; i < indices.getCount(); i += 3) {
  join(indices.getScalar(i), indices.getScalar(i + 1));
  join(indices.getScalar(i), indices.getScalar(i + 2));
}
const bounds = new Map();
for (let i = 0; i < position.getCount(); i += 1) {
  const key = find(i);
  if (!bounds.has(key)) bounds.set(key, { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] });
  const box = bounds.get(key);
  position.getElement(i, []).forEach((v, axis) => {
    box.min[axis] = Math.min(box.min[axis], v);
    box.max[axis] = Math.max(box.max[axis], v);
  });
}
const parts = [[], [], []];
for (let i = 0; i < indices.getCount(); i += 3) {
  const triangle = [0, 1, 2].map((j) => indices.getScalar(i + j));
  const box = bounds.get(find(triangle[0]));
  // These bounds belong to Sconce.glb, in its original mesh coordinates.
  const shade = box.min[1] > 0.19 && (box.max[0] < -0.13 || box.min[0] > 0.13);
  parts[shade ? (box.max[0] < 0 ? 1 : 2) : 0].push(...triangle);
}
node.setMesh(null);
for (let part = 0; part < 3; part += 1) {
  assert(parts[part].length > 0);
  const index = document.createAccessor().setType('SCALAR')
    .setArray(new Uint16Array(parts[part])).setBuffer(root.listBuffers()[0]);
  const piece = primitive.clone().setIndices(index);
  const child = document.createNode().setMesh(document.createMesh().addPrimitive(piece));
  if (part === 0) node.addChild(child.setName('sconce-mount'));
  else {
    const pivot = [(part === 1 ? -1 : 1) * 0.2605, 0.198, 0.2395];
    const joint = document.createNode(part === 1 ? 'shade-left' : 'shade-right').setTranslation(pivot);
    child.setTranslation(pivot.map((v) => -v));
    node.addChild(joint.addChild(child));
  }
}
mesh.dispose();
await document.transform(prune({ keepAttributes: true, keepSolidTextures: true }));
assert.equal(triangleCount(root), before);
await compressAccessors(document, null);
const output = path.join(dir, 'Sconce-responsive.glb');
await io.write(output, document);
assert.equal(triangleCount((await io.read(output)).getRoot()), before);
console.log(`Saved ${output}: ${before} triangles, two separate shades.`);
