import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import {chromium} from 'playwright-core';
import {MODULAR_CAST_LOOKS} from '../../shared/characters/modularCast.js';
import {ACCESSORY_CHOICES} from '../../shared/characters/periodAccessories.js';

const args=Object.fromEntries(process.argv.slice(2).map(v=>v.replace(/^--/,'').split('=')));
const output=path.resolve(args.output||'artifacts/characters/accessories/review'),url=args.url||'http://127.0.0.1:5186';
await mkdir(output,{recursive:true});const browser=await chromium.launch({channel:'chrome',headless:true}),captures=[],errors=[],sheets={};
try{
  const page=await browser.newPage({viewport:{width:1440,height:1100}});
  page.on('pageerror',e=>errors.push(e.message));
  page.on('console',m=>{if(m.type()==='error'&&!m.text().startsWith('Failed to load resource:'))errors.push(m.text());});
  page.on('response',r=>{if(r.status()>=400&&!r.url().includes('favicon'))errors.push(`${r.status()} ${r.url()}`);});
  let loaded='';
  async function capture(model,id,label,parameters={}){
    if(loaded!==model){await page.goto(`${url}/face-lab.html?model=${model}`);await page.waitForFunction(()=>window.__faceLab,undefined,{timeout:60000});loaded=model;}
    const state=await page.evaluate(p=>window.__faceLab.show(p),{time:1,angle:.2,features:model.startsWith('male-')?{}:{lowerFaceSize:-.6},...parameters});
    if(!state.accessories.available||state.accessories.triangles>22000||state.head.some(v=>!Number.isFinite(v)))errors.push('Invalid accessory fitting '+id);
    captures.push({id,...state});await page.screenshot({path:path.join(output,id+'.png')});return{id,label};
  }
  for(const model of ['male-worker-template','carmela-russo']){
    const prefix=model.startsWith('male-')?'worker':'carmela';
    for(const style of ['round','oval','pince-nez','rimless']){
      const id=`${prefix}-${style}`;const tile=await capture(model,id,`${prefix} · ${ACCESSORY_CHOICES.glassesStyle[style]}`,{glassesStyle:style,glassesMetal:'gold'});
      (sheets.eyewear||=[]).push(tile);await capture(model,id+'-profile',style+' profile',{glassesStyle:style,angle:1.35});
    }
    for(const tint of ['clear','blue','smoke','green'])(sheets.tints||=[]).push(await capture(model,`${prefix}-${tint}`,`${prefix} · ${tint}`,{glassesStyle:'oval',lensTint:tint}));
  }
  for(const model of ['male-lean-template','male-broad-template'])for(const style of ['original','none','bow','tie','cravat','kerchief']){
    const prefix=model.includes('lean')?'lean':'broad';
    (sheets.neckwear||=[]).push(await capture(model,`${prefix}-${style}`,`${prefix} · ${style}`,{neckwearStyle:style,neckwearColor:'navy',neckwearPattern:style==='bow'?'dot':'stripe',view:'accessories',watchChain:'single',tiePin:style==='cravat'?'pearl':'none'}));
  }
  for(const style of ['oval','cameo','bar','jet'])(sheets.jewelry||=[]).push(await capture('carmela-russo','brooch-'+style,style+' brooch',{broochStyle:style,earringStyle:'stud',jewelryMetal:'gold',view:'accessories'}));
  for(const style of ['stud','pearl','drop','jet'])(sheets.earrings||=[]).push(await capture('seamstress-prototype','earrings-'+style,style+' earrings',{earringStyle:style,hairStyle:'center-chignon',jewelryMetal:'gold',angle:.65}));
  for(const style of ['oval','round'])(sheets.jewelry||=[]).push(await capture('seamstress-prototype','locket-'+style,style+' locket',{locketStyle:style,jewelryMetal:'gold',view:'accessories'}));
  for(const model of ['male-worker-template','male-lean-template','male-broad-template','carmela-russo','seamstress-prototype']){
    const male=model.startsWith('male-'),look={glassesStyle:male?'round':'oval',glassesMetal:'steel',neckwearStyle:male?'tie':'original',broochStyle:male?'none':'cameo',earringStyle:male?'none':'pearl',watchChain:male&&model!=='male-worker-template'?'single':'none'};
    for(const direction of [-1,1])for(const angle of [.25,1.25])await capture(model,`${model}-features-${direction}-${angle}`,'Feature variation',{...look,angle,features:{eyeSpacing:.55*direction,eyeSize:.55*direction,noseBridge:.65*direction,noseWidth:.5*direction,earProminence:.7*direction,lowerFaceSize:-.6},glassesSize:.35*direction,glassesBridge:.35*direction});
    for(const [name,clip,time]of [['standing','StandingIdle',.5],['talking','SittingTalking',.7],['blink','ClinicIdle',1]]){
      await capture(model,`${model}-${name}`,name,{...look,view:name==='standing'?'torso':'face',clip,time,weights:name==='blink'?{eyeBlinkLeft:1,eyeBlinkRight:1}:{},expression:name==='talking'?'relieved':null,speaking:name==='talking'});
    }
  }
  if(!('quick' in args))for(const preset of MODULAR_CAST_LOOKS)(sheets.cast||=[]).push(await capture(preset.model,'cast-'+preset.id,preset.label,{...preset.look,view:'torso',angle:.3}));
  async function sheet(items,name,columns,view='face'){
    const width=300,height=view==='detail'?350:420,layers=[];
    for(const [i,item]of items.entries()){
      const left=i%columns*width,top=Math.floor(i/columns)*height,crop=view==='torso'?{left:190,top:90,width:810,height:1000}:view==='detail'?{left:230,top:180,width:680,height:920}:{left:250,top:135,width:650,height:945};
      layers.push({input:await sharp(path.join(output,item.id+'.png')).extract(crop).resize(width,height-28,{fit:'contain',background:'#20242a'}).toBuffer(),left,top});
      layers.push({input:Buffer.from(`<svg width="${width}" height="28"><text x="7" y="20" fill="#ede4d3" font-family="Arial" font-size="12">${item.label}</text></svg>`),left,top:top+height-28});
    }
    await sharp({create:{width:columns*width,height:Math.ceil(items.length/columns)*height,channels:4,background:'#20242a'}}).composite(layers).png().toFile(path.join(output,name+'.png'));
  }
  for(const [name,items]of Object.entries(sheets))await sheet(items,name,name==='cast'?5:4,['neckwear','jewelry'].includes(name)?'detail':name==='cast'?'torso':'face');
  if('motion' in args)for(const [model,look]of [['male-worker-template',{glassesStyle:'round',neckwearStyle:'kerchief'}],['male-broad-template',{glassesStyle:'pince-nez',neckwearStyle:'cravat',watchChain:'double',tiePin:'pearl'}],['carmela-russo',{glassesStyle:'oval',broochStyle:'cameo',earringStyle:'pearl',locketStyle:'oval'}]]){
    const live=await browser.newPage({viewport:{width:1440,height:1100},recordVideo:{dir:output,size:{width:1440,height:1100}}});live.on('pageerror',e=>errors.push(e.message));
    await live.goto(`${url}/face-lab.html?model=${model}`);await live.waitForFunction(()=>window.__faceLab);
    await live.evaluate(p=>window.__faceLab.show(p),{...look,view:'accessories',clip:'SittingTalking',time:0,expression:'relieved',speaking:true,autoBlink:true,angle:.35});await live.locator('input[data-control="Pause motion"]').uncheck();await live.waitForTimeout(8000);
    const video=live.video();await live.close();await video.saveAs(path.join(output,model+'-accessories.webm'));
  }
}finally{await browser.close();await writeFile(path.join(output,'review.json'),JSON.stringify({captures,errors},null,2));}
console.log(JSON.stringify({output,captures:captures.length,errors}));if(errors.length)process.exitCode=1;
