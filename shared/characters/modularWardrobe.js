import { Matrix4, Vector3, MeshDepthMaterial, MeshDistanceMaterial, RGBADepthPacking, DataTexture, RedFormat, FloatType, NearestFilter } from 'three';
import {createModularFabric} from './modularFabric.js';

// The same fitted garment parts serve the game and the character review page.
export function createModularWardrobe(root) {
  const fabricSurface=createModularFabric(root);
  let garmentStyle = null;
  root.traverse(object => { if (object.userData.garmentStyle) garmentStyle = object.userData.garmentStyle; });
  const names = ['Patient_SkirtStanding', 'Patient_SkirtSeated', 'Patient_ApronStanding', 'Patient_ApronSeated'];
  const parts = names.map((name) => root.getObjectByName(name));
  const formal = root.getObjectByName('Patient_FormalUpper');
  const work = [];
  root.traverse(object=>{if(object.isMesh && object.name.startsWith('Patient_Work'))work.push(object);});
  const materials = new Set();
  root.traverse((object) => {
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      if (material && ['Patient_DressFabric', 'Patient_SeatedDressFabric', 'Patient_MaleFabric','Patient_WorkCotton','Patient_WorkWool'].includes(material.name)) materials.add(material);
    }
  });
  let previousPalette = null;
  let apronSeated = null;
  const thighs=[];
  root.traverse(bone=>{
    if(!bone.isBone)return;
    const side=['Left','Right'].find(side=>bone.name.endsWith(`${side}UpLeg`));
    const knee=side && bone.children.find(child=>child.isBone && child.name.endsWith(`${side}Leg`));
    if(knee)thighs.push([bone,knee]);
  });
  const apronFit=fitAprons(work,thighs,root);
  let workWool=null;
  root.traverse(mesh=>{for(const material of Array.isArray(mesh.material)?mesh.material:[mesh.material])if(material?.name==='Patient_WorkWool')workWool=material;});
  const trousers=[];
  root.getObjectByName('Patient_MaleBody')?.traverse(mesh=>{
    if(mesh.isMesh && mesh.material?.name==='Patient_MaleFabric')trousers.push({mesh,material:mesh.material});
  });
  return {
    dispose(){apronFit.dispose();fabricSurface.dispose();},
    fabricAvailable:fabricSurface.available,
    fabricDescription:fabricSurface.describe,
    available: Boolean(parts[0]) || materials.size > 0,
    outfits: garmentStyle ? [garmentStyle] : formal ? ['tailored-clothes','work-shirt','canvas-apron','leather-apron'] : parts[0] ? ['day-dress', 'work-apron'] : root.getObjectByName('Patient_WorkerBody') ? ['work-shirt'] : ['tailored-clothes'],
    update({ seated, apron = false, outfit = 'tailored-clothes', palette = 'original', fabric='wool', fabricScale=1, dt = 0 }) {
      fabricSurface.update({fabric,fabricScale});
      const visible = [!seated, seated, !seated && apron, seated && apron];
      parts.forEach((part, index) => { if (part) part.visible = Boolean(visible[index]); });
      const worker = ['work-shirt','canvas-apron','leather-apron'].includes(outfit);
      if(workWool)for(const {mesh,material} of trousers)mesh.material=worker?workWool:material;
      let target=seated?1:0;
      if(formal && thighs.length){
        // The sit cue can precede bent knees. Follow the actual pose so
        // the apron does not become a horizontal shelf while still upright.
        let bend=0;
        for(const [hip,knee] of thighs){
          knee.updateWorldMatrix(true,false);
          const a=hip.matrixWorld.elements,b=knee.matrixWorld.elements;
          const length=Math.hypot(b[12]-a[12],b[13]-a[13],b[14]-a[14]);
          bend+=1-Math.min(1,Math.abs(b[13]-a[13])/Math.max(.001,length));
        }
        const t=Math.max(0,Math.min(1,(bend/thighs.length-.05)/.80));
        target=t*t*(3-2*t);
      }
      apronSeated=apronSeated===null || dt===0 ? target : apronSeated+(target-apronSeated)*(1-Math.exp(-dt*14));
      if (formal) formal.visible=!worker;
      for(const object of work){
        const isApron=object.name.startsWith('Patient_WorkApron');
        object.visible=worker && (!isApron || outfit!=='work-shirt');
        if(['Patient_WorkShirtButtons','Patient_WorkShirtPlacket'].includes(object.name))object.visible&&=outfit==='work-shirt';
        if(isApron){
          object.visible&&=object.name.includes('Leather')===(outfit==='leather-apron');
          const index=object.morphTargetDictionary?.rc_workSeated;
          if(index!==undefined){object.morphTargetInfluences[index]=apronSeated;}
          else if(object.name.includes('Standing'))object.visible&&=!seated;
          if(object.name.includes('Seated'))object.visible&&=Boolean(seated) && !work.some(part=>part.morphTargetDictionary?.rc_workSeated!==undefined);
        }
      }
      apronFit.update();
      if (palette === previousPalette) return;
      previousPalette = palette;
      const colors = { original: '#ffffff', navy: '#6b9bff', forest: '#6affb5', taupe: '#c2e6ff' };
      const wool = { original:'#ffffff', navy:'#788ca8', forest:'#8f9b80', taupe:'#baa88d' };
      for (const material of materials) {
        const paletteColors=['Patient_MaleFabric','Patient_WorkCotton','Patient_WorkWool'].includes(material.name)?wool:colors;
        material.color.set(paletteColors[palette] || paletteColors.original);
      }
    },
  };
}

