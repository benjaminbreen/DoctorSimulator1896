import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';

// The Victorian pack fireplace is a mantel shell with a through hole, so the
// wallpaper showed inside the grate. This fills the hole for every placed
// Fireplace: a sooted firebrick box, an iron basket of coals, and a low
// flicker. Dimensions are in model space (scale 1, front toward +z).

const INNER_W = 1.0;
const INNER_H = 0.85;

let brickTexture = null;
function fireboxBrickTexture() {
  if (brickTexture) return brickTexture;
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const context = canvas.getContext('2d');
  const rand = (n) => Math.abs(Math.sin(n * 127.1) * 43758.5453) % 1;
  context.fillStyle = '#26180f';
  context.fillRect(0, 0, size, size);
  const rows = 9;
  const rowH = size / rows;
  for (let row = 0; row < rows; row += 1) {
    const offset = row % 2 === 0 ? 0 : rowH * 1.1;
    for (let x = -1; x < 5; x += 1) {
      const bx = x * rowH * 2.2 + offset;
      const tone = 22 + rand(row * 17 + x) * 14;
      context.fillStyle = `rgb(${tone + 8},${tone * 0.62 | 0},${tone * 0.42 | 0})`;
      context.fillRect(bx + 1, row * rowH + 1, rowH * 2.2 - 2, rowH - 2);
    }
  }
  // Soot: heaviest at the top, streaking down.
  const soot = context.createLinearGradient(0, 0, 0, size);
  soot.addColorStop(0, 'rgba(8,6,5,0.94)');
  soot.addColorStop(0.5, 'rgba(10,8,6,0.72)');
  soot.addColorStop(1, 'rgba(12,9,7,0.4)');
  context.fillStyle = soot;
  context.fillRect(0, 0, size, size);
  brickTexture = new THREE.CanvasTexture(canvas);
  brickTexture.colorSpace = THREE.SRGBColorSpace;
  brickTexture.wrapS = brickTexture.wrapT = THREE.RepeatWrapping;
  return brickTexture;
}

let flameTexture = null;
function fireFlameTexture() {
  if (flameTexture) return flameTexture;
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const context = canvas.getContext('2d');
  // A soft teardrop: bright orange core low, fading to nothing at the tip.
  const glow = context.createRadialGradient(64, 96, 6, 64, 84, 62);
  glow.addColorStop(0, 'rgba(255,214,140,0.95)');
  glow.addColorStop(0.35, 'rgba(255,138,48,0.55)');
  glow.addColorStop(0.7, 'rgba(214,72,18,0.18)');
  glow.addColorStop(1, 'rgba(120,30,8,0)');
  context.fillStyle = glow;
  context.fillRect(0, 0, 128, 128);
  flameTexture = new THREE.CanvasTexture(canvas);
  flameTexture.colorSpace = THREE.SRGBColorSpace;
  return flameTexture;
}

function buildFirebox(disposables) {
  const node = new THREE.Group();
  const brick = new THREE.MeshStandardMaterial({
    map: fireboxBrickTexture(), color: '#6e6058', roughness: 0.96,
  });
  const stone = new THREE.MeshStandardMaterial({ color: '#211c18', roughness: 0.9 });
  const iron = new THREE.MeshStandardMaterial({ color: '#1d1c1e', roughness: 0.5, metalness: 0.65 });
  disposables.push(brick, stone, iron);

  const panel = (sx, sy, sz, x, y, z, material = brick) => {
    const geometry = new THREE.BoxGeometry(sx, sy, sz);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, z);
    mesh.receiveShadow = true;
    node.add(mesh);
    disposables.push(geometry);
    return mesh;
  };

  // Brick lining: back, cheeks, closed top, and a stone hearth floor. The
  // hearth stands against a wall whose face crosses model z at about -0.25,
  // so nothing structural may sit behind -0.24 or the wallpaper wins.
  panel(INNER_W, INNER_H, 0.06, 0, INNER_H / 2, -0.21);
  panel(0.06, INNER_H, 0.44, -INNER_W / 2, INNER_H / 2, 0.0);
  panel(0.06, INNER_H, 0.44, INNER_W / 2, INNER_H / 2, 0.0);
  panel(INNER_W + 0.06, 0.05, 0.48, 0, INNER_H, 0.0);
  panel(INNER_W + 0.06, 0.05, 0.56, 0, 0.025, 0.03, stone);

  // Iron basket: side rails, grate bars across, four stub feet.
  const barGeometry = new THREE.CylinderGeometry(0.014, 0.014, 0.66, 6);
  disposables.push(barGeometry);
  for (let i = 0; i < 5; i += 1) {
    const bar = new THREE.Mesh(barGeometry, iron);
    bar.rotation.z = Math.PI / 2;
    bar.position.set(0, 0.17, -0.16 + i * 0.08);
    node.add(bar);
  }
  const railGeometry = new THREE.BoxGeometry(0.035, 0.1, 0.44);
  const footGeometry = new THREE.CylinderGeometry(0.02, 0.026, 0.13, 6);
  disposables.push(railGeometry, footGeometry);
  for (const side of [-1, 1]) {
    const rail = new THREE.Mesh(railGeometry, iron);
    rail.position.set(side * 0.35, 0.2, -0.02);
    node.add(rail);
    for (const fz of [-0.18, 0.14]) {
      const foot = new THREE.Mesh(footGeometry, iron);
      foot.position.set(side * 0.35, 0.075, fz);
      node.add(foot);
    }
  }
  return node;
}

