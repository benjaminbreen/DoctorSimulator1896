import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'meshoptimizer';
import * as THREE from 'three';
import { findBones, sampleTorsoFit } from '../character-lab/src/costume.js';
import { createExpressions, createMhrExpressions } from '../character-lab/src/expressions.js';
import { findBodyMesh, sampleScalp, scalpPoint } from '../character-lab/src/hair/geometry.js';
import { createMhrController, createMhrEyeDetails } from '../character-lab/src/mhr.js';
import { createMhrFacialDetails } from '../character-lab/src/facial-details.js';
import { prepareSkinModel, updateSkinModel } from '../character-lab/src/stylized.js';

globalThis.self = globalThis;
globalThis.ProgressEvent ??= class ProgressEvent {
  constructor(type, properties = {}) { this.type = type; Object.assign(this, properties); }
};
globalThis.createImageBitmap ??= async () => ({ width: 1, height: 1, close() {} });

async function loadModel(relativePath) {
  const data = await readFile(new URL(relativePath, import.meta.url));
  const arrayBuffer = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
  return new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(arrayBuffer, '');
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

function regionalDifference(a, b, referencePosition, predicate) {
  let sum = 0; let maximum = 0; let samples = 0;
  for (let vertex = 0; vertex < referencePosition.count; vertex += 1) {
    const x = referencePosition.getX(vertex), y = referencePosition.getY(vertex), z = referencePosition.getZ(vertex);
    if (!predicate(x, y, z)) continue;
    const offset = vertex * 3;
    const delta = Math.hypot(a[offset] - b[offset], a[offset + 1] - b[offset + 1], a[offset + 2] - b[offset + 2]);
    sum += delta * delta; maximum = Math.max(maximum, delta); samples += 1;
  }
  return { rms: samples ? Math.sqrt(sum / samples) : 0, maximum, samples };
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
  const worldAt = (name) => controller.bones.get(name).getWorldPosition(new THREE.Vector3());
  const shoulderSeparation = worldAt('r_uparm').distanceTo(worldAt('l_uparm'));
  const handSeparation = worldAt('r_wrist').distanceTo(worldAt('l_wrist'));
  assert.ok(handSeparation < shoulderSeparation * 0.75, 'seated hands should settle inward onto the lap');
  assert.ok(worldAt('r_wrist').y < worldAt('r_uparm').y - 0.20, 'seated arm still reads as a splayed T-pose');
  const relaxedFinger = controller.bones.get('r_index2').quaternion.clone();
  values.handTension = 1;
  controller.applyValues(values);
  assert.ok(controller.bones.get('r_index2').quaternion.angleTo(relaxedFinger) > 0.2, 'hand tension does not articulate fingers');
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
  const identityWeights = [...body.userData.mhrIdentityWeights];
  values.mhrNeckLength = 0.8;
  assert.equal(controller.applyValues(values), false, 'rig-only dimensions must not rebake identity geometry');
  assert.deepEqual(body.userData.mhrIdentityWeights, identityWeights);

  values.seated = 0;
  controller.update(10, 1, values);
  assert.equal(controller.seatedBlend, 0);
  assert.ok(gltf.scene.position.y > -0.01);
  assert.ok(controller.bones.get('r_upleg').quaternion.angleTo(seatedThigh) > 1);
  assert.ok(controller.bones.get('r_lowleg').quaternion.angleTo(seatedKnee) > 1);
});

