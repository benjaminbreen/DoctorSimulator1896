import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { useLoader } from '@react-three/fiber';
import { instanced } from './lib/instances.js';
import { ROAD_TOP } from '../world/streetGrid.js';
import { crossingSlabs, roadLitter } from '../world/streetWear.js';

// Flagstone crossings at the corners, and dung, stains and gutter straw on
// the roadways (see world/streetWear.js). Static, and all of it instanced.

function hash01(seed) {
  const value = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return value - Math.floor(value);
}

function canvasTexture(size, draw) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  draw(canvas.getContext('2d'), size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

// Soft overlapping blots, so no two stains read as the same stamp once
// rotated and scaled.
function stainTexture() {
  return canvasTexture(128, (context, size) => {
    for (let index = 0; index < 9; index += 1) {
      const x = size * (0.3 + hash01(index * 3.1) * 0.4);
      const y = size * (0.3 + hash01(index * 5.7) * 0.4);
      const radius = size * (0.1 + hash01(index * 7.3) * 0.22);
      const gradient = context.createRadialGradient(x, y, 0, x, y, radius);
      gradient.addColorStop(0, 'rgba(86,66,38,0.6)');
      gradient.addColorStop(1, 'rgba(86,66,38,0)');
      context.fillStyle = gradient;
      context.fillRect(0, 0, size, size);
    }
  });
}

function strawTexture() {
  return canvasTexture(128, (context, size) => {
    context.lineCap = 'round';
    for (let index = 0; index < 70; index += 1) {
      const x = size * (0.15 + hash01(index * 2.3) * 0.7);
      const y = size * (0.35 + hash01(index * 4.1) * 0.3);
      const angle = (hash01(index * 6.7) - 0.5) * 1.4;
      const length = size * (0.08 + hash01(index * 8.9) * 0.2);
      const light = 150 + hash01(index * 9.7) * 70;
      context.strokeStyle = `rgba(${light},${light * 0.82},${light * 0.45},0.95)`;
      context.lineWidth = 1 + hash01(index) * 1.2;
      context.beginPath();
      context.moveTo(x, y);
      context.lineTo(x + Math.cos(angle) * length, y + Math.sin(angle) * length);
      context.stroke();
    }
  });
}

// Soft speckle rather than per-pixel noise, which reads as blocky up close.
function mottleTexture() {
  const texture = canvasTexture(256, (context, size) => {
    context.fillStyle = '#e6e6e6';
    context.fillRect(0, 0, size, size);
    for (let index = 0; index < 900; index += 1) {
      const value = 205 + hash01(index * 1.7) * 50;
      context.fillStyle = `rgba(${value},${value},${value},0.18)`;
      context.beginPath();
      context.arc(hash01(index * 2.3) * size, hash01(index * 3.9) * size, 1 + hash01(index * 5.1) * 4, 0, Math.PI * 2);
      context.fill();
    }
  });
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  return texture;
}

export default function StreetWear() {
  const graniteNormal = useLoader(THREE.TextureLoader, '/textures/street/granite_nrm.webp');
  const built = useMemo(() => {
    const slabs = crossingSlabs();
    const { stains, dung, straw } = roadLitter();
    const decal = (map) => new THREE.MeshStandardMaterial({
      map, transparent: true, depthWrite: false, roughness: 0.95,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    });
    const materials = {
      // The granite's grain gives the flags a worn, pitted face.
      slab: new THREE.MeshStandardMaterial({
        map: mottleTexture(), normalMap: graniteNormal, normalScale: new THREE.Vector2(0.6, 0.6), roughness: 0.9,
      }),
      stain: decal(stainTexture()),
      straw: decal(strawTexture()),
      dung: new THREE.MeshStandardMaterial({ roughness: 0.9, flatShading: true }),
    };
    const plane = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    const geometries = {
      slab: new THREE.BoxGeometry(1, 1, 1),
      plane,
      dung: new THREE.IcosahedronGeometry(1, 0),
    };

    // Slabs stand 1.4 cm proud of the setts, a little uneven; the Belt Line
    // rails stay on top of them.
    const meshes = [
      instanced(geometries.slab, materials.slab, slabs.map((entry) => {
        // Bluestone, a shade darker and cooler than the sidewalk flags.
        const shade = 0.07 + entry.tone * 0.05;
        return {
          p: [entry.x, ROAD_TOP - 0.012 - entry.sink * 0.006, entry.z],
          s: [entry.sx, 0.05, entry.sz],
          color: [shade * 0.97, shade, shade * 1.04],
        };
      }), { cast: false }),
      instanced(geometries.plane, materials.stain, stains.map((entry) => ({
        p: [entry.x, ROAD_TOP + 0.009, entry.z],
        r: [0, entry.yaw, 0],
        s: [entry.size * 1.4, 1, entry.size * 1.1],
        color: [0.6 + entry.tone * 0.4, 0.6 + entry.tone * 0.4, 0.6 + entry.tone * 0.4],
      })), { cast: false }),
      instanced(geometries.plane, materials.straw, straw.map((entry) => ({
        p: [entry.x, ROAD_TOP + 0.01, entry.z],
        r: [0, entry.yaw, 0],
        s: [entry.size, 1, entry.size * 0.6],
        color: [0.85 + entry.tone * 0.15, 0.82 + entry.tone * 0.15, 0.75],
      })), { cast: false }),
      instanced(geometries.dung, materials.dung, dung.map((entry) => ({
        p: [entry.x, ROAD_TOP + entry.size * 0.45, entry.z],
        r: [entry.tone * 3, entry.tone * 5, 0],
        s: [entry.size * 1.3, entry.size, entry.size * 1.5],
        color: [0.2 + entry.tone * 0.08, 0.16 + entry.tone * 0.07, 0.08],
      })), { cast: false }),
    ];
    meshes.forEach((mesh) => { mesh.raycast = () => {}; });
    return { meshes, materials, geometries };
  }, [graniteNormal]);

  useEffect(() => () => {
    Object.values(built.geometries).forEach((geometry) => geometry.dispose());
    // The granite normal is shared through the loader cache; leave it.
    Object.values(built.materials).forEach((material) => {
      material.map?.dispose();
      material.dispose();
    });
  }, [built]);

  return built.meshes.map((mesh, index) => <primitive key={index} object={mesh} />);
}
