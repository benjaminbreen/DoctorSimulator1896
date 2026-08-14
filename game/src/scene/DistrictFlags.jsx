import { useEffect, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { solarRamps } from '../world/solar.js';
import { streetDressingLayout } from '../world/streetDressing.js';

const POLE_HEIGHT = 3.28;
const NO_RAYCAST = () => {};
const scratch = new THREE.Object3D();

function traceStar(context, cx, cy, outerRadius) {
  const innerRadius = outerRadius * 0.382;
  context.beginPath();
  for (let point = 0; point < 10; point += 1) {
    const angle = -Math.PI / 2 + point * Math.PI / 5;
    const radius = point % 2 === 0 ? outerRadius : innerRadius;
    const x = cx + Math.cos(angle) * radius;
    const y = cy + Math.sin(angle) * radius;
    if (point === 0) context.moveTo(x, y);
    else context.lineTo(x, y);
  }
  context.closePath();
  context.fill();
}

function createFortyFiveStarTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 270;
  const context = canvas.getContext('2d');
  const stripeHeight = canvas.height / 13;
  context.fillStyle = '#f1ead9';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = '#9d2928';
  for (let stripe = 0; stripe < 13; stripe += 2) {
    context.fillRect(0, stripe * stripeHeight, canvas.width, stripeHeight + 0.5);
  }

  const cantonWidth = canvas.width * 0.405;
  const cantonHeight = stripeHeight * 7;
  context.fillStyle = '#243b62';
  context.fillRect(0, 0, cantonWidth, cantonHeight);
  context.fillStyle = '#f7f0df';
  const rowGap = cantonHeight / 7;
  for (let row = 0; row < 6; row += 1) {
    const count = row % 2 === 0 ? 8 : 7;
    const columnGap = cantonWidth / 9;
    const inset = row % 2 === 0 ? columnGap * 0.75 : columnGap * 1.25;
    for (let column = 0; column < count; column += 1) {
      traceStar(context, inset + column * columnGap, rowGap * (row + 1), 5.9);
    }
  }

  // A faint warm veil avoids a digitally pure red-white-blue patch while
  // retaining enough contrast for the 45-star field to read from the street.
  context.fillStyle = 'rgba(105, 82, 50, 0.055)';
  context.fillRect(0, 0, canvas.width, canvas.height);

  const texture = new THREE.CanvasTexture(canvas);
  texture.name = '1896 forty-five-star flag';
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = true;
  texture.anisotropy = 8;
  return texture;
}

function createFlagGeometry(phases) {
  // Unit cloth runs from the hoist at x=0 to the free edge at x=1, and from
  // the pole attachment at y=0 down to y=-1. Instance scale supplies metres.
  const geometry = new THREE.PlaneGeometry(1, 1, 16, 5);
  geometry.translate(0.5, -0.5, 0);
  geometry.setAttribute(
    'aFlagPhase',
    new THREE.InstancedBufferAttribute(new Float32Array(phases), 1),
  );
  geometry.computeBoundingSphere();
  return geometry;
}

function createFlagMaterial(texture) {
  return new THREE.ShaderMaterial({
    name: 'shared 1896 national flag cloth',
    uniforms: THREE.UniformsUtils.merge([
      THREE.UniformsLib.fog,
      {
        uMap: { value: texture },
        uTime: { value: 0 },
        uDaylight: { value: 1 },
      },
    ]),
    vertexShader: /* glsl */ `
      uniform float uTime;
      attribute float aFlagPhase;
      varying vec2 vUv;
      varying float vFoldLight;
      #include <fog_pars_vertex>

      void main() {
        vUv = uv;
        vec3 shaped = position;
        float freeEdge = pow(clamp(uv.x, 0.0, 1.0), 0.86);
        float phase = uTime * 2.05 + aFlagPhase;
        float broadWave = sin(phase + uv.x * 5.4 + uv.y * 0.7);
        float smallRipple = sin(phase * 1.67 + uv.x * 11.3 - uv.y * 2.1);
        shaped.z += freeEdge * (broadWave * 0.16 + smallRipple * 0.045);
        shaped.y += freeEdge * freeEdge * sin(phase * 0.78 + uv.x * 4.2) * 0.045;
        vFoldLight = 0.84 + 0.16 * cos(phase + uv.x * 5.4 + uv.y * 0.7);
        vec4 mvPosition = modelViewMatrix * instanceMatrix * vec4(shaped, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }
    `,
    fragmentShader: /* glsl */ `
      uniform sampler2D uMap;
      uniform float uDaylight;
      varying vec2 vUv;
      varying float vFoldLight;
      #include <common>
      #include <fog_pars_fragment>

      void main() {
        vec3 flag = texture2D(uMap, vUv).rgb;
        float outdoorLight = mix(0.26, 1.0, clamp(uDaylight, 0.0, 1.0));
        float faceLight = gl_FrontFacing ? 1.0 : 0.9;
        gl_FragColor = vec4(flag * vFoldLight * outdoorLight * faceLight, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }
    `,
    side: THREE.DoubleSide,
    fog: true,
    toneMapped: true,
  });
}

