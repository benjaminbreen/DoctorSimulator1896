import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createIO} from '../scripts/lib/glb-pipeline.mjs';
import {maleAttachmentFrame,repairMaleNape,repairMaleSideburns} from '../scripts/lib/repair-male-attachments.mjs';
import {EXPANSION_TEMPLATES} from '../shared/characters/patientExpansion.js';
const io=await createIO(),models=['male-lean-template','male-broad-template','male-worker-template',...EXPANSION_TEMPLATES.filter(t=>t.sex==='male').map(t=>t.id)];
for(const model of models)test(`${model}: nape fits the collar and sideburns join the scalp`,async()=>{
  const doc=await io.read(`game/public/models/characters/${model}.glb`),frame=maleAttachmentFrame(doc);
  assert.equal(frame.face.getExtras().napeFitVersion,1);
  const back=frame.points.filter(p=>Math.abs(p.x-frame.neck.x)<.02*frame.scale&&Math.abs(p.y-frame.collarTop)<.005*frame.scale&&p.z<frame.neck.z-.02*frame.scale);
  assert.ok(back.length>5,'neck/collar sample is empty');
  for(const p of back)assert.ok(p.z>frame.neck.z-frame.radiusZ-.001*frame.scale,'nape protrudes behind the collar opening');
  const scalp=doc.getRoot().listMaterials().find(m=>m.getName()==='Carmela_DarkHair'),faceTargets=frame.face.getMesh().listPrimitives()[0].listTargets().map(t=>t.getName());
  const nodes=doc.getRoot().listNodes().filter(n=>/^Patient_FacialHair_(short_sideburns|long_sideburns|mutton_chops)$/.test(n.getName()));
  assert.equal(nodes.length,3);
  for(const node of nodes){
    assert.equal(node.getExtras().sideburnFitVersion,2);
    const primitive=node.getMesh().listPrimitives()[0],positions=primitive.getAttribute('POSITION'),colors=primitive.getAttribute('COLOR_0');
    assert.equal(primitive.getMaterial().getBaseColorTexture(),scalp.getBaseColorTexture(),'sideburns must share the scalp colour texture');
    assert.equal(primitive.getMaterial().getNormalTexture(),scalp.getNormalTexture(),'sideburns must share the scalp strand detail');
    assert.deepEqual(primitive.listTargets().map(t=>t.getName()),faceTargets,'preserve facial variation and expression shapes');
    const skin=node.getSkin(),joint=skin.listJoints()[0],matrix=new THREE.Matrix4().multiplyMatrices(frame.objects.get(joint).matrixWorld,new THREE.Matrix4().fromArray(skin.getInverseBindMatrices().getElement(0,[]))),temples={'-1':0,'1':0};
    let earOverlap=0;
    for(let i=0;i<positions.getCount();i++){
      const p=new THREE.Vector3().fromArray(positions.getElement(i,[])).applyMatrix4(matrix);assert.ok(p.toArray().every(Number.isFinite));
      if(colors.getElement(i,[])[3]<.4)continue;
      const sign=p.x>frame.eye.x?1:-1,ear=frame.ears[sign];
      if(p.y>ear.top+.005*frame.scale&&p.y<ear.top+.020*frame.scale&&p.z<ear.upperFront+.010*frame.scale)temples[sign]++;
      if(!node.getName().endsWith('mutton_chops')&&p.y>ear.bottom+.006*frame.scale&&p.y<ear.top-.006*frame.scale&&p.z<ear.front+.002*frame.scale&&Math.abs(p.x-frame.eye.x)>ear.outer*.96)earOverlap++;
    }
    assert.ok(Object.values(temples).every(n=>n>5),'bare triangle between the sideburn, ear and scalp');
    assert.equal(earOverlap,0,'hair projects onto the protruding ear');
  }
  assert.deepEqual(repairMaleNape(doc),[]);assert.deepEqual(await repairMaleSideburns(doc),[]);
});
