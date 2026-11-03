import * as THREE from 'three';
import {ACCESSORY_DEFAULTS,ACCESSORY_CHOICES,buildSpectacles,buildNeckwear,buildJewelry,disposeAccessories} from './accessoryGeometry.js';
export {ACCESSORY_DEFAULTS,ACCESSORY_CHOICES};

const clamp=(n,a=-1,b=1)=>Math.max(a,Math.min(b,Number(n)||0));
const visible=o=>{for(let p=o;p;p=p.parent)if(!p.visible)return false;return true;};
const suffix=name=>name.toLowerCase().replace(/^mixamorig:?/,'');
const clothNames=new Set(['Patient_DressFabric','Patient_Collar','Patient_SeatedDressFabric','Patient_MaleFabric','Patient_MaleShirt','Patient_MaleCollar','Patient_WorkCotton','Patient_WorkWool']);

export function accessoryVariation(seed=1,cohort='women',range='everyday',outfit=''){
  let state=(Math.imul(Number(seed)||1,0x5bd1e995)^0x527c4e91)>>>0;
  const next=()=>{state^=state<<13;state^=state>>>17;state^=state<<5;return(state>>>0)/4294967296;},pick=a=>a[Math.floor(next()*a.length)];
  const male=cohort==='men',plain=range==='plain',dress=range==='dress',work=/work|apron/.test(outfit);
  return {...ACCESSORY_DEFAULTS,accessorySeed:seed,
    glassesStyle:next()<.29?pick(['round','oval','pince-nez',...(dress?['rimless']:[])]):'none',
    glassesMetal:pick(plain?['steel','black']:['steel','silver','gold']),lensTint:next()<.045?pick(['blue','smoke','green']):'clear',glassesSize:pick([-.3,0,.3]),glassesWeight:plain?.1:pick([-.2,0,.2]),
    neckwearStyle:male?(work?pick(['none','none','kerchief','bow']):pick(['tie','bow','cravat','original'])):'original',
    neckwearColor:pick(['black','wine','navy','forest','cream','ochre','slate']),neckwearPattern:pick(plain?['plain','plain','dot']:['plain','stripe','dot','diamond']),neckwearScale:pick([-.3,0,.3]),neckwearWear:plain?.45:pick([0,.15,.3]),
    broochStyle:!male&&next()<(plain?.22:.7)?pick(dress?['oval','cameo','bar','jet']:['oval','bar']):'none',
    earringStyle:!male&&next()<(plain?.24:.65)?pick(dress?['stud','pearl','drop','jet']:['stud','pearl']):'none',
    locketStyle:!male&&!plain&&next()<.20?pick(['oval','round']):'none',
    jewelryMetal:pick(plain?['brass','steel']:['gold','silver','brass']),jewelryStone:pick(['garnet','amber','turquoise','pearl','jet']),
    tiePin:male&&!work&&next()<(dress?.65:.22)?pick(['plain','pearl','stone']):'none',watchChain:male&&!work&&next()<(dress?.7:.28)?pick(['single',...(dress?['double']:[])]):'none'};
}

function pointsFor(mesh,canonical){
  const matrix=new THREE.Matrix4().multiplyMatrices(canonical,mesh.matrixWorld),p=mesh.geometry.attributes.position,points=[];
  for(let i=0;i<p.count;i++)points.push(mesh.getVertexPosition(i,new THREE.Vector3()).applyMatrix4(matrix));
  return points;
}
function centerOf(mesh,canonical){return new THREE.Box3().setFromPoints(pointsFor(mesh,canonical)).getCenter(new THREE.Vector3());}

