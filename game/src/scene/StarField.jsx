import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { solarRamps } from '../world/solar.js';
import { moonState } from '../world/moon.js';

const STAR_COUNT = 720;
const DISTANCE = 740;

function randomGenerator(seed) {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function starGeometry() {
  const random = randomGenerator(18960803);
  const positions = new Float32Array(STAR_COUNT * 3);
  const colors = new Float32Array(STAR_COUNT * 3);
  const sizes = new Float32Array(STAR_COUNT);
  const phases = new Float32Array(STAR_COUNT);
  for (let i = 0; i < STAR_COUNT; i += 1) {
    const up = 0.025 + random() * 0.975;
    const angle = random() * Math.PI * 2;
    const radius = Math.sqrt(1 - up * up);
    positions[i * 3] = Math.cos(angle) * radius * DISTANCE;
    positions[i * 3 + 1] = up * DISTANCE;
    positions[i * 3 + 2] = Math.sin(angle) * radius * DISTANCE;
    const temperature = random();
    colors[i * 3] = 0.72 + temperature * 0.38;
    colors[i * 3 + 1] = 0.82 + (1 - Math.abs(temperature - 0.5) * 2) * 0.18;
    colors[i * 3 + 2] = 0.78 + (1 - temperature) * 0.34;
    const bright = Math.pow(random(), 5);
    sizes[i] = 0.75 + bright * 2.4;
    phases[i] = random() * Math.PI * 2;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
  geometry.setAttribute('aPhase', new THREE.BufferAttribute(phases, 1));
  return geometry;
}

const VERTEX = /* glsl */ `
  attribute float aSize;
  attribute float aPhase;
  attribute vec3 color;
  uniform float uTime;
  uniform float uPixelRatio;
  varying vec3 vColor;
  varying float vTwinkle;
  void main() {
    vColor = color;
    vTwinkle = 0.93 + 0.07 * sin(uTime * (0.45 + aPhase * 0.08) + aPhase);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = aSize * uPixelRatio;
  }
`;

const FRAGMENT = /* glsl */ `
  uniform float uVisibility;
  uniform float uBrightness;
  varying vec3 vColor;
  varying float vTwinkle;
  void main() {
    float radius = length(gl_PointCoord - vec2(0.5));
    if (radius > 0.5) discard;
    float alpha = (1.0 - smoothstep(0.08, 0.5, radius)) * uVisibility * vTwinkle;
    gl_FragColor = vec4(vColor * uBrightness, alpha);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

export default function StarField({ runtime }) {
  const camera = useThree((state) => state.camera);
  const pointsRef = useRef();
  const geometry = useMemo(starGeometry, []);
  const material = useMemo(() => new THREE.ShaderMaterial({
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexColors: true,
    fog: false,
    uniforms: {
      uTime: { value: 0 },
      uPixelRatio: { value: 1 },
      uVisibility: { value: 0 },
      uBrightness: { value: 1 },
    },
  }), []);

  useEffect(() => () => {
    geometry.dispose();
    material.dispose();
  }, [geometry, material]);

  useFrame((state) => {
    const values = runtime.values;
    const ramps = solarRamps(values.timeOfDay, values.dayOfYear);
    const moon = moonState(values.timeOfDay, values.dayOfYear);
    pointsRef.current.position.copy(camera.position);
    material.uniforms.uTime.value = state.clock.elapsedTime;
    material.uniforms.uPixelRatio.value = Math.min(2, state.gl.getPixelRatio());
    material.uniforms.uVisibility.value = ramps.starVisibility * (1 - moon.light * 0.32);
    material.uniforms.uBrightness.value = values.starBrightness;
    pointsRef.current.visible = material.uniforms.uVisibility.value > 0.002;
  });

  return <points ref={pointsRef} geometry={geometry} material={material} renderOrder={-9} frustumCulled={false} />;
}
