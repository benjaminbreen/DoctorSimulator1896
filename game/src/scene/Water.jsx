import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { solarRamps } from '../world/solar.js';
import { moonState } from '../world/moon.js';
import { environmentPalette } from '../world/skyPalette.js';
import { terrainHeight } from '../world/terrain.js';
import { gameDebug } from '../debug.js';

// Pond surface. Bed depth is baked once into a texture (the bed never moves)
// and drives absorption, the waterline fade, and shore foam per pixel. A
// planar mirror gives real reflections, mixed in by fresnel. Ripple normals
// tile in world space and flatten with distance. Adapted from Darwin's
// standing-water renderer, cut down to what one pond needs.

const DEPTH_RES = 256;
const DEPTH_RANGE = 2.5; // metres packed into one byte of the bake
const MARGIN = 5; // bake/geometry margin beyond the outline, metres
const CELL = 1.7; // surface grid cell, metres
const MIRROR_RES = 512;
const MIRROR_INTERVAL = 2; // re-render the mirror every Nth frame
const MAX_IMPULSES = 8;
const IMPULSE_LIFETIME = 5;

function bakeDepth(outline, level) {
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const [x, z] of outline) {
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minZ = Math.min(minZ, z);
    maxZ = Math.max(maxZ, z);
  }
  minX -= MARGIN;
  maxX += MARGIN;
  minZ -= MARGIN;
  maxZ += MARGIN;
  const width = maxX - minX;
  const height = maxZ - minZ;
  const depths = new Float32Array(DEPTH_RES * DEPTH_RES);
  const data = new Uint8Array(DEPTH_RES * DEPTH_RES * 4);
  for (let iz = 0; iz < DEPTH_RES; iz += 1) {
    const z = minZ + (iz / (DEPTH_RES - 1)) * height;
    for (let ix = 0; ix < DEPTH_RES; ix += 1) {
      const x = minX + (ix / (DEPTH_RES - 1)) * width;
      const depth = Math.min(DEPTH_RANGE, Math.max(0, level - terrainHeight(x, z)));
      const i = iz * DEPTH_RES + ix;
      depths[i] = depth;
      data[i * 4] = Math.round((depth / DEPTH_RANGE) * 255);
      data[i * 4 + 3] = 255;
    }
  }
  const texture = new THREE.DataTexture(data, DEPTH_RES, DEPTH_RES, THREE.RGBAFormat);
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.colorSpace = THREE.NoColorSpace;
  texture.needsUpdate = true;
  return { texture, depths, minX, minZ, width, height };
}

