import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import {
  facadeFaceRole,
  facadeLayout,
  facadeWidth,
  facadeWindowEntries,
} from '../world/facade.js';
import { solarRamps } from '../world/solar.js';
import { ALLEY_LINES } from '../world/streetGrid.js';
import { terrainHeight } from '../world/terrain.js';

// Instanced openings and window dressing over the tiled masonry: dark recesses,
// reflective glass, sash frames, sills, shutters, doors, and laundry lines. Everything is
// bucketed into a handful of InstancedMeshes, so the whole street costs
// single-digit draw calls. Positions follow facadeLayout, so the openings and
// their dressing always agree without baking them into a low-resolution map.

// Outward normal and the axis u runs along, matching BoxGeometry UVs
// (side faces mirror horizontally).
const FACES = {
  '+z': { normal: [0, 0, 1], right: [1, 0, 0], yaw: 0 },
  '-z': { normal: [0, 0, -1], right: [-1, 0, 0], yaw: Math.PI },
  '+x': { normal: [1, 0, 0], right: [0, 0, -1], yaw: Math.PI / 2 },
  '-x': { normal: [-1, 0, 0], right: [0, 0, 1], yaw: -Math.PI / 2 },
};

// Sash and stone tones per facade style (brownstone, red brick, pale stone,
// dark brownstone, marble, gray ashlar). Sashes are painted wood, dark in
// period photos; nothing here should read as metal. The rowhouse styles may
// carry shutters, while gray ashlar gets the heavier lintels seen at distance.
const FRAME_COLORS = ['#514334', '#574231', '#625745', '#44362a', '#6d6655', '#4a4841'];
const SILL_COLORS = ['#57453a', '#5e3b2e', '#726a5c', '#4c433b', '#a8a191', '#77746b'];
const SHUTTER_STYLES = new Set([0, 3, 5]);
const CLOTH_COLORS = ['#e8e2d4', '#ddd3bf', '#cfc8b8', '#8d95a8', '#b9a08a'];
const SHADE_COLORS = ['#998c75', '#8d816c', '#a99c82', '#817765'];
const CURTAIN_COLORS = ['#938671', '#827a68', '#706759', '#6d6a5c', '#806c5c'];
// Painted deal window boxes, and what was in them: geraniums above all, which
// is why the reds outnumber everything else.
const PLANTER_COLORS = ['#3f4a34', '#5a4632', '#41352a', '#4a4038'];
const BLOOM_COLORS = ['#b8392f', '#c4483a', '#a8322c', '#cf7368', '#e0d6c6'];
// Daylight windows are an opaque composite rather than transparent geometry:
// cool upper panes catch the sky while warmer lower panes imply the room. That
// preserves depth without transparency sorting or actual interior meshes.
const SKY_GLASS_TINTS = ['#58666a', '#506066', '#64706c', '#4f5d62', '#6d6c65'];
const LOWER_GLASS_TINTS = ['#525b58', '#4f5755', '#59605b', '#4b5352', '#5d5e57'];
const ROOM_GLASS_TINTS = ['#5e5a50', '#57554d', '#625d51', '#53534c', '#675f51'];
const DEEP_ROOM_TINTS = ['#494b47', '#454943', '#514d43', '#403f3a'];
const FURNITURE_COLORS = ['#302821', '#392d24', '#282622', '#423429'];
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

// One-over-one double-hung wooden sash. A broad meeting rail, its lower
// shadow, and the small sash lugs distinguish two sliding wooden frames from
// a modern metal cross. The texture is white; per-instance colour carries the
// painted wood while one instanced mesh covers every window size.
function makeFrameTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 96;
  const context = canvas.getContext('2d');
  context.clearRect(0, 0, 64, 96);
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, 64, 4);
  context.fillRect(0, 92, 64, 4);
  context.fillRect(0, 0, 4, 96);
  context.fillRect(60, 0, 4, 96);
  // The lower sash stands slightly proud of the upper: a wider meeting rail
  // and a dark line below it provide the depth cue at no geometry cost.
  context.fillRect(0, 44, 64, 7);
  context.fillRect(3, 50, 4, 8);
  context.fillRect(57, 50, 4, 8);
  context.fillStyle = 'rgba(44,35,27,0.58)';
  context.fillRect(4, 51, 56, 2);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

