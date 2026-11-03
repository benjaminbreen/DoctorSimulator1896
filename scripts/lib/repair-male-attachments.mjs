import * as THREE from 'three';
import {Octree} from 'three/addons/math/Octree.js';
import {readPostureSkeleton} from './relax-standing-posture.mjs';

function meshMatrix(node,objects){
  const skin=node.getSkin();
  return skin?new THREE.Matrix4().multiplyMatrices(objects.get(skin.listJoints()[0]).matrixWorld,new THREE.Matrix4().fromArray(skin.getInverseBindMatrices().getElement(0,[]))):new THREE.Matrix4().fromArray(node.getWorldMatrix());
}
function meshPoints(node,objects){
  const matrix=meshMatrix(node,objects);
  return node.getMesh().listPrimitives().flatMap(p=>Array.from({length:p.getAttribute('POSITION').getCount()},(_,i)=>new THREE.Vector3().fromArray(p.getAttribute('POSITION').getElement(i,[])).applyMatrix4(matrix)));
}
const centre=points=>points.reduce((sum,p)=>sum.add(p),new THREE.Vector3()).multiplyScalar(1/points.length);
const smooth=THREE.MathUtils.smoothstep;

export function maleAttachmentFrame(document){
  const {objects,bones}=readPostureSkeleton(document),nodes=document.getRoot().listNodes();
  const face=nodes.find(n=>n.getName()==='Carmela_Face');if(!face)return null;
  const eyes=['Left','Right'].map(side=>centre(meshPoints(nodes.find(n=>n.getName()==='Carmela_Eye_'+side),objects)));
  const eye=eyes[0].clone().add(eyes[1]).multiplyScalar(.5),scale=eyes[0].distanceTo(eyes[1])/.064;
  const mouth=centre(meshPoints(nodes.find(n=>n.getName()==='Carmela_Lips'),objects));
  const points=meshPoints(face,objects),ears={};
  for(const sign of [-1,1]){
    const candidates=points.filter(p=>(p.x-eye.x)*sign>.05*scale&&p.y>eye.y-.085*scale&&p.y<eye.y+.020*scale&&p.z>eye.z-.11*scale&&p.z<eye.z-.018*scale);
    const outer=Math.max(...candidates.map(p=>(p.x-eye.x)*sign));
    const ear=candidates.filter(p=>(p.x-eye.x)*sign>outer*.80);
    const rim=candidates.filter(p=>(p.x-eye.x)*sign>outer*.91);
    ears[sign]={front:Math.max(...ear.map(p=>p.z)),upperFront:Math.max(...rim.map(p=>p.z)),top:Math.max(...rim.map(p=>p.y)),bottom:Math.min(...ear.map(p=>p.y)),outer,points:ear};
  }
  const neck=bones.neck.getWorldPosition(new THREE.Vector3()),collar=[];
  for(const node of nodes){
    if(!node.getSkin()||!node.getMesh()||(node.getName().startsWith('Patient_Work')&&node.getName()!=='Patient_WorkerBody'))continue;
    const matrix=meshMatrix(node,objects);
    for(const primitive of node.getMesh().listPrimitives()){
      if(!['Patient_MaleShirt','Patient_MaleCollar','Patient_Collar','Patient_WorkCotton'].includes(primitive.getMaterial()?.getName()))continue;
      const positions=primitive.getAttribute('POSITION');
      for(let i=0;i<positions.getCount();i++){
        const p=new THREE.Vector3().fromArray(positions.getElement(i,[])).applyMatrix4(matrix);
        if(Math.abs(p.x-neck.x)<.10*scale&&Math.abs(p.y-neck.y)<.085*scale&&Math.abs(p.z-neck.z)<.13*scale)collar.push(p);
      }
    }
  }
  const back=collar.filter(p=>Math.abs(p.x-neck.x)<.028*scale&&p.z<neck.z-.02*scale);
  const top=back.length?Math.max(...back.map(p=>p.y)):neck.y+.025*scale;
  const rim=back.filter(p=>p.y>top-.015*scale);
  const radiusZ=THREE.MathUtils.clamp(rim.length?neck.z-Math.max(...rim.map(p=>p.z))-.003*scale:.048*scale,.038*scale,.065*scale);
  return {objects,bones,face,points,eye,mouth,scale,ears,neck,collarTop:top,radiusX:.055*scale,radiusZ};
}

