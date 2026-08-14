// Canvas-generated surface textures. Subtle by design: they add depth to
// flat placeholder rooms without reading as tiled game textures.

import * as THREE from 'three';

const cache = new Map();
// Interior marble is viewed at room scale and does not need the old 130 px/m,
// 2K-per-surface ceiling. The authored lobby props alone produced 88 unique
// color/roughness pairs; this budget cuts their estimated mipmapped GPU cost
// from about 40 MiB to 19 MiB while preserving the no-repeat slab treatment.
const MARBLE_PIXELS_PER_METRE = 80;
const MARBLE_MAX_DIMENSION = 1024;

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

// Deterministic rng for the marble fields, so a wall looks the same on
// every visit.
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function dataTexture(canvas) {
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.NoColorSpace;
  return texture;
}

// One wandering vein: a momentum walk across the slab, drawn segment by
// segment onto both the colour and roughness canvases.
function drawVein(rng, contexts, ppm, w, h, major) {
  const [color, rough] = contexts;
  let x = rng() * w;
  let y = rng() * h;
  // Veins run mostly diagonal, the way the reference slabs read.
  let angle = (rng() < 0.5 ? 1 : -1) * (0.5 + rng() * 0.7) + (rng() < 0.5 ? 0 : Math.PI);
  const steps = Math.floor((1.2 + rng() * 3.2) * ppm / 8);
  const width = major ? (0.9 + rng() * 1.6) * (ppm / 110) : (0.4 + rng() * 0.6) * (ppm / 110);
  const alpha = major ? 0.14 + rng() * 0.2 : 0.05 + rng() * 0.09;
  const tone = 120 + Math.floor(rng() * 40);
  for (let i = 0; i < steps; i += 1) {
    const step = ppm * (0.05 + rng() * 0.07);
    const nx = x + Math.cos(angle) * step;
    const ny = y + Math.sin(angle) * step;
    const taper = 0.5 + 0.5 * Math.sin((i / steps) * Math.PI);
    color.strokeStyle = `rgba(${tone - 20},${tone - 18},${tone - 28},${alpha * taper})`;
    color.lineWidth = Math.max(0.6, width * taper);
    color.beginPath();
    color.moveTo(x, y);
    color.lineTo(nx, ny);
    color.stroke();
    // Veins are slightly duller than the polished field.
    rough.strokeStyle = `rgba(255,255,255,${alpha * taper * 0.5})`;
    rough.lineWidth = Math.max(0.8, width * taper * 1.6);
    rough.beginPath();
    rough.moveTo(x, y);
    rough.lineTo(nx, ny);
    rough.stroke();
    x = nx;
    y = ny;
    angle += (rng() - 0.5) * 0.55;
    if (x < -w * 0.1 || x > w * 1.1 || y < -h * 0.1 || y > h * 1.1) break;
  }
}