// Rasterise the garment's front once per look, not once per frame or fibre.
// Separate ties are excluded; fused ties still support the shirt insert.
function frontField(sources,canonical,y,scale,face=null,originals=false){
  const width=64,height=88,minX=-.23*scale,minY=y-.39*scale,dx=.46*scale/width,dy=.49*scale/height;
  const grid=new Float32Array((width+1)*(height+1)).fill(-Infinity),all=[];
  for(const source of [...sources,...(face?[face]:[])]){
    const points=pointsFor(source,canonical),index=(originals&&source.userData.accessoryOriginalGeometry||source.geometry).index;
    for(let i=0;i<(index?.count||points.length);i+=3){
      const a=points[index?index.getX(i):i],b=points[index?index.getX(i+1):i+1],c=points[index?index.getX(i+2):i+2];
      if(source===face&&Math.max(a.y,b.y,c.y)>y+.025*scale)continue;
      if(Math.max(a.y,b.y,c.y)<minY||Math.min(a.y,b.y,c.y)>minY+height*dy)continue;
      const area=(b.y-c.y)*(a.x-c.x)+(c.x-b.x)*(a.y-c.y);if(Math.abs(area)<1e-10)continue;
      const x0=Math.max(0,Math.floor((Math.min(a.x,b.x,c.x)-minX)/dx)),x1=Math.min(width,Math.ceil((Math.max(a.x,b.x,c.x)-minX)/dx));
      const y0=Math.max(0,Math.floor((Math.min(a.y,b.y,c.y)-minY)/dy)),y1=Math.min(height,Math.ceil((Math.max(a.y,b.y,c.y)-minY)/dy));
      for(let yy=y0;yy<=y1;yy++)for(let xx=x0;xx<=x1;xx++){
        const x=minX+xx*dx,y=minY+yy*dy,u=((b.y-c.y)*(x-c.x)+(c.x-b.x)*(y-c.y))/area,v=((c.y-a.y)*(x-c.x)+(a.x-c.x)*(y-c.y))/area,w=1-u-v;
        if(Math.min(u,v,w)<-.001)continue;const k=yy*(width+1)+xx;grid[k]=Math.max(grid[k],u*a.z+v*b.z+w*c.z);
      }
    }
    for(const i of new Set(index?Array.from(index.array):points.map((_,i)=>i))){const p=points[i];if(p.y>minY&&p.y<minY+height*dy&&Math.abs(p.x)<.23*scale)all.push(p);}
  }
  const raw=grid.slice(),envelope=grid.slice(),smooth=grid.slice();
  for(let yy=0;yy<=height;yy++)for(let xx=0;xx<=width;xx++)for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
    const x=xx+dx,y=yy+dy;if(x>=0&&x<=width&&y>=0&&y<=height)envelope[yy*(width+1)+xx]=Math.max(envelope[yy*(width+1)+xx],raw[y*(width+1)+x]);
  }
  for(let yy=0;yy<=height;yy++)for(let xx=0;xx<=width;xx++){
    let value=0,weight=0;for(let dy=-2;dy<=2;dy++)for(let dx=-2;dx<=2;dx++){
      const x=xx+dx,y=yy+dy;if(x<0||x>width||y<0||y>height)continue;const z=envelope[y*(width+1)+x],w=Math.exp(-(dx*dx+dy*dy)/3);
      if(Number.isFinite(z)){value+=z*w;weight+=w;}
    }if(weight)smooth[yy*(width+1)+xx]=Math.max(raw[yy*(width+1)+xx],value/weight);
  }
  grid.set(smooth);
  const front=(x,y)=>{
    const xx=Math.max(0,Math.min(width-1,(x-minX)/dx)),yy=Math.max(0,Math.min(height-1,(y-minY)/dy)),ix=Math.floor(xx),iy=Math.floor(yy);
    let z=0,sum=0;for(const [a,b,w]of [[0,0,(1-xx+ix)*(1-yy+iy)],[1,0,(xx-ix)*(1-yy+iy)],[0,1,(1-xx+ix)*(yy-iy)],[1,1,(xx-ix)*(yy-iy)]]){const value=grid[(iy+b)*(width+1)+ix+a];if(Number.isFinite(value)){z+=value*w;sum+=w;}}
    if(sum>.3)return z/sum;
    let distance=Infinity,best=.06*scale;for(const p of all){const d=(p.x-x)**2+(p.y-y)**2;if(d<distance){distance=d;best=p.z;}}return best;
  };
  front.max=(x,y,rx,ry)=>{
    let highest=-Infinity;
    for(let yy=Math.max(0,Math.floor((y-ry-minY)/dy));yy<=Math.min(height,Math.ceil((y+ry-minY)/dy));yy++)for(let xx=Math.max(0,Math.floor((x-rx-minX)/dx));xx<=Math.min(width,Math.ceil((x+rx-minX)/dx));xx++)highest=Math.max(highest,raw[yy*(width+1)+xx]);
    return Number.isFinite(highest)?highest:front(x,y);
  };
  return front;
}

