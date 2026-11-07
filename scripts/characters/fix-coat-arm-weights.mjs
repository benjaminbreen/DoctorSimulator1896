// The lean template's coat carries arm weight down its side panels and skirt,
// so raising an arm (taking off a hat) tears the coat open at the hip.
// Fade arm weight on garment vertices far from the arm and hand it to
// the torso joint the vertex already follows.
// Usage: node scripts/characters/fix-coat-arm-weights.mjs [--dry] [files...]
import {rename} from 'node:fs/promises';
import path from 'node:path';
import * as THREE from 'three';
import {createIO,contract,assertSameCharacter} from '../lib/glb-pipeline.mjs';

// Metres from the arm bone: a sleeve sits inside NEAR, a coat panel past FAR.
const NEAR=.12,FAR=.17;
const dry=process.argv.includes('--dry');
const files=process.argv.slice(2).filter(a=>!a.startsWith('--'));
const io=await createIO();
const boneName=node=>node.getName().replace(/^mixamorig:?/,'');
for(const file of files){
  const document=await io.read(path.resolve(file)),before=contract(document);
  const report={};
  for(const node of document.getRoot().listNodes()){
    const mesh=node.getMesh(),skin=node.getSkin();
    if(!mesh||!skin)continue;
    const joints=skin.listJoints().map(boneName),bind=skin.getInverseBindMatrices();
    const at=i=>new THREE.Vector3().setFromMatrixPosition(new THREE.Matrix4().fromArray(bind.getElement(i,[])).invert());
    const spine=['Spine2','Spine1','Spine'].map(n=>joints.indexOf(n)).find(i=>i>=0);
    // Each arm bone owns the segment to its child; distance is measured to that.
    const segments=new Map();
    for(const side of ['Left','Right']){
      const [arm,forearm,hand]=['Arm','ForeArm','Hand'].map(n=>joints.indexOf(side+n));
      if(arm>=0&&forearm>=0)segments.set(arm,new THREE.Line3(at(arm),at(forearm)));
      if(forearm>=0&&hand>=0)segments.set(forearm,new THREE.Line3(at(forearm),at(hand)));
    }
    if(!segments.size||spine===undefined)continue;
    const point=new THREE.Vector3(),closest=new THREE.Vector3();
    for(const primitive of mesh.listPrimitives()){
      if(/Hands|Skin|Hair|Eye|Lid|Lips|Teeth|Gums|Tongue|Mouth/i.test(primitive.getMaterial()?.getName()||''))continue;
      const positions=primitive.getAttribute('POSITION'),ids=primitive.getAttribute('JOINTS_0'),weights=primitive.getAttribute('WEIGHTS_0');
      if(!ids||!weights)continue;
      let moved=0;
      for(let i=0;i<positions.getCount();i++){
        const id=ids.getElement(i,[]),weight=weights.getElement(i,[]);
        point.fromArray(positions.getElement(i,[]));
        let changed=false;
        for(let k=0;k<4;k++){
          const segment=segments.get(id[k]);
          if(!segment||weight[k]<=0)continue;
          const distance=segment.closestPointToPoint(point,true,closest).distanceTo(point);
          const keep=THREE.MathUtils.clamp((FAR-distance)/(FAR-NEAR),0,1);
          if(keep>=1)continue;
          const removed=weight[k]*(1-keep);
          // Prefer the strongest torso joint already on the vertex; else the chest.
          let to=-1,best=0;
          id.forEach((joint,slot)=>{if(!segments.has(joint)&&weight[slot]>best){best=weight[slot];to=slot;}});
          if(to<0){to=weight.findIndex((w,slot)=>slot!==k&&w===0);if(to<0)continue;id[to]=spine;}
          weight[k]-=removed;weight[to]+=removed;changed=true;
        }
        if(changed){ids.setElement(i,id);weights.setElement(i,weight);moved++;}
      }
      if(moved)report[`${node.getName()}/${primitive.getMaterial()?.getName()}`]=moved;
    }
  }
  console.log('COAT_ARM_WEIGHTS',path.basename(file),JSON.stringify(report));
  if(dry||!Object.keys(report).length)continue;
  const temp=path.resolve(file)+'.tmp.glb';
  assertSameCharacter(before,document,file);await io.write(temp,document);assertSameCharacter(before,await io.read(temp),file);await rename(temp,path.resolve(file));
}
