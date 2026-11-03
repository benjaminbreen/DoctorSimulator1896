import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {chromium} from 'playwright-core';
const args=Object.fromEntries(process.argv.slice(2).map(a=>a.replace(/^--/,'').split('=')));
const output=path.resolve(args.output||'artifacts/characters/accessories/ribbon-motion'),url=args.url||'http://127.0.0.1:5186';
await mkdir(output,{recursive:true});const browser=await chromium.launch({channel:'chrome',headless:true}),errors=[],frames=[];
try{
 const page=await browser.newPage({viewport:{width:1440,height:1100}});await page.clock.install();
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error'&&!m.location().url.includes('favicon'))errors.push(m.text());});
 await page.goto(`${url}/face-lab.html?model=female-young-shirtwaist-skirt`);await page.waitForFunction(()=>window.__faceLab,undefined,{timeout:60000});
 for(let attempt=0;attempt<3;attempt++){
  try{await page.clock.pauseAt(new Date(await page.evaluate(()=>Date.now())+1000));break;}
  catch(error){if(!error.message.includes('Cannot fast-forward to the past')||attempt===2)throw error;}
 }
 for(const clip of (args.clips||'Walk,SittingTalking').split(',')){
  await page.evaluate(p=>__faceLab.show(p),{clip,expression:'neutral',view:'accessories',angle:.35,neckwearStyle:'ribbon',neckwearColor:'wine',neckwearFabric:'silk'});
  await page.locator('input[data-control="Pause motion"]').uncheck();
  for(let i=0;i<60;i++){
   await page.clock.runFor(1000/15);const state=await page.evaluate(()=>__faceLab.accessories());frames.push({clip,frame:i,...state.looseCloth});
   await page.screenshot({path:path.join(output,`${clip}-${String(i).padStart(3,'0')}.png`),clip:{x:220,y:180,width:720,height:820}});
  }
 }
}finally{await browser.close();await writeFile(path.join(output,'motion.json'),JSON.stringify({frames,errors},null,2));}
const maximum=Math.max(...frames.map(f=>Math.abs(f.sway)+f.lift));console.log(JSON.stringify({output,frames:frames.length,maximum,errors}));
if(errors.length||maximum<.00005)process.exitCode=1;
