import * as THREE from 'three';
import {CLOTHING_ATLASES} from './clothingAtlases.js';

export const MODULAR_FABRICS={wool:'Fine wool',herringbone:'Herringbone wool',silk:'Silk faille',original:'Original donor texture'};
const channels=['albedo','normal','roughness'],kinds=['wool','herringbone','silk'];
export const CLOTHING_TEXTURE_URLS=kinds.flatMap(kind=>channels.map(channel=>`/textures/clothing/${kind}-${channel}.webp`));
const fabrics=new Map(),atlases=new Map(),atlasLoads=new Map();

export function configureClothingTextures(textures){
  if(fabrics.size)return;
  kinds.forEach((kind,i)=>{
    const maps=textures.slice(i*3,i*3+3);
    maps.forEach((texture,j)=>{
      texture.wrapS=texture.wrapT=THREE.RepeatWrapping;texture.anisotropy=8;
      texture.colorSpace=j===0?THREE.SRGBColorSpace:THREE.NoColorSpace;texture.needsUpdate=true;
    });
    fabrics.set(kind,maps);
  });
}

export async function loadClothingTextures(){
  configureClothingTextures(await Promise.all(CLOTHING_TEXTURE_URLS.map(url=>new THREE.TextureLoader().loadAsync(url))));
}

// Bind-pose metres keep grain attached to cloth during skinning. Triplanar
// sampling avoids the donor's fragmented, uneven-density atlas UVs.
function clothCoordinates(mesh,root){
  if(mesh.geometry.attributes.clothPosition)return;
  mesh.geometry=mesh.geometry.clone();
  const count=mesh.geometry.attributes.position.count,positions=new Float32Array(count*3);
  const inverse=root.matrixWorld.clone().invert(),point=new THREE.Vector3();
  for(let i=0;i<count;i++){
    mesh.getVertexPosition(i,point).applyMatrix4(mesh.matrixWorld).applyMatrix4(inverse);
    point.toArray(positions,i*3);
  }
  const rest=new THREE.BufferGeometry();
  rest.setAttribute('position',new THREE.BufferAttribute(positions,3));rest.setIndex(mesh.geometry.index);rest.computeVertexNormals();
  mesh.geometry.setAttribute('clothPosition',rest.attributes.position);
  mesh.geometry.setAttribute('clothNormal',rest.attributes.normal);
  rest.dispose();
}

