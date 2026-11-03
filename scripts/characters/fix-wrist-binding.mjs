import {mkdir,copyFile,rename,writeFile} from 'node:fs/promises';
import {constants} from 'node:fs';
import path from 'node:path';
import {createIO,contract,assertSameCharacter} from '../lib/glb-pipeline.mjs';
import {repairWristBinding} from '../lib/repair-wrist-binding.mjs';
const args=Object.fromEntries(process.argv.slice(2).map(a=>a.replace(/^--/,'').split('=')));
const output=path.resolve(args.output||'artifacts/characters/wrist-review');await mkdir(output,{recursive:true});
const io=await createIO(),reports=[];
for(const model of (args.models||'male-lean-template,male-broad-template').split(',')){
  const file=path.resolve(`game/public/models/characters/${model}.glb`),document=await io.read(file);
  const before=contract(document);
  const changes=repairWristBinding(document);
  if(changes.length){
    try{await copyFile(file,path.join(output,model+'-before.glb'),constants.COPYFILE_EXCL);}catch(error){if(error.code!=='EEXIST')throw error;}
    const temp=path.join(output,model+'-fixed.glb');assertSameCharacter(before,document,model);await io.write(temp,document);assertSameCharacter(before,await io.read(temp),model);await rename(temp,file);
  }
  reports.push({model,changes});console.log('WRIST_BINDING',model,JSON.stringify(changes));
}
await writeFile(path.join(output,'binding-report.json'),JSON.stringify(reports,null,2));
