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

const FACADE_STYLES = [
  { base: '#6b5648', trim: '#57453a' },
  { base: '#7d4f3e', trim: '#5e3b2e' },
  { base: '#8d8375', trim: '#726a5c' },
  { base: '#61564c', trim: '#4c433b' },
  // White marble (the Metropolitan Club look).
  { base: '#c9c2b4', trim: '#a8a191' },
];

function seededRandom(seed) {
  let state = seed;
  return () => {
    state = (state * 9301 + 49297) % 233280;
    return state / 233280;
  };
}

// Generated 1890s street facade sized to the building, so windows keep real
// proportions: one column per ~2.8m of width, one floor per ~3.4m of height.
export function buildingFacade(styleIndex, seed, widthM, heightM) {
  const floors = Math.min(8, Math.max(2, Math.round((heightM - 2) / 3.4)));
  const cols = Math.min(6, Math.max(2, Math.round(widthM / 2.8)));
  const key = `facade:${styleIndex}:${seed}:${floors}:${cols}`;
  if (cache.has(key)) return cache.get(key);

  const unit = 52;
  const width = cols * unit + 16;
  const height = floors * unit + 22;
  const canvas = makeCanvas(width);
  canvas.height = height;
  const context = canvas.getContext('2d');
  const style = FACADE_STYLES[styleIndex % FACADE_STYLES.length];
  const random = seededRandom(seed * 7919 + 13);

  context.fillStyle = style.base;
  context.fillRect(0, 0, width, height);
  for (let i = 0; i < 60 * cols; i += 1) {
    context.fillStyle = `rgba(0,0,0,${random() * 0.05})`;
    context.fillRect(random() * width, random() * height, 3 + random() * 8, 2 + random() * 4);
  }

  // Upper floors: window per column with lintel, sill, and the odd lit pane.
  for (let floor = 0; floor < floors - 1; floor += 1) {
    const y = 28 + floor * unit;
    for (let col = 0; col < cols; col += 1) {
      const x = 12 + col * unit;
      context.fillStyle = style.trim;
      context.fillRect(x - 3, y - 6, 38, 6);
      context.fillStyle = random() < 0.12 ? '#d9a24c' : '#181614';
      context.fillRect(x, y, 32, 38);
      context.fillStyle = 'rgba(255,255,255,0.12)';
      context.fillRect(x, y, 32, 4);
      context.fillStyle = style.trim;
      context.fillRect(x - 2, y + 38, 36, 4);
    }
  }

  // Ground floor: doorway plus tall windows.
  const groundY = height - unit - 4;
  context.fillStyle = style.trim;
  context.fillRect(0, groundY - 4, width, unit + 8);
  for (let col = 0; col < cols; col += 1) {
    const x = 12 + col * unit;
    context.fillStyle = col === Math.floor(cols / 2) ? '#171512' : 'rgba(20,18,15,0.92)';
    context.fillRect(x, groundY + 4, 32, unit - 10);
  }

  // Cornice.
  context.fillStyle = style.trim;
  context.fillRect(0, 0, width, 14);
  context.fillStyle = 'rgba(0,0,0,0.3)';
  context.fillRect(0, 14, width, 6);

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