function patchMaterial(material,uniforms){
  const previous=material.onBeforeCompile,cacheKey=material.customProgramCacheKey.bind(material);
  material.onBeforeCompile=(shader,renderer)=>{
    previous(shader,renderer);Object.assign(shader.uniforms,uniforms);
    shader.vertexShader='attribute vec3 clothPosition; attribute vec3 clothNormal; varying vec3 vClothPosition; varying vec3 vClothNormal;\n'+shader.vertexShader;
    shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvClothPosition=clothPosition; vClothNormal=clothNormal;');
    shader.fragmentShader=`
uniform sampler2D clothAlbedo; uniform sampler2D clothNormalMap; uniform sampler2D clothRoughness;
uniform float clothEnabled; uniform float clothRepeat; uniform float clothRelief;
varying vec3 vClothPosition; varying vec3 vClothNormal;
vec3 clothWeights(){vec3 w=pow(abs(normalize(vClothNormal)),vec3(8.0));return w/max(dot(w,vec3(1.0)),.00001);}
vec3 clothSample(sampler2D tex,vec3 p,vec3 w){return texture2D(tex,p.zy).rgb*w.x+texture2D(tex,p.xy).rgb*w.z+texture2D(tex,p.xz).rgb*w.y;}
mat3 clothFrame(vec3 pos,vec3 n,vec2 uv){
  vec3 q0=dFdx(pos),q1=dFdy(pos),a=cross(q1,n),b=cross(n,q0);
  vec2 st0=dFdx(uv),st1=dFdy(uv);vec3 t=a*st0.x+b*st1.x,bt=a*st0.y+b*st1.y;
  float scale=inversesqrt(max(max(dot(t,t),dot(bt,bt)),1e-16));return mat3(t*scale,bt*scale,n);
}
vec3 clothMappedNormal(vec2 uv,vec3 n,vec3 pos){vec3 m=texture2D(clothNormalMap,uv).xyz*2.0-1.0;m.xy*=clothRelief;return normalize(clothFrame(pos,n,uv)*m);}
`+shader.fragmentShader;
    shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',`#include <map_fragment>
vec3 clothP=vClothPosition*clothRepeat,clothW=clothWeights();
diffuseColor.rgb*=mix(vec3(1.0),clothSample(clothAlbedo,clothP,clothW)/.855,clothEnabled);`);
    shader.fragmentShader=shader.fragmentShader.replace('#include <roughnessmap_fragment>',`#include <roughnessmap_fragment>
roughnessFactor*=mix(1.0,clothSample(clothRoughness,clothP,clothW).g,clothEnabled);`);
    shader.fragmentShader=shader.fragmentShader.replace('#include <normal_fragment_maps>',`#include <normal_fragment_maps>
vec3 clothN=normalize(clothMappedNormal(clothP.zy,normal,-vViewPosition)*clothW.x+clothMappedNormal(clothP.xy,normal,-vViewPosition)*clothW.z+clothMappedNormal(clothP.xz,normal,-vViewPosition)*clothW.y);
normal=normalize(mix(normal,clothN,clothEnabled));`);
  };
  material.customProgramCacheKey=()=>cacheKey()+'|modular-fabric-v1';material.needsUpdate=true;
}

export function createModularFabric(root){
  const entries=[],seen=new Set(),geometries=[];
  root.updateMatrixWorld(true);
  root.traverse(mesh=>{
    if(!mesh.isMesh)return;
    const materials=Array.isArray(mesh.material)?mesh.material:[mesh.material];
    if(!materials.some(m=>CLOTHING_ATLASES[m?.map?.name]&&['Patient_MaleFabric','Patient_DressFabric','Patient_SeatedDressFabric'].includes(m.name)))return;
    clothCoordinates(mesh,root);geometries.push(mesh.geometry);
    for(const material of materials){
      const url=CLOTHING_ATLASES[material.map?.name];
      if(!url||seen.has(material)||!['Patient_MaleFabric','Patient_DressFabric','Patient_SeatedDressFabric'].includes(material.name))continue;
      seen.add(material);
      const original={map:material.map,roughness:material.roughness};
      let clean=atlases.get(url);
      if(!clean&&typeof document!=='undefined'){
        let resolve,reject;const ready=new Promise((ok,fail)=>{resolve=ok;reject=fail;});
        clean=new THREE.TextureLoader().load(url,resolve,undefined,reject);clean.flipY=false;clean.colorSpace=THREE.SRGBColorSpace;clean.anisotropy=8;atlases.set(url,clean);atlasLoads.set(url,ready);
      }
      mesh.userData.preparation=Promise.all([mesh.userData.preparation,atlasLoads.get(url)]);
      const uniforms={clothAlbedo:{value:fabrics.get('wool')?.[0]},clothNormalMap:{value:fabrics.get('wool')?.[1]},clothRoughness:{value:fabrics.get('wool')?.[2]},clothEnabled:{value:0},clothRepeat:{value:12.5},clothRelief:{value:.24}};
      patchMaterial(material,uniforms);entries.push({material,original,clean,uniforms});
    }
  });
  let previous=null;
  return {
    available:entries.length>0,
    update({fabric='wool',fabricScale=1}={}){
      const kind=fabrics.has(fabric)?fabric:'original',key=kind+'/'+fabricScale;
      if(key===previous)return;previous=key;
      for(const {material,original,clean,uniforms}of entries){
        const active=kind!=='original'&&Boolean(clean),maps=fabrics.get(kind)||fabrics.get('wool');
        material.map=active?clean:original.map;material.roughness=active?(kind==='silk'?.7:.94):original.roughness;
        uniforms.clothEnabled.value=Number(active);uniforms.clothRepeat.value=12.5*Math.max(.5,Math.min(2,fabricScale));
        uniforms.clothRelief.value=kind==='silk'?.14:.24;
        if(maps){uniforms.clothAlbedo.value=maps[0];uniforms.clothNormalMap.value=maps[1];uniforms.clothRoughness.value=maps[2];}
        material.userData.clothingFabric=kind;material.needsUpdate=true;
      }
    },
    describe(){return entries.map(({material,uniforms})=>({material:material.name,fabric:material.userData.clothingFabric,tileMetres:1/uniforms.clothRepeat.value}));},
    dispose(){for(const geometry of geometries)geometry.dispose();},
  };
}
