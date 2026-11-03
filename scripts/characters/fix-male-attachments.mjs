import {mkdir,copyFile,rename,writeFile} from 'node:fs/promises';
import {constants} from 'node:fs';
import path from 'node:path';
import {createIO,contract,assertSameCharacter} from '../lib/glb-pipeline.mjs';
import {repairMaleNape,repairMaleSideburns} from '../lib/repair-male-attachments.mjs';
import {prune} from '@gltf-transform/functions';
import {EXPANSION_TEMPLATES} from '../../shared/characters/patientExpansion.js';
const args=Object.fromEntries(process.argv.slice(2).map(a=>a.replace(/^--/,'').split('='))),output=path.resolve(args.output||'artifacts/characters/neck-sideburn-review');
await mkdir(output,{recursive:true});const io=await createIO(),reports=[];
const models=args.models?.split(',')||['male-lean-template','male-broad-template','male-worker-template',...EXPANSION_TEMPLATES.filter(t=>t.sex==='male').map(t=>t.id)];
for(const model of models){
  const file=path.resolve(`game/public/models/characters/${model}.glb`),doc=await io.read(file),before=contract(doc),changes=[...repairMaleNape(doc),...await repairMaleSideburns(doc)];
  if(changes.length){
    try{await copyFile(file,path.join(output,model+'-before.glb'),constants.COPYFILE_EXCL);}catch(error){if(error.code!=='EEXIST')throw error;}
    await doc.transform(prune({keepAttributes:true,keepLeaves:true,keepSolidTextures:true}));
    const expected={...before,triangles:contract(doc).triangles};
    assertSameCharacter(expected,doc,model);const temp=path.join(output,model+'-fixed.glb');await io.write(temp,doc);assertSameCharacter(expected,await io.read(temp),model);await rename(temp,file);
  }
  reports.push({model,changes});console.log(model,JSON.stringify(changes));
}
await writeFile(path.join(output,'report.json'),JSON.stringify(reports,null,2));
