import * as THREE from 'three';

// Shared PBR sets serve the city alongside the original regular brick.
// Occlusion and roughness share one small texture.
export const FACADE_TEXTURE_URLS = ['brownstone','brick','limestone','ashlar-gray']
  .flatMap(name=>['color','normal','arm'].map(map=>{
    const shared=name==='limestone'&&map!=='color'?'brownstone':name;
    return `/textures/facades/pbr/${shared}-${map}.webp`;
  })).concat('/textures/facades/brick.webp');

const STYLE_SURFACES = [0, 1, 2, 0, 2, 3];
// The two rowhouse entries deliberately share the brownstone surface but not
// its finish: style 0 is warmer dressed stone, while style 3 is a darker,
// more weathered row. Brick remains untouched by this distinction.
const STYLE_TINTS = ['#f2e5dc', '#e2d6ce', '#cbc4b9', '#b8aaa0', '#f6f0e7', '#c8c6bf'];
const STYLE_ROUGHNESS = [1, 1, 0.97, 1, 0.92, 1];
const STYLE_RELIEF = [0.48, 0.65, 0.32, 0.55, 0.24, 0.5];
const STYLE_BASE_DARKEN = [0.26, 0, 0, 0.36, 0, 0.24];
// Rowhouses reuse the brownstone surface. Tone 0 preserves its warm finish;
// the other entries neutralise it into common urban stone colours. These are
// ordinary uniforms, not extra textures or shader programs.
const ROWHOUSE_TONES = [
  { tint: null, saturation: 1, lift: 1 },
  { tint: '#d4d7da', saturation: 0.12, lift: 0.92 },
  { tint: '#dedbd3', saturation: 0.34, lift: 1.08 },
  { tint: '#f2e5ca', saturation: 0.58, lift: 1.12 },
];
const METRES_PER_REPEAT = 3;

function hash01(seed) {
  const value = Math.sin(seed * 12.9898) * 43758.5453;
  return value - Math.floor(value);
}

export function prepareFacadeTextures(textures, anisotropy = 8) {
  for (const [index,texture] of textures.entries()) {
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.colorSpace = index%3===0 ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    texture.anisotropy = anisotropy;
  }
  const surfaces=Array.from({length:4},(_,i)=>{
    const relief=i===2?0:i;
    return {map:textures[i*3],normal:textures[relief*3+1],arm:textures[relief*3+2]};
  });
  surfaces.push({map:textures[12],bump:textures[12]});
  return surfaces;
}

function rowhouseTone(toneIndex) {
  if (!Number.isInteger(toneIndex)) return ROWHOUSE_TONES[0];
  return ROWHOUSE_TONES[((toneIndex % ROWHOUSE_TONES.length) + ROWHOUSE_TONES.length) % ROWHOUSE_TONES.length];
}

function facadeTint(styleIndex, seed, tone) {
  const color = new THREE.Color(tone.tint ?? STYLE_TINTS[styleIndex % STYLE_TINTS.length]);
  color.offsetHSL(
    (hash01(seed * 0.73) - 0.5) * 0.018,
    (hash01(seed * 1.37) - 0.5) * 0.035,
    (hash01(seed * 2.11) - 0.5) * 0.055,
  );
  return color;
}

