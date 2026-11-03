import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createCasePatient} from '../game/src/consultation/casePatients.js';
import {CONDITIONS} from '../shared/patients/cases/conditions.js';
import {EXPANSION_TEMPLATES} from '../shared/characters/patientExpansion.js';

test('generated case patients select compatible, shipped and animated templates',async()=>{
  const models=new Map();
  for(const condition of CONDITIONS)for(const seed of [2,5,17,42,77,1234,7919,48271]){
    const patient=createCasePatient(condition.id,{id:'appearance-contract',seed}),asset=patient.actor.recipe.asset;
    const model=asset.path.match(/\/characters\/([^/?]+)\.glb/)?.[1];assert.ok(model,'missing modular asset');
    const template=EXPANSION_TEMPLATES.find(t=>t.id===model);
    if(template){assert.equal(template.sex,patient.profile.identity.sex);assert.equal(asset.outfit,template.outfit);}
    else{
      assert.equal(model.startsWith('male-')?'male':'female',patient.profile.identity.sex);
      const outfits=model==='male-worker-template'?['work-shirt']:model.startsWith('male-')?['tailored-clothes','work-shirt','canvas-apron','leather-apron']:['day-dress','work-apron'];
      assert.ok(outfits.includes(asset.outfit),model+' has no '+asset.outfit);
    }
    if(!models.has(model)){
      const bytes=await readFile(new URL(`../game/public/models/characters/${model}.glb`,import.meta.url));
      assert.equal(bytes.toString('ascii',0,4),'glTF',model+' is not a shipped GLB');
      models.set(model,JSON.parse(bytes.toString('utf8',20,20+bytes.readUInt32LE(12))));
    }
    const gltf=models.get(model),clips=new Set(gltf.animations.map(a=>a.name));
    for(const clip of Object.values(asset.clipMap))assert.ok(clips.has(clip),model+' is missing '+clip);
    if(patient.profile.identity.sex==='male')assert.ok(gltf.nodes.some(n=>n.name==='Patient_FacialHair_short_sideburns'&&n.extras?.sideburnFitVersion===2),model+' uses the old sideburns');
  }
});
