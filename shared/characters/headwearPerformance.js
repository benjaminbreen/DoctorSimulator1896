import * as THREE from 'three';
import {buildHeadwear,disposeHeadwear,HEADWEAR_STYLES,HAT_DESIGN_RADIUS} from './headwearGeometry.js';

const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
const smooth=(a,b,v)=>{const t=clamp((v-a)/(b-a));return t*t*(3-2*t);};
const UP=new THREE.Vector3(0,1,0),FORWARD=new THREE.Vector3(0,0,1),RIGHT=new THREE.Vector3(-1,0,0);
const DURATION=3.6;
const suffix=name=>name.toLowerCase().replace(/^mixamorig:?/,'');

function visible(object){for(let p=object;p;p=p.parent)if(!p.visible)return false;return true;}

// Cache the upper crown on a small grid so fitting every scalp vertex
// does not require repeated raycasts while dragging a look slider.
function crownRoof(geometry){
  const steps=40,extent=HAT_DESIGN_RADIUS*1.3,cell=extent*2/steps;
  const grid=new Float32Array((steps+1)**2).fill(-Infinity),p=geometry.attributes.position,index=geometry.index;
  for(let i=0;i<(index?.count||p.count);i+=3){
    const ids=[0,1,2].map(j=>index?index.getX(i+j):i+j),v=ids.map(id=>new THREE.Vector3().fromBufferAttribute(p,id));
    const [a,b,c]=v,area=(b.z-c.z)*(a.x-c.x)+(c.x-b.x)*(a.z-c.z);if(Math.abs(area)<1e-12)continue;
    const minX=clamp(Math.floor((Math.min(...v.map(q=>q.x))+extent)/cell),0,steps),maxX=clamp(Math.ceil((Math.max(...v.map(q=>q.x))+extent)/cell),0,steps);
    const minZ=clamp(Math.floor((Math.min(...v.map(q=>q.z))+extent)/cell),0,steps),maxZ=clamp(Math.ceil((Math.max(...v.map(q=>q.z))+extent)/cell),0,steps);
    for(let z=minZ;z<=maxZ;z++)for(let x=minX;x<=maxX;x++){
      const px=x*cell-extent,pz=z*cell-extent;
      const u=((b.z-c.z)*(px-c.x)+(c.x-b.x)*(pz-c.z))/area,w=((c.z-a.z)*(px-c.x)+(a.x-c.x)*(pz-c.z))/area,t=1-u-w;
      if(u<-.0001||w<-.0001||t<-.0001)continue;
      const k=z*(steps+1)+x;grid[k]=Math.max(grid[k],u*a.y+w*b.y+t*c.y);
    }
  }
  return (x,z)=>{
    const u=(x+extent)/cell,v=(z+extent)/cell,ix=Math.floor(u),iz=Math.floor(v);if(ix<0||iz<0||ix>=steps||iz>=steps)return null;
    let total=0,weight=0;
    for(const [dx,dz,w] of [[0,0,(1-u+ix)*(1-v+iz)],[1,0,(u-ix)*(1-v+iz)],[0,1,(1-u+ix)*(v-iz)],[1,1,(u-ix)*(v-iz)]]){
      const y=grid[(iz+dz)*(steps+1)+ix+dx];if(Number.isFinite(y)){total+=y*w;weight+=w;}
    }
    return weight>.5?total/weight:null;
  };
}

