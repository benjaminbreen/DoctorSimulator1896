import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createModularBody } from '../../shared/characters/modularBody.js';
import { createModularWardrobe } from '../../shared/characters/modularWardrobe.js';
import { createModularIdentity, deformModularPoint, MODULAR_FEATURES } from '../../shared/characters/modularIdentity.js';
import { createModularVariation } from '../../shared/characters/modularVariants.js';
import { createModularHair, MODULAR_HAIR_STYLES } from '../../shared/characters/modularHair.js';
import { MODULAR_CAST_LOOKS } from '../../shared/characters/modularCast.js';

test('a seated outfit shows one skirt and keeps fabric changes off the hands', () => {
  const root = new THREE.Group();
  const parts = ['Patient_SkirtStanding', 'Patient_SkirtSeated', 'Patient_ApronStanding', 'Patient_ApronSeated'].map((name) => {
    const mesh = new THREE.Mesh(); mesh.name = name; root.add(mesh); return mesh;
  });
  const hands = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial({ color: '#9f7158' }));
  hands.material.name = 'Patient_Hands'; root.add(hands);
  const skin = hands.material.color.clone();
  const wardrobe = createModularWardrobe(root);
  wardrobe.update({ seated: false, apron: true, palette: 'forest' });
  assert.deepEqual(parts.map((part) => part.visible), [true, false, true, false]);
  wardrobe.update({ seated: true, apron: true, palette: 'navy' });
  assert.deepEqual(parts.map((part) => part.visible), [false, true, false, true]);
  assert.ok(hands.material.color.equals(skin));
});

test('a worker apron follows bent thighs instead of switching early with the seated cue', () => {
  const root=new THREE.Group(),formal=new THREE.Mesh(),apron=new THREE.Mesh();
  formal.name='Patient_FormalUpper';apron.name='Patient_WorkApronStanding';
  apron.morphTargetDictionary={rc_workSeated:0};apron.morphTargetInfluences=[0];root.add(formal,apron);
  const knees=[];
  for(const side of ['Left','Right']){
    const hip=new THREE.Bone(),knee=new THREE.Bone();
    hip.name=`mixamorig:${side}UpLeg`;knee.name=`mixamorig:${side}Leg`;
    knee.position.set(0,-.4,0);hip.add(knee);root.add(hip);knees.push(knee);
  }
  const wardrobe=createModularWardrobe(root);
  wardrobe.update({seated:true,outfit:'canvas-apron'});
  assert.equal(apron.morphTargetInfluences[0],0);
  for(const knee of knees)knee.position.set(0,-.28,.28);
  wardrobe.update({seated:true,outfit:'canvas-apron'});
  assert.ok(apron.morphTargetInfluences[0]>.1 && apron.morphTargetInfluences[0]<.5);
  for(const knee of knees)knee.position.set(0,0,.4);
  wardrobe.update({seated:true,outfit:'canvas-apron'});
  assert.equal(apron.morphTargetInfluences[0],1);
});

test('structural identity follows the face and eyes without changing an expression', () => {
  const root = new THREE.Group();
  const meshes = ['Face', 'Eyes', 'Hair'].map((name) => {
    const mesh = new THREE.Mesh(); mesh.name = name;
    mesh.morphTargetDictionary = { rc_headWidth: 0, rc_jawLength: 1, jawOpen: 2 };
    mesh.morphTargetInfluences = [0, 0, .04]; root.add(mesh); return mesh;
  });
  const identity = createModularIdentity(root);
  identity.update(1);
  assert.ok(meshes.every((mesh) => mesh.morphTargetInfluences[0] > 0));
  assert.ok(meshes.every((mesh) => mesh.morphTargetInfluences[2] === .04));
  meshes[0].morphTargetInfluences[0] = 0;
  identity.update(1);
  assert.equal(meshes[0].morphTargetInfluences[0], meshes[1].morphTargetInfluences[0]);
});