function createPoleGeometry() {
  const shaft = new THREE.CylinderGeometry(0.035, 0.047, POLE_HEIGHT, 8);
  shaft.translate(0, POLE_HEIGHT / 2, 0);
  const finial = new THREE.SphereGeometry(0.082, 8, 6);
  finial.translate(0, POLE_HEIGHT + 0.075, 0);
  const geometry = mergeGeometries([shaft, finial]);
  shaft.dispose();
  finial.dispose();
  geometry.computeBoundingSphere();
  return geometry;
}

function createFlagBatch(flags) {
  const texture = createFortyFiveStarTexture();
  const geometry = createFlagGeometry(flags.map((flag) => flag.phase));
  const material = createFlagMaterial(texture);
  const mesh = new THREE.InstancedMesh(geometry, material, flags.length);
  mesh.name = 'street-dressing-national-flags';
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.raycast = NO_RAYCAST;
  flags.forEach((flag, index) => {
    scratch.position.set(flag.position[0], flag.position[1] + POLE_HEIGHT - 0.3, flag.position[2]);
    scratch.rotation.set(0, flag.yaw, 0);
    scratch.scale.set(flag.size[0], flag.size[1], 1);
    scratch.updateMatrix();
    mesh.setMatrixAt(index, scratch.matrix);
  });
  mesh.instanceMatrix.needsUpdate = true;
  mesh.computeBoundingBox();
  mesh.computeBoundingSphere();
  return { texture, geometry, material, mesh };
}

function createPoleBatch(flags) {
  const geometry = createPoleGeometry();
  const material = new THREE.MeshStandardMaterial({
    name: 'shared flagpole bronze',
    color: '#52483a',
    roughness: 0.46,
    metalness: 0.72,
  });
  const mesh = new THREE.InstancedMesh(geometry, material, flags.length);
  mesh.name = 'street-dressing-flagpoles';
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.raycast = NO_RAYCAST;
  flags.forEach((flag, index) => {
    scratch.position.set(...flag.position);
    scratch.rotation.set(0, flag.yaw, 0);
    scratch.scale.setScalar(1);
    scratch.updateMatrix();
    mesh.setMatrixAt(index, scratch.matrix);
  });
  mesh.instanceMatrix.needsUpdate = true;
  mesh.computeBoundingBox();
  mesh.computeBoundingSphere();
  return { geometry, material, mesh };
}

export default function DistrictFlags({ runtime }) {
  const flags = streetDressingLayout.flags;
  const cloth = useMemo(() => createFlagBatch(flags), [flags]);
  const poles = useMemo(() => createPoleBatch(flags), [flags]);

  useEffect(() => () => {
    cloth.texture.dispose();
    cloth.geometry.dispose();
    cloth.material.dispose();
    poles.geometry.dispose();
    poles.material.dispose();
  }, [cloth, poles]);

  useFrame(({ clock }) => {
    cloth.material.uniforms.uTime.value = clock.elapsedTime;
    cloth.material.uniforms.uDaylight.value = solarRamps(
      runtime.values.timeOfDay,
      runtime.values.dayOfYear,
    ).daylight;
  });

  return (
    <group name="three selective 45-star flags">
      <primitive object={poles.mesh} />
      <primitive object={cloth.mesh} />
    </group>
  );
}
