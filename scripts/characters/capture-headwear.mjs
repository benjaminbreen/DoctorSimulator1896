import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import {chromium} from 'playwright-core';
import {HEADWEAR_STYLES,headwearVariation} from '../../shared/characters/headwearGeometry.js';

const args=Object.fromEntries(process.argv.slice(2).map(v=>v.replace(/^--/,'').split('=')));
const output=path.resolve(args.output||'artifacts/characters/headwear/review');
const url=args.url||'http://127.0.0.1:5186';
await mkdir(output,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true});
const captures=[],errors=[];
try{
  const page=await browser.newPage({viewport:{width:1440,height:1100},deviceScaleFactor:1});
  page.on('pageerror',e=>errors.push(e.message));
  page.on('console',m=>{if(m.type()==='error'&&!m.text().startsWith('Failed to load resource:'))errors.push(m.text());});
  page.on('response',r=>{if(r.status()>=400&&!r.url().includes('favicon'))errors.push(`${r.status()} ${r.url()}`);});
  let loaded='';
  async function load(model){if(loaded===model)return;await page.goto(`${url}/face-lab.html?model=${model}`);await page.waitForFunction(()=>window.__faceLab,undefined,{timeout:60000});loaded=model;}
  async function capture(model,id,parameters){
    await load(model);
    const state=await page.evaluate(p=>window.__faceLab.show(p),{time:1,angle:.3,...parameters});
    if(state.head.some(v=>!Number.isFinite(v))||state.headwear.style==='none')throw Error('Invalid character '+id);
    if(state.headwear.progress>=.28&&state.headwear.reachError>.025)errors.push(`${id}: unreachable grip ${state.headwear.reachError}`);
    captures.push({id,model,...state});await page.screenshot({path:path.join(output,id+'.png')});
  }
  for(const cohort of ['men','women']){
    const model=cohort==='men'?'male-worker-template':'carmela-russo';
    for(const [style,definition] of Object.entries(HEADWEAR_STYLES).filter(([,s])=>s.cohort===cohort)){
      for(const [view,angle] of [['front',.25],['profile',1.45]])await capture(model,`${style}-${view}`,{hatStyle:style,view:'face',angle});
    }
  }
  for(const [model,style] of [['male-worker-template','cloth-cap'],['male-broad-template','top-hat'],['carmela-russo','ribbon-bonnet'],['seamstress-prototype','picture-hat']]){
    for(const [action,progress] of [['remove',0],['remove',.16],['remove',.4],['remove',.7],['remove',1],['replace',.25],['replace',.6],['replace',1]]){
      await capture(model,`${model}-${action}-${progress}`,{hatStyle:style,view:'torso',headwearAction:action,hatProgress:progress});
    }
  }
  for(const [model,cohort] of [['male-lean-template','men'],['carmela-russo','women']])for(const [index,socialClass] of ['working','middle','affluent'].entries()){
    await capture(model,`${cohort}-${socialClass}-variation`,{...headwearVariation(47713+index*723177,cohort,socialClass),view:'face',features:{noseWidth:.5,lowerFaceSize:-.5},hairVolume:.5,hairStyle:cohort==='men'?'receding-sweep':'curled-side-rolls'});
  }
  async function sheet(ids,name,columns,crop,tileWidth,tileHeight){
    const layers=[];
    for(const [i,id] of ids.entries()){
      const left=i%columns*tileWidth,top=Math.floor(i/columns)*tileHeight;
      layers.push({input:await sharp(path.join(output,id+'.png')).extract(crop).resize(tileWidth,tileHeight-30,{fit:'contain',background:'#20242a'}).toBuffer(),left,top});
      const label=id.replace('male-worker-template-','worker-').replace('male-broad-template-','broad-').replace('carmela-russo-','carmela-').replace('seamstress-prototype-','seamstress-');
      layers.push({input:Buffer.from(`<svg width="${tileWidth}" height="30"><text x="8" y="21" fill="#ede4d3" font-size="13" font-family="Arial">${label}</text></svg>`),left,top:top+tileHeight-30});
    }
    await sharp({create:{width:columns*tileWidth,height:Math.ceil(ids.length/columns)*tileHeight,channels:4,background:'#20242a'}}).composite(layers).png().toFile(path.join(output,name+'.png'));
  }
  for(const cohort of ['men','women'])await sheet(Object.entries(HEADWEAR_STYLES).filter(([,s])=>s.cohort===cohort).map(([id])=>id+'-front'),cohort+'-catalogue',4,{left:240,top:20,width:650,height:890},280,390);
  await sheet(captures.filter(c=>c.id.startsWith('male-worker-template-')||c.id.startsWith('carmela-russo-')).map(c=>c.id),'remove-and-replace',8,{left:140,top:0,width:860,height:1100},230,325);
  if('motion' in args){
    for(const [model,style] of [['male-worker-template','cloth-cap'],['carmela-russo','ribbon-bonnet']]){
      const live=await browser.newPage({viewport:{width:1440,height:1100},recordVideo:{dir:output,size:{width:1440,height:1100}}});
      live.on('pageerror',e=>errors.push(e.message));
      await live.goto(`${url}/face-lab.html?model=${model}`);await live.waitForFunction(()=>window.__faceLab);
      await live.evaluate(p=>window.__faceLab.show(p),{hatStyle:style,view:'torso',time:1,angle:.3});
      await live.getByRole('button',{name:'Take hat off',exact:true}).click();await live.waitForTimeout(4100);
      await live.getByRole('button',{name:'Put hat on',exact:true}).click();await live.waitForTimeout(4100);
      const final=await live.evaluate(()=>window.__faceLab.headwear());if(final.state!=='worn')errors.push(`${model}: live replacement unfinished`);
      const video=live.video();await live.close();await video.saveAs(path.join(output,model+'-headwear.webm'));
    }
  }
}finally{await browser.close();await writeFile(path.join(output,'review.json'),JSON.stringify({captures,errors},null,2));}
console.log(JSON.stringify({output,captures:captures.length,errors}));if(errors.length)process.exitCode=1;