test('a compact lower face transports the posed expression and leaves the cached source intact', () => {
  const root = new THREE.Group();
  for (const [name, x, y] of [['Carmela_Eye_Left', .034188, 1.519592], ['Carmela_Lips', 0, 1.449]]) {
    const mesh = new THREE.Mesh(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(x, y, .09)]));
    mesh.name = name; root.add(mesh);
  }
  const geometry = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(.06,1.43,.07), new THREE.Vector3(.04,1.42,.10), new THREE.Vector3(.05,1.45,.08),
  ]);
  geometry.morphTargetsRelative = true;
  const interleaved = new THREE.InterleavedBuffer(new Float32Array([.123,0,0,1, .456,0,0,1, .789,0,0,1]),4);
  geometry.setAttribute('normal',new THREE.InterleavedBufferAttribute(interleaved,3,1));
  geometry.setAttribute('guard',new THREE.InterleavedBufferAttribute(interleaved,1,0));
  geometry.morphAttributes.position = [new THREE.Float32BufferAttribute([.01,-.005,0, .005,-.01,0, .01,-.01,0],3)];
  const face = new THREE.Mesh(geometry); face.name = 'Carmela_Face'; face.updateMorphTargets(); root.add(face);
  const original = geometry.attributes.position.array.slice();
  const identity = createModularIdentity(root); identity.update(0,{lowerFaceSize:-.6});
  const values = Object.fromEntries(Object.keys(MODULAR_FEATURES).map(name=>[name,0])); values.lowerFaceSize=-.6;
  const posed = new THREE.Vector3().fromBufferAttribute(geometry.attributes.position,0).add(new THREE.Vector3(.01,-.005,0));
  const expected = deformModularPoint(posed,values,identity.frame);
  const actual = new THREE.Vector3().fromBufferAttribute(face.geometry.attributes.position,0).add(new THREE.Vector3().fromBufferAttribute(face.geometry.morphAttributes.position[0],0));
  assert.ok(actual.distanceTo(expected)<1e-6);
  assert.deepEqual(geometry.attributes.position.array,original);
  assert.ok(face.geometry.attributes.position.getX(0)<original[0]);
  identity.update(0,{});
  assert.deepEqual(face.geometry.attributes.position.array,original);
  assert.equal(face.geometry.attributes.guard.getX(0),geometry.attributes.guard.getX(0));
});

test('lower-face reduction makes the chin shorter and smaller along with the jaw', () => {
  const frame={mouthY:1.449,eyeY:1.520,scale:1};
  const values=Object.fromEntries(Object.keys(MODULAR_FEATURES).map(name=>[name,0]));
  values.lowerFaceSize=-.6;
  const chin=new THREE.Vector3(.025,frame.mouthY-.045,.10);
  const smaller=deformModularPoint(chin.clone(),values,frame);
  assert.ok(smaller.x<chin.x && smaller.y>chin.y && smaller.z<chin.z);
  const jaw=new THREE.Vector3(.065,frame.mouthY-.015,.02);
  assert.ok(deformModularPoint(jaw.clone(),values,frame).x<jaw.x);
  for(const point of [new THREE.Vector3(.034,frame.eyeY,.09),new THREE.Vector3(0,frame.mouthY-.10,.02)]){
    assert.ok(deformModularPoint(point.clone(),values,frame).distanceTo(point)<1e-9);
  }
});

