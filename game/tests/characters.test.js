import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as THREE from 'three';
import { phase1Cast } from '../src/content/clinic1896/phase1Cast.js';
import {
  applyRendererCAppearance,
  applyRendererCWardrobe,
  cloneRendererCMaterials,
  createRendererCController,
} from '../src/scene/characters/rendererCController.js';
import { createActorRuntime, updateActorCue, validateActors } from '../src/world/characters/actors.js';

const manifest = JSON.parse(await readFile(new URL('../../character-lab/public/models/renderer-c-cohorts.json', import.meta.url)));

test('the Phase 1 technical cast contains two valid distinct Renderer C actors', () => {
  assert.equal(phase1Cast.length, 2);
  assert.deepEqual(validateActors(phase1Cast, manifest), []);
  assert.equal(new Set(phase1Cast.map((actor) => actor.recipe.cohort)).size, 2);
  assert.equal(new Set(phase1Cast.map((actor) => `${actor.recipe.cohort}:${actor.recipe.anchor.index}`)).size, 2);
  assert.ok(phase1Cast.every((actor) => actor.recipe.placement.position[0] === 0.45));
  assert.ok(phase1Cast.every((actor) => actor.recipe.placement.rotation[1] === Math.PI));
});

test('actor cues update immutably through the shared vocabulary', () => {
  const original = phase1Cast[0];
  const updated = updateActorCue(original, { body: 'sitting-distressed', expression: 'distressed', gaze: 'away' });
  assert.notEqual(updated, original);
  assert.equal(original.recipe.animation.body, 'clinic-idle');
  assert.deepEqual(updated.recipe.animation, {
    body: 'sitting-distressed', expression: 'distressed', gaze: 'away', gesture: 'none', speaking: false,
  });
  assert.equal(updated.recipe.values, original.recipe.values);
  assert.equal(updated.recipe.presentation, original.recipe.presentation);
  assert.equal(updated.recipe.restingFace, original.recipe.restingFace);
  assert.equal(updated.recipe.asset, original.recipe.asset);
  assert.equal(updated.recipe.placement, original.recipe.placement);
});

test('the actor runtime swaps patients and applies semantic cues', () => {
  const runtime = createActorRuntime([phase1Cast[0]]);
  const snapshots = [];
  const unsubscribe = runtime.subscribe((actors) => snapshots.push(actors));
  runtime.setSingle(phase1Cast[1]);
  runtime.cue('phase1-man', { expression: 'distressed', speaking: false });
  unsubscribe();
  assert.equal(snapshots.length, 2);
  assert.equal(runtime.get()[0].id, 'phase1-man');
  assert.equal(runtime.get()[0].recipe.animation.expression, 'distressed');
  assert.equal(phase1Cast[1].recipe.animation.expression, 'guarded');
});

test('the runtime shows only the selected wardrobe carrier', () => {
  const men = new THREE.Group();
  for (const name of [
    'RendererC_BaseGarment', 'RendererC_WorkGarment', 'RendererC_VictorianGarment',
    'RendererC_EliteMorningSuit', 'RendererC_AuthoredVictorianWaistcoat_01',
  ]) {
    const garment = new THREE.Group();
    garment.name = name;
    garment.visible = true;
    men.add(garment);
  }
  assert.equal(applyRendererCWardrobe(men, phase1Cast[1].recipe), 'sack-suit');
  assert.equal(men.getObjectByName('RendererC_BaseGarment').visible, true);
  assert.equal(men.getObjectByName('RendererC_WorkGarment').visible, false);
  assert.equal(men.getObjectByName('RendererC_VictorianGarment').visible, false);
  assert.equal(men.getObjectByName('RendererC_EliteMorningSuit').visible, false);
  assert.equal(men.getObjectByName('RendererC_AuthoredVictorianWaistcoat_01').visible, false);

  const women = new THREE.Group();
  for (const name of [
    'RendererC_BaseGarment', 'RendererC_VictorianDress', 'RendererC_VictorianDetails',
    'RendererC_VictorianDressFitSource', 'RendererC_GoldenDressBodice',
    'RendererC_GoldenDressSkirt', 'RendererC_GoldenDressSeatedSkirt',
    'RendererC_GoldenDressDetails', 'RendererC_Shoes',
  ]) {
    const garment = new THREE.Group();
    garment.name = name;
    garment.visible = true;
    women.add(garment);
  }
  assert.equal(applyRendererCWardrobe(women, phase1Cast[0].recipe), 'golden-dress');
  assert.equal(women.getObjectByName('RendererC_BaseGarment').visible, false);
  assert.equal(women.getObjectByName('RendererC_VictorianDress').visible, false);
  assert.equal(women.getObjectByName('RendererC_VictorianDetails').visible, false);
  assert.equal(women.getObjectByName('RendererC_VictorianDressFitSource').visible, false);
  assert.equal(women.getObjectByName('RendererC_GoldenDressBodice').visible, true);
  assert.equal(women.getObjectByName('RendererC_GoldenDressSkirt').visible, false);
  assert.equal(women.getObjectByName('RendererC_GoldenDressSeatedSkirt').visible, true);
  assert.equal(women.getObjectByName('RendererC_GoldenDressDetails').visible, true);
  assert.equal(women.getObjectByName('RendererC_Shoes').visible, false);
});