// Two small depth grids follow the posed trousers. Separate lap and knee-front
// contacts keep the hanging panel down while the thighs move beneath it.
function fitAprons(parts,thighs,root){
  const aprons=parts.filter(mesh=>mesh.morphTargetDictionary?.rc_workSeated!==undefined && mesh.material);
  const sources=[];
  root.traverse(mesh=>{
    if(!mesh.isSkinnedMesh)return;
    if(mesh.name==='Patient_WorkTrouserWaist'||(mesh.material?.name==='Patient_MaleFabric'&&mesh.parent?.name==='Patient_MaleBody')){
      sources.push({mesh,points:new Float32Array(mesh.geometry.attributes.position.count*3),projected:new Float32Array(mesh.geometry.attributes.position.count*3),indices:mesh.geometry.index.array});
    }
  });
  if(thighs.length!==2||!sources.length||!aprons.length)return {update(){},dispose(){}};
  const size=64,starts=[new Vector3(),new Vector3()],ends=[new Vector3(),new Vector3()],right=new Vector3(),point=new Vector3();
  const fields=[0,1].map(()=>{
    const data=new Float32Array(size*size),padded=new Float32Array(size*size);
    const texture=new DataTexture(padded,size,size,RedFormat,FloatType);
    texture.minFilter=texture.magFilter=NearestFilter;texture.generateMipmaps=false;
    return {data,padded,texture};
  });
  const shared={workLegStart:{value:starts},workLegEnd:{value:ends},workRight:{value:right},workDepth0:{value:fields[0].texture},workDepth1:{value:fields[1].texture}};
  const diagnostics={starts,ends,ms:0,sources:sources.map(({mesh,points})=>({name:mesh.name,vertices:points.length/3}))},fits=[];
  for(const mesh of aprons){
    const inverse=new Matrix4(),uniforms={...shared,workWorldToLocal:{value:inverse}};
    const material=mesh.material.clone();mesh.material=material;material.userData.workLegFit=diagnostics;
    const depth=new MeshDepthMaterial({depthPacking:RGBADepthPacking}),distance=new MeshDistanceMaterial();
    mesh.customDepthMaterial=depth;mesh.customDistanceMaterial=distance;
    for(const target of [material,depth,distance]){
      const previous=target.onBeforeCompile;
      target.onBeforeCompile=(shader,renderer)=>{
        previous?.(shader,renderer);Object.assign(shader.uniforms,uniforms);
        shader.vertexShader=`uniform vec3 workLegStart[2]; uniform vec3 workLegEnd[2]; uniform vec3 workRight;
uniform sampler2D workDepth0; uniform sampler2D workDepth1; uniform mat4 workWorldToLocal;
float workSurface(sampler2D field,vec2 uv){
  vec2 pixel=clamp(uv*64.0-.5,vec2(0.0),vec2(63.0)),base=floor(pixel),f=fract(pixel);
  vec4 values=vec4(texture2D(field,(base+.5)/64.0).r,texture2D(field,(base+vec2(1.5,.5))/64.0).r,
    texture2D(field,(base+vec2(.5,1.5))/64.0).r,texture2D(field,(base+1.5)/64.0).r);
  vec4 weights=vec4((1.0-f.x)*(1.0-f.y),f.x*(1.0-f.y),(1.0-f.x)*f.y,f.x*f.y)*step(vec4(-999.0),values);
  float total=dot(weights,vec4(1.0));return total>0.0?dot(values,weights)/total:-1000.0;
}
${shader.vertexShader}`;
        shader.vertexShader=shader.vertexShader.replace('#include <skinning_vertex>',`#include <skinning_vertex>
vec3 workPoint=(modelMatrix*vec4(transformed,1.0)).xyz;
for(int leg=0;leg<2;leg++){
  vec3 axis=workLegEnd[leg]-workLegStart[leg];float span=length(axis);axis/=span;
  if((leg==0&&uv.y>.80)||(leg==1&&uv.y<.72))continue;
  float bend=leg==1?0.0:smoothstep(.35,.8,1.0-abs(axis.y));
  vec3 outward=normalize(mix(normalize(cross(workRight,vec3(0.0,1.0,0.0))),normalize(cross(axis,workRight)),bend));
  axis=normalize(cross(workRight,outward));
  vec3 offset=workPoint-workLegStart[leg];float along=dot(offset,axis)/span;
  vec2 fitUv=vec2(dot(offset,workRight)/(span*1.6)+.5,(along+.4)/1.8);
  if(fitUv.x>0.0&&fitUv.x<1.0&&fitUv.y>0.0&&fitUv.y<1.0){
    float surface=leg==0?workSurface(workDepth0,fitUv):workSurface(workDepth1,fitUv);
    float depth=dot(offset,outward);
    float contact=leg==0?smoothstep(.30,.44,uv.y):1.0;
    workPoint+=outward*max(0.0,surface+.008-depth)*contact;
  }
}
transformed=(workWorldToLocal*vec4(workPoint,1.0)).xyz;`);
      };
      target.customProgramCacheKey=()=>`work-apron-surface-fit-v7-${target.type}`;
    }
    fits.push({mesh,inverse,depth,distance});
  }
  return {
    update(){
      if(!fits.some(({mesh})=>mesh.visible)){diagnostics.ms=0;return;}
      const began=performance.now();root.updateWorldMatrix(true,true);
      right.set(1,0,0).transformDirection(root.matrixWorld);
      for(const source of sources){
        for(let i=0;i<source.points.length/3;i++){
          source.mesh.getVertexPosition(i,point).applyMatrix4(source.mesh.matrixWorld);
          source.points[i*3]=point.x;source.points[i*3+1]=point.y;source.points[i*3+2]=point.z;
        }
      }
      for(let leg=0;leg<2;leg++){
        starts[leg].setFromMatrixPosition(thighs[leg][0].matrixWorld);ends[leg].setFromMatrixPosition(thighs[leg][1].matrixWorld);
      }
      const originMid=starts[0].clone().add(starts[1]).multiplyScalar(.5);
      const first=ends[0].clone().sub(starts[0]),second=ends[1].clone().sub(starts[1]);
      const span=(first.length()+second.length())/2,direction=first.normalize().add(second.normalize()).normalize();
      for(let leg=0;leg<2;leg++){
        starts[leg].copy(originMid);ends[leg].copy(originMid).addScaledVector(direction,span);
        const axis=ends[leg].clone().sub(starts[leg]),length=axis.length();axis.divideScalar(length);
        const t=leg===1?0:Math.max(0,Math.min(1,(1-Math.abs(axis.y)-.35)/.45));
        const outward=new Vector3().crossVectors(right,new Vector3(0,1,0)).normalize().lerp(new Vector3().crossVectors(axis,right).normalize(),t*t*(3-2*t)).normalize();
        axis.crossVectors(right,outward).normalize();
        const origin=starts[leg],{data,padded,texture}=fields[leg];
        data.fill(-1000);
        for(const {points,indices,projected} of sources){
          for(let i=0;i<points.length;i+=3){
            const x=points[i]-origin.x,y=points[i+1]-origin.y,z=points[i+2]-origin.z;
            projected[i]=((x*right.x+y*right.y+z*right.z)/(length*1.6)+.5)*size;
            projected[i+1]=((x*axis.x+y*axis.y+z*axis.z)/length+.4)/1.8*size;
            projected[i+2]=x*outward.x+y*outward.y+z*outward.z;
          }
          for(let i=0;i<indices.length;i+=3){
            const a=indices[i]*3,b=indices[i+1]*3,c=indices[i+2]*3;
            const ax=projected[a],ay=projected[a+1],bx=projected[b],by=projected[b+1],cx=projected[c],cy=projected[c+1];
            const denominator=(by-cy)*(ax-cx)+(cx-bx)*(ay-cy);if(Math.abs(denominator)<.00001)continue;
            const x0=Math.max(0,Math.floor(Math.min(ax,bx,cx))),x1=Math.min(size-1,Math.ceil(Math.max(ax,bx,cx)));
            const y0=Math.max(0,Math.floor(Math.min(ay,by,cy))),y1=Math.min(size-1,Math.ceil(Math.max(ay,by,cy)));
            for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++){
              const u=((by-cy)*(x+.5-cx)+(cx-bx)*(y+.5-cy))/denominator;
              const v=((cy-ay)*(x+.5-cx)+(ax-cx)*(y+.5-cy))/denominator,w=1-u-v;
              if(u<-.01||v<-.01||w<-.01)continue;
              const depth=u*projected[a+2]+v*projected[b+2]+w*projected[c+2],index=y*size+x;
              data[index]=Math.max(data[index],depth);
            }
          }
        }
        // Cover the space between garment vertices as well as triangle edges.
        // Sampling only each vertex lets trouser folds pierce the cloth faces.
        for(let y=0;y<size;y++)for(let x=0;x<size;x++){
          let front=-1000;
          for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++)if(y+dy>=0&&y+dy<size&&x+dx>=0&&x+dx<size){
            const index=(y+dy)*size+x+dx;front=Math.max(front,data[index]);
          }
          padded[y*size+x]=front;
        }
        texture.needsUpdate=true;
      }
      for(const {mesh,inverse} of fits)inverse.copy(mesh.matrixWorld).invert();
      diagnostics.ms=performance.now()-began;
    },
    dispose(){for(const {depth,distance} of fits){depth.dispose();distance.dispose();}for(const {texture} of fields)texture.dispose();},
  };
}
