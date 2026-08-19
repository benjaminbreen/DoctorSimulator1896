import * as THREE from 'three';
import { CLOTH_COLORS } from './params.js';
import { flatMaterial, clothMaterial } from './fabric.js';

// Period hats, lathe profiles attached to the head bone. Dimensions are in
// head-local meters derived from the head shape so hats clear the hair.

function lathe(points, material, segments = 16) {
  const geometry = new THREE.LatheGeometry(points.map(([x, y]) => new THREE.Vector2(x, y)), segments);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = true;
  mesh.material.side = THREE.DoubleSide;
  return mesh;
}

function band(radius, y, height, color, sheen = 0.4) {
  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(radius, radius * 1.01, height, 12, 1, true),
    clothMaterial({ colorName: color, sheen }),
  );
  mesh.position.y = y;
  mesh.material.side = THREE.DoubleSide;
  return mesh;
}

function feather(scale, color) {
  const group = new THREE.Group();
  const material = flatMaterial(color, 0.9);
  material.side = THREE.DoubleSide;
  const pts = [];
  const idx = [];
  const segs = 8;
  for (let i = 0; i <= segs; i += 1) {
    const t = i / segs;
    const x = 0;
    const y = t * 0.09 * scale;
    const z = -t * t * 0.05 * scale;
    const w = Math.sin(Math.min(1, t * 1.3) * Math.PI) * 0.012 * scale;
    pts.push(x - w, y, z, x + w, y, z);
    if (i < segs) {
      const a = i * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  group.add(new THREE.Mesh(geo, material));
  return group;
}

export function buildHat(p, rig, shape) {
  if (p.hat === 'none') return null;
  const s = shape.scale;
  const { ax, az, ay } = shape.axes;
  const R = Math.max(ax, az) + 0.008 * s; // clears the hair shell
  const baseY = shape.center.y + ay * 0.42;
  const group = new THREE.Group();

  const accent = CLOTH_COLORS[p.accentColor] ? p.accentColor : 'black';

  if (p.hat === 'bowler') {
    const felt = flatMaterial('#241f1b', 0.72);
    const brimW = 0.024 * s;
    group.add(lathe([
      [R + brimW, 0.008 * s], [R + brimW * 0.82, 0.002 * s], [R + brimW * 0.4, 0],
      [R, 0.001 * s], [R * 0.985, 0.014 * s], [R * 0.94, 0.038 * s],
      [R * 0.82, 0.06 * s], [R * 0.58, 0.075 * s], [0.001, 0.081 * s],
    ], felt));
    group.add(band(R * 1.005, 0.010 * s, 0.014 * s, 'black', 0.5));
  } else if (p.hat === 'topHat') {
    const silk = flatMaterial('#191614', 0.32);
    const brimW = 0.020 * s;
    const h = 0.092 * s;
    group.add(lathe([
      [R + brimW, 0.007 * s], [R + brimW * 0.7, 0.001 * s], [R, 0.001 * s],
      [R * 0.965, 0.02 * s], [R * 0.955, h * 0.55], [R * 1.0, h],
      [0.001, h + 0.001 * s],
    ], silk));
    group.add(band(R * 0.975, 0.016 * s, 0.014 * s, 'black', 0.6));
  } else if (p.hat === 'homburg') {
    const felt = flatMaterial('#2b2622', 0.75);
    const brimW = 0.026 * s;
    group.add(lathe([
      [R + brimW, 0.010 * s], [R + brimW * 0.85, 0.004 * s], [R + brimW * 0.3, 0],
      [R, 0.001 * s], [R * 0.97, 0.02 * s], [R * 0.9, 0.05 * s],
      [R * 0.72, 0.068 * s], [R * 0.4, 0.076 * s], [0.001, 0.079 * s],
    ], felt));
    group.add(band(R * 0.995, 0.012 * s, 0.016 * s, accent === 'black' ? 'charcoal' : 'black', 0.45));
  } else if (p.hat === 'boater' || p.hat === 'straw') {
    const straw = clothMaterial({ colorName: 'golden', wear: 0.2 });
    straw.color.lerp(new THREE.Color('#d9c37e'), 0.55);
    const brimW = (p.hat === 'straw' ? 0.038 : 0.030) * s;
    const h = 0.03 * s;
    group.add(lathe([
      [R + brimW, 0.002 * s], [R + brimW * 0.5, 0], [R, 0.001 * s],
      [R * 0.99, h], [0.001, h + 0.002 * s],
    ], straw));
    group.add(band(R * 1.0, h * 0.5, h * 0.75, accent, 0.5));
    if (p.hat === 'straw') {
      const cluster = new THREE.Group();
      for (let i = 0; i < 3; i += 1) {
        const bud = new THREE.Mesh(new THREE.SphereGeometry(0.007 * s, 8, 6), clothMaterial({ colorName: i === 1 ? 'ivory' : accent, sheen: 0.5 }));
        bud.position.set(R * 0.75 + i * 0.008 * s, h * 0.7, R * 0.35 - i * 0.01 * s);
        cluster.add(bud);
      }
      group.add(cluster);
    }
  } else if (p.hat === 'wideBrim') {
    const felt = clothMaterial({ colorName: p.coatColor, sheen: 0.35 });
    const brimW = 0.055 * s;
    group.add(lathe([
      [R + brimW, -0.006 * s], [R + brimW * 0.6, 0.004 * s], [R + brimW * 0.2, 0.003 * s],
      [R, 0.002 * s], [R * 0.96, 0.02 * s], [R * 0.8, 0.042 * s],
      [R * 0.5, 0.052 * s], [0.001, 0.055 * s],
    ], felt));
    group.add(band(R * 0.99, 0.012 * s, 0.018 * s, accent, 0.55));
    const plume = feather(s, p.accentColor === 'black' ? '#efe7d6' : CLOTH_COLORS[accent]);
    plume.position.set(R * 0.5, 0.03 * s, -R * 0.55);
    plume.rotation.x = -0.5;
    plume.rotation.z = 0.3;
    group.add(plume);
  } else if (p.hat === 'toque') {
    const velvet = clothMaterial({ colorName: p.coatColor, sheen: 0.55 });
    group.add(lathe([
      [R * 0.9, 0], [R * 1.02, 0.016 * s], [R * 1.0, 0.04 * s],
      [R * 0.78, 0.058 * s], [R * 0.4, 0.065 * s], [0.001, 0.068 * s],
    ], velvet));
    const plume = feather(s * 0.8, '#efe7d6');
    plume.position.set(R * 0.4, 0.05 * s, -R * 0.4);
    plume.rotation.x = -0.25;
    group.add(plume);
  } else if (p.hat === 'headscarf') {
    // built by grooming as a fabric shell over the hair; keep only the knot
    const mat = clothMaterial({ colorName: p.accentColor, wear: 0.4 });
    const knot = new THREE.Mesh(new THREE.BoxGeometry(0.016 * s, 0.012 * s, 0.012 * s), mat);
    knot.position.set(0, shape.center.y - ay * 0.95 - rig.joints.Head.y, -az * 0.55);
    rig.bones.Head.add(knot);
    return null;
  }

  group.position.copy(new THREE.Vector3(0, baseY, -0.004 * s)).sub(rig.joints.Head);
  group.traverse((o) => { o.castShadow = true; });
  rig.bones.Head.add(group);
  return group;
}
