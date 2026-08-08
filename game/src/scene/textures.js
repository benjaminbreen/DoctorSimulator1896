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

// The facade grid lives in world/facade.js (interiors derive from it too);
// re-exported here for the scene modules that paint and dress facades.
import { facadeLayout } from '../world/facade.js';

export { facadeLayout };

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

// What a sash window shows from inside: sky graded down to a hazy horizon,
// with the dark smudge of buildings across the street at the bottom. A flat
// bright pane is the single thing that makes an interior read as fake, so
// this is deliberately not a solid colour.
export function windowSkyTexture() {
  const key = 'windowSky';
  if (cache.has(key)) return cache.get(key);
  const width = 64;
  const height = 256;
  const canvas = makeCanvas(width);
  canvas.height = height;
  const context = canvas.getContext('2d');

  const sky = context.createLinearGradient(0, 0, 0, height);
  sky.addColorStop(0, '#8fa8cc');
  sky.addColorStop(0.45, '#b9c8dd');
  sky.addColorStop(0.72, '#d8dbdb');
  sky.addColorStop(1, '#c8c3b8');
  context.fillStyle = sky;
  context.fillRect(0, 0, width, height);

  // Rooftops opposite: irregular dark blocks along the lower third.
  context.fillStyle = 'rgba(78,72,66,0.85)';
  let x = 0;
  let index = 0;
  while (x < width) {
    const w = 7 + ((index * 13) % 11);
    const top = height * (0.7 + (((index * 7) % 5) / 60));
    context.fillRect(x, top, w, height - top);
    x += w;
    index += 1;
  }
  // Soot haze over the roofline.
  const haze = context.createLinearGradient(0, height * 0.62, 0, height);
  haze.addColorStop(0, 'rgba(205,205,200,0.55)');
  haze.addColorStop(1, 'rgba(150,145,138,0.1)');
  context.fillStyle = haze;
  context.fillRect(0, height * 0.62, width, height * 0.38);

  const texture = finish(canvas);
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  cache.set(key, texture);
  return texture;
}

// Lace under-curtain: a net ground with a repeating floral motif, punched
// out so the sky reads through it. Alpha-tested, not blended, so it costs
// nothing in sort order.
export function laceTexture() {
  const key = 'lace';
  if (cache.has(key)) return cache.get(key);
  const size = 256;
  const canvas = makeCanvas(size);
  const context = canvas.getContext('2d');
  context.clearRect(0, 0, size, size);

  // Net: fine diagonal mesh.
  context.strokeStyle = 'rgba(255,252,244,0.5)';
  context.lineWidth = 0.6;
  for (let i = -size; i < size * 2; i += 11) {
    context.beginPath();
    context.moveTo(i, 0);
    context.lineTo(i + size, size);
    context.stroke();
    context.beginPath();
    context.moveTo(i + size, 0);
    context.lineTo(i, size);
    context.stroke();
  }

  // Motifs: rosettes on a grid, denser toward the hem.
  context.fillStyle = 'rgba(255,253,247,0.8)';
  for (let gy = 0; gy < 3; gy += 1) {
    for (let gx = 0; gx < 3; gx += 1) {
      const cx = 42 + gx * 85;
      const cy = 42 + gy * 85;
      for (let petal = 0; petal < 6; petal += 1) {
        const angle = (petal / 6) * Math.PI * 2;
        context.beginPath();
        context.ellipse(cx + Math.cos(angle) * 6, cy + Math.sin(angle) * 6, 3.2, 1.9, angle, 0, Math.PI * 2);
        context.fill();
      }
      context.beginPath();
      context.arc(cx, cy, 2.4, 0, Math.PI * 2);
      context.fill();
    }
  }
  // Scalloped hem along the bottom edge.
  context.fillStyle = 'rgba(255,253,247,0.96)';
  context.fillRect(0, size - 14, size, 6);
  for (let x = 8; x < size; x += 16) {
    context.beginPath();
    context.arc(x, size - 8, 7, 0, Math.PI);
    context.fill();
  }

  const texture = finish(canvas);
  cache.set(key, texture);
  return texture;
}

// Damask over-curtain: a heavy ground with a tone-on-tone repeat. Colour
// comes from the material tint, so one texture serves every fabric.
export function damaskTexture() {
  const key = 'damask';
  if (cache.has(key)) return cache.get(key);
  const size = 256;
  const canvas = makeCanvas(size);
  const context = canvas.getContext('2d');
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, size, size);
  context.fillStyle = 'rgba(0,0,0,0.13)';
  for (let gy = 0; gy < 3; gy += 1) {
    for (let gx = 0; gx < 3; gx += 1) {
      const cx = 43 + gx * 85 + (gy % 2) * 42;
      const cy = 43 + gy * 85;
      // A stylised ogee: four lobes around a centre.
      for (let lobe = 0; lobe < 4; lobe += 1) {
        const angle = (lobe / 4) * Math.PI * 2 + Math.PI / 4;
        context.beginPath();
        context.ellipse(cx + Math.cos(angle) * 16, cy + Math.sin(angle) * 16, 13, 7, angle, 0, Math.PI * 2);
        context.fill();
      }
      context.beginPath();
      context.arc(cx, cy, 7, 0, Math.PI * 2);
      context.fill();
    }
  }
  // Vertical weave so the folds catch the light.
  context.fillStyle = 'rgba(0,0,0,0.05)';
  for (let x = 0; x < size; x += 4) context.fillRect(x, 0, 1, size);

  const texture = finish(canvas);
  cache.set(key, texture);
  return texture;
}
