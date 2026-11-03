import * as THREE from 'three';

export const MODULAR_SKIN_TONES = {
  original: { label: 'Original', gain: [1, 1, 1], lift: 0 },
  fairCool: { label: 'Fair cool', gain: [1.08, 1.10, 1.16], lift: .025 },
  fairWarm: { label: 'Fair warm', gain: [1.12, 1.09, 1.02], lift: .025 },
  rose: { label: 'Rose', gain: [1.07, .99, .99], lift: .010 },
  golden: { label: 'Golden', gain: [.97, .94, .82], lift: .003 },
  olive: { label: 'Olive', gain: [.80, .87, .75], lift: 0 },
  umber: { label: 'Warm brown', gain: [.56, .50, .43], lift: 0 },
  deep: { label: 'Deep brown', gain: [.30, .28, .25], lift: 0 },
};

export const MODULAR_HAIR_TONES = {
  original: { label: 'Original', color: '#39291f', gray: 0 },
  black: { label: 'Soft black', color: '#221e1b', gray: 0 },
  brown: { label: 'Dark brown', color: '#473125', gray: 0 },
  chestnut: { label: 'Chestnut', color: '#68412b', gray: 0 },
  auburn: { label: 'Auburn', color: '#783d26', gray: 0 },
  blond: { label: 'Dark blond', color: '#8e7b5f', gray: 0 },
  mixedGray: { label: 'Salt and pepper', color: '#3c3028', gray: .56 },
  silver: { label: 'Silver', color: '#8d8b84', gray: 1 },
};

export const MODULAR_EYE_TONES = {
  original: { label: 'Original', color: '#735338' },
  brown: { label: 'Brown', color: '#65452c' },
  hazel: { label: 'Hazel', color: '#81734a' },
  green: { label: 'Green', color: '#657763' },
  blue: { label: 'Blue', color: '#6b8291' },
  gray: { label: 'Grey', color: '#818985' },
};

// Untinted hair keeps its texture colour, so the part needs that colour too.
// Returns the original tone's colour where there is no canvas (tests).
function averageHairColor(root) {
  const color = new THREE.Color(MODULAR_HAIR_TONES.original.color);
  let image;
  root.traverse((mesh) => {
    for (const material of [mesh.material].flat()) {
      if (!image && ['Carmela_DarkHair', 'Carmela_CurlyHair'].includes(material?.name)) image = material.map?.image;
    }
  });
  if (!image || typeof document === 'undefined') return color;
  try {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 16;
    const context = canvas.getContext('2d');
    context.drawImage(image, 0, 0, 16, 16);
    const data = context.getImageData(0, 0, 16, 16).data, sum = [0, 0, 0];
    for (let i = 0; i < data.length; i += 4) for (let c = 0; c < 3; c++) sum[c] += data[i+c];
    return color.setRGB(sum[0]/65280, sum[1]/65280, sum[2]/65280, THREE.SRGBColorSpace);
  } catch { return color; }
}

