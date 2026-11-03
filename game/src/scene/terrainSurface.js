import * as THREE from 'three';
import {terrainHeight,pathsDistance,pondDepth,rockiness} from '../world/terrain.js';
import {SHELTERS} from '../world/rusticwork.js';
import {WORLD_BOUNDS} from '../world/streetGrid.js';
import {constructedSurfaceAt} from '../world/constructedSurfaces.js';

export const TERRAIN_COLUMNS=280,TERRAIN_ROWS=230;

// Refine only the pond banks. Boundary samples stay on the neighbouring
// coarse edge, so the extra shoreline vertices cannot open cracks.
export function buildTerrainSurface(){
  const columns=TERRAIN_COLUMNS,rows=TERRAIN_ROWS,steps=4;
  const width=WORLD_BOUNDS.maxX-WORLD_BOUNDS.minX,depth=WORLD_BOUNDS.maxZ-WORLD_BOUNDS.minZ;
  const dx=width/columns,dz=depth/rows,heights=new Float32Array((columns+1)*(rows+1));
  const refined=new Uint8Array(columns*rows);
  const at=(x,z)=>heights[x*(rows+1)+z];
  for(let x=0;x<=columns;x++)for(let z=0;z<=rows;z++)heights[x*(rows+1)+z]=terrainHeight(WORLD_BOUNDS.minX+x*dx,WORLD_BOUNDS.minZ+z*dz);
  for(let x=0;x<columns;x++)for(let z=0;z<rows;z++){
    const wx=WORLD_BOUNDS.minX+(x+.5)*dx,wz=WORLD_BOUNDS.minZ+(z+.5)*dz;
    refined[z*columns+x]=Math.abs(pondDepth(wx,wz))<.42 ? 1 : 0;
  }
  const isFine=(x,z)=>x>=0&&x<columns&&z>=0&&z<rows&&refined[z*columns+x];
  const positions=[],uvs=[],splat=[],urban=[],indices=[],vertices=new Map();
  function vertex(gx,gz){
    const key=gz*(columns*steps+1)+gx;
    if(vertices.has(key))return vertices.get(key);
    const x=WORLD_BOUNDS.minX+gx/steps*dx,z=WORLD_BOUNDS.minZ+gz/steps*dz;
    const cx=Math.floor(gx/steps),cz=Math.floor(gz/steps);
    let height=gx%steps===0&&gz%steps===0?at(cx,cz):terrainHeight(x,z);
    if(gx%steps===0&&gz%steps!==0&&(!isFine(cx-1,cz)||!isFine(cx,cz))){
      const t=gz/steps-cz;height=at(cx,cz)*(1-t)+at(cx,cz+1)*t;
    }else if(gz%steps===0&&gx%steps!==0&&(!isFine(cx,cz-1)||!isFine(cx,cz))){
      const t=gx/steps-cx;height=at(cx,cz)*(1-t)+at(cx+1,cz)*t;
    }
    const id=positions.length/3;vertices.set(key,id);positions.push(x,height,z);
    uvs.push(gx/(columns*steps),1-gz/(rows*steps));
    const path=pathsDistance(x,z),pond=pondDepth(x,z);
    let wear=0;
    for(const shelter of SHELTERS){
      if(Math.hypot(x-shelter.x,z-shelter.z)>shelter.radius+2)continue;
      for(const bay of shelter.entries){
        const angle=shelter.yaw+(bay+.5)*Math.PI*2/shelter.sides,radius=shelter.radius*Math.cos(Math.PI/shelter.sides);
        const distance=Math.hypot(x-shelter.x-Math.cos(angle)*radius,z-shelter.z-Math.sin(angle)*radius);
        wear=Math.max(wear,Math.max(0,1-distance/2.3)*.55);
      }
    }
    splat.push(Math.max(Math.max(0,1-path/1.5)**2,wear),Math.min(1,rockiness(x,z))*.85,pond<.3?1-Math.max(0,pond)/.3:0,Math.max(0,1-path/5.5));
    urban.push(constructedSurfaceAt(x,z));return id;
  }
  for(let x=0;x<columns;x++)for(let z=0;z<rows;z++){
    const increment=isFine(x,z)?1:steps;
    for(let i=0;i<steps;i+=increment)for(let j=0;j<steps;j+=increment){
      const gx=x*steps+i,gz=z*steps+j,a=vertex(gx,gz),b=vertex(gx+increment,gz),c=vertex(gx,gz+increment),d=vertex(gx+increment,gz+increment);
      indices.push(a,c,b,b,c,d);
    }
  }
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));
  geometry.setAttribute('aSplat',new THREE.Float32BufferAttribute(splat,4));
  geometry.setAttribute('aUrban',new THREE.Float32BufferAttribute(urban,1));
  geometry.setIndex(indices);geometry.computeVertexNormals();geometry.computeBoundingSphere();
  return {geometry,heights};
}
