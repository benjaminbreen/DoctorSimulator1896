import * as THREE from 'three';
import { CLOTH_COLORS, SKIN_TONES, seededRandom } from './params.js';

// Cloth and skin materials. Patterns are small repeating canvas textures so
// class reads at crowd distance: stripes and checks for tailoring, tweed
// noise for work clothes. Wear desaturates and lightens seams.

const textureCache = new Map();

function makeCanvas(size) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  return canvas;
}

function shade(hex, lightness) {
  const c = new THREE.Color(hex);
  const hsl = {};
  c.getHSL(hsl);
  c.setHSL(hsl.h, hsl.s, Math.min(1, Math.max(0, hsl.l + lightness)));
  return `#${c.getHexString()}`;
}

export function fabricTexture(pattern, colorName, wear = 0) {
  const key = `${pattern}:${colorName}:${Math.round(wear * 8)}`;
  if (textureCache.has(key)) return textureCache.get(key);
  const base = CLOTH_COLORS[colorName] || '#555';
  const size = 128;
  const canvas = makeCanvas(size);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, size, size);

  // one canvas tile = 0.3 m of cloth (lofts use metric UVs)
  if (pattern === 'stripe') {
    ctx.fillStyle = shade(base, 0.055);
    for (let x = 0; x < size; x += 10) ctx.fillRect(x, 0, 1.5, size);
  } else if (pattern === 'check') {
    ctx.strokeStyle = shade(base, 0.06);
    ctx.lineWidth = 1;
    for (let x = 4; x < size; x += 16) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, size); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, x); ctx.lineTo(size, x); ctx.stroke();
    }
  } else if (pattern === 'tweed') {
    const rand = seededRandom(7);
    for (let i = 0; i < 2600; i += 1) {
      ctx.fillStyle = shade(base, (rand() - 0.5) * 0.14);
      ctx.fillRect(Math.floor(rand() * size), Math.floor(rand() * size), 2, 1);
    }
  }
  if (wear > 0.05) {
    const rand = seededRandom(13);
    ctx.globalAlpha = wear * 0.12;
    for (let i = 0; i < 90; i += 1) {
      ctx.fillStyle = shade(base, 0.05 + rand() * 0.06);
      const r = 2 + rand() * 5;
      ctx.beginPath();
      ctx.arc(rand() * size, rand() * size, r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  textureCache.set(key, texture);
  return texture;
}

export function clothMaterial({ colorName, pattern = 'plain', wear = 0, sheen = 0.25 }) {
  const material = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(CLOTH_COLORS[colorName] || colorName || '#555'),
    roughness: 0.92,
    sheen,
    sheenRoughness: 0.7,
    sheenColor: new THREE.Color(0xffffff).multiplyScalar(0.35),
    // garments are open lofts; single-sided cloth reads as holes from above
    side: THREE.DoubleSide,
  });
  if (pattern !== 'plain' || wear > 0.4) {
    material.map = fabricTexture(pattern, colorName, wear);
    material.color.set('#ffffff');
  }
  if (wear > 0) {
    const hsl = {};
    material.color.getHSL(hsl);
    material.color.setHSL(hsl.h, hsl.s * (1 - wear * 0.35), hsl.l * (1 + wear * 0.1));
  }
  return material;
}

export function skinMaterial(toneName) {
  return new THREE.MeshStandardMaterial({
    color: new THREE.Color(SKIN_TONES[toneName] || toneName),
    roughness: 0.62,
    vertexColors: true,
  });
}

export function flatMaterial(color, roughness = 0.85, extra = {}) {
  return new THREE.MeshStandardMaterial({ color: new THREE.Color(color), roughness, side: THREE.DoubleSide, ...extra });
}
