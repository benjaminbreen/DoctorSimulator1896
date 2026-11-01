import {chromium} from 'playwright-core';
import {mkdir,writeFile} from 'node:fs/promises';
const output='artifacts/characters/modular-men/surface-diagnosis';await mkdir(output,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true});
try {
 const page=await browser.newPage({viewport:{width:1400,height:950},deviceScaleFactor:1});
 await page.goto('http://127.0.0.1:5186/face-lab.html?model=male-broad-template');await page.waitForFunction(()=>window.__faceLab);
 await page.evaluate(()=>window.__faceLab.show({sideburns:'none',hairStyle:'bald'}));
 const report=[];
 for(const [id,only] of [['all',null],['face',['Carmela_Face']],['eyes',['Carmela_Eye','Carmela_Lid']],['body',['Patient_MaleBody','tripo_mesh']],['hair',['Carmela_Hair']]]){
  const meshes=await page.evaluate(only=>window.__faceLab.inspectSurfaces(only),only);report.push({id,meshes});await page.screenshot({path:output+'/'+id+'.png'});
 }
 await writeFile(output+'/meshes.json',JSON.stringify(report,null,2));
}finally{await browser.close();}
