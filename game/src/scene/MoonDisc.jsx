import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { moonState } from '../world/moon.js';
import { solarRamps, smoothstep } from '../world/solar.js';

const DISTANCE = 610;
const ANGULAR_DIAMETER = THREE.MathUtils.degToRad(1.05);
const DISC = 2 * DISTANCE * Math.tan(ANGULAR_DIAMETER / 2);
const CRATERS = [
  [-0.34, 0.22, 0.16], [0.28, 0.3, 0.11], [0.38, -0.18, 0.19],
  [-0.12, -0.28, 0.09], [-0.46, -0.12, 0.07], [0.02, 0.46, 0.08],
];

function createMoonTexture(size = 128) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d');
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.userData.context = context;
  return texture;
}

function updateMoonTexture(texture, phaseAngle) {
  const canvas = texture.image;
  const context = texture.userData.context;
  const size = canvas.width;
  const image = context.createImageData(size, size);
  const lightX = Math.sin(phaseAngle);
  const lightZ = -Math.cos(phaseAngle);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const px = ((x + 0.5) / size) * 2 - 1;
      const py = 1 - ((y + 0.5) / size) * 2;
      const radiusSquared = px * px + py * py;
      const offset = (y * size + x) * 4;
      if (radiusSquared >= 1) continue;
      const pz = Math.sqrt(1 - radiusSquared);
      const light = smoothstep(-0.035, 0.055, px * lightX + pz * lightZ);
      let albedo = 0.82 + 0.035 * Math.sin(px * 29 + py * 17) * Math.sin(py * 41 - px * 13);
      for (const [cx, cy, radius] of CRATERS) {
        const distance = Math.hypot(px - cx, py - cy) / radius;
        if (distance < 1) albedo *= 0.72 + 0.2 * smoothstep(0.55, 1, distance);
      }
      const limb = 0.74 + 0.26 * pz;
      const shade = (0.035 + light * 0.965) * limb * albedo;
      image.data[offset] = Math.round(220 * shade);
      image.data[offset + 1] = Math.round(231 * shade);
      image.data[offset + 2] = Math.round(246 * shade);
      image.data[offset + 3] = Math.round(255 * (1 - smoothstep(0.96, 1, Math.sqrt(radiusSquared))));
    }
  }
  context.putImageData(image, 0, 0);
  texture.needsUpdate = true;
}

function createHaloTexture(size = 96) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d');
  const gradient = context.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, 'rgba(215,230,255,0.9)');
  gradient.addColorStop(0.15, 'rgba(175,205,255,0.34)');
  gradient.addColorStop(1, 'rgba(120,165,255,0)');
  context.fillStyle = gradient;
  context.fillRect(0, 0, size, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export default function MoonDisc({ runtime }) {
  const camera = useThree((state) => state.camera);
  const groupRef = useRef();
  const discRef = useRef();
  const haloRef = useRef();
  const lastPhase = useRef(Infinity);
  const direction = useMemo(() => new THREE.Vector3(), []);
  const textures = useMemo(() => ({ moon: createMoonTexture(), halo: createHaloTexture() }), []);

  useEffect(() => () => Object.values(textures).forEach((texture) => texture.dispose()), [textures]);

  useFrame(() => {
    const values = runtime.values;
    const moon = moonState(values.timeOfDay, values.dayOfYear);
    const ramps = solarRamps(values.timeOfDay, values.dayOfYear);
    const group = groupRef.current;
    if (!group) return;
    const skyVisibility = moon.visibility * (0.18 + 0.82 * (1 - ramps.daylight));
    group.visible = skyVisibility > 0.003;
    if (!group.visible) return;

    direction.fromArray(moon.direction).normalize();
    group.position.copy(camera.position).addScaledVector(direction, DISTANCE);
    const size = DISC * values.moonSize;
    discRef.current.scale.setScalar(size);
    discRef.current.material.opacity = skyVisibility;
    haloRef.current.scale.setScalar(size * 9);
    haloRef.current.material.opacity = moon.light * ramps.night * values.moonlightIntensity * 0.48;

    if (Math.abs(lastPhase.current - moon.phaseAngle) > 0.002) {
      updateMoonTexture(textures.moon, moon.phaseAngle);
      lastPhase.current = moon.phaseAngle;
    }
  });

  return (
    <group ref={groupRef}>
      <sprite ref={haloRef} renderOrder={-8} frustumCulled={false}>
        <spriteMaterial
          map={textures.halo}
          transparent
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          fog={false}
        />
      </sprite>
      <sprite ref={discRef} renderOrder={-7} frustumCulled={false}>
        <spriteMaterial map={textures.moon} transparent depthWrite={false} fog={false} />
      </sprite>
    </group>
  );
}
