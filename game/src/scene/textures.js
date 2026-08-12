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

// Small octagonal tiles with dark corner dots, a durable entrance-hall floor
// rather than parquet stretched across a public lobby. One repeat is roughly
// a metre square; the pattern is seamless at every edge.
export function lobbyMosaicTexture() {
  const key = 'lobby-mosaic';
  if (cache.has(key)) return cache.get(key);
  const size = 256;
  const cell = 32;
  const cut = 7;
  const canvas = makeCanvas(size);
  const context = canvas.getContext('2d');
  context.fillStyle = '#343a38';
  context.fillRect(0, 0, size, size);

  for (let row = 0; row < size / cell; row += 1) {
    for (let column = 0; column < size / cell; column += 1) {
      const x = column * cell;
      const y = row * cell;
      const even = (row + column) % 2 === 0;
      context.fillStyle = even ? '#b6aa90' : '#9fa08e';
      context.beginPath();
      context.moveTo(x + cut, y + 2);
      context.lineTo(x + cell - cut, y + 2);
      context.lineTo(x + cell - 2, y + cut);
      context.lineTo(x + cell - 2, y + cell - cut);
      context.lineTo(x + cell - cut, y + cell - 2);
      context.lineTo(x + cut, y + cell - 2);
      context.lineTo(x + 2, y + cell - cut);
      context.lineTo(x + 2, y + cut);
      context.closePath();
      context.fill();
      // Hand-laid tiles are not one digital colour. A faint wash breaks the
      // repetition without turning a scrubbed public floor into dirt.
      const haze = Math.abs(Math.sin((row * 11 + column * 17) * 2.37)) * 0.045;
      context.fillStyle = `rgba(86,62,43,${haze})`;
      context.fill();
    }
  }

  // The square voids where four cut corners meet take muted red inserts.
  context.fillStyle = '#814d3e';
  for (let y = 0; y < size; y += cell) {
    for (let x = 0; x < size; x += cell) {
      context.save();
      context.translate(x, y);
      context.rotate(Math.PI / 4);
      context.fillRect(-4, -4, 8, 8);
      context.restore();
    }
  }

  const texture = finish(canvas);
  texture.anisotropy = 8;
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

// Lace under-curtain: a net ground with a repeating floral motif, punched
// out so the sky reads through it. Alpha-tested, not blended, so it costs
// nothing in sort order.
export function laceTexture() {
  const key = 'lace';
  if (cache.has(key)) return cache.get(key);
  // One copy of this covers a whole sash, so the mesh has to be drawn much
  // finer than it looks on the canvas: at 11px on 256 the net came out with
  // a six-centimetre gauge and read as chicken wire.
  const size = 512;
  const canvas = makeCanvas(size);
  const context = canvas.getContext('2d');
  context.clearRect(0, 0, size, size);

  // Net: fine diagonal mesh.
  context.strokeStyle = 'rgba(255,252,244,0.5)';
  context.lineWidth = 0.6;
  for (let i = -size; i < size * 2; i += 7) {
    context.beginPath();
    context.moveTo(i, 0);
    context.lineTo(i + size, size);
    context.stroke();
    context.beginPath();
    context.moveTo(i + size, 0);
    context.lineTo(i, size);
    context.stroke();
  }

  // Motifs: rosettes on a grid. Six across a sash puts them about a hand's
  // width apart, which is what a machine-made Nottingham net looked like.
  context.fillStyle = 'rgba(255,253,247,0.8)';
  for (let gy = 0; gy < 7; gy += 1) {
    for (let gx = 0; gx < 6; gx += 1) {
      const cx = 42 + gx * 85;
      const cy = 42 + gy * 74;
      for (let petal = 0; petal < 6; petal += 1) {
        const angle = (petal / 6) * Math.PI * 2;
        context.beginPath();
        context.ellipse(cx + Math.cos(angle) * 7, cy + Math.sin(angle) * 7, 3.6, 2.1, angle, 0, Math.PI * 2);
        context.fill();
      }
      context.beginPath();
      context.arc(cx, cy, 2.6, 0, Math.PI * 2);
      context.fill();
    }
  }
  // Scalloped hem along the bottom edge.
  context.fillStyle = 'rgba(255,253,247,0.96)';
  context.fillRect(0, size - 22, size, 7);
  for (let x = 10; x < size; x += 20) {
    context.beginPath();
    context.arc(x, size - 13, 9, 0, Math.PI);
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

// Dirt on window glass. Transparent where the pane is clean, so the layer
// alpha-blends over the view instead of tinting the whole opening. A city
// window in 1896 sat in coal smoke and was washed twice a year, so the grime
// banks up against the sash and rain cuts runs down the middle of it.
export function glassGrimeTexture() {
  const key = 'glass-grime';
  if (cache.has(key)) return cache.get(key);
  const size = 256;
  const canvas = makeCanvas(size);
  const context = canvas.getContext('2d');
  context.clearRect(0, 0, size, size);

  // Soot banks against all four edges of the sash.
  for (const [x0, y0, x1, y1, near, far] of [
    [0, 0, 0, size, 0.4, 0.5],
    [0, 0, size, 0, 0.34, 0.34],
  ]) {
    const gradient = context.createLinearGradient(x0, y0, x1, y1);
    gradient.addColorStop(0, `rgba(46,40,32,${near})`);
    gradient.addColorStop(0.26, 'rgba(46,40,32,0)');
    gradient.addColorStop(0.74, 'rgba(46,40,32,0)');
    gradient.addColorStop(1, `rgba(46,40,32,${far})`);
    context.fillStyle = gradient;
    context.fillRect(0, 0, size, size);
  }

  // An even film over the whole pane, heavier low down.
  const film = context.createLinearGradient(0, 0, 0, size);
  film.addColorStop(0, 'rgba(60,54,44,0.08)');
  film.addColorStop(1, 'rgba(60,54,44,0.17)');
  context.fillStyle = film;
  context.fillRect(0, 0, size, size);

  // Rain runs cut the film away in vertical stripes.
  context.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 20; i += 1) {
    const x = (Math.abs(Math.sin(i * 91.7) * 43758.5453) % 1) * size;
    const run = context.createLinearGradient(0, 0, 0, size);
    run.addColorStop(0, 'rgba(0,0,0,0)');
    run.addColorStop(0.4, 'rgba(0,0,0,0.75)');
    run.addColorStop(1, 'rgba(0,0,0,0.15)');
    context.fillStyle = run;
    context.fillRect(x, 0, 2 + (i % 4) * 3, size);
  }

  // Arcs where a cloth last went over it, cleaner than the film around them.
  for (let i = 0; i < 7; i += 1) {
    context.strokeStyle = 'rgba(0,0,0,0.28)';
    context.lineWidth = 7 + (i % 3) * 8;
    context.beginPath();
    context.arc(size * 0.5, size * (0.22 + i * 0.11), size * 0.4, 0.25, Math.PI - 0.25);
    context.stroke();
  }
  context.globalCompositeOperation = 'source-over';

  const texture = finish(canvas);
  texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping;
  cache.set(key, texture);
  return texture;
}

// The stain a burner leaves on the ceiling above it: dark at the plume,
// transparent well before the edge of the quad.
export function sootTexture() {
  const key = 'soot';
  if (cache.has(key)) return cache.get(key);
  const size = 128;
  const canvas = makeCanvas(size);
  const context = canvas.getContext('2d');
  context.clearRect(0, 0, size, size);
  const plume = context.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  plume.addColorStop(0, 'rgba(34,28,22,0.8)');
  plume.addColorStop(0.3, 'rgba(48,40,32,0.45)');
  plume.addColorStop(0.65, 'rgba(70,60,48,0.14)');
  plume.addColorStop(1, 'rgba(70,60,48,0)');
  context.fillStyle = plume;
  context.fillRect(0, 0, size, size);
  const texture = finish(canvas);
  texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping;
  cache.set(key, texture);
  return texture;
}

// What hangs in a frame. Nothing here is legible at the size these render —
// a diploma reads as ruled script under a seal, an engraving as a tonal
// scene — and that is the point: a photograph would date the room to the
// wrong century, and lettering you can read would have to be written.
export function printTexture(kind, seed = 0) {
  const key = `print:${kind}:${seed}`;
  if (cache.has(key)) return cache.get(key);
  const width = 256;
  const height = 256;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  const rand = (n) => Math.abs(Math.sin((seed + n) * 127.1) * 43758.5453) % 1;

  if (kind === 'directory') {
    context.fillStyle = '#2a2a25';
    context.fillRect(0, 0, width, height);
    context.strokeStyle = '#a98a4d';
    context.lineWidth = 4;
    context.strokeRect(10, 10, width - 20, height - 20);
    context.lineWidth = 1;
    context.strokeRect(17, 17, width - 34, height - 34);
    context.fillStyle = '#d6c99d';
    context.textAlign = 'center';
    context.font = '700 22px Georgia, serif';
    context.fillText('DIRECTORY', width / 2, 48);
    context.fillStyle = '#a98a4d';
    context.fillRect(34, 60, width - 68, 2);
    context.textAlign = 'left';
    context.font = '600 10px Georgia, serif';
    for (let row = 0; row < 12; row += 1) {
      const y = 82 + row * 13;
      context.fillStyle = row % 3 === 0 ? '#d8c99a' : '#c0b58e';
      context.fillText(`${String(row + 2).padStart(2, '0')}  ·`, 36, y);
      context.fillRect(72, y - 7, 112 - (row % 4) * 11, 2);
      context.fillStyle = '#8f7b4b';
      context.fillText(`${200 + row * 3}`, 194, y);
    }
    const texture = finish(canvas);
    texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping;
    cache.set(key, texture);
    return texture;
  }

  if (kind === 'newspaper') {
    context.fillStyle = '#ded7c4';
    context.fillRect(0, 0, width, height);
    // Masthead: a heavy blackletter band under a rule, then the date line.
    context.fillStyle = 'rgba(28,24,18,0.86)';
    context.fillRect(26, 16, width - 52, 17);
    context.fillStyle = 'rgba(40,34,26,0.6)';
    context.fillRect(20, 40, width - 40, 1.5);
    context.fillRect(70, 46, width - 140, 3);
    // Four columns of type, with a rule between each and a cut at the top of
    // one of them where a woodcut sits.
    const cols = 4;
    const gutter = 6;
    const colW = (width - 40 - gutter * (cols - 1)) / cols;
    for (let c = 0; c < cols; c += 1) {
      const x = 20 + c * (colW + gutter);
      if (c > 0) {
        context.fillStyle = 'rgba(40,34,26,0.28)';
        context.fillRect(x - gutter / 2, 56, 1, height - 70);
      }
      let y = 58;
      if (c === 2) {
        context.fillStyle = 'rgba(48,42,32,0.5)';
        context.fillRect(x, y, colW, 34);
        y += 40;
      }
      context.fillStyle = 'rgba(45,38,28,0.55)';
      context.fillRect(x, y, colW * 0.8, 4);
      y += 10;
      while (y < height - 16) {
        context.fillStyle = `rgba(52,45,34,${0.3 + rand(c * 20 + y) * 0.12})`;
        context.fillRect(x, y, colW * (0.82 + rand(y + c) * 0.18), 2);
        y += 5;
      }
    }
    const texture = finish(canvas);
    texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping;
    cache.set(key, texture);
    return texture;
  }

  if (kind === 'diploma') {
    context.fillStyle = '#e8dfc4';
    context.fillRect(0, 0, width, height);
    // Foxing: the brown spotting old paper takes.
    for (let i = 0; i < 40; i += 1) {
      context.fillStyle = `rgba(150,120,70,${0.03 + rand(i) * 0.05})`;
      context.beginPath();
      context.arc(rand(i * 3) * width, rand(i * 5) * height, 2 + rand(i * 7) * 5, 0, Math.PI * 2);
      context.fill();
    }
    // Ruled border, an engraved heading, body lines, and two signatures.
    context.strokeStyle = 'rgba(60,45,28,0.5)';
    context.lineWidth = 2;
    context.strokeRect(16, 16, width - 32, height - 32);
    context.fillStyle = 'rgba(50,38,24,0.8)';
    context.fillRect(60, 44, width - 120, 9);
    context.fillStyle = 'rgba(60,48,32,0.55)';
    for (let line = 0; line < 8; line += 1) {
      const inset = 44 + rand(line) * 26;
      context.fillRect(inset, 76 + line * 13, width - inset * 2, 3);
    }
    for (const x of [70, 160]) {
      context.fillStyle = 'rgba(40,32,20,0.7)';
      context.fillRect(x, 210, 52, 3);
      context.fillStyle = 'rgba(60,48,32,0.5)';
      context.fillRect(x, 198, 40 + rand(x) * 14, 2);
    }
    // Wafer seal, bottom left.
    context.fillStyle = 'rgba(140,40,34,0.85)';
    context.beginPath();
    context.arc(46, 208, 15, 0, Math.PI * 2);
    context.fill();
  } else {
    // A sepia engraving: a pale sky, a soft horizon, a mass of dark below.
    context.fillStyle = '#c6b696';
    context.fillRect(0, 0, width, height);
    context.fillStyle = 'rgba(70,58,40,0.35)';
    context.beginPath();
    context.moveTo(0, height * 0.72);
    for (let x = 0; x <= width; x += 16) {
      context.lineTo(x, height * (0.66 + rand(x) * 0.1));
    }
    context.lineTo(width, height);
    context.lineTo(0, height);
    context.fill();
    context.fillStyle = 'rgba(48,40,28,0.5)';
    context.beginPath();
    context.ellipse(width * (0.2 + rand(1) * 0.6), height * 0.68, 46, 34, 0, 0, Math.PI * 2);
    context.fill();
    // Engraver's hatching over the whole plate.
    context.strokeStyle = 'rgba(60,50,36,0.12)';
    context.lineWidth = 0.7;
    for (let y = 0; y < height; y += 3) {
      context.beginPath();
      context.moveTo(0, y);
      context.lineTo(width, y + 2);
      context.stroke();
    }
  }

  const texture = finish(canvas);
  texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping;
  cache.set(key, texture);
  return texture;
}

// Holland shade cloth: a sized linen, plain and close-woven. Colour comes
// from the material tint, so one texture serves cream, buff and drab.
export function hollandTexture() {
  const key = 'holland';
  if (cache.has(key)) return cache.get(key);
  const size = 128;
  const canvas = makeCanvas(size);
  const context = canvas.getContext('2d');
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, size, size);
  // Warp and weft, both faint: shade cloth is smooth, not sacking.
  context.fillStyle = 'rgba(0,0,0,0.05)';
  for (let x = 0; x < size; x += 3) context.fillRect(x, 0, 1, size);
  context.fillStyle = 'rgba(0,0,0,0.035)';
  for (let y = 0; y < size; y += 3) context.fillRect(0, y, size, 1);
  // Slubs, so a flat panel is not perfectly even under a raking sun.
  context.fillStyle = 'rgba(0,0,0,0.05)';
  for (let i = 0; i < 40; i += 1) {
    const x = (Math.abs(Math.sin(i * 12.9898) * 43758.5453) % 1) * size;
    const y = (Math.abs(Math.sin(i * 78.233) * 43758.5453) % 1) * size;
    context.fillRect(x, y, 4 + (i % 3) * 3, 1);
  }

  const texture = finish(canvas);
  cache.set(key, texture);
  return texture;
}