export function fitPatientHat(root,head,reference=null){
  if(!head)return null;
  root.updateWorldMatrix(true,true);
  const parentInverse=root.parent?.matrixWorld.clone().invert()||new THREE.Matrix4();
  const bind=reference||new THREE.Matrix4().multiplyMatrices(parentInverse,head.matrixWorld);
  const canonical=new THREE.Matrix4().multiplyMatrices(bind,head.matrixWorld.clone().invert());
  const points=[],point=new THREE.Vector3();
  root.traverse(mesh=>{
    if(!mesh.isSkinnedMesh||!visible(mesh)||mesh.name.startsWith('Patient_FacialHair'))return;
    const indices=mesh.geometry.attributes.skinIndex,weights=mesh.geometry.attributes.skinWeight;
    const headIndex=mesh.skeleton.bones.indexOf(head);
    if(headIndex<0||!indices||!weights)return;
    const hair=/hair/i.test(mesh.name)||(Array.isArray(mesh.material)?mesh.material:[mesh.material]).some(m=>/hair/i.test(m?.name));
    for(let i=0;i<indices.count;i+=Math.max(1,Math.floor(indices.count/12000))){
      let weight=0;for(let j=0;j<4;j++)if(indices.getComponent(i,j)===headIndex)weight+=weights.getComponent(i,j);
      if(weight<.85)continue;
      mesh.getVertexPosition(i,point);point.applyMatrix4(mesh.matrixWorld).applyMatrix4(canonical);
      const entry=point.clone();entry.hair=hair;points.push(entry);
    }
  });
  if(points.length<20)return null;
  const topY=Math.max(...points.map(p=>p.y)),lowY=Math.min(...points.map(p=>p.y)),span=topY-lowY;
  const upper=points.filter(p=>p.y>topY-span*.34);
  const minX=Math.min(...upper.map(p=>p.x)),maxX=Math.max(...upper.map(p=>p.x));
  const minZ=Math.min(...upper.map(p=>p.z)),maxZ=Math.max(...upper.map(p=>p.z));
  const radiusX=(maxX-minX)/2,radiusZ=(maxZ-minZ)/2;
  if(!(radiusX>0&&radiusZ>0&&span>0))return null;
  const skullTop=Math.max(...points.filter(p=>!p.hair).map(p=>p.y));
  return {topY,skullTop:Number.isFinite(skullTop)?skullTop:topY,lowY,radiusX,radiusZ,radius:Math.max(radiusX,radiusZ),centerX:(minX+maxX)/2,centerZ:(minZ+maxZ)/2,points,bind};
}

function position(object){return object.getWorldPosition(new THREE.Vector3());}
function setWorldQuaternion(bone,quaternion){
  const parent=bone.parent.getWorldQuaternion(new THREE.Quaternion());
  bone.quaternion.copy(parent.invert().multiply(quaternion));bone.updateWorldMatrix(false,true);
}
function aim(bone,child,target){
  const origin=position(bone),a=position(child).sub(origin),b=target.clone().sub(origin);
  if(a.lengthSq()<1e-8||b.lengthSq()<1e-8)return;
  const delta=new THREE.Quaternion().setFromUnitVectors(a.normalize(),b.normalize());
  setWorldQuaternion(bone,delta.multiply(bone.getWorldQuaternion(new THREE.Quaternion())));
}
function solveArm(upper,lower,hand,target,pole){
  const origin=position(upper),elbow=position(lower),wrist=position(hand);
  const a=origin.distanceTo(elbow),b=elbow.distanceTo(wrist),direction=target.clone().sub(origin);
  const distance=clamp(direction.length(),Math.abs(a-b)+.0001,(a+b)*.995);direction.normalize();
  const outward=pole.clone().addScaledVector(direction,-pole.dot(direction)).normalize();
  const cosine=clamp((a*a+distance*distance-b*b)/(2*a*distance),-1,1);
  const desiredElbow=origin.clone().addScaledVector(direction,a*cosine).addScaledVector(outward,a*Math.sqrt(1-cosine*cosine));
  aim(upper,lower,desiredElbow);aim(lower,hand,origin.clone().addScaledVector(direction,distance));
}

