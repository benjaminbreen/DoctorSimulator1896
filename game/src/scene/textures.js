// Canvas-generated surface textures. Subtle by design: they add depth to
// flat placeholder rooms without reading as tiled game textures.

import * as THREE from 'three';

const cache = new Map();

function makeCanvas(size) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  return canvas;
}

function finish(canvas) {
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

// Floor planks: horizontal boards with tone jitter, seams, and light grain.
export function woodTexture(base) {
  const key = `wood:${base}`;
  if (cache.has(key)) return cache.get(key);
  const size = 256;
  const canvas = makeCanvas(size);
  const context = canvas.getContext('2d');
  const color = new THREE.Color(base);
  const boardHeight = 32;
  for (let y = 0; y < size; y += boardHeight) {
    const jitter = (Math.sin(y * 12.9898) * 43758.5453) % 1;
    const tone = color.clone().multiplyScalar(0.9 + Math.abs(jitter) * 0.22);
    context.fillStyle = `#${tone.getHexString()}`;
    context.fillRect(0, y, size, boardHeight);
    context.fillStyle = 'rgba(0,0,0,0.28)';
    context.fillRect(0, y, size, 2);
    for (let line = 0; line < 5; line += 1) {
      const grainY = y + 4 + ((Math.abs(jitter) * 977 + line * 61) % (boardHeight - 8));
      context.fillStyle = 'rgba(0,0,0,0.06)';
      context.fillRect(0, grainY, size, 1);
    }
  }
  const texture = finish(canvas);
  cache.set(key, texture);
  return texture;
}

// Plaster: base color with fine brightness noise. Non-directional, so stripe
// density cannot mismatch across wall segments of different widths.
export function plasterTexture(base) {
  const key = `plaster:${base}`;
  if (cache.has(key)) return cache.get(key);
  const size = 128;
  const canvas = makeCanvas(size);
  const context = canvas.getContext('2d');
  const color = new THREE.Color(base);
  context.fillStyle = `#${color.getHexString()}`;
  context.fillRect(0, 0, size, size);
  const image = context.getImageData(0, 0, size, size);
  for (let i = 0; i < image.data.length; i += 4) {
    const noise = (Math.sin(i * 0.317) * 43758.5453) % 1;
    const shift = 1 + Math.abs(noise) * 0.09 - 0.045;
    image.data[i] = Math.min(255, image.data[i] * shift);
    image.data[i + 1] = Math.min(255, image.data[i + 1] * shift);
    image.data[i + 2] = Math.min(255, image.data[i + 2] * shift);
  }
  context.putImageData(image, 0, 0);
  const texture = finish(canvas);
  cache.set(key, texture);
  return texture;
}
