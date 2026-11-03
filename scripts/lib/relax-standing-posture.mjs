import * as THREE from 'three';

const suffix=name=>name.replace(/^mixamorig:?/,'').toLowerCase();
const point=bone=>bone.getWorldPosition(new THREE.Vector3());
const smooth=(a,b,t)=>{const x=THREE.MathUtils.clamp((t-a)/(b-a),0,1);return x*x*(3-2*x);};
function worldRotation(bone,rotation){
  bone.quaternion.copy(bone.parent.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(rotation));
  bone.updateWorldMatrix(false,true);
}
function palm(bones,side){
  const hand=bones[side+'hand'],forward=point(bones[side+'handmiddle1']).sub(point(hand)).normalize();
  const normal=forward.clone().cross(point(bones[side+'handindex1']).sub(point(bones[side+'handpinky1']))).normalize().multiplyScalar(side==='left'?1:-1);
  const across=forward.clone().cross(normal).normalize();
  return {forward,normal,across,rotation:new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(across,forward,normal))};
}
function aim(bone,child,target){
  const rotation=new THREE.Quaternion().setFromUnitVectors(point(child).sub(point(bone)).normalize(),target.clone().sub(point(bone)).normalize());
  worldRotation(bone,rotation.multiply(bone.getWorldQuaternion(new THREE.Quaternion())));
}
function wristTarget(bones,side,right,up,forward,clearance=0){
  const upper=bones[side+'arm'],lower=bones[side+'forearm'],hand=bones[side+'hand'],sign=side==='left'?1:-1;
  const a=point(upper).distanceTo(point(lower)),b=point(lower).distanceTo(point(hand)),scale=(a+b)/.50;
  return point(upper).addScaledVector(up,-(a+b)*.982).addScaledVector(right,sign*(.020*scale+clearance)).addScaledVector(forward,.025*scale);
}
function lowerArm(bones,side,right,up,forward,clearance){
  const upper=bones[side+'arm'],lower=bones[side+'forearm'],hand=bones[side+'hand'],sign=side==='left'?1:-1;
  const origin=point(upper),elbow=point(lower),wrist=point(hand),a=origin.distanceTo(elbow),b=elbow.distanceTo(wrist);
  const target=wristTarget(bones,side,right,up,forward,clearance);
  const direction=target.clone().sub(origin),distance=Math.min(direction.length(),(a+b)*.995);direction.normalize();
  target.copy(origin).addScaledVector(direction,distance);
  const pole=forward.clone().negate().addScaledVector(right,sign*.2);pole.addScaledVector(direction,-pole.dot(direction)).normalize();
  const cosine=THREE.MathUtils.clamp((a*a+distance*distance-b*b)/(2*a*distance),-1,1);
  const bend=origin.clone().addScaledVector(direction,a*cosine).addScaledVector(pole,a*Math.sqrt(1-cosine*cosine));
  aim(upper,lower,bend);aim(lower,hand,target);
}
function garmentSpacing(document,root,objects,bones){
  const standing=document.getRoot().listAnimations().find(a=>a.getName()==='StandingIdle');if(!standing)return {left:0,right:0};
  const clip=postureClip(standing,objects),mixer=new THREE.AnimationMixer(root);mixer.clipAction(clip).play();mixer.setTime(.8);root.updateMatrixWorld(true);
  const right=point(bones.leftarm).sub(point(bones.rightarm)).normalize(),up=point(bones.neck).sub(point(bones.hips)).normalize(),forward=right.clone().cross(up).normalize();
  const targets=Object.fromEntries(['left','right'].map(side=>[side,wristTarget(bones,side,right,up,forward)])),spacing={left:0,right:0};
  for(const node of document.getRoot().listNodes()){
    const skin=node.getSkin(),mesh=node.getMesh();if(!skin||!mesh||/Seated/.test(node.getName()))continue;
    const joints=skin.listJoints(),inverse=skin.getInverseBindMatrices(),matrices=joints.map((joint,i)=>new THREE.Matrix4().multiplyMatrices(objects.get(joint).matrixWorld,new THREE.Matrix4().fromArray(inverse.getElement(i,[]))));
    for(const primitive of mesh.listPrimitives()){
      if(!['Patient_MaleFabric','Patient_WorkCotton','Patient_WorkWool','Patient_DressFabric'].includes(primitive.getMaterial()?.getName()))continue;
      const positions=primitive.getAttribute('POSITION'),ids=primitive.getAttribute('JOINTS_0'),weights=primitive.getAttribute('WEIGHTS_0');if(!ids||!weights)continue;
      for(let i=0;i<positions.getCount();i++){
        const index=ids.getElement(i,[]),weight=weights.getElement(i,[]);let torso=0;
        for(let j=0;j<4;j++)if(/^(hips|spine\d*|neck|(?:left|right)(?:upleg|leg))$/.test(suffix(joints[index[j]].getName())))torso+=weight[j];
        if(torso<.65)continue;
        const original=new THREE.Vector3().fromArray(positions.getElement(i,[])),p=new THREE.Vector3();
        for(let j=0;j<4;j++)if(weight[j])p.addScaledVector(original.clone().applyMatrix4(matrices[index[j]]),weight[j]);
        for(const side of ['left','right']){
          const delta=p.clone().sub(targets[side]),height=delta.dot(up),depth=delta.dot(forward),outward=delta.dot(right)*(side==='left'?1:-1);
          if(height>-.20&&height<.025&&Math.abs(depth)<.10)spacing[side]=Math.max(spacing[side],outward+.028);
        }
      }
    }
  }
  mixer.stopAllAction();mixer.uncacheRoot(root);return spacing;
}
function relaxHand(bones,side,right){
  const hand=bones[side+'hand'],lower=bones[side+'forearm'],axis=point(hand).sub(point(lower)).normalize(),sign=side==='left'?1:-1;
  const inward=right.clone().multiplyScalar(-sign),before=palm(bones,side);
  const from=before.normal.clone().addScaledVector(axis,-before.normal.dot(axis)).normalize(),to=inward.clone().addScaledVector(axis,-inward.dot(axis)).normalize();
  const angle=Math.atan2(axis.dot(from.clone().cross(to)),from.dot(to));
  // Share pronation along the forearm so the wrist does not take a 90-degree twist.
  worldRotation(lower,new THREE.Quaternion().setFromAxisAngle(axis,angle*.55).multiply(lower.getWorldQuaternion(new THREE.Quaternion())));
  const current=palm(bones,side),forward=point(hand).sub(point(lower)).normalize();
  const normal=inward.clone().addScaledVector(forward,-inward.dot(forward)).normalize(),across=forward.clone().cross(normal).normalize();
  const desired=new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(across,forward,normal));
  worldRotation(hand,desired.multiply(current.rotation.clone().invert()).multiply(hand.getWorldQuaternion(new THREE.Quaternion())));
  const curlAxis=palm(bones,side).across;
  for(const [finger,angles]of [['index',[.24,.34,.17]],['middle',[.29,.38,.19]],['ring',[.34,.42,.21]],['pinky',[.39,.46,.23]]])for(let i=1;i<=3;i++){
    const bone=bones[`${side}hand${finger}${i}`];if(!bone)continue;
    worldRotation(bone,new THREE.Quaternion().setFromAxisAngle(curlAxis,angles[i-1]).multiply(bone.getWorldQuaternion(new THREE.Quaternion())));
  }
  const thumb=bones[side+'handthumb1'],thumb2=bones[side+'handthumb2'];
  if(thumb&&thumb2){
    const toward=point(bones[side+'handindex1']).addScaledVector(forward,.025).sub(point(thumb)).normalize();
    const swing=new THREE.Quaternion().setFromUnitVectors(point(thumb2).sub(point(thumb)).normalize(),toward);
    swing.slerp(new THREE.Quaternion(),.65);worldRotation(thumb,swing.multiply(thumb.getWorldQuaternion(new THREE.Quaternion())));
    for(const [i,angle]of [[2,.18],[3,.14]]){const bone=bones[`${side}handthumb${i}`];if(bone)worldRotation(bone,new THREE.Quaternion().setFromAxisAngle(curlAxis,angle).multiply(bone.getWorldQuaternion(new THREE.Quaternion())));}
  }
}

