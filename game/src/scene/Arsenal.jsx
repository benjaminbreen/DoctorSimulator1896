import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import {
  ARSENAL, WIDTH, LENGTH, PLINTH, WALL_TOP, TOWER_TOP, TOWERS, STOOP_STEPS,
  bodyWindows, towerWindows, arsenalColliders,
} from '../world/arsenal.js';
import { identifyLandmark } from '../world/landmarkInformation.js';
import { PARK_LANDMARKS } from '../world/parkLandmarks.js';
import { instanced } from './lib/instances.js';
import StaticColliders from './lib/StaticColliders.jsx';

// The 1896 Arsenal from world/arsenal.js: pale walls "painted in imitation of
// granite", ivy over most of them, low caps on the towers, and the Weather
// Bureau's lattice tower with a turning anemometer and the 44-star flag.

const WALL_TILE = 3;
const IVY_TILE = 2;

function seededRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function canvas(width, height) {
  const element = document.createElement('canvas');
  element.width = width;
  element.height = height;
  return [element, element.getContext('2d')];
}

// Scored stucco: pale grey with ashlar lines and weather staining.
function wallTexture() {
  const [element, g] = canvas(512, 512);
  const random = seededRandom(1848);
  g.fillStyle = '#b8b4aa';
  g.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 900; i += 1) {
    const shade = 150 + Math.floor(random() * 50);
    g.fillStyle = `rgba(${shade},${shade - 3},${shade - 10},0.18)`;
    g.fillRect(random() * 512, random() * 512, 4 + random() * 40, 2 + random() * 14);
  }
  g.strokeStyle = 'rgba(80,76,68,0.35)';
  g.lineWidth = 2;
  const course = 512 / 5;
  for (let row = 0; row < 5; row += 1) {
    g.beginPath();
    g.moveTo(0, row * course);
    g.lineTo(512, row * course);
    g.stroke();
    for (let x = (row % 2) * 128; x < 512; x += 256) {
      g.beginPath();
      g.moveTo(x, row * course);
      g.lineTo(x, (row + 1) * course);
      g.stroke();
    }
  }
  const texture = new THREE.CanvasTexture(element);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

// A tile of overlapping ivy leaves on a clear ground.
function ivyTexture() {
  const [element, g] = canvas(512, 512);
  const random = seededRandom(1869);
  const leaf = (x, y, r, angle, color) => {
    g.save();
    g.translate(x, y);
    g.rotate(angle);
    g.fillStyle = color;
    g.beginPath();
    // Three lobes and a point, near enough to Boston ivy at this size.
    g.arc(-r * 0.45, 0, r * 0.55, 0, Math.PI * 2);
    g.arc(r * 0.45, 0, r * 0.55, 0, Math.PI * 2);
    g.arc(0, -r * 0.5, r * 0.6, 0, Math.PI * 2);
    g.moveTo(-r * 0.8, r * 0.1);
    g.lineTo(0, r * 1.05);
    g.lineTo(r * 0.8, r * 0.1);
    g.fill();
    g.restore();
  };
  for (let i = 0; i < 2600; i += 1) {
    const x = random() * 512;
    const y = random() * 512;
    const r = 7 + random() * 9;
    const light = random();
    const color = `rgb(${30 + light * 46},${46 + light * 46},${22 + light * 18})`;
    // Draw near the edges twice so the tile wraps cleanly.
    for (const dx of [-512, 0, 512]) {
      for (const dy of [-512, 0, 512]) {
        if (x + dx < -20 || x + dx > 532 || y + dy < -20 || y + dy > 532) continue;
        leaf(x + dx, y + dy, r, random() * Math.PI * 2, color);
      }
    }
  }
  const texture = new THREE.CanvasTexture(element);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

// Where the ivy grows on one face: up from the ground in ragged columns,
// thinning toward the cornice, kept off most of the window glass.
function ivyMask(width, height, holes, seed, reach = 0.85) {
  const scale = 24; // pixels per metre
  const [element, g] = canvas(Math.ceil(width * scale), Math.ceil(height * scale));
  const random = seededRandom(seed);
  g.fillStyle = '#fff';
  for (let x = 0; x < width; x += 0.25) {
    const top = height * (reach - 0.35 + 0.35 * Math.sin(x * 0.9 + seed) * Math.sin(x * 0.37 + seed * 2) + random() * 0.25);
    for (let y = 0; y < Math.max(0.5, top); y += 0.3) {
      const r = (0.35 + random() * 0.4) * scale;
      g.beginPath();
      g.arc(x * scale, element.height - y * scale, r, 0, Math.PI * 2);
      g.fill();
    }
  }
  // Most windows are kept clear; a few have ivy creeping over the frame.
  g.globalCompositeOperation = 'destination-out';
  for (const { u, v, w, h } of holes) {
    const inset = random() < 0.3 ? -0.15 : 0.08;
    g.fillRect((u - w / 2 - inset) * scale, element.height - (v + h + inset) * scale, (w + inset * 2) * scale, (h + inset * 2) * scale);
  }
  const texture = new THREE.CanvasTexture(element);
  return texture;
}

// UVs from local position, so courses run on across neighbouring pieces.
function worldUvs(geometry, tile) {
  const position = geometry.attributes.position;
  const normal = geometry.attributes.normal;
  const uv = new Float32Array(position.count * 2);
  for (let i = 0; i < position.count; i += 1) {
    const [x, y, z] = [position.getX(i), position.getY(i), position.getZ(i)];
    const [nx, ny, nz] = [normal.getX(i), normal.getY(i), normal.getZ(i)];
    let u = x;
    let v = y;
    if (Math.abs(ny) > 0.7) v = z;
    else if (Math.abs(nx) > Math.abs(nz)) u = z;
    uv[i * 2] = u / tile;
    uv[i * 2 + 1] = v / tile;
  }
  geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return geometry;
}

// A low hipped roof over the body, ridge running north-south.
function hipRoof(width, length, eaveY, rise, overhang) {
  const hx = width / 2 + overhang;
  const hz = length / 2 + overhang;
  const ridge = hz - hx;
  const top = eaveY + rise;
  const a = [-hx, eaveY, -hz];
  const b = [hx, eaveY, -hz];
  const c = [hx, eaveY, hz];
  const d = [-hx, eaveY, hz];
  const n = [0, top, -ridge];
  const s = [0, top, ridge];
  const triangles = [
    [a, n, b], [d, c, s], // hips at the ends
    [b, n, s], [b, s, c], // east slope
    [a, d, s], [a, s, n], // west slope
  ];
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(triangles.flat(2), 3));
  geometry.computeVertexNormals();
  return geometry;
}

