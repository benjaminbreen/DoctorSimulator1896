import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import {chromium} from 'playwright-core';
import {EYELASH_LEVELS} from '../../shared/characters/modularEyelashes.js';

const args=Object.fromEntries(process.argv.slice(2).map(v=>v.replace(/^--/,'').split('=')));
const output=path.resolve(args.output||'artifacts/characters/eyelashes/review');
const url=args.url||'http://127.0.0.1:5186';
await mkdir(output,{recursive:true});
const captures=[],eyeFits=[],errors=[],browser=await chromium.launch({channel:'chrome',headless:true});
try{
  const page=await browser.newPage({viewport:{width:1440,height:1100},deviceScaleFactor:2});
  page.on('pageerror',e=>errors.push(e.message));
  page.on('console',m=>{if(m.type()==='error'&&!m.text().startsWith('Failed to load resource:'))errors.push(m.text());});
  page.on('response',r=>{if(r.status()>=400&&!r.url().includes('favicon'))errors.push(`${r.status()} ${r.url()}`);});
  page.on('requestfailed',r=>errors.push(`${r.failure()?.errorText} ${r.url()}`));
  let loaded='';
  async function capture(model,id,look={}){
    if(loaded!==model){await page.goto(`${url}/face-lab.html?model=${model}`);await page.waitForFunction(()=>window.__faceLab,undefined,{timeout:60000});loaded=model;}
    const state=await page.evaluate(p=>window.__faceLab.show(p),{
      time:1,angle:.2,features:model.startsWith('male-')?{}:{lowerFaceSize:-.6},...look,
    });
    if(!state.eyelashes.available||state.eyelashes.eyes!==2||state.head.some(v=>!Number.isFinite(v)))throw Error('Invalid lash fitting: '+id);
    await page.screenshot({path:path.join(output,id+'.png')});captures.push({id,...state});
  }
  for(const model of ['male-worker-template','carmela-russo']){
    for(let level=0;level<5;level++)await capture(model,`${model}-${level}`,{lashProminence:level});
    for(const blink of [0,.5,1])await capture(model,`${model}-blink-${blink}`,{lashProminence:4,weights:{eyeBlinkLeft:blink,eyeBlinkRight:blink}});
    for(const tone of ['black','blond','silver'])await capture(model,`${model}-${tone}`,{lashProminence:3,hairTone:tone});
    for(const angle of [-1.1,1.1])await capture(model,`${model}-profile-${angle}`,{lashProminence:4,angle});
    for(const expression of ['anxious','relieved'])await capture(model,`${model}-${expression}`,{lashProminence:4,expression,speaking:true,faceTime:.4});
    for(const direction of [-1,1])await capture(model,`${model}-features-${direction}`,{lashProminence:4,features:{lowerFaceSize:-.6,eyeSize:direction*.6,eyeSpacing:direction*.5,browProminence:direction*.5}});
  }
  for(const model of ['male-lean-template','male-broad-template','seamstress-prototype'])for(const blink of [0,.5,1]){
    await capture(model,`${model}-blink-${blink}`,{lashProminence:4,weights:{eyeBlinkLeft:blink,eyeBlinkRight:blink}});
  }
  if('eye-fit' in args)for(const model of ['male-worker-template','male-lean-template','male-broad-template','carmela-russo','seamstress-prototype'])for(const blink of [0,.5,1]){
    await capture(model,`${model}-fit-${blink}`,{lashProminence:0,angle:0,weights:{eyeBlinkLeft:blink,eyeBlinkRight:blink}});
    await page.evaluate(()=>window.__faceLab.inspectShading('eye-fit'));
    const filename=path.join(output,`${model}-fit-mask-${blink}.png`);
    await page.locator('#stage canvas').screenshot({path:filename});
    const {data,info}=await sharp(filename).removeAlpha().raw().toBuffer({resolveWithObject:true});
    const mask=new Uint8Array(info.width*info.height),queue=new Int32Array(mask.length),components=[];
    for(let i=0;i<mask.length;i++)mask[i]=data[i*3]>180&&data[i*3+1]<30&&data[i*3+2]<30?1:0;
    for(let i=0;i<mask.length;i++)if(mask[i]){
      let head=0,tail=1;queue[0]=i;mask[i]=0;
      while(head<tail){const p=queue[head++],x=p%info.width;for(const q of [x?p-1:-1,x<info.width-1?p+1:-1,p-info.width,p+info.width])if(q>=0&&q<mask.length&&mask[q]){mask[q]=0;queue[tail++]=q;}}
      components.push(tail);
    }
    components.sort((a,b)=>b-a);const strayPixels=components.slice(blink===1?0:2).reduce((a,b)=>a+b,0);
    const scleraOnly=model.startsWith('male-');
    eyeFits.push({model,blink,components,strayPixels,scleraOnly});
    // Female eye atlases include surrounding skin, so their raw mesh masks
    // are diagnostic images; only the male sclera maps support this assertion.
    if(scleraOnly&&strayPixels>8)errors.push(`${model}, blink ${blink}: ${strayPixels} exposed eye pixels outside the openings`);
  }
  async function sheet(items,name,columns){
    const width=360,height=150,layers=[];
    for(const [i,{id,label}] of items.entries()){
      const male=id.startsWith('male-'),crop=male?{left:630,top:870,width:650,height:230}:{left:630,top:1150,width:680,height:240};
      const left=i%columns*width,top=Math.floor(i/columns)*height;
      layers.push({input:await sharp(path.join(output,id+'.png')).extract(crop).resize(width,height-25,{fit:'contain',background:'#20242a'}).toBuffer(),left,top});
      layers.push({input:Buffer.from(`<svg width="${width}" height="25"><text x="10" y="19" fill="#ede4d3" font-family="Arial" font-size="15">${label}</text></svg>`),left,top:top+height-25});
    }
    await sharp({create:{width:width*columns,height:height*Math.ceil(items.length/columns),channels:4,background:'#20242a'}}).composite(layers).png().toFile(path.join(output,name+'.png'));
  }
  await sheet(['male-worker-template','carmela-russo'].flatMap(model=>EYELASH_LEVELS.map((l,i)=>({id:`${model}-${i}`,label:`${model.startsWith('male-')?'Worker':'Carmela + painted base'} · ${l.label}`}))),'five-levels',5);
  await sheet(['male-worker-template','carmela-russo'].flatMap(model=>[0,.5,1].map(blink=>({id:`${model}-blink-${blink}`,label:`${model.startsWith('male-')?'Worker':'Carmela'} · blink ${blink}`}))),'blink-fitting',3);
  if('motion' in args)for(const model of ['male-worker-template','carmela-russo']){
    const live=await browser.newPage({viewport:{width:1440,height:1100},recordVideo:{dir:output,size:{width:1440,height:1100}}});
    live.on('pageerror',e=>errors.push(e.message));
    await live.goto(`${url}/face-lab.html?model=${model}`);await live.waitForFunction(()=>window.__faceLab);
    await live.evaluate(()=>window.__faceLab.show({time:1,angle:.2,lashProminence:4,expression:'relieved',autoBlink:true,speaking:true}));
    await live.locator('input[data-control="Pause motion"]').uncheck();await live.waitForTimeout(8000);
    const video=live.video();await live.close();await video.saveAs(path.join(output,model+'-motion.webm'));
  }
}finally{await browser.close();await writeFile(path.join(output,'review.json'),JSON.stringify({captures,eyeFits,errors},null,2));}
console.log(JSON.stringify({output,captures:captures.length,errors}));if(errors.length)process.exitCode=1;
