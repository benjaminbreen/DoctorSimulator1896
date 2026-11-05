import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { instanced } from './lib/instances.js';
import { groundGrime } from '../world/groundGrime.js';

// Draws world/groundGrime.js. Contact patches darken without lighting, like
// the occlusion they stand in for; mud, litter and weeds are lit and take
// shadows. Static, one draw per kind.

function hash01(seed) {
  const value = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return value - Math.floor(value);
}

function canvasTexture(width, height, draw, color = true) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  draw(canvas.getContext('2d'));
  const texture = new THREE.CanvasTexture(canvas);
  if (color) texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

// Tight occlusion at the centre with a soft skirt.
function contactTexture() {
  return canvasTexture(128, 128, (context) => {
    const gradient = context.createRadialGradient(64, 64, 0, 64, 64, 64);
    gradient.addColorStop(0, 'rgba(0,0,0,0.85)');
    gradient.addColorStop(0.3, 'rgba(0,0,0,0.6)');
    gradient.addColorStop(0.65, 'rgba(0,0,0,0.25)');
    gradient.addColorStop(1, 'rgba(0,0,0,0)');
    context.fillStyle = gradient;
    context.fillRect(0, 0, 128, 128);
  });
}

// Mud and trodden dirt: overlapping blots thickest near the middle, with
// darker spatter.
function mudTexture(seed, colour = [58, 46, 32]) {
  return canvasTexture(256, 256, (context) => {
    const [r, g, b] = colour;
    for (let index = 0; index < 60; index += 1) {
      const angle = hash01(seed + index * 1.3) * Math.PI * 2;
      const out = Math.pow(hash01(seed + index * 2.9), 1.6) * 80;
      const x = 128 + Math.cos(angle) * out;
      const y = 128 + Math.sin(angle) * out;
      const radius = 18 + hash01(seed + index * 4.1) * 42;
      const gradient = context.createRadialGradient(x, y, 0, x, y, radius);
      gradient.addColorStop(0, `rgba(${r},${g},${b},0.3)`);
      gradient.addColorStop(1, `rgba(${r},${g},${b},0)`);
      context.fillStyle = gradient;
      context.fillRect(0, 0, 256, 256);
    }
    for (let index = 0; index < 140; index += 1) {
      const angle = hash01(seed + index * 5.7) * Math.PI * 2;
      const out = Math.sqrt(hash01(seed + index * 6.3)) * 104;
      context.fillStyle = `rgba(${r * 0.6},${g * 0.6},${b * 0.6},${0.35 + hash01(index) * 0.4})`;
      context.beginPath();
      context.arc(128 + Math.cos(angle) * out, 128 + Math.sin(angle) * out, 1 + hash01(seed + index) * 2.5, 0, Math.PI * 2);
      context.fill();
    }
  });
}

// Dirt banked against a wall along v = 0, with ragged edges and fading ends
// so overlapping segments read as one line.
function stripTexture() {
  return canvasTexture(256, 64, (context) => {
    for (let index = 0; index < 220; index += 1) {
      const x = 10 + hash01(index * 1.7) * 236;
      const depth = Math.pow(hash01(index * 2.3), 2);
      const y = depth * 52;
      const radius = 4 + hash01(index * 3.1) * 12;
      const ends = Math.min(1, x / 40, (256 - x) / 40);
      const gradient = context.createRadialGradient(x, y, 0, x, y, radius);
      gradient.addColorStop(0, `rgba(48,40,30,${(0.55 * (1 - depth) * ends).toFixed(3)})`);
      gradient.addColorStop(1, 'rgba(48,40,30,0)');
      context.fillStyle = gradient;
      context.fillRect(0, 0, 256, 64);
    }
    const line = context.createLinearGradient(0, 0, 0, 22);
    line.addColorStop(0, 'rgba(20,16,12,0.75)');
    line.addColorStop(1, 'rgba(20,16,12,0)');
    context.globalCompositeOperation = 'destination-over';
    context.fillStyle = line;
    context.fillRect(30, 0, 196, 22);
  });
}

