import * as THREE from 'three';

const SKIN_SHADER_VERSION = 'renderer-c-skin-surface-v8';
const HAIR_SHADER_VERSION = 'renderer-c-grey-hair-v4';
const BROW_SHADER_VERSION = 'renderer-c-grey-brows-v1';

function clamp01(value) {
  return Math.max(0, Math.min(1, Number(value) || 0));
}

function hashText(value) {
  const text = String(value);
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function materialsUnder(object) {
  const materials = [];
  object?.traverse((child) => {
    if (!child.isMesh && !child.isSkinnedMesh) return;
    materials.push(...(Array.isArray(child.material) ? child.material : [child.material]).filter(Boolean));
  });
  return materials;
}

function visibleToRoot(object, root) {
  for (let current = object; current; current = current.parent) {
    if (!current.visible) return false;
    if (current === root) return true;
  }
  return false;
}

function visibleNamedRoots(root, prefix) {
  const matches = [];
  root.traverse((object) => {
    if (object.name.startsWith(prefix) && visibleToRoot(object, root)) matches.push(object);
  });
  return matches;
}

function boundsInBody(objects, body) {
  const output = new THREE.Box3();
  const inverseBody = body.matrixWorld.clone().invert();
  for (const object of objects) {
    object.traverse((mesh) => {
      if ((!mesh.isMesh && !mesh.isSkinnedMesh) || !mesh.geometry?.attributes?.position) return;
      if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
      const transform = inverseBody.clone().multiply(mesh.matrixWorld);
      output.union(mesh.geometry.boundingBox.clone().applyMatrix4(transform));
    });
  }
  return output.isEmpty() ? null : output;
}

function bodyBounds(body) {
  if (!body.geometry.boundingBox) body.geometry.computeBoundingBox();
  return body.geometry.boundingBox;
}

export function rendererCSurfaceFrame(root, body = root?.getObjectByName?.('Human_Body')) {
  if (!root || !body?.geometry?.attributes?.position) return null;
  root.updateMatrixWorld(true);
  const bodyBox = bodyBounds(body);
  const height = Math.max(0.001, bodyBox.max.y - bodyBox.min.y);
  const eyes = boundsInBody(visibleNamedRoots(root, 'RendererC_Eyes'), body);
  const teeth = boundsInBody(visibleNamedRoots(root, 'RendererC_Teeth'), body);
  const eyeCenter = eyes?.getCenter(new THREE.Vector3());
  const mouthCenter = teeth?.getCenter(new THREE.Vector3());
  const eyeSpan = eyes ? Math.max(height * 0.075, eyes.max.x - eyes.min.x) : height * 0.115;
  const eyeY = eyeCenter?.y ?? bodyBox.max.y - height * 0.143;
  const mouthY = mouthCenter?.y ?? eyeY - height * 0.09;
  const vertical = Math.max(height * 0.045, eyeY - mouthY);
  const centerX = eyeCenter?.x ?? (bodyBox.min.x + bodyBox.max.x) * 0.5;
  const frontSource = Math.max(eyes?.max.z ?? -Infinity, teeth?.max.z ?? -Infinity);
  const frontZ = Number.isFinite(frontSource) ? frontSource + eyeSpan * 0.28 : bodyBox.max.z;
  return {
    centerX,
    eyeY,
    mouthY,
    frontZ,
    faceHalfWidth: eyeSpan * 1.02,
    eyeHalfSeparation: eyeSpan * 0.32,
    vertical,
    headTop: bodyBox.max.y,
  };
}

function skinLightness(hex) {
  if (typeof hex !== 'string' || !/^#[0-9a-f]{6}$/i.test(hex)) return 0.6;
  const channels = [1, 3, 5].map((index) => Number.parseInt(hex.slice(index, index + 2), 16) / 255);
  return channels[0] * 0.299 + channels[1] * 0.587 + channels[2] * 0.114;
}

function installSkinShader(material) {
  if (!material.map || material.userData.rendererCSkinSurface) return material.userData.rendererCSkinSurface || null;
  const uniforms = {
    faceA: { value: new THREE.Vector4() },
    faceB: { value: new THREE.Vector4() },
    ageGeometry: { value: 0 },
    wrinkleAmount: { value: 0 },
    skinTexture: { value: 0 },
    pigmentVariation: { value: 0 },
    freckleAmount: { value: 0 },
    ageSpotAmount: { value: 0 },
    underEyeDarkness: { value: 0 },
    skinLightness: { value: 0.6 },
    seed: { value: 1 },
  };
  const previousCompile = material.onBeforeCompile;
  const previousCacheKey = material.customProgramCacheKey?.bind(material) || (() => '');
  material.userData.rendererCSkinSurface = { uniforms };
  material.onBeforeCompile = (shader, renderer) => {
    previousCompile.call(material, shader, renderer);
    Object.assign(shader.uniforms, {
      rendererCFaceA: uniforms.faceA,
      rendererCFaceB: uniforms.faceB,
      rendererCAgeGeometry: uniforms.ageGeometry,
      rendererCWrinkleAmount: uniforms.wrinkleAmount,
      rendererCSkinTexture: uniforms.skinTexture,
      rendererCPigmentVariation: uniforms.pigmentVariation,
      rendererCFreckleAmount: uniforms.freckleAmount,
      rendererCAgeSpotAmount: uniforms.ageSpotAmount,
      rendererCUnderEyeDarkness: uniforms.underEyeDarkness,
      rendererCSkinLightness: uniforms.skinLightness,
      rendererCSurfaceSeed: uniforms.seed,
    });
    shader.vertexShader = `varying vec3 vRendererCSurfacePosition;\nvarying vec2 vRendererCSurfaceUv;\n${shader.vertexShader}`
      .replace('#include <uv_vertex>', '#include <uv_vertex>\nvRendererCSurfaceUv = uv;')
      .replace('#include <morphtarget_vertex>', '#include <morphtarget_vertex>\nvRendererCSurfacePosition = transformed;');
    shader.fragmentShader = `
uniform vec4 rendererCFaceA;
uniform vec4 rendererCFaceB;
uniform float rendererCAgeGeometry;
uniform float rendererCWrinkleAmount;
uniform float rendererCSkinTexture;
uniform float rendererCPigmentVariation;
uniform float rendererCFreckleAmount;
uniform float rendererCAgeSpotAmount;
uniform float rendererCUnderEyeDarkness;
uniform float rendererCSkinLightness;
uniform float rendererCSurfaceSeed;
varying vec3 vRendererCSurfacePosition;
varying vec2 vRendererCSurfaceUv;
float rendererCHash(vec2 point) {
  return fract(sin(dot(point, vec2(127.1, 311.7)) + rendererCSurfaceSeed * 0.017) * 43758.5453);
}
float rendererCValueNoise(vec2 point) {
  vec2 cell = floor(point);
  vec2 local = fract(point);
  vec2 blend = local * local * (3.0 - 2.0 * local);
  float lower = mix(rendererCHash(cell), rendererCHash(cell + vec2(1.0, 0.0)), blend.x);
  float upper = mix(rendererCHash(cell + vec2(0.0, 1.0)), rendererCHash(cell + vec2(1.0, 1.0)), blend.x);
  return mix(lower, upper, blend.y);
}
float rendererCFbm(vec2 point) {
  float value = rendererCValueNoise(point) * 0.58;
  value += rendererCValueNoise(point * 2.07 + vec2(19.4, 7.1)) * 0.28;
  value += rendererCValueNoise(point * 4.13 + vec2(3.8, 23.7)) * 0.14;
  return value;
}
float rendererCGaussian(float value, float width) {
  return exp(-(value * value) / max(0.00001, 2.0 * width * width));
}
vec3 rendererCPerturbNormal(vec3 surfacePosition, vec3 surfaceNormal, vec2 heightDerivative) {
  vec3 sigmaX = dFdx(surfacePosition);
  vec3 sigmaY = dFdy(surfacePosition);
  vec3 r1 = cross(sigmaY, surfaceNormal);
  vec3 r2 = cross(surfaceNormal, sigmaX);
  float determinant = dot(sigmaX, r1);
  determinant *= gl_FrontFacing ? 1.0 : -1.0;
  vec3 gradient = sign(determinant) * (heightDerivative.x * r1 + heightDerivative.y * r2);
  return normalize(abs(determinant) * surfaceNormal - gradient);
}
${shader.fragmentShader}`.replace(
      '#include <map_fragment>',
      `#include <map_fragment>
vec2 rendererCFace = vec2(
  (vRendererCSurfacePosition.x - rendererCFaceA.x) / max(0.0001, rendererCFaceB.x),
  (vRendererCSurfacePosition.y - rendererCFaceA.z) / max(0.0001, rendererCFaceB.z)
);
float rendererCFront = smoothstep(
  rendererCFaceA.w - rendererCFaceB.x * 0.72,
  rendererCFaceA.w - rendererCFaceB.x * 0.04,
  vRendererCSurfacePosition.z
);
float rendererCFaceOval = 1.0 - smoothstep(0.78, 1.18, length(vec2(
  rendererCFace.x,
  (vRendererCSurfacePosition.y - (rendererCFaceA.y + rendererCFaceA.z) * 0.5) / max(0.0001, rendererCFaceB.z * 1.85)
)));
float rendererCFaceMask = rendererCFront * rendererCFaceOval;
float rendererCFineNoise = rendererCValueNoise(vRendererCSurfaceUv * 310.0);
float rendererCCoarseNoise = rendererCFbm(vRendererCSurfaceUv * 18.0 + rendererCSurfaceSeed * 0.0007);
vec2 rendererCFreckleCell = vRendererCSurfaceUv * 185.0;
vec2 rendererCFrecklePoint = fract(rendererCFreckleCell) - vec2(
  rendererCHash(floor(rendererCFreckleCell) + 13.0),
  rendererCHash(floor(rendererCFreckleCell) + 47.0)
);
float rendererCFreckleChance = rendererCHash(floor(rendererCFreckleCell) + 91.0);
float rendererCFreckleDot = (1.0 - smoothstep(0.035, 0.18, length(rendererCFrecklePoint)))
  * step(1.0 - rendererCFreckleAmount * 0.13, rendererCFreckleChance);
float rendererCFreckleZone = rendererCGaussian(rendererCFace.x, 0.66)
  * rendererCGaussian(rendererCFace.y - 0.63, 0.42) * rendererCFaceMask;
vec2 rendererCSpotCell = vRendererCSurfaceUv * 118.0;
vec2 rendererCSpotPoint = fract(rendererCSpotCell) - vec2(
  rendererCHash(floor(rendererCSpotCell) + 117.0),
  rendererCHash(floor(rendererCSpotCell) + 173.0)
);
float rendererCSpotChance = rendererCHash(floor(rendererCSpotCell) + 219.0);
float rendererCSpotEdge = rendererCValueNoise(vRendererCSurfaceUv * 370.0 + 31.7);
float rendererCSpot = (1.0 - smoothstep(0.04, 0.16 + rendererCSpotEdge * 0.035, length(rendererCSpotPoint)))
  * step(1.0 - rendererCAgeSpotAmount * 0.29, rendererCSpotChance) * rendererCFaceMask;
float rendererCMottleNoise = rendererCFbm(vRendererCSurfaceUv * 34.0 + vec2(11.3, 29.6));
float rendererCMottling = smoothstep(0.61, 0.84, rendererCMottleNoise)
  * rendererCGaussian(rendererCFace.x, 0.72)
  * rendererCGaussian(rendererCFace.y - 0.55, 1.18)
  * rendererCFaceMask;
float rendererCEyeRatio = rendererCFaceB.y / max(0.0001, rendererCFaceB.x);
float rendererCLeftBagX = (rendererCFace.x + rendererCEyeRatio) / 0.27;
float rendererCRightBagX = (rendererCFace.x - rendererCEyeRatio) / 0.27;
float rendererCLeftUnderEyeBag = rendererCGaussian(rendererCFace.x + rendererCEyeRatio, 0.27)
  * rendererCGaussian(rendererCFace.y - 0.68, 0.30);
float rendererCRightUnderEyeBag = rendererCGaussian(rendererCFace.x - rendererCEyeRatio, 0.27)
  * rendererCGaussian(rendererCFace.y - 0.68, 0.30);
float rendererCUnderEyeBag = min(1.0, rendererCLeftUnderEyeBag + rendererCRightUnderEyeBag)
  * rendererCFront;
float rendererCLeftBagFold = rendererCGaussian(
  rendererCFace.y - (0.47 + rendererCLeftBagX * rendererCLeftBagX * 0.075), 0.060
) * rendererCGaussian(rendererCLeftBagX, 0.82);
float rendererCRightBagFold = rendererCGaussian(
  rendererCFace.y - (0.47 + rendererCRightBagX * rendererCRightBagX * 0.075), 0.060
) * rendererCGaussian(rendererCRightBagX, 0.82);
float rendererCBagLowerFold = min(1.0, rendererCLeftBagFold + rendererCRightBagFold) * rendererCFront;
float rendererCLeftBagHighlight = rendererCGaussian(rendererCFace.y - 0.69, 0.105)
  * rendererCGaussian(rendererCLeftBagX, 0.78);
float rendererCRightBagHighlight = rendererCGaussian(rendererCFace.y - 0.69, 0.105)
  * rendererCGaussian(rendererCRightBagX, 0.78);
float rendererCBagHighlight = min(1.0, rendererCLeftBagHighlight + rendererCRightBagHighlight)
  * rendererCFront;
vec2 rendererCLeftEyeSpace = vec2(
  (rendererCFace.x + rendererCEyeRatio) / 0.22,
  (rendererCFace.y - 0.98) / 0.145
);
vec2 rendererCRightEyeSpace = vec2(
  (rendererCFace.x - rendererCEyeRatio) / 0.22,
  (rendererCFace.y - 0.98) / 0.145
);
float rendererCBelowEye = 1.0 - smoothstep(-0.02, 0.10, rendererCFace.y - 0.98);
float rendererCEyeCrescent = (
  rendererCGaussian(length(rendererCLeftEyeSpace) - 1.0, 0.14)
  + rendererCGaussian(length(rendererCRightEyeSpace) - 1.0, 0.14)
) * rendererCBelowEye * rendererCFront;
float rendererCOuterEye = abs(rendererCFace.x) - (rendererCEyeRatio + 0.13);
float rendererCCrowsFeetZone = smoothstep(-0.025, 0.035, rendererCOuterEye)
  * (1.0 - smoothstep(0.35, 0.50, rendererCOuterEye))
  * rendererCGaussian(rendererCFace.y - 0.98, 0.30)
  * rendererCFaceMask;
float rendererCCrowsFeet = (
  rendererCGaussian((rendererCFace.y - 0.98) - rendererCOuterEye * 0.76, 0.017)
  + rendererCGaussian((rendererCFace.y - 0.98) - rendererCOuterEye * 0.42, 0.014)
  + rendererCGaussian((rendererCFace.y - 0.98) - rendererCOuterEye * 0.08, 0.013)
  + rendererCGaussian((rendererCFace.y - 0.98) + rendererCOuterEye * 0.30, 0.014)
  + rendererCGaussian((rendererCFace.y - 0.98) + rendererCOuterEye * 0.68, 0.018)
) * rendererCCrowsFeetZone;
float rendererCForeheadZone = rendererCGaussian(rendererCFace.x, 0.58)
  * smoothstep(1.30, 1.58, rendererCFace.y)
  * (1.0 - smoothstep(3.05, 3.42, rendererCFace.y))
  * rendererCFront;
float rendererCForeheadLobeWave = sin(
  clamp(abs(rendererCFace.x) / 0.62, 0.0, 1.0) * 3.14159265
);
float rendererCForeheadLobe = rendererCForeheadLobeWave * rendererCForeheadLobeWave;
float rendererCForeheadY = rendererCFace.y
  - rendererCForeheadLobe * 0.085
  + sin(rendererCFace.x * 5.4 + rendererCSurfaceSeed * 0.011) * 0.022;
float rendererCForeheadVariation = 0.78
  + (0.5 + 0.5 * sin(rendererCFace.x * 13.0 + rendererCSurfaceSeed * 0.019)) * 0.22;
float rendererCForeheadLines = (
  rendererCGaussian(rendererCForeheadY - 1.66, 0.018) * 0.62
  + rendererCGaussian(rendererCForeheadY - 1.89, 0.020) * 0.82
  + rendererCGaussian(rendererCForeheadY - 2.12, 0.018) * 0.68
  + rendererCGaussian(rendererCForeheadY - 2.35, 0.021) * 0.76
  + rendererCGaussian(rendererCForeheadY - 2.59, 0.020) * 0.58
  + rendererCGaussian(rendererCForeheadY - 2.82, 0.023) * 0.42
) * rendererCForeheadZone * rendererCForeheadVariation;
float rendererCFrownZone = smoothstep(1.13, 1.31, rendererCFace.y)
  * (1.0 - smoothstep(1.72, 1.96, rendererCFace.y))
  * rendererCGaussian(rendererCFace.x, 0.24)
  * rendererCFaceMask;
float rendererCFrownLines = (
  rendererCGaussian(rendererCFace.x - 0.075, 0.027)
  + rendererCGaussian(rendererCFace.x + 0.075, 0.027)
) * rendererCFrownZone;
float rendererCLaughProgress = clamp(1.0 - rendererCFace.y, 0.0, 1.32);
float rendererCLaughTargetX = 0.20
  + rendererCLaughProgress * 0.13
  + rendererCLaughProgress * rendererCLaughProgress * 0.055;
float rendererCLaughZone = smoothstep(-0.34, -0.10, rendererCFace.y)
  * (1.0 - smoothstep(0.82, 1.04, rendererCFace.y));
float rendererCLaughLine = rendererCGaussian(
  abs(rendererCFace.x) - rendererCLaughTargetX,
  0.026 + rendererCLaughProgress * 0.006
) * rendererCLaughZone * rendererCFaceMask;
float rendererCLaughCompanion = rendererCGaussian(
  abs(rendererCFace.x) - (rendererCLaughTargetX + 0.065),
  0.019 + rendererCLaughProgress * 0.005
) * rendererCLaughZone * rendererCFaceMask;
float rendererCMarionetteProgress = clamp(-rendererCFace.y, 0.0, 0.62);
float rendererCMarionetteLine = rendererCGaussian(
  abs(rendererCFace.x) - (0.34 + rendererCMarionetteProgress * 0.09),
  0.027
) * smoothstep(-0.56, -0.30, rendererCFace.y)
  * (1.0 - smoothstep(0.02, 0.18, rendererCFace.y))
  * rendererCFaceMask;
float rendererCUpperLipZone = smoothstep(0.035, 0.080, rendererCFace.y)
  * (1.0 - smoothstep(0.25, 0.34, rendererCFace.y))
  * (1.0 - smoothstep(0.30, 0.43, abs(rendererCFace.x))) * rendererCFaceMask;
float rendererCUpperLipLines = (
  rendererCGaussian(rendererCFace.x + 0.220 + (rendererCFace.y - 0.10) * 0.18, 0.008) * 0.48
  + rendererCGaussian(rendererCFace.x + 0.155 + (rendererCFace.y - 0.10) * 0.12, 0.007) * 0.72
  + rendererCGaussian(rendererCFace.x + 0.090 + (rendererCFace.y - 0.10) * 0.07, 0.006) * 0.62
  + rendererCGaussian(rendererCFace.x + 0.030 + (rendererCFace.y - 0.10) * 0.03, 0.006) * 0.54
  + rendererCGaussian(rendererCFace.x - 0.035 - (rendererCFace.y - 0.10) * 0.03, 0.006) * 0.58
  + rendererCGaussian(rendererCFace.x - 0.100 - (rendererCFace.y - 0.10) * 0.08, 0.006) * 0.66
  + rendererCGaussian(rendererCFace.x - 0.165 - (rendererCFace.y - 0.10) * 0.13, 0.007) * 0.76
  + rendererCGaussian(rendererCFace.x - 0.230 - (rendererCFace.y - 0.10) * 0.18, 0.008) * 0.44
) * rendererCUpperLipZone;
float rendererCLowerLipZone = smoothstep(-0.34, -0.27, rendererCFace.y)
  * (1.0 - smoothstep(-0.070, -0.025, rendererCFace.y))
  * (1.0 - smoothstep(0.27, 0.40, abs(rendererCFace.x))) * rendererCFaceMask;
float rendererCLowerLipLines = (
  rendererCGaussian(rendererCFace.x + 0.205 - (rendererCFace.y + 0.17) * 0.15, 0.008) * 0.48
  + rendererCGaussian(rendererCFace.x + 0.125 - (rendererCFace.y + 0.17) * 0.09, 0.007) * 0.68
  + rendererCGaussian(rendererCFace.x + 0.045 - (rendererCFace.y + 0.17) * 0.03, 0.006) * 0.54
  + rendererCGaussian(rendererCFace.x - 0.045 + (rendererCFace.y + 0.17) * 0.03, 0.006) * 0.58
  + rendererCGaussian(rendererCFace.x - 0.125 + (rendererCFace.y + 0.17) * 0.09, 0.007) * 0.72
  + rendererCGaussian(rendererCFace.x - 0.205 + (rendererCFace.y + 0.17) * 0.15, 0.008) * 0.44
) * rendererCLowerLipZone;
float rendererCMouthCornerDistance = abs(rendererCFace.x) - 0.28;
float rendererCMouthCornerZone = smoothstep(-0.025, 0.035, rendererCMouthCornerDistance)
  * (1.0 - smoothstep(0.24, 0.36, rendererCMouthCornerDistance))
  * rendererCGaussian(rendererCFace.y, 0.23) * rendererCFaceMask;
float rendererCMouthCornerLines = (
  rendererCGaussian(rendererCFace.y - rendererCMouthCornerDistance * 0.48, 0.020)
  + rendererCGaussian(rendererCFace.y + rendererCMouthCornerDistance * 0.12, 0.018)
  + rendererCGaussian(rendererCFace.y + rendererCMouthCornerDistance * 0.58, 0.022)
) * rendererCMouthCornerZone;
float rendererCChinCreaseY = rendererCFace.y + 0.27 + rendererCFace.x * rendererCFace.x * 0.16;
float rendererCChinCrease = rendererCGaussian(rendererCChinCreaseY, 0.035)
  * rendererCGaussian(rendererCFace.x, 0.34) * rendererCFaceMask;
float rendererCUpperFaceWrinkles = min(1.0,
  rendererCForeheadLines
  + rendererCFrownLines * 0.68
  + rendererCEyeCrescent * 0.78
);
float rendererCMouthFolds = min(1.0,
  rendererCLaughLine * 0.98
  + rendererCMarionetteLine * 0.60
);
float rendererCFineWrinkles = min(1.0,
  rendererCCrowsFeet * 0.96
  + rendererCLaughCompanion * 0.62
  + rendererCUpperLipLines * 0.76
  + rendererCLowerLipLines * 0.64
  + rendererCMouthCornerLines * 0.68
  + rendererCChinCrease * 0.56
);
float rendererCWrinkleMask = min(1.0,
  rendererCUpperFaceWrinkles + rendererCMouthFolds * 0.88 + rendererCFineWrinkles * 0.78
);
float rendererCComplexionContrast = mix(0.72, 1.0, rendererCSkinLightness);
float rendererCWrinkleExtreme = smoothstep(0.70, 1.0, rendererCWrinkleAmount);
float rendererCTextureExtreme = smoothstep(0.70, 1.0, rendererCSkinTexture);
float rendererCSpotExtreme = smoothstep(0.68, 1.0, rendererCAgeSpotAmount);
float rendererCUnderEyeExtreme = smoothstep(0.68, 1.0, rendererCUnderEyeDarkness);
float rendererCWrinkleStrength = rendererCWrinkleAmount * mix(0.74, 1.38, rendererCWrinkleExtreme);
float rendererCTextureStrength = rendererCSkinTexture * mix(0.72, 1.35, rendererCTextureExtreme);
float rendererCSpotStrength = rendererCAgeSpotAmount * mix(0.70, 1.30, rendererCSpotExtreme);
float rendererCUnderEyeStrength = rendererCUnderEyeDarkness * mix(0.72, 1.35, rendererCUnderEyeExtreme);
float rendererCMicroTone = (rendererCFineNoise - 0.5) * rendererCTextureStrength * 0.135 * rendererCFaceMask;
float rendererCPigmentTone = (rendererCCoarseNoise - 0.5) * rendererCPigmentVariation * 0.15 * rendererCFaceMask;
float rendererCSpotMask = min(1.0, rendererCSpot + rendererCMottling * 0.34 * rendererCSpotExtreme);
float rendererCReliefHeight = rendererCUpperFaceWrinkles * rendererCWrinkleStrength * 0.00124
  + rendererCMouthFolds * rendererCWrinkleStrength * 0.00108
  + rendererCFineWrinkles * rendererCWrinkleStrength * 0.00048
  + rendererCEyeCrescent * rendererCUnderEyeStrength * 0.00016
  + rendererCUnderEyeBag * rendererCUnderEyeStrength * 0.00120
  - rendererCBagLowerFold * rendererCUnderEyeStrength * 0.00072;
float rendererCShadow = rendererCUpperFaceWrinkles * rendererCWrinkleStrength * 0.22
  + rendererCMouthFolds * rendererCWrinkleStrength * 0.115
  + rendererCFineWrinkles * rendererCWrinkleStrength * 0.048
  + rendererCUnderEyeBag * rendererCUnderEyeStrength * 0.10
  + rendererCBagLowerFold * rendererCUnderEyeStrength * 0.22
  + rendererCEyeCrescent * rendererCUnderEyeStrength * 0.018
  + rendererCSpotMask * rendererCSpotStrength * 0.16;
diffuseColor.rgb *= 1.0 + rendererCMicroTone + rendererCPigmentTone - rendererCShadow * rendererCComplexionContrast;
diffuseColor.rgb *= 1.0 + rendererCBagHighlight * rendererCUnderEyeStrength * 0.11;
diffuseColor.rgb *= mix(vec3(1.0), vec3(0.72, 0.52, 0.43), rendererCFreckleDot * rendererCFreckleZone);
diffuseColor.rgb *= mix(
  vec3(1.0),
  vec3(0.72, 0.49, 0.36),
  clamp(rendererCSpotMask * rendererCSpotStrength * 0.72, 0.0, 1.0)
);
float rendererCLipAgeZone = rendererCGaussian(rendererCFace.x, 0.34)
  * rendererCGaussian(rendererCFace.y, 0.095) * rendererCFaceMask;
float rendererCLipLuminance = dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114));
diffuseColor.rgb = mix(
  diffuseColor.rgb,
  vec3(rendererCLipLuminance) * vec3(1.02, 0.97, 0.93),
  rendererCLipAgeZone * rendererCAgeGeometry * 0.18
);`,
    ).replace(
      '#include <roughnessmap_fragment>',
      `#include <roughnessmap_fragment>
roughnessFactor = clamp(roughnessFactor
  + (rendererCFineNoise - 0.5) * rendererCTextureStrength * rendererCFaceMask * 0.23
  + rendererCWrinkleMask * rendererCWrinkleStrength * 0.085, 0.30, 1.0);`,
    ).replace(
      '#include <normal_fragment_maps>',
      `#include <normal_fragment_maps>
normal = rendererCPerturbNormal(
  -vViewPosition,
  normal,
  vec2(dFdx(rendererCReliefHeight), dFdy(rendererCReliefHeight))
);`,
    );
  };
  material.customProgramCacheKey = () => `${previousCacheKey()}|${SKIN_SHADER_VERSION}`;
  material.needsUpdate = true;
  return material.userData.rendererCSkinSurface;
}

function updateSkinShader(material, frame, values) {
  const state = installSkinShader(material);
  if (!state) return;
  const { uniforms } = state;
  uniforms.faceA.value.set(frame.centerX, frame.eyeY, frame.mouthY, frame.frontZ);
  uniforms.faceB.value.set(frame.faceHalfWidth, frame.eyeHalfSeparation, frame.vertical, frame.headTop);
  uniforms.ageGeometry.value = clamp01(values.ageGeometry);
  uniforms.wrinkleAmount.value = clamp01(values.wrinkleAmount);
  uniforms.skinTexture.value = clamp01(values.skinTexture);
  uniforms.pigmentVariation.value = clamp01(values.pigmentVariation);
  uniforms.freckleAmount.value = clamp01(values.freckleAmount);
  uniforms.ageSpotAmount.value = clamp01(values.ageSpotAmount);
  uniforms.underEyeDarkness.value = clamp01(values.underEyeDarkness);
  uniforms.skinLightness.value = skinLightness(values.skinTone);
  uniforms.seed.value = (hashText(values.seed ?? values.appearanceSeed ?? 1) % 100000) / 100;
}

export function applyRendererCSkinSurface(root, values = {}) {
  const body = root?.getObjectByName?.('Human_Body');
  const frame = rendererCSurfaceFrame(root, body);
  if (!body || !frame) return null;
  for (const material of materialsUnder(body)) updateSkinShader(material, frame, values);
  return frame;
}

function greyPatternValue(pattern) {
  if (pattern === 'scattered') return 1;
  if (pattern === 'uniform') return 2;
  return 0;
}

function greyTargetColor(greyAmount) {
  return new THREE.Color('#77746f').lerp(
    new THREE.Color('#d8d5cd'),
    Math.pow(clamp01(greyAmount), 1.35),
  );
}

function browGreyCoverage(greyAmount) {
  const amount = clamp01(greyAmount);
  const whiteCoverage = clamp01((amount - 0.75) / 0.25);
  return Math.pow(amount, 1.1) * (0.84 + whiteCoverage * 0.12);
}

function hairFrame(object) {
  const box = new THREE.Box3();
  object.traverse((mesh) => {
    if ((!mesh.isMesh && !mesh.isSkinnedMesh) || !mesh.geometry?.attributes?.position) return;
    if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
    box.union(mesh.geometry.boundingBox);
  });
  if (box.isEmpty()) return { minimum: new THREE.Vector3(-0.1, 0, -0.1), maximum: new THREE.Vector3(0.1, 0.2, 0.1) };
  return { minimum: box.min.clone(), maximum: box.max.clone() };
}

function installHairShader(material) {
  if (!material.map || material.userData.rendererCHairSurface) return material.userData.rendererCHairSurface || null;
  const uniforms = {
    greyAmount: { value: 0 },
    greyPattern: { value: 0 },
    greyColor: { value: new THREE.Color('#77746f') },
    seed: { value: 1 },
    boundsMin: { value: new THREE.Vector3() },
    boundsMax: { value: new THREE.Vector3(1, 1, 1) },
  };
  const previousCompile = material.onBeforeCompile;
  const previousCacheKey = material.customProgramCacheKey?.bind(material) || (() => '');
  material.userData.rendererCHairSurface = { uniforms };
  material.onBeforeCompile = (shader, renderer) => {
    previousCompile.call(material, shader, renderer);
    Object.assign(shader.uniforms, {
      rendererCGreyAmount: uniforms.greyAmount,
      rendererCGreyPattern: uniforms.greyPattern,
      rendererCGreyColor: uniforms.greyColor,
      rendererCHairSeed: uniforms.seed,
      rendererCHairBoundsMin: uniforms.boundsMin,
      rendererCHairBoundsMax: uniforms.boundsMax,
    });
    shader.vertexShader = `varying vec3 vRendererCHairPosition;\n${shader.vertexShader}`
      .replace('#include <morphtarget_vertex>', '#include <morphtarget_vertex>\nvRendererCHairPosition = transformed;');
    shader.fragmentShader = `
uniform float rendererCGreyAmount;
uniform float rendererCGreyPattern;
uniform vec3 rendererCGreyColor;
uniform float rendererCHairSeed;
uniform vec3 rendererCHairBoundsMin;
uniform vec3 rendererCHairBoundsMax;
varying vec3 vRendererCHairPosition;
${shader.fragmentShader}`.replace(
      '#include <map_fragment>',
      `#include <map_fragment>
vec3 rendererCHairPosition = clamp(
  (vRendererCHairPosition - rendererCHairBoundsMin)
    / max(vec3(0.0001), rendererCHairBoundsMax - rendererCHairBoundsMin),
  vec3(0.0), vec3(1.0)
);
float rendererCTemple = smoothstep(0.36, 0.98, abs(rendererCHairPosition.x - 0.5) * 2.0);
float rendererCRoot = 1.0 - smoothstep(0.04, 0.72, rendererCHairPosition.y);
float rendererCFront = smoothstep(0.18, 0.94, rendererCHairPosition.z);
float rendererCHairline = clamp(rendererCRoot * 0.70 + rendererCFront * 0.30, 0.0, 1.0);
float rendererCBroadVariation = 0.5 + 0.5 * sin(
  (rendererCHairPosition.x * 4.7 + rendererCHairPosition.y * 3.1 + rendererCHairPosition.z * 2.3) * 6.28318
  + rendererCHairSeed * 0.013
);
float rendererCGreyMask;
if (rendererCGreyPattern < 0.5) {
  float rendererCHairlineGradient = clamp(
    rendererCHairline * (0.44 + rendererCTemple * 0.56) + rendererCTemple * 0.20,
    0.0, 1.0
  );
  float rendererCGreySpread = rendererCGreyAmount * rendererCGreyAmount * 0.54;
  rendererCGreyMask = max(
    rendererCGreySpread,
    rendererCGreyAmount * (0.08 + rendererCHairlineGradient * 0.92)
  );
} else if (rendererCGreyPattern < 1.5) {
  rendererCGreyMask = rendererCGreyAmount
    * (0.34 + rendererCHairline * 0.36 + rendererCBroadVariation * 0.30);
} else {
  rendererCGreyMask = rendererCGreyAmount * (0.82 + rendererCBroadVariation * 0.18);
}
float rendererCWhiteCoverage = smoothstep(0.80, 1.0, rendererCGreyAmount);
rendererCGreyMask = mix(rendererCGreyMask, 1.0, rendererCWhiteCoverage);
diffuseColor.rgb = mix(
  diffuseColor.rgb,
  rendererCGreyColor,
  clamp(rendererCGreyMask, 0.0, 1.0) * mix(0.84, 0.96, rendererCWhiteCoverage)
);`,
    );
  };
  material.customProgramCacheKey = () => `${previousCacheKey()}|${HAIR_SHADER_VERSION}`;
  material.needsUpdate = true;
  return material.userData.rendererCHairSurface;
}

export function applyRendererCHairSurface(root, values = {}) {
  const greyAmount = clamp01(values.greyAmount);
  const greyColor = greyTargetColor(greyAmount);
  for (const object of visibleNamedRoots(root, 'RendererC_Hair')) {
    const frame = hairFrame(object);
    for (const material of materialsUnder(object)) {
      const state = installHairShader(material);
      if (!state) {
        if (material.color && !material.userData.rendererCHairBaseColor) {
          material.userData.rendererCHairBaseColor = material.color.clone();
        }
        if (material.color && material.userData.rendererCHairBaseColor) {
          material.color.copy(material.userData.rendererCHairBaseColor).lerp(greyColor, greyAmount * 0.92);
        }
        continue;
      }
      state.uniforms.greyAmount.value = greyAmount;
      state.uniforms.greyPattern.value = greyPatternValue(values.greyPattern);
      state.uniforms.greyColor.value.copy(greyColor);
      state.uniforms.seed.value = (hashText(values.seed ?? values.appearanceSeed ?? 1) % 100000) / 100;
      state.uniforms.boundsMin.value.copy(frame.minimum);
      state.uniforms.boundsMax.value.copy(frame.maximum);
    }
  }
  return { greyAmount, greyPattern: values.greyPattern || 'temples-first' };
}

function installBrowShader(material) {
  if (!material.map || material.userData.rendererCBrowSurface) {
    return material.userData.rendererCBrowSurface || null;
  }
  const uniforms = {
    greyAmount: { value: 0 },
    greyColor: { value: new THREE.Color('#77746f') },
  };
  const previousCompile = material.onBeforeCompile;
  const previousCacheKey = material.customProgramCacheKey?.bind(material) || (() => '');
  material.userData.rendererCBrowSurface = { uniforms };
  material.onBeforeCompile = (shader, renderer) => {
    previousCompile.call(material, shader, renderer);
    Object.assign(shader.uniforms, {
      rendererCBrowGreyAmount: uniforms.greyAmount,
      rendererCBrowGreyColor: uniforms.greyColor,
    });
    shader.fragmentShader = `
uniform float rendererCBrowGreyAmount;
uniform vec3 rendererCBrowGreyColor;
${shader.fragmentShader}`.replace(
      '#include <map_fragment>',
      `#include <map_fragment>
float rendererCBrowWhiteCoverage = clamp((rendererCBrowGreyAmount - 0.75) / 0.25, 0.0, 1.0);
float rendererCBrowGreyCoverage = pow(rendererCBrowGreyAmount, 1.1)
  * mix(0.84, 0.96, rendererCBrowWhiteCoverage);
diffuseColor.rgb = mix(
  diffuseColor.rgb,
  rendererCBrowGreyColor,
  rendererCBrowGreyCoverage
);`,
    );
  };
  material.customProgramCacheKey = () => `${previousCacheKey()}|${BROW_SHADER_VERSION}`;
  material.needsUpdate = true;
  return material.userData.rendererCBrowSurface;
}

export function applyRendererCBrowSurface(root, values = {}) {
  const greyAmount = clamp01(values.greyAmount);
  const greyColor = greyTargetColor(greyAmount);
  const coverage = browGreyCoverage(greyAmount);
  const baseColor = new THREE.Color(values.browColor || values.hairColor || '#2a1a12');
  for (const object of visibleNamedRoots(root, 'RendererC_Brows')) {
    for (const material of materialsUnder(object)) {
      const state = installBrowShader(material);
      if (state) {
        state.uniforms.greyAmount.value = greyAmount;
        state.uniforms.greyColor.value.copy(greyColor);
      } else if (material.color) {
        material.color.copy(baseColor).lerp(greyColor, coverage);
      }
    }
  }
  return { greyAmount, coverage, color: greyColor };
}