function fitNape(point,frame,clearance=0){
  const {neck,scale,ears,collarTop,radiusX,radiusZ}=frame,p=point.clone();
  const ear=ears[p.x>frame.eye.x?1:-1];
  const protect=smooth(Math.abs(p.x-frame.eye.x),ear.outer*.70,ear.outer*.80)
    *smooth(p.y,ear.bottom-.012*scale,ear.bottom-.002*scale)*(1-smooth(p.y,ear.top+.002*scale,ear.top+.012*scale))
    *smooth(p.z,ear.front-.065*scale,ear.front-.050*scale)*(1-smooth(p.z,ear.front+.006*scale,ear.front+.016*scale));
  const high=Math.max(collarTop+.055*scale,Math.min(ears[-1].bottom,ears[1].bottom)+.065*scale);
  const vertical=1-smooth(p.y,collarTop+.008*scale,high);
  const back=1-smooth(p.z-neck.z,-.018*scale,.018*scale),weight=vertical*back*(1-protect);
  const x=p.x-neck.x,z=p.z-neck.z,radius=Math.hypot(x/(radiusX+clearance),z/(radiusZ+clearance));
  if(radius>1&&weight>0){p.x=THREE.MathUtils.lerp(p.x,neck.x+x/radius,weight);p.z=THREE.MathUtils.lerp(p.z,neck.z+z/radius,weight);}
  return p;
}

function fitNormals(primitive,original,fitted,matrix){
  const source=primitive.getAttribute('NORMAL');if(!source)return;
  const sums=new Map(),keys=fitted.map(p=>p.toArray().map(n=>n.toFixed(6)).join(',')),indices=primitive.getIndices();
  const into=new THREE.Matrix3().getNormalMatrix(matrix),out=new THREE.Matrix3().getNormalMatrix(matrix.clone().invert());
  for(let i=0;i<indices.getCount();i+=3){
    const ids=[0,1,2].map(k=>indices.getScalar(i+k)),[a,b,c]=ids.map(id=>fitted[id]);
    const normal=b.clone().sub(a).cross(c.clone().sub(a)),reference=new THREE.Vector3().fromArray(source.getElement(ids[0],[])).applyMatrix3(into);
    if(normal.dot(reference)<0)normal.negate();
    for(const id of ids){if(!sums.has(keys[id]))sums.set(keys[id],new THREE.Vector3());sums.get(keys[id]).add(normal);}
  }
  const updated=source.clone().setArray(source.getArray().slice());
  for(let i=0;i<fitted.length;i++){
    const amount=THREE.MathUtils.clamp(original[i].distanceTo(fitted[i])/.004,0,1);if(!amount)continue;
    const normal=new THREE.Vector3().fromArray(source.getElement(i,[])).applyMatrix3(into).normalize();
    normal.lerp(sums.get(keys[i]).clone().normalize(),amount).applyMatrix3(out).normalize();updated.setElement(i,normal.toArray());
  }
  primitive.setAttribute('NORMAL',updated);
}

