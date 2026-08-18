import * as THREE from 'three';

const FABRIC_ROOT = '/textures/renderer-c/fabrics';
const BODY_MORPHS = /rc_live_(?:weight|muscle|proportions)_(?:pos|neg)/;
const WARDROBE_HDR_LUMINANCE_CEILING = 0.9;
const textureCache = new Map();

export const RENDERER_C_DRESS_DETAIL_PATTERNS = Object.freeze({
  plain: 0,
  'double-stitch': 1,
  chevron: 2,
  diamond: 3,
  braid: 4,
  vine: 5,
});

export const RENDERER_C_FABRICS = Object.freeze({
  cotton: Object.freeze({ roughness: 0.94, normalScale: 0.42, sheen: 0.02, sheenRoughness: 0.96, anisotropy: 0, specularIntensity: 0.18, envMapIntensity: 0.18, repeat: 1.65 }),
  wool: Object.freeze({ roughness: 0.92, normalScale: 0.48, sheen: 0.05, sheenRoughness: 0.94, anisotropy: 0.03, specularIntensity: 0.20, envMapIntensity: 0.20, repeat: 1.5 }),
  silk: Object.freeze({ roughness: 0.72, normalScale: 0.28, sheen: 0.10, sheenRoughness: 0.88, anisotropy: 0.22, specularIntensity: 0.22, envMapIntensity: 0.18, repeat: 1.45 }),
  velvet: Object.freeze({ roughness: 0.90, normalScale: 0.24, sheen: 0.16, sheenRoughness: 0.91, anisotropy: 0.05, specularIntensity: 0.19, envMapIntensity: 0.18, repeat: 1.4 }),
  brocade: Object.freeze({ roughness: 0.84, normalScale: 0.62, sheen: 0.09, sheenRoughness: 0.90, anisotropy: 0.06, specularIntensity: 0.22, envMapIntensity: 0.21, repeat: 0.95 }),
});

export const RENDERER_C_WOMEN_PALETTES = Object.freeze({
  custom: null,
  'plum-taupe': Object.freeze({ primary: '#38202f', secondary: '#817064', accent: '#b08a62' }),
  'forest-cream': Object.freeze({ primary: '#183326', secondary: '#c2b79a', accent: '#74523c' }),
  'navy-burgundy': Object.freeze({ primary: '#202d43', secondary: '#65313a', accent: '#b49b72' }),
  'rust-olive': Object.freeze({ primary: '#663526', secondary: '#4f5638', accent: '#c0a16f' }),
  'dove-mauve': Object.freeze({ primary: '#555765', secondary: '#826274', accent: '#c2ae91' }),
  mourning: Object.freeze({ primary: '#171719', secondary: '#343137', accent: '#676069' }),
});

export const RENDERER_C_WOMEN_WARDROBE_IDS = Object.freeze(new Set([
  'womenGarmentMode', 'womenPalette', 'fabricType', 'fabricScale', 'fabricRelief', 'fabricSheen',
  'dressColor', 'secondaryColor', 'trimColor', 'fabricRoughness', 'necklineHeight', 'collarHeight',
  'cuffWidth', 'trimWidth', 'placketWidth', 'buttonCount', 'buttonSpacing', 'waistHeight',
  'dressDetailPattern', 'dressDetailAmount', 'dressDetailScale', 'collarThickness', 'cuffThickness',
]));

export function rendererCWomenPalette(id) {
  return RENDERER_C_WOMEN_PALETTES[id] || null;
}

function clamp(value, minimum = 0, maximum = 1) {
  return Math.max(minimum, Math.min(maximum, Number(value) || 0));
}

export function rendererCFabricMaterialSettings(fabricType, values = {}) {
  const fabric = RENDERER_C_FABRICS[fabricType] ? fabricType : 'wool';
  const preset = RENDERER_C_FABRICS[fabric];
  const relief = clamp(values.fabricRelief ?? 0.72, 0, 1.5);
  const sheenControl = clamp(values.fabricSheen ?? 0.72, 0, 1.5);
  const roughnessControl = clamp(values.fabricRoughness ?? 1, 0.35, 1.5);
  return Object.freeze({
    fabric,
    roughness: clamp(preset.roughness + (roughnessControl - 1) * 0.18, 0.72, 0.98),
    normalScale: preset.normalScale * relief,
    sheen: clamp(preset.sheen * sheenControl, 0, 0.18),
    sheenRoughness: preset.sheenRoughness,
    anisotropy: clamp(preset.anisotropy * Math.min(sheenControl, 1.2), 0, 0.27),
    specularIntensity: preset.specularIntensity,
    envMapIntensity: preset.envMapIntensity,
    clearcoat: 0,
  });
}

function materialsOf(object) {
  return (Array.isArray(object.material) ? object.material : [object.material]).filter(Boolean);
}

function replaceMaterials(object, transform) {
  if (!object?.isMesh && !object?.isSkinnedMesh) return;
  if (Array.isArray(object.material)) object.material = object.material.map(transform);
  else if (object.material) object.material = transform(object.material);
}

