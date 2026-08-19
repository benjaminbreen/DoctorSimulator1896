import * as THREE from 'three';
import { smoothstep } from './surfaces.js';
import { HAIR_COLORS } from './params.js';
import { clothMaterial } from './fabric.js';

// Molded hair and facial-hair shells: a sphere grid offset outward from the
// sculpted head surface wherever a style mask is positive. Unmasked verts
// tuck just inside the head, so one closed mesh covers every style.

const ROWS = 30;
const COLS = 40;

function hash(d) {
  return Math.abs(Math.sin(d.x * 37.7 + d.y * 57.3 + d.z * 41.1) * 43758.5) % 1;
}

// dz-dependent hairline height in dir-space y. The front hairline sits well
// above the brow band (0.27) so faces keep a forehead.
function hairlineY(d, raise = 0) {
  const dz = d.z;
  const base = dz >= 0 ? 0.06 + 0.44 * dz ** 1.4 : 0.06 - 0.60 * (-dz) ** 1.1;
  return base + raise;
}

function maleMask(style, d) {
  const hl = hairlineY(d, style === 'balding' ? 0.05 : 0);
  let m = smoothstep(hl - 0.05, hl + 0.08, d.y) ** 0.6;
  if (style === 'balding') m *= 1 - smoothstep(0.3, 0.55, d.y);
  return m;
}

function femaleMask(style, d) {
  // fuller: hairline a touch lower, covers the ears less than men reveal
  const hl = hairlineY(d) - 0.04;
  let m = smoothstep(hl - 0.08, hl + 0.08, d.y) ** 0.6;
  if (style === 'partedBun' || style === 'crown') {
    const part = 1 - Math.exp(-((d.x / 0.045) ** 2)) * smoothstep(0.2, 0.5, d.z) * smoothstep(0.25, 0.55, d.y) * 0.75;
    m *= part;
  }
  return m;
}

function maleThickness(style, d, s) {
  const top = smoothstep(-0.1, 0.5, d.y);
  let t = 0.005 + top * 0.004;
  if (style === 'cropped') t = 0.0035;
  if (style === 'slicked') t = 0.004;
  if (style === 'curly') t = 0.006 + hash(d) * 0.0045;
  if (style === 'shortSide') t += smoothstep(0.2, 0.7, d.y) * 0.002;
  return t * s;
}

function femaleThickness(style, d, s) {
  let t = 0.007 + smoothstep(-0.1, 0.5, d.y) * 0.004;
  if (style === 'gibson') t += smoothstep(0.1, 0.6, d.y) * smoothstep(-0.1, 0.6, d.z) * 0.009;
  if (style === 'crown') t += smoothstep(0.35, 0.7, d.y) * 0.004;
  t += hash(d) * 0.0015;
  return t * s;
}

function buildShell(p, rig, skeleton, shape, maskFn, thickFn, material) {
  const positions = [];
  const skinIndices = [];
  const skinWeights = [];
  const iHead = rig.index.Head;
  const iJaw = rig.index.Jaw;
  const L = shape.landmarks;

  const masks = [];
  for (let row = 0; row <= ROWS; row += 1) {
    const lat = (row / ROWS) * Math.PI;
    for (let col = 0; col <= COLS; col += 1) {
      const lon = (col / COLS) * Math.PI * 2 - Math.PI;
      const d = new THREE.Vector3(
        Math.sin(lat) * Math.sin(lon), Math.cos(lat), Math.sin(lat) * Math.cos(lon),
      );
      const m = Math.min(1, maskFn(d));
      masks.push(m);
      const base = shape.displace(d);
      // boundary verts feather just under the skin; interior lifts by mask
      const offset = m * thickFn(d) - (1 - m) * 0.0014 * shape.scale;
      base.addScaledVector(d, offset);
      positions.push(base.x, base.y, base.z);
      // follow the jaw where the shell sits on the lower face (beards)
      const jawW = Math.min(0.9, smoothstep(-0.52, -0.70, d.y) * smoothstep(-0.35, 0.1, d.z) * 1.1);
      skinIndices.push(iHead, iJaw, 0, 0);
      skinWeights.push(1 - jawW, jawW, 0, 0);
    }
  }
  // emit only faces that touch the masked region: unmasked shell geometry
  // costs triangles and cuts through the face
  const indices = [];
  const cols = COLS + 1;
  for (let row = 0; row < ROWS; row += 1) {
    for (let col = 0; col < COLS; col += 1) {
      const a = row * cols + col;
      const b = a + 1;
      const c = a + cols;
      const e = c + 1;
      if (masks[a] < 0.01 && masks[b] < 0.01 && masks[c] < 0.01 && masks[e] < 0.01) continue;
      if (row > 0) indices.push(a, c, b);
      if (row < ROWS - 1) indices.push(b, c, e);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skinIndices, 4));
  geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(skinWeights, 4));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const mesh = new THREE.SkinnedMesh(geometry, material);
  mesh.castShadow = true;
  mesh.frustumCulled = false;
  mesh.bind(skeleton, new THREE.Matrix4());
  return mesh;
}

