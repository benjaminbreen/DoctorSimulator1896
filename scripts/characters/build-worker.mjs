import {spawnSync} from 'node:child_process';
import {existsSync} from 'node:fs';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createIO} from '../lib/glb-pipeline.mjs';
import assert from 'node:assert/strict';

const root=path.resolve(import.meta.dirname,'../..');
const blender=[process.env.BLENDER_BIN,'/Applications/Blender.app/Contents/MacOS/Blender','/private/tmp/ghosts-character-tools/Blender52.app/Contents/MacOS/Blender'].find(p=>p&&existsSync(p));
if(!blender)throw new Error('Set BLENDER_BIN to Blender 5.2 or later.');
const source='assets/source/worker-template-2026-11-01';
const temp=await mkdtemp(path.join(tmpdir(),'worker-head-'));
function run(command,args){const r=spawnSync(command,args,{cwd:root,stdio:'inherit'});if(r.error)throw r.error;if(r.status!==0)throw new Error(`${command} exited ${r.status}`);}
try{
 const io=await createIO();
 const document=await io.read(path.join(root,'game/public/models/characters/male-lean-template.glb'));
 for(const extension of document.getRoot().listExtensionsUsed())if(extension.extensionName==='EXT_meshopt_compression')extension.dispose();
 if(!process.argv.includes('--check')){
  const head=path.join(temp,'head.glb');await io.write(head,document);
  run(blender,['--background','--factory-startup','--threads','4','--python-exit-code','1','--python','scripts/characters/build_worker_template.py','--',
  '--source',`${source}/worker-body-mixamo-p2-v1/tripo_convert_5d9ea14d-05f6-4f45-bd2f-908e9c2373ee.fbx`,
  '--head',head,'--blend',`${source}/worker-assembled.blend`,'--output','game/public/models/characters/male-worker-template.glb']);
  run(process.execPath,['scripts/characters/optimize-modular-patients.mjs','game/public/models/characters/male-worker-template.glb']);
 }
 const worker=await io.read(path.join(root,'game/public/models/characters/male-worker-template.glb'));
 const nodes=worker.getRoot().listNodes();
 for(const node of document.getRoot().listNodes().filter(n=>n.getMesh()&&n.getName().startsWith('Carmela_'))){
  const fitted=nodes.find(n=>n.getName()===node.getName());
  assert.ok(fitted,`Missing head part: ${node.getName()}`);
  const targets=mesh=>[...new Set(mesh.listPrimitives().flatMap(p=>p.listTargets().map(t=>t.getName())))].sort();
  assert.deepEqual(targets(fitted.getMesh()),targets(node.getMesh()),`Facial controls changed: ${node.getName()}`);
 }
 for(const name of ['Patient_WorkCotton','Patient_WorkWool','Patient_Hands','Worker_Braces']){
  const material=worker.getRoot().listMaterials().find(m=>m.getName()===name);
  assert.ok(material,`Missing colour region: ${name}`);
  assert.equal(material.getMetallicFactor(),0,`Metallic cloth/skin: ${name}`);
 }
 const clips=worker.getRoot().listAnimations().map(a=>a.getName());
 for(const name of ['ClinicIdle','StandingIdle','Walk','SitDown','StandUp','SittingTalking','SittingDisbelief','SittingDisapproval','SittingSelfSoothing'])assert.ok(clips.includes(name),`Missing motion: ${name}`);
 console.log('WORKER_EXPORT_CONTRACT_OK');
}finally{await rm(temp,{recursive:true,force:true});}
