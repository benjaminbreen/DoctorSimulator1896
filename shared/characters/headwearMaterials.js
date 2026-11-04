import * as THREE from 'three';

const kinds=['felt','wool','linen','straw','straw-coil','grosgrain','silk','velvet','leather'];
const loader=new THREE.TextureLoader(),maps=new Map(),loads=new Set();
let feather=null;

function load(url,colour,wrap=THREE.RepeatWrapping){
  let done;loads.add(new Promise((resolve,reject)=>{done=[resolve,reject];}));
  const texture=loader.load(url,()=>done[0](),undefined,error=>done[1](error));
  texture.wrapS=texture.wrapT=wrap;texture.anisotropy=8;
  texture.colorSpace=colour?THREE.SRGBColorSpace:THREE.NoColorSpace;
  return texture;
}

// All 28 files come to 2.8 MB and a patient wears one or two fabrics, so each
// fabric fetches its maps the first time a material asks for them. The maps
// exist from the start, so the shader does not change when the images arrive.
function fabricMaps(kind){
  if(typeof document==='undefined'||!kinds.includes(kind))return {};
  if(!maps.has(kind)){
    const wrap=kind==='straw-coil'?THREE.ClampToEdgeWrapping:THREE.RepeatWrapping;
    const [map,normalMap,orm]=['albedo','normal','orm'].map(channel=>load(`/textures/headwear/${kind}-${channel}.webp?v=2`,channel==='albedo',wrap));
    maps.set(kind,{map,normalMap,roughnessMap:orm,aoMap:orm});
  }
  return maps.get(kind);
}

// Resolves once every fabric requested so far has loaded.
export function headwearTexturesReady(){return Promise.all(loads);}

export async function loadHeadwearTextures(){
  for(const kind of kinds)fabricMaps(kind);
  featherMap();
  await headwearTexturesReady();
}

function featherMap(){
  if(!feather&&typeof document!=='undefined')feather=load('/textures/headwear/feather-albedo.webp?v=2',true);
  return feather;
}

export function headwearMaterial(color,kind,wear=0){
  const shade=new THREE.Color(color);shade.lerp(new THREE.Color('#a7997e'),wear*.13);
  const sheen={felt:.22,wool:.15,velvet:.75,linen:.12,silk:.35,grosgrain:.22}[kind]||0;
  const material=new THREE.MeshPhysicalMaterial({color:shade,...fabricMaps(kind),side:THREE.DoubleSide,
    roughness:1,metalness:0,normalScale:new THREE.Vector2(.65,.65),aoMapIntensity:.5,
    sheen,sheenColor:shade.clone().lerp(new THREE.Color('#d7ccbc'),.06),sheenRoughness:kind==='silk'?.38:.78,
    anisotropy:['silk','grosgrain'].includes(kind)?.45:0,specularIntensity:['silk','leather'].includes(kind)?.4:.18});
  material.name=`Hat_${kind}`;material.userData.headwearFabric=kind;return material;
}

export function headwearFeatherMaterial(color){
  return new THREE.MeshStandardMaterial({name:'Hat_feather',color,map:featherMap(),alphaTest:.12,alphaToCoverage:true,side:THREE.DoubleSide,roughness:.9,metalness:0});
}