// Fall-off down a pane: sky caught in the top of the glass, the unlit room
// behind it toward the bottom. Multiplies the per-instance tint, so it darkens
// rather than colours.
function makeGlassGradient() {
  const canvas = document.createElement('canvas');
  canvas.width = 32;
  canvas.height = 96;
  const context = canvas.getContext('2d');
  const gradient = context.createLinearGradient(0, 0, 0, 96);
  gradient.addColorStop(0, '#e1e0da');
  gradient.addColorStop(0.42, '#c4c5c0');
  gradient.addColorStop(1, '#777b76');
  context.fillStyle = gradient;
  context.fillRect(0, 0, 32, 96);
  // A very soft, sloping sky band prevents the lower pane from reading as a
  // flat painted panel. It is deliberately broad and low contrast so the
  // shared texture does not announce its repetition across the street.
  context.fillStyle = 'rgba(245,246,238,0.075)';
  context.beginPath();
  context.moveTo(0, 17);
  context.lineTo(32, 29);
  context.lineTo(32, 42);
  context.lineTo(0, 28);
  context.closePath();
  context.fill();
  // Broad irregular streaks suggest hand-made cylinder glass. They alter the
  // caught sky by only a few percent, avoiding a noisy or frosted appearance.
  for (let line = 0; line < 5; line += 1) {
    const x = 3 + line * 7 + hash01(line * 4.7) * 2;
    context.strokeStyle = line % 2 === 0
      ? 'rgba(255,252,242,0.055)'
      : 'rgba(35,39,37,0.035)';
    context.lineWidth = 2.5 + hash01(line * 8.3) * 1.5;
    context.beginPath();
    context.moveTo(x, 0);
    context.bezierCurveTo(x - 2, 24, x + 2, 64, x - 1, 96);
    context.stroke();
  }
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
    const openings = [];
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
      if (item.landmarkModel) continue;
      const faces = item.windowFaces ?? [];
      if (faces.length === 0) continue;
      const seed = idHash(item.id);
      const style = item.facadeStyle ?? seed % 4;
      const [cx, cy, cz] = item.position;
      const [sx, sy, sz] = item.size;
      const frameColor = FRAME_COLORS[style % FRAME_COLORS.length];
      const sillColor = SILL_COLORS[style % SILL_COLORS.length];
      const canShutter = SHUTTER_STYLES.has(style);
      const hotel = style === 1 || style === 2;

      faces.forEach((token, faceIndex) => {
        const face = FACES[token];
        if (!face) return;
        const faceRole = facadeFaceRole(item, token, faceIndex);
        const streetFront = faceRole === 'front';
        const serviceFace = faceRole === 'rear' || faceRole === 'end';
        const ornateFace = !serviceFace;
        const faceWidth = facadeWidth(item.size, token);
        const layout = facadeLayout(faceWidth, sy);
        const halfDepth = (token === '+z' || token === '-z' ? sz : sx) / 2;
        const place = (u, vPx, out) => [
          cx + face.right[0] * (u - 0.5) * faceWidth + face.normal[0] * (halfDepth + out),
          cy + sy / 2 - (vPx / layout.texH) * sy,
          cz + face.right[2] * (u - 0.5) * faceWidth + face.normal[2] * (halfDepth + out),
        ];

        // One column may carry a projecting oriel bay instead of flat windows.
        const bayRoll = hash01(seed * 0.51 + faceIndex * 3.3);
        const bayCol =
          ornateFace && canShutter && faceWidth > 6.4 && layout.cols >= 3 && bayRoll < 0.3
            ? (bayRoll < 0.15 ? 0 : layout.cols - 1)
            : -1;

        const windows = facadeWindowEntries(layout, faceRole);
        for (const win of windows) {
          const upperFloor = win.floor !== undefined;
          if (upperFloor && win.col === bayCol) continue;
          const u = (win.x + win.w / 2) / layout.texW;
          const wM = (win.w / layout.texW) * faceWidth;
          const hM = (win.h / layout.texH) * sy;
          const roll = hash01(seed * 0.013 + faceIndex * 19.3 + (win.floor ?? -1) * 3.7 + win.col * 7.1);

          const shuttered = ornateFace && canShutter && upperFloor && roll < 0.22;
          const shutClosed = shuttered && roll < 0.08;
          const openSash = upperFloor && !shutClosed && roll > 0.34 && roll < 0.5;
          const lit = !shutClosed && hash01(seed + win.col * 11.7 + (win.floor ?? 9) * 5.3) < (hotel ? 0.1 : 0.05);
          const shadeRoll = hash01(seed * 0.59 + faceIndex * 13.7 + (win.floor ?? 8) * 4.1 + win.col * 6.3);
          const roomRoll = hash01(seed * 0.83 + faceIndex * 8.9 + (win.floor ?? 5) * 6.1 + win.col * 2.7);

          // Glass and its frame share one splay, so the sash stays a sash.
          const skewTilt = (hash01(seed * 3.1 + win.col * 4.7 + (win.floor ?? 0) * 9.1) - 0.5) * SASH_SKEW;
          const skewPitch = (hash01(seed * 5.9 + win.col * 2.3 + (win.floor ?? 0) * 6.7) - 0.5) * SASH_SKEW;

          // A full dark recess remains behind the glass. It is especially
          // important beneath an open sash, where tiled masonry must not show
          // through the uncovered half of the opening.
          pushInstance(
            openings, ...place(u, win.y + win.h / 2, 0.014),
            face.yaw, wM * 1.08, hM * 1.06, 1,
            jitterColor('#10110f', seed + win.col * 9 + (win.floor ?? 0), 0.025),
          );

          // Glass is an opaque composite: a cool sky catch above and a warmer
          // or deeper room tone below. Because both halves remain in the same
          // instanced draw, this adds no material or transparency cost.
          const target = lit ? litGlass : glass;
          const tintIndex = Math.floor(roll * 71);
          const upperTint = jitterColor(
            SKY_GLASS_TINTS[tintIndex % SKY_GLASS_TINTS.length],
            seed + win.col * 5 + (win.floor ?? 0),
            0.08,
          );
          const roomPalette = roomRoll < 0.3
            ? ROOM_GLASS_TINTS
            : roomRoll > 0.86
              ? DEEP_ROOM_TINTS
              : LOWER_GLASS_TINTS;
          const lowerTint = jitterColor(
            roomPalette[(tintIndex + (win.floor ?? 2)) % roomPalette.length],
            seed + win.col * 3 + (win.floor ?? 4) * 7,
            0.09,
          );
          if (openSash) {
            const [ox, oy, oz] = place(u, win.y + win.h * 0.26, 0.045);
            pushInstance(target, ox, oy, oz, face.yaw, wM * 0.96, hM * 0.5, 1, upperTint, skewTilt, skewPitch);
          } else if (!shutClosed) {
            // The lower sash sits a little farther out than the upper. Two
            // planes remain in the same glass draw call but give the meeting
            // rail the characteristic double-hung depth change.
            const [ux, uy, uz] = place(u, win.y + win.h * 0.25, 0.03);
            const [lx, ly, lz] = place(u, win.y + win.h * 0.75, 0.044);
            pushInstance(target, ux, uy, uz, face.yaw, wM * 0.96, hM * 0.48, 1, upperTint, skewTilt, skewPitch);
            pushInstance(target, lx, ly, lz, face.yaw, wM * 0.96, hM * 0.48, 1, lowerTint, skewTilt, skewPitch);
          }

          // Sash frame overlay.
          if (!shutClosed) {
            pushInstance(frames, ...place(u, win.y + win.h / 2, 0.06), face.yaw, wM * 1.08, hM * 1.04, 1, jitterColor(frameColor, seed + win.col, 0.06), skewTilt, skewPitch);
          }

          // Opaque dressing cards sit just in front of the composite glass and
          // behind the sash. They use the existing opening plane bucket: no
          // new draw call, no alpha blending, and no shadow-pass geometry.
          if (upperFloor && !openSash && !shutClosed && shadeRoll < 0.18) {
            const shadeRatio = 0.24 + hash01(seed * 1.81 + win.col * 3.9 + win.floor) * 0.38;
            const shadeH = hM * shadeRatio;
            const shadeMid = win.y + win.h * shadeRatio * 0.5;
            const shadeColor = jitterColor(
              SHADE_COLORS[Math.floor(shadeRoll * 101) % SHADE_COLORS.length],
              seed + win.col * 5.7 + win.floor,
              0.05,
            );
            pushInstance(
              openings, ...place(u, shadeMid, 0.052),
              face.yaw, wM * 0.88, shadeH, 1, shadeColor,
            );
            pushInstance(
              trimBoxes, ...place(u, win.y + win.h * shadeRatio, 0.064),
              face.yaw, wM * 0.91, 0.025, 0.025, jitterColor('#675945', seed + win.col, 0.04),
            );
          } else if (!openSash && !shutClosed) {
            const curtainRoll = hash01(seed * 1.17 + faceIndex * 17.3 + (win.floor ?? 3) * 2.3 + win.col * 9.7);
            if (curtainRoll < 0.3) {
              const curtainColor = jitterColor(
                CURTAIN_COLORS[Math.floor(curtainRoll * 113) % CURTAIN_COLORS.length],
                seed + win.col * 4.9 + (win.floor ?? 1),
                0.07,
              );
              for (const side of [-1, 1]) {
                // Occasionally leave one side drawn farther back to prevent a
                // repeated pair-of-stripes pattern along an entire facade.
                const sideRoll = hash01(seed * 2.21 + faceIndex * 5.1 + win.col * 3.7 + side * 1.9);
                if (side === 1 && sideRoll > 0.82) continue;
                const widthRatio = 0.065 + sideRoll * 0.055;
                const heightRatio = 0.76 + hash01(seed + side * 7.3 + (win.floor ?? 2)) * 0.2;
                const sideOffset = side * wM * (0.47 - widthRatio / 2);
                const curtainU = u + sideOffset / faceWidth;
                const curtainMid = win.y + win.h * heightRatio * 0.5;
                pushInstance(
                  openings, ...place(curtainU, curtainMid, 0.052),
                  face.yaw, wM * widthRatio, hM * heightRatio, 1, curtainColor,
                );
              }
            }

            // A low, irregular silhouette in a few lower panes suggests a
            // table, chair back, or cabinet without claiming a literal room.
            const furnitureRoll = hash01(seed * 1.93 + faceIndex * 4.7 + (win.floor ?? 6) * 8.3 + win.col * 5.9);
            if (furnitureRoll < 0.14) {
              const furnitureW = wM * (0.28 + furnitureRoll * 2.2);
              const furnitureH = hM * (0.045 + hash01(seed + win.col * 11.1) * 0.045);
              const furnitureSide = hash01(seed * 3.7 + win.col) < 0.5 ? -1 : 1;
              const furnitureOffset = furnitureSide * wM * (0.23 - furnitureRoll * 0.5);
              const furnitureU = u + furnitureOffset / faceWidth;
              const furnitureY = win.y + win.h * (0.81 + hash01(seed + win.col * 2.1) * 0.08);
              pushInstance(
                openings, ...place(furnitureU, furnitureY, 0.051),
                face.yaw, furnitureW, furnitureH, 1,
                jitterColor(
                  FURNITURE_COLORS[Math.floor(furnitureRoll * 101) % FURNITURE_COLORS.length],
                  seed + win.col,
                  0.035,
                ),
              );
            }
          }

          // Projecting stone sill and the heavier hood lintel above.
          if (upperFloor) {
            const [lx, ly, lz] = place(u, win.y + win.h + 3, 0.08);
            pushInstance(
              trimBoxes, lx, ly, lz, face.yaw,
              wM * (serviceFace ? 1.08 : 1.2), serviceFace ? 0.07 : 0.1,
              serviceFace ? 0.1 : 0.16, sillColor,
            );
            const [hx, hy, hz] = place(u, win.y - 4, 0.09);
            const strongBrownstoneLintel = streetFront && (style === 0 || style === 3 || style === 5);
            pushInstance(
              trimBoxes, hx, hy, hz, face.yaw,
              wM * (serviceFace ? 1.1 : strongBrownstoneLintel ? 1.48 : 1.35),
              serviceFace ? 0.075 : strongBrownstoneLintel ? 0.24 : 0.14,
              serviceFace ? 0.11 : strongBrownstoneLintel ? 0.23 : 0.18,
              sillColor,
            );
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
              pushInstance(shutters, ...place(u, win.y + 3, 0.09), face.yaw, wM * 1.16, 0.1, 0.11, jitterColor('#b8a58d', seed + win.col, 0.08));
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
          if (ornateFace && upperFloor && !shutClosed && !awninged && boxRoll < 0.17) {
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
          if (openSash && hash01(seed * 1.37 + win.col * 6.1 + (win.floor ?? 0) * 2.9) < 0.38) {
            const lean = (hash01(seed * 2.9 + win.col * 1.7) - 0.5) * 0.6;
            const [qx, qy, qz] = place(u + (lean * wM * 0.16) / faceWidth, win.y + win.h * 0.72, 0.035);
            pushInstance(
              cloths, qx, qy, qz, face.yaw,
              wM * (0.36 + hash01(seed + win.col * 4.1) * 0.18), hM * 0.4, 1,
              jitterColor('#b9ad96', seed + win.col * 2.7, 0.07), lean * 0.14,
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
            const tint = jitterColor(SKY_GLASS_TINTS[(seed + win.floor) % SKY_GLASS_TINTS.length], seed * 3 + win.floor, 0.1);
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
        if (canShutter && streetFront) {
          const door = layout.ground.find((win) => win.isDoor);
          const doorU = door ? (door.x + door.w / 2) / layout.texW : 0.5;
          const gapU = door ? (((door.doorW ?? door.w) / layout.texW) * 1.6) : 0;
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
        if (ornateFace) {
          const brackets = Math.max(3, Math.round(faceWidth / 1.15));
          for (let b = 0; b < brackets; b += 1) {
            const [bx, by, bz] = place((b + 0.5) / brackets, 17, 0.13);
            pushInstance(trimBoxes, bx, by, bz, face.yaw, 0.14, 0.4, 0.26, sillColor);
          }
        }

        // A real, narrow string course marks each upper storey on stone
        // facades. The old atlas drew several-pixel bands that became roughly
        // thirty centimetres tall close up; these remain about ten centimetres
        // in world space at every distance.
        if (ornateFace && style !== 1) {
          for (let floor = 1; floor < layout.floors - 1; floor += 1) {
            const courseY = 26 + floor * layout.unit - 10;
            pushInstance(
              trimBoxes, ...place(0.5, courseY, 0.055),
              face.yaw, faceWidth, 0.1, 0.12, sillColor,
            );
          }
        }

        // Entrance on the street face: brownstone rows get a high stoop with
        // cheek walls; the landmarks get a low platform. Both get a stone
        // door surround.
        if (streetFront) {
          const door = layout.ground.find((win) => win.isDoor);
          if (door) {
            const uDoor = (door.x + door.w / 2) / layout.texW;
            const doorW = ((door.doorW ?? door.w) / layout.texW) * faceWidth;
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
            const [dx, , dz] = place(uDoor, 0, 0.025);
            const doorColor = jitterColor('#35261d', seed * 4.7, 0.08);
            pushInstance(openings, dx, doorBase + pilasterH / 2, dz, face.yaw, doorW, pilasterH, 1, doorColor);

            // Shallow rails and stiles keep the entrance readable at close
            // range without adding a door material or draw call.
            const panelColor = jitterColor(frameColor, seed * 6.1, 0.05);
            for (const y of [0.22, 0.5, 0.78]) {
              const [rx, , rz] = place(uDoor, 0, 0.075);
              pushInstance(trimBoxes, rx, doorBase + pilasterH * y, rz, face.yaw, doorW * 0.78, 0.055, 0.055, panelColor);
            }
            for (const side of [-1, 1]) {
              const uPanel = uDoor + (side * doorW * 0.34) / faceWidth;
              const [px, , pz] = place(uPanel, 0, 0.075);
              pushInstance(trimBoxes, px, doorBase + pilasterH / 2, pz, face.yaw, 0.055, pilasterH * 0.72, 0.055, panelColor);
            }
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
        if (item.laundry && streetFront && layout.cols >= 3) {
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
    const glassTexture = makeGlassGradient();

    // Gaslight interiors: dark by day, a dim warm glow after dusk. The frame
    // loop ramps this material with the solar night curve.
    const litMaterial = new THREE.MeshStandardMaterial({
      color: '#ffffff', map: glassTexture, emissive: '#c8873e', emissiveIntensity: 0,
      metalness: 0, roughness: 0.18, envMapIntensity: 0.58,
    });

    const built = [
      buildMesh(openings, plane, new THREE.MeshStandardMaterial({
        color: '#ffffff', roughness: 1, metalness: 0, envMapIntensity: 0,
      })),
      // Glass is a dielectric, not a half-metal. At metalness 0.55 every pane
      // carried the same dull sheen whatever angle you saw it from; at 0 the
      // Fresnel does its job, so a pane looked straight into stays dark and
      // one seen along the row flares. That difference between neighbours is
      // what reads as glass. The per-instance tint is the interior behind it.
      buildMesh(glass, plane, new THREE.MeshStandardMaterial({
        color: '#ffffff', map: glassTexture,
        metalness: 0, roughness: 0.18, envMapIntensity: 0.58,
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
      const disposedTextures = new Set();
      for (const mesh of meshes.built) {
        mesh.geometry.dispose();
        if (mesh.material.map && !disposedTextures.has(mesh.material.map)) {
          disposedTextures.add(mesh.material.map);
          mesh.material.map.dispose();
        }
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
