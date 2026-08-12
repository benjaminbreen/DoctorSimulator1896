// Stage-scenery flats past the playable border: painted skyline strips to the
// south and east where the city continues, tree lines to the north and west
// where the park does. Silhouettes are drawn once to canvas textures on
// cutout planes — six draws, no lights, no shadows; scene fog supplies the
// atmospheric perspective and a frame-driven tint follows the daylight.

import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { WORLD_BOUNDS } from '../world/streetGrid.js';
import { solarRamps } from '../world/solar.js';

function hash01(seed) {
  const value = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return value - Math.floor(value);
}

// Rooflines of an 1896 block face: stepped parapets, chimneys, the odd
// water tower and spire. `detail` false is the far ring — outline only.
function drawCity(ctx, w, h, seed, { wall, haze, detail }) {
  const ground = Math.round(h * 0.82);
  let x = 0;
  let i = 0;
  while (x < w) {
    const bw = Math.round(28 + hash01(seed + i * 7.3) * 64);
    const tall = detail ? 0.32 + hash01(seed + i * 3.1) * 0.4 : 0.45 + hash01(seed + i * 3.1) * 0.5;
    const bh = Math.round(ground * tall);
    const top = ground - bh;
    const tone = 0.9 + hash01(seed + i * 5.7) * 0.2;
    const base = new THREE.Color(wall).multiplyScalar(tone);
    ctx.fillStyle = `#${base.getHexString()}`;
    ctx.fillRect(x, top, bw + 1, bh);

    // Chimneys along the parapet.
    const chimneys = 1 + Math.floor(hash01(seed + i * 9.7) * 3);
    for (let c = 0; c < chimneys; c += 1) {
      const cx = x + 4 + hash01(seed + i * 11.3 + c) * (bw - 10);
      ctx.fillRect(cx, top - 5, 4, 5);
    }
    // A water tower here and there, a spire more rarely.
    const roll = hash01(seed + i * 13.9);
    if (roll > 0.9) {
      const tx = x + bw / 2 - 5;
      ctx.fillRect(tx + 2, top - 12, 2, 12);
      ctx.fillRect(tx + 7, top - 12, 2, 12);
      ctx.fillRect(tx, top - 20, 11, 9);
    } else if (roll < 0.05) {
      ctx.beginPath();
      ctx.moveTo(x + bw / 2 - 6, top);
      ctx.lineTo(x + bw / 2, top - 26);
      ctx.lineTo(x + bw / 2 + 6, top);
      ctx.fill();
    }

    // Window grid, near ring only. Morning: nearly all dark, a few warm.
    if (detail) {
      for (let wy = top + 8; wy < ground - 8; wy += 11) {
        for (let wx = x + 5; wx < x + bw - 6; wx += 9) {
          const litRoll = hash01(seed + wx * 0.37 + wy * 1.91);
          ctx.fillStyle = litRoll > 0.97 ? '#d29b58' : `#${base.clone().multiplyScalar(0.72).getHexString()}`;
          ctx.fillRect(wx, wy, 3, 5);
        }
      }
    }
    x += bw;
    i += 1;
  }
  // Ground band below the rooflines, hiding the gap between the terrain edge
  // and the flat. Opaque: the cutout alpha test keeps only the sky clear.
  const grad = ctx.createLinearGradient(0, ground - 2, 0, h);
  grad.addColorStop(0, wall);
  grad.addColorStop(1, haze);
  ctx.fillStyle = grad;
  ctx.fillRect(0, ground - 2, w, h - ground + 2);
}

