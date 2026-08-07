import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { solarRamps } from '../world/solar.js';

// Darwin's CloudDeck idea at small scale: one BackSide dome, an fbm field
// planar-projected onto the view direction, lit by a gradient probe toward
// the sun. One draw call replaces the old sprite blobs.
const VERTEX = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = normalize(position);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const FRAGMENT = /* glsl */ `
  varying vec3 vDir;
  uniform float uTime;
  uniform float uCover;
  uniform float uCumulus;
  uniform float uScale;
  uniform float uDayness;
  uniform float uGolden;
  uniform float uNight;
  uniform vec3 uSunDir;
  uniform vec3 uFogColor;

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }
  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
      mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
      u.y
    );
  }
  float fbm(vec2 p) {
    return noise(p) * 0.55 + noise(p * 2.13) * 0.28 + noise(p * 4.41) * 0.17;
  }

  void main() {
    vec3 dir = normalize(vDir);
    float aboveHorizon = smoothstep(0.02, 0.12, dir.y);
    if (aboveHorizon <= 0.0) discard;

    // The projection trick: broad overhead, compressed at the horizon.
    vec2 p = dir.xz / (max(dir.y, 0.0) + 0.18) * uScale;
    vec2 drift = vec2(uTime * 0.014, uTime * 0.004);
    float field = fbm(p * 0.9 + drift);

    float threshold = clamp(mix(0.78, 0.5, uCumulus), 0.2, 0.95);
    float puff = smoothstep(threshold, threshold + 0.2, field);

    // Faster parallax scud layer sells the drift.
    vec2 p2 = dir.xz / (max(dir.y, 0.0) + 0.34) * uScale * 2.1;
    float scud = smoothstep(0.72, 0.92, fbm(p2 + drift * 2.3)) * 0.35;

    float alpha = (puff * (0.5 + 0.4 * uCover) + scud * 0.3) * uCover * aboveHorizon * (1.0 - uNight * 0.85);
    if (alpha < 0.01) discard;

    // Gradient probe toward the sun: sample the field one step sunward,
    // the difference is the lit flank.
    vec2 sunPlane = normalize(uSunDir.xz + vec2(1e-4));
    vec2 lightStep = sunPlane * mix(0.2, 0.5, 1.0 - clamp(uSunDir.y, 0.0, 1.0));
    float sunFacing = clamp((field - fbm(p * 0.9 + drift + lightStep)) * 3.4 + 0.42, 0.0, 1.0);

    vec3 shaded = uFogColor * 0.72;
    vec3 lit = mix(vec3(0.78), vec3(1.0, 0.99, 0.96), uDayness);
    lit = mix(lit, vec3(1.0, 0.62, 0.36), uGolden * 0.8);
    vec3 color = mix(shaded, lit, sunFacing);
    // Rim past 1.0 on purpose: the one part of a cloud that should bloom.
    color += vec3(1.0, 0.9, 0.75) * pow(sunFacing, 3.0) * uDayness * 0.24;

    gl_FragColor = vec4(color, alpha);
  }
`;

export default function CloudDome({ config, runtime }) {
  const materialRef = useRef();
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: VERTEX,
        fragmentShader: FRAGMENT,
        transparent: true,
        depthWrite: false,
        side: THREE.BackSide,
        uniforms: {
          uTime: { value: 0 },
          uCover: { value: 0.5 },
          uCumulus: { value: 0.35 },
          uScale: { value: 1 },
          uDayness: { value: 1 },
          uGolden: { value: 0 },
          uNight: { value: 0 },
          uSunDir: { value: new THREE.Vector3(0, 1, 0) },
          uFogColor: { value: new THREE.Color(config.fog?.color ?? '#cdd6e4') },
        },
      }),
    [config],
  );

  useFrame((state) => {
    const values = runtime.values;
    const ramps = solarRamps(values.timeOfDay);
    const uniforms = material.uniforms;
    uniforms.uTime.value = state.clock.elapsedTime * values.cloudSpeed;
    uniforms.uCover.value = values.cloudCover;
    uniforms.uCumulus.value = values.cloudCumulus;
    uniforms.uScale.value = values.cloudScale;
    uniforms.uDayness.value = ramps.daylight;
    uniforms.uGolden.value = ramps.golden;
    uniforms.uNight.value = ramps.night;
    uniforms.uSunDir.value.set(ramps.direction[0], ramps.direction[1], ramps.direction[2]);
  });

  return (
    <mesh material={material} ref={materialRef} renderOrder={-5}>
      <sphereGeometry args={[800, 48, 24]} />
    </mesh>
  );
}