function physicalMaterial(material) {
  if (material.isMeshPhysicalMaterial) return material;
  if (!material.isMeshStandardMaterial) return material;
  const upgraded = new THREE.MeshPhysicalMaterial({
    color: material.color,
    roughness: material.roughness,
    metalness: material.metalness,
    map: material.map,
    lightMap: material.lightMap,
    lightMapIntensity: material.lightMapIntensity,
    aoMap: material.aoMap,
    aoMapIntensity: material.aoMapIntensity,
    emissive: material.emissive,
    emissiveIntensity: material.emissiveIntensity,
    emissiveMap: material.emissiveMap,
    bumpMap: material.bumpMap,
    bumpScale: material.bumpScale,
    normalMap: material.normalMap,
    normalScale: material.normalScale,
    displacementMap: material.displacementMap,
    displacementScale: material.displacementScale,
    displacementBias: material.displacementBias,
    roughnessMap: material.roughnessMap,
    metalnessMap: material.metalnessMap,
    alphaMap: material.alphaMap,
    envMap: material.envMap,
    envMapRotation: material.envMapRotation,
    envMapIntensity: material.envMapIntensity,
    wireframe: material.wireframe,
    wireframeLinewidth: material.wireframeLinewidth,
    flatShading: material.flatShading,
    vertexColors: material.vertexColors,
    fog: material.fog,
    side: material.side,
    opacity: material.opacity,
    transparent: material.transparent,
    alphaTest: material.alphaTest,
    depthTest: material.depthTest,
    depthWrite: material.depthWrite,
  });
  upgraded.name = material.name;
  upgraded.userData = { ...material.userData };
  material.dispose();
  return upgraded;
}

function garmentMeshes(root) {
  const meshes = [];
  root.traverse((object) => {
    if (!object.isMesh && !object.isSkinnedMesh) return;
    if (/^RendererC_(?:BaseGarment|VictorianDress|VictorianDressFitSource|GoldenDress)/.test(object.name)
      || object.userData?.renderer_c_wardrobe_surface) meshes.push(object);
  });
  return meshes;
}

function baseTexture(fabric, channel) {
  if (typeof document === 'undefined') return null;
  const key = `${fabric}:${channel}`;
  if (textureCache.has(key)) return textureCache.get(key);
  const texture = new THREE.TextureLoader().load(`${FABRIC_ROOT}/${fabric}-${channel}.png`);
  texture.name = `RendererC_${fabric}_${channel}`;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = channel === 'albedo' ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  texture.anisotropy = 8;
  textureCache.set(key, texture);
  return texture;
}

// Garment-scale folds, layered under the weave normals in the shader. One
// generated tiling texture (scripts/textures/generate-wrinkle-normal.mjs)
// sampled at a much lower repeat than the weave.
let wrinkleTexture = null;

function baseWrinkleTexture() {
  if (typeof document === 'undefined') return null;
  if (wrinkleTexture) return wrinkleTexture;
  wrinkleTexture = new THREE.TextureLoader().load(`${FABRIC_ROOT}/wrinkles-normal.png`);
  wrinkleTexture.name = 'RendererC_wrinkles_normal';
  wrinkleTexture.wrapS = THREE.RepeatWrapping;
  wrinkleTexture.wrapT = THREE.RepeatWrapping;
  wrinkleTexture.colorSpace = THREE.NoColorSpace;
  wrinkleTexture.anisotropy = 8;
  return wrinkleTexture;
}

// Blends the fold normals into whatever the weave map produced. UDN-style
// blend in tangent space via the frame three already built for the weave.
function applyWrinkleLayer(material, strength, weaveRepeat) {
  const texture = baseWrinkleTexture();
  if (!(strength > 0) || !texture) return;
  // The wrinkle texture should span roughly the whole garment while the
  // weave tiles many times: divide the weave repeat back out.
  const uvScale = 1.35 / Math.max(weaveRepeat, 0.001);
  const settings = material.userData.rendererCWrinkles ||= {};
  settings.strength = strength;
  settings.uvScale = uvScale;
  if (settings.patched) return;
  settings.patched = true;
  const previousCompile = material.onBeforeCompile;
  const previousCacheKey = material.customProgramCacheKey?.bind(material) || (() => '');
  material.onBeforeCompile = (shader, renderer) => {
    previousCompile?.(shader, renderer);
    shader.uniforms.rcWrinkleMap = { value: texture };
    shader.uniforms.rcWrinkleStrength = { value: settings.strength };
    shader.uniforms.rcWrinkleUvScale = { value: settings.uvScale };
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <normal_pars_fragment>', `#include <normal_pars_fragment>
uniform sampler2D rcWrinkleMap;
uniform float rcWrinkleStrength;
uniform float rcWrinkleUvScale;`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
#if defined( USE_NORMALMAP_TANGENTSPACE )
vec3 rcWrinkleSample = texture2D( rcWrinkleMap, vNormalMapUv * rcWrinkleUvScale ).xyz * 2.0 - 1.0;
normal = normalize( normal + tbn * vec3( rcWrinkleSample.xy * rcWrinkleStrength, 0.0 ) );
#endif`);
  };
  material.customProgramCacheKey = () => `${previousCacheKey()}|renderer-c-wrinkles-v1`;
  material.needsUpdate = true;
}

