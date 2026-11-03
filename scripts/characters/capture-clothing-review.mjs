import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import {chromium} from 'playwright-core';

const args=Object.fromEntries(process.argv.slice(2).map(a=>a.replace(/^--/,'').split('=')));
const url=args.url||'http://127.0.0.1:5186',output=path.resolve(args.output||'artifacts/characters/clothing-fabrics');
await mkdir(output,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true}),captures=[],errors=[];
try{
  const page=await browser.newPage({viewport:{width:1440,height:1100},deviceScaleFactor:1});
  page.on('pageerror',e=>errors.push(e.message));
  page.on('console',m=>{if(m.type()==='error'&&!m.text().startsWith('Failed to load resource:'))errors.push(m.text());});
  page.on('response',r=>{if(r.status()>=400&&!r.url().includes('favicon'))errors.push(`${r.status()} ${r.url()}`);});
  for(const model of ['male-lean-template','male-broad-template','carmela-russo','female-black-walking-suit']){
    await page.goto(`${url}/face-lab.html?model=${model}`);await page.waitForFunction(()=>window.__faceLab,undefined,{timeout:60000});
    for(const fabric of ['original','wool','herringbone','silk']){
      for(const view of ['torso',...(model==='male-lean-template'?['left-wrist']:[])]){
        await page.evaluate(p=>__faceLab.show(p),{clip:'StandingIdle',time:.8,view,fabric,hatStyle:'none'});
        await page.screenshot({path:path.join(output,`${model}-${fabric}-${view}.png`)});
        captures.push({model,fabric,view,materials:await page.evaluate(()=>__faceLab.fabrics())});
      }
    }
    for(const [clip,time]of [['Walk',.3],['ClinicIdle',1],['SittingTalking',1.3]]){
      await page.evaluate(p=>__faceLab.show(p),{clip,time,view:'body',fabric:'wool',hatStyle:'none'});
      await page.screenshot({path:path.join(output,`${model}-${clip}.png`)});
    }
  }
  for(const [model,view]of [['male-lean-template','left-wrist'],['male-lean-template','torso'],['carmela-russo','torso'],['female-black-walking-suit','torso']]){
    const layers=[];
    for(const [i,fabric]of ['original','wool','herringbone','silk'].entries()){
      const input=await sharp(path.join(output,`${model}-${fabric}-${view}.png`)).extract({left:view==='left-wrist'?180:80,top:100,width:view==='left-wrist'?780:980,height:980}).resize(490,490).toBuffer();
      const left=i%2*490,top=Math.floor(i/2)*518;
      layers.push({input,left,top});
      layers.push({input:Buffer.from(`<svg width="490" height="28"><text x="10" y="20" fill="#eee4d3" font-family="Arial" font-size="16">${fabric}</text></svg>`),left,top:top+490});
    }
    await sharp({create:{width:980,height:1036,channels:4,background:'#20242a'}}).composite(layers).png().toFile(path.join(output,`${model}-${view}-comparison.png`));
  }
}finally{await browser.close();await writeFile(path.join(output,'review.json'),JSON.stringify({captures,errors},null,2));}
if(errors.length)throw new Error(errors.join('\n'));
console.log(JSON.stringify({output,captures:captures.length,errors}));
