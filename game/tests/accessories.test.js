import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {createPeriodAccessories,accessoryVariation,ACCESSORY_CHOICES} from '../../shared/characters/periodAccessories.js';
import {ACCESSORY_DEFAULTS,buildNeckwear,disposeAccessories} from '../../shared/characters/accessoryGeometry.js';

function fixture(withTie=false){
  const root=new THREE.Group(),chest=new THREE.Bone(),head=new THREE.Bone();chest.name='mixamorigSpine2';chest.position.y=1.25;head.name='mixamorigHead';head.position.y=.25;chest.add(head);root.add(chest);root.updateMatrixWorld(true);
  const skeleton=new THREE.Skeleton([chest,head]);skeleton.calculateInverses();
  function mesh(name,g,joint,material='Patient_FacialSkin',parent=root){
    const count=g.attributes.position.count,indices=new Uint16Array(count*4),weights=new Float32Array(count*4);for(let i=0;i<count;i++){indices[i*4]=joint;weights[i*4]=1;}
    g.setAttribute('skinIndex',new THREE.Uint16BufferAttribute(indices,4));g.setAttribute('skinWeight',new THREE.Float32BufferAttribute(weights,4));
    const m=new THREE.SkinnedMesh(g,new THREE.MeshStandardMaterial({name:material}));m.name=name;parent.add(m);m.bind(skeleton);return m;
  }
  const face=new THREE.SphereGeometry(1,24,16);face.scale(.08,.12,.075);face.translate(0,1.64,0);mesh('Carmela_Face',face,1);
  for(const [name,x]of [['Left',.032],['Right',-.032]]){const g=new THREE.SphereGeometry(.015,16,12);g.translate(x,1.64,.065);mesh('Carmela_Eye_'+name,g,1,'Carmela_EyeSurface');}
  const torso=new THREE.SphereGeometry(1,24,16);torso.scale(.22,.30,.10);torso.translate(0,1.2,0);mesh('Patient_WorkShirt',torso,0,'Patient_WorkCotton');
  const formal=new THREE.Group();formal.name='Patient_FormalUpper';root.add(formal);let g=new THREE.PlaneGeometry(.20,.23,16,18);g.translate(0,1.38,.12);
  if(withTie){const tie=new THREE.BoxGeometry(.04,.13,.008);tie.translate(0,1.42,.13);const merged=mergeGeometries([g,tie]);g.dispose();tie.dispose();g=merged;}
  const shirt=mesh('Formal_Source',g,0,'Patient_MaleFabric',formal);root.updateMatrixWorld(true);
  return {root,head,chest,shirt,frame:{eyeX:.032,eyeY:1.64,mouthY:1.55,scale:1}};
}

test('all accessory families produce finite geometry within the detail budget',()=>{
  const {root,frame}=fixture(),controller=createPeriodAccessories(root,{frame,cohort:'men'});
  let caseIndex=0;
  for(const glassesStyle of Object.keys(ACCESSORY_CHOICES.glassesStyle))for(const neckwearStyle of Object.keys(ACCESSORY_CHOICES.neckwearStyle)){
    controller.updateLook({glassesStyle,neckwearStyle,broochStyle:Object.keys(ACCESSORY_CHOICES.broochStyle)[caseIndex%5],earringStyle:Object.keys(ACCESSORY_CHOICES.earringStyle)[caseIndex%5],locketStyle:Object.keys(ACCESSORY_CHOICES.locketStyle)[caseIndex%3],tiePin:'stone',watchChain:'double'});caseIndex++;
    const info=controller.describe();assert.ok(info.available&&info.triangles<24000,`${neckwearStyle}: ${info.triangles} triangles`);assert.ok(info.drawCalls<=14);
    root.traverse(o=>{if(o.isMesh&&o.name.startsWith('Accessory_'))for(const a of Object.values(o.geometry.attributes))assert.ok(Array.from(a.array).every(Number.isFinite));});
  }controller.dispose();
});

