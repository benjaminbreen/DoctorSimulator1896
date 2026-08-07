import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createExpressions } from '../character-lab/src/expressions.js';
import { createMhrController } from '../character-lab/src/mhr.js';
import { prepareSkinModel, updateSkinModel } from '../character-lab/src/stylized.js';

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

test('A/B comparison assets expose their intended rig and identity controls', async () => {
  const [current, mhr] = await Promise.all([
    loadModel('../character-lab/public/models/mrs-ostrander-1896.glb'),
    loadModel('../character-lab/public/models/comparison-mhr-lod1.glb'),
  ]);
  const a = modelFacts(current);
  assert.ok(a.body?.isSkinnedMesh);
  const mhrBody = mhr.scene.getObjectByName('body_mesh');
  assert.ok(mhrBody?.isSkinnedMesh);
  assert.equal(Object.keys(mhrBody.morphTargetDictionary).length, 117);
  assert.equal(mhrBody.morphTargetDictionary.shape_0, 0);
  assert.equal(mhrBody.morphTargetDictionary.shape_116, 116);
  let mhrBones = 0;
  mhr.scene.traverse((object) => { if (object.isBone) mhrBones += 1; });
  assert.equal(mhrBones, 126);
  assert.ok(mhrBody.geometry.attributes.skinWeight);
  assert.ok(mhrBody.geometry.attributes.skinIndex);
});

test('MHR identity/build controls deform the mesh and drive a seated full-body rig', async () => {
  const gltf = await loadModel('../character-lab/public/models/comparison-mhr-lod1.glb');
  const body = gltf.scene.getObjectByName('body_mesh');
  const values = {
    seed: 6005, gender: 0.5, age: 0.7, height: 0.5, weight: 0.5, muscle: 0.35,
    proportions: 0.5, shoulderWidth: 0, torsoLength: 0, headShape: 'oval', headShapeStrength: 0.4,
    seated: 1, kneesTogether: 0.7, posture: 0.1, headTurn: 0, headTilt: 0,
    breathing: 0, breathingRate: 13,
  };
  const controller = createMhrController(gltf.scene, values);
  assert.ok(controller);
  assert.equal(controller.bones.size, 126);
  assert.equal(controller.seatedBlend, 1);
  assert.ok(gltf.scene.position.y < -0.3, 'seated pose should lower the pelvis toward the chair');
  const seatedThigh = controller.bones.get('r_upleg').quaternion.clone();
  const seatedKnee = controller.bones.get('r_lowleg').quaternion.clone();
  const upperArmLength = controller.bones.get('r_lowarm').position.length();
  const initialPosition = new Float32Array(body.geometry.attributes.position.array);

  values.weight = 0.82;
  values.height = 0.8;
  values.mhrUpperArmLength = 1;
  assert.equal(controller.applyValues(values, { forceIdentity: true }), true);
  assert.ok(difference(initialPosition, body.geometry.attributes.position.array).rms > 0.0001);
  assert.ok(body.userData.mhrIdentityWeights[0] > 0.8, 'body-mass control should recruit measured volume component 0');
  assert.ok(gltf.scene.scale.y > 1.05, 'stature should change the rig scale live');
  assert.ok(controller.bones.get('r_lowarm').position.length() > upperArmLength * 1.07, 'named MHR limb scale should be live');

  values.seated = 0;
  controller.update(10, 1, values);
  assert.equal(controller.seatedBlend, 0);
  assert.ok(gltf.scene.position.y > -0.01);
  assert.ok(controller.bones.get('r_upleg').quaternion.angleTo(seatedThigh) > 1);
  assert.ok(controller.bones.get('r_lowleg').quaternion.angleTo(seatedKnee) > 1);
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

test('renderer A skin controls produce perceptible endpoint changes', async () => {
  const variants = [
    ['A', '../character-lab/public/models/mrs-ostrander-1896.glb', false],
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
