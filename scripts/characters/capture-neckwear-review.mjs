import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import {chromium} from 'playwright-core';
import {ACCESSORY_CHOICES} from '../../shared/characters/periodAccessories.js';
const args=Object.fromEntries(process.argv.slice(2).map(a=>a.replace(/^--/,'').split('=')));
const url=args.url||'http://127.0.0.1:5186',output=path.resolve(args.output||'artifacts/characters/accessories/tailoring');
await mkdir(output,{recursive:true});const errors=[],captures=[],looks=[];
const add=(model,id,label,look,sheet='styles')=>looks.push({model,id,label,look,sheet});
const male='male-young-frock-coat',female='female-young-shirtwaist-skirt';
for(const [style,color,fabric,pattern]of [['tie','navy','silk','stripe'],['narrow','wine','grosgrain','floret'],['bow','black','silk','plain'],['cravat','cream','silk','dot']])add(male,'formal-'+style,ACCESSORY_CHOICES.neckwearStyle[style],{neckwearStyle:style,neckwearColor:color,neckwearFabric:fabric,neckwearPattern:pattern,tiePin:style==='cravat'?'pearl':'none'});
for(const [style,color,fabric,pattern]of [['ribbon','wine','velvet','plain'],['ribbon','navy','grosgrain','dot'],['bow','plum','silk','plain'],['narrow','forest','silk','diamond']])add(female,'woman-'+color,`${color} ${style}`,{neckwearStyle:style,neckwearColor:color,neckwearFabric:fabric,neckwearPattern:pattern});
add('male-young-work-jacket','work-scarf','Linen neckerchief',{neckwearStyle:'kerchief',neckwearColor:'rust',neckwearFabric:'linen',neckwearPattern:'check'});
add('male-chinese-frock-coat','older-cravat','Cravat and stickpin',{neckwearStyle:'cravat',neckwearColor:'slate',neckwearFabric:'silk',neckwearPattern:'diamond',tiePin:'stone',jewelryMetal:'gold'});
add('female-older-shirtwaist-skirt','older-ribbon','Ribbed silk ribbon',{neckwearStyle:'ribbon',neckwearColor:'black',neckwearFabric:'grosgrain',earringStyle:'pearl'});
add('female-black-walking-suit','walking-brooch','Cameo and pearl drops',{neckwearStyle:'original',broochStyle:'cameo',earringStyle:'pearl',jewelryMetal:'gold'});
for(const style of ['oval','cameo','bar','jet'])add('carmela-russo','brooch-'+style,ACCESSORY_CHOICES.broochStyle[style],{neckwearStyle:'original',broochStyle:style,earringStyle:'pearl',jewelryMetal:'gold'},'jewelry');
for(const style of ['plain','pearl','stone'])add('male-young-work-jacket','stud-'+style,`${style} collar stud`,{neckwearStyle:'none',collarStud:style,jewelryMetal:'gold'},'jewelry');
for(const pattern of Object.keys(ACCESSORY_CHOICES.neckwearPattern))add(male,'pattern-'+pattern,ACCESSORY_CHOICES.neckwearPattern[pattern],{neckwearStyle:'tie',neckwearColor:'navy',neckwearFabric:'silk',neckwearPattern:pattern},'patterns');
for(const fabric of ['silk','grosgrain','velvet','linen'])add(female,'fabric-'+fabric,ACCESSORY_CHOICES.neckwearFabric[fabric],{neckwearStyle:'ribbon',neckwearColor:'teal',neckwearFabric:fabric,neckwearPattern:'plain'},'fabrics');
add('male-broad-template','legacy-cravat','Legacy broad cravat',{neckwearStyle:'cravat',neckwearColor:'cream',neckwearFabric:'silk',tiePin:'pearl'});
add('male-lean-template','legacy-bow','Legacy lean bow',{neckwearStyle:'bow',neckwearColor:'wine',neckwearFabric:'grosgrain'});
if(args.ids){const selected=new Set(args.ids.split(','));for(let i=looks.length-1;i>=0;i--)if(!selected.has(looks[i].id))looks.splice(i,1);}
const browser=await chromium.launch({channel:'chrome',headless:true});
try{
 for(const model of [...new Set(looks.map(l=>l.model))]){
  const page=await browser.newPage({viewport:{width:1440,height:1100}});
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error'&&!m.location().url.includes('favicon'))errors.push(m.text());});
  page.on('response',r=>{if(r.status()>=400&&!r.url().includes('favicon'))errors.push(`${r.status()} ${r.url()}`);});
  await page.goto(`${url}/face-lab.html?model=${model}`);await page.waitForFunction(()=>window.__faceLab,undefined,{timeout:60000});
  for(const item of looks.filter(l=>l.model===model))for(const [angle,name]of [[.12,'front'],[1.25,'profile']]){
   const state=await page.evaluate(p=>__faceLab.show(p),{...item.look,view:'accessories',angle,time:1});
   if(!state.accessories.available||state.accessories.triangles>24000)errors.push('Invalid accessory budget '+item.id);
   const file=item.id+'-'+name+'.png';await page.screenshot({path:path.join(output,file)});captures.push({...item,angle,file,state});
  }
  for(const [clip,time]of [['StandingIdle',.5],['SittingTalking',1.1]]){
   const state=await page.evaluate(p=>__faceLab.show(p),{...looks.find(l=>l.model===model).look,view:'torso',angle:.25,clip,time,speaking:clip==='SittingTalking',expression:'relieved',faceTime:1.1});
   const file=model+'-'+clip+'.png';await page.screenshot({path:path.join(output,file)});captures.push({model,id:model+'-'+clip,file,state});
  }
  console.log('CAPTURED '+model);await page.close();
 }
 for(const family of ['styles','patterns','fabrics','jewelry']){
  const items=captures.filter(c=>c.sheet===family&&c.angle===.12),width=360,height=430,layers=[],columns=family==='fabrics'?4:3;
  if(!items.length)continue;
  for(const [i,item]of items.entries()){
   const left=i%columns*width,top=Math.floor(i/columns)*height;
   layers.push({input:await sharp(path.join(output,item.file)).extract({left:210,top:190,width:700,height:800}).resize(width,height-30,{fit:'contain',background:'#20242a'}).toBuffer(),left,top});
   const label=item.label.replaceAll('&','&amp;');layers.push({input:Buffer.from(`<svg width="${width}" height="30"><text x="10" y="21" fill="#ede4d3" font-family="Arial" font-size="14">${label}</text></svg>`),left,top:top+height-30});
  }
  await sharp({create:{width:width*columns,height:height*Math.ceil(items.length/columns),channels:4,background:'#20242a'}}).composite(layers).png().toFile(path.join(output,family+'-sheet.png'));
 }
}finally{await browser.close();await writeFile(path.join(output,'review.json'),JSON.stringify({captures,errors},null,2));}
console.log(JSON.stringify({output,captures:captures.length,errors}));if(errors.length)process.exitCode=1;
