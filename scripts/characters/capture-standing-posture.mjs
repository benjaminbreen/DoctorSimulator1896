import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import {chromium} from 'playwright-core';
import {EXPANSION_TEMPLATES} from '../../shared/characters/patientExpansion.js';
const args=Object.fromEntries(process.argv.slice(2).map(a=>a.replace(/^--/,'').split('='))),url=args.url||'http://127.0.0.1:5186',output=path.resolve(args.output||'artifacts/characters/standing-posture/review');
const models=args.models?.split(',')||['carmela-russo','seamstress-prototype','male-lean-template','male-broad-template','male-worker-template',...EXPANSION_TEMPLATES.map(t=>t.id)];
const detailed=new Set(['carmela-russo','male-lean-template','male-broad-template','male-worker-template','female-young-shirtwaist-skirt','female-older-working-dress','female-black-walking-suit','male-young-work-jacket','male-chinese-frock-coat']);
await mkdir(output,{recursive:true});const browser=await chromium.launch({channel:'chrome',headless:true}),captures=[],errors=[];
try{
 for(const model of models){
  const page=await browser.newPage({viewport:{width:1440,height:1100}});
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error'&&!m.location().url.includes('favicon'))errors.push(m.text());});page.on('response',r=>{if(r.status()>=400&&!r.url().includes('favicon'))errors.push(`${r.status()} ${r.url()}`);});
  await page.goto(`${url}/face-lab.html?model=${model}`);await page.waitForFunction(()=>window.__faceLab,undefined,{timeout:60000});
  const poses=[['standing',{clip:'StandingIdle',time:.8,angle:.15}]];
  if(detailed.has(model))poses.push(['profile',{clip:'StandingIdle',time:2,angle:1.3}],['idle-late',{clip:'StandingIdle',time:5,angle:-.3}],['walking',{clip:'Walk',time:.3,angle:.3}],['walking-opposite',{clip:'Walk',time:.95,angle:-.3}],['sit-start',{clip:'SitDown',time:0}],['sit-transition',{clip:'SitDown',time:.8}],['rise-transition',{clip:'StandUp',time:2.3}],['seated',{clip:'ClinicIdle',time:1}]);
  if(model==='male-lean-template')poses.push(['hat-grip',{clip:'StandingIdle',time:1,hatStyle:'bowler',headwearAction:'remove',hatProgress:.65}]);
  for(const [id,pose]of poses){
   const state=await page.evaluate(p=>__faceLab.show(p),{view:'body',hatStyle:'none',...pose});
   const file=model+'-'+id+'.png';await page.screenshot({path:path.join(output,file)});captures.push({id,file,...state});
  }
  await page.close();console.log('STANDING_REVIEW '+model);
 }
 const items=captures.filter(c=>c.id==='standing'),width=280,height=490,columns=6,layers=[];
 for(const [i,c]of items.entries()){
  const left=i%columns*width,top=Math.floor(i/columns)*height;
  layers.push({input:await sharp(path.join(output,c.file)).extract({left:290,top:45,width:580,height:1010}).resize(width,height-40,{fit:'contain',background:'#20242a'}).toBuffer(),left,top});
  const label=c.model.replace('female-','F ').replace('male-','M ').replaceAll('-',' ');layers.push({input:Buffer.from(`<svg width="${width}" height="40"><text x="7" y="22" fill="#ede4d3" font-family="Arial" font-size="11">${label}</text></svg>`),left,top:top+height-40});
 }
 await sharp({create:{width:columns*width,height:Math.ceil(items.length/columns)*height,channels:4,background:'#20242a'}}).composite(layers).png().toFile(path.join(output,'standing-sheet.png'));
}finally{await browser.close();await writeFile(path.join(output,'review.json'),JSON.stringify({captures,errors},null,2));}
console.log(JSON.stringify({output,captures:captures.length,errors}));if(errors.length)process.exitCode=1;