test('the game makes the body opaque and gives overlapping dress carriers one colour', () => {
  const actor = new THREE.Group();
  const bodyMaterial = new THREE.MeshStandardMaterial({ color: '#ffffff', transparent: true });
  bodyMaterial.name = 'Human_Body.body';
  const body = new THREE.Mesh(new THREE.BoxGeometry(), bodyMaterial);
  body.name = 'Human_Body';
  actor.add(body);

  for (const [name, color] of [
    ['RendererC_BaseGarment', '#567c6c'],
    ['RendererC_VictorianDressFitSource', '#946c84'],
  ]) {
    const garment = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial({ color }));
    garment.name = name;
    actor.add(garment);
  }

  applyRendererCAppearance(actor, phase1Cast[0].recipe);
  assert.equal(body.material.transparent, false);
  assert.equal(body.material.depthWrite, true);
  assert.equal(
    actor.getObjectByName('RendererC_BaseGarment').material.color.getHexString(),
    actor.getObjectByName('RendererC_VictorianDressFitSource').material.color.getHexString(),
  );
  assert.equal(
    actor.getObjectByName('RendererC_BaseGarment').material.color.getHexString(),
    phase1Cast[0].recipe.values.dressColor.slice(1),
  );
  const garmentShader = {
    uniforms: {},
    vertexShader: '',
    fragmentShader: '#include <opaque_fragment>',
  };
  actor.getObjectByName('RendererC_VictorianDressFitSource').material.onBeforeCompile(garmentShader, null);
  assert.match(garmentShader.fragmentShader, /rcWardrobeLuminance/);
  assert.match(garmentShader.fragmentShader, /outgoingLight \*= min\(1\.0, 0\.9/);
});

test('combined eye textures keep a dim neutral sclera instead of an iris-coloured material tint', () => {
  const actor = new THREE.Group();
  const eyeMaterial = new THREE.MeshStandardMaterial({ color: '#17100c', map: new THREE.Texture() });
  eyeMaterial.name = 'Human_Body.high-poly';
  const eyes = new THREE.Mesh(new THREE.SphereGeometry(), eyeMaterial);
  eyes.name = 'RendererC_Eyes_01';
  actor.add(eyes);
  applyRendererCAppearance(actor, phase1Cast[0].recipe);
  assert.equal(eyeMaterial.color.getHexString(), 'd8d0c8');
  assert.equal(eyeMaterial.roughness, 0.58);
  assert.equal(eyeMaterial.transparent, false);
  assert.equal(eyeMaterial.alphaTest, 0.02);
  assert.equal(eyeMaterial.depthWrite, true);
});

test('eye colour changes never substitute another anchor eye geometry', () => {
  const actor = new THREE.Group();
  for (let slot = 0; slot < 2; slot += 1) {
    const eyes = new THREE.Group();
    eyes.name = `RendererC_Eyes_${slot}`;
    eyes.userData.renderer_c_variant_role = 'eyes';
    eyes.userData.renderer_c_variant_slot = slot;
    actor.add(eyes);
  }
  const eyeManifest = {
    cohort: 'women',
    neutralAge: 0.555,
    anchors: [
      { id: 'first-face', eyeSlot: 0 },
      { id: 'second-face', eyeSlot: 1 },
    ],
  };
  const values = { rendererCAnchor: 0, eyeColor: '#52666c', height: 0.47 };
  const controller = createRendererCController(actor, eyeManifest, values);
  assert.equal(actor.children[0].visible, true);
  assert.equal(actor.children[1].visible, false);
  controller.applyValues({ ...values, eyeColor: '#2d2420' });
  assert.equal(actor.children[0].visible, true);
  assert.equal(actor.children[1].visible, false);
  controller.applyValues({ ...values, rendererCAnchor: 1, eyeColor: '#2d2420' });
  assert.equal(actor.children[0].visible, false);
  assert.equal(actor.children[1].visible, true);
});

