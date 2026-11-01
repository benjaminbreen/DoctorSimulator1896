import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { chromium } from 'playwright-core';
import { MODULAR_FACE_STUDIES, MODULAR_NOSE_STUDIES } from '../../shared/characters/modularIdentity.js';
import { MODULAR_SKIN_TONES, MODULAR_HAIR_TONES, MODULAR_EYE_TONES } from '../../shared/characters/modularAppearance.js';
import { createModularVariation } from '../../shared/characters/modularVariants.js';

const options = Object.fromEntries(process.argv.slice(2).map(arg=>arg.replace(/^--/,'').split('=')));
const url = options.url || 'http://127.0.0.1:5186';
const output = path.resolve(options.output || 'artifacts/characters/identity-studies/review');
const quick = 'quick' in options;
const models = quick ? ['carmela-russo'] : ['carmela-russo','seamstress-prototype'];
await mkdir(output,{recursive:true});
const failures=[], captures=[], recipes=[];
const browser=await chromium.launch({channel:'chrome',headless:true});
const page=await browser.newPage({viewport:{width:1400,height:950},deviceScaleFactor:1});
page.on('pageerror',e=>failures.push(e.message));
page.on('console',m=>{if(m.type()==='error'&&!m.location().url?.includes('favicon'))failures.push(m.text());});
page.on('response',r=>{if(r.status()>=400&&!r.url().includes('favicon'))failures.push(`${r.status()}: ${r.url()}`);});
page.on('requestfailed',r=>{if(r.failure()?.errorText!=='net::ERR_ABORTED')failures.push(`${r.url()}: ${r.failure()?.errorText}`);});
const sheets={};
async function capture(model,group,id,label,parameters={}){
  const state=await page.evaluate(p=>window.__faceLab.show(p),parameters);
  if(!Number.isFinite(state.frame?.eyeY)||state.frame.eyeY<1.3||state.frame.eyeY>1.8)throw new Error('Invalid identity frame');
  const filename=`${model}-${group}-${id}.png`;
  await page.screenshot({path:path.join(output,filename)});
  captures.push({filename,model,group,label,...state});
  return {filename,label};
}
try{
  for(const model of models){
    await page.goto(`${url}/face-lab.html?model=${model}`);
    await page.waitForFunction(()=>window.__faceLab,undefined,{timeout:60000});
    const base=MODULAR_FACE_STUDIES[4].features;
    for(const [view,angle] of [['front',0],['profile',1.4]]){
      const row=[];
      const studies='lower-face-only' in options?MODULAR_FACE_STUDIES.slice(0,4):MODULAR_FACE_STUDIES;
      for(const [i,study]of studies.entries())row.push(await capture(model,`lower-face-${view}`,i,study.name,{features:study.features,angle}));
      (sheets[`lower-face-${view}`]||=[]).push(row);
    }
    if('lower-face-only' in options)continue;
    for(const [view,angle]of [['front',0],['profile',1.4]]){
      const row=[];
      for(const [i,study]of MODULAR_NOSE_STUDIES.entries())row.push(await capture(model,`nose-${view}`,i,study.name,{features:{...base,...study.features},angle}));
      (sheets[`noses-${model}`]||=[]).push(row);
    }
    if(!quick){
      for(const [name,key,choices]of [['skin','skinTone',MODULAR_SKIN_TONES],['hair','hairTone',MODULAR_HAIR_TONES],['eyes','eyeTone',MODULAR_EYE_TONES]]){
        const row=[];
        for(const [value,entry]of Object.entries(choices))row.push(await capture(model,name,value,entry.label,{features:base,[key]:value}));
        (sheets[name]||=[]).push(row);
      }
      const row=[];
      for(const [i,study]of [
        {name:'Original ears',features:{}},{name:'Ears tucked',features:{earProminence:-.65}},
        {name:'Ears outward',features:{earProminence:.8}},{name:'Softer brow',features:{browProminence:-.75}},
        {name:'Fuller cheeks',features:{cheekFullness:.8}},
      ].entries())row.push(await capture(model,'details',i,study.name,{features:{...base,...study.features},angle:.55}));
      (sheets.details||=[]).push(row);
    }
    const row=[];
    const seeds = [1,2,4,6,7,11,15,17];
    for(const [index,seed] of (quick?seeds.slice(0,4):seeds).entries()){
      const look=createModularVariation(seed);recipes.push({model,...look});
      row.push(await capture(model,'cast',seed,`${model.startsWith('carmela')?'A':'B'} · seed ${seed}`,{...look,angle:.25}));
      if(!quick&&index<4)await capture(model,'outfits',seed,`Seed ${seed}`,{...look,view:'body',angle:.3});
    }
    (sheets.cast||=[]).push(row);
    if(!quick){
      for(const faceIndex of [3,4,6])for(const noseIndex of [1,2,3]){
        const features={...MODULAR_FACE_STUDIES[faceIndex].features,...MODULAR_NOSE_STUDIES[noseIndex].features};
        for(const [name,weights]of [['blink',{eyeBlinkLeft:1,eyeBlinkRight:1}],['speech',{speechOpen:.30,mouthSmileLeft:.3,mouthSmileRight:.3}],['round',{speechOpen:.2,speechRound:.26}]]){
          await capture(model,'fit-check',`${faceIndex}-${noseIndex}-${name}`,name,{features,weights,angle:.4});
        }
      }
    }
  }
}finally{
  await browser.close();
  await writeFile(path.join(output,'review.json'),JSON.stringify({models,failures,captures},null,2));
  await writeFile(path.join(output,'recipes.json'),JSON.stringify(recipes,null,2));
}
if(failures.length)throw new Error(failures.join('\n'));
const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
const label=(text,w,h,size=16)=>Buffer.from(`<svg width="${w}" height="${h}"><rect width="100%" height="100%" fill="#20242a"/><text x="10" y="${h-13}" font-family="Arial" font-size="${size}" fill="#eee">${escape(text)}</text></svg>`);
for(const [name,rows]of Object.entries(sheets)){
  const cols=Math.max(...rows.map(r=>r.length)), w=cols>=7?224:280;
  const crop=name==='eyes'?{left:320,top:420,width:440,height:250}:{left:250,top:190,width:580,height:700};
  const portrait=Math.round(w*crop.height/crop.width), cell=portrait+40;
  const layers=[{input:label(name.replaceAll('-',' '),cols*w,50,22),left:0,top:0}];
  for(const [r,row]of rows.entries())for(const [c,item]of row.entries()){
    const input=await sharp(path.join(output,item.filename)).extract(crop).resize(w,portrait,{fit:'fill'}).toBuffer();
    layers.push({input,left:c*w,top:50+r*cell},{input:label(item.label,w,40),left:c*w,top:50+r*cell+portrait});
  }
  await sharp({create:{width:cols*w,height:50+rows.length*cell,channels:3,background:'#20242a'}}).composite(layers).png().toFile(path.join(output,`${name}.png`));
}
console.log(JSON.stringify({output,captures:captures.length,failures,sheets:Object.keys(sheets)},null,2));
