import { useEffect, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import {
  buildPigeonFlock,
  buildSoloPigeons,
  pigeonStateAt,
  soloPigeonStateAt,
} from '../world/pigeonFlock.js';
import { solarRamps } from '../world/solar.js';
import { buildPigeonGeometry } from './pigeonGeometry.js';

const scratch = new THREE.Object3D();

const vertexShader = /* glsl */ `
  uniform float uTime;
  attribute float aWingSide;
  attribute float aFlapPhase;
  attribute float aShade;
  varying float vShade;
  #include <fog_pars_vertex>

  void main() {
    vec3 shaped = position;
    float flapWave = sin(uTime * 24.0 + aFlapPhase);
    float flapAngle = flapWave * 0.48 * aWingSide;
    if (abs(aWingSide) > 0.5) {
      float shoulder = 0.045 * aWingSide;
      float across = shaped.x - shoulder;
      float c = cos(flapAngle);
      float s = sin(flapAngle);
      shaped.x = shoulder + across * c - shaped.y * s;
      shaped.y = across * s + shaped.y * c;
    }
    shaped.y += sin(uTime * 24.0 + aFlapPhase) * 0.012;
    vShade = aShade;

    vec4 mvPosition = modelViewMatrix * instanceMatrix * vec4(shaped, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`;

const fragmentShader = /* glsl */ `
  uniform vec3 uColor;
  uniform float uDaylight;
  varying float vShade;
  #include <common>
  #include <fog_pars_fragment>

  void main() {
    if (uDaylight < 0.08) discard;
    float light = (0.34 + uDaylight * 0.66) * vShade;
    gl_FragColor = vec4(uColor * light, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    #include <fog_fragment>
  }
`;

function buildFlockMesh() {
  const birds = [...buildPigeonFlock(), ...buildSoloPigeons()];
  const geometry = buildPigeonGeometry();
  geometry.setAttribute(
    'aFlapPhase',
    new THREE.InstancedBufferAttribute(new Float32Array(birds.map((bird) => bird.flapPhase)), 1),
  );
  geometry.setAttribute(
    'aShade',
    new THREE.InstancedBufferAttribute(new Float32Array(birds.map((bird) => bird.shade)), 1),
  );
  const material = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([
      THREE.UniformsLib.fog,
      {
        uTime: { value: 0 },
        uDaylight: { value: 1 },
        uColor: { value: new THREE.Color('#596069') },
      },
    ]),
    vertexShader,
    fragmentShader,
    side: THREE.DoubleSide,
    fog: true,
    toneMapped: true,
  });
  const mesh = new THREE.InstancedMesh(geometry, material, birds.length);
  mesh.name = 'pigeon-flock';
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  // Flight spans the whole zone, while instance matrices begin at the origin.
  // One tiny batch is cheaper than recomputing its aggregate bounds each frame.
  mesh.frustumCulled = false;
  scratch.scale.setScalar(0);
  scratch.updateMatrix();
  for (let index = 0; index < birds.length; index += 1) mesh.setMatrixAt(index, scratch.matrix);
  mesh.instanceMatrix.needsUpdate = true;
  return { birds, geometry, material, mesh, states: birds.map(() => ({})) };
}

export default function PigeonFlock({ runtime }) {
  const flock = useMemo(buildFlockMesh, []);

  useEffect(
    () => () => {
      flock.geometry.dispose();
      flock.material.dispose();
      flock.mesh.dispose();
    },
    [flock],
  );

  useFrame(({ clock }) => {
    const values = runtime.values;
    const time = clock.elapsedTime * values.pigeonSpeed;
    const visibleCount = Math.round(values.pigeonCount);
    const visibleSoloCount = Math.round(values.pigeonSoloCount);
    flock.material.uniforms.uTime.value = time;
    flock.material.uniforms.uDaylight.value = solarRamps(
      values.timeOfDay,
      values.dayOfYear,
    ).daylight;

    for (let index = 0; index < flock.birds.length; index += 1) {
      const bird = flock.birds[index];
      const state = bird.solo
        ? soloPigeonStateAt(bird, time, flock.states[index])
        : pigeonStateAt(bird, time, flock.states[index], values.pigeonContinuous);
      const visible = bird.solo
        ? bird.soloIndex < visibleSoloCount
        : index < visibleCount;
      if (!state.active || !visible) {
        scratch.position.set(0, -100, 0);
        scratch.rotation.set(0, 0, 0);
        scratch.scale.setScalar(0);
      } else {
        scratch.position.set(state.x, state.y + values.pigeonAltitude, state.z);
        scratch.rotation.set(state.pitch, state.yaw, state.bank, 'YXZ');
        scratch.scale.setScalar(bird.scale * values.pigeonSize);
      }
      scratch.updateMatrix();
      flock.mesh.setMatrixAt(index, scratch.matrix);
    }
    flock.mesh.instanceMatrix.needsUpdate = true;
  });

  return <primitive object={flock.mesh} />;
}