test('dark approved complexion produces a materially dark body surface', () => {
  const actor = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial({ color: '#ffffff' }));
  body.name = 'Human_Body';
  actor.add(body);
  applyRendererCAppearance(actor, { values: { skinTone: '#6d4738' }, presentation: {} });
  assert.equal(body.material.color.getHexString(), '6d4738');
});

test('later-life face shape can drive the old morph beyond its original endpoint', () => {
  const actor = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial());
  body.name = 'Human_Body';
  body.morphTargetDictionary = { rc_age_old: 0, rc_age_young: 1 };
  body.morphTargetInfluences = [0, 0];
  actor.add(body);
  const ageManifest = {
    cohort: 'women',
    neutralAge: 0.555,
    anchors: [],
    demographicMorphs: { ageOld: 'rc_age_old', ageYoung: 'rc_age_young' },
  };
  const controller = createRendererCController(actor, ageManifest, {
    age: 0.9, ageGeometry: 1, height: 0.47,
  });
  assert.equal(body.morphTargetInfluences[0], 1.22);
  controller.applyValues({ age: 0.7, ageGeometry: 0.5, height: 0.47 });
  assert.equal(body.morphTargetInfluences[0], 0.61);
});

test('Renderer C keeps age surface and grey-hair controls live on actor materials', () => {
  const actor = new THREE.Group();
  const bodyMaterial = new THREE.MeshStandardMaterial({ color: '#ffffff', map: new THREE.Texture() });
  const body = new THREE.Mesh(new THREE.BoxGeometry(), bodyMaterial);
  body.name = 'Human_Body';
  actor.add(body);
  const hairMaterial = new THREE.MeshStandardMaterial({ color: '#3b2418', map: new THREE.Texture() });
  const hair = new THREE.Mesh(new THREE.BoxGeometry(), hairMaterial);
  hair.name = 'RendererC_Hair_01';
  actor.add(hair);

  const recipe = {
    appearanceSeed: 8133,
    values: {
      skinTone: '#ddb095', hairColor: '#3b2418',
      wrinkleAmount: 0.68, skinTexture: 0.55, pigmentVariation: 0.44,
      freckleAmount: 0.49, ageSpotAmount: 0.34, underEyeDarkness: 0.46,
      greyAmount: 0.61, greyPattern: 'scattered',
    },
    presentation: {},
  };
  applyRendererCAppearance(actor, recipe);
  const skinUniforms = bodyMaterial.userData.rendererCSkinSurface.uniforms;
  const hairUniforms = hairMaterial.userData.rendererCHairSurface.uniforms;
  assert.equal(skinUniforms.wrinkleAmount.value, 0.68);
  assert.equal(skinUniforms.freckleAmount.value, 0.49);
  assert.equal(hairUniforms.greyAmount.value, 0.61);
  assert.equal(hairUniforms.greyPattern.value, 1);
  const skinShader = {
    uniforms: {},
    vertexShader: '#include <uv_vertex>\n#include <morphtarget_vertex>',
    fragmentShader: '#include <map_fragment>\n#include <roughnessmap_fragment>',
  };
  bodyMaterial.onBeforeCompile(skinShader, null);
  assert.match(skinShader.fragmentShader, /rendererCEyeCrescent/);
  assert.match(skinShader.fragmentShader, /rendererCUnderEyeBag/);
  assert.match(skinShader.fragmentShader, /rendererCBagLowerFold/);
  assert.match(skinShader.fragmentShader, /rendererCCrowsFeet/);
  assert.match(skinShader.fragmentShader, /rendererCLaughLine/);
  assert.match(skinShader.fragmentShader, /rendererCLaughCompanion/);
  assert.match(skinShader.fragmentShader, /rendererCUpperLipLines/);
  assert.match(skinShader.fragmentShader, /rendererCLowerLipLines/);
  assert.match(skinShader.fragmentShader, /rendererCMouthCornerLines/);
  assert.match(skinShader.fragmentShader, /rendererCValueNoise/);
  assert.doesNotMatch(skinShader.fragmentShader, /rendererCHash\(floor\(vRendererCSurfaceUv \* 38\.0\)\)/);
  assert.match(skinShader.fragmentShader, /rendererCPerturbNormal/);
  assert.match(skinShader.fragmentShader, /rendererCReliefHeight/);
  const hairShader = {
    uniforms: {},
    vertexShader: '#include <morphtarget_vertex>',
    fragmentShader: '#include <map_fragment>',
  };
  hairMaterial.onBeforeCompile(hairShader, null);
  assert.match(hairShader.fragmentShader, /rendererCHairline/);
  assert.match(hairShader.fragmentShader, /rendererCWhiteCoverage/);
  assert.doesNotMatch(hairShader.fragmentShader, /vRendererCHairUv|floor\(vRendererCHair/);

  applyRendererCAppearance(actor, {
    ...recipe,
    values: { ...recipe.values, wrinkleAmount: 0.2, greyAmount: 0.3, greyPattern: 'temples-first' },
  });
  assert.equal(skinUniforms.wrinkleAmount.value, 0.2);
  assert.equal(hairUniforms.greyAmount.value, 0.3);
  assert.equal(hairUniforms.greyPattern.value, 0);
});

test('later-life appearance also ages brows, lashes, teeth, and sclerae', () => {
  const actor = new THREE.Group();
  for (const [name, color, map] of [
    ['RendererC_Brows_01', '#21150f', null],
    ['RendererC_Lashes_01', '#17100c', null],
    ['RendererC_Teeth_01', '#ffffff', null],
    ['RendererC_Eyes_01', '#ffffff', new THREE.Texture()],
  ]) {
    const material = new THREE.MeshStandardMaterial({ color, map });
    material.name = name;
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(), material);
    mesh.name = name;
    actor.add(mesh);
  }
  applyRendererCAppearance(actor, {
    values: {
      ageGeometry: 1, greyAmount: 1, eyeColor: '#49372a',
      hairColor: '#21150f', browColor: '#21150f', lashColor: '#17100c',
    },
    presentation: {},
  });
  assert.equal(actor.getObjectByName('RendererC_Brows_01').material.color.getHexString(), 'd4d1c9');
  assert.equal(actor.getObjectByName('RendererC_Lashes_01').material.color.getHexString(), '352f2a');
  assert.equal(actor.getObjectByName('RendererC_Teeth_01').material.color.getHexString(), 'c9bea9');
  assert.equal(actor.getObjectByName('RendererC_Eyes_01').material.color.getHexString(), 'cdc2b7');
});