// A marble field drawn at the surface's real size, so nothing tiles. Returns
// a colour map and a matching roughness map (veins duller, field polished).
// Cached and shared: callers must not dispose these.
export function marbleSurface(widthM, heightM, options = {}) {
  const { seed = 1, base = '#e6dfd2', slabGrid = 0, roughnessBase = 0.42 } = options;
  const key = `marble:${widthM.toFixed(2)}:${heightM.toFixed(2)}:${seed}:${base}:${slabGrid}:${roughnessBase}`;
  if (cache.has(key)) return cache.get(key);

  const ppm = Math.min(
    MARBLE_PIXELS_PER_METRE,
    MARBLE_MAX_DIMENSION / Math.max(widthM, heightM),
  );
  const w = Math.max(64, Math.round(widthM * ppm));
  const h = Math.max(64, Math.round(heightM * ppm));
  const colorCanvas = document.createElement('canvas');
  colorCanvas.width = w;
  colorCanvas.height = h;
  const roughCanvas = document.createElement('canvas');
  roughCanvas.width = w;
  roughCanvas.height = h;
  const color = colorCanvas.getContext('2d');
  const rough = roughCanvas.getContext('2d');
  const rng = mulberry32(seed * 2654435761 + w * 31 + h);

  const baseColor = new THREE.Color(base);
  color.fillStyle = `#${baseColor.getHexString()}`;
  color.fillRect(0, 0, w, h);
  const roughValue = Math.floor(roughnessBase * 255);
  rough.fillStyle = `rgb(${roughValue},${roughValue},${roughValue})`;
  rough.fillRect(0, 0, w, h);

  // Soft mineral clouds under the veining.
  const clouds = Math.max(6, Math.floor(widthM * heightM * 0.55));
  for (let i = 0; i < clouds; i += 1) {
    const cx = rng() * w;
    const cy = rng() * h;
    const radius = (0.3 + rng() * 0.9) * ppm;
    const gradient = color.createRadialGradient(cx, cy, 0, cx, cy, radius);
    const dark = rng() < 0.5;
    gradient.addColorStop(0, dark ? 'rgba(148,146,132,0.10)' : 'rgba(244,240,230,0.10)');
    gradient.addColorStop(1, 'rgba(0,0,0,0)');
    color.fillStyle = gradient;
    color.fillRect(cx - radius, cy - radius, radius * 2, radius * 2);
  }

  const majors = Math.max(5, Math.floor(widthM * heightM * 0.3));
  for (let i = 0; i < majors; i += 1) drawVein(rng, [color, rough], ppm, w, h, true);
  for (let i = 0; i < majors * 2.5; i += 1) drawVein(rng, [color, rough], ppm, w, h, false);

  // Slab joints for floors: a grid of fine dark seams, each slab with its
  // own faint tone shift.
  if (slabGrid > 0) {
    const step = slabGrid * ppm;
    for (let x = step; x < w; x += step) {
      color.fillStyle = 'rgba(60,56,48,0.30)';
      color.fillRect(x - 1, 0, 2, h);
      rough.fillStyle = 'rgba(255,255,255,0.35)';
      rough.fillRect(x - 1.5, 0, 3, h);
    }
    for (let y = step; y < h; y += step) {
      color.fillStyle = 'rgba(60,56,48,0.30)';
      color.fillRect(0, y - 1, w, 2);
      rough.fillStyle = 'rgba(255,255,255,0.35)';
      rough.fillRect(0, y - 1.5, w, 3);
    }
    for (let x = 0; x < w; x += step) {
      for (let y = 0; y < h; y += step) {
        color.fillStyle = `rgba(120,116,104,${rng() * 0.06})`;
        color.fillRect(x, y, step, step);
      }
    }
  }

  const map = finish(colorCanvas);
  map.anisotropy = 8;
  const roughnessMap = dataTexture(roughCanvas);
  roughnessMap.anisotropy = 8;
  const set = { map, roughnessMap, shared: true };
  cache.set(key, set);
  return set;
}

