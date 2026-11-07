// Mixamo's "Sitting Idle" source was downloaded on a rig with only thumb and
// index fingers, so on a full hand it curls the index and leaves the other
// fingers flat at bind pose: a claw. Copy the index curl to the other fingers.
// Usage: node scripts/characters/fix-idle-fingers.mjs [--models=samuel-taylor] [--clip=ClinicIdle]
import {rename} from 'node:fs/promises';
import path from 'node:path';
import {createIO,contract,assertSameCharacter} from '../lib/glb-pipeline.mjs';

const args=Object.fromEntries(process.argv.slice(2).map(a=>a.replace(/^--/,'').split('=')));
const clipName=args.clip||'ClinicIdle';
// Outer fingers rest a little more curled than the index in a relaxed hand.
const FOLLOW={Middle:1.05,Ring:1.12,Pinky:1.2,Thumb:.35};

const mul=(a,b)=>[a[3]*b[0]+a[0]*b[3]+a[1]*b[2]-a[2]*b[1],a[3]*b[1]-a[0]*b[2]+a[1]*b[3]+a[2]*b[0],a[3]*b[2]+a[0]*b[1]-a[1]*b[0]+a[2]*b[3],a[3]*b[3]-a[0]*b[0]-a[1]*b[1]-a[2]*b[2]];
const inv=q=>[-q[0],-q[1],-q[2],q[3]];
// Scale a rotation's angle about its own axis.
function power(q,t){
  const w=Math.max(-1,Math.min(1,q[3])),angle=2*Math.acos(w),s=Math.sqrt(1-w*w);
  if(s<1e-6)return [0,0,0,1];
  const half=angle*t/2,k=Math.sin(half)/s;
  return [q[0]*k,q[1]*k,q[2]*k,Math.cos(half)];
}
const angleOf=q=>2*Math.acos(Math.min(1,Math.abs(q[3])))*180/Math.PI;

const io=await createIO();
for(const model of (args.models||'samuel-taylor').split(',')){
  const file=path.resolve(`game/public/models/characters/${model}.glb`),document=await io.read(file);
  const before=contract(document);
  const animation=document.getRoot().listAnimations().find(a=>a.getName()===clipName);
  if(!animation)throw new Error(`${model}: no ${clipName}`);
  const channels=new Map(animation.listChannels().filter(c=>c.getTargetPath()==='rotation').map(c=>[c.getTargetNode().getName(),c]));
  let changed=0;
  for(const side of ['Left','Right']){
    for(const segment of [1,2,3]){
      const index=channels.get(`mixamorig:${side}HandIndex${segment}`);
      if(!index)continue;
      const indexSampler=index.getSampler(),times=indexSampler.getInput(),values=indexSampler.getOutput();
      const indexRest=index.getTargetNode().getRotation();
      for(const [finger,factor] of Object.entries(FOLLOW)){
        const channel=channels.get(`mixamorig:${side}Hand${finger}${segment}`);
        if(!channel)continue;
        const node=channel.getTargetNode(),rest=node.getRotation();
        const current=channel.getSampler().getOutput();
        // Only repair a finger the clip leaves at bind pose.
        const moving=Array.from({length:current.getCount()},(_,i)=>angleOf(mul(inv(rest),current.getElement(i,[])))).some(a=>a>1);
        if(moving)continue;
        const output=document.createAccessor(`${node.getName()}-${clipName}-curl`).setType('VEC4');
        const array=new Float32Array(values.getCount()*4);
        for(let i=0;i<values.getCount();i++){
          const delta=mul(inv(indexRest),values.getElement(i,[]));
          array.set(mul(rest,power(delta,factor)),i*4);
        }
        output.setArray(array).setBuffer(values.getBuffer());
        const sampler=document.createAnimationSampler().setInput(times).setOutput(output).setInterpolation(indexSampler.getInterpolation());
        animation.addSampler(sampler);
        channel.setSampler(sampler);
        changed++;
      }
    }
  }
  const temp=file+'.tmp.glb';
  assertSameCharacter(before,document,model);await io.write(temp,document);assertSameCharacter(before,await io.read(temp),model);await rename(temp,file);
  console.log('IDLE_FINGERS',model,clipName,changed,'channels');
}
