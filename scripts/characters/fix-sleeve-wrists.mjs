// Sleeve ends and cuffs skinned partly to the hand pinch and lift off the
// wrist whenever the hand turns. A sleeve rides on the forearm, so move every
// hand and finger weight on a garment onto that side's forearm.
// Usage: node scripts/characters/fix-sleeve-wrists.mjs [--dry] [files...]
import {rename} from 'node:fs/promises';
import path from 'node:path';
import {createIO,contract,assertSameCharacter} from '../lib/glb-pipeline.mjs';

const dry=process.argv.includes('--dry');
const files=process.argv.slice(2).filter(a=>!a.startsWith('--'));
const io=await createIO();
const boneName=node=>node.getName().replace(/^mixamorig:?/,'');
for(const file of files){
  const document=await io.read(path.resolve(file)),before=contract(document);
  const report={};
  for(const node of document.getRoot().listNodes()){
    const mesh=node.getMesh(),skin=node.getSkin();
    if(!mesh||!skin||node.getExtras()?.renderer_c_role!=='clothe')continue;
    const joints=skin.listJoints().map(boneName);
    const forearm=Object.fromEntries(['Left','Right'].map(side=>[side,joints.indexOf(`${side}ForeArm`)]));
    const target=joints.map(name=>{const side=name.match(/^(Left|Right)Hand/)?.[1];return side&&forearm[side]>=0?forearm[side]:-1;});
    let moved=0;
    for(const primitive of mesh.listPrimitives()){
      const ids=primitive.getAttribute('JOINTS_0'),weights=primitive.getAttribute('WEIGHTS_0');
      if(!ids||!weights)continue;
      for(let i=0;i<ids.getCount();i++){
        const id=ids.getElement(i,[]),weight=weights.getElement(i,[]);
        if(!id.some((joint,k)=>weight[k]>0&&target[joint]>=0))continue;
        // Merge into an existing forearm slot when there is one.
        const merged=new Map();
        id.forEach((joint,k)=>{if(weight[k]<=0)return;const to=target[joint]>=0?target[joint]:joint;merged.set(to,(merged.get(to)||0)+weight[k]);});
        const entries=[...merged].sort((a,b)=>b[1]-a[1]).slice(0,4);
        while(entries.length<4)entries.push([0,0]);
        ids.setElement(i,entries.map(e=>e[0]));weights.setElement(i,entries.map(e=>e[1]));
        moved++;
      }
    }
    if(moved)report[node.getName()]=moved;
  }
  console.log('SLEEVE_WRISTS',path.basename(file),JSON.stringify(report));
  if(dry||!Object.keys(report).length)continue;
  const temp=path.resolve(file)+'.tmp.glb';
  assertSameCharacter(before,document,file);await io.write(temp,document);assertSameCharacter(before,await io.read(temp),file);await rename(temp,path.resolve(file));
}
