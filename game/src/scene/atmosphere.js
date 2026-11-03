import * as THREE from 'three';

// Outdoor haze. three's FogExp2 is uniform in every direction, so a city
// block 150m off stays as crisp as the pavement. This replaces the fog chunks
// so FogExp2 also thins with height and brightens toward the sun. Same pass,
// a few extra ALU per pixel, no new programs.
//
// The extra uniforms are shared Float32Arrays: UniformsUtils.clone copies
// vectors per material but passes typed arrays through by reference, so one
// write here reaches every program. Shaders that never received them read
// zeros, which this chunk treats as plain FogExp2.
export const hazeUniforms = {
  // x: height falloff per metre above y = 0, y: linear share of the optical
  // depth, z: sun-glow exponent, w: share of the haze that ignores height.
  hazeParams: { value: new Float32Array(4) },
  hazeSunDir: { value: new Float32Array(3) },
  hazeSunColor: { value: new Float32Array(3) },
};

for (const shader of Object.values(THREE.ShaderLib)) {
  if (shader.uniforms?.fogDensity) Object.assign(shader.uniforms, hazeUniforms);
}
Object.assign(THREE.UniformsLib.fog, hazeUniforms);

THREE.ShaderChunk.fog_pars_vertex = /* glsl */ `
#ifdef USE_FOG
  varying float vFogDepth;
  varying vec3 vFogWorldOffset;
#endif
`;

// Row-vector multiply is the transpose: view-space offset back to world axes,
// without needing a world-position varying that only some materials compute.
THREE.ShaderChunk.fog_vertex = /* glsl */ `
#ifdef USE_FOG
  vFogDepth = - mvPosition.z;
  vFogWorldOffset = (vec4(mvPosition.xyz, 0.0) * viewMatrix).xyz;
#endif
`;

THREE.ShaderChunk.fog_pars_fragment = /* glsl */ `
#ifdef USE_FOG
  uniform vec3 fogColor;
  varying float vFogDepth;
  varying vec3 vFogWorldOffset;
  #ifdef FOG_EXP2
    uniform float fogDensity;
    uniform vec4 hazeParams;
    uniform vec3 hazeSunDir;
    uniform vec3 hazeSunColor;
  #else
    uniform float fogNear;
    uniform float fogFar;
  #endif
#endif
`;

// Height term: mean density along the ray for exp(-falloff * height), the
// closed form of the integral, so long views over the lawn fill with haze
// while a look up a facade stays clearer.
THREE.ShaderChunk.fog_fragment = /* glsl */ `
#ifdef USE_FOG
  #ifdef FOG_EXP2
    float hazeDistance = length(vFogWorldOffset);
    float hazeHeight = 1.0;
    if (hazeParams.x > 1e-4) {
      float hazeRise = vFogWorldOffset.y * hazeParams.x;
      float hazeAlong = abs(hazeRise) > 1e-3 ? (1.0 - exp(-hazeRise)) / hazeRise : 1.0;
      float hazeBase = exp(-hazeParams.x * cameraPosition.y);
      hazeHeight = mix(clamp(hazeBase * hazeAlong, 0.0, 3.0), 1.0, hazeParams.w);
    }
    // Real haze is linear in distance; FogExp2's square keeps the near field
    // clear. The linear share fills the middle distance.
    float hazeOptical = fogDensity * hazeDistance;
    float fogFactor = 1.0 - exp(-(hazeOptical * hazeOptical + hazeParams.y * hazeOptical) * hazeHeight);
    vec3 hazeView = vFogWorldOffset / max(hazeDistance, 1e-4);
    float hazeSun = pow(max(dot(hazeView, hazeSunDir), 0.0), max(hazeParams.z, 1.0));
    vec3 hazeColor = fogColor + hazeSunColor * hazeSun;
  #else
    float fogFactor = smoothstep(fogNear, fogFar, vFogDepth);
    vec3 hazeColor = fogColor;
  #endif
  gl_FragColor.rgb = mix(gl_FragColor.rgb, hazeColor, fogFactor);
#endif
`;

export function clearHaze() {
  hazeUniforms.hazeParams.value.fill(0);
  hazeUniforms.hazeSunDir.value.fill(0);
  hazeUniforms.hazeSunColor.value.fill(0);
}