test('an edited closing lid keeps its posed surface normal and resets without changing the source', () => {
  const root = new THREE.Group();
  for (const [name,x,y] of [['Carmela_Eye_Left',.034188,1.519592],['Carmela_Lips',0,1.449]]) {
    const mesh = new THREE.Mesh(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(x,y,.09)]));
    mesh.name = name; root.add(mesh);
  }
  const geometry = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(.035,1.542,.105),new THREE.Vector3(.0355,1.542,.105),new THREE.Vector3(.035,1.5425,.105),
  ]);
  geometry.setAttribute('normal',new THREE.Float32BufferAttribute([0,0,1,0,0,1,0,0,1],3));
  geometry.morphTargetsRelative = true;
  geometry.morphAttributes.position = [new THREE.Float32BufferAttribute([0,-.005,0,0,-.005,0,0,-.005,-.000375],3)];
  geometry.morphAttributes.normal = [new THREE.Float32BufferAttribute([0,.6,-.2,0,.6,-.2,0,.6,-.2],3)];
  const lid = new THREE.Mesh(geometry); lid.name = 'Carmela_Lid_Left'; lid.updateMorphTargets(); root.add(lid);
  const source = geometry.morphAttributes.normal[0].array.slice();
  const identity = createModularIdentity(root); identity.update(0,{browProminence:1});
  const posed = [0,1,2].map(i=>new THREE.Vector3().fromBufferAttribute(lid.geometry.attributes.position,i)
    .add(new THREE.Vector3().fromBufferAttribute(lid.geometry.morphAttributes.position[0],i)));
  const surface = posed[1].clone().sub(posed[0]).cross(posed[2].clone().sub(posed[0])).normalize();
  const shading = new THREE.Vector3().fromBufferAttribute(lid.geometry.attributes.normal,0)
    .add(new THREE.Vector3().fromBufferAttribute(lid.geometry.morphAttributes.normal[0],0)).normalize();
  assert.ok(surface.dot(shading)>.999);
  assert.deepEqual(geometry.morphAttributes.normal[0].array,source);
  identity.update(0,{});
  assert.deepEqual(lid.geometry.morphAttributes.normal[0].array,source);
});

test('appearance seeds reproduce a varied cast within the feature bounds', () => {
  assert.deepEqual(createModularVariation(42),createModularVariation(42));
  const variants=Array.from({length:16},(_,i)=>createModularVariation(i+1));
  assert.ok(new Set(variants.map(v=>v.skinTone)).size>=5);
  assert.ok(new Set(variants.map(v=>v.hairTone)).size>=5);
  assert.ok(new Set(variants.map(v=>JSON.stringify(v.features))).size>=8);
  assert.ok(variants.every(v=>Object.values(v.features).every(n=>n>=-1&&n<=1)));
  assert.equal(new Set(variants.map(v=>v.hairStyle)).size,5);
});

test('the female and male studies have distinct, complete, bounded recipes', () => {
  assert.ok(MODULAR_CAST_LOOKS.filter(p=>p.cohort!=='men').length>=12);
  assert.ok(MODULAR_CAST_LOOKS.filter(p=>p.cohort==='men').length>=12);
  assert.equal(new Set(MODULAR_CAST_LOOKS.map(p=>p.id)).size,MODULAR_CAST_LOOKS.length);
  assert.equal(new Set(MODULAR_CAST_LOOKS.map(p=>JSON.stringify(p.look))).size,MODULAR_CAST_LOOKS.length);
  for(const preset of MODULAR_CAST_LOOKS) {
    assert.ok(['carmela-russo','seamstress-prototype','male-lean-template','male-broad-template','male-worker-template'].includes(preset.model));
    assert.ok(MODULAR_HAIR_STYLES[preset.look.hairStyle]);
    assert.ok(Object.entries(preset.look.features).every(([name,value])=>MODULAR_FEATURES[name] && value>=-1 && value<=1));
    for(const name of ['skinTone','hairTone','eyeTone','outfit','palette','hairVolume','hairWave','hairBunHeight','hairPartOffset','hairEarCoverage']) assert.notEqual(preset.look[name],undefined);
  }
});

