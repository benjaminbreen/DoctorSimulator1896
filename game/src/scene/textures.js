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

// Facade grid shared by the painted texture and the instanced window
// geometry (WindowField), so glass panes land exactly on the painted
// openings: one column per ~2.8m of width, one floor per ~3.4m of height.
export function facadeLayout(widthM, heightM) {
  const floors = Math.min(8, Math.max(2, Math.round((heightM - 2) / 3.4)));
  const cols = Math.min(6, Math.max(2, Math.round(widthM / 2.8)));
  const unit = 52;
  const texW = cols * unit + 16;
  const texH = floors * unit + 22;
  // 1896 sash proportions: tall and narrow, wall dominating glass. A 52px
  // unit is ~2.8m, so 20px is a ~1.1m opening about two panes high.
  const upper = [];
  for (let floor = 0; floor < floors - 1; floor += 1) {
    for (let col = 0; col < cols; col += 1) {
      upper.push({ col, floor, x: 18 + col * unit, y: 26 + floor * unit, w: 20, h: 34 });
    }
  }
  const groundBandY = texH - unit - 4;
  const ground = [];
  for (let col = 0; col < cols; col += 1) {
    ground.push({ col, x: 16 + col * unit, y: groundBandY + 4, w: 24, h: unit - 10, isDoor: col === Math.floor(cols / 2) });
  }
  return { floors, cols, unit, texW, texH, upper, ground, groundBandY };
}

// Painted openings stay uniformly dark: they read as interior depth behind
// the instanced glass, which owns lit panes, frames, and shutters.
export function buildingFacade(styleIndex, seed, widthM, heightM) {
  const layout = facadeLayout(widthM, heightM);
  const key = `facade:${styleIndex}:${seed}:${layout.floors}:${layout.cols}`;
  if (cache.has(key)) return cache.get(key);

  const { texW: width, texH: height } = layout;
  const canvas = makeCanvas(width);
  canvas.height = height;
  const context = canvas.getContext('2d');
  const style = FACADE_STYLES[styleIndex % FACADE_STYLES.length];
  const random = seededRandom(seed * 7919 + 13);

  // Per-building tone shift, so a row of brownstones is not one brown.
  const base = new THREE.Color(style.base);
  base.offsetHSL((random() - 0.5) * 0.02, (random() - 0.5) * 0.05, (random() - 0.5) * 0.05);
  context.fillStyle = `#${base.getHexString()}`;
  context.fillRect(0, 0, width, height);
  for (let i = 0; i < 60 * layout.cols; i += 1) {
    context.fillStyle = `rgba(0,0,0,${random() * 0.05})`;
    context.fillRect(random() * width, random() * height, 3 + random() * 8, 2 + random() * 4);
  }

  // String courses between the upper floors.
  context.fillStyle = style.trim;
  for (let floor = 1; floor < layout.floors - 1; floor += 1) {
    context.fillRect(0, 26 + floor * layout.unit - 10, width, 3);
  }

  for (const win of layout.upper) {
    context.fillStyle = style.trim;
    context.fillRect(win.x - 4, win.y - 7, win.w + 8, 7);
    context.fillStyle = '#141210';
    context.fillRect(win.x, win.y, win.w, win.h);
    context.fillStyle = style.trim;
    context.fillRect(win.x - 3, win.y + win.h, win.w + 6, 4);
  }

  // Rusticated basement course and the ground floor: doorway plus windows.
  context.fillStyle = style.trim;
  context.fillRect(0, layout.groundBandY - 4, width, layout.unit + 8);
  context.fillStyle = 'rgba(0,0,0,0.16)';
  for (let joint = 0; joint < 3; joint += 1) {
    context.fillRect(0, layout.groundBandY + 10 + joint * 13, width, 2);
  }
  for (const win of layout.ground) {
    context.fillStyle = win.isDoor ? '#171512' : 'rgba(18,16,13,0.92)';
    context.fillRect(win.x, win.y, win.w, win.h);
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