// A leaded stained-glass light: small blue quarries in a lead grid, a gilt
// double border, and a pale heraldic medallion. Drawn once per seed and used
// as both colour and emissive map, so the window glows rather than showing
// sky.
export function stainedGlassTexture(seed = 1) {
  const key = `stained-glass:${seed}`;
  if (cache.has(key)) return cache.get(key);
  const w = 288;
  const h = 512;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const context = canvas.getContext('2d');
  const rng = mulberry32(seed * 747796405 + 11);

  // Quarry field.
  const cols = 5;
  const rows = 9;
  const cw = w / cols;
  const ch = h / rows;
  const blues = ['#2c4a86', '#33538f', '#3d5f9e', '#294478', '#4a6aa6'];
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < cols; column += 1) {
      const accent = rng() < 0.06;
      context.fillStyle = accent ? '#8f86b8' : blues[Math.floor(rng() * blues.length)];
      context.fillRect(column * cw, row * ch, cw, ch);
      // A wash within each quarry: hand-blown glass is not one colour.
      const gradient = context.createLinearGradient(column * cw, row * ch, column * cw + cw, row * ch + ch);
      gradient.addColorStop(0, 'rgba(255,255,255,0.10)');
      gradient.addColorStop(1, 'rgba(10,14,30,0.16)');
      context.fillStyle = gradient;
      context.fillRect(column * cw, row * ch, cw, ch);
    }
  }
  // Lead cames.
  context.strokeStyle = '#20232a';
  context.lineWidth = 3;
  for (let column = 0; column <= cols; column += 1) {
    context.beginPath();
    context.moveTo(column * cw, 0);
    context.lineTo(column * cw, h);
    context.stroke();
  }
  for (let row = 0; row <= rows; row += 1) {
    context.beginPath();
    context.moveTo(0, row * ch);
    context.lineTo(w, row * ch);
    context.stroke();
  }

  // Central medallion.
  const cx = w / 2;
  const cy = h * 0.44;
  const radius = w * 0.27;
  context.fillStyle = '#e9dfc2';
  context.beginPath();
  context.arc(cx, cy, radius, 0, Math.PI * 2);
  context.fill();
  context.lineWidth = 7;
  context.strokeStyle = '#b08c3c';
  context.stroke();
  context.lineWidth = 3;
  context.strokeStyle = '#8a6b2e';
  context.beginPath();
  context.arc(cx, cy, radius * 0.72, 0, Math.PI * 2);
  context.stroke();
  // Scrollwork suggestion: petal arcs and a red boss.
  context.strokeStyle = '#a5843a';
  context.lineWidth = 4;
  for (let petal = 0; petal < 8; petal += 1) {
    const angle = (petal / 8) * Math.PI * 2;
    context.beginPath();
    context.arc(cx + Math.cos(angle) * radius * 0.45, cy + Math.sin(angle) * radius * 0.45, radius * 0.2, 0, Math.PI * 2);
    context.stroke();
  }
  context.fillStyle = '#7a2020';
  context.beginPath();
  context.arc(cx, cy, radius * 0.16, 0, Math.PI * 2);
  context.fill();

  // Gilt double border with red corner squares.
  context.strokeStyle = '#8a6b2e';
  context.lineWidth = 12;
  context.strokeRect(6, 6, w - 12, h - 12);
  context.strokeStyle = '#c9a44e';
  context.lineWidth = 3;
  context.strokeRect(16, 16, w - 32, h - 32);
  context.fillStyle = '#7a2020';
  for (const [x, y] of [[6, 6], [w - 26, 6], [6, h - 26], [w - 26, h - 26]]) {
    context.fillRect(x, y, 20, 20);
  }

  const texture = finish(canvas);
  texture.anisotropy = 8;
  cache.set(key, texture);
  return texture;
}

// New Netherland lobby floor: green encaustic tile with a quatrefoil motif,
// after the hotel's palm-court postcard. One repeat is about a metre;
// seamless at every edge.
export function netherlandMosaicTexture() {
  const key = 'netherland-mosaic';
  if (cache.has(key)) return cache.get(key);
  const size = 256;
  const cell = 32;
  const canvas = makeCanvas(size);
  const context = canvas.getContext('2d');
  context.fillStyle = '#cfc8ab';
  context.fillRect(0, 0, size, size);
  for (let row = 0; row < size / cell; row += 1) {
    for (let column = 0; column < size / cell; column += 1) {
      const x = column * cell;
      const y = row * cell;
      const even = (row + column) % 2 === 0;
      // Alternating green diamonds on cream, a dark dot at each crossing.
      context.fillStyle = even ? '#4a7159' : '#5d8266';
      context.beginPath();
      context.moveTo(x + cell / 2, y + 3);
      context.lineTo(x + cell - 3, y + cell / 2);
      context.lineTo(x + cell / 2, y + cell - 3);
      context.lineTo(x + 3, y + cell / 2);
      context.closePath();
      context.fill();
      const haze = Math.abs(Math.sin((row * 13 + column * 7) * 1.93)) * 0.06;
      context.fillStyle = `rgba(30,50,38,${haze})`;
      context.fill();
      context.fillStyle = '#2e4436';
      context.beginPath();
      context.arc(x, y, 3.2, 0, Math.PI * 2);
      context.fill();
      context.beginPath();
      context.arc(x + cell / 2, y + cell / 2, 2.2, 0, Math.PI * 2);
      context.fill();
    }
  }
  // Grout grid.
  context.strokeStyle = 'rgba(60,58,48,0.5)';
  context.lineWidth = 1;
  for (let line = 0; line <= size; line += cell) {
    context.beginPath();
    context.moveTo(line, 0);
    context.lineTo(line, size);
    context.stroke();
    context.beginPath();
    context.moveTo(0, line);
    context.lineTo(size, line);
    context.stroke();
  }
  const texture = finish(canvas);
  texture.anisotropy = 8;
  cache.set(key, texture);
  return texture;
}

