import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import {chromium} from 'playwright-core';
import {blinkFaceWeights} from '../../shared/characters/facePerformance.js';
import {MODULAR_CAST_LOOKS} from '../../shared/characters/modularCast.js';

const options=Object.fromEntries(process.argv.slice(2).map(arg=>arg.replace(/^--/,'').split('=')));
const output=path.resolve(options.output || 'artifacts/characters/carmela-face-polish/review');
const models=(options.models || 'carmela-russo,seamstress-prototype').split(',');
const captures=[],failures=[],sheets={},motions=[];
await mkdir(output,{recursive:true});
let blinkPeak=0;
for(let t=1;t<7;t+=.005) if(Object.values(blinkFaceWeights(t,7)).every(value=>value===1)){blinkPeak=t;break;}
if(!blinkPeak) throw new Error('No complete blink found');
const studies=[
  ['neutral','Neutral',{expression:'neutral'}],
  ['relieved','Relieved',{expression:'relieved'}],
  ['smiling','Smiling',{expression:'smiling'}],
  ['speech-open','Open',{weights:{speechOpen:.30}}],
  ['speech-round','Rounded',{weights:{speechOpen:.20,speechRound:.26}}],
  ['speech-smile','Smile + speech',{weights:{speechOpen:.30,mouthSmileLeft:.7,mouthSmileRight:.7}}],
  ['speech-pause','Phrase pause',{expression:'neutral',speaking:true,faceTime:2.4}],
  ['speech-resume','Phrase resumes',{expression:'neutral',speaking:true,faceTime:2.75}],
  ['half-blink','Half blink',{weights:{eyeBlinkLeft:.5,eyeBlinkRight:.5}}],
  ['blink','Closed lids',{weights:{eyeBlinkLeft:1,eyeBlinkRight:1}}],
  ['wide-blink','Anxious blink',{expression:'anxious',autoBlink:true,faceTime:blinkPeak}],
  ['wide-reopen','Eyes reopen',{expression:'anxious',autoBlink:true,faceTime:blinkPeak+.3}],
  ['glance','Brief glance',{expression:'neutral',faceTime:3.6}],
];
const browser=await chromium.launch({channel:'chrome',headless:true});
try{
  const page=await browser.newPage({viewport:{width:1400,height:950},deviceScaleFactor:1});
  page.on('pageerror',error=>failures.push(error.message));
  page.on('console',message=>{if(message.type()==='error'&&!message.location().url?.includes('favicon')) failures.push(message.text());});
  page.on('response',response=>{if(response.status()>=400&&!response.url().includes('favicon')) failures.push(response.status()+': '+response.url());});
  async function load(model,preset=''){
    await page.goto((options.url || 'http://127.0.0.1:5186')+'/face-lab.html?model='+model+(preset?'&preset='+preset:''));
    await page.waitForFunction(()=>window.__faceLab,undefined,{timeout:60000});
  }
  async function capture(id,label,parameters){
    const state=await page.evaluate(parameters=>window.__faceLab.show(parameters),{features:{lowerFaceSize:-.6},angle:.2,faceTime:.4,...parameters});
    const filename=id+'.png';
    await page.screenshot({path:path.join(output,filename)});
    captures.push({filename,...state});
    return {filename,label};
  }
  for(const model of models){
    await load(model);
    const results={};
    for(const [id,label,parameters] of studies) results[id]=await capture(model+'-'+id,label,parameters);
    const blink=captures.find(c=>c.filename===model+'-wide-blink.png');
    if(blink.appliedWeights.eyeBlinkLeft!==1 || blink.appliedWeights.eyeWideLeft) throw new Error('The anxious blink did not close');
    sheets['mouth-'+model]=[['neutral','relieved','smiling','speech-open'],['speech-round','speech-smile','speech-pause','speech-resume']].map(row=>row.map(id=>results[id]));
    sheets['eyes-'+model]=[['neutral','half-blink','blink'],['wide-blink','wide-reopen','glance']].map(row=>row.map(id=>results[id]));
    for(const [id,weights] of [['open',{speechOpen:.3}],['smile',{speechOpen:.3,mouthSmileLeft:.7,mouthSmileRight:.7}]]) await capture(model+'-profile-'+id,id,{angle:1.2,weights});
    const cycle=[];
    for (const faceTime of [.09,.25,.45,.65,1,1.4,1.8,2.05,2.4,2.75,3.1,3.6,4.1,4.6,5.3,6]) {
      cycle.push(await capture(model+'-speech-'+faceTime,faceTime+' s',{expression:'relieved',speaking:true,faceTime,angle:.4}));
    }
    sheets['mouth-cycle-'+model]=Array.from({length:4},(_,i)=>cycle.slice(i*4,i*4+4));
  }
  if('cast' in options){
    const rows={neutral:[],speaking:[],anxious:[],relieved:[],blink:[],body:[]};
    for(const preset of MODULAR_CAST_LOOKS.filter(p=>models.includes(p.model))){
      await load(preset.model,preset.id);
      for(const state of Object.keys(rows)){
        const parameters={...preset.look,angle:.35,expression:state==='body'?'neutral':state==='speaking'?'neutral':state,speaking:state==='speaking',faceTime:.10};
        if(state==='blink') Object.assign(parameters,{expression:'neutral',autoBlink:true,faceTime:blinkPeak});
        if(state==='body') Object.assign(parameters,{view:'body',clip:'StandingIdle',time:.7,angle:.25});
        rows[state].push(await capture('cast-'+preset.id+'-'+state,preset.label,parameters));
      }
    }
    for(const [state,items] of Object.entries(rows)) sheets['cast-'+state]=Array.from({length:3},(_,i)=>items.slice(i*4,i*4+4));
  }
  if('motion' in options) for(const model of models){
    const live=await browser.newPage({viewport:{width:1400,height:950},deviceScaleFactor:1,recordVideo:{dir:path.join(output,'video'),size:{width:1400,height:950}}});
    live.on('pageerror',error=>failures.push(error.message));
    await live.goto((options.url || 'http://127.0.0.1:5186')+'/face-lab.html?model='+model);
    await live.waitForFunction(()=>window.__faceLab,undefined,{timeout:60000});
    const state=await live.evaluate(()=>window.__faceLab.show({features:{lowerFaceSize:-.6},expression:'relieved',speaking:true,autoBlink:true,faceTime:0,angle:.4}));
    await live.locator('input[data-control="Pause motion"]').uncheck();
    await live.waitForTimeout(8000);
    await live.screenshot({path:path.join(output,model+'-motion-end.png')});
    const video=live.video(),filename=model+'-motion.webm';
    await live.close();
    await video.saveAs(path.join(output,filename));
    motions.push({filename,seconds:8,initialState:state});
  }
}finally{
  await browser.close();
  await writeFile(path.join(output,'review.json'),JSON.stringify({captures,motions,failures,blinkPeak},null,2));
}
if(failures.length) throw new Error(failures.join('\n'));
for(const [name,rows] of Object.entries(sheets)){
  const detail=name.startsWith('mouth-')?'mouth':name.startsWith('eyes-')?'eyes':null;
  const crop=detail==='mouth'?{left:340,top:640,width:390,height:210}:detail==='eyes'?{left:315,top:465,width:400,height:175}:null;
  const body=name==='cast-body';
  const width=detail?260:250,height=detail?Math.round(width*crop.height/crop.width):body?331:302,columns=Math.max(...rows.map(row=>row.length));
  const layers=[];
  for(const [r,row] of rows.entries()) for(const [c,item] of row.entries()){
    let input=sharp(path.join(output,item.filename));
    if(crop) input=input.extract(crop); else input=input.extract(body?{left:200,top:30,width:680,height:900}:{left:250,top:190,width:580,height:700});
    const picture=await input.resize(width,height).toBuffer();
    const label=Buffer.from('<svg width="'+width+'" height="34"><rect width="100%" height="100%" fill="#20242a"/><text x="8" y="24" font-family="Arial" font-size="15" fill="#eee">'+item.label+'</text></svg>');
    layers.push({input:picture,left:c*width,top:r*(height+34)},{input:label,left:c*width,top:r*(height+34)+height});
  }
  await sharp({create:{width:columns*width,height:rows.length*(height+34),channels:3,background:'#20242a'}}).composite(layers).png().toFile(path.join(output,name+'.png'));
}
console.log(JSON.stringify({output,captures:captures.length,motions:motions.length,failures}));