function splitNativeTie(source,canonical,fit){
  if(source.userData.accessoryOriginalGeometry||source.material?.name!=='Patient_MaleFabric')return null;
  for(let parent=source;parent;parent=parent.parent)if(parent.userData.garmentStyle)return null;
  const points=pointsFor(source,canonical),original=source.geometry,index=original.index,kept=[],tie=[],s=fit.scale;
  const parent=points.map((_,i)=>i),find=i=>parent[i]===i?i:parent[i]=find(parent[i]),byPosition=new Map();
  for(let i=0;i<index.count;i+=3){parent[find(index.getX(i+1))]=find(index.getX(i));parent[find(index.getX(i+2))]=find(index.getX(i));}
  points.forEach((p,i)=>{const key=p.toArray().map(v=>Math.round(v/.0002)).join('/');if(byPosition.has(key))parent[find(i)]=find(byPosition.get(key));else byPosition.set(key,i);});
  const components=new Map();points.forEach((p,i)=>{const key=find(i);if(!components.has(key))components.set(key,new THREE.Box3());components.get(key).expandByPoint(p);});
  const wholeTie=new Set([...components].filter(([,b])=>b.max.y>fit.knotY-.025*s&&b.max.y<fit.knotY+.025*s&&b.min.y>fit.knotY-.21*s&&b.max.y-b.min.y>.07*s&&Math.max(Math.abs(b.min.x),Math.abs(b.max.x))<.095*s&&b.max.z>fit.front(0,fit.knotY-.05*s)-.02*s).map(([id])=>id));
  for(let i=0;i<(index?.count||points.length);i+=3){
    const ids=[0,1,2].map(j=>index?index.getX(i+j):i+j),p=ids.reduce((p,id)=>p.add(points[id]),new THREE.Vector3()).multiplyScalar(1/3),t=(fit.knotY-p.y)/(.14*s);
    const half=(t<.08?.026:(.012+.009*Math.sin(Math.max(0,t)*Math.PI))*(t>.78?Math.max(0,(1-t)/.22):1))*s;
    const remove=wholeTie.size?wholeTie.has(find(ids[0])):t>-.11&&t<1.04&&Math.abs(p.x+.003*s)<half&&p.z>fit.front(p.x,p.y)-.012*s;
    (remove?tie:kept).push(...ids);
  }
  if(!tie.length)return null;
  const native=source.clone();native.name='Accessory_NativeTie';native.geometry=original.clone();native.geometry.setIndex(tie);native.morphTargetInfluences=source.morphTargetInfluences;
  source.geometry=original.clone();source.geometry.setIndex(kept);source.userData.accessoryOriginalGeometry=original;source.parent.add(native);
  return {source,native,original,exact:wholeTie.size>0};
}

