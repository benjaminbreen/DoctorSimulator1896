import { useMemo } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { solarRamps } from '../world/solar.js';

// Pond surface shaped from its authored outline: perturbed normal, fresnel
// deep/shallow mix, sun glint.
const VERTEX = /* glsl */ `
  varying vec3 vWorldPos;
  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorldPos = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const FRAGMENT = /* glsl */ `
  varying vec3 vWorldPos;
  uniform float uTime;
  uniform float uDayness;
  uniform vec3 uSunDir;
  uniform vec3 uDeep;
  uniform vec3 uShallow;

  void main() {
    vec2 p = vWorldPos.xz;
    float wave =
      sin(p.x * 1.7 + uTime * 0.9) * 0.5 +
      sin(p.y * 2.3 - uTime * 0.7) * 0.3 +
      sin((p.x + p.y) * 3.1 + uTime * 1.3) * 0.2;
    vec3 normal = normalize(vec3(wave * 0.08, 1.0, wave * 0.06));

    vec3 view = normalize(cameraPosition - vWorldPos);
    float fresnel = pow(1.0 - max(dot(view, normal), 0.0), 2.5);
    float glint = pow(max(dot(reflect(-uSunDir, normal), view), 0.0), 70.0) * uDayness;

    vec3 color = mix(uDeep, uShallow, fresnel * 0.75) * (0.35 + 0.65 * uDayness);
    color += vec3(1.0, 0.95, 0.85) * glint * 0.8;
    gl_FragColor = vec4(color, 0.93);
  }
`;

export default function Water({ runtime, outline, level = -0.45 }) {
  const geometry = useMemo(() => {
    const shape = new THREE.Shape();
    outline.forEach(([x, z], index) => {
      if (index === 0) shape.moveTo(x, -z);
      else shape.lineTo(x, -z);
    });
    shape.closePath();
    return new THREE.ShapeGeometry(shape, 24);
  }, [outline]);

  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: VERTEX,
        fragmentShader: FRAGMENT,
        transparent: true,
        uniforms: {
          uTime: { value: 0 },
          uDayness: { value: 1 },
          uSunDir: { value: new THREE.Vector3(0, 1, 0) },
          uDeep: { value: new THREE.Color('#26424e') },
          uShallow: { value: new THREE.Color('#5d8a96') },
        },
      }),
    [],
  );

  useFrame((state) => {
    const ramps = solarRamps(runtime.values.timeOfDay);
    material.uniforms.uTime.value = state.clock.elapsedTime;
    material.uniforms.uDayness.value = ramps.daylight;
    material.uniforms.uSunDir.value.set(ramps.direction[0], ramps.direction[1], ramps.direction[2]);
  });

  return <mesh geometry={geometry} material={material} position={[0, level, 0]} rotation={[-Math.PI / 2, 0, 0]} />;
}