// Grid over the bake bounds, keeping only cells that touch water (plus one
// dilated ring). The mesh edge always lies past the waterline, so the shore
// is drawn by the depth-keyed alpha fade, not by the geometry.
function buildSurface(bake) {
  const cols = Math.ceil(bake.width / CELL);
  const rows = Math.ceil(bake.height / CELL);
  const depthAt = (ix, iz) => {
    const u = Math.min(DEPTH_RES - 1, Math.round((ix / cols) * (DEPTH_RES - 1)));
    const v = Math.min(DEPTH_RES - 1, Math.round((iz / rows) * (DEPTH_RES - 1)));
    return bake.depths[v * DEPTH_RES + u];
  };
  const wet = new Uint8Array(cols * rows);
  for (let iz = 0; iz < rows; iz += 1) {
    for (let ix = 0; ix < cols; ix += 1) {
      if (
        depthAt(ix, iz) > 0.01 ||
        depthAt(ix + 1, iz) > 0.01 ||
        depthAt(ix, iz + 1) > 0.01 ||
        depthAt(ix + 1, iz + 1) > 0.01
      ) {
        wet[iz * cols + ix] = 1;
      }
    }
  }
  const keep = new Uint8Array(cols * rows);
  for (let iz = 0; iz < rows; iz += 1) {
    for (let ix = 0; ix < cols; ix += 1) {
      for (let dz = -1; dz <= 1 && !keep[iz * cols + ix]; dz += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          const nx = ix + dx;
          const nz = iz + dz;
          if (nx >= 0 && nx < cols && nz >= 0 && nz < rows && wet[nz * cols + nx]) {
            keep[iz * cols + ix] = 1;
            break;
          }
        }
      }
    }
  }
  const positions = [];
  const stride = cols + 1;
  for (let iz = 0; iz <= rows; iz += 1) {
    const z = bake.minZ + (iz / rows) * bake.height;
    for (let ix = 0; ix <= cols; ix += 1) {
      positions.push(bake.minX + (ix / cols) * bake.width, 0, z);
    }
  }
  const indices = [];
  for (let iz = 0; iz < rows; iz += 1) {
    for (let ix = 0; ix < cols; ix += 1) {
      if (!keep[iz * cols + ix]) continue;
      const a = iz * stride + ix;
      const b = a + 1;
      const c = a + stride;
      const d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeBoundingSphere();
  return geometry;
}

// Tileable ripple normal map: many small crossing wavelets around one wind
// heading, slopes packed into red/green. Same recipe as Darwin's lagoons.
// Wave and wobble vectors are snapped to whole cycles so the map tiles; the
// wobble is what keeps the wavelets from reading as ruled parallel lines.
function createRippleTexture(size = 256) {
  const data = new Uint8Array(size * size * 4);
  const rand = (i, ch) => {
    const v = Math.sin((i + 1) * 91.7 + ch * 37.3) * 43758.5453;
    return v - Math.floor(v);
  };
  const windAngle = -0.42;
  const waves = [];
  const addWave = (angle, frequency, amp, i) => {
    const kx = Math.round(Math.cos(angle) * frequency);
    const ky = Math.round(Math.sin(angle) * frequency);
    if (kx === 0 && ky === 0) return;
    const len = Math.hypot(kx, ky);
    const wobbleFreq = 2 + Math.round(rand(i, 5) * 3);
    waves.push({
      kx,
      ky,
      dirX: kx / len,
      dirY: ky / len,
      amp,
      phase: rand(i, 4) * Math.PI * 2,
      // Wobble runs across the crest: integer vector perpendicular-ish.
      wx: Math.round((-ky / len) * wobbleFreq),
      wy: Math.round((kx / len) * wobbleFreq),
      wobbleAmp: 0.6 + rand(i, 7) * 0.9,
      wobblePhase: rand(i, 6) * Math.PI * 2,
    });
  };
  for (let i = 0; i < 14; i += 1) {
    addWave(
      windAngle + (rand(i, 2) - 0.5) * 0.6,
      6 + i * 1.5 + rand(i, 1) * 2,
      (0.02 - i * 0.0008) * (0.8 + rand(i, 3) * 0.4),
      i,
    );
  }
  for (let i = 0; i < 5; i += 1) {
    addWave(
      windAngle + Math.PI * 0.5 + (rand(i, 12) - 0.5) * 0.7,
      14 + i * 3 + rand(i, 11) * 2,
      0.005 + rand(i, 13) * 0.003,
      i + 20,
    );
  }
  for (let y = 0; y < size; y += 1) {
    const v = y / size;
    for (let x = 0; x < size; x += 1) {
      const u = x / size;
      let dx = 0;
      let dz = 0;
      for (const wave of waves) {
        const wobble = Math.sin((wave.wx * u + wave.wy * v) * Math.PI * 2 + wave.wobblePhase) * wave.wobbleAmp;
        const slope = Math.cos((wave.kx * u + wave.ky * v) * Math.PI * 2 + wobble + wave.phase) * wave.amp;
        dx += slope * wave.dirX;
        dz += slope * wave.dirY;
      }
      const i = (y * size + x) * 4;
      data[i] = Math.max(0, Math.min(255, Math.round(128 + dx * 520)));
      data[i + 1] = Math.max(0, Math.min(255, Math.round(128 + dz * 520)));
      data[i + 2] = 255;
      data[i + 3] = 255;
    }
  }
  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = true;
  texture.anisotropy = 4;
  texture.colorSpace = THREE.NoColorSpace;
  texture.needsUpdate = true;
  return texture;
}

const VERTEX = /* glsl */ `
  uniform mat4 uReflMatrix;
  varying vec3 vWorldPos;
  varying vec4 vReflCoord;
  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorldPos = world.xyz;
    vReflCoord = uReflMatrix * world;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform float uDayness;
  uniform float uGolden;
  uniform float uKeyStrength;
  uniform float uMoonness;
  uniform vec3 uSunDir;
  uniform vec3 uScatter;
  uniform vec3 uExtinction;
  uniform sampler2D uDepthTex;
  uniform vec4 uDepthRect; // minX, minZ, 1/width, 1/height
  uniform float uDepthRange;
  uniform sampler2D uRippleTex;
  uniform vec2 uRippleFade; // near, far (m)
  uniform float uRippleOctaves;
  uniform float uRippleScale;
  uniform float uRippleStrength;
  uniform float uRippleSpeed;
  uniform float uRippleFarStrength;
  uniform sampler2D uReflection;
  uniform float uHasReflection;
  uniform float uReflectivity;
  uniform float uMirrorStrength;
  uniform float uReflectionBlur;
  uniform float uReflectionDistortion;
  uniform float uRefraction;
  uniform float uAbsorption;
  uniform vec3 uSkyZenith;
  uniform vec3 uSkyHorizon;
  uniform float uShoreWidth;
  uniform float uShoreTint;
  uniform float uShoreFoam;
  uniform vec3 uShoreColor;
  uniform float uInteractionStrength;
  uniform float uWaveSpeed;
  uniform float uWaveDamping;
  uniform int uImpulseCount;
  uniform vec3 uImpulses[${MAX_IMPULSES}]; // x, z, age
  uniform float uImpulseAmplitudes[${MAX_IMPULSES}];
  varying vec3 vWorldPos;
  varying vec4 vReflCoord;

  void main() {
    vec2 duv = (vWorldPos.xz - uDepthRect.xy) * uDepthRect.zw;
    float depthM = texture2D(uDepthTex, duv).r * uDepthRange;
    // The surface grid extends past the shoreline. Discard the dry ring so an
    // AO exclusion render never masks the land beyond the actual waterline.
    if (depthM <= 0.001) discard;

    // World-tiled ripple octaves share one normal texture. Different scales,
    // directions and speeds keep the reflection from reading as a perfect
    // mirror while retaining broad, calm shapes across the pond.
    vec2 w = vWorldPos.xz;
    vec2 warp = vec2(sin(w.y * 0.13 + 1.7), sin(w.x * 0.11 - 0.9)) * 0.35;
    float drift = uTime * uRippleSpeed;
    float scale = uRippleScale;
    vec2 slope = (texture2D(uRippleTex, (w + warp) * (0.34 * scale)
      + vec2(drift * 0.016, drift * 0.009)).rg * 2.0 - 1.0) * 0.68;
    if (uRippleOctaves > 1.5) {
      slope += (texture2D(uRippleTex, (w - warp) * (0.79 * scale)
        + vec2(-drift * 0.012, drift * 0.019)).rg * 2.0 - 1.0) * 0.3;
    }
    if (uRippleOctaves > 2.5) {
      slope += (texture2D(uRippleTex, (w + warp.yx) * (1.63 * scale)
        + vec2(drift * 0.027, -drift * 0.017)).rg * 2.0 - 1.0) * 0.14;
    }
    if (uRippleOctaves > 3.5) {
      slope += (texture2D(uRippleTex, (w - warp.yx) * (3.1 * scale)
        + vec2(-drift * 0.035, -drift * 0.021)).rg * 2.0 - 1.0) * 0.07;
    }

    // Footfalls, takeoffs and landings emit waves at fixed world positions.
    // The rings travel away and fade instead of staying pinned to the player.
    for (int i = 0; i < ${MAX_IMPULSES}; i++) {
      if (i >= uImpulseCount) break;
      vec2 delta = vWorldPos.xz - uImpulses[i].xy;
      float d = length(delta);
      float age = uImpulses[i].z;
      float front = d - age * uWaveSpeed;
      float wave = sin(front * 12.0) * exp(-abs(front) * 3.4)
        * exp(-age * uWaveDamping) * uImpulseAmplitudes[i];
      slope += delta / max(d, 0.001) * wave * uInteractionStrength;
    }

    // Centimetre chop is not resolvable across the pond; flattening the far
    // field also stops the tiled map from crawling under camera motion.
    float viewDist = distance(cameraPosition, vWorldPos);
    float fade = 1.0 - smoothstep(uRippleFade.x, uRippleFade.y, viewDist);
    float shoreRipple = smoothstep(0.015, max(0.04, uShoreWidth * 0.7), depthM);
    slope *= mix(uRippleFarStrength, 1.0, fade) * mix(0.18, 1.0, shoreRipple)
      * 0.16 * uRippleStrength;
    vec3 normal = normalize(vec3(-slope.x, 1.0, -slope.y));

    vec3 view = normalize(cameraPosition - vWorldPos);
    float ndv = clamp(dot(view, normal), 0.001, 1.0);
    float fresnel = clamp(0.04 + 0.96 * pow(1.0 - ndv, 5.0), 0.0, 1.0);

    // Beer-Lambert over the slant path: down, off the bed, back to the eye.
    // Grazing views look through metres of water where it is ankle deep.
    float pathLen = depthM * min(1.0 + 1.0 / ndv, 6.0);
    vec3 transmit = exp(-uExtinction * pathLen * uAbsorption);
    vec3 body = uScatter * (0.18 + 0.82 * uDayness);
    float wet = smoothstep(0.002, 0.025, depthM);
    float shore = (1.0 - smoothstep(0.0, uShoreWidth, depthM)) * wet;
    body = mix(body, uShoreColor, shore * uShoreTint);

    // Five stable taps soften the exact planar reflection. The separate scene
    // reflection control can hand more of the surface back to the sky grade.
    vec2 reflUv = vReflCoord.xy / vReflCoord.w + slope * uReflectionDistortion;
    vec2 blur = vec2(uReflectionBlur);
    vec3 mirror = texture2D(uReflection, reflUv).rgb * 0.4;
    mirror += texture2D(uReflection, reflUv + vec2(blur.x, 0.0)).rgb * 0.15;
    mirror += texture2D(uReflection, reflUv - vec2(blur.x, 0.0)).rgb * 0.15;
    mirror += texture2D(uReflection, reflUv + vec2(0.0, blur.y)).rgb * 0.15;
    mirror += texture2D(uReflection, reflUv - vec2(0.0, blur.y)).rgb * 0.15;
    vec3 skyRefl = mix(uSkyHorizon, uSkyZenith, clamp(reflect(-view, normal).y * 1.5, 0.0, 1.0));
    vec3 refl = mix(skyRefl, mirror, uHasReflection * uMirrorStrength);

    float reflShare = clamp((fresnel * 1.6 + 0.07) * uReflectivity, 0.0, 1.0);
    reflShare *= mix(0.38, 1.0, 1.0 - shore);
    vec3 color = mix(body, refl, reflShare);

    vec3 halfDir = normalize(uSunDir + view);
    float glint = pow(max(dot(normal, halfDir), 0.0), 160.0) * uKeyStrength;
    vec3 keyColor = mix(
      mix(vec3(1.0, 0.96, 0.88), vec3(1.0, 0.8, 0.55), uGolden),
      vec3(0.55, 0.7, 1.0),
      uMoonness
    );
    color += keyColor * glint * 0.9;

    // Waterline: a faint broken band where the sheet thins out, following the
    // bed contour rather than the mesh edge.
    float shallow = (1.0 - smoothstep(0.0, min(0.16, uShoreWidth), depthM)) * wet;
    float lap = 0.6 + 0.4 * sin(vWorldPos.x * 2.3 - vWorldPos.z * 1.7 + uTime * 0.9)
      * sin(vWorldPos.x * 0.7 + vWorldPos.z * 1.1 - uTime * 0.6);
    float foam = shallow * shallow * lap * uShoreFoam;
    color += foam * vec3(0.72, 0.78, 0.74) * (0.08 + 0.92 * uDayness);

    // Deep water is opaque body+mirror; thin water hands over to the real bed.
    float bodyAlpha = 1.0 - dot(transmit, vec3(0.34, 0.4, 0.26));
    float alpha = mix(bodyAlpha, 1.0, reflShare * 0.85);
    alpha *= mix(1.0, 0.42, uRefraction);
    alpha = min(alpha, 0.96) * smoothstep(0.0, 0.2, depthM);
    alpha = min(1.0, alpha + foam);

    gl_FragColor = vec4(color, alpha);
  }
`;

// Planar mirror bookkeeping (the math is three's Reflector, inlined).
const mirrorPlane = new THREE.Plane();
const mirrorNormal = new THREE.Vector3();
const mirrorWorldPos = new THREE.Vector3();
const cameraWorldPos = new THREE.Vector3();
const cameraRotation = new THREE.Matrix4();
const lookAt = new THREE.Vector3();
const mirrorView = new THREE.Vector3();
const mirrorTarget = new THREE.Vector3();
const clipPlane = new THREE.Vector4();
const clipQ = new THREE.Vector4();

export default function Water({ runtime, outline, level = -0.5 }) {
  const bake = useMemo(() => bakeDepth(outline, level), [outline, level]);
  const geometry = useMemo(() => buildSurface(bake), [bake]);
  const rippleTexture = useMemo(() => createRippleTexture(), []);

  const mirror = useMemo(
    () => ({
      target: new THREE.WebGLRenderTarget(MIRROR_RES, MIRROR_RES),
      camera: new THREE.PerspectiveCamera(),
      matrix: new THREE.Matrix4(),
      frame: 0,
      live: false,
    }),
    [],
  );
  useEffect(() => () => mirror.target.dispose(), [mirror]);
  useEffect(() => () => {
    geometry.dispose();
    bake.texture.dispose();
    rippleTexture.dispose();
  }, [geometry, bake, rippleTexture]);

  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: VERTEX,
        fragmentShader: FRAGMENT,
        transparent: true,
        uniforms: {
          uTime: { value: 0 },
          uDayness: { value: 1 },
          uGolden: { value: 0 },
          uKeyStrength: { value: 1 },
          uMoonness: { value: 0 },
          uSunDir: { value: new THREE.Vector3(0, 1, 0) },
          uScatter: { value: new THREE.Color('#3d5a4e') },
          uExtinction: { value: new THREE.Vector3(1.15, 0.55, 0.78) },
          uDepthTex: { value: bake.texture },
          uDepthRect: {
            value: new THREE.Vector4(bake.minX, bake.minZ, 1 / bake.width, 1 / bake.height),
          },
          uDepthRange: { value: DEPTH_RANGE },
          uRippleTex: { value: rippleTexture },
          uRippleFade: { value: new THREE.Vector2(14, 55) },
          uRippleOctaves: { value: 3 },
          uRippleScale: { value: 0.35 },
          uRippleStrength: { value: 1.48 },
          uRippleSpeed: { value: 2.55 },
          uRippleFarStrength: { value: 0.16 },
          uReflection: { value: mirror.target.texture },
          uHasReflection: { value: 0 },
          uReflectivity: { value: 0.76 },
          uMirrorStrength: { value: 0.84 },
          uReflectionBlur: { value: 0.0065 },
          uReflectionDistortion: { value: 0.42 },
          uRefraction: { value: 0.42 },
          uAbsorption: { value: 3 },
          uReflMatrix: { value: mirror.matrix },
          uSkyZenith: { value: new THREE.Color('#7fb0d8') },
          uSkyHorizon: { value: new THREE.Color('#dfe9ef') },
          uShoreWidth: { value: 0.64 },
          uShoreTint: { value: 0.94 },
          uShoreFoam: { value: 0.76 },
          uShoreColor: { value: new THREE.Color('#2a2414') },
          uInteractionStrength: { value: 2.35 },
          uWaveSpeed: { value: 1.2 },
          uWaveDamping: { value: 0.95 },
          uImpulseCount: { value: 0 },
          uImpulses: { value: Array.from({ length: MAX_IMPULSES }, () => new THREE.Vector3()) },
          uImpulseAmplitudes: { value: new Float32Array(MAX_IMPULSES) },
        },
        // The pond is blended over its real bed. Writing the sheet into the
        // depth buffer makes screen-space AO treat it as opaque ground.
        depthWrite: false,
      }),
    [bake, rippleTexture, mirror],
  );

  const playerState = useRef({
    initialized: false,
    last: [0, 0, 0],
    wasWet: false,
    wasGrounded: false,
    stride: 0,
    impulses: [],
  });
  const meshRef = useRef();
  const renderMirrorRef = useRef(() => {});

  // Claimed from useFrame every frame so the handle always belongs to the
  // live instance, whatever hot reload leaves behind.
  const debugHandle = useRef({});

  useFrame((state, delta) => {
    const handle = debugHandle.current;
    handle.material = material;
    handle.mirror = mirror;
    handle.mesh = meshRef.current;
    handle.three = state;
    gameDebug.water = handle;
    const uniforms = material.uniforms;
    const values = runtime.values;
    const ramps = solarRamps(values.timeOfDay, values.dayOfYear);
    const moon = moonState(values.timeOfDay, values.dayOfYear);
    const moonLight = moon.light * ramps.night * values.moonlightIntensity;
    const palette = environmentPalette(values.timeOfDay, values.dayOfYear, values);
    uniforms.uTime.value = state.clock.elapsedTime;
    uniforms.uDayness.value = ramps.daylight;
    uniforms.uGolden.value = ramps.golden;
    const moonIsKey = moonLight > ramps.daylight;
    uniforms.uSunDir.value.fromArray(moonIsKey ? moon.direction : ramps.direction).normalize();
    uniforms.uKeyStrength.value = Math.max(ramps.daylight, moonLight * 0.7);
    uniforms.uMoonness.value = moonIsKey ? 1 : 0;
    uniforms.uSkyZenith.value.fromArray(palette.top);
    uniforms.uSkyHorizon.value.fromArray(palette.horizon);
    uniforms.uReflectivity.value = values.waterReflectivity;
    uniforms.uMirrorStrength.value = values.waterMirrorStrength;
    uniforms.uReflectionBlur.value = values.waterReflectionBlur;
    uniforms.uReflectionDistortion.value = values.waterReflectionDistortion;
    uniforms.uRefraction.value = values.waterRefraction;
    uniforms.uAbsorption.value = values.waterAbsorption;
    uniforms.uRippleOctaves.value = values.waterRippleOctaves;
    uniforms.uRippleScale.value = values.waterRippleScale;
    uniforms.uRippleStrength.value = values.waterRippleStrength;
    uniforms.uRippleSpeed.value = values.waterRippleSpeed;
    uniforms.uRippleFarStrength.value = values.waterRippleFarStrength;
    uniforms.uShoreWidth.value = values.waterShoreWidth;
    uniforms.uShoreTint.value = values.waterShoreTint;
    uniforms.uShoreFoam.value = values.waterShoreFoam;
    uniforms.uShoreColor.value.set(values.waterShoreColor);
    uniforms.uInteractionStrength.value = values.waterInteractionStrength;
    uniforms.uWaveSpeed.value = values.waterWaveSpeed;
    uniforms.uWaveDamping.value = values.waterWaveDamping;

    const p = gameDebug.player.position;
    const s = playerState.current;
    if (!s.initialized) {
      s.last = [...p];
      s.wasGrounded = gameDebug.player.grounded;
      s.initialized = true;
    }
    const dx = p[0] - s.last[0];
    const dy = p[1] - s.last[1];
    const dz = p[2] - s.last[2];
    const distance = Math.hypot(dx, dz);
    const speed = delta > 0 ? distance / delta : 0;
    const verticalSpeed = delta > 0 ? dy / delta : 0;
    const wet = level - terrainHeight(p[0], p[2]) > 0.04 && p[1] < level + 1.4;
    const grounded = gameDebug.player.grounded;
    const emit = (amplitude) => {
      s.impulses.unshift({ x: p[0], z: p[2], age: 0, amplitude: Math.min(1.6, amplitude) });
      s.impulses.length = Math.min(MAX_IMPULSES, s.impulses.length);
    };

    if (wet && !s.wasWet) emit(0.65 + Math.abs(verticalSpeed) * 0.08 + speed * 0.025);
    if (wet && grounded && !s.wasGrounded) emit(0.75 + Math.abs(verticalSpeed) * 0.1);
    if (wet && !grounded && s.wasGrounded) emit(0.45 + Math.abs(verticalSpeed) * 0.06);
    if (wet && grounded && distance > 0) {
      s.stride += distance;
      const strideLength = Math.max(0.55, 1.15 - Math.min(speed, 8) * 0.045);
      if (s.stride >= strideLength) {
        s.stride %= strideLength;
        emit(0.24 + Math.min(speed, 10) * 0.045);
      }
    } else if (!wet) {
      s.stride = 0;
    }

    for (const impulse of s.impulses) impulse.age += delta;
    s.impulses = s.impulses.filter((impulse) => impulse.age < IMPULSE_LIFETIME);
    uniforms.uImpulseCount.value = s.impulses.length;
    for (let i = 0; i < MAX_IMPULSES; i += 1) {
      const impulse = s.impulses[i];
      if (impulse) {
        uniforms.uImpulses.value[i].set(impulse.x, impulse.z, impulse.age);
        uniforms.uImpulseAmplitudes.value[i] = impulse.amplitude;
      } else {
        uniforms.uImpulses.value[i].set(0, 0, 0);
        uniforms.uImpulseAmplitudes.value[i] = 0;
      }
    }
    s.last[0] = p[0];
    s.last[1] = p[1];
    s.last[2] = p[2];
    s.wasWet = wet;
    s.wasGrounded = grounded;
  });

  // Renders the scene mirrored about the water plane into a small target,
  // every MIRROR_INTERVAL frames. Shadow maps are reused, not re-rendered.
  const renderMirror = (renderer, scene, camera) => {
    mirror.renderer = renderer;
    mirror.frame += 1;
    if (mirror.live && mirror.frame % MIRROR_INTERVAL !== 0) return;
    const mesh = meshRef.current;
    if (!mesh) return;

    mirrorWorldPos.setFromMatrixPosition(mesh.matrixWorld);
    cameraWorldPos.setFromMatrixPosition(camera.matrixWorld);
    mirrorNormal.set(0, 1, 0);
    mirrorView.subVectors(mirrorWorldPos, cameraWorldPos);
    if (mirrorView.dot(mirrorNormal) > 0) return; // camera under the surface

    mirrorView.reflect(mirrorNormal).negate().add(mirrorWorldPos);
    cameraRotation.extractRotation(camera.matrixWorld);
    lookAt.set(0, 0, -1).applyMatrix4(cameraRotation).add(cameraWorldPos);
    mirrorTarget.subVectors(mirrorWorldPos, lookAt).reflect(mirrorNormal).negate().add(mirrorWorldPos);

    const virtual = mirror.camera;
    virtual.position.copy(mirrorView);
    virtual.up.set(0, 1, 0).applyMatrix4(cameraRotation).reflect(mirrorNormal);
    virtual.lookAt(mirrorTarget);
    virtual.far = camera.far;
    virtual.updateMatrixWorld();
    virtual.projectionMatrix.copy(camera.projectionMatrix);

    mirror.matrix.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1);
    mirror.matrix.multiply(virtual.projectionMatrix);
    mirror.matrix.multiply(virtual.matrixWorldInverse);

    // Oblique near plane: clip everything below the surface out of the mirror.
    mirrorPlane.setFromNormalAndCoplanarPoint(mirrorNormal, mirrorWorldPos);
    mirrorPlane.applyMatrix4(virtual.matrixWorldInverse);
    clipPlane.set(mirrorPlane.normal.x, mirrorPlane.normal.y, mirrorPlane.normal.z, mirrorPlane.constant);
    const proj = virtual.projectionMatrix;
    clipQ.x = (Math.sign(clipPlane.x) + proj.elements[8]) / proj.elements[0];
    clipQ.y = (Math.sign(clipPlane.y) + proj.elements[9]) / proj.elements[5];
    clipQ.z = -1;
    clipQ.w = (1 + proj.elements[10]) / proj.elements[14];
    clipPlane.multiplyScalar(2 / clipPlane.dot(clipQ));
    proj.elements[2] = clipPlane.x;
    proj.elements[6] = clipPlane.y;
    proj.elements[10] = clipPlane.z + 1 - 0.003;
    proj.elements[14] = clipPlane.w;

    mesh.visible = false;
    const previousTarget = renderer.getRenderTarget();
    const previousShadowAuto = renderer.shadowMap.autoUpdate;
    renderer.shadowMap.autoUpdate = false;
    renderer.setRenderTarget(mirror.target);
    renderer.state.buffers.depth.setMask(true);
    renderer.clear();
    renderer.render(scene, virtual);
    renderer.shadowMap.autoUpdate = previousShadowAuto;
    renderer.setRenderTarget(previousTarget);
    mesh.visible = true;

    if (!mirror.live) {
      mirror.live = true;
      material.uniforms.uHasReflection.value = 1;
    }
  };

  // R3F does not forward onBeforeRender as an object property, so the mirror
  // hook is attached by hand when the mesh mounts.
  const attachMesh = (mesh) => {
    meshRef.current = mesh;
    if (mesh) {
      mesh.onBeforeRender = (renderer, ...args) => {
        renderMirrorRef.current(renderer, ...args);
      };
    }
  };
  renderMirrorRef.current = renderMirror;

  return (
    <mesh
      ref={attachMesh}
      geometry={geometry}
      material={material}
      position={[0, level, 0]}
    />
  );
}
