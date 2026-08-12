import { useEffect, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import {
  buildFireflies,
  fireflyActivity,
  FIREFLY_PATCHES,
} from '../world/fireflies.js';

const vertexShader = /* glsl */ `
  uniform float uTime;
  uniform float uPresence;
  uniform float uSize;
  uniform float uSpread;
  attribute float aPhase;
  attribute float aPulse;
  attribute float aRadius;
  attribute float aHeight;
  attribute float aRate;
  attribute float aSize;
  varying float vGlow;
  #include <fog_pars_vertex>

  void main() {
    float angle = uTime * aRate + aPhase;
    vec3 moving = position;
    moving.x += (cos(angle) * aRadius + sin(angle * 1.7 + aPulse) * aRadius * 0.23) * uSpread;
    moving.z += (sin(angle) * aRadius * 0.72 + cos(angle * 1.3 + aPulse) * aRadius * 0.25) * uSpread;
    moving.y += aHeight * (0.68 + sin(angle * 1.9 + aPulse) * 0.3);

    vec4 mvPosition = modelViewMatrix * vec4(moving, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    float pulse = pow(max(0.0, sin(uTime * 1.8 + aPulse)), 8.0);
    vGlow = uPresence * (0.12 + pulse * 0.88);
    gl_PointSize = clamp(aSize * uSize * uPresence * (34.0 / max(1.0, -mvPosition.z)), 0.0, 10.0);
    #include <fog_vertex>
  }
`;

const fragmentShader = /* glsl */ `
  varying float vGlow;
  #include <common>
  #include <fog_pars_fragment>

  void main() {
    float distanceFromCentre = length(gl_PointCoord - vec2(0.5)) * 2.0;
    float halo = 1.0 - smoothstep(0.05, 1.0, distanceFromCentre);
    float core = 1.0 - smoothstep(0.0, 0.28, distanceFromCentre);
    float alpha = (halo * 0.35 + core * 0.65) * vGlow;
    if (alpha < 0.015) discard;
    vec3 colour = mix(vec3(0.5, 0.75, 0.08), vec3(1.0, 0.92, 0.26), core);
    gl_FragColor = vec4(colour * (0.7 + core * 0.8), alpha);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    #include <fog_fragment>
  }
`;

function buildFireflyPoints() {
  const fireflies = buildFireflies();
  const positions = [];
  for (const firefly of fireflies) {
    const patch = FIREFLY_PATCHES[firefly.patch];
    positions.push(patch.x, patch.y, patch.z);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  for (const [name, key] of [
    ['aPhase', 'phase'],
    ['aPulse', 'pulse'],
    ['aRadius', 'radius'],
    ['aHeight', 'height'],
    ['aRate', 'rate'],
    ['aSize', 'size'],
  ]) {
    geometry.setAttribute(
      name,
      new THREE.Float32BufferAttribute(fireflies.map((firefly) => firefly[key]), 1),
    );
  }
  const material = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([
      THREE.UniformsLib.fog,
      {
        uTime: { value: 0 },
        uPresence: { value: 0 },
        uSize: { value: 1 },
        uSpread: { value: 1 },
      },
    ]),
    vertexShader,
    fragmentShader,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    fog: true,
    toneMapped: true,
  });
  const points = new THREE.Points(geometry, material);
  points.name = 'fireflies';
  points.frustumCulled = false;
  return { fireflies, geometry, material, points };
}

export default function Fireflies({ runtime }) {
  const swarm = useMemo(buildFireflyPoints, []);

  useEffect(
    () => () => {
      swarm.geometry.dispose();
      swarm.material.dispose();
    },
    [swarm],
  );

  useFrame(({ clock }) => {
    const values = runtime.values;
    const presence = fireflyActivity(values.timeOfDay, values.dayOfYear);
    const visibleCount = Math.round(values.fireflyCount);
    swarm.points.visible = presence > 0.01 && visibleCount > 0;
    swarm.geometry.setDrawRange(0, visibleCount);
    swarm.material.uniforms.uTime.value = clock.elapsedTime * values.fireflySpeed;
    swarm.material.uniforms.uPresence.value = presence;
    swarm.material.uniforms.uSize.value = values.fireflySize;
    swarm.material.uniforms.uSpread.value = values.fireflySpread;
  });

  return <primitive object={swarm.points} />;
}
