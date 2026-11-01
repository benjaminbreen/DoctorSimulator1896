import {chromium} from 'playwright-core';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
const args=Object.fromEntries(process.argv.slice(2).map(value=>value.replace(/^--/,'').split('=')));
const url=args.url||'http://127.0.0.1:5186';
const output=path.resolve(args.output||'artifacts/characters/modular-men/cleanup-review');
await mkdir(output,{recursive:true});
const b=await chromium.launch({channel:'chrome',headless:true}),p=await b.newPage({viewport:{width:1400,height:950}}),results=[];
try{for(const model of ['male-lean-template','male-broad-template']){await p.goto(url+'/face-lab.html?model='+model);await p.waitForFunction(()=>window.__faceLab);for(const outfit of ['work-shirt','canvas-apron']){await p.evaluate(outfit=>{window.__fitDetails=window.__faceLab.show({outfit,clip:'Walk',time:.2,view:'body',expression:'neutral'});},outfit);await p.locator('input[data-control="Pause motion"]').uncheck();await p.waitForTimeout(1000);const sample=await p.evaluate(async()=>{const frames=[],cost=[];let previous=performance.now();const end=previous+4000;await new Promise(resolve=>{function tick(now){frames.push(now-previous);previous=now;cost.push(window.__fitDetails.apronFit?.ms||0);if(now<end)requestAnimationFrame(tick);else resolve();}requestAnimationFrame(tick);});frames.sort((a,b)=>a-b);cost.sort((a,b)=>a-b);return{frames:frames.length,frameP50:frames[Math.floor(frames.length*.5)],frameP95:frames[Math.floor(frames.length*.95)],fitCpuP50:cost[Math.floor(cost.length*.5)],fitCpuP95:cost[Math.floor(cost.length*.95)]};});results.push({model,outfit,...sample});}}}finally{await b.close();}
await writeFile(path.join(output,'fit-timing.json'),JSON.stringify({scope:'Isolated Character Lab, local Chrome, real browser timers; not whole-game FPS.',results},null,2));console.log(JSON.stringify(results));