// BoxGeometry UVs stretch one image over a whole building. Override the map
// coordinates with object-space metres instead: X/Z runs across each wall and
// Y runs upward. The sign keeps the masonry facing the same way on opposite
// sides, and a per-building phase prevents a row from sharing one obvious
// repeating patch.
function applyMetreScaledUvs(material, seed, style, heightM, tone, instancedWorldSpace = false) {
  const offset = instancedWorldSpace
    ? new THREE.Vector2(0, 0)
    : new THREE.Vector2(hash01(seed * 3.17) * 7, hash01(seed * 5.23) * 7);
  const groundStart = instancedWorldSpace ? heightM : -heightM / 2;
  const facadePosition = instancedWorldSpace
    ? `vec3 facadePosition = position;
        #ifdef USE_INSTANCING
          facadePosition = (instanceMatrix * vec4(position, 1.0)).xyz;
        #endif`
    : 'vec3 facadePosition = position;';
  const parcelPhase=instancedWorldSpace
    ? `#ifdef USE_INSTANCING
         vec2 parcel=instanceMatrix[3].xz;
         facadeSurfaceUv+=fract(sin(vec2(dot(parcel,vec2(12.9898,78.233)),dot(parcel,vec2(39.346,11.135))))*43758.5453);
       #endif`
    : '';
  material.onBeforeCompile = (shader) => {
    shader.uniforms.facadeUvOffset = { value: offset };
    shader.uniforms.facadeGroundStart = { value: groundStart };
    shader.uniforms.facadeBaseDarken = { value: STYLE_BASE_DARKEN[style] };
    shader.uniforms.facadeToneSaturation = { value: tone.saturation };
    shader.uniforms.facadeToneLift = { value: tone.lift };
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <uv_pars_vertex>',
        '#include <uv_pars_vertex>\nuniform vec2 facadeUvOffset;\nvarying float vFacadeLocalY;',
      )
      .replace(
        '#include <uv_vertex>',
        `#include <uv_vertex>
        ${facadePosition}
        vFacadeLocalY = facadePosition.y;
        vec2 facadeSurfaceUv;
        if (abs(normal.y) > 0.5) {
          facadeSurfaceUv = vec2(facadePosition.x, -facadePosition.z);
        } else if (abs(normal.x) > 0.5) {
          facadeSurfaceUv = vec2(-facadePosition.z * sign(normal.x), facadePosition.y);
        } else {
          facadeSurfaceUv = vec2(facadePosition.x * sign(normal.z), facadePosition.y);
        }
        facadeSurfaceUv = facadeSurfaceUv / ${METRES_PER_REPEAT.toFixed(1)} + facadeUvOffset;
        ${parcelPhase}
        #ifdef USE_MAP
          vMapUv = facadeSurfaceUv;
        #endif
        #ifdef USE_BUMPMAP
          vBumpMapUv = facadeSurfaceUv;
        #endif
        #ifdef USE_NORMALMAP
          vNormalMapUv = facadeSurfaceUv;
        #endif
        #ifdef USE_ROUGHNESSMAP
          vRoughnessMapUv = facadeSurfaceUv;
        #endif
        #ifdef USE_AOMAP
          vAoMapUv = facadeSurfaceUv;
        #endif`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <uv_pars_fragment>',
        `#include <uv_pars_fragment>
        uniform float facadeGroundStart;
        uniform float facadeBaseDarken;
        uniform float facadeToneSaturation;
        uniform float facadeToneLift;
        varying float vFacadeLocalY;`,
      )
      .replace(
        '#include <map_fragment>',
        `#include <map_fragment>
        float facadeLuma = dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722));
        diffuseColor.rgb = mix(vec3(facadeLuma), diffuseColor.rgb, facadeToneSaturation) * facadeToneLift;`,
      )
      .replace(
        'vec4 diffuseColor = vec4( diffuse, opacity );',
        `vec4 diffuseColor = vec4( diffuse, opacity );
        float facadeBaseTop = facadeGroundStart + 3.15;
        float facadeBaseMask = 1.0 - smoothstep(facadeBaseTop - 0.12, facadeBaseTop + 0.08, vFacadeLocalY);
        float facadeShade = 1.0 - facadeBaseMask * facadeBaseDarken;
        diffuseColor.rgb *= facadeShade;`,
      );
  };
  // Every facade uses the same shader shape; only ordinary uniforms, colour,
  // and texture bindings differ. This lets Three share one compiled program.
  material.customProgramCacheKey = () => `facade-metre-pbr-v5-${instancedWorldSpace ? 'world' : 'local'}`;
  return material;
}

export function createFacadeMaterial(
  textures,
  styleIndex = 0,
  seed = 0,
  unlit = false,
  heightM = 12,
  toneIndex = null,
  instancedWorldSpace = false,
  brickFinish = 'smooth',
) {
  const style = ((styleIndex % STYLE_SURFACES.length) + STYLE_SURFACES.length) % STYLE_SURFACES.length;
  const regularBrick=style===1&&brickFinish!=='rough';
  const surface = textures[regularBrick?4:STYLE_SURFACES[style]];
  const tone = Number.isInteger(toneIndex) ? rowhouseTone(toneIndex) : ROWHOUSE_TONES[0];
  const shared = {
    map: surface.map,
    color: facadeTint(style, seed, tone),
    fog: true,
  };
  const material = unlit
    ? new THREE.MeshBasicMaterial(shared)
    : new THREE.MeshStandardMaterial({
        ...shared,
        normalMap: surface.normal??null,
        normalScale: new THREE.Vector2(STYLE_RELIEF[style],STYLE_RELIEF[style]),
        bumpMap: surface.bump??null,
        bumpScale: regularBrick?-0.052:1,
        roughnessMap: surface.arm??null,
        aoMap: surface.arm??null,
        aoMapIntensity: 0.35,
        roughness: regularBrick?.9:STYLE_ROUGHNESS[style],
        metalness: 0,
      });
  return applyMetreScaledUvs(material, seed, style, heightM, tone, instancedWorldSpace);
}
