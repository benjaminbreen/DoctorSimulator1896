import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createIO,contract,assertSameCharacter} from '../scripts/lib/glb-pipeline.mjs';
import {relaxStandingPosture,readPostureSkeleton,postureClip,postureMetrics} from '../scripts/lib/relax-standing-posture.mjs';
import {EXPANSION_TEMPLATES} from '../shared/characters/patientExpansion.js';
const io=await createIO(),models=['carmela-russo','seamstress-prototype','male-lean-template','male-broad-template','male-worker-template',...EXPANSION_TEMPLATES.map(t=>t.id)];
test('published templates carry relaxed standing and walking hands in their own clips',async()=>{
 for(const model of models){
  const doc=await io.read(`game/public/models/characters/${model}.glb`),{root,objects,bones}=readPostureSkeleton(doc);
  for(const name of ['StandingIdle','Walk','SitDown','StandUp'])assert.equal(doc.getRoot().listAnimations().find(a=>a.getName()===name).getExtras().standingPostureVersion,1,model+' '+name);
  for(const node of doc.getRoot().listNodes().filter(n=>n.getName()==='Patient_SkirtStanding'))for(const primitive of node.getMesh().listPrimitives()){
   const ids=primitive.getAttribute('JOINTS_0'),weights=primitive.getAttribute('WEIGHTS_0'),joints=node.getSkin().listJoints();
   for(let i=0;i<ids.getCount();i++){const index=ids.getElement(i,[]),weight=weights.getElement(i,[]);for(let k=0;k<4;k++)if(weight[k]>.00001)assert.ok(!/(?:Left|Right)(?:Shoulder|Arm|ForeArm|Hand)/.test(joints[index[k]].getName()),model+' skirt is bound to an arm');}
  }
  for(const name of ['StandingIdle','Walk']){
   const animation=doc.getRoot().listAnimations().find(a=>a.getName()===name),clip=postureClip(animation,objects),mixer=new THREE.AnimationMixer(root),action=mixer.clipAction(clip).play();
   for(const fraction of [.1,.5,.9]){
    action.reset().play();mixer.setTime(clip.duration*fraction);root.updateMatrixWorld(true);
    for(const hand of Object.values(postureMetrics(bones)))assert.ok(hand.palmInward>.90,`${model}/${name}: palm faces away from its thigh`);
    for(const side of ['left','right']){
     const node=doc.getRoot().listNodes().find(n=>n.getName().replace(/^mixamorig:?/,'').toLowerCase()===side+'handmiddle2');
     const curl=objects.get(node).quaternion.angleTo(new THREE.Quaternion().fromArray(node.getRotation()));assert.ok(curl>.15&&curl<.8,`${model}: relaxed finger curl`);
    }
   }
   mixer.stopAllAction();mixer.uncacheRoot(root);
  }
  assert.deepEqual(relaxStandingPosture(doc),[],model+' correction is idempotent');
 }
});
test('posture correction preserves seated gestures, root travel and leg animation',async()=>{
 const doc=await io.read('game/public/models/characters/male-lean-template.glb'),standing=doc.getRoot().listAnimations().find(a=>a.getName()==='StandingIdle');standing.setExtras({});
 const snapshot=()=>doc.getRoot().listAnimations().flatMap(a=>a.listChannels().filter(c=>a!==standing||!/(?:Left|Right)(?:Arm|ForeArm|Hand)/.test(c.getTargetNode().getName())).map(c=>[a.getName(),c.getTargetNode().getName(),c.getTargetPath(),Array.from(c.getSampler().getOutput().getArray())]));
 const before=snapshot();assert.equal(relaxStandingPosture(doc).length,1);assert.deepEqual(snapshot(),before);
});
test('the export contract rejects an animation sampler missing from its clip',async()=>{
 const doc=await io.read('game/public/models/characters/male-lean-template.glb'),before=contract(doc),animation=doc.getRoot().listAnimations()[0],channel=animation.listChannels()[0];
 channel.setSampler(doc.createAnimationSampler().setInput(channel.getSampler().getInput()).setOutput(channel.getSampler().getOutput()));
 assert.throws(()=>assertSameCharacter(before,doc,'fixture'),/unregistered animation sampler/);
});
