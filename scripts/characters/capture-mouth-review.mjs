import {mkdir,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import {chromium} from 'playwright-core';

const args=Object.fromEntries(process.argv.slice(2).map(a=>a.replace(/^--/,'').split('=')));
const output=path.resolve(args.output||'artifacts/characters/mouth-seams/review'),url=args.url||'http://127.0.0.1:5186';
const models=(args.models||'male-lean-template,male-broad-template,male-worker-template').split(',');
await mkdir(output,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true}),captures=[],errors=[],comparison=[];
const cases=[['neutral',{}],['quarter',{angle:.65}],['profile',{angle:1.25}],
  ...[.5,.9,1.3,2.1].map(t=>['speech-'+t,{expression:'neutral',speaking:true,faceTime:t}]),
  ['relieved',{expression:'relieved',speaking:true}],['smiling',{expression:'smiling'}],['frowning',{expression:'frowning'}],['press',{weights:{mouthPressLeft:.3,mouthPressRight:.3}}],
  ['round',{weights:{speechOpen:.2,speechRound:.4}}],['wide',{weights:{speechOpen:.18,speechWide:.4}}],
  ['compact',{features:{lowerFaceSize:-.6,chinWidth:-.3},expression:'relieved',speaking:true}],
  ['broad-chin',{features:{chinWidth:.4,chinProjection:.3},expression:'smiling'}]];
try{
  const page=await browser.newPage({viewport:{width:1440,height:1100}});
  page.on('pageerror',e=>errors.push(e.message));let before=null;
  await page.route('**/models/characters/*.glb*',async route=>{
    if(before&&new URL(route.request().url()).pathname.endsWith('/'+before+'.glb'))await route.fulfill({body:await readFile(path.resolve(args.before,before+'.glb')),contentType:'model/gltf-binary'});
    else await route.continue();
  });
  for(const model of models){
    if(args.before){
      before=model;await page.goto(`${url}/face-lab.html?model=${model}`);await page.waitForFunction(()=>window.__faceLab);
      for(const [id,p]of [['neutral',{}],['relieved',{expression:'relieved',speaking:true}]]){
        await page.evaluate(p=>__faceLab.show(p),{time:1,angle:.15,view:'mouth',...p});const name=model+'-before-'+id;await page.screenshot({path:path.join(output,name+'.png')});comparison.push({model,id,stage:'before',name});
      }
    }
    before=null;await page.goto(`${url}/face-lab.html?model=${model}`);await page.waitForFunction(()=>window.__faceLab);
    for(const [id,p]of cases){
      const state=await page.evaluate(p=>__faceLab.show(p),{time:1,angle:.15,view:'mouth',...p}),name=model+'-'+id;
      await page.screenshot({path:path.join(output,name+'.png')});captures.push({model,id,...state});
      const boundaries=await page.evaluate(()=>__faceLab.mouthFit());
      const outer=boundaries.sort((a,b)=>b.height-a.height)[0];captures.at(-1).outerBoundaryGap=outer.maxGap;
      if(outer.maxGap>.0001)errors.push(`${model}/${id}: ${outer.maxGap} m gap at the face/lip boundary`);
      if(['neutral','relieved'].includes(id))comparison.push({model,id,stage:'after',name});
      if(['neutral','smiling','frowning','press'].includes(id)){
        await page.evaluate(()=>__faceLab.inspectShading('mouth-fit'));const mask=name+'-mask.png';await page.screenshot({path:path.join(output,mask)});
        const {data,info}=await sharp(path.join(output,mask)).extract({left:0,top:0,width:1120,height:1100}).raw().toBuffer({resolveWithObject:true});let exposed=0;
        for(let i=0;i<data.length;i+=info.channels)if(data[i]>180&&data[i+1]<50&&data[i+2]<50)exposed++;
        captures.at(-1).exposedClosedTeeth=exposed;if(exposed>3)errors.push(`${model}/${id}: ${exposed} exposed tooth pixels with closed lips`);
      }
    }
    if('motion'in args){
      const live=await browser.newPage({viewport:{width:1440,height:1100},recordVideo:{dir:output}});await live.goto(`${url}/face-lab.html?model=${model}`);await live.waitForFunction(()=>window.__faceLab);
      live.on('pageerror',e=>errors.push(e.message));
      await live.evaluate(()=>__faceLab.show({time:0,clip:'SittingTalking',view:'mouth',angle:.25,expression:'relieved',speaking:true,autoBlink:true}));await live.locator('input[data-control="Pause motion"]').uncheck();await live.waitForTimeout(8000);
      const video=live.video();await live.close();await video.saveAs(path.join(output,model+'.webm'));
    }
  }
  const columns=args.before?4:2,width=340,height=290,layers=[];
  const ordered=[];for(const model of models)for(const id of ['neutral','relieved'])for(const stage of (args.before?['before','after']:['after']))ordered.push(comparison.find(c=>c.model===model&&c.id===id&&c.stage===stage));
  for(const [i,c]of ordered.entries()){
    const left=i%columns*width,top=Math.floor(i/columns)*height;
    layers.push({input:await sharp(path.join(output,c.name+'.png')).extract({left:180,top:250,width:760,height:600}).resize(width,height-26,{fit:'contain',background:'#20242a'}).png().toBuffer(),left,top});
    layers.push({input:Buffer.from(`<svg width="340" height="26"><text x="7" y="18" fill="#eee4d0" font-family="Arial" font-size="12">${c.model.replace('male-','')} · ${c.id} · ${c.stage}</text></svg>`),left,top:top+height-26});
  }
  await sharp({create:{width:columns*width,height:Math.ceil(ordered.length/columns)*height,channels:4,background:'#20242a'}}).composite(layers).png().toFile(path.join(output,'comparison.png'));
}finally{await browser.close();await writeFile(path.join(output,'review.json'),JSON.stringify({captures,errors},null,2));}
console.log(JSON.stringify({output,captures:captures.length,errors}));if(errors.length)process.exitCode=1;
