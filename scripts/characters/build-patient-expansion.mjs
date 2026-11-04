import {spawnSync} from 'node:child_process';
import {existsSync} from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {stat,mkdir,writeFile,rename,rm} from 'node:fs/promises';
import {createIO} from '../lib/glb-pipeline.mjs';
import {EXPANSION_HEADS,EXPANSION_TEMPLATES} from '../../shared/characters/patientExpansion.js';
const root=path.resolve(import.meta.dirname,'../..');
const source='assets/source/patient-expansion-2026-11-02';
const blender=[process.env.BLENDER_BIN,'/Applications/Blender.app/Contents/MacOS/Blender','/private/tmp/ghosts-character-tools/Blender52.app/Contents/MacOS/Blender'].find(p=>p&&existsSync(p));
if(!blender)throw Error('Set BLENDER_BIN to Blender 5.2 or later.');
const options=Object.fromEntries(process.argv.slice(2).map(a=>a.replace(/^--/,'').split('=')));
const selected=options.models?.split(',');
const templates=selected?EXPANSION_TEMPLATES.filter(t=>selected.includes(t.id)):EXPANSION_TEMPLATES;
if(!templates.length||selected?.some(id=>!templates.some(t=>t.id===id)))throw Error('Unknown expansion template');
function run(command,args){const result=spawnSync(command,args,{cwd:root,stdio:'inherit'});if(result.error)throw result.error;if(result.status!==0)throw Error(`${command} exited ${result.status}`);}
function python(file,args){run(blender,['--background','--factory-startup','--threads','4','--python-exit-code','1','--python',`scripts/characters/${file}`,'--',...args]);}
if(!('check'in options)&&!('assemble-only'in options))for(const head of EXPANSION_HEADS.filter(h=>templates.some(t=>t.head===h.source))){
 python('build_carmela_head.py',['--identity',head.id,'--config',`${source}/${head.source}-fit.json`,'--output',`${source}/fitted-${head.source}`]);
}
if('heads-only'in options)process.exit(0);
const rebuilt=new Set();
const io=await createIO(),reports=[];
const staging=path.join(root,'artifacts/characters/patient-expansion-2026-11-02/build');
if(!('check'in options))await mkdir(staging,{recursive:true});
for(const template of templates){
 const file=`game/public${template.path}`;
 if(!('check'in options)){
  const temporary=path.join(staging,template.id+'.glb');
  try{
   python('build_expansion_character.py',['--head',template.head,'--body',template.body,'--output',temporary,...('rebuild-bodies'in options&&!rebuilt.has(template.body)?['--rebuild-body']:[])]);
   rebuilt.add(template.body);
   run(process.execPath,['scripts/characters/optimize-modular-patients.mjs',temporary]);
   await rename(temporary,path.join(root,file));
  }finally{await rm(temporary,{force:true});}
 }
 const document=await io.read(path.join(root,file)),data=document.getRoot();
 const nodes=data.listNodes(),face=nodes.find(n=>n.getName()==='Carmela_Face');
 assert.equal(face?.getExtras().expansionHead,template.head,`${template.id}: wrong donor`);
 assert.equal(face.getExtras().expansionFitVersion,2,`${template.id}: stale head/neck fit`);
 assert.equal(nodes.find(n=>n.getName()==='Patient_ExpansionBody')?.getExtras().garmentStyle,template.outfit,`${template.id}: wrong garment`);
 const clips=data.listAnimations().map(a=>a.getName());
 for(const clip of ['ClinicIdle','StandingIdle','Walk','SitDown','StandUp','SittingTalking','SittingDisbelief','SittingDisapproval','SittingSelfSoothing'])assert.ok(clips.includes(clip),`${template.id}: missing ${clip}`);
 for(const [name,required]of [['Carmela_Face',['speechOpen','jawOpen','mouthSmileLeft']],['Carmela_Lips',['speechOpen','speechRound']],['Carmela_Lid_Left',['eyeBlinkLeft']],['Carmela_Lid_Right',['eyeBlinkRight']]]){
  const mesh=nodes.find(n=>n.getName()===name)?.getMesh();assert.ok(mesh,`${template.id}: missing ${name}`);
  const controls=mesh.listPrimitives().flatMap(p=>p.listTargets().map(t=>t.getName()));
  for(const control of required)assert.ok(controls.includes(control),`${template.id}: missing ${name}/${control}`);
 }
 for(const name of ['Patient_FacialSkin','Patient_Lips','Carmela_LidSkin','Carmela_EyeSurface','Patient_Hands']){
  const material=data.listMaterials().find(m=>m.getName()===name);assert.ok(material,`${template.id}: missing ${name}`);
  assert.equal(material.getMetallicFactor(),0,`${template.id}: metallic ${name}`);assert.equal(material.getAlphaMode(),'OPAQUE',`${template.id}: transparent ${name}`);
 }
 if(template.body==='C5')assert.equal(data.listMaterials().find(m=>m.getName()==='Patient_MaleFabric')?.getDoubleSided(),true,`${template.id}: coat lining is culled`);
 const eye=nodes.find(n=>n.getName()==='Carmela_Eye_Left')?.getExtras();
 assert.ok(eye.modularNoseRatio>0&&eye.modularNoseRatio<1,`${template.id}: invalid nose anchor`);
 assert.ok(eye.modularChinRatio>0&&eye.modularChinRatio<1,`${template.id}: invalid chin anchor`);
 const bytes=(await stat(path.join(root,file))).size;assert.ok(bytes<16*1048576,`${template.id}: oversized export`);
 reports.push({model:template.id,head:template.head,body:template.body,bytes,clips:clips.length,textures:data.listTextures().length});
}
if(!('check'in options))run(process.execPath,['scripts/characters/share-character-textures.mjs']);
const report=path.join(root,'artifacts/characters/patient-expansion-2026-11-02');await mkdir(report,{recursive:true});
await writeFile(path.join(report,'asset-report.json'),JSON.stringify(reports,null,2));
console.log(`EXPANSION_EXPORT_CONTRACT_OK ${reports.length} templates`);