function assignedTexture(material, fabric, channel) {
  const store = material.userData.rendererCFabricTextures ||= {};
  const current = store[channel];
  if (current?.userData?.rendererCFabric === fabric) return current;
  current?.dispose?.();
  const source = baseTexture(fabric, channel);
  if (!source) return null;
  const texture = source.clone();
  texture.userData.rendererCFabric = fabric;
  texture.needsUpdate = true;
  store[channel] = texture;
  return texture;
}

function ensureGarmentUv(mesh) {
  const geometry = mesh.geometry;
  if (!geometry?.attributes?.position || geometry.userData.rendererCWardrobeUv) return;
  geometry.computeBoundingBox();
  const { min, max } = geometry.boundingBox;
  const span = new THREE.Vector3().subVectors(max, min);
  const centerX = (min.x + max.x) * 0.5;
  const positions = geometry.attributes.position;
  const uv = new Float32Array(positions.count * 2);
  const skirt = /VictorianDress_Mesh/.test(mesh.name) && !/FitSource/.test(mesh.name);
  for (let index = 0; index < positions.count; index += 1) {
    const x = positions.getX(index);
    const y = positions.getY(index);
    const z = positions.getZ(index);
    let u;
    let v;
    if (skirt) {
      u = Math.atan2(x - centerX, z - (min.z + max.z) * 0.5) / (Math.PI * 2) + 0.5;
      v = (y - min.y) / Math.max(1e-5, span.y);
    } else if (Math.abs(x - centerX) > span.x * 0.22) {
      u = (z - min.z) / Math.max(1e-5, span.z);
      v = Math.abs(x - centerX) / Math.max(1e-5, span.x * 0.5);
    } else {
      u = (x - min.x) / Math.max(1e-5, span.x);
      v = (y - min.y) / Math.max(1e-5, span.y);
    }
    uv[index * 2] = u;
    uv[index * 2 + 1] = v;
  }
  geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geometry.userData.rendererCWardrobeUv = true;
}

function preventWardrobeBloom(material) {
  if (material.userData.rendererCWardrobeBloomGuard) return;
  material.userData.rendererCWardrobeBloomGuard = true;
  const previousCompile = material.onBeforeCompile;
  const previousCacheKey = material.customProgramCacheKey?.bind(material) || (() => '');
  material.onBeforeCompile = (shader, renderer) => {
    previousCompile?.(shader, renderer);
    shader.fragmentShader = shader.fragmentShader.replace('#include <opaque_fragment>', `
float rcWardrobeLuminance = dot(outgoingLight, vec3(0.2126, 0.7152, 0.0722));
outgoingLight *= min(1.0, ${WARDROBE_HDR_LUMINANCE_CEILING.toFixed(1)} / max(rcWardrobeLuminance, 0.0001));
#include <opaque_fragment>`);
  };
  material.customProgramCacheKey = () => `${previousCacheKey()}|renderer-c-wardrobe-bloom-guard-v1`;
  material.needsUpdate = true;
}

function configureFabric(material, values, { color, fabricType } = {}) {
  const settings = rendererCFabricMaterialSettings(fabricType, values);
  const { fabric } = settings;
  const preset = RENDERER_C_FABRICS[fabric];
  const scale = clamp(values.fabricScale ?? 1, 0.45, 2.5);
  if (material.color && color) material.color.set(color);
  if ('roughness' in material) material.roughness = settings.roughness;
  if ('metalness' in material) material.metalness = 0;
  if ('sheen' in material) material.sheen = settings.sheen;
  if ('sheenRoughness' in material) material.sheenRoughness = settings.sheenRoughness;
  if (material.sheenColor) material.sheenColor.set(color || '#ffffff');
  if ('anisotropy' in material) material.anisotropy = settings.anisotropy;
  if ('specularIntensity' in material) material.specularIntensity = settings.specularIntensity;
  if ('envMapIntensity' in material) material.envMapIntensity = settings.envMapIntensity;
  if ('ior' in material) material.ior = 1.3;
  if ('clearcoat' in material) material.clearcoat = settings.clearcoat;
  if ('clearcoatRoughness' in material) material.clearcoatRoughness = 1;
  if ('transmission' in material) material.transmission = 0;
  if ('iridescence' in material) material.iridescence = 0;
  material.map = assignedTexture(material, fabric, 'albedo');
  material.roughnessMap = assignedTexture(material, fabric, 'roughness');
  material.normalMap = assignedTexture(material, fabric, 'normal');
  const repeat = preset.repeat * scale;
  for (const texture of [material.map, material.roughnessMap, material.normalMap]) {
    texture?.repeat?.set(repeat, repeat);
  }
  if (material.normalScale) material.normalScale.setScalar(settings.normalScale);
  applyWrinkleLayer(material, Number(values.clothingWrinkles) || 0, repeat);
  material.side = THREE.DoubleSide;
  material.transparent = false;
  material.opacity = 1;
  material.alphaTest = 0;
  material.depthWrite = true;
  // Bloom runs before tone mapping. Keep matte cloth below the HDR range
  // reserved for flames and the sun.
  preventWardrobeBloom(material);
  material.needsUpdate = true;
}

