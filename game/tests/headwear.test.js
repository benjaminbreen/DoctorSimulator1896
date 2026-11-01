import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {HEADWEAR_STYLES,buildHeadwear,disposeHeadwear,headwearVariation} from '../../shared/characters/headwearGeometry.js';
import {createHeadwear,fitPatientHat} from '../../shared/characters/headwearPerformance.js';
import {createCharacterRecipe} from '../../shared/characters/recipe.js';

function fixture(){
  const root=new THREE.Group(),bones=[];
  function bone(name,parent,x,y,z){const b=new THREE.Bone();b.name='mixamorig'+name;b.position.set(x,y,z);parent.add(b);bones.push(b);return b;}
  const hips=bone('Hips',root,0,0,0),head=bone('Head',hips,0,1.55,0);
  for(const [side,sign] of [['Left',1],['Right',-1]]){
    const arm=bone(side+'Arm',hips,sign*.18,1.4,0),fore=bone(side+'ForeArm',arm,sign*.27,0,0),hand=bone(side+'Hand',fore,sign*.25,0,0);
    for(const [finger,z] of [['Thumb',.035],['Index',.02],['Middle',0],['Ring',-.02],['Pinky',-.035]]){
      let parent=hand;for(let i=1;i<=3;i++)parent=bone(side+'Hand'+finger+i,parent,sign*(i===1?.055:.02),0,i===1?z:0);
    }
  }
  root.updateMatrixWorld(true);
  const skeleton=new THREE.Skeleton(bones),geometry=new THREE.SphereGeometry(1,24,16);geometry.scale(.09,.135,.10);geometry.translate(0,1.66,0);
  const count=geometry.attributes.position.count,indices=new Uint16Array(count*4),weights=new Float32Array(count*4);
  for(let i=0;i<count;i++){indices[i*4]=bones.indexOf(head);weights[i*4]=1;}
  geometry.setAttribute('skinIndex',new THREE.Uint16BufferAttribute(indices,4));geometry.setAttribute('skinWeight',new THREE.Float32BufferAttribute(weights,4));
  const mesh=new THREE.SkinnedMesh(geometry,new THREE.MeshStandardMaterial());root.add(mesh);mesh.bind(skeleton);root.updateMatrixWorld(true);
  return {root,head,bones};
}

test('all hat families have finite textured geometry within a consultation budget',()=>{
  for(const style of Object.keys(HEADWEAR_STYLES))for(const extreme of [-1,1]){
    const hat=buildHeadwear({hatStyle:style,hatCrownHeight:extreme,hatBrimWidth:extreme,hatDecoration:1,hatWear:1});let triangles=0;
    hat.traverse(mesh=>{if(!mesh.isMesh)return;const p=mesh.geometry.attributes.position;assert.ok(Array.from(p.array).every(Number.isFinite),style);triangles+=(mesh.geometry.index?.count||p.count)/3;assert.ok([0,.55].includes(mesh.material.metalness));});
    assert.ok(triangles<18000,style+' triangle budget');assert.ok(hat.userData.gripPoint.every(Number.isFinite));hat.userData.releaseTies(1);hat.userData.releaseTies(0);disposeHeadwear(hat);
  }
});

test('seeded variations respect the selected range and retain useful diversity',()=>{
  for(const cohort of ['men','women'])for(const socialClass of ['working','middle','affluent']){
    const styles=new Set();
    for(let i=1;i<=80;i++){
      const seed=i,look=headwearVariation(seed,cohort,socialClass),style=HEADWEAR_STYLES[look.hatStyle];
      assert.deepEqual(look,headwearVariation(seed,cohort,socialClass));assert.equal(style.cohort,cohort);assert.ok(style.classes.includes(socialClass));
      assert.ok(Math.abs(look.hatCrownHeight)<=.4&&Math.abs(look.hatBrimWidth)<=.4&&look.hatWear<=1);styles.add(look.hatStyle);
    }
    assert.ok(styles.size>=3,cohort+' '+socialClass);
  }
});

