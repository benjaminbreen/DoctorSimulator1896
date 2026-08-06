import * as THREE from 'three';
import { resolveHairPalette } from './palette.js';

function seeded(index) {
  const value = Math.sin(index * 91.137 + 17.71) * 43758.5453;
  return value - Math.floor(value);
}

/** Strand texture in flow space: u crosses locks, v runs root (v=0, at the
 * hairline) to tip (v=1, into the mass). The streamline shell parameterizes
 * itself the same way, so these strokes always follow the comb direction. */
function createFlowTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const context = canvas.getContext('2d');
  context.fillStyle = '#c0bbb5';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.lineCap = 'round';

  // Locks first: broad soft bands so strands cluster in value instead of
  // dithering. This clumping is most of what separates hair from felt.
  const clumps = 22;
  for (let clump = 0; clump < clumps; clump++) {
    const x = (clump + seeded(clump + 40) * 0.9) / clumps * canvas.width;
    const width = (0.55 + seeded(clump + 90) * 0.9) / clumps * canvas.width;
    const value = (seeded(clump + 140) - 0.5) * 46;
    const gradient = context.createLinearGradient(x - width, 0, x + width, 0);
    const tint = value >= 0 ? `rgba(255,252,246,${Math.abs(value) / 255})` : `rgba(24,16,10,${Math.abs(value) / 255})`;
    gradient.addColorStop(0, 'rgba(0,0,0,0)');
    gradient.addColorStop(0.5, tint);
    gradient.addColorStop(1, 'rgba(0,0,0,0)');
    context.fillStyle = gradient;
    context.fillRect(Math.floor(x - width), 0, Math.ceil(width * 2), canvas.height);
  }

  // Individual strands inside the locks, full height, slightly sinuous.
  for (let strand = 0; strand < 300; strand++) {
    const x = seeded(strand) * canvas.width;
    const bend = (seeded(strand + 400) - 0.5) * 26;
    const light = seeded(strand + 800) > 0.42;
    const alpha = 0.05 + seeded(strand + 1000) * 0.16;
    context.strokeStyle = light ? `rgba(250,243,232,${alpha})` : `rgba(22,14,9,${alpha})`;
    context.lineWidth = 0.5 + seeded(strand + 1200) * 1.3;
    context.beginPath();
    context.moveTo(x, -6);
    context.bezierCurveTo(x + bend, canvas.height * 0.3, x - bend * 0.6, canvas.height * 0.7, x + bend * 0.3, canvas.height + 6);
    context.stroke();
  }

  // Root shadow at v=0 (canvas bottom under flipY) so the shell's leading edge
  // darkens into the painted scalp band instead of ending in a hard seam, and
  // a lighter dip at v=1 where the strands disappear under the mass.
  const root = context.createLinearGradient(0, canvas.height, 0, canvas.height * 0.80);
  root.addColorStop(0, 'rgba(16,10,6,0.62)');
  root.addColorStop(1, 'rgba(16,10,6,0)');
  context.fillStyle = root;
  context.fillRect(0, Math.floor(canvas.height * 0.80), canvas.width, canvas.height);
  const tip = context.createLinearGradient(0, 0, 0, canvas.height * 0.10);
  tip.addColorStop(0, 'rgba(18,12,8,0.30)');
  tip.addColorStop(1, 'rgba(18,12,8,0)');
  context.fillStyle = tip;
  context.fillRect(0, 0, canvas.width, Math.ceil(canvas.height * 0.10));

  const texture = new THREE.CanvasTexture(canvas);
  texture.name = 'ProceduralHairFlow';
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.repeat.set(3, 1);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function createWispAlphaTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 256;
  const context = canvas.getContext('2d');
  const across = context.createLinearGradient(0, 0, canvas.width, 0);
  across.addColorStop(0, 'rgba(255,255,255,0)');
  across.addColorStop(0.28, 'rgba(255,255,255,.8)');
  across.addColorStop(0.5, 'rgba(255,255,255,1)');
  across.addColorStop(0.72, 'rgba(255,255,255,.8)');
  across.addColorStop(1, 'rgba(255,255,255,0)');
  context.fillStyle = across;
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.globalCompositeOperation = 'destination-in';
  const length = context.createLinearGradient(0, 0, 0, canvas.height);
  length.addColorStop(0, 'rgba(255,255,255,0)');
  length.addColorStop(0.12, 'rgba(255,255,255,1)');
  length.addColorStop(0.72, 'rgba(255,255,255,.72)');
  length.addColorStop(1, 'rgba(255,255,255,0)');
  context.fillStyle = length;
  context.fillRect(0, 0, canvas.width, canvas.height);
  const texture = new THREE.CanvasTexture(canvas);
  texture.name = 'ProceduralHairWispAlpha';
  return texture;
}

