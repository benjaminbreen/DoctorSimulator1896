// Painted surfaces for the carousel, drawn once onto canvases: striped
// canopy, rounding-board frieze, panelled centre drum, radial plank
// platform, and the cut-out scallop valance. Flat 1890s showman's paint —
// vermilion, cream, Prussian blue, gold — with a light grain so the colors
// read as paint on wood, not plastic.

import * as THREE from 'three';

const VERMILION = '#b93a24';
const CREAM = '#f1e8d0';
const BLUE = '#2b4073';
const GREEN = '#2c5e42';
const GOLD = '#c9a24b';
const GOLD_DEEP = '#9d7a2f';

function canvasTexture(width, height, draw, { grain = true } = {}) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  draw(ctx, width, height);
  if (grain) {
    ctx.globalAlpha = 0.05;
    for (let i = 0; i < width * height * 0.002; i += 1) {
      const x = (Math.sin(i * 127.1) * 0.5 + 0.5) * width;
      const y = (Math.sin(i * 311.7) * 0.5 + 0.5) * height;
      ctx.fillStyle = i % 2 ? '#2a2018' : '#fffbe8';
      ctx.fillRect(x, y, 2, 2);
    }
    ctx.globalAlpha = 1;
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.anisotropy = 4;
  return texture;
}

// Canopy: alternating vermilion and cream sectors with gold pinstripes on
// the seams, shaded slightly toward the eave (canvas top) so the cone
// reads round even in flat light.
export function canopyTexture(sectors = 12) {
  return canvasTexture(1024, 512, (ctx, w, h) => {
    const stripe = w / sectors;
    for (let i = 0; i < sectors; i += 1) {
      ctx.fillStyle = i % 2 ? CREAM : VERMILION;
      ctx.fillRect(Math.floor(i * stripe), 0, Math.ceil(stripe) + 1, h);
    }
    ctx.fillStyle = GOLD;
    for (let i = 0; i <= sectors; i += 1) {
      ctx.fillRect(Math.floor(i * stripe) - 2, 0, 4, h);
    }
    const shade = ctx.createLinearGradient(0, 0, 0, h);
    shade.addColorStop(0, 'rgba(40,25,10,0.16)');
    shade.addColorStop(0.45, 'rgba(40,25,10,0)');
    ctx.fillStyle = shade;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = GOLD;
    ctx.fillRect(0, 0, w, h * 0.045);
  });
}

