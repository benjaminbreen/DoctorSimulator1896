import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createIO,contract,assertSameCharacter} from '../scripts/lib/glb-pipeline.mjs';
import {repairWristBinding} from '../scripts/lib/repair-wrist-binding.mjs';
import {readPostureSkeleton,postureClip} from '../scripts/lib/relax-standing-posture.mjs';

const io=await createIO(),finger=/Hand(?:Thumb|Index|Middle|Ring|Pinky)/;
for(const model of ['male-lean-template','male-broad-template'])test(`${model}: curling fingers cannot pull wrist skin through the cuff`,async()=>{
  const doc=await io.read(`game/public/models/characters/${model}.glb`),before=contract(doc);
  const body=doc.getRoot().listNodes().find(n=>n.getName()==='Patient_MaleBody'),skin=body.getSkin(),joints=skin.listJoints(),inverse=skin.getInverseBindMatrices();
  assert.equal(body.getExtras().wristBindingVersion,4);
  const formal=doc.getRoot().listNodes().find(n=>n.getName()==='Patient_FormalUpper');
  assert.ok(formal.getMesh().listPrimitives().every(p=>p.getMaterial().getName()!=='Patient_Hands'),'cuffs must not receive skin recolouring');
  assert.equal(formal.getExtras().cuffBindingVersion,1);
  const cuff=formal.getMesh().listPrimitives().find(p=>p.getMaterial().getName()==='Patient_FormalCuffFabric');
  assert.ok(cuff,'closed cloth cuffs');
  const edges=new Map(),indices=cuff.getIndices(),cuffPositions=cuff.getAttribute('POSITION');
  for(let i=0;i<indices.getCount();i+=3){
    const corners=[0,1,2].map(k=>cuffPositions.getElement(indices.getScalar(i+k),[]).join(','));
    for(let k=0;k<3;k++){const edge=[corners[k],corners[(k+1)%3]].sort().join('|');edges.set(edge,(edges.get(edge)||0)+1);}
  }
  assert.ok([...edges.values()].every(count=>count===2),'cuffs have an open edge');
  const cuffJoints=formal.getSkin().listJoints(),ids=cuff.getAttribute('JOINTS_0'),weights=cuff.getAttribute('WEIGHTS_0');
  let blended=0;
  for(let i=0;i<ids.getCount();i++){
    const index=ids.getElement(i,[]),weight=weights.getElement(i,[]);
    for(let k=0;k<4;k++)if(weight[k]>.0001)assert.match(cuffJoints[index[k]].getName(),/(?:Left|Right)(?:ForeArm|Hand)$/);
    if(weight.filter(w=>w>.05).length===2)blended++;
  }
  assert.ok(blended>50,'distal cuffs must bend with the wrist');
  const protectedPoints=[];let movingFingerPoints=0;
  for(const primitive of body.getMesh().listPrimitives()){
    const material=primitive.getMaterial().getName();if(!['Patient_Hands','Patient_WristSkin'].includes(material))continue;
    for(let i=0;i<primitive.getAttribute('POSITION').getCount();i++){
      const p=new THREE.Vector3().fromArray(primitive.getAttribute('POSITION').getElement(i,[])),ids=primitive.getAttribute('JOINTS_0').getElement(i,[]),weights=primitive.getAttribute('WEIGHTS_0').getElement(i,[]);
      const side=joints[ids[weights.indexOf(Math.max(...weights))]].getName().includes('Left')?'Left':'Right';
      const hand=joints.findIndex(n=>n.getName().replace(':','')==='mixamorig'+side+'Hand'),middle=joints.find(n=>n.getName().replace(':','')==='mixamorig'+side+'HandMiddle1');
      const local=p.clone().applyMatrix4(new THREE.Matrix4().fromArray(inverse.getElement(hand,[]))),forward=new THREE.Vector3().fromArray(middle.getTranslation()).normalize(),distance=local.dot(forward);
      if(distance<.0249)assert.ok(local.clone().addScaledVector(forward,-distance).length()<.0231,'covered skin lies outside the cuff clearance');
      const fingerWeight=weights.reduce((sum,w,k)=>sum+(finger.test(joints[ids[k]].getName())?w:0),0);
      if(material==='Patient_WristSkin'||distance<=.035){assert.ok(fingerWeight<.0001,'finger-bound forearm vertex');protectedPoints.push({p,ids,weights});}
      if(distance>.08&&fingerWeight>.5)movingFingerPoints++;
    }
  }
  assert.ok(protectedPoints.length>500);assert.ok(movingFingerPoints>100,'preserve articulated fingers');
  const {root,objects}=readPostureSkeleton(doc),fingerNodes=joints.filter(n=>finger.test(n.getName()));
  const matrices=()=>joints.map((n,i)=>new THREE.Matrix4().multiplyMatrices(objects.get(n).matrixWorld,new THREE.Matrix4().fromArray(inverse.getElement(i,[]))));
  const positions=()=>{const m=matrices();return protectedPoints.map(({p,ids,weights})=>weights.reduce((out,w,k)=>out.addScaledVector(p.clone().applyMatrix4(m[ids[k]]),w),new THREE.Vector3()));};
  for(const name of ['StandingIdle','Walk','ClinicIdle','SittingTalking']){
    const clip=postureClip(doc.getRoot().listAnimations().find(a=>a.getName()===name),objects),mixer=new THREE.AnimationMixer(root);mixer.clipAction(clip).play();mixer.setTime(.8);root.updateMatrixWorld(true);
    const original=positions();
    for(const node of fingerNodes)objects.get(node).rotateX(.8);
    root.updateMatrixWorld(true);const curled=positions();
    assert.ok(Math.max(...curled.map((p,i)=>p.distanceTo(original[i])))<.0001,name+' moves the wrist with a finger');
    mixer.stopAllAction();mixer.uncacheRoot(root);
  }
  assert.deepEqual(repairWristBinding(doc),[]);assertSameCharacter(before,doc,model);
});