test('hairstyles switch as complete fitted parts and keep facial expressions separate', () => {
  const root = new THREE.Group();
  const parts = Object.keys(MODULAR_HAIR_STYLES).filter(id=>!['bald','short-side-part','receding-sweep'].includes(id)).map(style => {
    style = style.replaceAll('-','_');
    const mesh = new THREE.Mesh(); mesh.name = `Carmela_HairStyle_${style}`;
    mesh.morphTargetDictionary = { rc_hairVolume: 0, rc_hairWave: 1, rc_hairBunHeight: 2, rc_hairPartOffset: 3, rc_hairEarCoverage: 4 };
    mesh.morphTargetInfluences = [0,0,0,0,0]; root.add(mesh); return mesh;
  });
  const face = new THREE.Mesh(); face.name = 'Carmela_Face'; face.morphTargetDictionary = { mouthSmileLeft: 0 }; face.morphTargetInfluences = [.6]; root.add(face);
  const hair = createModularHair(root);
  hair.update({hairStyle:'waved-knot',hairVolume:.5,hairWave:.7,hairBunHeight:.3,hairPartOffset:-.4});
  assert.deepEqual(parts.map(part=>part.visible),[false,true,false,false,false]);
  assert.deepEqual(parts[1].morphTargetInfluences,[.5,.7,.3,-.4,0]);
  assert.equal(face.morphTargetInfluences[0],.6);
  hair.update({hairStyle:'braided-knot'});
  assert.deepEqual(parts.map(part=>part.visible),[false,false,true,false,false]);
  assert.deepEqual(parts[2].morphTargetInfluences,[0,0,0,0,0]);
  hair.update({hairStyle:'curled-side-rolls',hairEarCoverage:1.5});
  assert.deepEqual(parts.map(part=>part.visible),[false,false,false,false,true]);
  assert.equal(parts[4].morphTargetInfluences[4],1);
});

test('hairstyle ownership follows the exported material group onto every primitive', () => {
  const root = new THREE.Group();
  const meshes = [];
  for (const style of ['center_chignon','waved_knot']) {
    const group = new THREE.Group(); group.name = `Carmela_HairStyle_${style}`; root.add(group);
    for (const part of ['HairSurface','ScalpPart']) {
      const mesh = new THREE.Mesh(); mesh.name = part; group.add(mesh); meshes.push(mesh);
    }
  }
  createModularHair(root).update({hairStyle:'waved-knot'});
  assert.deepEqual(meshes.map(mesh=>mesh.visible),[false,false,true,true]);
  assert.ok(meshes.every(mesh=>mesh.name.startsWith('Carmela_HairStyle_')));
});

test('identity edits use the skin bind transform rather than encoded vertex coordinates', () => {
  const root=new THREE.Group();
  for(const [name,x,y] of [['Carmela_Eye_Left',.034188,1.519592],['Carmela_Lips',0,1.449]]){
    const mesh=new THREE.Mesh(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(x,y,.09)]));mesh.name=name;root.add(mesh);
  }
  const geometry=new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(.06,.93,.07),new THREE.Vector3(.04,.92,.10),new THREE.Vector3(.05,.95,.08)]);
  geometry.setAttribute('skinIndex',new THREE.Uint16BufferAttribute([0,0,0,0,0,0,0,0,0,0,0,0],4));
  geometry.setAttribute('skinWeight',new THREE.Float32BufferAttribute([1,0,0,0,1,0,0,0,1,0,0,0],4));
  geometry.morphTargetsRelative=true;geometry.morphAttributes.position=[new THREE.Float32BufferAttribute([0,0,0,0,0,0,0,0,0],3)];
  const mesh=new THREE.SkinnedMesh(geometry);mesh.name='Carmela_Face';const bone=new THREE.Bone();bone.position.y=.5;mesh.add(bone);root.add(mesh);
  mesh.bind(new THREE.Skeleton([bone],[new THREE.Matrix4()]),new THREE.Matrix4());
  const identity=createModularIdentity(root);identity.update(0,{jawWidth:-.8});
  const values=Object.fromEntries(Object.keys(MODULAR_FEATURES).map(n=>[n,0]));values.jawWidth=-.8;
  const expected=deformModularPoint(new THREE.Vector3(.06,1.43,.07),values,identity.frame);
  const actual=mesh.applyBoneTransform(0,new THREE.Vector3().fromBufferAttribute(mesh.geometry.attributes.position,0));
  assert.ok(actual.distanceTo(expected)<1e-6);
});

 test('body proportions are bounded, instance local, and leave expressions alone', () => {
  const root = new THREE.Group(), mesh = new THREE.Mesh();
  mesh.morphTargetDictionary={rc_bellySize:0,rc_waistWidth:1,speechOpen:2}; mesh.morphTargetInfluences=[0,0,.3]; root.add(mesh);
  const body=createModularBody(root); body.update({bellySize:9,waistWidth:-9});
  assert.deepEqual(mesh.morphTargetInfluences,[1,-1,.3]);
  body.update({bellySize:-1}); assert.deepEqual(mesh.morphTargetInfluences,[-.4,0,.3]);
});
 test('a male groom switches to bald and falls back to an available style', () => {
  const root=new THREE.Group();
  for(const name of ['short_side_part','receding_sweep']) {const mesh=new THREE.Mesh();mesh.name='Carmela_HairStyle_'+name;root.add(mesh);}
  const hair=createModularHair(root); hair.update({hairStyle:'bald'}); assert.ok(root.children.every(o=>!o.visible));
  hair.update({hairStyle:'center-chignon'}); assert.deepEqual(root.children.map(o=>o.visible),[true,false]);
});
 test('a donor anchor measures the face from eye to mouth rather than eye spacing', () => {
  const root=new THREE.Group();
  for(const [name,x,y] of [['Carmela_Eye_Left',.04,1.65],['Carmela_Lips',0,1.575]]) {
    const mesh=new THREE.Mesh(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(x,y,.08)]));mesh.name=name;
    mesh.userData.modularReferenceSpan=.075;root.add(mesh);
  }
  assert.ok(Math.abs(createModularIdentity(root).frame.scale-1)<1e-5);
});

 test('moustaches and sideburns can be selected independently', async () => {
  const {createModularFacialHair}=await import('../../shared/characters/modularFacialHair.js');
  const root=new THREE.Group();
  for(const id of ['short_sideburns','mutton_chops','neat_moustache','full_moustache']){
    const mesh=new THREE.Mesh();mesh.name='Patient_FacialHair_'+id;root.add(mesh);
  }
  const hair=createModularFacialHair(root);hair.update({sideburns:'mutton-chops',moustache:'full-moustache'});
  assert.deepEqual(root.children.map(o=>o.visible),[false,true,false,true]);
  hair.update({sideburns:'none',moustache:'none'});assert.ok(root.children.every(o=>!o.visible));
});

