import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { degToRad } from '../movement/mathUtils.js';
import { solarRamps } from '../world/solar.js';

// Daylight coming through the sashes: a soft wedge of lit air angling down
// into the room, with a little dust turning over inside it. The beam has to
// come first — motes on their own have nothing to belong to and read as
// insects. Both fade out with the sun.

const SHAFT_LENGTH = 6.5;
const MOTES_PER_WINDOW = 26;
// Scattered daylight, warmer than the source it came through.
const SUNBEAM = new THREE.Color('#ffd6a2');
const warm = new THREE.Color();

const SHAFT_VERTEX = `
  varying vec3 vLocal;
  void main() {
    vLocal = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

// Fades along the beam and softly at its edges, so the wedge has no visible
// sides — the giveaway of a box pretending to be light.
const SHAFT_FRAGMENT = `
  uniform vec3 uHalf;
  uniform vec3 uColor;
  uniform float uIntensity;
  varying vec3 vLocal;
  void main() {
    vec3 n = vLocal / uHalf;
    float along = clamp(n.z * 0.5 + 0.5, 0.0, 1.0);
    float reach = pow(1.0 - along, 1.7);
    float edge = (1.0 - smoothstep(0.18, 1.0, abs(n.x)))
               * (1.0 - smoothstep(0.18, 1.0, abs(n.y)));
    gl_FragColor = vec4(uColor, reach * edge * uIntensity);
  }
`;

function hash01(seed) {
  const value = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return value - Math.floor(value);
}

export default function LightShafts({ holes, runtime }) {
  const groupRef = useRef();
  const motesRef = useRef();

  const windows = useMemo(() => holes.filter((hole) => hole.type === 'window'), [holes]);

  const shafts = useMemo(() => {
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    return windows.map((hole) => {
      const half = new THREE.Vector3(hole.width * 0.62, hole.height * 0.62, SHAFT_LENGTH / 2);
      const material = new THREE.ShaderMaterial({
        vertexShader: SHAFT_VERTEX,
        fragmentShader: SHAFT_FRAGMENT,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        uniforms: {
          uHalf: { value: half },
          uColor: { value: new THREE.Color('#ffdcae') },
          uIntensity: { value: 0 },
        },
      });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.scale.set(half.x * 2, half.y * 2, half.z * 2);
      mesh.frustumCulled = false;
      return { hole, mesh, material };
    });
  }, [windows]);

  const motes = useMemo(() => {
    const list = [];
    windows.forEach((hole, index) => {
      for (let i = 0; i < MOTES_PER_WINDOW; i += 1) {
        const seed = index * 977 + i * 13;
        list.push({
          hole,
          // Kept inside the wedge, so every speck sits in lit air.
          u: (hash01(seed) - 0.5) * hole.width * 0.9,
          v: (hash01(seed + 1) - 0.5) * hole.height * 0.9,
          along: hash01(seed + 2),
          rate: 0.012 + hash01(seed + 3) * 0.02,
          sway: hash01(seed + 4) * Math.PI * 2,
          size: 0.0022 + hash01(seed + 5) * 0.004,
        });
      }
    });
    return list;
  }, [windows]);

  const moteGeometry = useMemo(() => new THREE.SphereGeometry(1, 4, 3), []);
  const moteMaterial = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color: '#ffdcb4',
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    [],
  );

  useEffect(
    () => () => {
      for (const shaft of shafts) shaft.material.dispose();
      if (shafts[0]) shafts[0].mesh.geometry.dispose();
      moteGeometry.dispose();
      moteMaterial.dispose();
    },
    [shafts, moteGeometry, moteMaterial],
  );

  useFrame((state) => {
    const values = runtime.values;
    const { daylight, golden } = solarRamps(values.timeOfDay);
    const strength = daylight * values.windowIntensity;
    // Lit air always reads warmer than the light that made it — scattering
    // drops the blue first. Straight window colour gives grey fog, not a
    // sunbeam, and warms further as the sun sinks.
    warm.set(values.windowColor).lerp(SUNBEAM, 0.6 + golden * 0.3);

    // Beams follow the same sun elevation the window portals use, so the
    // lit air and the lit floor agree.
    const elevation = degToRad(values.windowElevationDeg);
    for (const shaft of shafts) {
      const { hole, mesh, material } = shaft;
      material.uniforms.uIntensity.value = strength * 0.05;
      material.uniforms.uColor.value.copy(warm);
      const inward = new THREE.Vector3(-hole.normal[0], 0, -hole.normal[2]).normalize();
      const direction = new THREE.Vector3(
        inward.x * Math.cos(elevation),
        -Math.sin(elevation),
        inward.z * Math.cos(elevation),
      ).normalize();
      mesh.position.set(
        hole.position[0] + direction.x * (SHAFT_LENGTH / 2),
        hole.position[1] + direction.y * (SHAFT_LENGTH / 2),
        hole.position[2] + direction.z * (SHAFT_LENGTH / 2),
      );
      mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), direction);
      mesh.visible = strength > 0.02;
    }

    const mesh = motesRef.current;
    if (!mesh || motes.length === 0) return;
    moteMaterial.opacity = Math.min(0.5, strength * 0.34);
    mesh.visible = strength > 0.02;
    if (!mesh.visible) return;

    const time = state.clock.elapsedTime;
    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    const quaternion = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    const inward = new THREE.Vector3();
    const right = new THREE.Vector3();
    const up = new THREE.Vector3(0, 1, 0);

    motes.forEach((mote, index) => {
      const { hole } = mote;
      inward.set(-hole.normal[0], 0, -hole.normal[2]).normalize();
      const direction = new THREE.Vector3(
        inward.x * Math.cos(elevation),
        -Math.sin(elevation),
        inward.z * Math.cos(elevation),
      ).normalize();
      right.crossVectors(direction, up).normalize();

      // Drift down the beam and wrap, with a slow sideways turn.
      const travel = ((mote.along + time * mote.rate) % 1) * SHAFT_LENGTH;
      const drift = Math.sin(time * 0.3 + mote.sway) * 0.09;
      position
        .set(hole.position[0], hole.position[1], hole.position[2])
        .addScaledVector(direction, travel)
        .addScaledVector(right, mote.u + drift)
        .addScaledVector(up, mote.v + Math.cos(time * 0.22 + mote.sway) * 0.05);
      scale.setScalar(mote.size);
      matrix.compose(position, quaternion, scale);
      mesh.setMatrixAt(index, matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
  });

  if (windows.length === 0) return null;
  return (
    <group ref={groupRef}>
      {shafts.map((shaft, index) => (
        <primitive key={index} object={shaft.mesh} />
      ))}
      <instancedMesh
        ref={motesRef}
        args={[moteGeometry, moteMaterial, motes.length]}
        frustumCulled={false}
      />
    </group>
  );
}
