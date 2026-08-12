import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { solarRamps, smoothstep } from '../world/solar.js';

// Sun body: a disc with two additive halos around it, all camera-facing and
// depth-tested, so a building or a tree cuts them off the way it should. Held
// 600m out — beyond every collider, inside the 1500m far plane, and nearer
// than the sky dome, which writes depth at the far plane.
//
// Darwin's lesson: the disc stays near-white and the warmth lives in the
// halos. A disc tinted orange at noon reads as a sticker.
const DISTANCE = 600;
// Half a degree is life size and looks like a mistake at a 50 degree FOV;
// 1.4 is the usual cheat. The disc-size slider scales this.
const ANGULAR_DIAMETER = THREE.MathUtils.degToRad(1.4);
const DISC = 2 * DISTANCE * Math.tan(ANGULAR_DIAMETER / 2);

const DISC_WHITE = new THREE.Color('#fff6e2');
const DISC_LOW = new THREE.Color('#ffb264');
const HALO_DAY = new THREE.Color('#ffd9a0');
const HALO_LOW = new THREE.Color('#ff7c33');
const scratch = new THREE.Color();

// Limb-darkened disc: bright core, cooler rim, hard edge with one pixel of
// falloff so it does not alias into a polygon.
function discTexture(size = 128) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d');
  const image = context.createImageData(size, size);
  const half = size / 2;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const r = Math.hypot((x + 0.5 - half) / half, (y + 0.5 - half) / half) / 0.92;
      const i = (y * size + x) * 4;
      const limb = Math.max(0, 1 - r * r * 0.55);
      image.data[i] = 255;
      image.data[i + 1] = 236 + limb * 19;
      image.data[i + 2] = 190 + limb * 65;
      image.data[i + 3] = Math.round(255 * (1 - smoothstep(0.97, 1.0, r)));
    }
  }
  context.putImageData(image, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

// Radial falloff for the halos. `power` sets how tightly the light hugs the
// disc: the corona is tight, the aureole is the whole quarter of sky near it.
function haloTexture(power, size = 128) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d');
  const image = context.createImageData(size, size);
  const half = size / 2;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const r = Math.min(1, Math.hypot((x + 0.5 - half) / half, (y + 0.5 - half) / half));
      const i = (y * size + x) * 4;
      image.data[i] = 255;
      image.data[i + 1] = 255;
      image.data[i + 2] = 255;
      image.data[i + 3] = Math.round(255 * Math.pow(1 - r, power));
    }
  }
  context.putImageData(image, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export default function SunDisc({ runtime }) {
  const camera = useThree((state) => state.camera);
  const groupRef = useRef();
  const discRef = useRef();
  const coronaRef = useRef();
  const aureoleRef = useRef();

  const textures = useMemo(
    () => ({ disc: discTexture(), corona: haloTexture(3.2), aureole: haloTexture(1.7) }),
    [],
  );
  useEffect(() => () => Object.values(textures).forEach((texture) => texture.dispose()), [textures]);

  useFrame(() => {
    const values = runtime.values;
    const { direction, daylight, golden, altitude } = solarRamps(values.timeOfDay, values.dayOfYear);
    const group = groupRef.current;
    if (!group) return;

    group.visible = daylight > 0.005;
    if (!group.visible) return;
    group.position
      .copy(camera.position)
      .addScaledVector(new THREE.Vector3(direction[0], direction[1], direction[2]), DISTANCE);

    // Low sun sits behind more air: the disc swells, dims and reddens, and
    // the glow spreads. The sliders set the noon baseline; altitude drives
    // the swell, so dusk and dawn get their big sun without touching them.
    const low = 1 - smoothstep(1, 20, altitude);
    const size = DISC * values.sunDiscSize * (1 + low * 0.75);
    const glow = values.sunGlow * daylight * (1 + low * 0.5);

    discRef.current.scale.setScalar(size);
    // Well past 1 on purpose: the bloom threshold is 0.98 and the disc is the
    // one thing in the scene that should always clear it. A low sun dims some
    // — anything brighter tone-maps to white, and the warmth is the point —
    // but it stays the brightest thing in frame.
    scratch.copy(DISC_WHITE).lerp(DISC_LOW, low * 0.75).multiplyScalar(4 - low * 1.6);
    discRef.current.material.color.copy(scratch);

    scratch.copy(HALO_DAY).lerp(HALO_LOW, Math.min(1, golden * 1.4 + low * 0.6));
    coronaRef.current.scale.setScalar(size * (4 + low * 3.5));
    coronaRef.current.material.color.copy(scratch);
    coronaRef.current.material.opacity = glow * (0.45 + golden * 0.35 + low * 0.45);

    aureoleRef.current.scale.setScalar(size * (14 + low * 8));
    aureoleRef.current.material.color.copy(scratch);
    aureoleRef.current.material.opacity = glow * (0.1 + golden * 0.14 + low * 0.1);
  });

  // Drawn before the clouds (renderOrder -5) so a cloud passing the sun
  // covers it instead of the other way round.
  return (
    <group ref={groupRef}>
      <sprite ref={aureoleRef} renderOrder={-8}>
        <spriteMaterial
          map={textures.aureole}
          transparent
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          fog={false}
        />
      </sprite>
      <sprite ref={coronaRef} renderOrder={-7}>
        <spriteMaterial
          map={textures.corona}
          transparent
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          fog={false}
        />
      </sprite>
      <sprite ref={discRef} renderOrder={-6}>
        <spriteMaterial map={textures.disc} transparent depthWrite={false} fog={false} />
      </sprite>
    </group>
  );
}
