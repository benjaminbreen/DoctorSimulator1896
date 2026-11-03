import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import {chromium} from 'playwright-core';
const options=Object.fromEntries(process.argv.slice(2).map(a=>a.replace(/^--/,'').split('=')));
const url=options.url||'http://127.0.0.1:5186';
const models=(options.models||'male-lean-template,male-broad-template,male-worker-template,male-young-work-jacket,male-chinese-frock-coat').split(',');
const output=path.resolve(options.output||'artifacts/characters/male-grooms');await mkdir(output,{recursive:true});
const poses=[['baseline',{}],['rounded',{hairlinePeak:-.6}],['peak',{hairlinePeak:.8}],['high',{hairlineHeight:.7}],
 ['temples',{hairlineRecession:.8}],['asymmetric',{hairlineAsymmetry:.8}],['combined',{hairlineHeight:.5,hairlineRecession:.6,hairlinePeak:.2}],
 ['crown',{hairThinning:.6}],['long-sideburns',{sideburns:'long-sideburns'}],['whiskers',{sideburns:'mutton-chops',moustache:'full-moustache'}],['bald',{hairStyle:'bald'}]];
const browser=await chromium.launch({channel:'chrome',headless:true}),errors=[],captures=[];
try{
 for(const model of models){
  const page=await browser.newPage({viewport:{width:1440,height:1100}});
  page.on('pageerror',e=>errors.push(`${model}: ${e.message}`));
  page.on('console',m=>{if(m.type()==='error'&&!m.location().url.includes('favicon'))errors.push(`${model}: ${m.text()}`);});
  await page.goto(`${url}/face-lab.html?model=${model}`);await page.waitForFunction(()=>window.__faceLab,undefined,{timeout:60000});
  for(const [pose,look]of poses)for(const [view,angle]of [['front',0],['profile',1.4]]){
   const state=await page.evaluate(l=>__faceLab.show(l),{time:1,view:'face',hairStyle:'short-side-part',hairTone:'brown',...look,angle});
   for(const name of ['hairlineHeight','hairlinePeak','hairlineRecession','hairlineAsymmetry','hairThinning'])if(!state.hairControls.includes(name))errors.push(`${model}: missing ${name}`);
   const file=`${model}-${pose}-${view}.png`;await page.screenshot({path:path.join(output,file)});captures.push({file,pose,view,...state});
  }
  const panels=['baseline','rounded','peak','high','temples','combined','crown','whiskers'],layers=[];
  for(const [i,pose]of panels.entries())for(const [j,view]of ['front','profile'].entries()){
   const left=(i%4)*280+j*140,top=Math.floor(i/4)*300;
   layers.push({input:await sharp(path.join(output,`${model}-${pose}-${view}.png`)).extract({left:210,top:140,width:730,height:900}).resize(140,274,{fit:'contain',background:'#20242a'}).png().toBuffer(),left,top});
   if(j===0)layers.push({input:Buffer.from(`<svg width="280" height="26"><text x="8" y="18" fill="#eee4d0" font-family="Arial" font-size="13">${pose}</text></svg>`),left,top:top+274});
  }
  await sharp({create:{width:1120,height:600,channels:4,background:'#20242a'}}).composite(layers).png().toFile(path.join(output,model+'-sheet.png'));
  await page.close();console.log('GROOM_REVIEW_CAPTURED',model);
 }
}finally{await browser.close();await writeFile(path.join(output,'review.json'),JSON.stringify({captures,errors:[...new Set(errors)]},null,2));}
console.log(JSON.stringify({output,captures:captures.length,errors:[...new Set(errors)]}));if(errors.length)process.exitCode=1;
