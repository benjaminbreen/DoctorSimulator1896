import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import {chromium} from 'playwright-core';
import {EXPANSION_TEMPLATES} from '../../shared/characters/patientExpansion.js';

const args=Object.fromEntries(process.argv.slice(2).map(a=>a.replace(/^--/,'').split('=')));
const url=args.url||'http://127.0.0.1:5186',output=path.resolve(args.output||'artifacts/characters/wrist-review/cast');
const models=args.models?.split(',')||['carmela-russo','seamstress-prototype','male-lean-template','male-broad-template','male-worker-template',...EXPANSION_TEMPLATES.map(t=>t.id)];
const detailed=new Set(['carmela-russo','seamstress-prototype','male-lean-template','male-broad-template','male-worker-template','female-young-shirtwaist-skirt','female-older-working-dress','female-black-walking-suit','male-young-work-jacket','male-chinese-frock-coat']);
await mkdir(output,{recursive:true});const browser=await chromium.launch({channel:'chrome',headless:true}),captures=[],errors=[];
try{
  for(const model of models){
    const page=await browser.newPage({viewport:{width:1440,height:1100}});
    page.on('pageerror',e=>errors.push(model+': '+e.message));
    page.on('console',m=>{if(m.type()==='error'&&!m.location().url.includes('favicon'))errors.push(model+': '+m.text());});
    page.on('response',r=>{if(r.status()>=400&&!r.url().includes('favicon'))errors.push(`${model}: ${r.status()} ${r.url()}`);});
    await page.goto(`${url}/face-lab.html?model=${model}`);await page.waitForFunction(()=>window.__faceLab,undefined,{timeout:60000});
    const poses=[['standing',{clip:'StandingIdle',time:.8}]];
    if(detailed.has(model)&&!args.baseline)poses.push(['walking',{clip:'Walk',time:.3}],['walking-opposite',{clip:'Walk',time:.95}],['seated',{clip:'ClinicIdle',time:1}],['talking',{clip:'SittingTalking',time:1.3}]);
    if(/male-(lean|broad)-template/.test(model)&&!args.baseline)poses.push(['side',{clip:'StandingIdle',time:2,angle:1.3}],['work-shirt',{clip:'StandingIdle',time:.8,outfit:'work-shirt'}],['work-apron',{clip:'ClinicIdle',time:1,outfit:'canvas-apron'}],['large-build',{clip:'StandingIdle',time:.8,bellySize:1,waistWidth:.8}],['slim-build',{clip:'StandingIdle',time:.8,bellySize:-1,waistWidth:-.7}],['hat-grip',{clip:'StandingIdle',time:1,hatStyle:'bowler',headwearAction:'remove',hatProgress:.65}]);
    for(const [id,pose]of poses)for(const side of ['left','right']){
      const angle=(pose.angle||0)*(side==='left'?1:-1);
      const state=await page.evaluate(p=>__faceLab.show(p),{view:side+'-wrist',hatStyle:'none',fabric:'original',...pose,angle});
      const file=`${model}-${id}-${side}.png`;
      await page.screenshot({path:path.join(output,file),clip:{x:220,y:170,width:680,height:760}});
      captures.push({model,id,side,file,angle,...state});
    }
    await page.close();console.log('WRIST_REVIEW',model);
  }
  // Keep wrists large in review sheets. Full-figure thumbnails hid this defect.
  const groups=[['standing',captures.filter(c=>c.id==='standing')],['motion',captures.filter(c=>c.id!=='standing')]];
  for(const [group,items]of groups)for(let start=0;start<items.length;start+=6){
    const batch=items.slice(start,start+6),width=400,height=480,layers=[];
    for(const [i,c]of batch.entries()){
      const left=i%2*width,top=Math.floor(i/2)*height;
      layers.push({input:await sharp(path.join(output,c.file)).resize(width,height-34).toBuffer(),left,top});
      const label=`${c.model} · ${c.id} · ${c.side}`;
      layers.push({input:Buffer.from(`<svg width="400" height="34"><text x="6" y="20" fill="#eee4d3" font-family="Arial" font-size="11">${label}</text></svg>`),left,top:top+height-34});
    }
    await sharp({create:{width:800,height:Math.ceil(batch.length/2)*height,channels:4,background:'#20242a'}}).composite(layers).png().toFile(path.join(output,`${group}-${start/6+1}.png`));
  }
}finally{await browser.close();await writeFile(path.join(output,'review.json'),JSON.stringify({captures,errors},null,2));}
console.log(JSON.stringify({output,captures:captures.length,errors}));if(errors.length)process.exitCode=1;