// The 44-star flag: Wyoming's star (1890) was the newest until Utah's was
// added on 4 July 1896, three weeks after the game opens. Rows of 8-7-7-7-7-8.
function flagTexture() {
  const [element, g] = canvas(380, 200);
  for (let stripe = 0; stripe < 13; stripe += 1) {
    g.fillStyle = stripe % 2 ? '#f4f0e6' : '#b22234';
    g.fillRect(0, (stripe * 200) / 13, 380, 200 / 13 + 1);
  }
  const unionW = 152;
  const unionH = (200 * 7) / 13;
  g.fillStyle = '#3c3b6e';
  g.fillRect(0, 0, unionW, unionH);
  g.fillStyle = '#f4f0e6';
  const rows = [8, 7, 7, 7, 7, 8];
  rows.forEach((count, row) => {
    for (let i = 0; i < count; i += 1) {
      const x = ((i + 0.5) * unionW) / count;
      const y = ((row + 0.5) * unionH) / rows.length;
      g.beginPath();
      for (let p = 0; p < 10; p += 1) {
        const r = p % 2 ? 2.2 : 5.2;
        const angle = (p * Math.PI) / 5 - Math.PI / 2;
        g.lineTo(x + Math.cos(angle) * r, y + Math.sin(angle) * r);
      }
      g.fill();
    }
  });
  const texture = new THREE.CanvasTexture(element);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

// Face placement for body windows and ivy: centre, outward normal, along axis.
const FACES = {
  w: { c: [-WIDTH / 2, 0], n: [-1, 0], a: [0, 1], span: LENGTH },
  e: { c: [WIDTH / 2, 0], n: [1, 0], a: [0, -1], span: LENGTH },
  n: { c: [0, -LENGTH / 2], n: [0, -1], a: [-1, 0], span: WIDTH },
  s: { c: [0, LENGTH / 2], n: [0, 1], a: [1, 0], span: WIDTH },
};

function buildArsenal() {
  const resources = [];
  const keep = (...items) => {
    resources.push(...items);
    return items[0];
  };
  const wallMap = keep(wallTexture());
  const wall = keep(new THREE.MeshStandardMaterial({ map: wallMap, roughness: 0.92, color: '#e4e0d6' }));
  const trim = keep(new THREE.MeshStandardMaterial({ color: '#d7d1c2', roughness: 0.85 }));
  const plinthStone = keep(new THREE.MeshStandardMaterial({ map: wallMap, color: '#9a968c', roughness: 0.95 }));
  const glass = keep(new THREE.MeshStandardMaterial({ color: '#1d2427', roughness: 0.2, metalness: 0.1 }));
  const sash = keep(new THREE.MeshStandardMaterial({ color: '#e9e4d6', roughness: 0.7 }));
  const roofing = keep(new THREE.MeshStandardMaterial({ color: '#4c4f52', roughness: 0.75, metalness: 0.2 }));
  const iron = keep(new THREE.MeshStandardMaterial({ color: '#25282a', roughness: 0.5, metalness: 0.5 }));
  const door = keep(new THREE.MeshStandardMaterial({ color: '#3b2b1f', roughness: 0.7 }));
  const unit = keep(new THREE.BoxGeometry(1, 1, 1));
  const meshes = [];

  // Walls: body, plinth, and towers merged into two meshes.
  const body = new THREE.BoxGeometry(WIDTH, WALL_TOP + 1, LENGTH).translate(0, (WALL_TOP + 1) / 2 - 1, 0);
  const towers = TOWERS.map((t) => new THREE.CylinderGeometry(t.r, t.r, TOWER_TOP + 1, 8).translate(t.x, (TOWER_TOP + 1) / 2 - 1, t.z));
  const walls = keep(worldUvs(mergeGeometries([body.toNonIndexed(), ...towers.map((t) => t.toNonIndexed())]), WALL_TILE));
  meshes.push(new THREE.Mesh(walls, wall));
  const plinth = keep(worldUvs(mergeGeometries([
    new THREE.BoxGeometry(WIDTH + 0.3, PLINTH + 1, LENGTH + 0.3).translate(0, (PLINTH + 1) / 2 - 1, 0).toNonIndexed(),
    ...TOWERS.map((t) => new THREE.CylinderGeometry(t.r + 0.15, t.r + 0.15, PLINTH + 1, 8).translate(t.x, (PLINTH + 1) / 2 - 1, t.z).toNonIndexed()),
  ]), WALL_TILE));
  meshes.push(new THREE.Mesh(plinth, plinthStone));

  // Cornice and string courses: thin slabs proud of the walls and towers.
  const bands = [];
  for (const [y, h, out] of [[WALL_TOP - 0.1, 0.35, 0.28], [PLINTH, 0.14, 0.08]]) {
    bands.push(new THREE.BoxGeometry(WIDTH + out * 2, h, LENGTH + out * 2).translate(0, y, 0));
  }
  for (const t of TOWERS) {
    bands.push(new THREE.CylinderGeometry(t.r + 0.3, t.r + 0.2, 0.4, 8).translate(t.x, TOWER_TOP - 0.15, t.z));
    bands.push(new THREE.CylinderGeometry(t.r + 0.1, t.r + 0.1, 0.16, 8).translate(t.x, WALL_TOP - 0.1, t.z));
  }
  meshes.push(new THREE.Mesh(keep(mergeGeometries(bands.map((b) => b.toNonIndexed()))), trim));

  // Roofs: the body's low hip, and an octagonal cap with a finial per tower.
  const caps = [hipRoof(WIDTH, LENGTH, WALL_TOP + 0.05, 1.3, 0.35)];
  for (const t of TOWERS) {
    caps.push(new THREE.CylinderGeometry(0.12, t.r + 0.45, 0.85, 8).translate(t.x, TOWER_TOP + 0.47, t.z).toNonIndexed());
    caps.push(new THREE.SphereGeometry(0.13, 8, 6).translate(t.x, TOWER_TOP + 1.0, t.z).toNonIndexed());
  }
  for (const geometry of caps) geometry.deleteAttribute('uv');
  meshes.push(new THREE.Mesh(keep(mergeGeometries(caps)), roofing));

  // Windows: glass, a stone sill and lintel, and a sash frame with glazing bars.
  const glassBoxes = [];
  const trimBoxes = [];
  const sashBoxes = [];
  const place = (cx, cz, nx, nz, y, w, h) => {
    const yaw = Math.atan2(nx, nz);
    const at = (out, dy) => [cx + nx * out, y + dy, cz + nz * out];
    glassBoxes.push({ p: at(0.01, h / 2), r: [0, yaw, 0], s: [w, h, 0.04] });
    trimBoxes.push({ p: at(0.06, -0.05), r: [0, yaw, 0], s: [w + 0.2, 0.1, 0.14] });
    trimBoxes.push({ p: at(0.04, h + 0.1), r: [0, yaw, 0], s: [w + 0.24, 0.2, 0.08] });
    if (h > 0.6) {
      sashBoxes.push({ p: at(0.04, h / 2), r: [0, yaw, 0], s: [0.05, h, 0.03] });
      sashBoxes.push({ p: at(0.04, h / 2), r: [0, yaw, 0], s: [w, 0.06, 0.03] });
    }
  };
  const ivyHoles = { w: [], e: [], n: [], s: [] };
  for (const win of bodyWindows()) {
    const face = FACES[win.face];
    place(face.c[0] + face.a[0] * win.along, face.c[1] + face.a[1] * win.along, face.n[0], face.n[1], win.y, win.w, win.h);
    ivyHoles[win.face].push({ u: win.along + face.span / 2, v: win.y, w: win.w, h: win.h });
  }
  const towerHoles = TOWERS.map(() => []);
  TOWERS.forEach((t, index) => {
    const apothem = t.r * Math.cos(Math.PI / 8);
    for (const win of towerWindows(t)) {
      const angle = (win.face + 0.5) * Math.PI / 4;
      const [nx, nz] = [Math.sin(angle), Math.cos(angle)];
      place(t.x + nx * apothem, t.z + nz * apothem, nx, nz, win.y, win.w, win.h);
      towerHoles[index].push({ face: win.face, v: win.y, w: win.w, h: win.h });
    }
  });
  meshes.push(instanced(unit, glass, glassBoxes), instanced(unit, trim, trimBoxes), instanced(unit, sash, sashBoxes, { cast: false }));

  // The west entrance: door, a stone hood, and the stoop with iron rails.
  const doorBoxes = [{ p: [-WIDTH / 2 - 0.02, PLINTH + 1.25, 0], s: [0.06, 2.5, 1.3] }];
  const stoneBoxes = [
    { p: [-WIDTH / 2 - 0.12, PLINTH + 2.7, 0], s: [0.3, 0.3, 1.9] },
    // The carved panel over the door, where the eagle and cannonballs are.
    { p: [-WIDTH / 2 - 0.05, PLINTH + 3.15, 0], s: [0.1, 0.55, 1.2] },
    { p: [-WIDTH / 2 - 0.65, PLINTH - 0.08, 0], s: [1.3, 0.16, 2.4] },
  ];
  for (let i = 1; i <= STOOP_STEPS; i += 1) {
    const top = PLINTH - (i * PLINTH) / (STOOP_STEPS + 1);
    stoneBoxes.push({ p: [-WIDTH / 2 - 1.3 - (i - 0.5) * 0.32, top - 0.5, 0], s: [0.34, 1, 2.4] });
  }
  const railBoxes = [];
  for (const side of [-1, 1]) {
    const z = side * 1.12;
    for (const [x, y] of [[-WIDTH / 2 - 0.1, PLINTH], [-WIDTH / 2 - 1.3, PLINTH], [-WIDTH / 2 - 2.6, 0.2]]) {
      railBoxes.push({ p: [x, y + 0.45, z], s: [0.05, 0.9, 0.05] });
    }
    railBoxes.push({ p: [-WIDTH / 2 - 0.7, PLINTH + 0.9, z], s: [1.2, 0.04, 0.04] });
    const run = Math.hypot(1.3, PLINTH - 0.2);
    railBoxes.push({ p: [-WIDTH / 2 - 1.95, (PLINTH + 0.2) / 2 + 0.9, z], r: [0, 0, Math.atan2(PLINTH - 0.2, 1.3)], s: [run, 0.04, 0.04] });
  }
  meshes.push(instanced(unit, door, doorBoxes), instanced(unit, trim, stoneBoxes), instanced(unit, iron, railBoxes));

  // Ivy: a leaf tile masked per face, held just off the wall.
  const ivyLeaves = keep(ivyTexture());
  const ivyMaterial = (width, height, holes, seed, reach) => {
    const map = ivyLeaves.clone();
    map.repeat.set(width / IVY_TILE, height / IVY_TILE);
    map.needsUpdate = true;
    const mask = ivyMask(width, height, holes, seed, reach);
    // The leaf tile doubles as a bump map so the mat of leaves has relief.
    return keep(new THREE.MeshStandardMaterial({
      map, bumpMap: map, bumpScale: 2.5, alphaMap: mask, alphaTest: 0.5, roughness: 0.7, side: THREE.DoubleSide,
    }), map, mask);
  };
  Object.entries(FACES).forEach(([key, face], index) => {
    const height = WALL_TOP - 0.3;
    const geometry = keep(new THREE.PlaneGeometry(face.span, height));
    const mesh = new THREE.Mesh(geometry, ivyMaterial(face.span, height, ivyHoles[key], index * 7 + 3, 0.75));
    mesh.position.set(face.c[0] + face.n[0] * 0.05, height / 2, face.c[1] + face.n[1] * 0.05);
    mesh.rotation.y = Math.atan2(face.n[0], face.n[1]);
    mesh.receiveShadow = true;
    meshes.push(mesh);
  });
  TOWERS.forEach((t, index) => {
    const height = TOWER_TOP - 0.4;
    const r = t.r + 0.06;
    const around = r * 2 * Math.sin(Math.PI / 8) * 8;
    // Cylinder u runs around from face 0; window holes are placed per face.
    const holes = towerHoles[index].map((hole) => ({ u: ((hole.face + 0.5) / 8) * around, v: hole.v, w: hole.w, h: hole.h }));
    const geometry = keep(new THREE.CylinderGeometry(r, r, height, 8, 1, true));
    // Some towers are thick with it to the cap, others only half clad.
    const mesh = new THREE.Mesh(geometry, ivyMaterial(around, height, holes, index * 13 + 5, [1.0, 0.6, 0.95, 0.75, 0.9, 1.0, 0.55, 0.85][index]));
    mesh.position.set(t.x, height / 2, t.z);
    mesh.receiveShadow = true;
    meshes.push(mesh);
  });

  for (const mesh of meshes) {
    // Ivy casts no shadow of its own; the wall behind it already does.
    if (!mesh.material.alphaMap) mesh.castShadow = true;
    mesh.receiveShadow = true;
  }
  return { meshes, resources };
}

// Weather Bureau instruments on the roof: a lattice tower carrying a cup
// anemometer and a vane, and the flagstaff beside it.
function RoofInstruments() {
  const cups = useRef();
  const vane = useRef();
  const flag = useRef();
  const built = useMemo(() => {
    const iron = new THREE.MeshStandardMaterial({ color: '#2a2c2e', roughness: 0.55, metalness: 0.4 });
    const pole = new THREE.MeshStandardMaterial({ color: '#d9d4c6', roughness: 0.6 });
    const flagMap = flagTexture();
    const cloth = new THREE.MeshStandardMaterial({ map: flagMap, side: THREE.DoubleSide, roughness: 0.9 });
    const unit = new THREE.BoxGeometry(1, 1, 1);
    const lattice = [];
    const size = 1.6;
    const height = 3.2;
    for (const x of [-1, 1]) {
      for (const z of [-1, 1]) lattice.push({ p: [(x * size) / 2, height / 2, (z * size) / 2], s: [0.07, height, 0.07] });
    }
    for (const y of [0.9, 2.0, height]) {
      for (const [x, z, sx, sz] of [[0, -1, size, 0.05], [0, 1, size, 0.05], [-1, 0, 0.05, size], [1, 0, 0.05, size]]) {
        lattice.push({ p: [(x * size) / 2, y, (z * size) / 2], s: [sx, 0.05, sz] });
      }
    }
    // Cross bracing on each side.
    for (const [x, z, yaw] of [[0, -1, 0], [0, 1, 0], [-1, 0, Math.PI / 2], [1, 0, Math.PI / 2]]) {
      for (const [y0, y1] of [[0, 0.9], [0.9, 2.0], [2.0, height]]) {
        const length = Math.hypot(size, y1 - y0);
        const tilt = Math.atan2(y1 - y0, size);
        for (const sign of [-1, 1]) {
          lattice.push({ p: [(x * size) / 2, (y0 + y1) / 2, (z * size) / 2], r: [0, yaw, sign * tilt], s: [length, 0.035, 0.035] });
        }
      }
    }
    lattice.push({ p: [0, height + 0.05, 0], s: [size + 0.3, 0.08, size + 0.3] });
    lattice.push({ p: [0, height + 0.9, 0], s: [0.05, 1.7, 0.05] });
    const cupArms = [];
    for (let i = 0; i < 4; i += 1) {
      const angle = (i * Math.PI) / 2;
      cupArms.push({ p: [Math.cos(angle) * 0.25, 0, Math.sin(angle) * 0.25], r: [0, -angle, 0], s: [0.5, 0.02, 0.02] });
    }
    const cupGeometry = new THREE.SphereGeometry(0.07, 8, 6, 0, Math.PI);
    const vaneBoxes = [{ p: [0.25, 0, 0], s: [0.7, 0.02, 0.02] }, { p: [0.55, 0, 0], s: [0.04, 0.18, 0.25] }, { p: [-0.12, 0, 0], s: [0.12, 0.05, 0.05] }];
    const flagGeometry = new THREE.PlaneGeometry(1.9, 1.0, 16, 6).translate(0.95, -0.5, 0);
    flagGeometry.userData.rest = flagGeometry.attributes.position.array.slice();
    return {
      iron, pole, cloth, unit, cupGeometry, flagGeometry, flagMap,
      lattice: instanced(unit, iron, lattice),
      arms: instanced(unit, iron, cupArms),
      vaneBody: instanced(unit, iron, vaneBoxes),
      cupsAt: [0, 1, 2, 3].map((i) => [Math.cos((i * Math.PI) / 2) * 0.5, Math.sin((i * Math.PI) / 2) * 0.5, -(i * Math.PI) / 2]),
    };
  }, []);

  useEffect(() => () => {
    for (const key of ['iron', 'pole', 'cloth', 'unit', 'cupGeometry', 'flagGeometry', 'flagMap']) built[key].dispose();
  }, [built]);

  useFrame(({ clock }, delta) => {
    const t = clock.elapsedTime;
    if (cups.current) cups.current.rotation.y += delta * (5 + Math.sin(t * 0.3) * 2);
    if (vane.current) vane.current.rotation.y = 0.6 + Math.sin(t * 0.13) * 0.25 + Math.sin(t * 0.71) * 0.06;
    // A light breeze: a travelling wave that grows toward the fly end.
    const geometry = built.flagGeometry;
    const rest = geometry.userData.rest;
    const position = geometry.attributes.position;
    for (let i = 0; i < position.count; i += 1) {
      const x = rest[i * 3];
      position.array[i * 3 + 2] = Math.sin(x * 3.2 - t * 5) * 0.12 * (x / 1.9);
      position.array[i * 3 + 1] = rest[i * 3 + 1] - (x / 1.9) * 0.08;
    }
    position.needsUpdate = true;
    geometry.computeVertexNormals();
    if (flag.current && vane.current) flag.current.rotation.y = vane.current.rotation.y;
  });

  return (
    <group>
      <group position={[0, WALL_TOP + 1.3, -3.2]}>
        <primitive object={built.lattice} />
        <group ref={cups} position={[0, 3.2 + 1.75, 0]}>
          <primitive object={built.arms} />
          {built.cupsAt.map(([x, z, yaw], index) => (
            <mesh key={index} geometry={built.cupGeometry} material={built.iron} position={[x, 0, z]} rotation={[0, yaw, Math.PI / 2]} />
          ))}
        </group>
        <group ref={vane} position={[0, 3.2 + 1.35, 0]}>
          <primitive object={built.vaneBody} />
        </group>
      </group>
      <mesh material={built.pole} position={[0, WALL_TOP + 1.3 + 3.5, 3.2]}>
        <cylinderGeometry args={[0.04, 0.07, 7, 8]} />
      </mesh>
      <mesh material={built.pole} position={[0, WALL_TOP + 1.3 + 7.05, 3.2]}>
        <sphereGeometry args={[0.09, 8, 6]} />
      </mesh>
      <mesh ref={flag} geometry={built.flagGeometry} material={built.cloth} position={[0, WALL_TOP + 1.3 + 6.9, 3.2]} castShadow />
    </group>
  );
}

export default function Arsenal() {
  const built = useMemo(() => buildArsenal(), []);
  const colliders = useMemo(() => arsenalColliders(), []);
  useEffect(() => () => built.resources.forEach((resource) => resource.dispose()), [built]);

  return (
    <>
      <group position={[ARSENAL.x, ARSENAL.base, ARSENAL.z]} onClick={(event) => identifyLandmark(PARK_LANDMARKS.arsenal, event)}>
        {built.meshes.map((mesh, index) => <primitive key={index} object={mesh} />)}
        <RoofInstruments />
      </group>
      <StaticColliders entries={colliders} />
    </>
  );
}
