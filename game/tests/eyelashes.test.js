import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createModularEyelashes,EYELASH_LEVELS,eyelashVariation} from '../../shared/characters/modularEyelashes.js';

function fixture(){
 const root=new THREE.Group(),head=new THREE.Group(),lids=[];root.add(head);
 for(const [side,cx]of[['Left',.03],['Right',-.03]]){
  const positions=[],blink=[],indices=[];
  for(let row=0;row<=3;row++)for(let col=0;col<64;col++){
   const t=row/3,a=col/64*Math.PI*2,x=cx+(.014+.016*t)*Math.cos(a),y=1.6+(.006+.014*t)*Math.sin(a),z=.1+.020*(1-t)**2;
   positions.push(x,y,z);blink.push(0,(-.001-(y-1.6))*(1-t),0);
   if(row<3){const k=row*64+col,j=row*64+(col+1)%64;indices.push(k,j,k+64,j,j+64,k+64);}
  }
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setIndex(indices);g.morphTargetsRelative=true;g.morphAttributes.position=[new THREE.Float32BufferAttribute(blink,3)];
  const lid=new THREE.Mesh(g,new THREE.MeshStandardMaterial());lid.name='Carmela_Lid_'+side;lid.morphTargetDictionary={['eyeBlink'+side]:0};lid.morphTargetInfluences=[0];head.add(lid);lids.push(lid);
 }
 root.updateMatrixWorld(true);return{root,head,lids};
}
function rootError(root,lids,lashes){
 root.updateMatrixWorld(true);const inverse=root.matrixWorld.clone().invert();let worst=0;
 for(let eye=0;eye<2;eye++){
  const lid=lids[eye],matrix=new THREE.Matrix4().multiplyMatrices(inverse,lid.matrixWorld),rim=Array.from({length:64},(_,i)=>lid.getVertexPosition(i,new THREE.Vector3()).applyMatrix4(matrix));
  const p=lashes.meshes[eye].geometry.attributes.position;
  for(let i=0;i<p.count;i+=12){
   const anchor=new THREE.Vector3().fromBufferAttribute(p,i).add(new THREE.Vector3().fromBufferAttribute(p,i+1)).multiplyScalar(.5);let nearest=Infinity;
   for(let j=0;j<64;j++)nearest=Math.min(nearest,new THREE.Line3(rim[j],rim[(j+1)%64]).closestPointToPoint(anchor,true,new THREE.Vector3()).distanceTo(anchor));
   worst=Math.max(worst,nearest);
  }
 }return worst;
}

test('five lash levels add finite tapered fibres within a small geometry budget',()=>{
 const {root}=fixture(),lashes=createModularEyelashes(root);assert.equal(lashes.available,true);let previous=0;
 for(let level=0;level<EYELASH_LEVELS.length;level++){
  lashes.updateLook({lashProminence:level,lashSeed:7});lashes.update();const info=lashes.describe();
  assert.ok(info.triangles>previous&&info.triangles<2000);previous=info.triangles;
  for(const mesh of lashes.meshes)assert.ok(Array.from(mesh.geometry.attributes.position.array).every(Number.isFinite));
 }lashes.dispose();assert.equal(root.children.length,1);
});

test('lash roots follow both closing eyelids, head motion, and eye-size changes without drift',()=>{
 const {root,head,lids}=fixture(),lashes=createModularEyelashes(root);lashes.updateLook({lashProminence:4});lashes.update();
 for(const blink of [0,.25,.5,.75,1]){
  for(const lid of lids)lid.morphTargetInfluences[0]=blink;
  head.rotation.y=.25;head.position.y=.1;lashes.update();assert.ok(rootError(root,lids,lashes)<.00025);
  const before=Array.from(lashes.meshes[0].geometry.attributes.position.array);for(let i=0;i<20;i++)lashes.update();assert.deepEqual(Array.from(lashes.meshes[0].geometry.attributes.position.array),before);
 }
 for(const lid of lids){const p=lid.geometry.attributes.position;for(let i=0;i<p.count;i++)p.setX(i,p.getX(i)*1.15);}
 lashes.update();assert.ok(rootError(root,lids,lashes)<.00025);lashes.dispose();
});

test('seeded lash choices overlap across both ranges while favouring fuller female presets',()=>{
 let men=0,women=0;const seen=[new Set(),new Set()];
 for(let seed=1;seed<=1600;seed++)for(const [index,male]of[true,false].entries()){
  const look=eyelashVariation(seed,male);assert.deepEqual(look,eyelashVariation(seed,male));assert.ok(look.lashProminence>=0&&look.lashProminence<=4);seen[index].add(look.lashProminence);if(male)men+=look.lashProminence;else women+=look.lashProminence;
 }
 assert.equal(seen[0].size,5);assert.equal(seen[1].size,5);assert.ok(women/1600>men/1600+.2);
});

test('auto lash colour follows hair tone, and unsupported heads retain their existing assets',()=>{
 const {root}=fixture(),lashes=createModularEyelashes(root);lashes.updateLook({hairTone:'black'});const dark=lashes.describe().color;lashes.updateLook({hairTone:'blond'});assert.notEqual(lashes.describe().color,dark);lashes.dispose();
 const empty=new THREE.Group(),unsupported=createModularEyelashes(empty);assert.equal(unsupported.available,false);unsupported.updateLook({lashProminence:4});unsupported.update();unsupported.dispose();assert.equal(empty.children.length,0);
});
