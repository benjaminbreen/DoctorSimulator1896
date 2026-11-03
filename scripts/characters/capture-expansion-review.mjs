import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import {chromium} from 'playwright-core';
import {EXPANSION_TEMPLATES} from '../../shared/characters/patientExpansion.js';
const options=Object.fromEntries(process.argv.slice(2).map(a=>a.replace(/^--/,'').split('=')));
const output=path.resolve(options.output||'artifacts/characters/patient-expansion-2026-11-02/review');
const url=options.url||'http://127.0.0.1:5186';
const templates=options.models?EXPANSION_TEMPLATES.filter(t=>options.models.split(',').includes(t.id)):EXPANSION_TEMPLATES;
await mkdir(output,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true});const errors=[],captures=[];
try{
 for(const template of templates){
 const page=await browser.newPage({viewport:{width:1440,height:1100},deviceScaleFactor:1});
 page.on('pageerror',error=>errors.push(error.message));
 page.on('console',message=>{if(message.type()==='error'&&!message.location().url.includes('favicon'))errors.push(message.text());});
 page.on('response',response=>{if(response.status()>=400&&!response.url().includes('favicon'))errors.push(`${response.status()} ${response.url()}`);});
  await page.goto(`${url}/face-lab.html?model=${template.id}`);await page.waitForFunction(()=>window.__faceLab,undefined,{timeout:60000});
  const male=template.sex==='male',hairTone=template.head==='H3'?'silver':['H4','H5'].includes(template.head)?'black':'brown';
  const poses=[['face',{view:'face',angle:.15}],['profile',{view:'face',angle:1.4}],
   ['blink',{view:'face',weights:{eyeBlinkLeft:1,eyeBlinkRight:1}}],
   ['speech',{view:'mouth',expression:'relieved',speaking:true,faceTime:1.1}],
   ['seated',{view:'torso'}],['standing',{view:'body',clip:'StandingIdle'}],
   ['sitting-down',{view:'body',clip:'SitDown',time:1.5}],['talking',{view:'torso',clip:'SittingTalking',time:3,expression:'distressed',speaking:true,faceTime:1.1}],
   ['features',{view:'face',features:{lowerFaceSize:-.2,noseWidth:-.35,noseBridge:.25,chinWidth:-.2,earProminence:.35},hairTone:template.head==='H4'?'black':'chestnut',eyeTone:'hazel',skinTone:template.head==='H4'?'deep':'fairWarm'}],
   ...(male?[['build',{view:'torso',bellySize:.8,waistWidth:.4,palette:'forest'}]]:[]),
   ['accessories',{view:'torso',glassesStyle:'round',hatStyle:male?'bowler':'walking-hat',neckwearStyle:male?'tie':'none',broochStyle:male?'none':'oval',earringStyle:male?'none':'stud',sideburns:male?'mutton-chops':'none',moustache:male?'neat-moustache':'none'}],
   ['hat-off',{view:'torso',hatStyle:male?'bowler':'walking-hat',headwearAction:'remove',hatProgress:.7}]];
  for(const[id,pose]of poses){
   if(options.poses&&!options.poses.split(',').includes(id))continue;
   const state=await page.evaluate(p=>__faceLab.show(p),{time:1,hairTone,outfit:template.outfit,...pose});
   if(state.model!==template.id)errors.push(`${template.id}: wrong model loaded`);
   if(state.head.some(v=>!Number.isFinite(v)))errors.push(`${template.id}/${id}: invalid head transform`);
   const file=`${template.id}-${id}.png`;await page.screenshot({path:path.join(output,file)});captures.push({file,id,...state});
  }
  if(!options.poses){
  const panels=['face','profile','blink','speech','seated','standing'];const layers=[];
  for(const[i,id]of panels.entries()){
   const left=i%3*360,top=Math.floor(i/3)*420;
   layers.push({input:await sharp(path.join(output,`${template.id}-${id}.png`)).extract({left:100,top:0,width:920,height:1100}).resize(360,394,{fit:'contain',background:'#20242a'}).png().toBuffer(),left,top});
   layers.push({input:Buffer.from(`<svg width="360" height="26"><text x="8" y="18" fill="#eee4d0" font-family="Arial" font-size="13">${id}</text></svg>`),left,top:top+394});
  }
  await sharp({create:{width:1080,height:840,channels:4,background:'#20242a'}}).composite(layers).png().toFile(path.join(output,template.id+'-sheet.png'));
  }
  await page.close();
  console.log(`REVIEW_CAPTURED ${template.id}`);
 }
}finally{await browser.close();await writeFile(path.join(output,options.poses?`review-${options.poses.replaceAll(',','-')}.json`:'review.json'),JSON.stringify({captures,errors},null,2));}
console.log(JSON.stringify({output,captures:captures.length,errors}));if(errors.length)process.exitCode=1;