export function createModularAppearance(root, frame) {
  if (!frame) return { available: false, update() {} };
  const referenceTone = root.getObjectByName('Carmela_Face')?.userData.modularSkinReference;
  const reference = MODULAR_SKIN_TONES[referenceTone] || MODULAR_SKIN_TONES.original;
  const uniforms = {
    modularSkinGain: { value: new THREE.Vector3(1, 1, 1) }, modularSkinLift: { value: 0 },
    modularHair: { value: new THREE.Color() }, modularGray: { value: 0 }, modularHairEnabled: { value: 0 },
    modularIris: { value: new THREE.Color() }, modularIrisEnabled: { value: 0 },
    modularEyeCenters: { value: new THREE.Vector4() }, modularEyeRadius: {value:new THREE.Vector2(.049,.103)},
    modularPartHair: { value: averageHairColor(root) },
  };
  const rawX = frame.eyeX/.308;
  const rawZ = ((frame.eyeY-1.4)/.88+.1)/.35;
  const irisV = 1-(rawZ-.60)/.18;
  uniforms.modularEyeCenters.value.set((.21-rawX)/.42, irisV, (.21+rawX)/.42, irisV);
  const left = root.getObjectByName('Carmela_Eye_Left')?.userData.modularIrisCenter;
  const right = root.getObjectByName('Carmela_Eye_Right')?.userData.modularIrisCenter;
  if (left?.length === 2 && right?.length === 2) uniforms.modularEyeCenters.value.set(...left, ...right);
  const irisRadius=root.getObjectByName('Carmela_Eye_Left')?.userData.modularIrisRadius;
  if(irisRadius?.length===2)uniforms.modularEyeRadius.value.fromArray(irisRadius);
  const patched = new Set();
  root.updateMatrixWorld(true);
  root.traverse((mesh) => {
    if (!mesh.geometry || !mesh.material) return;
    for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
      const name = material.name;
      const kind = ['Carmela_DarkHair', 'Carmela_CurlyHair', 'Carmela_HairStrands', 'Patient_FacialHair'].includes(name) ? 'hair' : name === 'Carmela_EyeSurface' ? 'eyes'
        : ['Patient_FacialSkin', 'Patient_Lips', 'Carmela_LidSkin', 'Patient_Hands', 'Patient_WristSkin', 'Carmela_HairPart'].includes(name) ? 'skin' : null;
      if (!kind) continue;
      if (kind === 'skin') {
        if (!mesh.geometry.userData.modularIdentity && !mesh.geometry.userData.modularAppearance) {
          mesh.geometry = mesh.geometry.clone();
          mesh.geometry.userData.modularAppearance = true;
        }
        const position = mesh.geometry.attributes.position, mask = new Float32Array(position.count), point = new THREE.Vector3();
        if (name === 'Patient_FacialSkin') {
          for (let i = 0; i < position.count; i++) {
            point.fromBufferAttribute(position, i);
            if (mesh.isSkinnedMesh) mesh.applyBoneTransform(i, point);
            point.applyMatrix4(mesh.matrixWorld);
            mask[i] = Math.exp(-2*(Math.pow((point.y-frame.eyeY-.023*frame.scale)/(.014*frame.scale), 2)
              +Math.pow((Math.abs(point.x)-.035*frame.scale)/(.027*frame.scale), 2))) * Math.max(0, Math.min(1, (point.z-.05)/.04));
          }
        }
        mesh.geometry.setAttribute('modularBrowMask', new THREE.Float32BufferAttribute(mask, 1));
      }
      if (patched.has(material)) continue;
      patched.add(material);
      const previous = material.onBeforeCompile;
      const nativeSkinGain = new THREE.Vector3(...(name === 'Patient_Hands' ? material.userData.modularNativeSkinGain || reference.gain : [1, 1, 1]));
      material.onBeforeCompile = (shader, renderer) => {
        previous?.(shader, renderer);
        Object.assign(shader.uniforms, uniforms);
        shader.uniforms.modularNativeSkinGain = { value: nativeSkinGain };
        shader.fragmentShader = `uniform vec3 modularSkinGain; uniform float modularSkinLift; uniform vec3 modularNativeSkinGain;
uniform vec3 modularHair; uniform float modularGray; uniform float modularHairEnabled;
uniform vec3 modularIris; uniform float modularIrisEnabled; uniform vec4 modularEyeCenters; uniform vec2 modularEyeRadius; uniform vec3 modularPartHair;
${kind === 'skin' ? 'varying float vModularBrow;' : ''}\n`+shader.fragmentShader;
        if (kind === 'skin') {
          shader.vertexShader = 'attribute float modularBrowMask; varying float vModularBrow;\n'+shader.vertexShader;
          shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvModularBrow = modularBrowMask;');
        }
        const code = kind === 'hair' ? `
float identityLuma = dot(diffuseColor.rgb, vec3(.2126, .7152, .0722));
float identityStrand = clamp(pow(max(identityLuma, .0001)/.045, .72), .22, 2.3);
float identityGrey = modularGray;
vec3 identityHair = mix(modularHair, vec3(.32, .31, .29), identityGrey)*identityStrand;
diffuseColor.rgb = mix(diffuseColor.rgb, identityHair, modularHairEnabled);`
          : kind === 'eyes' ? `
#ifdef USE_MAP
float identityIrisDistance = min(length((vMapUv-modularEyeCenters.xy)/modularEyeRadius), length((vMapUv-modularEyeCenters.zw)/modularEyeRadius));
float identityLuma = dot(diffuseColor.rgb, vec3(.2126, .7152, .0722));
float identityIrisMask = (1.0-smoothstep(.84,1.04,identityIrisDistance))*smoothstep(.008,.035,identityLuma)*(1.0-smoothstep(.52,.82,identityLuma));
vec3 identityIris = modularIris*clamp(identityLuma/.12,.24,1.9);
diffuseColor.rgb = mix(diffuseColor.rgb,identityIris,identityIrisMask*modularIrisEnabled);
// The upper lid and corners shade the globe. Without this the sclera reads as
// a bright inset and the eyes stare. Offsets are in iris radii; v runs down.
vec2 identityEyeA = (vMapUv-modularEyeCenters.xy)/modularEyeRadius, identityEyeB = (vMapUv-modularEyeCenters.zw)/modularEyeRadius;
vec2 identityEye = dot(identityEyeA,identityEyeA) < dot(identityEyeB,identityEyeB) ? identityEyeA : identityEyeB;
float identityLidShade = min(.55, .36*smoothstep(-.7,.6,-identityEye.y)+.26*smoothstep(1.1,2.0,abs(identityEye.x)));
diffuseColor.rgb *= 1.0-identityLidShade*vec3(.92,1.0,1.04);
#endif`
            : `
diffuseColor.rgb *= modularNativeSkinGain;
float identityLuma = dot(diffuseColor.rgb, vec3(.2126, .7152, .0722));
float identitySkinMask = smoothstep(.012,.07,identityLuma);
vec3 identitySkin = diffuseColor.rgb*modularSkinGain+vec3(modularSkinLift)*smoothstep(.025,.20,identityLuma);
diffuseColor.rgb = mix(diffuseColor.rgb,identitySkin,identitySkinMask);
float identityBrow = vModularBrow*(1.0-smoothstep(.025,.12,identityLuma))*modularHairEnabled;
vec3 identityBrowColor = mix(modularHair*.5,vec3(.15),modularGray*.6)*clamp(identityLuma/.025,.3,1.4);
diffuseColor.rgb = mix(diffuseColor.rgb,identityBrowColor,identityBrow*.8);`+(name === 'Carmela_HairPart' ? `
#ifdef USE_MAP
// A real part shows scalp through fine short hairs, not bare skin. Tint it toward
// the hair's average shade (scaled as the hair shader scales tinted hair), with
// texel grain that averages out at a distance.
float identityPartStrand = clamp(pow(max(dot(modularPartHair,vec3(.2126,.7152,.0722)),.0001)/.045,.72),.22,2.3);
vec3 identityPartHair = modularHairEnabled > .5 ? mix(modularHair,vec3(.32,.31,.29),modularGray)*identityPartStrand : modularPartHair;
float identityPartGrain = fract(sin(dot(floor(vMapUv*4096.0),vec2(12.9898,78.233)))*43758.5453);
diffuseColor.rgb = mix(diffuseColor.rgb,identityPartHair*(.6+.5*identityPartGrain),.88);
#endif` : '');
        shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', '#include <color_fragment>\n'+code);
      };
      material.customProgramCacheKey = () => `modular-appearance-v7-${kind}-${name === 'Carmela_HairPart'}-${Boolean(material.userData.crownHairLoss)}`;
      material.needsUpdate = true;
    }
  });
  let previous = '';
  return {
    available: true,
    update({ skinTone = 'original', hairTone = 'original', eyeTone = 'original' } = {}) {
      const key = `${skinTone}/${hairTone}/${eyeTone}`;
      if (key === previous) return;
      previous = key;
      const skin = MODULAR_SKIN_TONES[skinTone] || MODULAR_SKIN_TONES.original;
      const hair = MODULAR_HAIR_TONES[hairTone] || MODULAR_HAIR_TONES.original;
      const eye = MODULAR_EYE_TONES[eyeTone] || MODULAR_EYE_TONES.original;
      uniforms.modularSkinGain.value.fromArray(skinTone === 'original' ? skin.gain : skin.gain.map((gain, i) => gain/reference.gain[i])); uniforms.modularSkinLift.value = skin.lift;
      uniforms.modularHair.value.set(hair.color); uniforms.modularGray.value = hair.gray;
      uniforms.modularHairEnabled.value = hairTone !== 'original' ? 1 : 0;
      uniforms.modularIris.value.set(eye.color); uniforms.modularIrisEnabled.value = eyeTone !== 'original' ? 1 : 0;
    },
  };
}