test('MHR costume fitting measures the posed body and eye details follow the eye bones', async () => {
  const gltf = await loadModel('../character-lab/public/models/comparison-mhr-lod1.glb');
  const values = {
    seed: 7139, gender: 0, age: 0.72, height: 0.5, weight: 0.82, muscle: 0.25,
    proportions: 0.5, shoulderWidth: 0, torsoLength: 0, headShape: 'oval', headShapeStrength: 0.4,
    seated: 1, kneesTogether: 0.65, posture: 0.1, headTurn: 0, headTilt: 0,
    breathing: 0, breathingRate: 13, eyeColor: '#416b78', stylizedEyeContrast: 0.8, eyeSize: 0,
  };
  createMhrController(gltf.scene, values);
  gltf.scene.updateMatrixWorld(true);
  const bones = findBones(gltf.scene);
  const at = (bone) => bone.getWorldPosition(new THREE.Vector3());
  const pelvis = at(bones.pelvis);
  const neck = at(bones.neck);
  const shoulderL = at(bones.upperarmL), shoulderR = at(bones.upperarmR);
  const shoulderCentre = shoulderL.clone().add(shoulderR).multiplyScalar(0.5);
  const top = shoulderCentre.clone().lerp(neck, 0.2);
  const knee = at(bones.calfL).add(at(bones.calfR)).multiplyScalar(0.5);
  const forward = knee.sub(pelvis).setY(0);
  if (forward.lengthSq() < 1e-6) forward.set(0, 0, 1);
  forward.normalize();
  const right = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), forward).normalize();
  const fit = sampleTorsoFit(gltf.scene, top, pelvis, right, forward, shoulderL.distanceTo(shoulderR) * 0.5 + 0.025);
  assert.equal(fit.length, 11);
  assert.ok(fit.every((row) => row.samples > 0 && row.rx > 0.1 && row.rz > 0.07));
  assert.ok(Math.max(...fit.map((row) => row.rz)) > 0.12, 'full body should determine garment chest depth');
  const maximumTorsoDepth = Math.max(...fit.map((row) => row.rz));
  assert.ok(maximumTorsoDepth < 0.23, `posed arms leaked into the torso garment fit (${maximumTorsoDepth.toFixed(3)}m)`);

  prepareSkinModel(gltf.scene, values);
  const body = gltf.scene.getObjectByName('body_mesh');
  const originalMaterial = body.material;
  const originalIndexCount = body.geometry.index.count;
  const embeddedEyePaint = new Float32Array(body.geometry.attributes.color.array);
  const eyes = createMhrEyeDetails(gltf.scene, values);
  assert.equal(eyes.groups.length, 2);
  assert.ok(eyes.groups.every((group) => /eye_null$/.test(group.parent.name)));
  assert.ok(eyes.groups.every((group) => group.getObjectByName(`${group.name}_Globe`)?.geometry.type === 'SphereGeometry'));
  assert.ok(eyes.groups.every((group) => group.getObjectByName(`${group.name}_Cornea`)?.geometry.type === 'SphereGeometry'));
  assert.ok(eyes.removedTriangles > 30, `opaque embedded eye surface should be cut away (${eyes.removedTriangles} triangles)`);
  assert.ok(eyes.apertures.every((aperture) => aperture.upper.length >= 8 && aperture.lower.length >= 6));
  assert.equal(eyes.materials.globe.userData.excludeComparisonSkin, true);
  assert.equal(eyes.materials.cornea.userData.excludeComparisonSkin, true);
  updateSkinModel(gltf.scene, values);
  assert.ok(difference(embeddedEyePaint, body.geometry.attributes.color.array).maximum > 0.25,
    'old embedded-eye sclera pigment remained on the retained eyelid margin');
  const originalEyeColors = new Float32Array(eyes.groups[0].children[0].geometry.attributes.color.array);
  const facial = createMhrFacialDetails(gltf.scene, {
    ...values, hairColor: '#21150f', browColor: '#21150f', lashColor: '#17100c',
    lashDensity: 0.7, lashLength: 1, lashCurl: 0.5,
  });
  const lashes = facial.meshes.find((mesh) => mesh.name === 'MHR_ProceduralLashes');
  assert.ok(lashes.geometry.attributes.position.count > 400, 'eyelid margins should produce individual lash strands');
  const apertureVertices = new Set(eyes.apertures.flatMap((aperture) => [...aperture.upper, ...aperture.lower]));
  assert.ok([...lashes.geometry.userData.surfaceSources].every((source) => apertureVertices.has(source)), 'lash roots must use actual eyelid-margin vertices');
  const openLashes = new Float32Array(lashes.geometry.attributes.position.array);
  body.morphTargetInfluences[body.morphTargetDictionary.shape_58] = 0.85;
  facial.update(values);
  assert.ok(difference(openLashes, lashes.geometry.attributes.position.array).rms > 0.0001, 'lashes must follow the blinking eyelid morph');
  body.morphTargetInfluences[body.morphTargetDictionary.shape_58] = 0;
  const initialScale = eyes.groups[0].scale.x;
  values.eyeColor = '#783f26'; values.eyeSize = 0.5;
  values.mhrEyeGlobeScale = 1.05; values.mhrEyeDepth = -4.2; values.mhrEyeVertical = 1.1;
  values.mhrScleraColor = '#bba99a'; values.mhrScleraBrightness = 0.12;
  values.mhrIrisScale = 1.28; values.mhrPupilScale = 0.72; values.mhrCorneaGloss = 0.8;
  eyes.update(values);
  assert.ok(eyes.groups[0].children[0].geometry.attributes.color.array.some((value, index) => Math.abs(value - originalEyeColors[index]) > 0.08));
  assert.ok(eyes.groups[0].scale.x > initialScale * 1.15, 'live globe-size control did not change the bone-bound eye');
  assert.ok(Math.abs(eyes.groups[0].children[0].position.y - 0.0011) < 1e-7);
  assert.ok(Math.abs(eyes.groups[0].children[0].position.z + 0.01575) < 1e-7);
  assert.ok(eyes.materials.cornea.opacity > 0.16);
  facial.dispose();
  eyes.dispose();
  assert.ok(eyes.groups.every((group) => group.parent == null));
  assert.equal(body.material, originalMaterial);
  assert.equal(body.geometry.index.count, originalIndexCount);
});