function hairMaterial(p, style) {
  const color = new THREE.Color(HAIR_COLORS[p.hairColor]);
  return new THREE.MeshStandardMaterial({
    color, roughness: style === 'slicked' ? 0.5 : 0.82,
  });
}

function addBun(p, rig, shape, material, kind) {
  const s = shape.scale;
  const { ax, ay, az } = shape.axes;
  const bun = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 10), material.clone());
  if (kind === 'low') {
    bun.scale.set(0.022 * s, 0.019 * s, 0.018 * s);
    bun.position.set(0, shape.center.y - ay * 0.12, -az * 1.02);
  } else if (kind === 'top') {
    bun.scale.set(0.024 * s, 0.02 * s, 0.022 * s);
    bun.position.set(0, shape.center.y + ay * 0.78, -az * 0.5);
  } else if (kind === 'crown') {
    const torus = new THREE.Mesh(new THREE.TorusGeometry(ax * 0.82, 0.009 * s, 8, 22), material.clone());
    torus.rotation.x = Math.PI / 2 - 0.12;
    torus.position.set(0, shape.center.y + ay * 0.62, -az * 0.08);
    torus.position.sub(rig.joints.Head);
    torus.castShadow = true;
    rig.bones.Head.add(torus);
    return;
  }
  bun.position.sub(rig.joints.Head);
  bun.castShadow = true;
  rig.bones.Head.add(bun);
}

function facialMask(style, d, L) {
  const front = smoothstep(0.3, 0.65, d.z);
  // moustache band between nose base and upper lip, ends drooping outward
  const mc = -0.455 - Math.abs(d.x) * 0.13;
  const stache = Math.exp(-(((d.y - mc) / 0.05) ** 2)) * (1 - Math.min(1, Math.abs(d.x) / 0.38) ** 1.5)
    * front * smoothstep(-0.64, -0.545, d.y);
  const chinPatch = smoothstep(0.78, 0.88, d.x * L.chin.x + d.y * L.chin.y + d.z * L.chin.z);
  const jawBand = smoothstep(-0.35, -0.6, d.y) * smoothstep(-0.15, 0.25, d.z) * (1 - smoothstep(-0.75, -0.95, d.y));
  const chops = smoothstep(0.3, 0.6, Math.abs(d.x)) * smoothstep(0.25, -0.15, d.y) * smoothstep(-0.5, -0.2, d.y) * smoothstep(-0.25, 0.15, d.z);
  const sideburn = smoothstep(0.86, 0.95, Math.abs(d.x)) * smoothstep(0.2, 0.05, d.y) * smoothstep(-0.2, -0.05, d.y) * smoothstep(-0.05, 0.1, d.z) * 0.5;

  switch (style) {
    case 'moustache': return stache + sideburn * 0.8;
    case 'walrus': return stache * 1.4 + sideburn * 0.8;
    case 'goatee': return stache * 0.9 + chinPatch * 1.2 + sideburn * 0.6;
    case 'fullBeard': return stache + jawBand * 1.1 + chinPatch + sideburn;
    case 'muttonChops': return chops * 1.3 + sideburn;
    default: return sideburn * 0.7;
  }
}

function facialThickness(style, d, s) {
  const base = style === 'walrus' ? 0.008 : style === 'fullBeard' ? 0.008 : 0.005;
  return (base + hash(d) * 0.0015) * s;
}

export function buildGrooming(p, rig, skeleton, shape) {
  const group = new THREE.Group();
  const style = p.hairStyle;
  const material = hairMaterial(p, style);

  if (p.hat === 'headscarf') {
    const scarfMat = clothMaterial({ colorName: p.accentColor, wear: 0.35 });
    scarfMat.side = THREE.DoubleSide;
    group.add(buildShell(p, rig, skeleton, shape,
      (d) => smoothstep(-0.15, 0.05, d.y + Math.max(0, d.z) * 0.35) * 1,
      () => 0.009 * shape.scale, scarfMat));
  } else if (p.sex === 'male') {
    group.add(buildShell(p, rig, skeleton, shape, (d) => maleMask(style, d), (d) => maleThickness(style, d, shape.scale), material));
  } else {
    group.add(buildShell(p, rig, skeleton, shape, (d) => femaleMask(style, d), (d) => femaleThickness(style, d, shape.scale), material));
    if (style === 'lowBun' || style === 'partedBun') addBun(p, rig, shape, material, 'low');
    if (style === 'gibson') addBun(p, rig, shape, material, 'top');
    if (style === 'crown') addBun(p, rig, shape, material, 'crown');
  }

  if (p.sex === 'male' && p.facialHair !== 'clean') {
    const beardMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(HAIR_COLORS[p.hairColor]).multiplyScalar(0.85),
      roughness: 0.9,
    });
    group.add(buildShell(p, rig, skeleton, shape,
      (d) => Math.min(1, facialMask(p.facialHair, d, shape.landmarks)),
      (d) => facialThickness(p.facialHair, d, shape.scale), beardMat));
  }
  return group;
}
