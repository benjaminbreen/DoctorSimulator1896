import * as THREE from 'three';
import {MODULAR_HAIR_TONES} from './modularAppearance.js';

export const EYELASH_LEVELS=[
  {label:'Minimal',upper:14,lower:4,length:.0028,width:.00007,curl:.16},
  {label:'Light',upper:22,lower:7,length:.0040,width:.00008,curl:.22},
  {label:'Natural',upper:30,lower:10,length:.0054,width:.00010,curl:.28},
  {label:'Full',upper:39,lower:13,length:.0067,width:.00012,curl:.34},
  {label:'Prominent',upper:48,lower:16,length:.0080,width:.00014,curl:.40},
];
export const EYELASH_TONES={auto:'Follow hair',black:'Soft black',brown:'Brown',fair:'Fair',gray:'Grey'};
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
function random(seed){let s=(Math.imul(Number(seed)||1,0x45d9f3b)^0x79b531ad)>>>0;return()=>{s^=s<<13;s^=s>>>17;s^=s<<5;return(s>>>0)/4294967296;};}

export function eyelashVariation(seed=1,male=false){
  // These overlapping weights are an art direction choice for the cast.
  const rng=random(seed),weights=male?[.16,.31,.34,.16,.03]:[.08,.18,.37,.26,.11];let draw=rng(),level=4;
  for(let i=0;i<weights.length;i++){draw-=weights[i];if(draw<0){level=i;break;}}
  return {lashProminence:level,lashSeed:seed,lashTone:'auto'};
}

function borderLoops(geometry){
  const positions=geometry.attributes.position,index=geometry.index,edges=new Map(),neighbors=Array.from({length:positions.count},()=>new Set());
  const at=i=>index?index.getX(i):i;
  for(let i=0;i<(index?.count||positions.count);i+=3)for(const [a,b] of [[at(i),at(i+1)],[at(i+1),at(i+2)],[at(i+2),at(i)]]){
    const key=a<b?`${a}:${b}`:`${b}:${a}`;edges.set(key,(edges.get(key)||0)+1);neighbors[a].add(b);neighbors[b].add(a);
  }
  const boundary=new Map();
  for(const [edge,count]of edges)if(count===1){const[a,b]=edge.split(':').map(Number);for(const[x,y]of[[a,b],[b,a]]){if(!boundary.has(x))boundary.set(x,[]);boundary.get(x).push(y);}}
  const unused=new Set(boundary.keys()),loops=[];
  while(unused.size){
    const start=unused.values().next().value,loop=[];let current=start,previous=-1;
    while(unused.has(current)){loop.push(current);unused.delete(current);const next=boundary.get(current)?.find(i=>i!==previous);previous=current;current=next;}
    if(current===start&&loop.length>=12)loops.push(loop);
  }
  return {loops,neighbors};
}

function point(mesh,index,matrix,out=new THREE.Vector3()){
  mesh.getVertexPosition(index,out);return out.applyMatrix4(matrix);
}

