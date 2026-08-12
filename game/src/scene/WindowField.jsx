import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { facadeLayout } from './textures.js';
import { solarRamps } from '../world/solar.js';
import { ALLEY_LINES } from '../world/streetGrid.js';
import { terrainHeight } from '../world/terrain.js';

// Instanced window dressing over the painted facades: reflective glass,
// sash frames, sills, shutters, lit panes, and laundry lines. Everything is
// bucketed into a handful of InstancedMeshes, so the whole street costs
// single-digit draw calls. Positions follow facadeLayout, so each pane sits
// exactly on its painted opening (which reads as the dark interior).

// Outward normal and the axis u runs along, matching BoxGeometry UVs
// (side faces mirror horizontally).
const FACES = {
  '+z': { normal: [0, 0, 1], right: [1, 0, 0], yaw: 0 },
  '-z': { normal: [0, 0, -1], right: [-1, 0, 0], yaw: Math.PI },
  '+x': { normal: [1, 0, 0], right: [0, 0, -1], yaw: Math.PI / 2 },
  '-x': { normal: [-1, 0, 0], right: [0, 0, 1], yaw: -Math.PI / 2 },
};

// Sash and stone tones per facade style (brownstone, red brick, pale stone,
// dark brownstone, marble). Sashes are painted wood, dark in period photos;
// nothing here should read as metal. Shutters belong to the brownstone rows.
const FRAME_COLORS = ['#3b332a', '#443a2f', '#4d443a', '#332c25', '#57503f'];
const SILL_COLORS = ['#57453a', '#5e3b2e', '#726a5c', '#4c433b', '#a8a191'];
const SHUTTER_STYLES = new Set([0, 3]);
const CLOTH_COLORS = ['#e8e2d4', '#ddd3bf', '#cfc8b8', '#8d95a8', '#b9a08a'];
// Painted deal window boxes, and what was in them: geraniums above all, which
// is why the reds outnumber everything else.
const PLANTER_COLORS = ['#3f4a34', '#5a4632', '#41352a', '#4a4038'];
const BLOOM_COLORS = ['#b8392f', '#c4483a', '#a8322c', '#cf7368', '#e0d6c6'];
// Single-pane 1896 glass: dark interior behind wavy glass, muted sky catch,
// never a bright modern mirror.
const GLASS_TINTS = ['#454e58', '#3a4149', '#2c3138', '#5a636e', '#41453f'];
// Splay per sash, in radians. Old windows never sat flush in their openings,
// and non-aligned reflections are the whole difference between a wall of
// glass and a painted grid of rectangles. Keep it under a degree: much more
// and a tall pane's edge sinks behind the facade it stands off.
const SASH_SKEW = 0.014;

function hash01(seed) {
  const value = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return value - Math.floor(value);
}

function idHash(id) {
  let total = 0;
  for (let i = 0; i < id.length; i += 1) total = (total * 31 + id.charCodeAt(i)) | 0;
  return Math.abs(total);
}

// Two-over-two sash frame — border, meeting rail, and muntins — painted on
// an alpha-tested plane so one instanced mesh covers every window size. The
// texture is white; per-instance color carries the dark paint.
function makeFrameTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 96;
  const context = canvas.getContext('2d');
  context.clearRect(0, 0, 64, 96);
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, 64, 5);
  context.fillRect(0, 91, 64, 5);
  context.fillRect(0, 0, 5, 96);
  context.fillRect(59, 0, 5, 96);
  context.fillRect(0, 45, 64, 6);
  context.fillRect(30, 0, 3, 96);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

