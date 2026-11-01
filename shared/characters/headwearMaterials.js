import * as THREE from 'three';

const kinds=['felt','wool','linen','straw','straw-coil','grosgrain','silk','velvet','leather'];
export const HEADWEAR_TEXTURE_URLS=[...kinds.flatMap(kind=>['albedo','normal','orm'].map(channel=>`/textures/headwear/${kind}-${channel}.webp?v=2`)),'/textures/headwear/feather-albedo.webp?v=2'];
const maps=new Map();
let feather=null;

export function configureHeadwearTextures(textures){
  if(maps.size)return;
  for(const [i,kind] of kinds.entries()){
    const [albedo,normal,orm]=textures.slice(i*3,i*3+3);
    for(const texture of [albedo,normal,orm]){
      texture.wrapS=texture.wrapT=kind==='straw-coil'?THREE.ClampToEdgeWrapping:THREE.RepeatWrapping;
      texture.anisotropy=8;texture.colorSpace=texture===albedo?THREE.SRGBColorSpace:THREE.NoColorSpace;texture.needsUpdate=true;
    }
    maps.set(kind,{map:albedo,normalMap:normal,roughnessMap:orm,aoMap:orm});
  }
  feather=textures.at(-1);feather.colorSpace=THREE.SRGBColorSpace;feather.anisotropy=8;feather.needsUpdate=true;
}

export async function loadHeadwearTextures(){
  const loader=new THREE.TextureLoader();configureHeadwearTextures(await Promise.all(HEADWEAR_TEXTURE_URLS.map(url=>loader.loadAsync(url))));
}

export function headwearMaterial(color,kind,wear=0){
  const shade=new THREE.Color(color);shade.lerp(new THREE.Color('#a7997e'),wear*.13);
  const sheen={felt:.22,wool:.15,velvet:.75,linen:.12,silk:.35,grosgrain:.22}[kind]||0;
  const material=new THREE.MeshPhysicalMaterial({color:shade,...maps.get(kind),side:THREE.DoubleSide,
    roughness:1,metalness:0,normalScale:new THREE.Vector2(.65,.65),aoMapIntensity:.5,
    sheen,sheenColor:shade.clone().lerp(new THREE.Color('#d7ccbc'),.06),sheenRoughness:kind==='silk'?.38:.78,
    anisotropy:['silk','grosgrain'].includes(kind)?.45:0,specularIntensity:['silk','leather'].includes(kind)?.4:.18});
  material.name=`Hat_${kind}`;material.userData.headwearFabric=kind;return material;
}

export function headwearFeatherMaterial(color){
  return new THREE.MeshStandardMaterial({name:'Hat_feather',color,map:feather,alphaTest:.12,alphaToCoverage:true,side:THREE.DoubleSide,roughness:.9,metalness:0});
}