function leafTexture() {
  return canvasTexture(128, 128, (context) => {
    for (let index = 0; index < 7; index += 1) {
      const x = 30 + hash01(index * 2.1) * 68;
      const y = 30 + hash01(index * 3.7) * 68;
      const hue = hash01(index * 5.3);
      context.save();
      context.translate(x, y);
      context.rotate(hash01(index * 7.9) * Math.PI * 2);
      context.fillStyle = `rgb(${110 + hue * 70},${70 + hue * 45},${30 + hue * 15})`;
      context.beginPath();
      context.ellipse(0, 0, 13, 6, 0, 0, Math.PI * 2);
      context.fill();
      context.strokeStyle = 'rgba(60,40,20,0.8)';
      context.lineWidth = 1;
      context.beginPath();
      context.moveTo(-15, 0);
      context.lineTo(13, 0);
      context.stroke();
      context.restore();
    }
  });
}

function paperTexture() {
  return canvasTexture(128, 128, (context) => {
    context.fillStyle = '#d9d2c0';
    context.beginPath();
    const points = 9;
    for (let index = 0; index < points; index += 1) {
      const angle = (index / points) * Math.PI * 2;
      const radius = 26 + hash01(index * 3.3) * 22;
      const x = 64 + Math.cos(angle) * radius;
      const y = 64 + Math.sin(angle) * radius * 0.7;
      if (index === 0) context.moveTo(x, y);
      else context.lineTo(x, y);
    }
    context.closePath();
    context.fill();
    // Crumple shading and a line or two of print.
    context.strokeStyle = 'rgba(120,110,95,0.6)';
    context.lineWidth = 2;
    for (let index = 0; index < 4; index += 1) {
      context.beginPath();
      context.moveTo(40 + hash01(index) * 50, 40 + hash01(index * 2) * 40);
      context.lineTo(40 + hash01(index * 3) * 50, 50 + hash01(index * 4) * 40);
      context.stroke();
    }
    context.fillStyle = 'rgba(40,36,30,0.55)';
    for (let row = 0; row < 3; row += 1) context.fillRect(44, 54 + row * 7, 40 - row * 6, 2);
  });
}

function strawTexture() {
  return canvasTexture(128, 128, (context) => {
    context.lineCap = 'round';
    for (let index = 0; index < 26; index += 1) {
      const x = 30 + hash01(index * 2.3) * 68;
      const y = 40 + hash01(index * 4.1) * 48;
      const angle = (hash01(index * 6.7) - 0.5) * 1.6;
      const length = 14 + hash01(index * 8.9) * 26;
      const light = 160 + hash01(index * 9.7) * 60;
      context.strokeStyle = `rgb(${light},${light * 0.82},${light * 0.45})`;
      context.lineWidth = 1.5;
      context.beginPath();
      context.moveTo(x, y);
      context.lineTo(x + Math.cos(angle) * length, y + Math.sin(angle) * length);
      context.stroke();
    }
  });
}

// A tuft of blades fanning up from the bottom edge.
function weedTexture() {
  return canvasTexture(128, 128, (context) => {
    context.lineCap = 'round';
    for (let index = 0; index < 22; index += 1) {
      const base = 44 + hash01(index * 1.9) * 40;
      const lean = (hash01(index * 3.3) - 0.5) * 70;
      const height = 50 + hash01(index * 5.1) * 70;
      const green = 90 + hash01(index * 7.7) * 70;
      context.strokeStyle = `rgb(${40 + hash01(index) * 30},${green},${30 + hash01(index * 2) * 20})`;
      context.lineWidth = 2 + hash01(index * 4.4) * 2;
      context.beginPath();
      context.moveTo(base, 128);
      context.quadraticCurveTo(base + lean * 0.3, 128 - height * 0.6, base + lean, 128 - height);
      context.stroke();
    }
  });
}

function weedGeometry() {
  const a = new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0);
  const b = a.clone().rotateY(Math.PI / 2);
  const geometry = new THREE.BufferGeometry();
  const merged = [a, b].map((entry) => entry.toNonIndexed());
  for (const name of ['position', 'normal', 'uv']) {
    const arrays = merged.map((entry) => entry.attributes[name].array);
    const joined = new Float32Array(arrays.reduce((total, array) => total + array.length, 0));
    let offset = 0;
    for (const array of arrays) {
      joined.set(array, offset);
      offset += array.length;
    }
    geometry.setAttribute(name, new THREE.BufferAttribute(joined, merged[0].attributes[name].itemSize));
  }
  // Blades lit as if they faced up, so both sides of the cards read alike.
  const normals = geometry.attributes.normal;
  for (let index = 0; index < normals.count; index += 1) normals.setXYZ(index, 0, 1, 0);
  return geometry;
}

