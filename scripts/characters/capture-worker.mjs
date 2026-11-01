import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import {chromium} from 'playwright-core';
import {MODULAR_CAST_LOOKS} from '../../shared/characters/modularCast.js';

const args=Object.fromEntries(process.argv.slice(2).map(s=>s.replace(/^--/,'').split('=')));
const output=path.resolve(args.output||'artifacts/characters/worker-template/review');
await mkdir(output,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true});
const captures=[],errors=[];
try{
 const page=await browser.newPage({viewport:{width:1400,height:1050},deviceScaleFactor:1});
 page.on('pageerror',e=>errors.push(e.message));
 page.on('response',r=>{if(r.status()>=400&&!r.url().includes('favicon'))errors.push(`${r.status()} ${r.url()}`);});
 await page.goto(`${args.url||'http://127.0.0.1:5186'}/face-lab.html?model=male-worker-template`);
 await page.waitForFunction(()=>window.__faceLab,undefined,{timeout:60000});
 async function capture(id,parameters){
  const state=await page.evaluate(p=>window.__faceLab.show(p),{view:'torso',angle:.3,time:1,...parameters});
  if(!state.bodyAvailable||!state.head.every(Number.isFinite))throw Error(`Invalid body: ${id}`);
  await page.screenshot({path:path.join(output,id+'.png')});captures.push({id,...state});
 }
 for(const clip of ['ClinicIdle','StandingIdle','Walk','SitDown','StandUp','SittingTalking','SittingDisbelief','SittingDisapproval','SittingSelfSoothing']){
  const end=await page.evaluate(clip=>window.__faceLab.show({clip,time:10000}),clip);
  for(const fraction of [.1,.5,.9])await capture(`${clip}-${fraction}`,{clip,time:end.time*fraction,view:'body'});
 }
 for(const [id,parameters] of [
  ['neutral',{expression:'neutral'}],['profile',{angle:1.57}],['rear',{angle:Math.PI}],
  ['blink',{weights:{eyeBlinkLeft:1,eyeBlinkRight:1}}],
  ['relieved',{expression:'relieved',speaking:true,faceTime:.1}],
  ['pained',{expression:'pained',speaking:true,faceTime:.1}],
  ['anxious',{expression:'anxious',speaking:true,faceTime:.3}],
  ['belly-large',{bellySize:1,waistWidth:.7,palette:'navy'}],
  ['belly-small',{bellySize:-1,waistWidth:-.7,palette:'forest'}],
 ])await capture(id,parameters);
 for(const preset of MODULAR_CAST_LOOKS.filter(p=>p.model==='male-worker-template'))await capture(preset.id,preset.look);
 const tiles=[];
 for(let i=0;i<captures.length;i++){
  const tile=await sharp(path.join(output,captures[i].id+'.png')).extract({left:110,top:30,width:850,height:990}).resize(255,297).png().toBuffer();
  tiles.push({input:tile,left:i%6*255,top:Math.floor(i/6)*321});
  tiles.push({input:Buffer.from(`<svg width="255" height="24"><text x="8" y="17" fill="#eee" font-size="12" font-family="Arial">${captures[i].id}</text></svg>`),left:i%6*255,top:Math.floor(i/6)*321+297});
 }
 await sharp({create:{width:1530,height:Math.ceil(captures.length/6)*321,channels:4,background:'#20242a'}}).composite(tiles).png().toFile(path.join(output,'contact-sheet.png'));
}finally{await browser.close();await writeFile(path.join(output,'review.json'),JSON.stringify({captures,errors},null,2));}
if(errors.length)throw Error(errors.join('\n'));
console.log(JSON.stringify({output,captures:captures.length,errors}));