test('neckwear has adult proportions, closed cloth edges and usable material coordinates',()=>{
  const front=()=>.1;front.max=front;const fit={scale:1,knotY:1.5,front};
  for(const neckwearStyle of ['bow','ribbon','tie','narrow','cravat','kerchief']){
    const group=buildNeckwear(fit,{...ACCESSORY_DEFAULTS,neckwearStyle}),box=new THREE.Box3().setFromObject(group),size=box.getSize(new THREE.Vector3());
    assert.ok(size.z>.015,neckwearStyle+' must have volume');
    if(['bow','ribbon'].includes(neckwearStyle))assert.ok(size.x>.10,'bows should span a realistic collar width');
    const g=group.children[0].geometry,edges=new Map(),p=g.attributes.position;
    const key=i=>[p.getX(i),p.getY(i),p.getZ(i)].map(n=>Math.round(n*1e6)).join('/');
    for(let i=0;i<g.index.count;i+=3)for(let j=0;j<3;j++){
      const a=key(g.index.getX(i+j)),b=key(g.index.getX(i+(j+1)%3));if(a===b)continue;const e=[a,b].sort().join('|');edges.set(e,(edges.get(e)||0)+1);
    }
    assert.equal([...edges.values()].filter(n=>n===1).length,0,neckwearStyle+' has no open cut edges');
    assert.ok(Array.from(g.attributes.uv.array).every(Number.isFinite));disposeAccessories(group);
  }
});

test('new garment ties use the shirt closure rather than the facial mouth offset',()=>{
  const {root,frame,shirt}=fixture();root.userData.garmentStyle='frock-coat';shirt.material.name='Patient_MaleShirt';
  const controller=createPeriodAccessories(root,{frame,cohort:'men'});controller.updateLook({neckwearStyle:'tie'});
  const fit=controller.describe().fit;assert.ok(Math.abs(fit.closureY-1.495)<1e-5);assert.ok(fit.knotY<fit.closureY);
  controller.updateLook({neckwearStyle:'original',collarStud:'pearl'});assert.ok(root.getObjectByName('Accessory_CollarStudStone'));
  controller.dispose();
  for(let seed=1;seed<=50;seed++)assert.ok(!['original','none'].includes(accessoryVariation(seed,'men','dress','frock-coat').neckwearStyle));
});

test('head and torso accessories follow their own bones without drift',()=>{
  const {root,frame,head,chest}=fixture(),controller=createPeriodAccessories(root,{frame});controller.updateLook({glassesStyle:'oval',broochStyle:'oval',earringStyle:'drop'});controller.update();
  const relative=(bone,group)=>new THREE.Matrix4().copy(bone.matrixWorld).invert().multiply(group.matrixWorld).elements;
  const initial=controller.groups.map((g,i)=>relative(i?chest:head,g).slice());
  for(let i=0;i<30;i++){
    head.rotation.set(.1*Math.sin(i),.3*Math.cos(i),.04);chest.rotation.y=.1*Math.sin(i);root.rotation.y=.7;root.position.set(2,.05,-1);controller.update();
    controller.groups.forEach((g,j)=>relative(j?chest:head,g).forEach((v,k)=>assert.ok(Math.abs(v-initial[j][k])<1e-6)));
  }controller.dispose();
});

test('replacing a native tie partitions it once and disposal restores the shared garment',()=>{
  const {root,frame,shirt}=fixture(),geometry=shirt.geometry,count=geometry.index.count,controller=createPeriodAccessories(root,{frame,cohort:'men'});
  for(const style of ['bow','cravat','none','tie','bow']){
    controller.updateLook({neckwearStyle:style});const pieces=[];root.traverse(o=>{if(o.name==='Accessory_NativeTie')pieces.push(o);});
    assert.equal(pieces.length,1);assert.equal(shirt.geometry.index.count+pieces[0].geometry.index.count,count);assert.equal(pieces[0].visible,false);
  }
  controller.updateLook({neckwearStyle:'original'});assert.equal(root.getObjectByName('Accessory_NativeTie').visible,true);
  controller.dispose();assert.equal(shirt.geometry,geometry);assert.equal(root.getObjectByName('Accessory_NativeTie'),undefined);
});