function updateGoldenDetailShader(material, values) {
  let state = material.userData.rendererCGoldenDetailShader;
  if (!state) {
    state = {
      pattern: { value: 0 },
      amount: { value: 0 },
      scale: { value: 1 },
      color: { value: new THREE.Color('#c3a56d') },
    };
    material.userData.rendererCGoldenDetailShader = state;
    const previousCompile = material.onBeforeCompile;
    const previousCacheKey = material.customProgramCacheKey?.bind(material) || (() => '');
    material.onBeforeCompile = (shader, renderer) => {
      previousCompile?.(shader, renderer);
      Object.assign(shader.uniforms, {
        rcDressDetailPattern: state.pattern,
        rcDressDetailAmount: state.amount,
        rcDressDetailScale: state.scale,
        rcDressDetailColor: state.color,
      });
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>
uniform float rcDressDetailPattern;
uniform float rcDressDetailAmount;
uniform float rcDressDetailScale;
uniform vec3 rcDressDetailColor;
float rcDressStitchMask = 0.0;`)
        .replace('#include <map_fragment>', `#include <map_fragment>
#ifdef USE_MAP
vec2 rcDetailUv = fract(vMapUv * vec2(18.0, 12.0) * rcDressDetailScale);
float rcThreadDistance = 1.0;
if (rcDressDetailPattern > 0.5 && rcDressDetailPattern < 1.5) {
  rcThreadDistance = min(abs(rcDetailUv.y - 0.42), abs(rcDetailUv.y - 0.58));
} else if (rcDressDetailPattern < 2.5) {
  rcThreadDistance = abs(rcDetailUv.y - (0.24 + abs(rcDetailUv.x - 0.5) * 0.92));
} else if (rcDressDetailPattern < 3.5) {
  rcThreadDistance = min(abs(rcDetailUv.y - rcDetailUv.x), abs(rcDetailUv.y - (1.0 - rcDetailUv.x)));
} else if (rcDressDetailPattern < 4.5) {
  float rcWave = sin(rcDetailUv.x * 6.2831853);
  rcThreadDistance = min(abs(rcDetailUv.y - (0.5 + rcWave * 0.18)), abs(rcDetailUv.y - (0.5 - rcWave * 0.18)));
} else if (rcDressDetailPattern < 5.5) {
  float rcVine = abs(rcDetailUv.y - (0.5 + sin(rcDetailUv.x * 6.2831853) * 0.17));
  float rcLeafA = length(rcDetailUv - vec2(0.25, 0.67));
  float rcLeafB = length(rcDetailUv - vec2(0.75, 0.33));
  rcThreadDistance = min(rcVine, min(rcLeafA, rcLeafB) * 0.62);
}
float rcThreadWidth = mix(0.006, 0.018, clamp(rcDressDetailAmount / 1.5, 0.0, 1.0));
float rcThreadAa = max(fwidth(rcThreadDistance), 0.003);
rcDressStitchMask = (1.0 - smoothstep(rcThreadWidth, rcThreadWidth + rcThreadAa, rcThreadDistance))
  * clamp(rcDressDetailAmount, 0.0, 1.5) * step(0.5, rcDressDetailPattern);
diffuseColor.rgb = mix(diffuseColor.rgb, rcDressDetailColor, clamp(rcDressStitchMask * 0.38, 0.0, 0.55));
#endif`)
        .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
roughnessFactor = clamp(roughnessFactor - rcDressStitchMask * 0.055, 0.58, 1.0);`);
    };
    material.customProgramCacheKey = () => `${previousCacheKey()}|renderer-c-golden-detail-v2`;
    material.needsUpdate = true;
  }
  state.pattern.value = RENDERER_C_DRESS_DETAIL_PATTERNS[values.dressDetailPattern] ?? 0;
  state.amount.value = clamp(values.dressDetailAmount ?? 0.72, 0, 1.5);
  state.scale.value = clamp(values.dressDetailScale ?? 1, 0.5, 2.5);
  state.color.value.set(values.trimColor || '#c3a56d');
}

function bodyCoverageAttribute(body) {
  const geometry = body?.geometry;
  const skinIndex = geometry?.attributes?.skinIndex;
  const skinWeight = geometry?.attributes?.skinWeight;
  const position = geometry?.attributes?.position;
  if (!body?.isSkinnedMesh || !skinIndex || !skinWeight || !position || !body.skeleton) return null;
  if (geometry.attributes.rcWardrobeCoverage) return geometry.attributes.rcWardrobeCoverage;
  const coverage = new Float32Array(skinIndex.count);
  const exposed = /(?:head|neck|hand|finger|thumb)/i;
  const covered = /(?:hips|pelvis|spine|shoulder|arm|forearm|upleg|thigh|leg|calf|foot|toe)/i;
  for (let vertex = 0; vertex < skinIndex.count; vertex += 1) {
    let dominantWeight = -1;
    let dominantName = '';
    for (let influence = 0; influence < skinIndex.itemSize; influence += 1) {
      const weight = skinWeight.getComponent(vertex, influence);
      if (weight <= dominantWeight) continue;
      dominantWeight = weight;
      dominantName = body.skeleton.bones[skinIndex.getComponent(vertex, influence)]?.name || '';
    }
    const neckAndCenterChest = position.getY(vertex) > 1.18 && Math.abs(position.getX(vertex)) < 0.13;
    coverage[vertex] = covered.test(dominantName) && !exposed.test(dominantName) && !neckAndCenterChest ? 1 : 0;
  }
  const attribute = new THREE.BufferAttribute(coverage, 1);
  geometry.setAttribute('rcWardrobeCoverage', attribute);
  return attribute;
}

function updateGoldenDressFit(root, values) {
  const details = root.getObjectByName('RendererC_GoldenDressDetails');
  details?.traverse?.((mesh) => {
    if (!mesh.isSkinnedMesh || !mesh.morphTargetDictionary || !mesh.morphTargetInfluences) return;
    const set = (name, value) => {
      const index = mesh.morphTargetDictionary[name];
      if (index !== undefined) mesh.morphTargetInfluences[index] = value;
    };
    set('rc_dress_bust_coverage', clamp(values.necklineHeight ?? 0.78));
    set('rc_dress_collar_height', clamp((values.collarHeight ?? 0.86) / 1.4));
    set('rc_dress_cuff_width', clamp(values.cuffWidth ?? 0.58));
    set('rc_dress_collar_thickness', clamp(values.collarThickness ?? 0.35, 0, 1.5));
    set('rc_dress_cuff_thickness', clamp(values.cuffThickness ?? 0.35, 0, 1.5));
  });
}

function updateBodyCoverage(root, enabled) {
  const body = root.getObjectByName('Human_Body');
  if (!bodyCoverageAttribute(body)) return;
  for (const material of materialsOf(body)) {
    let state = material.userData.rendererCWardrobeBodyMask;
    if (!state) {
      state = { enabled: { value: 0 } };
      material.userData.rendererCWardrobeBodyMask = state;
      const previousCompile = material.onBeforeCompile;
      const previousCacheKey = material.customProgramCacheKey?.bind(material) || (() => '');
      material.onBeforeCompile = (shader, renderer) => {
        previousCompile?.(shader, renderer);
        shader.uniforms.rcWardrobeBodyMaskEnabled = state.enabled;
        shader.vertexShader = shader.vertexShader
          .replace('#include <common>', `#include <common>
attribute float rcWardrobeCoverage;
varying float vRcWardrobeCoverage;`)
          .replace('#include <begin_vertex>', `#include <begin_vertex>
vRcWardrobeCoverage = rcWardrobeCoverage;`);
        shader.fragmentShader = shader.fragmentShader
          .replace('#include <common>', `#include <common>
uniform float rcWardrobeBodyMaskEnabled;
varying float vRcWardrobeCoverage;`)
          .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
if (rcWardrobeBodyMaskEnabled > 0.5 && vRcWardrobeCoverage > 0.48) discard;`);
      };
      material.customProgramCacheKey = () => `${previousCacheKey()}|renderer-c-wardrobe-body-mask-v1`;
      material.needsUpdate = true;
    }
    state.enabled.value = enabled ? 1 : 0;
  }
}

