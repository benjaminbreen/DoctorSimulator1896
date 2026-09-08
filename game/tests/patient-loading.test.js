import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { GLTFLoader as BaseLoader } from 'three/addons/loaders/GLTFLoader.js';
import { GLTFLoader } from '../src/scene/modelLoader.js';
import { visitPreparationObjects } from '../src/scene/prepareStage.js';
import { patientModelPath } from '../src/scene/characters/patientModelPath.js';

test('preparation skips hidden wardrobe trees but includes the arriving stage', () => {
  const scene = new THREE.Group();
  const stage = new THREE.Group(); stage.visible = false; stage.userData.preparing = true;
  const visible = new THREE.Mesh(); const hidden = new THREE.Group(); hidden.visible = false;
  const unused = new THREE.Mesh(); hidden.add(unused); stage.add(visible, hidden); scene.add(stage);
  const seen = []; visitPreparationObjects(scene, node => seen.push(node));
  assert.ok(seen.includes(visible)); assert.ok(!seen.includes(unused));
});

test('selected patients promote an existing background request without decoding twice', async () => {
  const original = BaseLoader.prototype.load;
  const starts = [], callbacks = new Map();
  BaseLoader.prototype.load = function(url, done) { starts.push(url); callbacks.set(url, done); };
  try {
    const loader = new GLTFLoader(); loader.background = true;
    const requests = Array.from({ length: 6 }, (_, i) => loader.loadAsync(`queue-test-${i}`));
    const foreground = new GLTFLoader().loadAsync('queue-test-5');
    assert.equal(starts.length, 4);
    callbacks.get('queue-test-0')({});
    assert.equal(starts[4], 'queue-test-5');
    callbacks.get('queue-test-1')({});
    for (const id of [2, 3, 4, 5]) callbacks.get(`queue-test-${id}`)({});
    const results = await Promise.all(requests);
    assert.equal(await foreground, results[5]);
  } finally { BaseLoader.prototype.load = original; }
});

test('lean assets preserve authored paths and nondefault clothing', () => {
  const manifest = { path: '/master.glb', consultationPaths: ['/lean.glb'] };
  const recipe = { cohort: 'women', anchor: { index: 0 }, presentation: { outfitId: 'golden-dress' } };
  assert.equal(patientModelPath(recipe, manifest), '/lean.glb');
  assert.equal(patientModelPath({ ...recipe, asset: { path: '/authored.glb' } }, manifest), '/authored.glb');
  assert.equal(patientModelPath({ ...recipe, presentation: { outfitId: 'fitted-dress' } }, manifest), '/master.glb');
});

test('every consultation asset keeps its clips and a consistent morph layout', async () => {
  const { readFile } = await import('node:fs/promises');
  const directory = new URL('../public/models/characters/', import.meta.url);
  const manifest = JSON.parse(await readFile(new URL('renderer-c-cohorts.json', directory), 'utf8'));
  for (const [cohort, definition] of Object.entries(manifest.cohorts)) {
    assert.equal(definition.consultationPaths.length, definition.anchors.length);
    for (let anchor=0; anchor<definition.anchors.length; anchor++) {
      const bytes = await readFile(new URL(`consultation/${cohort}-${anchor}.glb`,directory));
      const model=JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)).toString('utf8'));
      const clips=new Set(model.animations.map(clip=>clip.name));
      for(const clip of ['ClinicIdle','SittingTalking','Walk','SitDown','StandUp']) assert.ok(clips.has(clip),clip);
      for(const mesh of model.meshes) {
        const names=mesh.extras?.targetNames;
        if(!names)continue;
        for(const name of names.filter(name=>name.startsWith('rc_anchor_'))) assert.equal(name,definition.anchors[anchor].morph);
        for(const primitive of mesh.primitives) assert.equal(primitive.targets.length,names.length);
      }
    }
  }
});

test('all seated consultation gestures keep the seated dress', async () => {
  const { applyRendererCWardrobe } = await import('../../shared/characters/rendererCRuntime.js');
  const root=new THREE.Group();
  for(const name of ['RendererC_GoldenDressSkirt','RendererC_GoldenDressSeatedSkirt']) {
    const node=new THREE.Group();node.name=name;root.add(node);
  }
  for(const body of ['clinic-idle','sitting-talking','sitting-distressed','sitting-self-soothing','sitting-disapproval','sitting-disbelief']) {
    applyRendererCWardrobe(root,{cohort:'women',presentation:{outfitId:'golden-dress'},animation:{body}});
    assert.equal(root.getObjectByName('RendererC_GoldenDressSeatedSkirt').visible,true,body);
    assert.equal(root.getObjectByName('RendererC_GoldenDressSkirt').visible,false,body);
  }
});
