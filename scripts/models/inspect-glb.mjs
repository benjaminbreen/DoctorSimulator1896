// Report what a downloaded GLB actually contains, before converting it.
//
//   node scripts/park/inspect-glb.mjs some_model.glb [more.glb …]
//
// Sizes are the source's own units, so the ratios matter more than the
// numbers. `flat area` lists the heights carrying the most horizontal surface:
// for a seat or a step, that is the height you scale to a real one.

import path from 'node:path';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);

function triangles(primitive) {
  const indices = primitive.getIndices();
  const count = indices ? indices.getCount() : primitive.getAttribute('POSITION').getCount();
  return { count: count / 3, read: (i) => (indices ? indices.getScalar(i) : i) };
}

async function report(file) {
  const document = await io.read(file);
  const root = document.getRoot();
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  let tris = 0;
  // Horizontal surface area per 1% slice of height, for finding seats.
  const slices = new Map();
  const faces = [];

  for (const node of root.listNodes()) {
    const mesh = node.getMesh();
    if (!mesh) continue;
    const m = node.getWorldMatrix();
    const world = (element) => [
      m[0] * element[0] + m[4] * element[1] + m[8] * element[2] + m[12],
      m[1] * element[0] + m[5] * element[1] + m[9] * element[2] + m[13],
      m[2] * element[0] + m[6] * element[1] + m[10] * element[2] + m[14],
    ];
    for (const primitive of mesh.listPrimitives()) {
      const position = primitive.getAttribute('POSITION');
      const { count, read } = triangles(primitive);
      tris += count;
      const at = (index) => {
        const element = [0, 0, 0];
        position.getElement(index, element);
        return world(element);
      };
      for (let i = 0; i < count; i += 1) {
        const a = at(read(i * 3));
        const b = at(read(i * 3 + 1));
        const c = at(read(i * 3 + 2));
        for (const point of [a, b, c]) {
          for (let axis = 0; axis < 3; axis += 1) {
            min[axis] = Math.min(min[axis], point[axis]);
            max[axis] = Math.max(max[axis], point[axis]);
          }
        }
        faces.push([a, b, c]);
      }
    }
  }

  const height = max[1] - min[1];
  for (const [a, b, c] of faces) {
    // Cross product; a face is horizontal when its normal is mostly ±y.
    const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    const area = Math.hypot(...n) / 2;
    if (area === 0 || Math.abs(n[1]) / (area * 2) < 0.8) continue;
    const y = (a[1] + b[1] + c[1]) / 3;
    const slice = Math.round(((y - min[1]) / height) * 100);
    slices.set(slice, (slices.get(slice) ?? 0) + area);
  }

  const top = [...slices.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([slice]) => `${((min[1] + (slice / 100) * height)).toFixed(2)} (${slice}% up)`);

  const extras = root.getAsset().extras ?? {};
  console.log(path.basename(file));
  console.log(`  size    ${max.map((v, i) => (v - min[i]).toFixed(3)).join(' x ')}  (base y ${min[1].toFixed(3)})`);
  console.log(`  tris    ${Math.round(tris).toLocaleString()}`);
  console.log(`  tex     ${root.listTextures().map((t) => t.getSize()?.join('x')).join(', ') || 'none'}`);
  console.log(`  mats    ${root.listMaterials().length}`);
  console.log(`  flat area at  ${top.join(', ')}`);
  if (extras.author) console.log(`  credit  ${extras.title} — ${extras.author} — ${extras.license}`);
}

for (const file of process.argv.slice(2)) await report(file);