test('MHR scalp fitting is linear-time and follows the deformed head surface', async () => {
  const gltf = await loadModel('../character-lab/public/models/comparison-mhr-lod1.glb');
  gltf.scene.updateMatrixWorld(true);
  const bones = findBones(gltf.scene);
  const worldPosition = (bone) => bone.getWorldPosition(new THREE.Vector3());
  const pelvis = worldPosition(bones.pelvis);
  const head = worldPosition(bones.head);
  const neck = worldPosition(bones.neck);
  const forward = worldPosition(bones.calfL).add(worldPosition(bones.calfR)).multiplyScalar(0.5).sub(pelvis).setY(0);
  if (forward.lengthSq() < 1e-6) forward.set(0, 0, 1);
  forward.normalize();
  const headUp = head.clone().sub(neck).normalize();
  forward.addScaledVector(headUp, -forward.dot(headUp));
  if (forward.lengthSq() < 1e-6) forward.set(0, 0, 1).addScaledVector(headUp, -headUp.z);
  forward.normalize();
  const frame = {
    centre: head.clone().addScaledVector(headUp, 0.055), head, neck, headUp, forward,
    right: new THREE.Vector3().crossVectors(headUp, forward).normalize(),
  };
  const started = performance.now();
  const scalp = sampleScalp(gltf.scene, frame);
  const duration = performance.now() - started;
  const radii = scalp.samples.flatMap((column) => column.map((point) => point.distanceTo(frame.centre)));
  assert.equal(radii.length, 1088);
  assert.ok(Math.min(...radii) > 0.05 && Math.max(...radii) < 0.18);
  assert.ok(Math.max(...radii) - Math.min(...radii) > 0.025, 'scalp projection collapsed to a fallback sphere');
  const body = findBodyMesh(gltf.scene);
  const world = new THREE.Vector3();
  const offset = new THREE.Vector3();
  let worstPosteriorUndercut = -Infinity;
  let worstPosteriorLocation = null;
  for (let vertex = 0; vertex < body.geometry.attributes.position.count; vertex++) {
    body.getVertexPosition(vertex, world).applyMatrix4(body.matrixWorld);
    offset.copy(world).sub(frame.centre);
    const radius = offset.length();
    if (radius < 0.035 || radius > 0.19) continue;
    const direction = offset.clone().divideScalar(radius);
    const polar = Math.acos(THREE.MathUtils.clamp(direction.dot(frame.headUp), -1, 1));
    const azimuth = Math.atan2(direction.dot(frame.right), direction.dot(frame.forward));
    if (polar < 0.04 || polar > 1.22 || Math.abs(azimuth) < 2.15) continue;
    const row = (polar - 0.04) / (Math.PI * 0.62) * (scalp.ROWS - 1);
    const fittedRadius = scalpPoint(scalp, azimuth, row).distanceTo(frame.centre);
    const undercut = radius - fittedRadius;
    if (undercut > worstPosteriorUndercut) {
      worstPosteriorUndercut = undercut;
      worstPosteriorLocation = { polar, azimuth, row };
    }
  }
  assert.ok(worstPosteriorUndercut < 0.008,
    `posterior scalp fit undercuts the visible skull by ${(worstPosteriorUndercut * 1000).toFixed(1)}mm at ${JSON.stringify(worstPosteriorLocation)}`);
  assert.ok(duration < 1000, `MHR scalp fit regressed to ${duration.toFixed(0)}ms`);
});