function createFlowAnisotropyTexture() {
  // Tangents follow texture U; green points the highlight along texture V,
  // which the streamline shell aligns with the comb direction.
  const texture = new THREE.DataTexture(new Uint8Array([128, 255, 255, 255]), 1, 1, THREE.RGBAFormat);
  texture.name = 'ProceduralHairFlowAnisotropy';
  texture.colorSpace = THREE.NoColorSpace;
  texture.needsUpdate = true;
  return texture;
}

export function createHairMaterials() {
  const flowTexture = createFlowTexture();
  const wispAlpha = createWispAlphaTexture();
  const anisotropyMap = createFlowAnisotropyTexture();
  // Fully opaque: every translucency device tried here (alphaHash, vertex
  // alpha, a transparent fringe band) produced shimmering pixels in motion.
  // The soft hairline lives in the painted skin overlay instead.
  const base = new THREE.MeshPhysicalMaterial({
    name: 'CostumeHair', color: '#0d0908', roughness: 0.74, side: THREE.DoubleSide,
    shadowSide: THREE.BackSide, map: flowTexture, bumpMap: flowTexture, bumpScale: 0.0005,
    vertexColors: true, anisotropy: 0.55, anisotropyMap,
    sheen: 0.08, sheenColor: '#604a40', sheenRoughness: 0.75,
  });
  const strand = new THREE.MeshPhysicalMaterial({
    name: 'CostumeHairStrands', color: '#17100d', roughness: 0.66, side: THREE.DoubleSide,
    polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1, vertexColors: true,
    anisotropy: 0.72, anisotropyMap, sheen: 0.10, sheenColor: '#765c4b', sheenRoughness: 0.68,
  });
  const highlight = strand.clone();
  highlight.name = 'CostumeHairHighlights';
  const wisp = new THREE.MeshStandardMaterial({
    name: 'CostumeHairWisps', color: '#17100d', roughness: 0.78, side: THREE.DoubleSide,
    alphaMap: wispAlpha, alphaTest: 0.24, depthWrite: true,
  });

  function update(values) {
    const palette = resolveHairPalette(values);
    const greyAmount = THREE.MathUtils.clamp(values.greyAmount ?? 0, 0, 1);
    // Individual grey ribbons carry most of the grey read; a small global lift
    // keeps the dense underlying hair plausible at high percentages.
    const baseColor = new THREE.Color(palette.base).lerp(new THREE.Color('#817b73'), greyAmount * 0.18);
    const contrast = THREE.MathUtils.clamp(values.strandContrast ?? 0.45, 0, 1);
    // The strand texture averages ~0.55 in linear light; lift the multiplier
    // so the on-screen shell matches the palette swatch.
    base.color.copy(baseColor).multiplyScalar(1.30 + contrast * 0.12);
    strand.color.copy(baseColor).lerp(new THREE.Color(palette.sheen), 0.22 + contrast * 0.18);
    highlight.color.copy(baseColor).lerp(new THREE.Color(palette.sheen), 0.45 + contrast * 0.20);
    wisp.color.copy(baseColor).lerp(new THREE.Color(palette.sheen), 0.15);
    base.sheenColor.copy(new THREE.Color(palette.sheen));
    strand.sheenColor.copy(new THREE.Color(palette.sheen));
    highlight.sheenColor.copy(new THREE.Color(palette.sheen));
  }

  function dispose() {
    flowTexture.dispose();
    wispAlpha.dispose();
    anisotropyMap.dispose();
    for (const material of [base, strand, highlight, wisp]) material.dispose();
  }

  return { base, strand, highlight, wisp, update, dispose };
}