// Dutch blue tiles for the dado bands: white glaze, blue borders, and a
// small blue motif per tile — windmill, tulip, or ship. Seamless.
export function delftTileTexture() {
  const key = 'delft-tiles';
  if (cache.has(key)) return cache.get(key);
  const size = 256;
  const cell = 42.67;
  const canvas = makeCanvas(size);
  const context = canvas.getContext('2d');
  const blue = '#2b4f8e';
  context.fillStyle = '#eee9dc';
  context.fillRect(0, 0, size, size);
  const rng = mulberry32(97);
  for (let row = 0; row < 6; row += 1) {
    for (let column = 0; column < 6; column += 1) {
      const x = column * cell;
      const y = row * cell;
      context.strokeStyle = blue;
      context.lineWidth = 1.4;
      context.strokeRect(x + 2, y + 2, cell - 4, cell - 4);
      // Corner motifs.
      context.fillStyle = blue;
      for (const [dx, dy] of [[6, 6], [cell - 6, 6], [6, cell - 6], [cell - 6, cell - 6]]) {
        context.beginPath();
        context.arc(x + dx, y + dy, 1.8, 0, Math.PI * 2);
        context.fill();
      }
      const cx = x + cell / 2;
      const cy = y + cell / 2;
      const kind = Math.floor(rng() * 3);
      context.strokeStyle = blue;
      context.lineWidth = 1.8;
      if (kind === 0) {
        // Windmill: a post and four angled blades.
        context.beginPath();
        context.moveTo(cx, cy + 9);
        context.lineTo(cx, cy - 2);
        context.stroke();
        for (const angle of [0.5, 2.1, 3.6, 5.2]) {
          context.beginPath();
          context.moveTo(cx, cy - 2);
          context.lineTo(cx + Math.cos(angle) * 8, cy - 2 + Math.sin(angle) * 8);
          context.stroke();
        }
      } else if (kind === 1) {
        // Tulip: a stem and two petal arcs.
        context.beginPath();
        context.moveTo(cx, cy + 9);
        context.quadraticCurveTo(cx + 2, cy + 2, cx, cy - 1);
        context.stroke();
        context.beginPath();
        context.arc(cx - 3, cy - 4, 4, Math.PI * 0.4, Math.PI * 1.6);
        context.stroke();
        context.beginPath();
        context.arc(cx + 3, cy - 4, 4, Math.PI * 1.4, Math.PI * 0.6);
        context.stroke();
      } else {
        // Ship: a hull arc and a triangular sail.
        context.beginPath();
        context.arc(cx, cy + 1, 7, Math.PI * 0.15, Math.PI * 0.85);
        context.stroke();
        context.beginPath();
        context.moveTo(cx, cy + 2);
        context.lineTo(cx, cy - 8);
        context.lineTo(cx + 6, cy - 1);
        context.closePath();
        context.stroke();
      }
    }
  }
  const texture = finish(canvas);
  texture.anisotropy = 8;
  cache.set(key, texture);
  return texture;
}