function drawCrown(ctx, cx, cy, rx, ry, seed, color, lobeCount = 11) {
  ctx.fillStyle = color;

  // A broad inner mass keeps the crown joined while smaller edge clusters
  // break the outline into recognisable foliage rather than one smooth oval.
  ctx.beginPath();
  ctx.ellipse(cx, cy + ry * 0.12, rx * 0.78, ry * 0.68, 0, 0, Math.PI * 2);
  ctx.fill();

  for (let lobe = 0; lobe < lobeCount; lobe += 1) {
    const across = lobeCount === 1 ? 0 : (lobe / (lobeCount - 1)) * 2 - 1;
    const crown = Math.sqrt(Math.max(0, 1 - across * across));
    const jitterX = (hash01(seed + lobe * 7.1) - 0.5) * rx * 0.15;
    const jitterY = (hash01(seed + lobe * 11.9) - 0.5) * ry * 0.16;
    const lobeRx = rx * (0.17 + hash01(seed + lobe * 17.3) * 0.1);
    const lobeRy = ry * (0.2 + hash01(seed + lobe * 23.7) * 0.12);
    const x = cx + across * rx * 0.8 + jitterX;
    const y = cy - crown * ry * 0.56 + Math.abs(across) * ry * 0.22 + jitterY;
    ctx.beginPath();
    ctx.ellipse(x, y, lobeRx, lobeRy, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // A few lower clusters make the crown hang over the trunk like an elm or
  // mature park tree instead of ending in a straight horizontal edge.
  for (let lobe = 0; lobe < 4; lobe += 1) {
    const across = (lobe / 3) * 1.5 - 0.75;
    const lobeRx = rx * (0.2 + hash01(seed + 53 + lobe) * 0.08);
    const lobeRy = ry * (0.16 + hash01(seed + 71 + lobe) * 0.08);
    ctx.beginPath();
    ctx.ellipse(
      cx + across * rx + (hash01(seed + 89 + lobe) - 0.5) * rx * 0.12,
      cy + ry * (0.42 + hash01(seed + 101 + lobe) * 0.18),
      lobeRx,
      lobeRy,
      0,
      0,
      Math.PI * 2,
    );
    ctx.fill();
  }
}

function drawTrunk(ctx, x, ground, branchY, crownY, seed, width, color) {
  const lean = (hash01(seed + 17) - 0.5) * width * 1.6;
  const fork = width * (1.7 + hash01(seed + 29) * 1.4);
  ctx.strokeStyle = color;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.moveTo(x, ground + 2);
  ctx.quadraticCurveTo(x - lean * 0.3, branchY, x + lean, crownY);
  ctx.stroke();

  ctx.lineWidth = Math.max(1.5, width * 0.48);
  ctx.beginPath();
  ctx.moveTo(x - lean * 0.15, branchY + 2);
  ctx.lineTo(x - fork, crownY + 4);
  ctx.moveTo(x, branchY - 1);
  ctx.lineTo(x + fork * 0.85, crownY + 1);
  ctx.stroke();
}

// Layered broadleaf crowns with trunks and small sky gaps. The texture is
// still painted only once, so the more natural outline costs nothing per frame.
function drawTrees(ctx, w, h, seed, { leaf, leafMid, leafFar, trunk, haze }) {
  const ground = Math.round(h * 0.75);

  // A lower, paler rank stops distant gaps from looking empty without
  // repeating the foreground tree rhythm.
  let rearX = -24;
  let rearIndex = 0;
  while (rearX < w + 24) {
    const rearSeed = seed * 31 + rearIndex * 19.7;
    const rx = 18 + hash01(rearSeed + 1) * 18;
    const ry = 14 + hash01(rearSeed + 2) * 12;
    rearX += 20 + hash01(rearSeed + 3) * 28;
    drawCrown(
      ctx,
      rearX,
      ground - 10 - ry * (0.25 + hash01(rearSeed + 4) * 0.28),
      rx,
      ry,
      rearSeed,
      leafFar,
      8,
    );
    rearIndex += 1;
  }

  let x = -32;
  let treeIndex = 0;
  while (x < w + 32) {
    const treeSeed = seed * 101 + treeIndex * 37.9;
    const spacing = 34 + hash01(treeSeed + 1) * 34;
    const rx = 22 + hash01(treeSeed + 2) * 18;
    const ry = 20 + hash01(treeSeed + 3) * 15;
    const trunkH = 18 + hash01(treeSeed + 4) * 17;
    const crownY = ground - trunkH - ry * 0.08;
    const treeX = x + spacing * 0.5;
    const trunkWidth = 2.8 + hash01(treeSeed + 5) * 2.4;
    const crownColor = hash01(treeSeed + 6) > 0.46 ? leaf : leafMid;

    drawTrunk(
      ctx,
      treeX,
      ground,
      ground - trunkH * 0.58,
      crownY + ry * 0.1,
      treeSeed,
      trunkWidth,
      trunk,
    );
    drawCrown(ctx, treeX, crownY, rx, ry, treeSeed, crownColor);

    x += spacing;
    treeIndex += 1;
  }

  // Irregular understory hides the plane's lower edge and seats the trunks
  // in vegetation without erasing all of the open space beneath the crowns.
  const grad = ctx.createLinearGradient(0, ground - 2, 0, h);
  grad.addColorStop(0, leafMid);
  grad.addColorStop(1, haze);
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.moveTo(0, h);
  ctx.lineTo(0, ground + 1);
  for (let bushX = 0; bushX <= w; bushX += 9) {
    const top = ground + 1 - hash01(seed * 211 + bushX * 1.13) * 6;
    ctx.lineTo(bushX, top);
  }
  ctx.lineTo(w, h);
  ctx.closePath();
  ctx.fill();
}

function makeStrip(width, height, seed, style) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (style === 'city') {
    drawCity(ctx, width, height, seed, { wall: '#41392f', haze: '#767468', detail: true });
  } else if (style === 'city-far') {
    drawCity(ctx, width, height, seed, { wall: '#6d7480', haze: '#868d96', detail: false });
  } else {
    drawTrees(ctx, width, height, seed, {
      leaf: '#35402f',
      leafMid: '#465044',
      leafFar: '#596158',
      trunk: '#33352d',
      haze: '#6d7263',
    });
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

const { minX, maxX, minZ, maxZ } = WORLD_BOUNDS;
const midX = (minX + maxX) / 2;
const midZ = (minZ + maxZ) / 2;
const spanX = maxX - minX + 180;
const spanZ = maxZ - minZ + 180;

// [style, seed, width, height(m), position, yRotation]
// City sits south (+z) and east (+x); the park continues north and west.
// The far ring is taller and hazier: the city going on behind the city.
const FLATS = [
  ['city', 11, spanX, 26, [midX, 12, maxZ + 16], Math.PI],
  ['city', 23, spanZ, 26, [maxX + 16, 12, midZ], -Math.PI / 2],
  ['city-far', 31, spanX + 140, 44, [midX, 21, maxZ + 86], Math.PI],
  ['city-far', 47, spanZ + 140, 44, [maxX + 86, 21, midZ], -Math.PI / 2],
  ['trees', 5, spanX, 16, [midX, 6, minZ - 16], 0],
  ['trees', 7, spanZ, 16, [minX - 16, 6, midZ], Math.PI / 2],
];

export default function Backdrop({ runtime }) {
  const flats = useMemo(
    () =>
      FLATS.map(([style, seed, width, height, position, yaw]) => ({
        texture: makeStrip(Math.min(4096, Math.round(width * 4)), 128, seed, style),
        width,
        height,
        position,
        yaw,
      })),
    [],
  );

  const materials = useMemo(
    () =>
      flats.map(
        (flat) =>
          new THREE.MeshBasicMaterial({
            map: flat.texture,
            alphaTest: 0.5,
            side: THREE.DoubleSide,
            fog: true,
          }),
      ),
    [flats],
  );

  useEffect(
    () => () => {
      for (const flat of flats) flat.texture.dispose();
      for (const material of materials) material.dispose();
    },
    [flats, materials],
  );

  // Unlit flats would glow at night; follow the sun instead.
  useFrame(() => {
    const { daylight } = solarRamps(runtime.values.timeOfDay, runtime.values.dayOfYear);
    const level = 0.3 + 0.7 * daylight;
    for (const material of materials) material.color.setScalar(level);
  });

  return (
    <group>
      {flats.map((flat, index) => (
        <mesh
          key={index}
          position={flat.position}
          rotation={[0, flat.yaw, 0]}
          material={materials[index]}
          frustumCulled
        >
          <planeGeometry args={[flat.width, flat.height]} />
        </mesh>
      ))}
    </group>
  );
}