export function createPeriodAccessories(root,{cohort='women',frame=null}={}){
  const bones={};root.traverse(o=>{if(o.isBone)bones[suffix(o.name)]=o;});
  const eyeLeft=root.getObjectByName('Carmela_Eye_Left'),eyeRight=root.getObjectByName('Carmela_Eye_Right'),face=root.getObjectByName('Carmela_Face');
  const head=bones.head,chest=bones.spine2||bones.neck,available=Boolean(head&&chest&&frame&&eyeLeft&&eyeRight&&face);
  if(!available)return {available:false,updateLook(){},update(){},describe:()=>({available:false}),dispose(){}};
  root.updateWorldMatrix(true,true);
  const rootInverse=root.matrixWorld.clone().invert(),headRef=new THREE.Matrix4().multiplyMatrices(rootInverse,head.matrixWorld),chestRef=new THREE.Matrix4().multiplyMatrices(rootInverse,chest.matrixWorld);
  const bindMatrix=root.matrixWorld.clone(),bindFrom=bindMatrix.clone().invert(),allBones=Object.values(bones),boneIds=new Map(allBones.map((bone,i)=>[bone,i]));
  const boneInverses=allBones.map(bone=>bone.matrixWorld.clone().invert());let clothSkeleton=null;
  const headFrom=headRef.clone().invert(),chestFrom=chestRef.clone().invert();
  const headGroup=new THREE.Group(),bodyGroup=new THREE.Group();headGroup.name='Patient_HeadAccessories';bodyGroup.name='Patient_BodyAccessories';headGroup.matrixAutoUpdate=bodyGroup.matrixAutoUpdate=false;root.add(headGroup,bodyGroup);
  const clothGroup=new THREE.Group();clothGroup.name='Patient_FittedNeckwear';root.add(clothGroup);
  let key='',look={...ACCESSORY_DEFAULTS},fit=null,parts=[],partitions=[],triangles=0;
  function canonical(bone,ref){return new THREE.Matrix4().multiplyMatrices(ref,bone.matrixWorld.clone().invert());}
  function measure(){
    root.updateWorldMatrix(true,true);const hc=canonical(head,headRef),bc=canonical(chest,chestRef),s=frame.scale;
    const left=centerOf(eyeLeft,hc),right=centerOf(eyeRight,hc),eyeY=(left.y+right.y)/2,eyeX=Math.abs(left.x-right.x)/2,skin=pointsFor(face,hc);
    const ears=[];for(const sign of [-1,1]){
      const region=skin.filter(p=>p.x*sign>eyeX*1.7&&p.y<eyeY+.012*s&&p.y>eyeY-.055*s&&p.z<left.z-.010*s&&p.z>left.z-.12*s);
      const outer=region.length?Math.max(...region.map(p=>Math.abs(p.x))):eyeX*2.35;
      const target=new THREE.Vector3(sign*(outer-.002*s),eyeY-.034*s,left.z-.052*s);
      let best=target,d=Infinity;for(const p of region){const distance=(p.x-target.x)**2+(p.y-target.y)**2*.65+(p.z-target.z)**2;if(distance<d){d=distance;best=p;}}ears.push(best.clone());
    }
    const bridge=skin.filter(p=>Math.abs(p.x)<.005*s&&Math.abs(p.y-eyeY-.009*s)<.004*s);
    const eyeFront=Math.max(...pointsFor(eyeLeft,hc).map(p=>p.z),...pointsFor(eyeRight,hc).map(p=>p.z));
    const bridgeZ=Math.max(bridge.length?Math.max(...bridge.map(p=>p.z)):eyeFront,eyeFront+.008*s);
    const templeAt=(sign,y,z)=>{
      const near=skin.filter(p=>p.x*sign>eyeX*1.25).map(p=>({p,d:(p.y-y)**2*3+(p.z-z)**2})).sort((a,b)=>a.d-b.d).slice(0,6);
      return near.length?near.reduce((sum,q)=>sum+q.p.x*sign,0)/near.length+.0012*s:Math.abs(ears[sign===1?1:0].x)+.0012*s;
    };
    const openCollar=Boolean(root.getObjectByName('Patient_WorkerBody'));
    const knotY=frame.mouthY-(cohort==='men'?(openCollar?.092:.060):.080)*s,sources=[];
    root.traverse(mesh=>{if(mesh.isSkinnedMesh&&visible(mesh)&&!mesh.name.startsWith('Accessory_')&&clothNames.has(mesh.material?.name))sources.push(mesh);});
    const front=frontField(sources,bc,knotY,s,face,partitions.some(p=>!p.exact));
    const neckFront=look.neckwearStyle==='kerchief'?frontField([face],bc,knotY,s):null;
    return {scale:s,eyeY,eyeX,eyeFrontZ:eyeFront,bridgeZ,ears,templeAt,knotY,front,neckFront,sources,bodyCanonical:bc};
  }
  function clear(){for(const part of parts)disposeAccessories(part);parts=[];triangles=0;}
  // Fit once, then let the existing bones deform the cloth on the GPU.
  // Undo the current pose so changing accessories mid-animation adds no bend.
  function skinNeckwear(group){
    if(!group)return;clothSkeleton??=new THREE.Skeleton(allBones,boneInverses);
    const pool=[],sources=[...fit.sources,...(look.neckwearStyle==='kerchief'?[face]:[])];
    for(const source of sources){
      const points=pointsFor(source,fit.bodyCanonical),indices=source.geometry.attributes.skinIndex,weights=source.geometry.attributes.skinWeight;if(!indices||!weights)continue;
      for(let i=0;i<points.length;i+=2){
        const p=points[i];if(Math.abs(p.x)>.14*fit.scale||p.y>fit.knotY+.04*fit.scale||p.y<fit.knotY-.26*fit.scale)continue;
        if(source===face&&p.y<fit.knotY-.025*fit.scale)continue;
        pool.push({p,indices:[0,1,2,3].map(j=>boneIds.get(source.skeleton.bones[indices.getComponent(i,j)])),weights:[0,1,2,3].map(j=>weights.getComponent(i,j))});
      }
    }
    const toWorld=fit.bodyCanonical.clone().invert(),blend=new THREE.Matrix4(),boneMatrix=new THREE.Matrix4(),point=new THREE.Vector3(),normal=new THREE.Vector3();
    for(const mesh of [...group.children]){
      const position=mesh.geometry.attributes.position,skinIndices=[],skinWeights=[];
      for(let i=0;i<position.count;i++){
        point.fromBufferAttribute(position,i);const nearest=[];
        for(const candidate of pool){const d=point.distanceToSquared(candidate.p);if(nearest.length<4||d<nearest.at(-1).d){nearest.push({candidate,d});nearest.sort((a,b)=>a.d-b.d);if(nearest.length>4)nearest.pop();}}
        const support=new Map();for(const {candidate,d}of nearest)for(let j=0;j<4;j++)if(candidate.weights[j])support.set(candidate.indices[j],(support.get(candidate.indices[j])||0)+candidate.weights[j]/(d+.000004));
        const influences=[...support].sort((a,b)=>b[1]-a[1]).slice(0,4);if(!influences.length)influences.push([boneIds.get(chest),1]);while(influences.length<4)influences.push([0,0]);
        const total=influences.reduce((sum,[,w])=>sum+w,0),ids=influences.map(([id])=>id),weights=influences.map(([,w])=>w/total);skinIndices.push(...ids);skinWeights.push(...weights);
        blend.elements.fill(0);for(let j=0;j<4;j++){if(!weights[j])continue;boneMatrix.multiplyMatrices(allBones[ids[j]].matrixWorld,boneInverses[ids[j]]);for(let k=0;k<16;k++)blend.elements[k]+=boneMatrix.elements[k]*weights[j];}
        blend.invert();point.applyMatrix4(toWorld).applyMatrix4(blend).applyMatrix4(bindFrom);position.setXYZ(i,point.x,point.y,point.z);
        normal.fromBufferAttribute(mesh.geometry.attributes.normal,i).transformDirection(toWorld).transformDirection(blend).transformDirection(bindFrom);mesh.geometry.attributes.normal.setXYZ(i,normal.x,normal.y,normal.z);
      }
      mesh.geometry.setAttribute('skinIndex',new THREE.Uint16BufferAttribute(skinIndices,4));mesh.geometry.setAttribute('skinWeight',new THREE.Float32BufferAttribute(skinWeights,4));
      const skinned=new THREE.SkinnedMesh(mesh.geometry,mesh.material);skinned.name=mesh.name;skinned.castShadow=mesh.castShadow;skinned.frustumCulled=false;skinned.bind(clothSkeleton,bindMatrix);mesh.removeFromParent();group.add(skinned);
    }
  }
  function updateLook(next={}){
    const cleaned={...ACCESSORY_DEFAULTS};for(const name of Object.keys(cleaned))if(next[name]!==undefined&&next[name]!==null)cleaned[name]=next[name];
    for(const [name,choices]of Object.entries(ACCESSORY_CHOICES))if(!(cleaned[name] in choices))cleaned[name]=ACCESSORY_DEFAULTS[name];
    for(const name of ['glassesSize','glassesBridge','glassesHeight','glassesDepth','glassesWeight','neckwearScale'])cleaned[name]=clamp(cleaned[name]);cleaned.neckwearWear=clamp(cleaned.neckwearWear,0,1);
    const nextKey=JSON.stringify([cleaned,next.identityVariant,next.features,next.bellySize,next.waistWidth,next.outfit]);if(nextKey===key)return;key=nextKey;look=cleaned;clear();
    if(!partitions.length&&look.neckwearStyle==='original'&&['glassesStyle','broochStyle','earringStyle','locketStyle','tiePin','watchChain'].every(k=>look[k]==='none')){fit=null;update();return;}
    fit=measure();
    const formal=root.getObjectByName('Patient_FormalUpper');
    if(formal&&visible(formal)&&look.neckwearStyle!=='original')formal.traverse(source=>{if(source.isSkinnedMesh&&!source.name.startsWith('Accessory_')){const split=splitNativeTie(source,fit.bodyCanonical,fit);if(split)partitions.push(split);}});
    if(partitions.length)fit=measure();
    const backing=partitions.length&&look.neckwearStyle!=='original'&&visible(formal)?(partitions.every(p=>p.exact)?'short':'long'):null;
    const glasses=buildSpectacles(fit,look),neckwear=buildNeckwear(fit,look,backing);
    skinNeckwear(neckwear);
    const jewelry=buildJewelry(fit,look);
    for(const [part,parent]of [[glasses,headGroup],[neckwear,clothGroup],[jewelry.head,headGroup],[jewelry.body,bodyGroup]])if(part){parent.add(part);parts.push(part);part.traverse(o=>{if(o.isMesh)triangles+=(o.geometry.index?.count||o.geometry.attributes.position.count)/3;});}
    update();
  }
  function update(){
    if(!parts.length&&!partitions.length)return;
    root.updateWorldMatrix(true,true);rootInverse.copy(root.matrixWorld).invert();
    headGroup.matrix.copy(rootInverse).multiply(head.matrixWorld).multiply(headFrom);
    bodyGroup.matrix.copy(rootInverse).multiply(chest.matrixWorld).multiply(chestFrom);
    headGroup.updateWorldMatrix(false,true);bodyGroup.updateWorldMatrix(false,true);
    for(const {native,source}of partitions){native.visible=look.neckwearStyle==='original'&&visible(source);native.morphTargetInfluences=source.morphTargetInfluences;}
  }
  function describe(){return {available:true,...look,triangles,drawCalls:parts.reduce((n,p)=>n+p.children.length,0),nativeTieSeparated:partitions.length>0,nativeTieModes:partitions.map(p=>p.exact?'component':'region'),fit:fit?{eyeY:fit.eyeY,eyeX:fit.eyeX,bridgeZ:fit.bridgeZ,knotY:fit.knotY,ears:fit.ears.map(p=>p.toArray())}:null};}
  return {available,updateLook,update,describe,groups:[headGroup,bodyGroup],dispose(){clear();for(const {source,native,original}of partitions){source.geometry.dispose();source.geometry=original;delete source.userData.accessoryOriginalGeometry;native.geometry.dispose();native.removeFromParent();}clothSkeleton?.dispose();clothGroup.removeFromParent();headGroup.removeFromParent();bodyGroup.removeFromParent();}};
}
