// Stage-scenery flats past the playable border: painted skyline strips to the
// south and east where the city continues, tree lines to the north and west
// where the park does. Silhouettes are drawn once to canvas textures on
// cutout planes — six draws, no lights, no shadows; scene fog supplies the
// atmospheric perspective and a frame-driven tint follows the daylight.

import { use, useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { WORLD_BOUNDS } from '../world/streetGrid.js';
import { solarRamps } from '../world/solar.js';

const { minX, maxX, minZ, maxZ } = WORLD_BOUNDS;
const midX = (minX + maxX) / 2;
const midZ = (minZ + maxZ) / 2;
const spanX = maxX - minX + 180;
const spanZ = maxZ - minZ + 180;

// [style, seed, width, height(m), position, yRotation]
// City sits south (+z) and east (+x); the park continues north and west.
// The far ring is taller and hazier: the city going on behind the city.
const FLATS = [
  ['city', 11, spanX, 26, [midX, 12, maxZ + 16], Math.PI],
  ['city', 23, spanZ, 26, [maxX + 16, 12, midZ], -Math.PI / 2],
  ['city-far', 31, spanX + 140, 44, [midX, 21, maxZ + 86], Math.PI],
  ['city-far', 47, spanZ + 140, 44, [maxX + 86, 21, midZ], -Math.PI / 2],
  ['trees', 5, spanX, 16, [midX, 6, minZ - 16], 0],
  ['trees', 7, spanZ, 16, [minX - 16, 6, midZ], Math.PI / 2],
];

let strips;
function loadStrips() {
  if (strips) return strips;
  const sizes = FLATS.map(([style, seed, width]) => [Math.min(2048, Math.round(width * 4)), 128, seed, style]);
  strips = new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./backdropArt.worker.js', import.meta.url), { type: 'module' });
    worker.postMessage(sizes);
    worker.onmessage = ({ data }) => {
      worker.terminate();
      if (data) resolve(data);
      else reject();
    };
    worker.onerror = event => { event.preventDefault(); worker.terminate(); reject(event.error); };
  }).catch(async () => {
    const { paintBackdrop } = await import('./backdropArt.js');
    const images = [];
    for (const [width, height, seed, style] of sizes) {
      await new Promise(resolve => requestAnimationFrame(resolve));
      const canvas = document.createElement('canvas');
      canvas.width = width * 2;
      canvas.height = height * 2;
      paintBackdrop(canvas, width, height, seed, style);
      images.push(canvas);
    }
    return images;
  });
  return strips;
}

export default function Backdrop({ runtime }) {
  const images = use(loadStrips());
  const flats = useMemo(() => FLATS.map(([, , width, height, position, yaw], index) => {
    const image = images[index];
    const texture = new THREE.Texture(image);
    if (image instanceof HTMLCanvasElement) texture.flipY = true;
    else texture.flipY = false; // The worker flips ImageBitmap pixels before transfer.
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 4;
    texture.needsUpdate = true;
    return { texture, width, height, position, yaw };
  }), [images]);

  const materials = useMemo(
    () =>
      flats.map(
        (flat) =>
          new THREE.MeshBasicMaterial({
            map: flat.texture,
            alphaTest: 0.5,
            side: THREE.DoubleSide,
            fog: true,
          }),
      ),
    [flats],
  );

  useEffect(
    () => () => {
      for (const flat of flats) flat.texture.dispose();
      for (const material of materials) material.dispose();
    },
    [flats, materials],
  );

  // Unlit flats would glow at night; follow the sun instead.
  useFrame(() => {
    const { daylight } = solarRamps(runtime.values.timeOfDay, runtime.values.dayOfYear);
    const level = 0.3 + 0.7 * daylight;
    for (const material of materials) material.color.setScalar(level);
  });

  return (
    <group>
      {flats.map((flat, index) => (
        <mesh
          key={index}
          position={flat.position}
          rotation={[0, flat.yaw, 0]}
          material={materials[index]}
          frustumCulled
        >
          <planeGeometry args={[flat.width, flat.height]} />
        </mesh>
      ))}
    </group>
  );
}