test('seeded accessories are reproducible, bounded and optional across authoring ranges',()=>{
  const seen=new Set();for(const cohort of ['men','women'])for(const range of ['plain','everyday','dress'])for(let seed=1;seed<100;seed++){
    const look=accessoryVariation(seed,cohort,range,'tailored-clothes');assert.deepEqual(look,accessoryVariation(seed,cohort,range,'tailored-clothes'));
    for(const [name,choices]of Object.entries(ACCESSORY_CHOICES))assert.ok(look[name] in choices);seen.add(look.glassesStyle);
  }assert.equal(seen.size,5);
  const empty=new THREE.Group(),unsupported=createPeriodAccessories(empty);assert.equal(unsupported.available,false);unsupported.updateLook({glassesStyle:'round'});unsupported.update();unsupported.dispose();assert.equal(empty.children.length,0);
});

test('a separate tie is removed as a complete component rather than leaving neckband scraps',()=>{
  const {root,frame,shirt}=fixture(true),original=shirt.geometry,controller=createPeriodAccessories(root,{frame,cohort:'men'});
  controller.updateLook({neckwearStyle:'bow'});assert.deepEqual(controller.describe().nativeTieModes,['component']);
  const native=root.getObjectByName('Accessory_NativeTie');assert.equal(native.geometry.index.count,36);assert.equal(shirt.geometry.index.count+native.geometry.index.count,original.index.count);
  controller.dispose();assert.equal(shirt.geometry,original);
});

test('fitted neckwear keeps its garment attachment through root movement and torso bends',()=>{
  const {root,frame,chest,head}=fixture(),controller=createPeriodAccessories(root,{frame,cohort:'men'});controller.updateLook({neckwearStyle:'cravat'});root.updateMatrixWorld(true);
  const cloth=root.getObjectByName('Accessory_NeckwearCloth');assert.equal(cloth.isSkinnedMesh,true);
  const relative=()=>cloth.getVertexPosition(0,new THREE.Vector3()).applyMatrix4(cloth.matrixWorld).applyMatrix4(chest.matrixWorld.clone().invert());
  const initial=relative();
  for(let i=0;i<30;i++){
    chest.rotation.set(.15*Math.sin(i),.2*Math.cos(i),.05);head.rotation.y=.4*Math.sin(i);root.position.set(2,.1,-3);root.rotation.y=.7;
    controller.update();root.updateMatrixWorld(true);assert.ok(relative().distanceTo(initial)<1e-5);
  }
  controller.dispose();assert.equal(root.getObjectByName('Patient_FittedNeckwear'),undefined);
});

test('loose ribbons react to movement, keep their knot pinned and settle at rest',()=>{
  const {root,frame,chest}=fixture(),controller=createPeriodAccessories(root,{frame});controller.updateLook({neckwearStyle:'ribbon'});
  const mesh=root.getObjectByName('Accessory_NeckwearCloth'),p=mesh.geometry.attributes.position,w=mesh.geometry.attributes.accessoryLoose,rest=p.array.slice();
  assert.ok(controller.describe().looseCloth.vertices>0);
  let largest=0;
  for(let frame=0;frame<90;frame++){
    chest.position.x=.03*Math.sin(frame*.08);chest.rotation.z=.12*Math.sin(frame*.10);controller.update(1/60);
    const motion=controller.describe().looseCloth;largest=Math.max(largest,Math.abs(motion.sway));assert.ok(motion.lift>=0&&motion.lift<=.018);
  }
  assert.ok(largest>.0005,'movement must visibly affect the free ends');
  for(let i=0;i<p.count;i++)if(w.getX(i)===0)for(let j=0;j<3;j++)assert.equal(p.array[i*3+j],rest[i*3+j],'knot and loops stay fixed');
  for(let i=0;i<360;i++)controller.update(1/60);
  const settled=controller.describe().looseCloth;assert.ok(Math.abs(settled.sway)+settled.lift<.00001);
  root.position.x=20;controller.update(1/60);assert.ok(Math.abs(controller.describe().looseCloth.sway)<.0001,'teleports do not kick the ribbons');
  controller.resetMotion();assert.deepEqual(p.array,rest);controller.dispose();
});
