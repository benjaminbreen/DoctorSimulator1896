import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createExpressions } from '../character-lab/src/expressions.js';
import { prepareStylizedModel } from '../character-lab/src/stylized.js';

globalThis.self = globalThis;
globalThis.ProgressEvent ??= class ProgressEvent {
  constructor(type, properties = {}) { this.type = type; Object.assign(this, properties); }
};
globalThis.createImageBitmap ??= async () => ({ width: 1, height: 1, close() {} });

async function loadModel(relativePath) {
  const data = await readFile(new URL(relativePath, import.meta.url));
  const arrayBuffer = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
  return new GLTFLoader().parseAsync(arrayBuffer, '');
}

function modelFacts(gltf) {
  let body = null;
  let bones = 0;
  gltf.scene.traverse((object) => {
    if (object.name === 'Human_Body') body = object;
    if (object.isBone) bones += 1;
  });
  const triangles = body.geometry.index
    ? body.geometry.index.count / 3
    : body.geometry.attributes.position.count / 3;
  return { body, bones, triangles, clips: gltf.animations.map((clip) => clip.name) };
}

test('A and B exports are the same animated patient on different supported topologies', async () => {
  const [current, stylized] = await Promise.all([
    loadModel('../character-lab/public/models/mrs-ostrander-1896.glb'),
    loadModel('../character-lab/public/models/mrs-ostrander-1896-stylized.glb'),
  ]);
  const a = modelFacts(current);
  const b = modelFacts(stylized);
  assert.ok(a.body?.isSkinnedMesh);
  assert.ok(b.body?.isSkinnedMesh);
  assert.deepEqual(b.clips, a.clips);
  assert.equal(b.bones, a.bones);
  assert.ok(b.triangles < a.triangles * 0.25, `${b.triangles} is not substantially below ${a.triangles}`);
  assert.ok(b.body.geometry.attributes.skinWeight);
  assert.ok(b.body.geometry.attributes.skinIndex);
});

test('B faceting preserves skin weights and supports the shared smile controls', async () => {
  const stylized = await loadModel('../character-lab/public/models/mrs-ostrander-1896-stylized.glb');
  prepareStylizedModel(stylized.scene, {
    seed: 150, stylizedPlaneContrast: 0.46, stylizedEyeContrast: 0.3, stylizedSurfaceRoughness: 0.92,
  });
  const facts = modelFacts(stylized);
  assert.ok(facts.body.geometry.attributes.color);
  assert.ok(facts.body.geometry.attributes.skinWeight);
  assert.equal(facts.body.material.flatShading, true);
  const expressions = createExpressions(stylized.scene);
  assert.ok(expressions);
  assert.equal(facts.body.morphTargetInfluences.length, 2);
});