test('MHR presentation and ancestry endpoints visibly deform the same seeded identity', async () => {
  const gltf = await loadModel('../character-lab/public/models/comparison-mhr-lod1.glb');
  const body = gltf.scene.getObjectByName('body_mesh');
  const referencePosition = body.geometry.attributes.position.clone();
  const referenceBox = new THREE.Box3().setFromBufferAttribute(referencePosition);
  const head = (_x, y) => y > referenceBox.max.y - (referenceBox.max.y - referenceBox.min.y) * 0.18;
  const values = {
    seed: 2665, gender: 0.5, age: 0.68, height: 0.5, weight: 0.5, muscle: 0.35,
    proportions: 0.5, shoulderWidth: 0, torsoLength: 0, headShape: 'oval', headShapeStrength: 0,
    african: 0, asian: 0, caucasian: 1, seated: 0, kneesTogether: 0, posture: 0,
    headTurn: 0, headTilt: 0, breathing: 0, breathingRate: 13,
  };
  const controller = createMhrController(gltf.scene, values);
  const capture = (overrides) => {
    Object.assign(values, overrides);
    controller.applyValues(values, { forceIdentity: true });
    return new Float32Array(body.geometry.attributes.position.array);
  };

  const neutral = capture({ gender: 0.5 });
  const female = capture({ gender: 0 });
  const male = capture({ gender: 1 });
  assert.ok(difference(female, male).rms > 0.0025, 'presentation endpoint is too subtle');
  const feminineTravel = regionalDifference(female, neutral, referencePosition, head).rms;
  const masculineTravel = regionalDifference(male, neutral, referencePosition, head).rms;
  assert.ok(feminineTravel > masculineTravel * 1.12,
    `feminine endpoint (${feminineTravel}) should travel farther than restrained masculine endpoint (${masculineTravel})`);
  assert.equal(body.userData.mhrSemanticProfile.presentation, 1);
  assert.ok(controller.directions.body.shoulderWidth.samples > 100);
  assert.ok(controller.directions.body.hipWidth.samples > 100);

  const african = capture({ gender: 0.5, african: 1, asian: 0, caucasian: 0 });
  const asian = capture({ african: 0, asian: 1, caucasian: 0 });
  const european = capture({ african: 0, asian: 0, caucasian: 1 });
  assert.ok(regionalDifference(african, european, referencePosition, head).rms > 0.00035, 'African ancestry endpoint is too subtle');
  assert.ok(regionalDifference(asian, european, referencePosition, head).rms > 0.00035, 'Asian ancestry endpoint is too subtle');
  assert.deepEqual(body.userData.mhrSemanticProfile.ancestry, { african: 0, asian: 0, caucasian: 1 });
});

