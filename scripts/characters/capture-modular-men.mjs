import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import {chromium} from 'playwright-core';
import {MODULAR_CAST_LOOKS} from '../../shared/characters/modularCast.js';
const args=Object.fromEntries(process.argv.slice(2).map(s=>s.replace(/^--/,'').split('=')));
const output=path.resolve(args.output||'artifacts/characters/modular-men/review');
const url=args.url||'http://127.0.0.1:5186';
const models=(args.models||'male-lean-template,male-broad-template').split(',');
await mkdir(output,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true});
const captures=[],failures=[],performanceSamples=[];
try {
 const page=await browser.newPage({viewport:{width:1400,height:950},deviceScaleFactor:1});
 page.on('pageerror',e=>failures.push(e.message));
 page.on('console',message=>{if(message.type()==='error'&&!message.text().startsWith('Failed to load resource:'))failures.push(message.text());});
 page.on('response',r=>{if(r.status()>=400&&!r.url().includes('favicon'))failures.push(`${r.status()} ${r.url()}`);});
 async function load(model){await page.goto(`${url}/face-lab.html?model=${model}`);await page.waitForFunction(()=>window.__faceLab,undefined,{timeout:60000});}
 async function capture(id,parameters){
   const state=await page.evaluate(p=>window.__faceLab.show(p),parameters);
   if(!state.bodyAvailable||state.head.some(n=>!Number.isFinite(n)))throw new Error('Invalid template '+id);
   await page.screenshot({path:path.join(output,id+'.png')});captures.push({id,...state});return id;
 }
 for(const model of models){
  await load(model);
  if('workwear' in args){
   for(const [clip,fractions] of [['Walk',[0,.25,.5,.75]],['SitDown',[0,.25,.5,.75,1]],['StandUp',[0,.25,.5,.75,1]]]){
    const end=await page.evaluate(clip=>window.__faceLab.show({clip,time:10000}),clip);
    for(const fraction of fractions)await capture(`${model}-${clip}-${fraction}`,{
     clip,time:end.time*fraction,outfit:'canvas-apron',view:'body',angle:.35,sideburns:'none',
    });
   }
   continue;
  }
  for(const [id,p] of [
   ['neutral',{expression:'neutral'}],['profile',{angle:1.4}],['rear',{angle:Math.PI}],
   ['opposite-profile',{angle:-1.4}],['standing-profile',{clip:'StandingIdle',time:.8,angle:-1.4}],
   ['silver-profile',{angle:-1.4,hairTone:'mixedGray',sideburns:'mutton-chops',moustache:'full-moustache'}],
   ['blink',{weights:{eyeBlinkLeft:1,eyeBlinkRight:1}}],['relieved',{expression:'relieved',speaking:true,faceTime:.1}],
   ['half-blink',{weights:{eyeBlinkLeft:.5,eyeBlinkRight:.5}}],
   ['gaze-side',{weights:{eyeLookInLeft:1,eyeLookOutRight:1},angle:-.4}],
   ['pained',{expression:'pained',speaking:true,faceTime:.1}],
   ['anxious',{expression:'anxious',speaking:true,faceTime:.25}],['speech',{weights:{speechOpen:.30,speechWide:.2},angle:.55}],
   ['standing',{clip:'StandingIdle',view:'body',time:.8}],['seated',{clip:'ClinicIdle',view:'body',time:1}],
   ['walking',{clip:'Walk',time:.3,view:'body'}],['sit-middle',{clip:'SitDown',time:1.4,view:'body'}],['stand-middle',{clip:'StandUp',time:1.3,view:'body'}],
   ['belly-small',{clip:'StandingIdle',view:'body',angle:1.2,bellySize:-1,waistWidth:-.5}],
   ['belly-large',{clip:'StandingIdle',view:'body',angle:1.2,bellySize:1,waistWidth:.5}],
   ['facial-hair',{sideburns:'mutton-chops',moustache:'full-moustache',hairTone:'mixedGray',expression:'relieved',speaking:true,faceTime:.1}],
   ['features',{features:{lowerFaceSize:-.4,noseWidth:.7,noseBridge:.5,earProminence:.7},expression:'relieved',speaking:true,faceTime:.1}],
   ['eyes-close',{features:{eyeSpacing:-1,eyeSize:-1},expression:'neutral'}],
   ['eyes-wide',{features:{eyeSpacing:1,eyeSize:1},weights:{eyeBlinkLeft:.5,eyeBlinkRight:.5}}],
   ['compact-profile',{angle:-1.4,features:{lowerFaceSize:-.8,chinProjection:-.5,jawWidth:-.4,noseLength:-.5}}],
   ['work-shirt',{outfit:'work-shirt',clip:'StandingIdle',time:.8,view:'body'}],
   ['canvas-standing',{outfit:'canvas-apron',clip:'StandingIdle',time:.8,view:'body'}],
   ['canvas-seated',{outfit:'canvas-apron',clip:'ClinicIdle',time:1,view:'body'}],
   ['leather-seated',{outfit:'leather-apron',clip:'ClinicIdle',time:1,view:'body',bellySize:.7}],
  ].filter(([id])=>!('quick' in args)||['neutral','profile','seated','standing','blink','facial-hair'].includes(id))) await capture(model+'-'+id,{hairStyle:'short-side-part',sideburns:'none',angle:.2,...p});
  if('motion' in args){
   const live=await browser.newPage({viewport:{width:1400,height:950},deviceScaleFactor:1,recordVideo:{dir:output,size:{width:1400,height:950}}});
   await live.goto(`${url}/face-lab.html?model=${model}`);await live.waitForFunction(()=>window.__faceLab,undefined,{timeout:60000});
   await live.evaluate(()=>window.__faceLab.show({hairStyle:'short-side-part',expression:'relieved',speaking:true,autoBlink:true,faceTime:0,angle:.4}));
   await live.locator('input[data-control="Pause motion"]').uncheck();await live.waitForTimeout(8000);
   await live.screenshot({path:path.join(output,model+'-motion-end.png')});const timing=await live.evaluate(async()=>{
     const intervals=[];let previous=performance.now();const end=previous+4000;
     await new Promise(resolve=>{function tick(now){intervals.push(now-previous);previous=now;if(now<end)requestAnimationFrame(tick);else resolve();}requestAnimationFrame(tick);});
     intervals.sort((a,b)=>a-b);return {frames:intervals.length,p50:intervals[Math.floor(intervals.length*.5)],p95:intervals[Math.floor(intervals.length*.95)]};
   });performanceSamples.push({model,...timing});
   const video=live.video();await live.close();await video.saveAs(path.join(output,model+'-motion.webm'));
  }
 }
 let model='';
 for(const preset of MODULAR_CAST_LOOKS.filter(p=>p.cohort==='men'&&models.includes(p.model)&&!('quick' in args)&&!('workwear' in args))){
  if(preset.model!==model){await load(preset.model);model=preset.model;}
  await capture('look-'+preset.id,{...preset.look,angle:.25,expression:'neutral'});
 }
 // A neutral sheet exposes fit and silhouette differences without expression noise.
 const looks=captures.filter(c=>c.id.startsWith('look-'));
 const width=300,height=349,layers=[];
 for(let i=0;i<looks.length;i++){
  const tile=await sharp(path.join(output,looks[i].id+'.png')).extract({left:180,top:140,width:720,height:780}).resize(width,height-24).toBuffer();
  const x=i%4*width,y=Math.floor(i/4)*height;
  layers.push({input:tile,left:x,top:y});
  layers.push({input:Buffer.from(`<svg width="300" height="24"><text x="10" y="18" fill="#eee" font-size="14" font-family="Arial">${looks[i].id.replace('look-','')}</text></svg>`),left:x,top:y+height-24});
 }
 if(looks.length) await sharp({create:{width:width*4,height:height*3,channels:4,background:'#20242a'}}).composite(layers).png().toFile(path.join(output,'male-template-comparison.png'));
}finally{await browser.close();await writeFile(path.join(output,'review.json'),JSON.stringify({captures,failures,performanceSamples},null,2));}
if(failures.length)throw new Error(failures.join('\n'));
console.log(JSON.stringify({output,captures:captures.length,failures}));
