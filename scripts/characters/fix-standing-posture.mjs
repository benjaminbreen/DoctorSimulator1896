import {mkdir,copyFile,rename,writeFile,stat} from 'node:fs/promises';
import {constants} from 'node:fs';
import path from 'node:path';
import {createIO,contract,assertSameCharacter} from '../lib/glb-pipeline.mjs';
import {relaxStandingPosture} from '../lib/relax-standing-posture.mjs';
import {EXPANSION_TEMPLATES} from '../../shared/characters/patientExpansion.js';
const args=Object.fromEntries(process.argv.slice(2).map(a=>a.replace(/^--/,'').split('=')));
const models=(args.models||['carmela-russo','seamstress-prototype','male-lean-template','male-broad-template','male-worker-template',...EXPANSION_TEMPLATES.map(t=>t.id)].join(',')).split(',');
const output=path.resolve(args.output||'artifacts/characters/standing-posture');await mkdir(output,{recursive:true});const io=await createIO(),reports=[];
for(const model of models){
 const file=path.resolve(`game/public/models/characters/${model}.glb`),doc=await io.read(file),before=contract(doc),bytes=(await stat(file)).size;
 const changes=relaxStandingPosture(doc);assertSameCharacter(before,doc,model);
 if(changes.length){
  try{await copyFile(file,path.join(output,model+'-before.glb'),constants.COPYFILE_EXCL);}catch(error){if(error.code!=='EEXIST')throw error;}
  const temp=path.join(output,model+'-fixed.glb');await io.write(temp,doc);assertSameCharacter(before,await io.read(temp),model);await rename(temp,file);
 }
 reports.push({model,bytesBefore:bytes,bytesAfter:(await stat(file)).size,changes});console.log('POSTURE_FIXED',model,changes.length);
}
await writeFile(path.join(output,'report.json'),JSON.stringify(reports,null,2));