test('work clothes swap independently of the face and choose one apron carrier', () => {
  const root=new THREE.Group();
  for(const name of ['Patient_FormalUpper','Patient_WorkShirt','Patient_WorkSleeves','Patient_WorkShirtButtons','Patient_WorkCollarButton',
    'Patient_WorkApronStanding','Patient_WorkApronSeated','Patient_WorkApronStraps',
    'Patient_WorkApronLeatherStanding','Patient_WorkApronLeatherSeated','Patient_WorkApronLeatherStraps']){
    const mesh=new THREE.Mesh();mesh.name=name;root.add(mesh);
  }
  const face=new THREE.Mesh();face.name='Carmela_Face';root.add(face);
  const wardrobe=createModularWardrobe(root);
  wardrobe.update({outfit:'work-shirt',seated:false});
  assert.equal(root.getObjectByName('Patient_FormalUpper').visible,false);
  assert.equal(root.getObjectByName('Patient_WorkShirt').visible,true);
  assert.ok(root.children.filter(o=>o.name.includes('Apron')).every(o=>!o.visible));
  wardrobe.update({outfit:'canvas-apron',seated:true});
  assert.equal(root.getObjectByName('Patient_WorkShirtButtons').visible,false);
  assert.equal(root.getObjectByName('Patient_WorkCollarButton').visible,true);
  assert.equal(root.getObjectByName('Patient_WorkApronStanding').visible,false);
  assert.equal(root.getObjectByName('Patient_WorkApronSeated').visible,true);
  assert.equal(root.getObjectByName('Patient_WorkApronLeatherSeated').visible,false);
  wardrobe.update({outfit:'leather-apron',seated:false});
  assert.equal(root.getObjectByName('Patient_WorkApronLeatherStanding').visible,true);
  assert.equal(root.getObjectByName('Patient_WorkApronSeated').visible,false);
  wardrobe.update({outfit:'tailored-clothes',seated:true});
  assert.equal(root.getObjectByName('Patient_FormalUpper').visible,true);
  assert.ok(root.children.filter(o=>o.name.startsWith('Patient_Work')).every(o=>!o.visible));
  assert.equal(face.visible,true);
});

