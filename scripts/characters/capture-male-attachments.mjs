import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import {chromium} from 'playwright-core';
import {EXPANSION_TEMPLATES} from '../../shared/characters/patientExpansion.js';
const args=Object.fromEntries(process.argv.slice(2).map(a=>a.replace(/^--/,'').split('='))),url=args.url||'http://127.0.0.1:5186',output=path.resolve(args.output||'artifacts/characters/neck-sideburn-review/cast');
const models=args.models?.split(',')||['male-lean-template','male-broad-template','male-worker-template',...EXPANSION_TEMPLATES.filter(t=>t.sex==='male').map(t=>t.id)];
await mkdir(output,{recursive:true});const browser=await chromium.launch({channel:'chrome',headless:true}),captures=[],errors=[];
try{
  for(const model of models){
    const page=await browser.newPage({viewport:{width:1440,height:1100}});
    page.on('pageerror',e=>errors.push(model+': '+e.message));page.on('console',m=>{if(m.type()==='error'&&!m.location().url.includes('favicon'))errors.push(model+': '+m.text());});
    page.on('response',r=>{if(r.status()>=400&&!r.url().includes('favicon'))errors.push(`${model}: ${r.status()} ${r.url()}`);});
    await page.goto(`${url}/face-lab.html?model=${model}`);await page.waitForFunction(()=>window.__faceLab,undefined,{timeout:60000});
    const poses=[['standing-left',{clip:'StandingIdle',angle:1.4}],['standing-right',{clip:'StandingIdle',angle:-1.4}],['seated-left',{angle:1.4}],['seated-right',{angle:-1.4}],['rear',{angle:Math.PI}],['long-left',{sideburns:'long-sideburns',angle:1.4}],['long-right',{sideburns:'long-sideburns',angle:-1.4}],['chops-left',{sideburns:'mutton-chops',angle:1.4}],['chops-right',{sideburns:'mutton-chops',angle:-1.4}],['feature-left',{sideburns:'long-sideburns',hairTone:'mixedGray',features:{earProminence:1,lowerFaceSize:-.6},angle:1.4}],['feature-right',{sideburns:'long-sideburns',hairTone:'mixedGray',features:{earProminence:1,lowerFaceSize:-.6},angle:-1.4}],['motion',{clip:'SittingDisbelief',time:1.2,angle:2}]];
    for(const [id,pose]of poses){
      const state=await page.evaluate(p=>__faceLab.show(p),{clip:'ClinicIdle',time:1,view:'face',fabric:'original',sideburns:'short-sideburns',hairTone:'chestnut',...pose});
      const file=model+'-'+id+'.png';await page.screenshot({path:path.join(output,file),clip:{x:180,y:240,width:900,height:860}});captures.push({id,file,...state});
    }
    const selected=captures.filter(c=>c.model===model&&['seated-left','seated-right','rear','long-left','chops-left','feature-left'].includes(c.id)),layers=[];
    for(const [i,c]of selected.entries()){
      const left=i%2*450,top=Math.floor(i/2)*455;
      layers.push({input:await sharp(path.join(output,c.file)).resize(450,430).toBuffer(),left,top});
      layers.push({input:Buffer.from(`<svg width="450" height="25"><text x="6" y="17" fill="#eee4d3" font-family="Arial" font-size="12">${c.id}</text></svg>`),left,top:top+430});
    }
    await sharp({create:{width:900,height:1365,channels:4,background:'#20242a'}}).composite(layers).png().toFile(path.join(output,model+'-sheet.png'));
    await page.close();console.log('ATTACHMENT_REVIEW',model);
  }
}finally{await browser.close();await writeFile(path.join(output,'review.json'),JSON.stringify({captures,errors},null,2));}
console.log(JSON.stringify({output,captures:captures.length,errors}));if(errors.length)process.exitCode=1;
