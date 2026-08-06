import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createExpressions } from '../character-lab/src/expressions.js';
import { prepareStylizedModel, updateStylizedModel } from '../character-lab/src/stylized.js';

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
  assert.ok(b.triangles >= 9000 && b.triangles <= 12000, `${b.triangles} is outside the B2 body budget`);
  assert.ok(b.triangles < a.triangles * 0.7, `${b.triangles} is not substantially below ${a.triangles}`);
  assert.ok(b.body.geometry.attributes.skinWeight);
  assert.ok(b.body.geometry.attributes.skinIndex);
});

test('B2 skin treatment preserves weights and supports smile, sadness, and fatigue', async () => {
  const stylized = await loadModel('../character-lab/public/models/mrs-ostrander-1896-stylized.glb');
  const styleValues = {
    seed: 150, age: 0.62, skinTone: '#c99378', stylizedPlaneContrast: 0.3,
    stylizedSkinDetail: 0.42, stylizedSkinWarmth: 0.28, stylizedEyeContrast: 0.3,
    stylizedSurfaceRoughness: 0.82, stylizedTriangleBlend: 0,
    stylizedPigmentVariation: 0.3, stylizedPoreScale: 1, stylizedFreckleAmount: 0.08,
    stylizedCheekBlush: 0.42, stylizedNoseRedness: 0.3, stylizedForeheadWarmth: 0.18,
    stylizedLipTint: 0, stylizedLipColor: '#a45e5c',
  };
  prepareStylizedModel(stylized.scene, styleValues);
  const facts = modelFacts(stylized);
  assert.ok(facts.body.geometry.attributes.color);
  assert.ok(facts.body.geometry.attributes.uv);
  assert.ok(facts.body.geometry.attributes.skinWeight);
  assert.equal(facts.body.material.flatShading, false);
  assert.equal(facts.body.material.isMeshPhysicalMaterial, true);
  assert.ok(facts.body.material.bumpMap?.isDataTexture);
  const flatNormals = new Float32Array(facts.body.geometry.attributes.normal.array);
  const untintedColors = new Float32Array(facts.body.geometry.attributes.color.array);
  updateStylizedModel(stylized.scene, { ...styleValues, stylizedTriangleBlend: 1, stylizedLipTint: 1 });
  assert.ok(facts.body.geometry.attributes.normal.array.some((value, index) => Math.abs(value - flatNormals[index]) > 0.0001));
  assert.ok(facts.body.geometry.attributes.color.array.some((value, index) => Math.abs(value - untintedColors[index]) > 0.0001));
  const expressions = createExpressions(stylized.scene);
  assert.ok(expressions);
  assert.equal(facts.body.morphTargetInfluences.length, 5);
  for (const attribute of facts.body.geometry.morphAttributes.position) {
    assert.ok(attribute.array.some((value) => Math.abs(value) > 0.00001), `${attribute.name} has no visible displacement`);
  }
  expressions.update(0, 0, { smile: 0.5, sadness: 0.4, fatigueExpression: 0.3 });
  assert.ok(facts.body.morphTargetInfluences.every((value) => value > 0));
});
