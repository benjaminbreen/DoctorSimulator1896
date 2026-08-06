import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createExpressions } from '../character-lab/src/expressions.js';
import {
  prepareSkinModel, prepareStylizedModel, updateSkinModel, updateStylizedModel,
} from '../character-lab/src/stylized.js';

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

function morphValues(root, name) {
  const values = [];
  root.traverse((object) => {
    const index = object.morphTargetDictionary?.[name];
    if (index !== undefined) values.push({ object, value: object.morphTargetInfluences[index] });
  });
  return values;
}

function difference(a, b) {
  let sum = 0;
  let maximum = 0;
  for (let index = 0; index < a.length; index++) {
    const delta = Math.abs(a[index] - b[index]);
    sum += delta * delta;
    maximum = Math.max(maximum, delta);
  }
  return { rms: Math.sqrt(sum / a.length), maximum };
}

function skinSnapshot(root) {
  const body = root.getObjectByName('Human_Body');
  const eyes = root.getObjectByName('Eyes');
  return {
    colors: new Float32Array(body.geometry.attributes.color.array),
    normals: new Float32Array(body.geometry.attributes.normal.array),
    faceOverlay: new Uint8Array(body.userData.faceOverlay.data),
    bumpScale: body.material.bumpScale,
    poreRepeat: body.material.bumpMap.repeat.x,
    eyeColor: new Float32Array(eyes.material.color.toArray()),
  };
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

test('renderer A exports and coordinates MPFB face units across fitted facial meshes', async () => {
  const current = await loadModel('../character-lab/public/models/mrs-ostrander-1896.glb');
  const facts = modelFacts(current);
  const required = ['mouthSmileLeft', 'mouthSmileRight', 'browInnerUp', 'eyeBlinkLeft', 'eyeBlinkRight'];
  for (const name of required) assert.ok(facts.body.morphTargetDictionary[name] !== undefined, `${name} is missing from renderer A`);
  assert.ok(Object.keys(facts.body.morphTargetDictionary).length >= 50);
  assert.ok(morphValues(current.scene, 'browInnerUp').length >= 2, 'browInnerUp was not interpolated to fitted brows');
  assert.ok(morphValues(current.scene, 'jawOpen').length >= 2, 'jawOpen was not interpolated to fitted teeth');

  const expressions = createExpressions(current.scene);
  assert.equal(expressions.mode, 'mpfb-faceunits');
  assert.deepEqual(expressions.availableUnits, Object.keys(facts.body.morphTargetDictionary).sort());
  expressions.update(0, 0, { smile: 0.5, sadness: 0, fatigueExpression: 0 });
  assert.ok(morphValues(current.scene, 'mouthSmileLeft').every(({ value }) => value > 0));
  assert.ok(morphValues(current.scene, 'cheekSquintRight').every(({ value }) => value > 0));

  assert.equal(expressions.setDebugUnit('eyeWideLeft', 0.63), true);
  expressions.update(0, 1, { smile: 0.5, sadness: 0.5, fatigueExpression: 0.5 });
  assert.ok(morphValues(current.scene, 'eyeWideLeft').every(({ value }) => Math.abs(value - 0.63) < 1e-6));
  assert.ok(morphValues(current.scene, 'mouthSmileLeft').every(({ value }) => value === 0));

  expressions.clearDebug();
  expressions.setRestingFace({ mouthStretchLeft: 0.55, mouthStretchRight: 0.58, browOuterUpLeft: 0.12 });
  expressions.update(0, 2, { smile: 0, sadness: 0, fatigueExpression: 0 });
  assert.ok(morphValues(current.scene, 'mouthStretchLeft').every(({ value }) => Math.abs(value - 0.55) < 1e-6));
  assert.ok(morphValues(current.scene, 'mouthStretchRight').every(({ value }) => Math.abs(value - 0.58) < 1e-6));
  assert.ok(morphValues(current.scene, 'browOuterUpLeft').every(({ value }) => Math.abs(value - 0.12) < 1e-6));
  assert.deepEqual(expressions.restingFace, { mouthStretchLeft: 0.55, mouthStretchRight: 0.58, browOuterUpLeft: 0.12 });
});

test('renderer A supports live skin treatment without changing topology or facial targets', async () => {
  const current = await loadModel('../character-lab/public/models/mrs-ostrander-1896.glb');
  const facts = modelFacts(current);
  const positionCount = facts.body.geometry.attributes.position.count;
  const indexCount = facts.body.geometry.index.count;
  const morphCount = facts.body.geometry.morphAttributes.position.length;
  const smoothNormals = new Float32Array(facts.body.geometry.attributes.normal.array);
  const values = {
    seed: 221, age: 0.58, skinTone: '#c99378', stylizedPlaneContrast: 0.1,
    stylizedSkinDetail: 0.1, stylizedSkinWarmth: 0.1, stylizedEyeContrast: 0.1,
    stylizedSurfaceRoughness: 0.72, stylizedTriangleBlend: 0,
    stylizedPigmentVariation: 0.05, stylizedPoreScale: 0.7, stylizedFreckleAmount: 0,
    stylizedCheekBlush: 0.1, stylizedNoseRedness: 0.1, stylizedForeheadWarmth: 0.1,
    stylizedLipTint: 0, stylizedLipColor: '#a45e5c',
  };

  prepareSkinModel(current.scene, values);
  assert.equal(facts.body.geometry.attributes.position.count, positionCount);
  assert.equal(facts.body.geometry.index.count, indexCount);
  assert.equal(facts.body.geometry.morphAttributes.position.length, morphCount);
  assert.ok(facts.body.material.map, 'renderer A diffuse texture was discarded');
  assert.ok(facts.body.material.bumpMap?.isDataTexture);
  assert.ok(facts.body.geometry.attributes.color);
  const restrainedColors = new Float32Array(facts.body.geometry.attributes.color.array);
  const restrainedPoreRepeat = facts.body.material.bumpMap.repeat.x;
  assert.ok(facts.body.geometry.attributes.normal.array.some((value, index) => Math.abs(value - smoothNormals[index]) > 0.00001));

  updateSkinModel(current.scene, {
    ...values, stylizedTriangleBlend: 1, stylizedPlaneContrast: 0.8,
    stylizedSkinDetail: 0.9, stylizedPoreScale: 2.2, stylizedPigmentVariation: 0.9, stylizedFreckleAmount: 0.7,
    stylizedCheekBlush: 0.9, stylizedNoseRedness: 0.8, stylizedLipTint: 0.9,
    stylizedEyeContrast: 0.9,
  });
  assert.ok(facts.body.geometry.attributes.color.array.some((value, index) => Math.abs(value - restrainedColors[index]) > 0.0001));
  assert.ok(facts.body.geometry.attributes.normal.array.every((value, index) => Math.abs(value - smoothNormals[index]) < 1e-6));
  assert.ok(facts.body.material.bumpScale > 0.001);
  assert.ok(facts.body.material.bumpMap.repeat.x < restrainedPoreRepeat);
});

test('shared skin controls produce perceptible endpoint changes on both renderers', async () => {
  const variants = [
    ['A', '../character-lab/public/models/mrs-ostrander-1896.glb', false],
    ['B', '../character-lab/public/models/mrs-ostrander-1896-stylized.glb', true],
  ];
  const baseline = {
    seed: 4800, age: 0.63, skinTone: '#b87e61', stylizedPlaneContrast: 0.3,
    stylizedTriangleBlend: 0.4, stylizedSkinDetail: 0.4, stylizedPoreScale: 1,
    stylizedPigmentVariation: 0.3, stylizedFreckleAmount: 0.1, stylizedSkinWarmth: 0.3,
    stylizedCheekBlush: 0.4, stylizedNoseRedness: 0.3, stylizedForeheadWarmth: 0.2,
    stylizedLipTint: 0.5, stylizedLipColor: '#a6544a', stylizedEyeContrast: 0.3,
    stylizedSurfaceRoughness: 0.8,
  };
  const ranges = {
    stylizedPlaneContrast: [0, 1], stylizedTriangleBlend: [0, 1],
    stylizedSkinDetail: [0, 1], stylizedPoreScale: [0.35, 2.5],
    stylizedPigmentVariation: [0, 1], stylizedFreckleAmount: [0, 1],
    stylizedSkinWarmth: [-1, 1], stylizedCheekBlush: [0, 1],
    stylizedNoseRedness: [0, 1], stylizedForeheadWarmth: [0, 1],
    stylizedLipTint: [0, 1], stylizedEyeContrast: [0, 1],
  };

  for (const [label, path, stylized] of variants) {
    const gltf = await loadModel(path);
    prepareSkinModel(gltf.scene, baseline, { stylized });
    const effects = {};
    for (const [control, [minimum, maximum]] of Object.entries(ranges)) {
      updateSkinModel(gltf.scene, { ...baseline, [control]: minimum });
      const low = skinSnapshot(gltf.scene);
      updateSkinModel(gltf.scene, { ...baseline, [control]: maximum });
      const high = skinSnapshot(gltf.scene);
      effects[control] = {
        color: difference(low.colors, high.colors),
        normal: difference(low.normals, high.normals),
        faceOverlay: difference(low.faceOverlay, high.faceOverlay),
        eye: difference(low.eyeColor, high.eyeColor),
        bump: Math.abs(high.bumpScale - low.bumpScale),
        pore: Math.abs(high.poreRepeat - low.poreRepeat),
      };
    }
    assert.ok(effects.stylizedPlaneContrast.color.rms > 0.045, `${label} plane contrast is imperceptible`);
    assert.ok(effects.stylizedTriangleBlend.normal.rms > 0.07, `${label} smoothing is imperceptible`);
    assert.ok(effects.stylizedSkinDetail.bump > 0.003, `${label} micro-detail is imperceptible`);
    assert.ok(effects.stylizedPoreScale.pore > 2.5, `${label} pore scale is imperceptible`);
    assert.ok(effects.stylizedPigmentVariation.color.rms > 0.006, `${label} pigment variation is imperceptible`);
    assert.equal(effects.stylizedFreckleAmount.color.maximum, 0, `${label} freckles still expose mesh triangles`);
    assert.ok(effects.stylizedFreckleAmount.faceOverlay.rms > 0.5, `${label} freckles are imperceptible`);
    assert.ok(effects.stylizedSkinWarmth.color.rms > 0.1, `${label} warmth is imperceptible`);
    assert.ok(effects.stylizedCheekBlush.color.maximum > 0.12, `${label} cheek blush is imperceptible`);
    assert.ok(effects.stylizedNoseRedness.color.maximum > 0.1, `${label} nose redness is imperceptible`);
    assert.ok(effects.stylizedForeheadWarmth.color.maximum > 0.045, `${label} forehead warmth is imperceptible`);
    assert.equal(effects.stylizedLipTint.color.maximum, 0, `${label} lip tint still bleeds through mesh vertices`);
    assert.ok(effects.stylizedLipTint.faceOverlay.maximum > 40, `${label} lip tint is imperceptible`);
    assert.ok(effects.stylizedEyeContrast.eye.rms > 0.2, `${label} eye contrast is imperceptible`);
  }
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
  assert.ok(facts.body.userData.faceOverlay?.texture?.isDataTexture);
  assert.ok(facts.body.userData.faceOverlay.spots.length >= 150);
  const shader = {
    uniforms: {},
    vertexShader: '#include <uv_vertex>',
    fragmentShader: '#include <map_fragment>',
  };
  facts.body.material.onBeforeCompile(shader, {});
  assert.equal(shader.uniforms.skinFaceOverlay.value, facts.body.userData.faceOverlay.texture);
  assert.match(shader.fragmentShader, /texture2D\(skinFaceOverlay, vSkinFaceUv\)/);
  const flatNormals = new Float32Array(facts.body.geometry.attributes.normal.array);
  const untintedOverlay = new Uint8Array(facts.body.userData.faceOverlay.data);
  updateStylizedModel(stylized.scene, { ...styleValues, stylizedTriangleBlend: 1, stylizedLipTint: 1 });
  assert.ok(facts.body.geometry.attributes.normal.array.some((value, index) => Math.abs(value - flatNormals[index]) > 0.0001));
  assert.ok(facts.body.userData.faceOverlay.data.some((value, index) => value !== untintedOverlay[index]));
  const expressions = createExpressions(stylized.scene);
  assert.ok(expressions);
  assert.equal(expressions.mode, 'legacy-procedural');
  assert.equal(facts.body.morphTargetInfluences.length, 5);
  for (const attribute of facts.body.geometry.morphAttributes.position) {
    assert.ok(attribute.array.some((value) => Math.abs(value) > 0.00001), `${attribute.name} has no visible displacement`);
  }
  expressions.update(0, 0, { smile: 0.5, sadness: 0.4, fatigueExpression: 0.3 });
  assert.ok(facts.body.morphTargetInfluences.every((value) => value > 0));
});
