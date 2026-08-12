import { useEffect, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import {
  buildButterflies,
  butterflyActivity,
  butterflyStateAt,
} from '../world/butterflies.js';
import { buildButterflyGeometry } from './butterflyGeometry.js';

const scratch = new THREE.Object3D();

const vertexShader = /* glsl */ `
  uniform float uTime;
  attribute float aWingSide;
  attribute float aPart;
  attribute float aWingPhase;
  attribute float aShade;
  varying float vPart;
  varying float vShade;
  #include <fog_pars_vertex>

  void main() {
    vec3 shaped = position;
    if (abs(aWingSide) > 0.5) {
      float lift = 0.15 + sin(uTime * 12.5 + aWingPhase) * 0.85;
      shaped.y += abs(shaped.x) * lift;
      shaped.x *= 0.82 + cos(lift) * 0.18;
    }
    vPart = aPart;
    vShade = aShade;
    vec4 mvPosition = modelViewMatrix * instanceMatrix * vec4(shaped, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`;

const fragmentShader = /* glsl */ `
  varying float vPart;
  varying float vShade;
  #include <common>
  #include <fog_pars_fragment>

  void main() {
    vec3 dark = vec3(0.06, 0.045, 0.025);
    vec3 tawny = mix(vec3(0.58, 0.25, 0.055), vec3(0.82, 0.65, 0.2), vShade);
    vec3 pale = mix(vec3(0.54, 0.48, 0.27), vec3(0.9, 0.78, 0.48), vShade);
    vec3 colour = vPart < 0.5 ? dark : (vPart < 1.5 ? tawny : pale);
    gl_FragColor = vec4(colour, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    #include <fog_fragment>
  }
`;

function buildButterflyMesh() {
  const butterflies = buildButterflies();
  const geometry = buildButterflyGeometry();
  geometry.setAttribute(
    'aWingPhase',
    new THREE.InstancedBufferAttribute(new Float32Array(butterflies.map((item) => item.wingPhase)), 1),
  );
  geometry.setAttribute(
    'aShade',
    new THREE.InstancedBufferAttribute(new Float32Array(butterflies.map((item) => item.shade)), 1),
  );
  const material = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([
      THREE.UniformsLib.fog,
      { uTime: { value: 0 } },
    ]),
    vertexShader,
    fragmentShader,
    side: THREE.DoubleSide,
    fog: true,
    toneMapped: true,
  });
  const mesh = new THREE.InstancedMesh(geometry, material, butterflies.length);
  mesh.name = 'butterflies';
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.frustumCulled = false;
  return { butterflies, geometry, material, mesh, states: butterflies.map(() => ({})) };
}

export default function Butterflies({ runtime }) {
  const swarm = useMemo(buildButterflyMesh, []);

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
    const time = clock.elapsedTime * values.butterflySpeed;
    const activeCount = Math.round(
      values.butterflyCount * butterflyActivity(values.timeOfDay),
    );
    swarm.material.uniforms.uTime.value = time;
    swarm.mesh.visible = activeCount > 0;
    if (!swarm.mesh.visible) return;

    for (let index = 0; index < swarm.butterflies.length; index += 1) {
      const butterfly = swarm.butterflies[index];
      const state = butterflyStateAt(
        butterfly,
        time,
        values.butterflySpread,
        swarm.states[index],
      );
      if (index >= activeCount) {
        scratch.position.set(0, -100, 0);
        scratch.rotation.set(0, 0, 0);
        scratch.scale.setScalar(0);
      } else {
        scratch.position.set(state.x, state.y, state.z);
        scratch.rotation.set(state.pitch, state.yaw, state.bank, 'YXZ');
        scratch.scale.setScalar(butterfly.scale * values.butterflySize);
      }
      scratch.updateMatrix();
      swarm.mesh.setMatrixAt(index, scratch.matrix);
    }
    swarm.mesh.instanceMatrix.needsUpdate = true;
  });

  return <primitive object={swarm.mesh} />;
}