test('male feature edits preserve the upper neck while changing the chin', () => {
  const frame={mouthY:1.52,eyeY:1.60,scale:1,neckGuard:true};
  const values=Object.fromEntries(Object.keys(MODULAR_FEATURES).map(name=>[name,0]));
  Object.assign(values,{lowerFaceSize:-.8,jawWidth:.7,chinWidth:-.5,chinLength:.4,chinProjection:.3});
  const neck=new THREE.Vector3(.02,frame.mouthY-.060,.03);
  assert.ok(deformModularPoint(neck.clone(),values,frame).distanceTo(neck)<1e-8);
  const chin=new THREE.Vector3(.025,frame.mouthY-.04,.105);
  assert.ok(deformModularPoint(chin.clone(),values,frame).distanceTo(chin)>.003);
});

test('an apron changes drape continuously through sitting without showing a second panel', () => {
  const root=new THREE.Group();
  for(const name of ['Patient_FormalUpper','Patient_WorkApronStanding','Patient_WorkApronSeated']){
    const mesh=new THREE.Mesh();mesh.name=name;root.add(mesh);
  }
  const panel=root.getObjectByName('Patient_WorkApronStanding');
  panel.morphTargetDictionary={rc_workSeated:0};panel.morphTargetInfluences=[0];
  const wardrobe=createModularWardrobe(root);
  wardrobe.update({outfit:'canvas-apron',seated:false});
  wardrobe.update({outfit:'canvas-apron',seated:true,dt:1/60});
  assert.ok(panel.morphTargetInfluences[0]>0 && panel.morphTargetInfluences[0]<1);
  assert.equal(panel.visible,true);
  assert.equal(root.getObjectByName('Patient_WorkApronSeated').visible,false);
  for(let i=0;i<60;i++)wardrobe.update({outfit:'canvas-apron',seated:true,dt:1/60});
  assert.ok(panel.morphTargetInfluences[0]>.999);
});

test('worker trousers share their fabric and restore the original material for formal clothes', () => {
  const root=new THREE.Group(),body=new THREE.Group();body.name='Patient_MaleBody';root.add(body);
  const original=new THREE.MeshStandardMaterial();original.name='Patient_MaleFabric';
  const wool=new THREE.MeshStandardMaterial();wool.name='Patient_WorkWool';
  const hands=new THREE.Mesh(new THREE.BoxGeometry(),new THREE.MeshStandardMaterial());hands.material.name='Patient_Hands';body.add(hands);
  const trousers=new THREE.Mesh(new THREE.BoxGeometry(),original);body.add(trousers);
  const waist=new THREE.Mesh(new THREE.BoxGeometry(),wool);waist.name='Patient_WorkTrouserWaist';root.add(waist);
  const wardrobe=createModularWardrobe(root);
  wardrobe.update({outfit:'work-shirt'});assert.equal(trousers.material,wool);assert.equal(hands.material.name,'Patient_Hands');
  wardrobe.update({outfit:'tailored-clothes'});assert.equal(trousers.material,original);
});

test('eye spacing moves both sockets while leaving the mouth and neck in place', () => {
  const frame={mouthY:1.52,eyeY:1.60,eyeX:.038,eyeZ:.08,scale:1,neckGuard:true};
  const values=Object.fromEntries(Object.keys(MODULAR_FEATURES).map(name=>[name,0]));
  values.eyeSpacing=1;
  for(const sign of [-1,1]){
    const eye=new THREE.Vector3(sign*.038,1.60,.08);
    const changed=deformModularPoint(eye.clone(),values,frame);
    assert.ok(Math.abs(changed.x-eye.x-sign*.006)<1e-8);
  }
  for(const point of [new THREE.Vector3(0,1.52,.10),new THREE.Vector3(.02,1.46,.03)]){
    assert.ok(deformModularPoint(point.clone(),values,frame).distanceTo(point)<1e-8);
  }
});