// Fall-off down a pane: sky caught in the top of the glass, the unlit room
// behind it toward the bottom. Multiplies the per-instance tint, so it darkens
// rather than colours.
function makeGlassGradient() {
  const canvas = document.createElement('canvas');
  canvas.width = 4;
  canvas.height = 64;
  const context = canvas.getContext('2d');
  const gradient = context.createLinearGradient(0, 0, 0, 64);
  gradient.addColorStop(0, '#ffffff');
  gradient.addColorStop(0.4, '#cfcfcf');
  gradient.addColorStop(1, '#5c5c5c');
  context.fillStyle = gradient;
  context.fillRect(0, 0, 4, 64);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

// Window-box planting, as two alpha-cut layers: a mass of leaves and the
// blooms over it. Both are drawn white so the per-instance colour can carry
// the green and the geranium red separately.
function makeFoliageTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 48;
  const context = canvas.getContext('2d');
  context.fillStyle = '#ffffff';
  for (let i = 0; i < 24; i += 1) {
    const x = 4 + hash01(i * 3.1 + 0.7) * 56;
    const y = 12 + hash01(i * 7.7 + 1.3) * 32;
    const r = 5 + hash01(i * 2.3) * 5;
    context.beginPath();
    context.ellipse(x, y, r, r * 0.7, hash01(i * 1.9) * Math.PI, 0, Math.PI * 2);
    context.fill();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function makeBloomTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 48;
  const context = canvas.getContext('2d');
  context.fillStyle = '#ffffff';
  for (let i = 0; i < 10; i += 1) {
    const x = 6 + hash01(i * 5.3 + 2.1) * 52;
    const y = 8 + hash01(i * 9.1 + 0.9) * 24;
    const r = 2.4 + hash01(i * 4.7) * 1.9;
    context.beginPath();
    context.arc(x, y, r, 0, Math.PI * 2);
    context.fill();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

// Striped awning canvas with a scalloped valance cut into the bottom edge.
function makeAwningTexture(stripe) {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const context = canvas.getContext('2d');
  context.fillStyle = '#f2ead8';
  context.fillRect(0, 0, 128, 128);
  context.fillStyle = stripe;
  for (let x = 0; x < 128; x += 32) context.fillRect(x, 0, 16, 128);
  context.globalCompositeOperation = 'destination-out';
  for (let x = 8; x < 128; x += 16) {
    context.beginPath();
    context.arc(x, 128, 7, 0, Math.PI * 2);
    context.fill();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

const scratchMatrix = new THREE.Matrix4();
const scratchPos = new THREE.Vector3();
const scratchQuat = new THREE.Quaternion();
const scratchEuler = new THREE.Euler();
const scratchScale = new THREE.Vector3();
const scratchColor = new THREE.Color();

function pushInstance(list, x, y, z, yaw, sx, sy, sz, color, tilt = 0, pitch = 0) {
  list.push({ x, y, z, yaw, sx, sy, sz, color, tilt, pitch });
}

// One InstancedMesh from a list of {x,y,z,yaw,pitch,tilt,sx,sy,sz,color}
// records. Euler YXZ keeps yaw mapping local X onto the face's right axis.
function buildMesh(records, geometry, material, shadows = false) {
  const mesh = new THREE.InstancedMesh(geometry, material, records.length);
  records.forEach((rec, index) => {
    scratchEuler.set(rec.pitch, rec.yaw, rec.tilt, 'YXZ');
    scratchQuat.setFromEuler(scratchEuler);
    scratchPos.set(rec.x, rec.y, rec.z);
    scratchScale.set(rec.sx, rec.sy, rec.sz);
    scratchMatrix.compose(scratchPos, scratchQuat, scratchScale);
    mesh.setMatrixAt(index, scratchMatrix);
    if (rec.color) mesh.setColorAt(index, scratchColor.set(rec.color));
  });
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.castShadow = shadows;
  mesh.receiveShadow = shadows;
  return mesh;
}

function jitterColor(base, seed, amount = 0.05) {
  scratchColor.set(base);
  scratchColor.offsetHSL(0, 0, (hash01(seed) - 0.5) * amount * 2);
  return `#${scratchColor.getHexString()}`;
}

export default function WindowField({ items, runtime }) {
  const meshes = useMemo(() => {
    const glass = [];
    const litGlass = [];
    const frames = [];
    const trimBoxes = [];
    const shutters = [];
    const ropes = [];
    const cloths = [];
    const bayBodies = [];
    const railings = [];
    const awningsRed = [];
    const awningsGreen = [];
    const plants = [];
    const blooms = [];

    for (const item of items) {
      const faces = item.windowFaces ?? [];
      if (faces.length === 0) continue;
      const seed = idHash(item.id);
      const style = item.facadeStyle ?? seed % 4;
      const layout = facadeLayout(item.size[0], item.size[1]);
      const [cx, cy, cz] = item.position;
      const [sx, sy, sz] = item.size;
      const frameColor = FRAME_COLORS[style % FRAME_COLORS.length];
      const sillColor = SILL_COLORS[style % SILL_COLORS.length];
      const canShutter = SHUTTER_STYLES.has(style);
      const hotel = style === 1 || style === 2;

      faces.forEach((token, faceIndex) => {
        const face = FACES[token];
        if (!face) return;
        const faceWidth = token === '+z' || token === '-z' ? sx : sz;
        const halfDepth = (token === '+z' || token === '-z' ? sz : sx) / 2;
        const place = (u, vPx, out) => [
          cx + face.right[0] * (u - 0.5) * faceWidth + face.normal[0] * (halfDepth + out),
          cy + sy / 2 - (vPx / layout.texH) * sy,
          cz + face.right[2] * (u - 0.5) * faceWidth + face.normal[2] * (halfDepth + out),
        ];

        // One column may carry a projecting oriel bay instead of flat windows.
        const bayRoll = hash01(seed * 0.51 + faceIndex * 3.3);
        const bayCol =
          canShutter && faceWidth > 6.4 && layout.cols >= 3 && bayRoll < 0.3
            ? (bayRoll < 0.15 ? 0 : layout.cols - 1)
            : -1;

        const windows = [...layout.upper, ...layout.ground.filter((win) => !win.isDoor)];
        for (const win of windows) {
          const upperFloor = win.floor !== undefined;
          if (upperFloor && win.col === bayCol) continue;
          const u = (win.x + win.w / 2) / layout.texW;
          const wM = (win.w / layout.texW) * faceWidth;
          const hM = (win.h / layout.texH) * sy;
          const roll = hash01(seed * 0.013 + faceIndex * 19.3 + (win.floor ?? -1) * 3.7 + win.col * 7.1);

          const shuttered = canShutter && upperFloor && roll < 0.22;
          const shutClosed = shuttered && roll < 0.08;
          const openSash = upperFloor && !shutClosed && roll > 0.34 && roll < 0.5;
          const lit = !shutClosed && hash01(seed + win.col * 11.7 + (win.floor ?? 9) * 5.3) < (hotel ? 0.1 : 0.05);

          // Glass and its frame share one splay, so the sash stays a sash.
          const skewTilt = (hash01(seed * 3.1 + win.col * 4.7 + (win.floor ?? 0) * 9.1) - 0.5) * SASH_SKEW;
          const skewPitch = (hash01(seed * 5.9 + win.col * 2.3 + (win.floor ?? 0) * 6.7) - 0.5) * SASH_SKEW;

          // Glass: full pane, or the upper half only when the sash is open.
          const [gx, gy, gz] = place(u, win.y + win.h / 2, 0.03);
          const target = lit ? litGlass : glass;
          const tint = lit
            ? jitterColor('#d9a568', seed + win.col * 3 + 1, 0.1)
            : jitterColor(
                GLASS_TINTS[Math.floor(roll * 71) % GLASS_TINTS.length],
                seed + win.col * 5 + (win.floor ?? 0), 0.1,
              );
          if (openSash) {
            const [ox, oy, oz] = place(u, win.y + win.h * 0.26, 0.045);
            pushInstance(target, ox, oy, oz, face.yaw, wM, hM * 0.52, 1, tint, skewTilt, skewPitch);
          } else if (!shutClosed) {
            pushInstance(target, gx, gy, gz, face.yaw, wM, hM, 1, tint, skewTilt, skewPitch);
          }

          // Sash frame overlay.
          if (!shutClosed) {
            pushInstance(frames, ...place(u, win.y + win.h / 2, 0.06), face.yaw, wM * 1.08, hM * 1.04, 1, jitterColor(frameColor, seed + win.col, 0.06), skewTilt, skewPitch);
          }

          // Projecting stone sill and the heavier hood lintel above.
          if (upperFloor) {
            const [lx, ly, lz] = place(u, win.y + win.h + 3, 0.08);
            pushInstance(trimBoxes, lx, ly, lz, face.yaw, wM * 1.2, 0.09, 0.16, sillColor);
            const [hx, hy, hz] = place(u, win.y - 4, 0.09);
            pushInstance(trimBoxes, hx, hy, hz, face.yaw, wM * 1.35, 0.14, 0.18, sillColor);
          }

          if (shuttered) {
            const panelW = wM * 0.5;
            const off = shutClosed ? panelW / 2 : panelW * 1.62;
            const out = shutClosed ? 0.07 : 0.04;
            const shade = jitterColor('#41503f', seed + win.col * 13, 0.12);
            for (const side of [-1, 1]) {
              const uSide = u + (side * off) / faceWidth;
              pushInstance(shutters, ...place(uSide, win.y + win.h / 2, out), face.yaw, panelW, hM, 0.045, shade);
            }
          }

          // Striped canvas awnings on the hotels: sparse, some furled, each
          // sagging a little differently, with iron side arms.
          const awningRoll = hash01(seed * 0.77 + faceIndex * 11.1 + win.floor * 2.9 + win.col * 5.7);
          if (item.awnings && upperFloor && awningRoll < 0.2) {
            if (awningRoll < 0.06) {
              // Furled: a rolled canvas bundle under the lintel.
              pushInstance(shutters, ...place(u, win.y + 3, 0.09), face.yaw, wM * 1.2, 0.12, 0.14, jitterColor('#e3d9c2', seed + win.col, 0.08));
            } else {
              const drop = hM * (0.56 + hash01(seed + win.col * 3.3) * 0.14);
              const proj = 0.68 + hash01(seed + win.floor * 2.1) * 0.18;
              const wA = wM * (1.15 + hash01(seed + win.col * 9.1) * 0.2);
              const pitch = -Math.atan2(proj, drop) + (hash01(seed * 1.3 + win.col) - 0.5) * 0.1;
              const tilt = (hash01(seed * 2.7 + win.floor) - 0.5) * 0.05;
              const [ax, ay, az] = place(u, win.y + 2, proj / 2 + 0.06);
              const bucket = seed % 2 === 0 ? awningsRed : awningsGreen;
              pushInstance(
                bucket, ax, ay - drop / 2, az, face.yaw, wA, Math.hypot(drop, proj), 1,
                jitterColor('#ffffff', seed + win.col * 7, 0.05), tilt, pitch,
              );
              // Iron side arms along the canvas edges.
              for (const side of [-1, 1]) {
                const uArm = u + (side * wA * 0.5) / faceWidth;
                const [rx, ry, rz] = place(uArm, win.y + 2, proj / 2 + 0.05);
                pushInstance(railings, rx, ry - drop / 2, rz, face.yaw, 0.028, Math.hypot(drop, proj), 0.028, '#2c3134', tilt, pitch);
              }
            }
          }

          // A window box of geraniums on one upper window in six, where no
          // awning is already occupying the sill.
          const boxRoll = hash01(seed * 0.91 + faceIndex * 4.3 + (win.floor ?? 0) * 8.9 + win.col * 2.7);
          const awninged = item.awnings && upperFloor && awningRoll < 0.2;
          if (upperFloor && !shutClosed && !awninged && boxRoll < 0.17) {
            const boxW = wM * 0.84;
            const [px, py, pz] = place(u, win.y + win.h + 1, 0.13);
            pushInstance(
              trimBoxes, px, py, pz, face.yaw, boxW, 0.17, 0.2,
              jitterColor(PLANTER_COLORS[Math.floor(boxRoll * 331) % PLANTER_COLORS.length], seed + win.col, 0.07),
            );
            // Leaves, then blooms a centimetre proud of them.
            const [fx, , fz] = place(u, win.y + win.h + 1, 0.15);
            pushInstance(plants, fx, py + 0.19, fz, face.yaw, boxW * 1.06, 0.28, 1, jitterColor('#4c6636', seed + win.col * 3, 0.14));
            const [bx, , bz] = place(u, win.y + win.h + 1, 0.17);
            pushInstance(
              blooms, bx, py + 0.22, bz, face.yaw, boxW * 1.06, 0.28, 1,
              jitterColor(BLOOM_COLORS[Math.floor(boxRoll * 977) % BLOOM_COLORS.length], seed + win.col * 5, 0.1),
            );
          }

          // Muslin behind an open sash. It goes in the laundry bucket, so the
          // same breeze that moves the washing stirs it.
          if (openSash && hash01(seed * 1.37 + win.col * 6.1 + (win.floor ?? 0) * 2.9) < 0.65) {
            const lean = (hash01(seed * 2.9 + win.col * 1.7) - 0.5) * 0.6;
            const [qx, qy, qz] = place(u + (lean * wM * 0.16) / faceWidth, win.y + win.h * 0.72, 0.035);
            pushInstance(
              cloths, qx, qy, qz, face.yaw,
              wM * (0.44 + hash01(seed + win.col * 4.1) * 0.22), hM * 0.44, 1,
              jitterColor('#e6e0d2', seed + win.col * 2.7, 0.07), lean * 0.14,
            );
          }
        }

        // Oriel bay: painted-wood body proud of the wall, glass on its front
        // and sides per floor, capped top and bottom.
        if (bayCol >= 0) {
          const first = layout.upper.find((win) => win.col === bayCol && win.floor === 0);
          const u = (first.x + first.w / 2) / layout.texW;
          const wWin = (first.w / layout.texW) * faceWidth;
          const bayW = wWin * 2.1;
          const bayDepth = 0.6;
          const topPx = 21;
          const botPx = layout.groundBandY - 2;
          const yTop = cy + sy / 2 - (topPx / layout.texH) * sy;
          const yBot = cy + sy / 2 - (botPx / layout.texH) * sy;
          const bodyColor = jitterColor('#4a3f33', seed * 2.3, 0.08);
          const [bx, , bz] = place(u, 0, bayDepth / 2);
          pushInstance(bayBodies, bx, (yTop + yBot) / 2, bz, face.yaw, bayW, yTop - yBot, bayDepth, bodyColor);
          const [tx, , tz] = place(u, 0, bayDepth / 2 + 0.05);
          pushInstance(trimBoxes, tx, yTop + 0.1, tz, face.yaw, bayW + 0.24, 0.2, bayDepth + 0.22, sillColor);
          pushInstance(trimBoxes, tx, yBot - 0.14, tz, face.yaw, bayW * 0.82, 0.3, bayDepth * 0.8, sillColor);
          for (const win of layout.upper.filter((w) => w.col === bayCol)) {
            const vMid = win.y + win.h / 2;
            const [gx, gy, gz] = place(u, vMid, bayDepth + 0.02);
            const tint = jitterColor(GLASS_TINTS[(seed + win.floor) % GLASS_TINTS.length], seed * 3 + win.floor, 0.1);
            pushInstance(glass, gx, gy, gz, face.yaw, bayW * 0.58, (win.h / layout.texH) * sy, 1, tint);
            pushInstance(frames, ...place(u, vMid, bayDepth + 0.04), face.yaw, bayW * 0.64, (win.h / layout.texH) * sy * 1.04, 1, jitterColor(frameColor, seed + win.floor, 0.06));
            for (const side of [-1, 1]) {
              const uSide = u + (side * bayW * 0.5) / faceWidth;
              const [sx2, sy2, sz2] = place(uSide, vMid, bayDepth / 2);
              pushInstance(glass, sx2, sy2, sz2, face.yaw - side * (Math.PI / 2), 0.34, (win.h / layout.texH) * sy * 0.92, 1, tint);
            }
          }
        }

        // Iron areaway railing along the front, broken at the stoop.
        if (canShutter && faceIndex === 0) {
          const door = layout.ground.find((win) => win.isDoor);
          const doorU = door ? (door.x + door.w / 2) / layout.texW : 0.5;
          const gapU = door ? ((door.w / layout.texW) * 1.6) : 0;
          const railOut = 1.15;
          const railH = 0.78;
          const baseY = cy - sy / 2;
          const iron = '#26292c';
          for (const [u0, u1] of [[0.04, doorU - gapU], [doorU + gapU, 0.96]]) {
            if (u1 - u0 < 0.08) continue;
            const runLen = (u1 - u0) * faceWidth;
            const [rx, , rz] = place((u0 + u1) / 2, 0, railOut);
            pushInstance(railings, rx, baseY + railH, rz, face.yaw, runLen, 0.05, 0.05, iron);
            pushInstance(railings, rx, baseY + 0.34, rz, face.yaw, runLen, 0.04, 0.04, iron);
            const pickets = Math.max(2, Math.round(runLen / 0.34));
            for (let p = 0; p < pickets; p += 1) {
              const uP = u0 + ((p + 0.5) / pickets) * (u1 - u0);
              const [px, , pz] = place(uP, 0, railOut);
              pushInstance(railings, px, baseY + railH / 2, pz, face.yaw, 0.035, railH, 0.035, iron);
            }
          }
        }

        // Bracketed cornice: the row of modillions under the painted band.
        const brackets = Math.max(3, Math.round(faceWidth / 1.15));
        for (let b = 0; b < brackets; b += 1) {
          const [bx, by, bz] = place((b + 0.5) / brackets, 17, 0.13);
          pushInstance(trimBoxes, bx, by, bz, face.yaw, 0.14, 0.4, 0.26, sillColor);
        }

        // Entrance on the street face: brownstone rows get a high stoop with
        // cheek walls; the landmarks get a low platform. Both get a stone
        // door surround.
        if (faceIndex === 0) {
          const door = layout.ground.find((win) => win.isDoor);
          if (door) {
            const uDoor = (door.x + door.w / 2) / layout.texW;
            const doorW = (door.w / layout.texW) * faceWidth;
            const baseY = cy - sy / 2;
            const stone = jitterColor(sillColor, seed * 1.7, 0.08);
            const stoop = canShutter;
            if (stoop) {
              for (let step = 0; step < 5; step += 1) {
                const depth = 1.5 - step * 0.24;
                const height = 0.19 * (step + 1);
                const [px, , pz] = place(uDoor, 0, depth / 2);
                pushInstance(trimBoxes, px, baseY + height / 2, pz, face.yaw, doorW * 1.6, height, depth, stone);
              }
              for (const side of [-1, 1]) {
                const uSide = uDoor + (side * doorW * 0.95) / faceWidth;
                const [wx, , wz] = place(uSide, 0, 0.8);
                pushInstance(trimBoxes, wx, baseY + 0.55, wz, face.yaw, 0.14, 1.1, 1.6, stone);
              }
            } else {
              for (let step = 0; step < 2; step += 1) {
                const depth = 1.2 - step * 0.5;
                const height = 0.16 * (step + 1);
                const [px, , pz] = place(uDoor, 0, depth / 2);
                pushInstance(trimBoxes, px, baseY + height / 2, pz, face.yaw, doorW * 2.2, height, depth, stone);
              }
            }
            const doorBase = baseY + (stoop ? 0.95 : 0.32);
            const pilasterH = stoop ? 2.4 : 2.8;
            for (const side of [-1, 1]) {
              const uP = uDoor + (side * doorW * 0.62) / faceWidth;
              const [px, , pz] = place(uP, 0, 0.07);
              pushInstance(trimBoxes, px, doorBase + pilasterH / 2, pz, face.yaw, 0.2, pilasterH, 0.14, stone);
            }
            const [ex, , ez] = place(uDoor, 0, 0.09);
            pushInstance(trimBoxes, ex, doorBase + pilasterH + 0.17, ez, face.yaw, doorW * 1.7, 0.34, 0.18, stone);
          }
        }

        // Laundry lines: strung between upper windows on the flagged rows,
        // sagging toward the middle, with a few pieces on the line.
        if (item.laundry && layout.cols >= 3) {
          for (let floor = 1; floor < layout.floors - 1; floor += 1) {
            const roll = hash01(seed * 0.31 + faceIndex * 7.7 + floor * 3.3);
            if (roll > 0.32) continue;
            const colA = Math.floor(roll * 100) % (layout.cols - 2);
            const winA = layout.upper.find((w) => w.floor === floor && w.col === colA);
            const winB = layout.upper.find((w) => w.floor === floor && w.col === colA + 2);
            if (!winA || !winB) continue;
            if (bayCol >= colA && bayCol <= colA + 2) continue;
            const uA = (winA.x + winA.w / 2) / layout.texW;
            const uB = (winB.x + winB.w / 2) / layout.texW;
            const yPx = winA.y + winA.h + 6;
            const span = (uB - uA) * faceWidth;
            const sag = 0.28;
            const segment = Math.hypot(span / 2, sag);
            // The face yaw maps local X onto face.right, so the sag tilt
            // sign only depends on which half of the line this is.
            for (const half of [0, 1]) {
              const uMid = uA + ((uB - uA) * (half === 0 ? 0.25 : 0.75));
              const [rx, ry, rz] = place(uMid, yPx, 0.42);
              const tilt = Math.atan2(sag, span / 2) * (half === 0 ? -1 : 1);
              pushInstance(ropes, rx, ry - sag / 2, rz, face.yaw, segment, 0.016, 0.016, '#7a7468', tilt);
            }
            const pieces = 2 + (Math.floor(roll * 1000) % 3);
            for (let p = 0; p < pieces; p += 1) {
              const t = (p + 1) / (pieces + 1);
              const uP = uA + (uB - uA) * t;
              const drop = sag * (1 - Math.abs(t - 0.5) * 2) ** 0.8;
              const clothH = 0.42 + hash01(seed + p * 7 + floor) * 0.3;
              const [px, py, pz] = place(uP, yPx, 0.42);
              pushInstance(
                cloths, px, py - drop - clothH / 2, pz, face.yaw,
                0.36 + hash01(seed + p * 3) * 0.24, clothH, 1,
                CLOTH_COLORS[(seed + p * 5 + floor) % CLOTH_COLORS.length],
              );
            }
          }
        }
      });
    }

    // Free-standing laundry in the back lots: wooden posts, a sagging line,
    // a few pieces per line. Anchors come hand-picked from the street grid.
    for (const [lineIndex, line] of ALLEY_LINES.entries()) {
      const dirX = Math.cos(line.yaw);
      const dirZ = Math.sin(line.yaw);
      const yawRec = -line.yaw;
      const half = line.length / 2;
      const topH = 2.3;
      const sag = 0.35;
      for (const side of [-1, 1]) {
        const ex = line.x + dirX * half * side;
        const ez = line.z + dirZ * half * side;
        pushInstance(ropes, ex, terrainHeight(ex, ez) + 1.25, ez, yawRec, 0.09, 2.5, 0.09, '#5a4a38');
      }
      const groundMid = terrainHeight(line.x, line.z);
      const segment = Math.hypot(half, sag);
      for (const half2 of [0, 1]) {
        const t = half2 === 0 ? -0.5 : 0.5;
        const mx = line.x + dirX * half * t;
        const mz = line.z + dirZ * half * t;
        const tiltRope = Math.atan2(sag, half) * (half2 === 0 ? -1 : 1);
        pushInstance(ropes, mx, groundMid + topH - sag / 2, mz, yawRec, segment, 0.015, 0.015, '#7a7468', tiltRope);
      }
      const pieces = 3 + (lineIndex % 3);
      for (let p = 0; p < pieces; p += 1) {
        const t = (p + 1) / (pieces + 1) - 0.5;
        const px = line.x + dirX * line.length * t;
        const pz = line.z + dirZ * line.length * t;
        const drop = sag * (1 - Math.abs(t) * 2) ** 0.8;
        const clothH = 0.45 + hash01(lineIndex * 7 + p * 3) * 0.35;
        pushInstance(
          cloths, px, groundMid + topH - drop - clothH / 2, pz, yawRec,
          0.4 + hash01(lineIndex + p * 5) * 0.3, clothH, 1,
          CLOTH_COLORS[(lineIndex * 3 + p) % CLOTH_COLORS.length],
        );
      }
    }

    const plane = new THREE.PlaneGeometry(1, 1);
    const box = new THREE.BoxGeometry(1, 1, 1);
    const frameTexture = makeFrameTexture();

    // Gaslight interiors: dark by day, a dim warm glow after dusk. The frame
    // loop ramps this material with the solar night curve.
    const litMaterial = new THREE.MeshStandardMaterial({
      color: '#ffffff', emissive: '#c8873e', emissiveIntensity: 0, roughness: 0.4,
    });

    const built = [
      // Glass is a dielectric, not a half-metal. At metalness 0.55 every pane
      // carried the same dull sheen whatever angle you saw it from; at 0 the
      // Fresnel does its job, so a pane looked straight into stays dark and
      // one seen along the row flares. That difference between neighbours is
      // what reads as glass. The per-instance tint is the interior behind it.
      buildMesh(glass, plane, new THREE.MeshStandardMaterial({
        color: '#ffffff', map: makeGlassGradient(),
        metalness: 0, roughness: 0.06, envMapIntensity: 1.2,
      })),
      buildMesh(litGlass, plane, litMaterial),
      buildMesh(frames, plane, new THREE.MeshStandardMaterial({
        color: '#ffffff', map: frameTexture, alphaTest: 0.4, roughness: 0.85,
      })),
      buildMesh(trimBoxes, box, new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.9 }), true),
      buildMesh(shutters, box, new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.9 }), true),
      buildMesh(ropes, box, new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.95 })),
      buildMesh(bayBodies, box, new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.85 }), true),
      buildMesh(railings, box, new THREE.MeshStandardMaterial({
        color: '#ffffff', roughness: 0.35, metalness: 0.85, envMapIntensity: 0.8,
      })),
      buildMesh(plants, plane, new THREE.MeshStandardMaterial({
        color: '#ffffff', map: makeFoliageTexture(), alphaTest: 0.45,
        side: THREE.DoubleSide, roughness: 0.9,
      })),
      buildMesh(blooms, plane, new THREE.MeshStandardMaterial({
        color: '#ffffff', map: makeBloomTexture(), alphaTest: 0.45,
        side: THREE.DoubleSide, roughness: 0.85,
      })),
    ];
    // Cloth and canvas sway in the frame loop, so they keep their records.
    const clothMesh = buildMesh(cloths, plane, new THREE.MeshStandardMaterial({
      color: '#ffffff', roughness: 0.95, side: THREE.DoubleSide,
    }));
    const awningRedMesh = buildMesh(awningsRed, plane, new THREE.MeshStandardMaterial({
      color: '#ffffff', map: makeAwningTexture('#b5533c'), alphaTest: 0.4, side: THREE.DoubleSide, roughness: 0.9,
    }), true);
    const awningGreenMesh = buildMesh(awningsGreen, plane, new THREE.MeshStandardMaterial({
      color: '#ffffff', map: makeAwningTexture('#4f6b52'), alphaTest: 0.4, side: THREE.DoubleSide, roughness: 0.9,
    }), true);
    built.push(clothMesh, awningRedMesh, awningGreenMesh);
    const flutter = [
      { mesh: awningRedMesh, records: awningsRed, amount: 0.022 },
      { mesh: awningGreenMesh, records: awningsGreen, amount: 0.022 },
      { mesh: clothMesh, records: cloths, amount: 0.05 },
    ];
    return { built, litMaterial, flutter };
  }, [items]);

  useFrame((state) => {
    if (runtime) {
      const { night } = solarRamps(runtime.values.timeOfDay, runtime.values.dayOfYear);
      meshes.litMaterial.emissiveIntensity = night * 1.3;
    }
    // Breeze: small pitch/tilt wobble on canvas and cloth instances.
    const time = state.clock.elapsedTime;
    for (const { mesh, records, amount } of meshes.flutter) {
      records.forEach((rec, index) => {
        scratchEuler.set(
          rec.pitch + Math.sin(time * 0.9 + index * 1.7) * amount,
          rec.yaw,
          rec.tilt + Math.sin(time * 1.4 + index * 2.3) * amount * 0.7,
          'YXZ',
        );
        scratchQuat.setFromEuler(scratchEuler);
        scratchPos.set(rec.x, rec.y, rec.z);
        scratchScale.set(rec.sx, rec.sy, rec.sz);
        scratchMatrix.compose(scratchPos, scratchQuat, scratchScale);
        mesh.setMatrixAt(index, scratchMatrix);
      });
      mesh.instanceMatrix.needsUpdate = true;
    }
  });

  useEffect(
    () => () => {
      for (const mesh of meshes.built) {
        mesh.geometry.dispose();
        mesh.material.map?.dispose();
        mesh.material.dispose();
        mesh.dispose();
      }
    },
    [meshes],
  );

  return (
    <group>
      {meshes.built.map((mesh, index) => (
        <primitive key={index} object={mesh} />
      ))}
    </group>
  );
}