test('hat fit ignores hidden hairstyles and stays in the bind frame during head motion',()=>{
  const {root,head}=fixture(),first=fitPatientHat(root,head),hidden=root.children.find(x=>x.isMesh).clone();hidden.visible=false;hidden.position.y=10;root.add(hidden);
  assert.equal(fitPatientHat(root,head).topY,first.topY);
  head.rotation.set(.3,.2,-.1);root.updateMatrixWorld(true);const moved=fitPatientHat(root,head,first.bind);
  assert.ok(Math.abs(moved.topY-first.topY)<1e-6);assert.ok(Math.abs(moved.radiusX-first.radiusX)<1e-6);
});

test('a tilted creased crown clears the scalp at its lowest central roof',()=>{
  const {root}=fixture(),headwear=createHeadwear(root,{hatStyle:'homburg',hatTilt:.6});
  const top=new THREE.Vector3(0,1.795,0).applyMatrix4(headwear.hat.matrixWorld.clone().invert());
  const crown=headwear.hat.getObjectByName('PatientHat_Crown');
  const hit=new THREE.Raycaster(new THREE.Vector3(0,3,0),new THREE.Vector3(0,-1,0)).intersectObject(crown)[0];
  assert.ok(hit&&top.y< headwear.hat.worldToLocal(hit.point.clone()).y-.001);headwear.dispose();
});

test('an asset axis correction does not turn the fitted hat on its side',()=>{
  const {root}=fixture(),asset=new THREE.Group();root.rotation.x=Math.PI/2;asset.rotation.x=-Math.PI/2;asset.add(root);asset.updateMatrixWorld(true);
  const headwear=createHeadwear(asset,{hatStyle:'plain-straw'}),up=new THREE.Vector3(0,1,0).applyQuaternion(headwear.hat.getWorldQuaternion(new THREE.Quaternion()));
  assert.ok(up.dot(new THREE.Vector3(0,1,0))>.999);assert.ok(headwear.hat.getWorldPosition(new THREE.Vector3()).y>1.65);
  headwear.sample('held',1);assert.ok(headwear.describe().gripError<1e-6);headwear.dispose();
});

test('remove, reverse, and replace preserve the head and restore both arms',()=>{
  for(const hand of ['left','right']){
    const {root,head,bones}=fixture(),initial=bones.map(b=>b.quaternion.clone()),headwear=createHeadwear(root,{hatStyle:'bowler',hatHand:hand});
    const worn=headwear.hat.matrixWorld.clone();
    headwear.request(false);
    for(let i=0;i<150;i++){headwear.restorePose();headwear.update(1/60);}
    assert.ok(headwear.describe().progress>.6);assert.equal(headwear.describe().owner,hand+'-hand');assert.ok(headwear.describe().gripError<1e-6);
    headwear.request(true);
    for(let i=0;i<240;i++){headwear.restorePose();headwear.update(1/60);}
    assert.equal(headwear.describe().state,'worn');assert.ok(head.quaternion.angleTo(initial[bones.indexOf(head)])<1e-7);
    assert.ok(bones.every((b,i)=>b.quaternion.angleTo(initial[i])<1e-7));assert.ok(worn.elements.every((v,i)=>Math.abs(v-headwear.hat.matrixWorld.elements[i])<1e-6));headwear.dispose();
  }
});

test('a held hat follows the examination hand without replacing the arm pose',()=>{
  const {root,bones}=fixture(),headwear=createHeadwear(root,{hatStyle:'top-hat'});headwear.sample('held',1);headwear.restorePose();
  const left=bones.find(b=>b.name==='mixamorigLeftArm'),right=bones.find(b=>b.name==='mixamorigRightArm');left.rotation.z=.7;right.rotation.z=-.5;
  const leftPose=left.quaternion.clone(),rightPose=right.quaternion.clone();root.updateMatrixWorld(true);headwear.update(0,{followHand:true});
  assert.ok(left.quaternion.angleTo(leftPose)<1e-7);assert.ok(right.quaternion.angleTo(rightPose)<1e-7);assert.ok(headwear.describe().gripError<1e-6);headwear.dispose();
});

test('hat gestures survive recipe normalization',()=>{
  for(const gesture of ['remove-hat','put-on-hat'])assert.equal(createCharacterRecipe({animation:{gesture}}).animation.gesture,gesture);
});