export function createModularEyelashes(root,{cohort='women',seed=1}={}){
  const parts=[],defaultLevel=cohort==='men'?2:3,forward=new THREE.Vector3(0,0,1);
  root.updateWorldMatrix(true,true);
  const inverse=root.matrixWorld.clone().invert();
  root.traverse(source=>{
    if(!/^Carmela_Lid_(Left|Right)$/.test(source.name)||!source.geometry)return;
    const {loops,neighbors}=borderLoops(source.geometry);if(loops.length<2)return;
    const matrix=new THREE.Matrix4().multiplyMatrices(inverse,source.matrixWorld);
    const perimeter=loop=>loop.reduce((sum,id,i)=>sum+point(source,id,matrix).distanceTo(point(source,loop[(i+1)%loop.length],matrix)),0);
    // Export optimisation reorders vertices. Find the opening by topology
    // rather than assuming the first row still contains the inner rim.
    let rim=[...loops].sort((a,b)=>perimeter(a)-perimeter(b))[0];
    const points=rim.map(id=>point(source,id,matrix)),right=points.reduce((best,p,i)=>p.x>points[best].x?i:best,0);
    rim=[...rim.slice(right),...rim.slice(0,right)];
    if(point(source,rim[1],matrix).y<point(source,rim.at(-1),matrix).y)rim=[rim[0],...rim.slice(1).reverse()];
    const rimSet=new Set(rim),outside=rim.map(id=>[...neighbors[id]].filter(n=>!rimSet.has(n)).sort((a,b)=>
      point(source,a,matrix).distanceToSquared(point(source,id,matrix))-point(source,b,matrix).distanceToSquared(point(source,id,matrix)))[0]);
    if(outside.some(i=>i===undefined))return;
    const tangent=point(source,rim[2],matrix).sub(point(source,rim[0],matrix));
    const out=point(source,outside[1],matrix).sub(point(source,rim[1],matrix));
    const normalSign=tangent.cross(out).dot(forward)<0?-1:1;
    const material=new THREE.MeshStandardMaterial({color:'#241a14',roughness:.9,metalness:0,side:THREE.DoubleSide,transparent:true,depthWrite:false});
    material.forceSinglePass=true;
    material.onBeforeCompile=shader=>{
      shader.vertexShader='attribute float lashAcross; attribute float lashCoverage; varying float vLashAcross; varying float vLashCoverage;\n'+shader.vertexShader;
      shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvLashAcross=lashAcross;vLashCoverage=lashCoverage;');
      shader.fragmentShader='varying float vLashAcross; varying float vLashCoverage;\n'+shader.fragmentShader;
      shader.fragmentShader=shader.fragmentShader.replace('#include <clipping_planes_fragment>','#include <clipping_planes_fragment>\ndiffuseColor.a*=vLashCoverage*(1.0-smoothstep(.45,1.0,abs(vLashAcross)));if(diffuseColor.a<.008)discard;');
    };
    material.customProgramCacheKey=()=> 'modular-lash-coverage-1';
    const mesh=new THREE.Mesh(new THREE.BufferGeometry(),material);
    mesh.name='Patient_Eyelashes_'+source.name.split('_').at(-1);mesh.frustumCulled=false;mesh.castShadow=false;
    parts.push({source,rim,outside,normalSign,mesh,material:mesh.material,points:rim.map(()=>new THREE.Vector3()),outer:rim.map(()=>new THREE.Vector3()),strands:[]});
  });
  if(parts.length!==2){for(const p of parts){p.mesh.geometry.dispose();p.material.dispose();}parts.length=0;}
  for(const p of parts)root.add(p.mesh);
  let key='',level=defaultLevel,triangles=0;
  const color=new THREE.Color();
  function updateLook(next={}){
    level=Number.isFinite(Number(next.lashProminence))&&next.lashProminence!==null?clamp(Math.round(Number(next.lashProminence)),0,4):defaultLevel;
    const nextKey=JSON.stringify([level,next.lashSeed??seed,next.lashTone,next.hairTone]);if(nextKey===key)return;
    key=nextKey;triangles=0;
    const tone={black:'#201c19',brown:'#4b3325',fair:'#867152',gray:'#76716a'}[next.lashTone];
    color.set(tone||(MODULAR_HAIR_TONES[next.hairTone]?.color||'#39291f'));
    if(!tone)color.lerp(new THREE.Color('#17120e'),['blond','silver','mixedGray'].includes(next.hairTone)?.28:.50);
    for(const [eye,part]of parts.entries()){
      const settings=EYELASH_LEVELS[level],rng=random(Number(next.lashSeed??seed)+eye*313),strands=[];
      for(const upper of [true,false]){
        const count=upper?settings.upper:settings.lower;
        for(let i=0;i<count;i++){
          const fraction=.045+.91*(i+.5+(rng()-.5)*.45)/count;
          strands.push({upper,fraction,length:settings.length*(upper?1:.48)*(.82+rng()*.30)*(.65+.35*Math.sin(fraction*Math.PI)),width:settings.width*(upper?1:.7),curl:settings.curl*(.88+rng()*.24),fan:(rng()-.5)*.08});
        }
      }
      part.strands=strands;const vertices=strands.length*12,positions=new Float32Array(vertices*3),indices=[];
      for(let i=0;i<strands.length;i++)for(let segment=0;segment<5;segment++){const a=i*12+segment*2;indices.push(a,a+1,a+2,a+1,a+3,a+2);}
      part.mesh.geometry.dispose();const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(positions,3).setUsage(THREE.DynamicDrawUsage));g.setIndex(indices);
      g.setAttribute('lashAcross',new THREE.Float32BufferAttribute(Array.from({length:vertices},(_,i)=>i%2?1:-1),1));
      g.setAttribute('lashCoverage',new THREE.BufferAttribute(new Float32Array(vertices),1).setUsage(THREE.DynamicDrawUsage));part.mesh.geometry=g;
      part.material.color.copy(color);triangles+=indices.length/3;
    }
  }
  const matrix=new THREE.Matrix4(),rootInverse=new THREE.Matrix4(),a=new THREE.Vector3(),b=new THREE.Vector3(),tangent=new THREE.Vector3(),outside=new THREE.Vector3(),normal=new THREE.Vector3(),direction=new THREE.Vector3(),across=new THREE.Vector3(),tip=new THREE.Vector3(),anchor=new THREE.Vector3(),cameraPosition=new THREE.Vector3(),worldPoint=new THREE.Vector3(),rootScale=new THREE.Vector3();
  function update(camera=null,pixelHeight=900){
    if(!parts.length)return;
    root.updateWorldMatrix(true,true);rootInverse.copy(root.matrixWorld).invert();root.getWorldScale(rootScale);camera?.getWorldPosition(cameraPosition);
    for(const part of parts){
      matrix.multiplyMatrices(rootInverse,part.source.matrixWorld);
      for(let i=0;i<part.rim.length;i++){point(part.source,part.rim[i],matrix,part.points[i]);point(part.source,part.outside[i],matrix,part.outer[i]);}
      const blinkName='eyeBlink'+part.source.name.split('_').at(-1),blink=part.source.morphTargetInfluences?.[part.source.morphTargetDictionary?.[blinkName]]||0;
      const attr=part.mesh.geometry.attributes.position,n=part.rim.length,unit=part.points[0].distanceTo(part.points[n/2])/.033;
      const coverage=part.mesh.geometry.attributes.lashCoverage;
      worldPoint.copy(part.points[0]).applyMatrix4(root.matrixWorld);
      const pixel=camera?.isPerspectiveCamera?2*worldPoint.distanceTo(cameraPosition)*Math.tan(THREE.MathUtils.degToRad(camera.fov/2))/Math.max(1,pixelHeight)/rootScale.y:0;
      for(const [index,strand]of part.strands.entries()){
        const value=(strand.upper?strand.fraction:1+strand.fraction)*n/2,i=Math.floor(value)%n,j=(i+1)%n,t=value-Math.floor(value);
        a.lerpVectors(part.points[i],part.points[j],t);b.lerpVectors(part.outer[i],part.outer[j],t);
        tangent.copy(part.points[(j+1)%n]).sub(part.points[(i-1+n)%n]).normalize();outside.copy(b).sub(a).normalize();
        normal.crossVectors(tangent,outside).normalize().multiplyScalar(part.normalSign);
        direction.copy(normal).multiplyScalar(.85).addScaledVector(outside,strand.upper?.45-.65*blink:.45).addScaledVector(tangent,(strand.fraction-.5)*.22+strand.fan).normalize();
        across.copy(tangent).addScaledVector(direction,-tangent.dot(direction)).normalize();
        const length=strand.length*unit*(strand.upper?1:1-.35*blink);anchor.copy(a).addScaledVector(normal,.00012*unit);
        for(let segment=0;segment<=5;segment++){
          const v=segment/5;tip.copy(anchor).addScaledVector(direction,length*v).addScaledVector(outside,strand.curl*length*v*v*(strand.upper?1:.4));
          // Preserve subpixel fibre coverage as soft alpha instead of letting
          // narrow triangles break into dots as the camera pulls back.
          const physical=strand.width*unit*(1-v*.96),display=Math.max(physical,.00018*unit,pixel*1.2),width=display*.5;
          for(const side of [-1,1]){
            const vertex=index*12+segment*2+(side===1?1:0);attr.setXYZ(vertex,tip.x+across.x*width*side,tip.y+across.y*width*side,tip.z+across.z*width*side);coverage.setX(vertex,physical/display);
          }
        }
      }
      attr.needsUpdate=true;coverage.needsUpdate=true;part.mesh.geometry.computeVertexNormals();
    }
  }
  function describe(){return {available:parts.length===2,prominence:level,label:EYELASH_LEVELS[level].label,color:'#'+color.getHexString(),triangles,eyes:parts.length};}
  updateLook({});update();
  return {available:parts.length===2,updateLook,update,describe,meshes:parts.map(p=>p.mesh),dispose(){for(const p of parts){p.mesh.geometry.dispose();p.material.dispose();p.mesh.removeFromParent();}}};
}