export default function GroundGrime() {
  const built = useMemo(() => {
    const layout = groundGrime();
    const decal = (map, lit = true) => {
      const options = {
        map, transparent: true, depthWrite: false,
        polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3,
      };
      return lit ? new THREE.MeshStandardMaterial({ ...options, roughness: 1 }) : new THREE.MeshBasicMaterial(options);
    };
    const cutout = (map, side = THREE.FrontSide) => new THREE.MeshStandardMaterial({ map, alphaTest: 0.45, roughness: 0.95, side });
    const materials = {
      contact: decal(contactTexture(), false),
      mud: decal(mudTexture(3)),
      soil: decal(mudTexture(11, [64, 50, 34])),
      strip: decal(stripTexture()),
      leaf: cutout(leafTexture()),
      paper: cutout(paperTexture()),
      straw: cutout(strawTexture()),
      weed: cutout(weedTexture(), THREE.DoubleSide),
    };
    const plane = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    const geometries = { plane, weed: weedGeometry() };
    const grey = (value) => [value, value, value];

    const meshes = [];
    const add = (geometry, material, entries, options = { cast: false }) => {
      if (!entries.length) return;
      const mesh = instanced(geometry, material, entries, options);
      mesh.raycast = () => {};
      meshes.push(mesh);
    };
    // Contact first, then mud over it; both in render order below the litter.
    add(plane, materials.contact, layout.spots.map((spot) => ({
      p: [spot.x, spot.y, spot.z], r: [0, spot.yaw, 0],
      s: [spot.rx * (spot.kind === 'tree' ? 1.2 : 1.1), 1, spot.rz * (spot.kind === 'tree' ? 1.2 : 1.1)],
      // Basic material: the colour is the darkness, nearer white is lighter.
      color: grey(spot.kind === 'tree' ? 0.5 : 0.85 - spot.strength * 0.15),
    })));
    add(plane, materials.mud, layout.spots.filter((spot) => spot.kind !== 'tree').map((spot, index) => ({
      p: [spot.x, spot.y + 0.001, spot.z], r: [0, spot.yaw + index, 0],
      s: [spot.rx * 2.6, 1, spot.rz * 2.6],
      color: grey(0.8 + hash01(index) * 0.2),
    })));
    add(plane, materials.soil, layout.spots.filter((spot) => spot.kind === 'tree').map((spot, index) => ({
      p: [spot.x, spot.y + 0.001, spot.z], r: [0, spot.yaw, 0],
      s: [spot.rx * 2.4, 1, spot.rz * 2.4],
      color: grey(0.85 + hash01(index * 3) * 0.15),
    })));
    // The strip texture's dark edge is v = 0, the far edge of the plane;
    // turning it half round puts that edge against the wall.
    add(plane, materials.strip, layout.strips.map((strip, index) => ({
      p: [strip.x, strip.y, strip.z], r: [0, strip.yaw + Math.PI, 0],
      s: [strip.length + 0.4, 1, strip.width * 1.4],
      color: grey(0.85 + hash01(index * 1.7) * 0.15),
    })));
    for (const kind of ['leaf', 'paper', 'straw']) {
      add(plane, materials[kind], layout.debris.filter((bit) => bit.kind === kind).map((bit) => ({
        p: [bit.x, bit.y + 0.003, bit.z], r: [0, bit.yaw, 0], s: [bit.size * 1.4, 1, bit.size * 1.4],
      })));
    }
    add(geometries.weed, materials.weed, layout.weeds.map((weed) => ({
      p: [weed.x, weed.y - 0.01, weed.z], r: [0, weed.yaw, 0], s: [weed.size * 1.3, weed.size, weed.size * 1.3],
    })), { cast: true });
    meshes.forEach((mesh, index) => { mesh.renderOrder = index < 4 ? 1 : 2; });
    return { meshes, materials, geometries };
  }, []);

  useEffect(() => () => {
    Object.values(built.geometries).forEach((geometry) => geometry.dispose());
    Object.values(built.materials).forEach((material) => {
      material.map?.dispose();
      material.dispose();
    });
  }, [built]);

  return built.meshes.map((mesh, index) => <primitive key={index} object={mesh} />);
}