test('MHR semantic face sliders are localized and every displayed detail control is live', async () => {
  const gltf = await loadModel('../character-lab/public/models/comparison-mhr-lod1.glb');
  const body = gltf.scene.getObjectByName('body_mesh');
  const reference = body.geometry.attributes.position.clone();
  const box = new THREE.Box3().setFromBufferAttribute(reference);
  const top = box.max.y;
  const values = {
    seed: 4118, gender: 0.5, age: 0.66, height: 0.5, weight: 0.5, muscle: 0.35,
    proportions: 0.5, shoulderWidth: 0, torsoLength: 0, headShape: 'oval', headShapeStrength: 0,
    african: 0, asian: 0, caucasian: 1, seated: 0, kneesTogether: 0, posture: 0,
    headTurn: 0, headTilt: 0, breathing: 0, breathingRate: 13,
  };
  const controller = createMhrController(gltf.scene, values);
  const capture = (overrides) => {
    Object.assign(values, overrides);
    controller.applyValues(values, { forceIdentity: true });
    return new Float32Array(body.geometry.attributes.position.array);
  };
  const low = capture({ noseDepth: -0.65 });
  const high = capture({ noseDepth: 0.65 });
  const nose = regionalDifference(low, high, reference,
    (x, y, z) => Math.abs(x) < 0.065 && y > top - 0.235 && y < top - 0.075 && z > box.max.z - 0.16);
  const otherFace = regionalDifference(low, high, reference,
    (x, y, z) => y > top - 0.31 && z > box.max.z - 0.16
      && !(Math.abs(x) < 0.075 && y > top - 0.245 && y < top - 0.065));
  assert.ok(nose.rms > 0.00025, `nose projection is too subtle (${nose.rms})`);
  assert.ok(otherFace.rms < nose.rms * 0.24,
    `nose projection leaked across the face (${otherFace.rms} vs ${nose.rms})`);

  const detailIds = [
    'headAngle', 'headBackDepth', 'noseCurve', 'noseTipAngle', 'eyeHeightInner', 'eyeHeightCenter',
    'eyeHeightOuter', 'epicanthus', 'eyeFold', 'browAngle', 'cupidBow', 'philtrumVolume', 'cheekInnerVolume',
  ];
  for (const id of detailIds) {
    const before = capture({ [id]: -0.5 });
    const after = capture({ [id]: 0.5 });
    assert.ok(difference(before, after).maximum > 0.00008, `${id} updates the label but not MHR geometry`);
  }
  const symmetric = capture({ faceAsymmetry: 0 });
  const asymmetric = capture({ faceAsymmetry: 0.35 });
  assert.ok(difference(symmetric, asymmetric).maximum > 0.00008,
    'faceAsymmetry updates the label but not MHR geometry');
});

test('MHR seated controller animates, completes, and reverses a pose transition', async () => {
  const gltf = await loadModel('../character-lab/public/models/comparison-mhr-lod1.glb');
  const values = {
    seed: 8042, gender: 0.5, age: 0.7, height: 0.5, weight: 0.5, muscle: 0.35,
    proportions: 0.5, shoulderWidth: 0, torsoLength: 0, headShape: 'oval', headShapeStrength: 0,
    african: 0, asian: 0, caucasian: 1, seated: 1, kneesTogether: 0.4, posture: 0,
    headTurn: 0, headTilt: 0, breathing: 0, breathingRate: 13,
  };
  const controller = createMhrController(gltf.scene, values);
  assert.equal(controller.seatedBlend, 1);
  values.seated = 0;
  assert.equal(controller.startSeatedTransition(0, 2, values), true);
  controller.update(0.5, 0.5, values);
  assert.ok(controller.seatedBlend > 0.8 && controller.seatedBlend < 1, 'sit-to-stand should have an eased first quarter');
  assert.equal(controller.isPoseTransitioning, true);
  controller.update(0.5, 1, values);
  const midpoint = controller.seatedBlend;
  assert.ok(midpoint > 0.45 && midpoint < 0.55);

  values.seated = 1;
  assert.equal(controller.startSeatedTransition(1, 1, values), true, 'an in-flight transition should reverse');
  controller.update(0.5, 1.5, values);
  assert.ok(controller.seatedBlend > midpoint && controller.seatedBlend < 1);
  controller.update(0.5, 2, values);
  assert.equal(controller.seatedBlend, 1);
  assert.equal(controller.targetSeated, 1);
  assert.equal(controller.isPoseTransitioning, false);
});

