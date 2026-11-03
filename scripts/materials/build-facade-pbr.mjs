// Matching source maps keep masonry relief independent of its painted colour.
import {readFile,writeFile,mkdir,access} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import sharp from 'sharp';
const root=path.resolve(import.meta.dirname,'../..');
const source=path.join(root,'assets/source/facade-pbr-2026-11-03');
const out=path.join(root,'game/public/textures/facades/pbr');
await mkdir(out,{recursive:true});
const materials={brownstone:'sandstone_blocks_08',brick:'brick_wall_001',limestone:'sandstone_blocks_08','ashlar-gray':'large_sandstone_blocks'};
const manifest={license:'CC0-1.0',materials:{}};
for(const [name,id]of Object.entries(materials)){
 const {info,files}=JSON.parse(await readFile(path.join(source,id+'.json'),'utf8'));
 const maps={};
 for(const key of ['Diffuse','nor_gl','arm']){
  const file=files[key]['1k'].png;
  const destination=path.join(source,path.basename(new URL(file.url).pathname));
  try{await access(destination);}catch{
   const r=await fetch(file.url);if(!r.ok)throw Error(`${r.status} ${file.url}`);
   const bytes=Buffer.from(await r.arrayBuffer());
   if(createHash('md5').update(bytes).digest('hex')!==file.md5)throw Error('Source checksum mismatch: '+id);
   await writeFile(destination,bytes);
  }
  maps[key]=destination;
 }
 const {data:color}=await sharp(maps.Diffuse).resize(1024,1024).removeAlpha().raw().toBuffer({resolveWithObject:true});
 const old=await sharp(path.join(root,'game/public/textures/facades',name+'.webp')).stats();
 const mean=[0,0,0];for(let i=0;i<color.length;i++)mean[i%3]+=color[i]/(color.length/3);
 for(let i=0;i<color.length;i++){
  const channel=i%3;
  // Retain the street palette while bringing in the scanned surface variation.
  const target=old.channels[channel].mean;
  color[i]=Math.max(0,Math.min(255,target+(color[i]-mean[channel])*.82));
 }
 await sharp(color,{raw:{width:1024,height:1024,channels:3}}).webp({quality:91,effort:6}).toFile(path.join(out,name+'-color.webp'));
 if(name!=='limestone'){
  await sharp(maps.nor_gl).resize(1024,1024).removeAlpha().webp({lossless:true,effort:6}).toFile(path.join(out,name+'-normal.webp'));
  await sharp(maps.arm).resize(512,512).removeAlpha().webp({lossless:true,effort:6}).toFile(path.join(out,name+'-arm.webp'));
 }
 manifest.materials[name]={asset:id,source:`https://polyhaven.com/a/${id}`,authors:info.authors,colorSize:1024,normalSize:1024,armSize:512,reliefSet:name==='limestone'?'brownstone':name,repeatMetres:3};
 console.log(name,id);
}
await writeFile(path.join(out,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