export function repairMaleNape(document){
  if(!document.getRoot().listNodes().some(n=>n.getName().startsWith('Patient_FacialHair_')))return [];
  const frame=maleAttachmentFrame(document);if(!frame)return [];
  const reports=[];
  for(const node of document.getRoot().listNodes()){
    const hair=node.getName().startsWith('Carmela_HairStyle_');
    if((node!==frame.face&&!hair)||node.getExtras().napeFitVersion===1)continue;
    const matrix=meshMatrix(node,frame.objects),inverse=matrix.clone().invert(),linear=new THREE.Matrix3().setFromMatrix4(matrix),inverseLinear=linear.clone().invert();let changed=0;
    for(const primitive of node.getMesh().listPrimitives()){
      const positions=primitive.getAttribute('POSITION'),updated=positions.clone().setArray(positions.getArray().slice());
      const original=[],fitted=[];
      for(let i=0;i<positions.getCount();i++){
        const p=new THREE.Vector3().fromArray(positions.getElement(i,[])).applyMatrix4(matrix),q=fitNape(p,frame,hair?.0015*frame.scale:0);
        original.push(p);fitted.push(q);if(p.distanceToSquared(q)>1e-10)changed++;
        updated.setElement(i,q.clone().applyMatrix4(inverse).toArray());
      }
      primitive.setAttribute('POSITION',updated);
      fitNormals(primitive,original,fitted,matrix);
      for(const target of primitive.listTargets()){
        const deltas=target.getAttribute('POSITION');if(!deltas)continue;
        const output=deltas.clone().setArray(deltas.getArray().slice());
        for(let i=0;i<positions.getCount();i++){
          const delta=new THREE.Vector3().fromArray(deltas.getElement(i,[])).applyMatrix3(linear);
          const q=fitNape(original[i].clone().add(delta),frame,hair?.0015*frame.scale:0).sub(fitted[i]).applyMatrix3(inverseLinear);
          output.setElement(i,q.toArray());
        }
        target.setAttribute('POSITION',output);
      }
    }
    node.setExtras({...node.getExtras(),napeFitVersion:1});reports.push({node:node.getName(),changedVertices:changed,collarTop:frame.collarTop,radiusZ:frame.radiusZ});
  }
  return reports;
}

