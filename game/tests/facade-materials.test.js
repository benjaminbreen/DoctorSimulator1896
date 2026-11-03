import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {FACADE_TEXTURE_URLS,prepareFacadeTextures,createFacadeMaterial} from '../src/scene/facadeMaterials.js';

test('facade colour is sRGB while matching relief and packed material data stay linear',()=>{
  const inputs=FACADE_TEXTURE_URLS.map(()=>new THREE.Texture());
  const surfaces=prepareFacadeTextures(inputs);
  assert.equal(surfaces.length,5);
  assert.equal(surfaces[0].normal,surfaces[2].normal);
  assert.equal(surfaces[0].arm,surfaces[2].arm);
  for(const surface of surfaces.slice(0,4)){
    assert.equal(surface.map.colorSpace,THREE.SRGBColorSpace);
    assert.equal(surface.normal.colorSpace,THREE.NoColorSpace);
    assert.equal(surface.arm.colorSpace,THREE.NoColorSpace);
  }
  for(let style=0;style<6;style++){
    const material=createFacadeMaterial(surfaces,style,17,false,12,null,false,'rough');
    const surface=surfaces.find(s=>s.map===material.map);
    assert.ok(surface);
    assert.equal(material.normalMap,surface.normal);
    assert.equal(material.roughnessMap,surface.arm);
    assert.equal(material.aoMap,surface.arm);
    assert.equal(material.bumpMap,null);
    material.dispose();
  }
  const regular=createFacadeMaterial(surfaces,1,17);
  const rough=createFacadeMaterial(surfaces,1,17,false,12,null,false,'rough');
  assert.equal(regular.map,inputs[12]);
  assert.equal(regular.bumpMap,regular.map);
  assert.equal(regular.normalMap,null);
  assert.equal(regular.roughnessMap,null);
  assert.notEqual(regular.map,rough.map);
  regular.dispose();rough.dispose();
  for(const texture of inputs)texture.dispose();
});
