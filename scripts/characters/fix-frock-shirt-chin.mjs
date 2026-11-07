// The frock-coat exports keep a scrap of Tripo shirt inside the chin, fixed to
// the chest. When the head turns it shows at the jaw as a pale jagged patch.
// Collapse it to a point inside the neck; the triangle count stays the same.
// Usage: node scripts/characters/fix-frock-shirt-chin.mjs [--dry] [files...]
import {rename} from 'node:fs/promises';
import path from 'node:path';
import * as THREE from 'three';
import {createIO,contract,assertSameCharacter} from '../lib/glb-pipeline.mjs';

// Shirt cloth this far above the neck joint is inside the chin, not at the collar.
const ABOVE_NECK=.065;
const dry=process.argv.includes('--dry');
const files=process.argv.slice(2).filter(a=>!a.startsWith('--'));
const io=await createIO();
for(const file of files){
  const document=await io.read(path.resolve(file)),before=contract(document);
  let moved=0;
  for(const node of document.getRoot().listNodes()){
    const mesh=node.getMesh(),skin=node.getSkin();
    if(!mesh||!skin)continue;
    const joints=skin.listJoints().map(j=>j.getName().replace(/^mixamorig:?/,''));
    const neckIndex=joints.indexOf('Neck');
    if(neckIndex<0)continue;
    const neck=new THREE.Vector3().setFromMatrixPosition(new THREE.Matrix4().fromArray(skin.getInverseBindMatrices().getElement(neckIndex,[])).invert());
    for(const primitive of mesh.listPrimitives()){
      if(primitive.getMaterial()?.getName()!=='Patient_MaleShirt')continue;
      const positions=primitive.getAttribute('POSITION');
      for(let i=0;i<positions.getCount();i++){
        if(positions.getElement(i,[])[1]-neck.y<ABOVE_NECK)continue;
        positions.setElement(i,neck.toArray());moved++;
      }
    }
  }
  console.log('FROCK_SHIRT_CHIN',path.basename(file),moved);
  if(dry||!moved)continue;
  const temp=path.resolve(file)+'.tmp.glb';
  assertSameCharacter(before,document,file);await io.write(temp,document);assertSameCharacter(before,await io.read(temp),file);await rename(temp,path.resolve(file));
}