export async function repairMaleSideburns(document){
  const nodes=document.getRoot().listNodes().filter(n=>/^Patient_FacialHair_(short_sideburns|long_sideburns|mutton_chops)$/.test(n.getName())&&n.getExtras().sideburnFitVersion!==2);
  if(!nodes.length)return [];
  const frame=maleAttachmentFrame(document),face=frame.face.getMesh().listPrimitives()[0],faceMatrix=meshMatrix(frame.face,frame.objects),faceLinear=new THREE.Matrix3().setFromMatrix4(faceMatrix);
  const faceNormal=new THREE.Matrix3().getNormalMatrix(faceMatrix),points=frame.points,index=face.getIndices(),normals=face.getAttribute('NORMAL'),tree=new Octree(),triangles=new Map();
  for(let i=0;i<index.getCount();i+=3){
    const ids=[0,1,2].map(k=>index.getScalar(i+k)),triangle=new THREE.Triangle(...ids.map(id=>points[id]));
    tree.addTriangle(triangle);triangles.set(triangle,ids);
  }
  const material=document.getRoot().listMaterials().find(m=>m.getName()==='Carmela_DarkHair').clone().setName('Patient_FacialHair').setAlphaMode('MASK').setAlphaCutoff(.20).setDoubleSided(true);
  tree.build();const buffer=document.getRoot().listBuffers()[0],reports=[];
  const accessor=(name,type,values,ArrayType=Float32Array)=>document.createAccessor(name).setType(type).setArray(new ArrayType(values)).setBuffer(buffer);
  const deltas=new Map(face.listTargets().map(target=>[target.getName(),Array.from({length:points.length},(_,i)=>new THREE.Vector3().fromArray(target.getAttribute('POSITION')?.getElement(i,[])||[0,0,0]).applyMatrix3(faceLinear))]));
  for(const node of nodes){
    const style=node.getName().replace('Patient_FacialHair_',''),mesh=node.getMesh(),rows=32,columns=16,fields=[];
    let random=1896;const next=()=>{random^=random<<13;random^=random>>>17;random^=random<<5;return(random>>>0)/4294967296;};
    for(const sign of [-1,1]){
      const ear=frame.ears[sign],top=ear.top+.024*frame.scale;
      const bottom=style==='short_sideburns'?(ear.top+ear.bottom)/2+.003*frame.scale:style==='long_sideburns'?ear.bottom-.008*frame.scale:frame.mouth.y-.012*frame.scale;
      const field=[];
      for(let row=0;row<=rows;row++)for(let col=0;col<=columns;col++){
        const t=row/rows,u=col/columns,y=THREE.MathUtils.lerp(top,bottom,t),fan=smooth(y,ear.top+.002*frame.scale,ear.top+.018*frame.scale);
        const width=((style==='mutton_chops'?.022+.035*smooth(t,.1,1):.020+.006*Math.sin(Math.PI*t)-.002*t)+.025*fan)*frame.scale;
        // Fan into the scalp above the ear; keep the lower rear edge in
        // front of the auricle so the patch cannot sit on the ear itself.
        const level=THREE.MathUtils.clamp((ear.top-y)/(ear.top-ear.bottom),0,1),front=THREE.MathUtils.lerp(ear.upperFront,ear.front,smooth(level,0,1));
        const z=front+(.003+.002*t-.025*fan+(style==='mutton_chops'?.030*t*t:0))*frame.scale+u*width;
        const ray=new THREE.Ray(new THREE.Vector3(frame.eye.x+sign*.25*frame.scale,y,z),new THREE.Vector3(-sign,0,0));
        let hit=tree.rayIntersect(ray);
        if(!hit){
          const target=new THREE.Vector3(frame.eye.x+sign*ear.outer*.78,y,z);let distance=Infinity;
          for(const triangle of triangles.keys()){
            if(Math.max(triangle.a.y,triangle.b.y,triangle.c.y)<y-.025*frame.scale||Math.min(triangle.a.y,triangle.b.y,triangle.c.y)>y+.025*frame.scale)continue;
            const point=triangle.closestPointToPoint(target,new THREE.Vector3());if((point.x-frame.eye.x)*sign<.025*frame.scale)continue;
            const d=point.distanceToSquared(target);if(d<distance){distance=d;hit={position:point,triangle};}
          }
        }
        if(!hit)throw Error(`${node.getName()}: sideburn field misses the temple at ${t}, ${u}`);
        const ids=triangles.get(hit.triangle),bary=hit.triangle.getBarycoord(hit.position,new THREE.Vector3()).toArray();
        const normal=normals?ids.reduce((sum,id,k)=>sum.addScaledVector(new THREE.Vector3().fromArray(normals.getElement(id,[])).applyMatrix3(faceNormal),bary[k]),new THREE.Vector3()).normalize():hit.triangle.getNormal(new THREE.Vector3());
        if(normal.x*sign<0)normal.negate();
        field.push({point:hit.position.clone().addScaledVector(normal,(style==='mutton_chops'?.0035:.00035)*frame.scale),normal,weights:ids.map((id,k)=>[id,bary[k]])});
      }
      fields.push(field);
    }
    function sample(side,t,u){
      t=THREE.MathUtils.clamp(t,0,.99999);u=THREE.MathUtils.clamp(u,0,.99999);
      const y=t*rows,x=u*columns,row=Math.floor(y),col=Math.floor(x),fy=y-row,fx=x-col,a=row*(columns+1)+col;
      const corners=[[a,(1-fy)*(1-fx)],[a+1,(1-fy)*fx],[a+columns+1,fy*(1-fx)],[a+columns+2,fy*fx]],weights=new Map(),point=new THREE.Vector3(),normal=new THREE.Vector3();
      for(const [i,w]of corners){const f=fields[side][i];point.addScaledVector(f.point,w);normal.addScaledVector(f.normal,w);for(const [id,b]of f.weights)weights.set(id,(weights.get(id)||0)+w*b);}
      return {point,normal:normal.normalize(),weights:[...weights]};
    }
    const positions=[],vertexNormals=[],uvs=[],colors=[],indices=[],sources=[],matrix=meshMatrix(node,frame.objects),inverse=matrix.clone().invert(),normalInverse=new THREE.Matrix3().getNormalMatrix(inverse),inverseLinear=new THREE.Matrix3().setFromMatrix4(inverse);
    for(let side=0;side<2;side++){
      const start=positions.length/3;
      for(let row=0;row<=rows;row++)for(let col=0;col<=columns;col++){
        const t=row/rows,u=col/columns,f=fields[side][row*(columns+1)+col];
        positions.push(...f.point.clone().applyMatrix4(inverse).toArray());vertexNormals.push(...f.normal.clone().applyMatrix3(normalInverse).normalize().toArray());
        uvs.push(u*.20+t*.08,(1-t)*.4);sources.push(f.weights);
        const corner=(2*u-1)**2;
        colors.push(1,1,1,smooth(Math.min(u,1-u),0,.12)*(1-smooth(t,.90-.06*corner,1-.04*corner))*(.85+.15*next()));
      }
      for(let row=0;row<rows;row++)for(let col=0;col<columns;col++){const a=start+row*(columns+1)+col;indices.push(...(side===0?[a,a+columns+2,a+1,a,a+columns+1,a+columns+2]:[a,a+1,a+columns+2,a,a+columns+2,a+columns+1]));}
    }
    for(let side=0;side<2;side++)for(let row=0;row<24;row++)for(let col=0;col<24;col++){
      const t=(row+next())/24,u=(col+next())/24;
      if(next()>Math.sin(Math.PI*u)**.45*(1-.25*t*t))continue;
      const start=positions.length/3,length=Math.min((.10+.11*next()),(1-t)*(.70+.25*next())),width=(.00020+.00028*next())*frame.scale;
      const textureU=next(),textureV=next(),du=width/(.10*frame.scale),dv=sample(side,t+length,u).point.distanceTo(sample(side,t,u).point)/(.15*frame.scale);
      for(let step=0;step<5;step++){
        const f=step/4,ft=t+f*length,fu=u+f*.025,s=sample(side,ft,fu),across=sample(side,ft,fu+.005).point.sub(sample(side,ft,fu-.005).point).normalize();
        const point=s.point.clone().addScaledVector(s.normal,(.0002+.0004*Math.sin(Math.PI*f))*frame.scale),normal=s.normal.clone().applyMatrix3(normalInverse).normalize();
        for(const sign of [-1,1]){
          positions.push(...point.clone().addScaledVector(across,sign*width/2*(1-f)**.6).applyMatrix4(inverse).toArray());
          vertexNormals.push(...normal.toArray());uvs.push(textureU+sign*du/2,textureV+f*dv);colors.push(1,1,1,1);sources.push(s.weights);
        }
      }
      for(let step=0;step<4;step++){const a=start+step*2;indices.push(...(side===0?[a,a+3,a+1,a,a+2,a+3]:[a,a+1,a+3,a,a+3,a+2]));}
    }
    const skin=node.getSkin(),head=skin.listJoints().findIndex(j=>/Head$/.test(j.getName())),count=positions.length/3;
    const primitive=document.createPrimitive().setMaterial(material).setIndices(accessor(style+' triangles','SCALAR',indices,Uint32Array))
      .setAttribute('POSITION',accessor(style+' position','VEC3',positions)).setAttribute('NORMAL',accessor(style+' normal','VEC3',vertexNormals)).setAttribute('TEXCOORD_0',accessor(style+' UV','VEC2',uvs))
      .setAttribute('COLOR_0',accessor(style+' edge opacity','VEC4',colors))
      .setAttribute('JOINTS_0',accessor(style+' joints','VEC4',Array.from({length:count},()=>[head,0,0,0]).flat(),Uint16Array)).setAttribute('WEIGHTS_0',accessor(style+' weights','VEC4',Array.from({length:count},()=>[1,0,0,0]).flat()));
    for(const target of mesh.listPrimitives()[0].listTargets()){
      const delta=deltas.get(target.getName()),values=[];
      for(const weights of sources){const d=new THREE.Vector3();if(delta)for(const [id,w]of weights)d.addScaledVector(delta[id],w);values.push(...d.applyMatrix3(inverseLinear).toArray());}
      primitive.addTarget(document.createPrimitiveTarget(target.getName()).setAttribute('POSITION',accessor(style+' '+target.getName(),'VEC3',values)));
    }
    for(const original of mesh.listPrimitives()){mesh.removePrimitive(original);original.dispose();}
    mesh.addPrimitive(primitive);node.setExtras({...node.getExtras(),sideburnFitVersion:2});reports.push({node:node.getName(),vertices:count,triangles:indices.length/3});
  }
  return reports;
}