// The lobby's great oil painting, suggested rather than reproduced: a warm
// varnished harbour scene — sky, water, a tall ship, figures on the shore —
// that reads as an immense history painting from across the room.
export function harborMuralTexture() {
  const key = 'harbor-mural';
  if (cache.has(key)) return cache.get(key);
  const w = 1024;
  const h = 512;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const context = canvas.getContext('2d');
  const rng = mulberry32(1626);

  // Sky.
  const sky = context.createLinearGradient(0, 0, 0, h * 0.62);
  sky.addColorStop(0, '#c7b98f');
  sky.addColorStop(0.6, '#ddc9a0');
  sky.addColorStop(1, '#e8d3a6');
  context.fillStyle = sky;
  context.fillRect(0, 0, w, h * 0.62);
  // Clouds: soft warm blobs.
  for (let i = 0; i < 22; i += 1) {
    const cx = rng() * w;
    const cy = rng() * h * 0.4 + 20;
    const radius = 30 + rng() * 70;
    const cloud = context.createRadialGradient(cx, cy, 0, cx, cy, radius);
    cloud.addColorStop(0, 'rgba(240,228,198,0.5)');
    cloud.addColorStop(1, 'rgba(240,228,198,0)');
    context.fillStyle = cloud;
    context.fillRect(cx - radius, cy - radius, radius * 2, radius * 2);
  }
  // Water.
  const water = context.createLinearGradient(0, h * 0.55, 0, h * 0.8);
  water.addColorStop(0, '#8b9678');
  water.addColorStop(1, '#5f6d55');
  context.fillStyle = water;
  context.fillRect(0, h * 0.55, w, h * 0.25);
  for (let i = 0; i < 60; i += 1) {
    context.fillStyle = `rgba(230,215,175,${0.05 + rng() * 0.1})`;
    context.fillRect(rng() * w, h * (0.56 + rng() * 0.22), 20 + rng() * 60, 2);
  }
  // Tall ship at anchor, silhouetted.
  const shipX = w * 0.68;
  const shipY = h * 0.62;
  context.fillStyle = '#3a3226';
  context.beginPath();
  context.moveTo(shipX - 60, shipY);
  context.quadraticCurveTo(shipX, shipY + 26, shipX + 62, shipY - 4);
  context.lineTo(shipX + 54, shipY - 16);
  context.lineTo(shipX - 52, shipY - 12);
  context.closePath();
  context.fill();
  context.strokeStyle = '#3a3226';
  context.lineWidth = 3;
  for (const [dx, mastH] of [[-28, 95], [4, 120], [36, 85]]) {
    context.beginPath();
    context.moveTo(shipX + dx, shipY - 10);
    context.lineTo(shipX + dx, shipY - mastH);
    context.stroke();
    // Furled sails: short cross-yards.
    for (let yard = 1; yard <= 3; yard += 1) {
      const yardY = shipY - mastH + yard * (mastH / 4.2);
      context.beginPath();
      context.moveTo(shipX + dx - 14, yardY);
      context.lineTo(shipX + dx + 14, yardY);
      context.stroke();
    }
  }
  // Foreground shore.
  context.fillStyle = '#4c452f';
  context.beginPath();
  context.moveTo(0, h * 0.78);
  context.quadraticCurveTo(w * 0.35, h * 0.72, w, h * 0.82);
  context.lineTo(w, h);
  context.lineTo(0, h);
  context.closePath();
  context.fill();
  // Two clusters of figures, silhouetted.
  for (const [groupX, count] of [[w * 0.24, 7], [w * 0.44, 6]]) {
    for (let i = 0; i < count; i += 1) {
      const figureX = groupX + i * 14 + rng() * 6;
      const figureY = h * 0.76 + rng() * 14;
      context.fillStyle = i % 2 ? '#2e2a1e' : '#3d3020';
      context.fillRect(figureX, figureY - 22, 6, 22);
      context.beginPath();
      context.arc(figureX + 3, figureY - 25, 3.5, 0, Math.PI * 2);
      context.fill();
    }
  }
  // Varnish vignette.
  const vignette = context.createRadialGradient(w / 2, h / 2, h * 0.3, w / 2, h / 2, w * 0.62);
  vignette.addColorStop(0, 'rgba(80,50,20,0)');
  vignette.addColorStop(1, 'rgba(60,38,14,0.4)');
  context.fillStyle = vignette;
  context.fillRect(0, 0, w, h);

  const texture = finish(canvas);
  texture.anisotropy = 8;
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