// Rounding board: gold ground with beading, oval landscape cameos
// alternating with Prussian-blue rosettes, cream cornice line.
export function friezeTexture() {
  return canvasTexture(1024, 128, (ctx, w, h) => {
    ctx.fillStyle = GOLD;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = CREAM;
    ctx.fillRect(0, 0, w, h * 0.12);
    ctx.fillStyle = GOLD_DEEP;
    for (let x = 6; x < w; x += 16) {
      ctx.beginPath();
      ctx.arc(x, h * 0.19, 3.2, 0, Math.PI * 2);
      ctx.fill();
    }
    const cells = 8;
    for (let i = 0; i < cells; i += 1) {
      const cx = (i + 0.5) * (w / cells);
      const cy = h * 0.52;
      if (i % 2) {
        // Oval cameo: sky over green, a painted landscape at a squint.
        ctx.fillStyle = GOLD_DEEP;
        ctx.beginPath();
        ctx.ellipse(cx, cy, 34, 26, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#9db8c9';
        ctx.beginPath();
        ctx.ellipse(cx, cy, 28, 20, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = GREEN;
        ctx.beginPath();
        ctx.ellipse(cx, cy + 9, 27, 10, 0, 0, Math.PI);
        ctx.fill();
      } else {
        ctx.fillStyle = BLUE;
        ctx.beginPath();
        ctx.arc(cx, cy, 15, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = CREAM;
        ctx.beginPath();
        ctx.arc(cx, cy, 5.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.fillStyle = VERMILION;
    const scallops = 12;
    for (let i = 0; i < scallops; i += 1) {
      ctx.beginPath();
      ctx.arc((i + 0.5) * (w / scallops), h, w / scallops / 2, Math.PI, 0);
      ctx.fill();
    }
  });
}

// Centre drum: cream panels in blue frames, red and green diamonds
// alternating with gold-framed "mirror" ovals.
export function drumTexture(panels = 8) {
  return canvasTexture(1024, 256, (ctx, w, h) => {
    ctx.fillStyle = CREAM;
    ctx.fillRect(0, 0, w, h);
    const panelW = w / panels;
    for (let i = 0; i < panels; i += 1) {
      const x = i * panelW;
      ctx.strokeStyle = BLUE;
      ctx.lineWidth = 10;
      ctx.strokeRect(x + panelW * 0.12, h * 0.14, panelW * 0.76, h * 0.72);
      ctx.strokeStyle = GOLD;
      ctx.lineWidth = 3;
      ctx.strokeRect(x + panelW * 0.17, h * 0.21, panelW * 0.66, h * 0.58);
      if (i % 2) {
        // Gold frame only: a real chrome oval (Carousel.jsx) sits in it and
        // reflects the park as the drum turns.
        ctx.strokeStyle = GOLD;
        ctx.lineWidth = 9;
        ctx.beginPath();
        ctx.ellipse(x + panelW * 0.5, h * 0.5, panelW * 0.16, h * 0.27, 0, 0, Math.PI * 2);
        ctx.stroke();
      } else {
        ctx.fillStyle = i % 4 === 0 ? VERMILION : GREEN;
        ctx.beginPath();
        ctx.moveTo(x + panelW * 0.5, h * 0.26);
        ctx.lineTo(x + panelW * 0.66, h * 0.5);
        ctx.lineTo(x + panelW * 0.5, h * 0.74);
        ctx.lineTo(x + panelW * 0.34, h * 0.5);
        ctx.closePath();
        ctx.fill();
      }
    }
    ctx.fillStyle = GOLD;
    ctx.fillRect(0, 0, w, h * 0.06);
    ctx.fillRect(0, h * 0.94, w, h * 0.06);
  });
}

// Platform: radial deck boards under ring seams, a red rim ring, and a
// painted center rosette. Mapped onto the cylinder cap's polar UVs.
export function platformTexture() {
  return canvasTexture(1024, 1024, (ctx, w, h) => {
    const cx = w / 2;
    const cy = h / 2;
    ctx.fillStyle = '#77593d';
    ctx.fillRect(0, 0, w, h);
    // Radial boards with alternating tone.
    const boards = 48;
    for (let i = 0; i < boards; i += 1) {
      const a1 = (i / boards) * Math.PI * 2;
      const a2 = ((i + 1) / boards) * Math.PI * 2;
      ctx.fillStyle = i % 2 ? '#7d5f42' : '#715538';
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, w / 2, a1, a2);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = 'rgba(30,20,12,0.55)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(a1) * w * 0.5, cy + Math.sin(a1) * w * 0.5);
      ctx.stroke();
    }
    // Ring seams and the painted rim.
    ctx.strokeStyle = 'rgba(30,20,12,0.45)';
    for (const r of [0.55, 0.72, 0.86]) {
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(cx, cy, (w / 2) * r, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.strokeStyle = VERMILION;
    ctx.lineWidth = 14;
    ctx.beginPath();
    ctx.arc(cx, cy, (w / 2) * 0.965, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = GOLD;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(cx, cy, (w / 2) * 0.935, 0, Math.PI * 2);
    ctx.stroke();
  });
}

// Valance: red scallops with gold trim on a transparent ground, hung as a
// cut-out ring below the rounding boards (alphaTest does the scissoring).
export function valanceTexture() {
  const texture = canvasTexture(256, 128, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = VERMILION;
    ctx.fillRect(0, 0, w, h * 0.42);
    const scallops = 4;
    for (let i = 0; i < scallops; i += 1) {
      ctx.beginPath();
      ctx.arc((i + 0.5) * (w / scallops), h * 0.42, w / scallops / 2, 0, Math.PI);
      ctx.fill();
    }
    ctx.fillStyle = GOLD;
    ctx.fillRect(0, 0, w, h * 0.09);
    ctx.strokeStyle = GOLD;
    ctx.lineWidth = 5;
    for (let i = 0; i < scallops; i += 1) {
      ctx.beginPath();
      ctx.arc((i + 0.5) * (w / scallops), h * 0.42, w / scallops / 2 - 3, 0, Math.PI);
      ctx.stroke();
    }
  }, { grain: false });
  return texture;
}
