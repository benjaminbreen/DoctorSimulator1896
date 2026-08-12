import { useEffect, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { buildBeeSwarm, beeStateAt } from '../world/beeSwarm.js';
import { solarRamps } from '../world/solar.js';
import { buildBeeGeometry } from './beeGeometry.js';

const scratch = new THREE.Object3D();

const vertexShader = /* glsl */ `
  uniform float uTime;
  attribute float aPart;
  attribute float aWingSide;
  attribute float aWingPhase;
  varying float vPart;
  #include <fog_pars_vertex>

  void main() {
    vec3 shaped = position;
    if (abs(aWingSide) > 0.5) {
      float flap = sin(uTime * 78.0 + aWingPhase) * 0.75;
      shaped.y += abs(shaped.x) * flap;
    }
    vPart = aPart;
    vec4 mvPosition = modelViewMatrix * instanceMatrix * vec4(shaped, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`;

const fragmentShader = /* glsl */ `
  uniform float uDaylight;
  varying float vPart;
  #include <common>
  #include <fog_pars_fragment>

  void main() {
    if (uDaylight < 0.12) discard;
    vec3 colour = vec3(0.055, 0.045, 0.025);
    if (vPart > 1.5) colour = vec3(0.55, 0.57, 0.48);
    else if (vPart > 0.5) colour = vec3(0.92, 0.58, 0.045);
    colour *= 0.48 + uDaylight * 0.52;
    gl_FragColor = vec4(colour, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    #include <fog_fragment>
  }
`;

function buildBeeMesh() {
  const bees = buildBeeSwarm();
  const geometry = buildBeeGeometry();
  geometry.setAttribute(
    'aWingPhase',
    new THREE.InstancedBufferAttribute(new Float32Array(bees.map((bee) => bee.wingPhase)), 1),
  );
  const material = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([
      THREE.UniformsLib.fog,
      { uTime: { value: 0 }, uDaylight: { value: 1 } },
    ]),
    vertexShader,
    fragmentShader,
    side: THREE.DoubleSide,
    fog: true,
    toneMapped: true,
  });
  const mesh = new THREE.InstancedMesh(geometry, material, bees.length);
  mesh.name = 'bee-swarms';
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.frustumCulled = false;
  scratch.scale.setScalar(0);
  scratch.updateMatrix();
  for (let index = 0; index < bees.length; index += 1) mesh.setMatrixAt(index, scratch.matrix);
  mesh.instanceMatrix.needsUpdate = true;
  return { bees, geometry, material, mesh, states: bees.map(() => ({})) };
}

export default function BeeSwarms({ runtime }) {
  const swarm = useMemo(buildBeeMesh, []);

  useEffect(
    () => () => {
      swarm.geometry.dispose();
      swarm.material.dispose();
      swarm.mesh.dispose();
    },
    [swarm],
  );

  useFrame(({ clock }) => {
    const values = runtime.values;
    const time = clock.elapsedTime * values.beeSpeed;
    const visibleCount = Math.round(values.beeCount);
    const daylight = solarRamps(values.timeOfDay, values.dayOfYear).daylight;
    swarm.material.uniforms.uTime.value = time;
    swarm.material.uniforms.uDaylight.value = daylight;

    for (let index = 0; index < swarm.bees.length; index += 1) {
      const bee = swarm.bees[index];
      const state = beeStateAt(bee, time, values.beeSpread, swarm.states[index]);
      if (index >= visibleCount || daylight < 0.12) {
        scratch.position.set(0, -100, 0);
        scratch.rotation.set(0, 0, 0);
        scratch.scale.setScalar(0);
      } else {
        scratch.position.set(state.x, state.y, state.z);
        scratch.rotation.set(state.pitch, state.yaw, state.bank, 'YXZ');
        scratch.scale.setScalar(bee.scale * values.beeSize);
      }
      scratch.updateMatrix();
      swarm.mesh.setMatrixAt(index, scratch.matrix);
    }
    swarm.mesh.instanceMatrix.needsUpdate = true;
  });

  return <primitive object={swarm.mesh} />;
}