export function readPostureSkeleton(document){
  const nodes=document.getRoot().listNodes(),objects=new Map(nodes.map(node=>[node,new THREE.Object3D()])),root=new THREE.Group(),bones={};
  for(const node of nodes){
    const object=objects.get(node);object.name=node.getName();object.position.fromArray(node.getTranslation());object.quaternion.fromArray(node.getRotation());object.scale.fromArray(node.getScale());
    (node.getParentNode()?objects.get(node.getParentNode()):root).add(object);
    if(/^mixamorig/.test(object.name))bones[suffix(object.name)]=object;
  }
  root.updateMatrixWorld(true);return {root,objects,bones};
}
export function postureClip(animation,objects){
  const tracks=[];
  for(const channel of animation.listChannels()){
    const path=channel.getTargetPath(),property={translation:'position',rotation:'quaternion',scale:'scale'}[path];if(!property)continue;
    const sampler=channel.getSampler(),accessor=sampler.getOutput(),values=Array.from({length:accessor.getCount()},(_,i)=>accessor.getElement(i,[])).flat();
    if(sampler.getInterpolation()==='CUBICSPLINE')throw Error('Posture correction requires resampled linear tracks');
    const Track=path==='rotation'?THREE.QuaternionKeyframeTrack:THREE.VectorKeyframeTrack;
    tracks.push(new Track(objects.get(channel.getTargetNode()).uuid+'.'+property,sampler.getInput().getArray().slice(),values));
  }
  return new THREE.AnimationClip(animation.getName(),-1,tracks);
}
export function postureMetrics(bones){
  const right=point(bones.leftarm).sub(point(bones.rightarm)).normalize(),hands={};
  for(const side of ['left','right']){
    const sign=side==='left'?1:-1,p=palm(bones,side),wrist=point(bones[side+'hand']);
    hands[side]={palmInward:p.normal.dot(right.clone().multiplyScalar(-sign)),palmForward:p.normal.z,wrist:wrist.toArray(),fingerDirection:p.forward.toArray()};
  }
  return hands;
}
function repairSkirtWeights(document){
  const reports=[];
  const walkingSuit=document.getRoot().listNodes().some(node=>node.getExtras().garmentStyle==='walking-suit');
  for(const node of document.getRoot().listNodes()){
    if(node.getName()!=='Patient_SkirtStanding')continue;
    const skin=node.getSkin(),joints=skin?.listJoints(),hips=joints?.findIndex(joint=>/Hips$/.test(joint.getName()));if(!skin||hips<0)continue;
    let repaired=0;
    for(const primitive of node.getMesh()?.listPrimitives()||[]){
      const sourceIds=primitive.getAttribute('JOINTS_0'),sourceWeights=primitive.getAttribute('WEIGHTS_0');if(!sourceIds||!sourceWeights)continue;
      let ids=null,weights=null;
      for(let i=0;i<sourceIds.getCount();i++){
        const index=sourceIds.getElement(i,[]),weight=sourceWeights.getElement(i,[]),support=new Map();let arm=0;
        if(walkingSuit){
          if(index[0]===hips&&weight[0]>.99999)continue;
          if(!ids){ids=sourceIds.clone().setArray(sourceIds.getArray().slice());weights=sourceWeights.clone().setArray(sourceWeights.getArray().slice());primitive.setAttribute('JOINTS_0',ids).setAttribute('WEIGHTS_0',weights);}
          ids.setElement(i,[hips,0,0,0]);weights.setElement(i,[1,0,0,0]);repaired++;continue;
        }
        for(let k=0;k<4;k++){
          if(/(?:Left|Right)(?:Shoulder|Arm|ForeArm|Hand)/.test(joints[index[k]].getName()))arm+=weight[k];
          else support.set(index[k],(support.get(index[k])||0)+weight[k]);
        }
        if(arm<.00001)continue;
        if(!ids){ids=sourceIds.clone().setArray(sourceIds.getArray().slice());weights=sourceWeights.clone().setArray(sourceWeights.getArray().slice());primitive.setAttribute('JOINTS_0',ids).setAttribute('WEIGHTS_0',weights);}
        support.set(hips,(support.get(hips)||0)+arm);const entries=[...support].sort((a,b)=>b[1]-a[1]).slice(0,4);while(entries.length<4)entries.push([0,0]);
        const total=entries.reduce((sum,p)=>sum+p[1],0);ids.setElement(i,entries.map(p=>p[0]));weights.setElement(i,entries.map(p=>p[1]/total));repaired++;
      }
    }
    if(repaired)reports.push({garment:node.getName(),repairedVertices:repaired,binding:walkingSuit?'hips':'no-arms'});
  }
  return reports;
}
export function relaxStandingPosture(document){
  if(!document.getRoot().listNodes().some(node=>node.getName()==='Carmela_Face'))return [];
  const repairs=repairSkirtWeights(document);
  const animations=document.getRoot().listAnimations().filter(a=>['StandingIdle','Walk','SitDown','StandUp'].includes(a.getName())&&a.getExtras().standingPostureVersion!==1);
  if(!animations.length)return repairs;
  const {root,objects,bones}=readPostureSkeleton(document),required=['leftarm','rightarm','leftforearm','rightforearm','lefthandmiddle1','righthandmiddle1','lefthandindex1','righthandindex1','lefthandpinky1','righthandpinky1','hips','neck'];
  if(required.some(name=>!bones[name]))return [];
  const changedNodes=[...objects.keys()].filter(node=>/^(left|right)(arm|forearm|hand(?:thumb|index|middle|ring|pinky)?[123]?)$/.test(suffix(node.getName())));
  const reports=[...repairs],buffer=document.getRoot().listBuffers()[0];
  const spacing=garmentSpacing(document,root,objects,bones);
  for(const animation of animations){
    const name=animation.getName();
    const clip=postureClip(animation,objects),mixer=new THREE.AnimationMixer(root),action=mixer.clipAction(clip).play(),count=Math.ceil(clip.duration*30),times=Float32Array.from({length:count+1},(_,i)=>i/count*clip.duration);
    action.setLoop(THREE.LoopOnce,1);action.clampWhenFinished=true;
    const values=new Map(changedNodes.map(node=>[node,[]]));let before,after;
    for(let frame=0;frame<=count;frame++){
      action.reset().play();mixer.setTime(times[frame]);root.updateMatrixWorld(true);
      const originals=new Map(changedNodes.map(node=>[node,objects.get(node).quaternion.clone()]));
      const weight=name==='SitDown'?1-smooth(.05,.40,frame/count):name==='StandUp'?smooth(.55,.95,frame/count):1;
      if(frame===Math.floor(count/2))before=postureMetrics(bones);
      if(weight>0){
        const right=point(bones.leftarm).sub(point(bones.rightarm)).normalize(),up=point(bones.neck).sub(point(bones.hips)).normalize(),forward=right.clone().cross(up).normalize();
        for(const side of ['left','right']){
          if(name!=='Walk')lowerArm(bones,side,right,up,forward,spacing[side]);
          relaxHand(bones,side,right);
        }
        if(weight<1)for(const node of changedNodes)objects.get(node).quaternion.slerpQuaternions(originals.get(node),objects.get(node).quaternion.clone(),weight);
        root.updateMatrixWorld(true);
      }
      if(frame===Math.floor(count/2))after=postureMetrics(bones);
      for(const node of changedNodes){
        const q=objects.get(node).quaternion,output=values.get(node),n=output.length;
        if(n&&q.x*output[n-4]+q.y*output[n-3]+q.z*output[n-2]+q.w*output[n-1]<0)output.push(-q.x,-q.y,-q.z,-q.w);else output.push(...q.toArray());
      }
    }
    mixer.stopAllAction();mixer.uncacheRoot(root);
    const input=document.createAccessor(name+' relaxed times').setType('SCALAR').setArray(times).setBuffer(buffer);
    for(const node of changedNodes){
      const channel=animation.listChannels().find(c=>c.getTargetNode()===node&&c.getTargetPath()==='rotation');if(!channel)continue;
      const output=document.createAccessor(node.getName()+' relaxed '+name).setType('VEC4').setArray(new Float32Array(values.get(node))).setBuffer(buffer);
      const sampler=document.createAnimationSampler().setInput(input).setOutput(output).setInterpolation('LINEAR');animation.addSampler(sampler);channel.setSampler(sampler);
    }
    const used=new Set(animation.listChannels().map(channel=>channel.getSampler()));
    for(const sampler of animation.listSamplers())if(!used.has(sampler))animation.removeSampler(sampler);
    animation.setExtras({...animation.getExtras(),standingPostureVersion:1});reports.push({clip:name,samples:count+1,garmentSpacing:spacing,before,after});
  }
  return reports;
}
