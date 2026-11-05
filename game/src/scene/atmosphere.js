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
  // Cloud shadows. x: darkening (0 turns them off), y: pattern frequency per
  // metre, z/w: drift offset. cloudShade2 x: coverage threshold, y: softness.
  cloudShade: { value: new Float32Array(4) },
  cloudShade2: { value: new Float32Array(2) },
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
    uniform vec4 cloudShade;
    uniform vec2 cloudShade2;
    float cloudShadeHash(vec2 p) {
      return fract(sin(dot(p, vec2(41.31, 289.17))) * 43758.5453);
    }
    float cloudShadeNoise(vec2 p) {
      vec2 i = floor(p);
      vec2 f = fract(p);
      vec2 u = f * f * (3.0 - 2.0 * f);
      return mix(mix(cloudShadeHash(i), cloudShadeHash(i + vec2(1.0, 0.0)), u.x),
        mix(cloudShadeHash(i + vec2(0.0, 1.0)), cloudShadeHash(i + vec2(1.0, 1.0)), u.x), u.y);
    }
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
    float hazeDepth = (hazeOptical * hazeOptical + hazeParams.y * hazeOptical) * hazeHeight;
    // Air scatters blue more than red, so the middle distance cools first
    // and far greens turn blue-grey rather than going flat grey-green.
    vec3 fogFactor = 1.0 - exp(-hazeDepth * vec3(0.8, 1.0, 1.3));
    vec3 hazeView = vFogWorldOffset / max(hazeDistance, 1e-4);
    float hazeSun = pow(max(dot(hazeView, hazeSunDir), 0.0), max(hazeParams.z, 1.0));
    // Haze is cooler looking away from the sun; the sunward side gets the glow.
    float hazeAway = 1.0 - pow(max(dot(hazeView, hazeSunDir) * 0.5 + 0.5, 0.0), 2.0);
    vec3 hazeColor = fogColor * mix(vec3(1.0), vec3(0.9, 0.97, 1.1), hazeAway * step(1e-4, hazeParams.x))
      + hazeSunColor * hazeSun;
  #else
    vec3 fogFactor = vec3(smoothstep(fogNear, fogFar, vFogDepth));
    vec3 hazeColor = fogColor;
  #endif
  gl_FragColor.rgb = mix(gl_FragColor.rgb, hazeColor, fogFactor);
#endif
`;

// Cloud shadows go in after lighting and before tone mapping, so they remove
// light rather than paint grey over the finished colour. Blue is left behind
// more than red: ground in a cloud's shadow is lit by the sky and reads cool.
// Pattern and approach from the Young Darwin game's fogAtmosphere.js.
THREE.ShaderChunk.opaque_fragment = THREE.ShaderChunk.opaque_fragment.replace(
  'gl_FragColor = vec4( outgoingLight, diffuseColor.a );',
  `gl_FragColor = vec4( outgoingLight, diffuseColor.a );
#if defined( USE_FOG ) && defined( FOG_EXP2 )
  if (cloudShade.x > 0.0) {
    vec2 cloudP = (cameraPosition.xz + vFogWorldOffset.xz) * cloudShade.y + cloudShade.zw;
    float cloudField = 0.62 * cloudShadeNoise(cloudP)
      + 0.26 * cloudShadeNoise(cloudP * 2.13 + vec2(11.7, 5.3))
      + 0.12 * cloudShadeNoise(cloudP * 4.41 + vec2(3.1, 19.4));
    float cloudCover = smoothstep(cloudShade2.x, cloudShade2.x + cloudShade2.y, cloudField);
    gl_FragColor.rgb *= max(vec3(0.0), 1.0 - cloudShade.x * cloudCover * vec3(1.12, 1.0, 0.72));
  }
#endif`,
);

export function clearHaze() {
  hazeUniforms.hazeParams.value.fill(0);
  hazeUniforms.hazeSunDir.value.fill(0);
  hazeUniforms.hazeSunColor.value.fill(0);
  hazeUniforms.cloudShade.value.fill(0);
}
