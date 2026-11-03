import * as THREE from 'three';

const name=node=>node.getName().replace(':','');
const finger=/Hand(?:Thumb|Index|Middle|Ring|Pinky)/;

export function repairWristBinding(document){
  const reports=[];
  for(const node of document.getRoot().listNodes()){
    const mesh=node.getMesh(),skin=node.getSkin();
    if(!mesh||!skin)continue;
    const cuff=mesh.listPrimitives().some(p=>p.getMaterial()?.getName()==='Patient_FormalCuffFabric');
    if(cuff?node.getExtras().cuffBindingVersion===1:node.getExtras().wristBindingVersion===4)continue;
    if(!cuff&&!mesh.listPrimitives().some(p=>p.getMaterial()?.getName()==='Patient_WristSkin'))continue;
    const previousFit=node.getExtras().wristBindingVersion===3;
    const joints=skin.listJoints(),bind=skin.getInverseBindMatrices();
    const hands=Object.fromEntries(['Left','Right'].map(side=>{
      const index=joints.findIndex(j=>name(j)==='mixamorig'+side+'Hand');
      const middle=joints.find(j=>name(j)==='mixamorig'+side+'HandMiddle1');
      return [side,{index,forearm:joints.findIndex(j=>name(j)==='mixamorig'+side+'ForeArm'),inverse:new THREE.Matrix4().fromArray(bind.getElement(index,[])),forward:new THREE.Vector3().fromArray(middle.getTranslation()).normalize()}];
    }));
    let repaired=0,fittedVertices=0;
    for(const primitive of mesh.listPrimitives()){
      const material=primitive.getMaterial()?.getName();
      if(!['Patient_Hands','Patient_WristSkin','Patient_FormalCuffFabric'].includes(material))continue;
      const positions=primitive.getAttribute('POSITION'),sourceIds=primitive.getAttribute('JOINTS_0'),sourceWeights=primitive.getAttribute('WEIGHTS_0');
      let ids,weights,correctedPositions;
      for(let i=0;i<positions.getCount();i++){
        const index=sourceIds.getElement(i,[]),weight=sourceWeights.getElement(i,[]);
        const strongest=weight.indexOf(Math.max(...weight)),hand=hands[joints[index[strongest]].getName().includes('Left')?'Left':'Right'];
        const local=new THREE.Vector3().fromArray(positions.getElement(i,[])).applyMatrix4(hand.inverse);
        const distance=local.dot(hand.forward),t=THREE.MathUtils.clamp((distance-.035)/.030,0,1);
        const radial=local.clone().addScaledVector(hand.forward,-distance);
        if(previousFit)radial.divideScalar(.75+.25*THREE.MathUtils.smoothstep(distance,.010,.035));
        const fit=1-THREE.MathUtils.smoothstep(distance,.025,.065);
        const radius=radial.length(),scale=THREE.MathUtils.lerp(1,Math.min(1,.023/Math.max(radius,.00001)),fit);
        // Fit the covered wrist inside the cuff, fading back to the native palm.
        // A percentage shrink still left the donor's oversized wrist outside it.
        if(!cuff&&(scale<1||previousFit)){
          const fitted=hand.forward.clone().multiplyScalar(distance).addScaledVector(radial,scale).applyMatrix4(hand.inverse.clone().invert());
          if(!correctedPositions){correctedPositions=positions.clone().setArray(positions.getArray().slice());primitive.setAttribute('POSITION',correctedPositions);}
          correctedPositions.setElement(i,fitted.toArray());
          fittedVertices++;
        }
        if(previousFit)continue;
        const amount=material==='Patient_WristSkin'?1:1-t*t*(3-2*t);
        if(amount===0&&!cuff)continue;
        const support=new Map();let transferred=0;
        for(let k=0;k<4;k++){
          const removed=finger.test(joints[index[k]].getName())?weight[k]*amount:0;
          support.set(index[k],(support.get(index[k])||0)+weight[k]-removed);transferred+=removed;
        }
        if(distance<=.035||cuff){
          const blend=THREE.MathUtils.smoothstep(distance,.012,.035);
          support.clear();support.set(hand.forearm,1-blend);support.set(hand.index,blend);transferred=1;
        }
        if(transferred<.00001)continue;
        // Keep covered skin with the sleeve. Blend into hand motion only
        // outside the cuff; finger joints must never pull the wrist.
        if(distance>.035&&!cuff)support.set(hand.index,(support.get(hand.index)||0)+transferred);
        const entries=[...support].sort((a,b)=>b[1]-a[1]).slice(0,4);while(entries.length<4)entries.push([0,0]);
        const total=entries.reduce((sum,e)=>sum+e[1],0);
        if(!ids){ids=sourceIds.clone().setArray(sourceIds.getArray().slice());weights=sourceWeights.clone().setArray(sourceWeights.getArray().slice());primitive.setAttribute('JOINTS_0',ids).setAttribute('WEIGHTS_0',weights);}
        ids.setElement(i,entries.map(e=>e[0]));weights.setElement(i,entries.map(e=>e[1]/total));repaired++;
      }
    }
    node.setExtras({...node.getExtras(),...(cuff?{cuffBindingVersion:1}:{wristBindingVersion:4})});reports.push({node:node.getName(),repairedVertices:repaired,fittedVertices});
  }
  return reports;
}
