import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { solarRamps } from '../world/solar.js';

// An image-based light for interiors. Outdoors the HDRI in SkyRig gives every
// material something to reflect; indoors there was nothing, so polished wood,
// brass and glass had only the direct lights and read as flat paint.
//
// This is not a capture of the room — it is a cheap stand-in built from the
// room's own colours: dark ceiling overhead, wall tone around, floor below,
// and a few bright patches where the windows are. That is enough for a
// specular highlight to land in a plausible place.

const WIDTH = 128;
const HEIGHT = 64;

function probeTexture(colors, windowColor, gaslightColor) {
  const canvas = document.createElement('canvas');
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const context = canvas.getContext('2d');

  // Equirectangular: the top row of the image is straight up.
  const bands = [
    [0, 0.34, colors.ceiling ?? '#cfc6b4'],
    [0.34, 0.66, colors.wall ?? '#8d8371'],
    [0.66, 1, colors.floor ?? '#4a3524'],
  ];
  for (const [from, to, color] of bands) {
    context.fillStyle = color;
    context.fillRect(0, from * HEIGHT, WIDTH, (to - from) * HEIGHT);
  }

  // Windows: four bright patches around the horizon, since a corner room in
  // this game usually has openings on more than one wall.
  context.fillStyle = windowColor;
  for (let i = 0; i < 4; i += 1) {
    context.fillRect(i * (WIDTH / 4) + WIDTH / 16, HEIGHT * 0.38, WIDTH / 8, HEIGHT * 0.2);
  }

  // Two gas fixtures near the ceiling, so a night reflection has something
  // warm to catch.
  context.fillStyle = gaslightColor;
  for (const u of [0.2, 0.7]) {
    context.beginPath();
    context.arc(u * WIDTH, HEIGHT * 0.3, 3, 0, Math.PI * 2);
    context.fill();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.mapping = THREE.EquirectangularReflectionMapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export default function InteriorEnvironment({ lighting, runtime }) {
  const scene = useThree((state) => state.scene);
  const texture = useMemo(
    () => probeTexture(lighting.materials, runtime.values.windowColor, runtime.values.gaslightColor),
    // Built once per room: the probe is coarse enough that live colour edits
    // are not worth a rebuild every frame.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [lighting],
  );

  useEffect(() => {
    scene.environment = texture;
    return () => {
      scene.environment = null;
      texture.dispose();
    };
  }, [scene, texture]);

  useFrame(() => {
    const values = runtime.values;
    const { daylight } = solarRamps(values.timeOfDay, values.dayOfYear);
    scene.environmentIntensity = values.interiorEnvIntensity * (0.3 + 0.7 * daylight);
  });

  return null;
}