function shaderState(material, role, bounds) {
  const current = material.userData.rendererCWardrobeShader;
  if (current?.role === role) return current;
  const previousCompile = material.onBeforeCompile;
  const previousCacheKey = material.customProgramCacheKey?.bind(material) || (() => '');
  const state = {
    role,
    secondary: { value: new THREE.Color() },
    accent: { value: new THREE.Color() },
    boundsMin: { value: bounds.min.clone() },
    boundsMax: { value: bounds.max.clone() },
    necklineHeight: { value: 0.75 },
    cuffWidth: { value: 0.5 },
    trimWidth: { value: 0.5 },
    placketWidth: { value: 0.5 },
    waistHeight: { value: 0 },
  };
  material.userData.rendererCWardrobeShader = state;
  material.onBeforeCompile = (shader, renderer) => {
    previousCompile?.(shader, renderer);
    Object.assign(shader.uniforms, {
      rcSecondary: state.secondary,
      rcAccent: state.accent,
      rcBoundsMin: state.boundsMin,
      rcBoundsMax: state.boundsMax,
      rcNecklineHeight: state.necklineHeight,
      rcCuffWidth: state.cuffWidth,
      rcTrimWidth: state.trimWidth,
      rcPlacketWidth: state.placketWidth,
      rcWaistHeight: state.waistHeight,
    });
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vRcWardrobePosition;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvRcWardrobePosition = position;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
varying vec3 vRcWardrobePosition;
uniform vec3 rcSecondary;
uniform vec3 rcAccent;
uniform vec3 rcBoundsMin;
uniform vec3 rcBoundsMax;
uniform float rcNecklineHeight;
uniform float rcCuffWidth;
uniform float rcTrimWidth;
uniform float rcPlacketWidth;
uniform float rcWaistHeight;`)
      .replace('#include <map_fragment>', `#include <map_fragment>
#ifdef USE_MAP
  vec3 rcFabric = sampledDiffuseColor.rgb;
#else
  vec3 rcFabric = vec3(1.0);
#endif
vec3 rcSpan = max(rcBoundsMax - rcBoundsMin, vec3(0.0001));
vec3 rcP = (vRcWardrobePosition - rcBoundsMin) / rcSpan;
float rcX = abs(rcP.x - 0.5) * 2.0;
${role === 'shell' ? `
float rcTorso = 1.0 - smoothstep(0.36, 0.55, rcX);
float rcFront = smoothstep(0.42, 0.64, rcP.z);
float rcWaistCenter = clamp(0.535 + rcWaistHeight * 0.42, 0.42, 0.66);
float rcBandWidth = mix(0.008, 0.038, rcTrimWidth);
float rcWaist = (1.0 - smoothstep(rcBandWidth, rcBandWidth + 0.012, abs(rcP.y - rcWaistCenter))) * rcTorso;
float rcCuffThreshold = mix(1.01, 0.70, rcCuffWidth);
float rcCuff = smoothstep(rcCuffThreshold, min(1.02, rcCuffThreshold + 0.035), rcX);
float rcPlacketHalf = mix(0.008, 0.065, rcPlacketWidth);
float rcPlacket = (1.0 - smoothstep(rcPlacketHalf, rcPlacketHalf + 0.018, abs(rcP.x - 0.5)))
  * rcTorso * rcFront * smoothstep(0.50, 0.58, rcP.y) * (1.0 - smoothstep(0.83, 0.93, rcP.y));
diffuseColor.rgb = mix(diffuseColor.rgb, rcSecondary * rcFabric, max(rcWaist, rcCuff));
diffuseColor.rgb = mix(diffuseColor.rgb, rcAccent * rcFabric, rcPlacket);` : ''}
${role === 'neckline' ? `
float rcTop = mix(0.03, 0.98, rcNecklineHeight);
if (rcNecklineHeight < 0.015 || rcP.y > rcTop) discard;
float rcEdgeWidth = mix(0.008, 0.035, rcTrimWidth);
float rcEdge = 1.0 - smoothstep(rcEdgeWidth, rcEdgeWidth + 0.018, abs(rcP.y - rcTop));
diffuseColor.rgb = mix(diffuseColor.rgb, rcAccent * rcFabric, rcEdge);` : ''}
${role === 'cuff' ? `
float rcFromWrist = 1.0 - rcX;
float rcLimit = mix(0.0, 0.34, rcCuffWidth);
if (rcCuffWidth < 0.015 || rcFromWrist > rcLimit) discard;
float rcEdgeWidth = mix(0.01, 0.045, rcTrimWidth);
float rcEdge = 1.0 - smoothstep(rcEdgeWidth, rcEdgeWidth + 0.018, abs(rcFromWrist - rcLimit));
diffuseColor.rgb = mix(diffuseColor.rgb, rcAccent * rcFabric, rcEdge);` : ''}`);
  };
  material.customProgramCacheKey = () => `${previousCacheKey()}|renderer-c-wardrobe-v1:${role}`;
  material.needsUpdate = true;
  return state;
}

function updateShader(material, values, bounds) {
  const state = material.userData.rendererCWardrobeShader;
  if (!state) return;
  state.secondary.value.set(values.secondaryColor || '#817064');
  state.accent.value.set(values.trimColor || '#b08a62');
  state.boundsMin.value.copy(bounds.min);
  state.boundsMax.value.copy(bounds.max);
  state.necklineHeight.value = clamp(values.necklineHeight ?? 0.78);
  state.cuffWidth.value = clamp(values.cuffWidth ?? 0.58);
  state.trimWidth.value = clamp(values.trimWidth ?? 0.42);
  state.placketWidth.value = clamp(values.placketWidth ?? 0.34);
  state.waistHeight.value = clamp(values.waistHeight ?? 0, -0.12, 0.12);
}

function copyAttribute(attribute, sourceIndices) {
  const values = new attribute.array.constructor(sourceIndices.length * attribute.itemSize);
  for (let targetIndex = 0; targetIndex < sourceIndices.length; targetIndex += 1) {
    const sourceIndex = sourceIndices[targetIndex];
    for (let component = 0; component < attribute.itemSize; component += 1) {
      values[targetIndex * attribute.itemSize + component] = attribute.getComponent(sourceIndex, component);
    }
  }
  return new THREE.BufferAttribute(values, attribute.itemSize, attribute.normalized);
}

function skinnedPatch(source, name, trianglePredicate, offset = 0.0025) {
  const sourceGeometry = source?.geometry;
  const index = sourceGeometry?.index;
  const position = sourceGeometry?.attributes?.position;
  if (!source?.isSkinnedMesh || !source.skeleton || !index || !position
    || !sourceGeometry.attributes.skinIndex || !sourceGeometry.attributes.skinWeight) return null;

  const selected = [];
  for (let triangle = 0; triangle < index.count; triangle += 3) {
    const indices = [index.getX(triangle), index.getX(triangle + 1), index.getX(triangle + 2)];
    const centroid = new THREE.Vector3();
    for (const vertex of indices) centroid.add(new THREE.Vector3().fromBufferAttribute(position, vertex));
    centroid.multiplyScalar(1 / 3);
    if (trianglePredicate(centroid)) selected.push(...indices);
  }
  if (!selected.length) return null;

  const sourceIndices = [];
  const remap = new Map();
  const remappedIndex = new Uint32Array(selected.length);
  for (let indexPosition = 0; indexPosition < selected.length; indexPosition += 1) {
    const sourceIndex = selected[indexPosition];
    if (!remap.has(sourceIndex)) {
      remap.set(sourceIndex, sourceIndices.length);
      sourceIndices.push(sourceIndex);
    }
    remappedIndex[indexPosition] = remap.get(sourceIndex);
  }

  const geometry = new THREE.BufferGeometry();
  for (const id of ['position', 'normal', 'skinIndex', 'skinWeight']) {
    const attribute = sourceGeometry.attributes[id];
    if (attribute) geometry.setAttribute(id, copyAttribute(attribute, sourceIndices));
  }
  const patchPosition = geometry.attributes.position;
  const patchNormal = geometry.attributes.normal;
  if (patchNormal) {
    for (let vertex = 0; vertex < patchPosition.count; vertex += 1) {
      patchPosition.setXYZ(
        vertex,
        patchPosition.getX(vertex) + patchNormal.getX(vertex) * offset,
        patchPosition.getY(vertex) + patchNormal.getY(vertex) * offset,
        patchPosition.getZ(vertex) + patchNormal.getZ(vertex) * offset,
      );
    }
  }
  geometry.setIndex(new THREE.BufferAttribute(remappedIndex, 1));
  geometry.morphTargetsRelative = sourceGeometry.morphTargetsRelative;
  const keptMorphNames = Object.entries(source.morphTargetDictionary || {})
    .filter(([morphName]) => BODY_MORPHS.test(morphName));
  geometry.morphAttributes.position = keptMorphNames.map(([, sourceMorphIndex]) => (
    copyAttribute(sourceGeometry.morphAttributes.position[sourceMorphIndex], sourceIndices)
  ));
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();

  const mesh = new THREE.SkinnedMesh(geometry, new THREE.MeshPhysicalMaterial({ color: '#817064' }));
  mesh.name = name;
  mesh.userData.renderer_c_role = 'clothe';
  mesh.userData.renderer_c_wardrobe_surface = true;
  mesh.skeleton = source.skeleton;
  mesh.bindMode = source.bindMode;
  mesh.bindMatrix.copy(source.bindMatrix);
  mesh.bindMatrixInverse.copy(source.bindMatrixInverse);
  mesh.morphTargetDictionary = Object.fromEntries(keptMorphNames.map(([morphName], morphIndex) => [morphName, morphIndex]));
  mesh.morphTargetInfluences = keptMorphNames.map(([, sourceMorphIndex]) => source.morphTargetInfluences?.[sourceMorphIndex] || 0);
  mesh.position.copy(source.position);
  mesh.quaternion.copy(source.quaternion);
  mesh.scale.copy(source.scale);
  mesh.frustumCulled = false;
  return mesh;
}

function ensureBodyBoundDetails(root) {
  let neckline = root.getObjectByName('RendererC_WardrobeNeckline');
  const body = root.getObjectByName('Human_Body');
  if (!neckline && body?.isSkinnedMesh) {
    neckline = skinnedPatch(body, 'RendererC_WardrobeNeckline', (point) => {
      const rise = clamp((point.y - 0.42) / 0.45);
      const halfWidth = 0.17 - rise * 0.07;
      return point.y > 0.40 && point.y < 0.89 && Math.abs(point.x) < halfWidth && point.z > 0.05;
    }, 0.0035);
    if (neckline) body.parent.add(neckline);
  }

  let cuffs = root.getObjectByName('RendererC_WardrobeCuffs');
  const carrier = root.getObjectByName('RendererC_BaseGarment');
  if (!cuffs && carrier?.isSkinnedMesh) {
    carrier.geometry.computeBoundingBox();
    const centerX = (carrier.geometry.boundingBox.min.x + carrier.geometry.boundingBox.max.x) * 0.5;
    // A shallow offset: the cuff should read as a band of the sleeve, not a
    // ring floating around it.
    cuffs = skinnedPatch(carrier, 'RendererC_WardrobeCuffs', (point) => (
      Math.abs(point.x - centerX) > 0.34 && point.y < 0.53
    ), 0.0012);
    if (cuffs) carrier.parent.add(cuffs);
  }
  return { neckline, cuffs, carrier };
}

function ensureButtons(root, accentColor) {
  const carrier = root.getObjectByName('RendererC_BaseGarment');
  const spine = carrier?.skeleton?.bones?.find((bone) => /Spine2$/.test(bone.name));
  if (!carrier || !spine) return null;
  let group = root.getObjectByName('RendererC_WardrobeButtons');
  if (group) return group;
  root.updateMatrixWorld(true);
  group = new THREE.Group();
  group.name = 'RendererC_WardrobeButtons';
  group.userData.renderer_c_role = 'clothe';
  const geometry = new THREE.SphereGeometry(0.0085, 12, 8);
  const material = new THREE.MeshPhysicalMaterial({ color: accentColor, roughness: 0.44, metalness: 0.06 });
  carrier.geometry.computeBoundingBox();
  const bounds = carrier.geometry.boundingBox;
  const front = bounds.max.z - (bounds.max.z - bounds.min.z) * 0.035;
  for (let index = 0; index < 9; index += 1) {
    const button = new THREE.Mesh(geometry, material);
    button.name = `RendererC_WardrobeButton_${index + 1}`;
    const point = new THREE.Vector3(0, 0.655 - index * 0.042, front);
    carrier.localToWorld(point);
    spine.worldToLocal(point);
    button.position.copy(point);
    button.castShadow = true;
    group.add(button);
  }
  spine.add(group);
  return group;
}

function updateButtons(group, values) {
  if (!group) return;
  const count = Math.round(clamp(values.buttonCount ?? 6, 4, 9));
  const spacing = clamp(values.buttonSpacing ?? 0.95, 0.7, 1.35);
  const accent = values.trimColor || '#b08a62';
  for (let index = 0; index < group.children.length; index += 1) {
    const button = group.children[index];
    button.visible = index < count;
    button.position.y = group.children[0].position.y - index * 0.042 * spacing;
    button.material.color.set(accent);
  }
}

export function applyRendererCWomenWardrobeSurface(root, values = {}) {
  const primary = values.dressColor || '#38202f';
  const secondary = values.secondaryColor || '#817064';
  const accent = values.trimColor || '#b08a62';
  const fabricType = RENDERER_C_FABRICS[values.fabricType] ? values.fabricType : 'wool';
  const { neckline, cuffs } = ensureBodyBoundDetails(root);

  for (const mesh of garmentMeshes(root)) {
    replaceMaterials(mesh, physicalMaterial);
    ensureGarmentUv(mesh);
    mesh.geometry.computeBoundingBox();
    const trim = materialsOf(mesh).some((material) => /Trim/.test(material.name));
    const golden = /^RendererC_GoldenDress/.test(mesh.name)
      || materialsOf(mesh).some((material) => /RendererC_GoldenDress_/.test(material.name));
    const role = mesh === neckline ? 'neckline' : mesh === cuffs ? 'cuff' : 'shell';
    for (const material of materialsOf(mesh)) {
      const materialTrim = /Trim/.test(material.name);
      const goldenColor = /Accent/.test(material.name)
        ? accent
        : /Secondary/.test(material.name) ? secondary : primary;
      configureFabric(material, values, {
        color: golden
          ? goldenColor
          : role === 'neckline' || role === 'cuff' ? secondary : materialTrim || trim ? accent : primary,
        fabricType,
      });
      if (golden && /(?:Secondary|Accent)/.test(material.name)) updateGoldenDetailShader(material, values);
      if (!golden && !materialTrim) {
        shaderState(material, role, mesh.geometry.boundingBox);
        updateShader(material, { ...values, secondaryColor: secondary, trimColor: accent }, mesh.geometry.boundingBox);
      }
    }
  }
  updateButtons(ensureButtons(root, accent), values);
  updateGoldenDressFit(root, values);
  const mode = values.womenGarmentMode || 'production-dress';
  updateBodyCoverage(root, mode === 'golden-dress' || mode === 'production-dress');
}

export function setRendererCWomenWardrobeVisible(root, visible) {
  for (const name of ['RendererC_WardrobeNeckline', 'RendererC_WardrobeCuffs', 'RendererC_WardrobeButtons']) {
    const object = root.getObjectByName(name);
    if (object) object.visible = visible;
  }
  // Retire the former flat yoke/placket experiment. The replacement surfaces
  // above inherit body or garment deformation.
  const legacy = root.getObjectByName('RendererC_VictorianDetails');
  if (legacy) legacy.visible = false;
}