test('MHR semantic expressions drive its 72 signed latent targets without disturbing identity', async () => {
  const gltf = await loadModel('../character-lab/public/models/comparison-mhr-lod1.glb');
  const body = gltf.scene.getObjectByName('body_mesh');
  const expressions = createMhrExpressions(gltf.scene, {
    restingFace: { mouthSmileLeft: 0.08, mouthSmileRight: 0.11 },
  });
  assert.equal(expressions.mode, 'mhr-semantic');
  assert.equal(expressions.availableUnits.length, 72);
  for (const [name, count] of Object.entries(expressions.projection.samples)) {
    assert.ok(count > 10, `${name} projection did not find the intended facial region`);
  }

  const identityBefore = Array.from({ length: 45 }, (_, component) => {
    const index = body.morphTargetDictionary[`shape_${component}`];
    body.morphTargetInfluences[index] = component === 3 ? 0.37 : body.morphTargetInfluences[index];
    return body.morphTargetInfluences[index];
  });
  expressions.update(0, 0, { smile: 0.8, sadness: 0, fatigueExpression: 0 });
  const smile = expressions.appliedWeights;
  assert.ok(smile.some((value) => Math.abs(value) > 0.01), 'smile produced no MHR deformation');
  assert.deepEqual(Array.from({ length: 45 }, (_, component) => body.morphTargetInfluences[
    body.morphTargetDictionary[`shape_${component}`]
  ]), identityBefore);

  expressions.update(0, 1, { smile: 0, sadness: 0.8, fatigueExpression: 0 });
  const sadness = expressions.appliedWeights;
  assert.ok(difference(smile, sadness).rms > 0.02, 'smile and sadness collapsed to the same latent direction');
  expressions.update(0, 2, { smile: 0, sadness: 0, fatigueExpression: 0.8 });
  assert.ok(difference(sadness, expressions.appliedWeights).rms > 0.01, 'fatigue did not recruit a distinct eyelid direction');
  expressions.play('blink', 1, 1);
  expressions.update(0, 2.1, { smile: 0, sadness: 0, fatigueExpression: 0 });
  expressions.update(0, 2.22, { smile: 0, sadness: 0, fatigueExpression: 0 });
  assert.ok(expressions.appliedWeights[12] > 0.8 && expressions.appliedWeights[13] > 0.8, 'blink should close both MHR eyelids');
  assert.ok(expressions.appliedWeights[14] > 0.2 && expressions.appliedWeights[15] > 0.2, 'blink should seal the low-poly wet line');

  assert.equal(expressions.setDebugUnit('MHR expression 00', -0.63), true);
  expressions.update(0, 3, { smile: 1, sadness: 1, fatigueExpression: 1 });
  assert.ok(Math.abs(body.morphTargetInfluences[body.morphTargetDictionary.shape_45] + 0.63) < 1e-6);
  assert.ok(expressions.appliedWeights.slice(1).every((value) => value === 0));
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

test('MHR embedded eyes and face overlays use the visible neutral face frame', async () => {
  const gltf = await loadModel('../character-lab/public/models/comparison-mhr-lod1.glb');
  const body = gltf.scene.getObjectByName('body_mesh');
  const values = {
    seed: 2665, age: 0.65, skinTone: '#d2a085', eyeColor: '#3b2618',
    stylizedPlaneContrast: 0.3, stylizedTriangleBlend: 0.7, stylizedSkinDetail: 0.62,
    stylizedPoreScale: 1, stylizedPigmentVariation: 0.53, stylizedFreckleAmount: 0.15,
    stylizedSkinWarmth: 0.2, stylizedCheekBlush: 0.37, stylizedNoseRedness: 0.3,
    stylizedForeheadWarmth: 0.19, stylizedLipTint: 0.48, stylizedLipColor: '#be6861',
    stylizedEyeContrast: 0.7, stylizedSurfaceRoughness: 0.8,
  };
  prepareSkinModel(gltf.scene, values);
  const landmarks = body.geometry.userData.faceLandmarks;
  assert.equal(landmarks.embeddedEyes, true);
  assert.ok(landmarks.eyeY > 1.58 && landmarks.eyeY < 1.67, `eye frame escaped the visible face: ${landmarks.eyeY}`);
  assert.ok(landmarks.mouthY > 1.51 && landmarks.mouthY < 1.59, `mouth frame escaped the visible face: ${landmarks.mouthY}`);
  assert.ok(landmarks.eyeSpan < 0.12 && landmarks.mouthWidth < 0.09);
  assert.ok(body.userData.faceOverlay.lipMask.some((value) => value > 0.4), 'MHR lips have no texture mask');

  const brownEyes = new Float32Array(body.geometry.attributes.color.array);
  updateSkinModel(gltf.scene, { ...values, eyeColor: '#447d92' });
  const blueEyes = body.geometry.attributes.color.array;
  assert.ok(blueEyes.some((value, index) => Math.abs(value - brownEyes[index]) > 0.2), 'MHR iris color is not live');
  const quietCheeks = new Float32Array(blueEyes);
  updateSkinModel(gltf.scene, { ...values, eyeColor: '#447d92', stylizedCheekBlush: 1 });
  assert.ok(body.geometry.attributes.color.array.some((value, index) => Math.abs(value - quietCheeks[index]) > 0.08), 'MHR blush misses the visible cheeks');
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