test('textured brows can lighten instead of multiplying grey by dark texture pixels', () => {
  const actor = new THREE.Group();
  const browMaterial = new THREE.MeshStandardMaterial({ color: '#21150f', map: new THREE.Texture() });
  const brow = new THREE.Mesh(new THREE.BoxGeometry(), browMaterial);
  brow.name = 'RendererC_Brows_01';
  actor.add(brow);
  applyRendererCAppearance(actor, {
    values: { greyAmount: 1, hairColor: '#21150f', browColor: '#21150f' },
    presentation: {},
  });
  const shader = {
    uniforms: {},
    vertexShader: '',
    fragmentShader: '#include <map_fragment>',
  };
  browMaterial.onBeforeCompile(shader, null);
  assert.equal(shader.uniforms.rendererCBrowGreyAmount.value, 1);
  assert.match(shader.fragmentShader, /rendererCBrowGreyCoverage/);
  assert.match(shader.fragmentShader, /rendererCBrowGreyColor/);
});

test('each actor gets independent material instances', () => {
  const sourceMaterial = new THREE.MeshStandardMaterial({ color: '#ffffff' });
  const source = new THREE.Group();
  source.add(new THREE.Mesh(new THREE.BoxGeometry(), sourceMaterial));
  const actor = source.clone(true);
  cloneRendererCMaterials(actor);
  assert.notEqual(actor.children[0].material, sourceMaterial);
  actor.children[0].material.color.set('#000000');
  assert.equal(sourceMaterial.color.getHexString(), 'ffffff');
});