export function createHeadwear(root,initialLook={}){
  const bones={};root.traverse(o=>{if(o.isBone)bones[suffix(o.name)]=o;});
  const head=bones.head;
  root.updateWorldMatrix(true,true);
  const reference=head?new THREE.Matrix4().multiplyMatrices(root.parent?.matrixWorld.clone().invert()||new THREE.Matrix4(),head.matrixWorld):null;
  let hat=null,fit=null,lookKey='',look={},attachment=new THREE.Matrix4();
  let lift=0,target=0,running=false,saved=false,fastener=-1;
  const savedPose=[];
  for(const [name,bone] of Object.entries(bones))if(/^(right|left)(arm|forearm|hand)/.test(name))savedPose.push({bone,quaternion:new THREE.Quaternion()});
  let gripError=0,reachError=0;
  const hairUniforms={headwearWorldToHat:{value:new THREE.Matrix4()},headwearHairMask:{value:0}},patchedHair=new Set();
  root.traverse(mesh=>{
    if(!mesh.isMesh||!/hair/i.test(mesh.name)&&!(Array.isArray(mesh.material)?mesh.material:[mesh.material]).some(m=>/hair/i.test(m?.name)))return;
    if(mesh.name.startsWith('Patient_FacialHair'))return;
    for(const material of Array.isArray(mesh.material)?mesh.material:[mesh.material]){
      if(!material||patchedHair.has(material))continue;patchedHair.add(material);
      const previous=material.onBeforeCompile,key=material.customProgramCacheKey;
      material.onBeforeCompile=(shader,renderer)=>{
        previous?.(shader,renderer);Object.assign(shader.uniforms,hairUniforms);
        shader.vertexShader='varying vec3 vHeadwearPosition; uniform mat4 headwearWorldToHat;\n'+shader.vertexShader;
        shader.vertexShader=shader.vertexShader.replace('#include <worldpos_vertex>','#include <worldpos_vertex>\nvHeadwearPosition=(headwearWorldToHat*modelMatrix*vec4(transformed,1.0)).xyz;');
        shader.fragmentShader='varying vec3 vHeadwearPosition; uniform float headwearHairMask;\n'+shader.fragmentShader;
        shader.fragmentShader=shader.fragmentShader.replace('#include <clipping_planes_fragment>','#include <clipping_planes_fragment>\nif(headwearHairMask>.5 && vHeadwearPosition.y>.002 && length(vHeadwearPosition.xz)<.101)discard;');
      };
      material.customProgramCacheKey=()=>`${key?.call(material)||''}-headwear-hair-1`;material.needsUpdate=true;
    }
  });

  function restorePose(){
    if(!saved)return;
    for(const entry of savedPose)entry.bone.quaternion.copy(entry.quaternion);
    saved=false;root.updateWorldMatrix(true,true);
  }
  function updateLook(next={}){
    const style=next.hatStyle||'none';
    const key=JSON.stringify([style,...['hatHand','hatSeed','hatColor','hatBandColor','hatCrownHeight','hatBrimWidth','hatTilt','hatDecoration','hatWear','hairStyle','hairVolume','hairWave','hairBunHeight','hairEarCoverage','hairPartOffset','hairlineHeight','hairlinePeak','hairlineRecession','hairlineAsymmetry','hairThinning','identityVariant','features'].map(k=>next[k])]);
    if(key===lookKey)return;
    restorePose();lookKey=key;look={...next};disposeHeadwear(hat);hat=null;fastener=-1;
    hairUniforms.headwearHairMask.value=0;
    if(!head||style==='none')return;
    fit=fitPatientHat(root,head,reference);if(!fit)return;
    hat=buildHeadwear(next);if(!hat)return;
    const definition=HEADWEAR_STYLES[hat.userData.style],scale=(fit.radiusX+fit.radiusZ)/(2*HAT_DESIGN_RADIUS);
    const size=new THREE.Vector3(fit.radiusX/HAT_DESIGN_RADIUS*1.07,scale,fit.radiusZ/HAT_DESIGN_RADIUS*1.07);
    const height=hat.userData.crownHeight*size.y;
    const lowCap=['cap','peaked'].includes(definition.form);
    // A taller crown must not lower the opening into the brow.
    let bandY=Math.max((lowCap?fit.skullTop+.007*scale:fit.topY)-height*.78,fit.skullTop-fit.radiusZ*.65);
    const rotation=new THREE.Quaternion().setFromEuler(new THREE.Euler((definition.tilt||0)+(Number(next.hatTilt)||0)*.15,0,0));
    const inverse=new THREE.Matrix4().compose(new THREE.Vector3(),rotation,size).invert(),roof=crownRoof(hat.getObjectByName('PatientHat_Crown').geometry);
    const point=new THREE.Vector3();
    // Fit against the actual crown, including its crease and tilt. Low
    // caps clear the scalp and mask only the hair covered by the cap.
    for(let pass=0;pass<3;pass++)for(const p of fit.points){
      if(p.y<fit.topY-(fit.topY-fit.lowY)*.45||lowCap&&p.hair)continue;
      point.set(p.x-fit.centerX,p.y-bandY,p.z-fit.centerZ).applyMatrix4(inverse);
      if(Math.hypot(point.x,point.z)>HAT_DESIGN_RADIUS*.97)continue;
      const ceiling=roof(point.x,point.z);if(ceiling!==null)bandY+=Math.max(0,(point.y-ceiling+.003)/inverse.elements[5]);
    }
    const worn=new THREE.Matrix4().compose(new THREE.Vector3(fit.centerX,bandY,fit.centerZ),rotation,size);
    attachment.copy(reference).invert().multiply(worn);
    root.add(hat);hat.userData.fittedSize=size.toArray();
    hat.userData.fit={radiusX:fit.radiusX,radiusZ:fit.radiusZ,topY:fit.topY,bandY};
  }
  function request(worn){if(!hat)return false;target=worn?0:1;running=Math.abs(target-lift)>.0001;return true;}
  function sample(action,progress){
    running=false;lift=action==='replace'?1-clamp(progress):action==='remove'?clamp(progress):action==='held'?1:0;
    target=lift;update(0);
  }
  function palmFrame(side){
    const hand=bones[`${side}hand`],middle=bones[`${side}handmiddle1`],index=bones[`${side}handindex1`],pinky=bones[`${side}handpinky1`];
    if(!hand||!middle||!index||!pinky)return null;
    const forward=position(middle).sub(position(hand)).normalize();
    const normal=forward.clone().cross(position(index).sub(position(pinky))).normalize().multiplyScalar(side==='left'?1:-1);
    const across=forward.clone().cross(normal).normalize();
    return {forward,normal,across,span:position(hand).distanceTo(position(middle)),quaternion:new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(across,forward,normal))};
  }
  function curlFingers(side,axis,amount){
    for(const finger of ['index','middle','ring','pinky','thumb'])for(let segment=1;segment<=3;segment++){
      const bone=bones[`${side}hand${finger}${segment}`];if(!bone)continue;
      const curl=(finger==='thumb'?.16:[.28,.72,.55][segment-1])*amount;
      const rotation=new THREE.Quaternion().setFromAxisAngle(axis,curl);
      setWorldQuaternion(bone,rotation.multiply(bone.getWorldQuaternion(new THREE.Quaternion())));
    }
  }
  function poseHand(side,contact,forward,normal,weight,grip,rootQuaternion){
    const upper=bones[`${side}arm`],lower=bones[`${side}forearm`],hand=bones[`${side}hand`],palm=palmFrame(side);
    if(!upper||!lower||!hand||!palm||weight<=0)return null;
    const desiredWrist=contact.clone().addScaledVector(forward,-palm.span).addScaledVector(normal,-.007);
    const wrist=position(hand).lerp(desiredWrist,weight);
    const startQuaternion=hand.getWorldQuaternion(new THREE.Quaternion());
    const desiredAcross=forward.clone().cross(normal).normalize();
    const desiredFrame=new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(desiredAcross,forward,normal));
    const handQuaternion=desiredFrame.multiply(palm.quaternion.clone().invert()).multiply(startQuaternion);
    const pole=new THREE.Vector3(side==='right'?-1:1,.1,.3).applyQuaternion(rootQuaternion);
    solveArm(upper,lower,hand,wrist,pole);
    setWorldQuaternion(hand,hand.getWorldQuaternion(new THREE.Quaternion()).slerp(handQuaternion,weight));
    curlFingers(side,desiredAcross,grip*weight);
    const actual=position(hand).addScaledVector(forward,palm.span).addScaledVector(normal,.007);
    reachError=Math.max(reachError,actual.distanceTo(contact));return actual;
  }
  function update(dt,{followHand=false}={}){
    if(!hat||!head)return;
    if(running){
      const direction=target>lift?1:-1;lift=clamp(lift+direction*Math.min(dt,.1)/DURATION);
      if(Math.abs(lift-target)<.0001||(direction>0?lift>=target:lift<=target)){lift=target;running=false;}
    }
    root.updateWorldMatrix(true,true);
    const wornMatrix=new THREE.Matrix4().multiplyMatrices(head.matrixWorld,attachment);
    const wornPosition=new THREE.Vector3(),wornQuaternion=new THREE.Quaternion(),size=new THREE.Vector3();
    wornMatrix.decompose(wornPosition,wornQuaternion,size);
    const rootQuaternion=root.parent?.getWorldQuaternion(new THREE.Quaternion())||new THREE.Quaternion();
    const up=UP.clone().applyQuaternion(rootQuaternion),forward=FORWARD.clone().applyQuaternion(rootQuaternion),right=RIGHT.clone().applyQuaternion(rootQuaternion);
    const handSide=look.hatHand==='right'?'right':'left',mirror=handSide==='right'?1:-1;
    const unit=(size.x+size.y+size.z)/3,gripLocal=new THREE.Vector3(...hat.userData.gripPoints[handSide]).multiply(size);
    const worldPosition=wornPosition.clone(),worldQuaternion=wornQuaternion.clone();
    reachError=0;gripError=0;
    if(lift>0){
      for(const entry of savedPose)entry.quaternion.copy(entry.bone.quaternion);saved=true;
      const hip=bones[`${handSide}upleg`]||bones.hips;
      const heldContact=(hip?position(hip):wornPosition.clone().addScaledVector(up,-.6*unit))
        .addScaledVector(right,.18*unit*mirror).addScaledVector(up,.045*unit).addScaledVector(forward,.16*unit);
      const heldQuaternion=rootQuaternion.clone().multiply(new THREE.Quaternion().setFromAxisAngle(FORWARD,Math.PI/2*mirror));
      const heldPosition=heldContact.clone().sub(gripLocal.clone().applyQuaternion(heldQuaternion));
      const above=wornPosition.clone().addScaledVector(up,.11*unit);
      if(lift<.28){worldPosition.copy(wornPosition);}
      else if(lift<.53){worldPosition.lerpVectors(wornPosition,above,smooth(.28,.53,lift));}
      else{
        const t=smooth(.53,1,lift),a=above.clone().addScaledVector(right,.22*unit*mirror),b=heldPosition.clone().addScaledVector(up,.28*unit);
        worldPosition.copy(above).multiplyScalar((1-t)**3).addScaledVector(a,3*(1-t)**2*t).addScaledVector(b,3*(1-t)*t*t).addScaledVector(heldPosition,t**3);
        worldQuaternion.slerp(heldQuaternion,t);
      }
      const handForward=UP.clone().applyQuaternion(worldQuaternion).normalize();
      const handNormal=new THREE.Vector3(mirror,0,0).applyQuaternion(worldQuaternion).normalize();
      const contact=gripLocal.clone().applyQuaternion(worldQuaternion).add(worldPosition);
      if(hat.userData.fastener==='ties'&&lift<.24){
        const tieContact=wornPosition.clone().addScaledVector(up,-.17*unit).addScaledVector(forward,.08*unit);
        const reach=smooth(0,.08,lift)*(1-smooth(.14,.24,lift));
        poseHand(handSide==='right'?'left':'right',tieContact.clone().addScaledVector(right,-.035*unit*mirror),up,right.clone().multiplyScalar(-mirror),reach,.2,rootQuaternion);
        contact.lerp(tieContact.clone().addScaledVector(right,.035*unit*mirror),1-smooth(.10,.24,lift));
      }
      let actual;
      if(followHand&&lift===1){
        const palm=palmFrame(handSide);
        if(palm){
          const localFrame=new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(new THREE.Vector3(0,0,-mirror),UP,new THREE.Vector3(mirror,0,0)));
          worldQuaternion.copy(palm.quaternion).multiply(localFrame.invert());
          actual=position(bones[`${handSide}hand`]).addScaledVector(palm.forward,palm.span).addScaledVector(palm.normal,.007);
          worldPosition.copy(actual).sub(gripLocal.clone().applyQuaternion(worldQuaternion));
          curlFingers(handSide,palm.across,1);
        }
      }else actual=poseHand(handSide,contact,handForward,handNormal,smooth(0,.20,lift),smooth(.12,.28,lift),rootQuaternion);
      if(actual&&lift>=.28){if(!followHand||lift!==1)worldPosition.add(actual.clone().sub(contact));gripError=actual.distanceTo(gripLocal.clone().applyQuaternion(worldQuaternion).add(worldPosition));}
    }
    const release=hat.userData.fastener==='ties'?smooth(.07,.20,lift):0;
    if(Math.abs(release-fastener)>.001){hat.userData.releaseTies(release);fastener=release;}
    const world=new THREE.Matrix4().compose(worldPosition,worldQuaternion,size);
    const local=new THREE.Matrix4().multiplyMatrices(root.matrixWorld.clone().invert(),world);
    local.decompose(hat.position,hat.quaternion,hat.scale);hat.updateWorldMatrix(false,true);
    hairUniforms.headwearWorldToHat.value.copy(hat.matrixWorld).invert();
    hairUniforms.headwearHairMask.value=['cap','peaked'].includes(HEADWEAR_STYLES[hat.userData.style].form)&&lift<.54?1:0;
  }
  function describe(){return {style:hat?.userData.style||'none',state:lift===0?'worn':lift===1?'held':target===0?'replacing':'removing',progress:lift,
    owner:lift<.28?'head':look.hatHand==='right'?'right-hand':'left-hand',gripError,reachError,fit:hat?.userData.fit||null,position:hat?position(hat).toArray():null};}
  updateLook(initialLook);update(0);
  return {updateLook,request,sample,update,restorePose,describe,get hat(){return hat;},get worn(){return lift===0;},get busy(){return running;},dispose(){restorePose();disposeHeadwear(hat);hat=null;}};
}
