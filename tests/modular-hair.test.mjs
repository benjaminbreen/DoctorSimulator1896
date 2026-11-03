import test from 'node:test';
import assert from 'node:assert/strict';
import {Group,Mesh,BufferGeometry,Float32BufferAttribute,MeshStandardMaterial,DataTexture} from 'three';
import {createModularHair,MODULAR_HAIR_CONTROLS} from '../shared/characters/modularHair.js';

function fixture(){
 const root=new Group(),targets=Object.values(MODULAR_HAIR_CONTROLS).map(c=>c.morph).filter(Boolean).concat('rc_hairlineHeightRecession');
 function mesh(name){
  const g=new BufferGeometry();g.setAttribute('position',new Float32BufferAttribute([0,0,0,1,0,0,0,1,0],3));g.setAttribute('uv',new Float32BufferAttribute([0,1,1,-.7,0,0],2));
  g.morphAttributes.position=targets.map(name=>{const a=new Float32BufferAttribute(new Float32Array(9),3);a.name=name;return a;});
  const m=new Mesh(g,new MeshStandardMaterial({map:new DataTexture(new Uint8Array([255,255,255,255]),1,1)}));m.name=name;root.add(m);return m;
 }
 const cap=mesh('Carmela_HairStyle_short_side_part'),part=mesh('Carmela_HairStyle_short_side_part_part'),receding=mesh('Carmela_HairStyle_receding_sweep');
 return {cap,part,receding,hair:createModularHair(root)};
}

test('crown loss retains the main side-part groom and hides only its scalp strip',()=>{
 const {cap,part,hair}=fixture();hair.update({hairStyle:'short-side-part',hairThinning:.6});
 assert.equal(cap.visible,true);assert.equal(part.visible,false);assert.ok(cap.customDepthMaterial);assert.ok(cap.customDistanceMaterial);hair.dispose();
});
test('hairline controls vary independently and apply the joint height/recession correction',()=>{
 const {cap,hair}=fixture();hair.update({hairStyle:'short-side-part',hairlinePeak:.7,hairlineHeight:.4,hairlineRecession:.6});
 const value=n=>cap.morphTargetInfluences[cap.morphTargetDictionary[n]];
 assert.equal(value('rc_hairlinePeak'),.7);assert.equal(value('rc_hairlineHeight'),.4);assert.equal(value('rc_hairlineRecession'),.6);assert.equal(value('rc_hairlineHeightRecession'),.24);
 hair.update({hairlinePeak:100});assert.equal(value('rc_hairlinePeak'),1);assert.equal(value('rc_hairlineHeight'),0);hair.dispose();
});
test('the bald choice hides both male grooms',()=>{
 const {cap,part,receding,hair}=fixture();hair.update({hairStyle:'bald'});assert.equal(cap.visible,false);assert.equal(part.visible,false);assert.equal(receding.visible,false);hair.dispose();
});