function buildCoals(disposables, seed) {
  const node = new THREE.Group();
  const rand = (n) => Math.abs(Math.sin((seed + n) * 127.1) * 43758.5453) % 1;
  const lump = new THREE.IcosahedronGeometry(0.045, 0);
  const dark = new THREE.MeshStandardMaterial({ color: '#16110d', roughness: 0.95 });
  disposables.push(lump, dark);
  const embers = [];
  for (let i = 0; i < 12; i += 1) {
    const lit = i % 3 !== 0;
    // Lit lumps need their own material so the flicker can drive emissive
    // intensity per fireplace without touching the shared dark one.
    const material = lit
      ? new THREE.MeshStandardMaterial({
        color: '#2a130a', emissive: '#ff5a14', emissiveIntensity: 1.1, roughness: 0.85,
      })
      : dark;
    if (lit) {
      disposables.push(material);
      embers.push(material);
    }
    const mesh = new THREE.Mesh(lump, material);
    mesh.position.set(
      (rand(i * 3) - 0.5) * 0.56,
      0.235 + rand(i * 5) * 0.045,
      -0.16 + rand(i * 7) * 0.28,
    );
    mesh.rotation.set(rand(i) * 3, rand(i * 2) * 3, 0);
    mesh.scale.setScalar(0.7 + rand(i * 11) * 0.7);
    node.add(mesh);
  }
  return { node, embers };
}

function buildFlames(disposables) {
  const node = new THREE.Group();
  const geometry = new THREE.PlaneGeometry(0.5, 0.5);
  geometry.translate(0, 0.25, 0); // scale from the base, not the middle
  const material = new THREE.MeshBasicMaterial({
    map: fireFlameTexture(), transparent: true, opacity: 0.85,
    blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
  });
  disposables.push(geometry, material);
  const sprites = [];
  for (const [yaw, x, z] of [[0.2, 0, -0.06], [1.35, 0.08, -0.02], [-1.1, -0.09, -0.04]]) {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, 0.26, z);
    mesh.rotation.y = yaw;
    mesh.renderOrder = 3;
    node.add(mesh);
    sprites.push(mesh);
  }
  return { node, sprites };
}

function Hearth({ item, index }) {
  const lightRef = useRef();
  const built = useMemo(() => {
    const disposables = [];
    const scale = item.modelScale ?? 1;
    const group = new THREE.Group();
    group.position.set(...item.position);
    group.rotation.y = item.yaw ?? 0;
    group.scale.setScalar(scale);
    group.add(buildFirebox(disposables));
    const coals = buildCoals(disposables, index * 13.7);
    group.add(coals.node);
    const flames = buildFlames(disposables);
    group.add(flames.node);
    return { group, disposables, embers: coals.embers, sprites: flames.sprites };
  }, [item, index]);

  useEffect(() => () => {
    for (const resource of built.disposables) resource.dispose();
  }, [built]);

  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    const phase = index * 2.4;
    const flicker = 0.82
      + 0.12 * Math.sin(t * 9.1 + phase)
      + 0.06 * Math.sin(t * 23.7 + phase * 3);
    if (lightRef.current) lightRef.current.intensity = 1.5 * flicker;
    for (const material of built.embers) material.emissiveIntensity = 0.7 + 0.8 * flicker;
    built.sprites.forEach((sprite, i) => {
      sprite.scale.y = 0.8 + 0.3 * Math.sin(t * 7.3 + phase + i * 2.1);
      sprite.scale.x = 0.92 + 0.08 * Math.sin(t * 11.9 + i * 4.2);
    });
  });

  return (
    <>
      <primitive object={built.group} />
      <pointLight
        ref={lightRef}
        color="#ff8033"
        intensity={1.5}
        distance={5}
        decay={2}
        position={[
          item.position[0] + Math.sin(item.yaw ?? 0) * 0.3,
          item.position[1] + 0.55,
          item.position[2] + Math.cos(item.yaw ?? 0) * 0.3,
        ]}
      />
    </>
  );
}

export default function Firebox({ items }) {
  const hearths = items.filter((item) => item.model === 'Fireplace');
  if (hearths.length === 0) return null;
  return hearths.map((item, index) => (
    <Hearth key={item.id ?? index} item={item} index={index} />
  ));
}
