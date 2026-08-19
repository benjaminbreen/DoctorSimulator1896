import * as THREE from 'three';
import { buildLoft, chainWeights, makeSkinnedMesh, smoothstep } from './surfaces.js';
import { torsoSections, armSections, armWeights, legSections, legWeights, bodyScale } from './body.js';
import { clothMaterial, flatMaterial } from './fabric.js';
import { CLOTH_COLORS } from './params.js';

// 1896 wardrobe lofted over the body profiles. Garments ARE the visible
// torso and limbs (skin never renders underneath), so nothing punches
// through during animation.

const FRONT = Math.PI / 2; // phi of center front in loft space

function torsoRadiusAt(rows, y) {
  const ys = rows.map((r) => r.pos.y);
  if (y <= ys[0]) return rows[0];
  if (y >= ys[ys.length - 1]) return rows[rows.length - 1];
  let i = 0;
  while (y > ys[i + 1]) i += 1;
  const t = (y - ys[i]) / (ys[i + 1] - ys[i]);
  const a = rows[i];
  const b = rows[i + 1];
  return {
    rx: a.rx + (b.rx - a.rx) * t,
    rzF: a.rzF + (b.rzF - a.rzF) * t,
    rzB: a.rzB + (b.rzB - a.rzB) * t,
    n: a.n + (b.n - a.n) * t,
  };
}

function surfacePoint(rows, y, phi, out = 0) {
  const r = torsoRadiusAt(rows, y);
  const e = 2 / r.n;
  const c = Math.cos(phi);
  const sn = Math.sin(phi);
  const cx = Math.sign(c) * Math.abs(c) ** e;
  const cz = Math.sign(sn) * Math.abs(sn) ** e;
  const rz = cz >= 0 ? r.rzF : r.rzB;
  return new THREE.Vector3(cx * (r.rx + out), y, cz * (rz + out));
}

// For meshes whose geometry is built in world (bind) space but attached
// rigidly to a bone: cancel the bone's bind translation.
function attachWorld(rig, mesh, boneName) {
  mesh.position.copy(rig.joints[boneName]).negate();
  mesh.castShadow = true;
  rig.bones[boneName].add(mesh);
}

// Slice of the torso profile as loft sections between two heights.
function torsoSlice(p, easeFn, y0, y1, count = 7, frontExtra = null) {
  const base = torsoSections(p, 0);
  const s = p.height;
  const sections = [];
  for (let i = 0; i < count; i += 1) {
    const t = count === 1 ? 0 : i / (count - 1);
    const y = (y0 + (y1 - y0) * t) * s;
    const r = torsoRadiusAt(base, y);
    const ease = (typeof easeFn === 'function' ? easeFn(y / s) : easeFn) * s;
    const fx = frontExtra ? frontExtra(y / s) * s : 0;
    sections.push({
      pos: new THREE.Vector3(0, y, 0),
      rx: r.rx + ease, rzF: r.rzF + ease + fx, rzB: r.rzB + ease, n: r.n,
    });
  }
  return sections;
}

function boneForY(p, rig, y) {
  if (y < 0.575 * p.height) return 'Root';
  if (y < 0.65 * p.height) return 'Spine1';
  if (y < 0.72 * p.height) return 'Spine2';
  return 'Chest';
}

function attachRigid(p, rig, mesh, world) {
  const name = boneForY(p, rig, world.y);
  mesh.position.copy(world).sub(rig.joints[name]);
  mesh.castShadow = true;
  rig.bones[name].add(mesh);
}

function torsoWeightsFor(p, rig) {
  const s = p.height;
  return (t, phi, pos) => {
    const y = pos.y / s;
    const spans = [
      { bone: rig.index.Root, to: 0.575 }, { bone: rig.index.Spine1, to: 0.65 },
      { bone: rig.index.Spine2, to: 0.72 }, { bone: rig.index.Chest, to: 10 },
    ];
    let i = 0;
    while (i < spans.length - 1 && y > spans[i].to) i += 1;
    const pairs = [[spans[i].bone, 1]];
    const blend = 0.035;
    if (i < spans.length - 1) {
      const w = smoothstep(spans[i].to - blend, spans[i].to + blend, y);
      if (w > 0) { pairs[0][1] = 1 - w; pairs.push([spans[i + 1].bone, w]); }
    }
    if (i > 0) {
      const w = 1 - smoothstep(spans[i - 1].to - blend, spans[i - 1].to + blend, y);
      if (w > 0) { pairs[0][1] -= w; pairs.push([spans[i - 1].bone, w]); }
    }
    return pairs;
  };
}

function ribbon(points, widths, outDir, material) {
  const positions = [];
  const indices = [];
  let prevSide = null;
  for (let i = 0; i < points.length; i += 1) {
    const tangent = (i < points.length - 1
      ? points[i + 1].clone().sub(points[i])
      : points[i].clone().sub(points[i - 1])).normalize();
    let side = new THREE.Vector3().crossVectors(tangent, outDir);
    if (side.lengthSq() < 1e-6) side = prevSide ? prevSide.clone() : new THREE.Vector3(1, 0, 0);
    side.normalize();
    // keep side continuous along the strip or the quad twists into a bowtie
    if (prevSide && side.dot(prevSide) < 0) side.negate();
    prevSide = side;
    const w = widths[Math.min(i, widths.length - 1)] / 2;
    const a = points[i].clone().addScaledVector(side, w);
    const b = points[i].clone().addScaledVector(side, -w);
    positions.push(a.x, a.y, a.z, b.x, b.y, b.z);
    if (i < points.length - 1) {
      const k = i * 2;
      indices.push(k, k + 1, k + 2, k + 1, k + 3, k + 2);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(geometry, material);
  mesh.material.side = THREE.DoubleSide;
  mesh.castShadow = true;
  return mesh;
}

function buttonRow(p, rig, rows, y0, y1, count, color, radius = 0.0055) {
  const group = new THREE.Group();
  const material = flatMaterial(color, 0.45);
  for (let i = 0; i < count; i += 1) {
    const y = (y0 + ((y1 - y0) * i) / Math.max(1, count - 1)) * p.height;
    const r = torsoRadiusAt(rows, y);
    const world = new THREE.Vector3(0, y, r.rzF + 0.003 * p.height);
    const button = new THREE.Mesh(new THREE.CylinderGeometry(radius * p.height, radius * p.height, 0.0025 * p.height, 6), material);
    button.rotation.x = Math.PI / 2;
    attachRigid(p, rig, button, world);
  }
  return group;
}

// ---------- shared pieces ----------

function buildBoots(p, rig, skeleton, { color = '#241d18', shine = 0.55 } = {}) {
  const s = p.height;
  const group = new THREE.Group();
  const material = flatMaterial(color, 1 - shine * 0.6);
  for (const side of [1, -1]) {
    const S = side > 0 ? 'L' : 'R';
    const x = rig.joints[`Foot${S}`].x;
    const weightFn = chainWeights([
      { bone: rig.index[`Shin${S}`], to: 0.25 },
      { bone: rig.index[`Foot${S}`], to: 10 },
    ], 0.12);
    const shaft = buildLoft({
      sections: [
        { pos: new THREE.Vector3(x, 0.115 * s, -0.012 * s), rx: 0.0285 * s, rzF: 0.031 * s, rzB: 0.030 * s, n: 2.2 },
        { pos: new THREE.Vector3(x, 0.075 * s, -0.012 * s), rx: 0.0285 * s, rzF: 0.031 * s, rzB: 0.030 * s, n: 2.2 },
        { pos: new THREE.Vector3(x, 0.03 * s, -0.010 * s), rx: 0.032 * s, rzF: 0.035 * s, rzB: 0.029 * s, n: 2.3 },
      ],
      segments: 10, ringsPer: 1, weightFn,
    });
    group.add(makeSkinnedMesh(shaft, material, skeleton));
    const footWeights = chainWeights([
      { bone: rig.index[`Foot${S}`], to: 0.55 },
      { bone: rig.index[`Toe${S}`], to: 10 },
    ], 0.14);
    const foot = buildLoft({
      sections: [
        { pos: new THREE.Vector3(x, 0.03 * s, -0.03 * s), rx: 0.03 * s, rzF: 0.026 * s, rzB: 0.024 * s, n: 2.6 },
        { pos: new THREE.Vector3(x, 0.026 * s, 0.015 * s), rx: 0.034 * s, rzF: 0.026 * s, rzB: 0.022 * s, n: 2.6 },
        { pos: new THREE.Vector3(x, 0.022 * s, 0.055 * s), rx: 0.033 * s, rzF: 0.02 * s, rzB: 0.019 * s, n: 2.7 },
        { pos: new THREE.Vector3(x, 0.019 * s, 0.09 * s), rx: 0.024 * s, rzF: 0.012 * s, rzB: 0.016 * s, n: 2.7 },
      ],
      segments: 10, ringsPer: 1, capEnd: true, frontHint: new THREE.Vector3(0, 1, 0), weightFn: footWeights,
    });
    group.add(makeSkinnedMesh(foot, material, skeleton));
    const heel = new THREE.Mesh(new THREE.CylinderGeometry(0.02 * s, 0.022 * s, 0.02 * s, 7), material);
    heel.position.set(0, -rig.joints[`Foot${S}`].y + 0.012 * s, -0.014 * s);
    heel.castShadow = true;
    rig.bones[`Foot${S}`].add(heel);
  }
  return group;
}

function buildTrousers(p, rig, skeleton, { colorName, pattern, wear, skipSeat = false, legsTop = 0.47 }) {
  const s = p.height;
  const group = new THREE.Group();
  const material = clothMaterial({ colorName, pattern: pattern === 'stripe' ? 'stripe' : 'plain', wear });

  if (!skipSeat) {
    // seat sits INSIDE the waistcoat (ease .005 vs .007) or the two z-fight
    const seatRows = torsoSlice(p, 0.005, 0.472, 0.585, 4);
    const seatWeights = (t, phi, pos) => {
      const y = pos.y / s;
      const drop = smoothstep(0.575, 0.5, y);
      const wL = Math.max(0, Math.cos(phi)) ** 2 * drop * 0.75;
      const wR = Math.max(0, -Math.cos(phi)) ** 2 * drop * 0.75;
      return [[rig.index.Root, 1 - wL - wR], [rig.index.ThighL, wL], [rig.index.ThighR, wR]];
    };
    group.add(makeSkinnedMesh(buildLoft({ sections: seatRows, segments: 14, ringsPer: 1, uvTile: 0.3, weightFn: seatWeights }), material, skeleton));
  }

  for (const side of [1, -1]) {
    const top = legsTop * s;
    const bottom = 0.075 * s;
    const sections = legSections(p, rig, side, 0.0085, top, bottom);
    for (const sec of sections) sec.n = 2.35;
    const hem = sections[sections.length - 1];
    for (const k of ['rx', 'rzF', 'rzB']) hem[k] *= 0.88;
    const geometry = buildLoft({ sections, segments: 12, ringsPer: 1, uvTile: 0.3, weightFn: legWeights(p, rig, side, top, bottom) });
    group.add(makeSkinnedMesh(geometry, material.clone(), skeleton));
  }
  return group;
}

function buildShirtCollarAndTie(p, rig, skeleton, { tie = 'fourInHand' }) {
  const s = p.height;
  const group = new THREE.Group();
  const white = flatMaterial('#efe9dc', 0.7);
  const neckR = 0.034 * s;
  const collar = buildLoft({
    sections: [
      { pos: new THREE.Vector3(0, 0.81 * s, -0.004 * s), rx: neckR * 1.16, rzF: neckR * 1.18, rzB: neckR * 1.22, n: 2.2 },
      { pos: new THREE.Vector3(0, 0.848 * s, -0.003 * s), rx: neckR * 1.04, rzF: neckR * 1.05, rzB: neckR * 1.1, n: 2.2 },
    ],
    segments: 12, ringsPer: 1,
    weightFn: chainWeights([{ bone: rig.index.Chest, to: 0.3 }, { bone: rig.index.Neck, to: 10 }], 0.3),
  });
  group.add(makeSkinnedMesh(collar, white, skeleton));

  // neckwear is dark silk, never the accent color: a golden tie reads as a
  // misplaced ribbon
  const tieColor = { laborer: 'charcoal', trade: 'burgundy', middle: 'navy', upper: 'black' }[p.socialClass] || 'charcoal';
  if (tie === 'fourInHand') {
    const tieMat = clothMaterial({ colorName: tieColor, wear: 0, sheen: 0.55 });
    const knot = new THREE.Mesh(new THREE.BoxGeometry(0.017 * s, 0.019 * s, 0.009 * s), tieMat);
    attachRigid(p, rig, knot, new THREE.Vector3(0, 0.80 * s, neckR * 1.24));
    const rows = torsoSections(p, 0.004);
    const pts = [];
    const widths = [];
    for (let i = 0; i <= 3; i += 1) {
      const y = 0.792 - i * 0.018;
      const r = torsoRadiusAt(rows, y * s);
      pts.push(new THREE.Vector3(0, y * s, r.rzF + 0.0035 * s));
      widths.push((0.014 + i * 0.002) * s);
    }
    const band = ribbon(pts, widths, new THREE.Vector3(0, 0, 1), tieMat.clone());
    attachWorld(rig, band, 'Chest');
  } else if (tie === 'kerchief') {
    const mat = clothMaterial({ colorName: p.accentColor, wear: 0.3 });
    const roll = new THREE.Mesh(new THREE.TorusGeometry(neckR * 1.22, 0.007 * s, 6, 12), mat);
    roll.rotation.x = Math.PI / 2 - 0.12;
    attachRigid(p, rig, roll, new THREE.Vector3(0, 0.815 * s, 0));
    const knot = new THREE.Mesh(new THREE.SphereGeometry(0.009 * s, 6, 5), mat.clone());
    attachRigid(p, rig, knot, new THREE.Vector3(0, 0.80 * s, torsoRadiusAt(torsoSections(p, 0), 0.80 * s).rzF + 0.008 * s));
  }
  return group;
}

function buildWaistcoat(p, rig, skeleton, { colorName, pattern, wear, accent, chain = true, frontOnly = false }) {
  const s = p.height;
  const group = new THREE.Group();
  const material = clothMaterial({ colorName, pattern, wear });
  const rows = torsoSlice(p, 0.007, 0.578, 0.798, 5);
  const geometry = buildLoft({
    sections: rows, segments: frontOnly ? 10 : 16, ringsPer: frontOnly ? 1 : 2,
    phiStart: frontOnly ? FRONT - 0.95 : 0,
    phiLength: frontOnly ? 1.9 : Math.PI * 2,
    uvTile: 0.3,
    weightFn: torsoWeightsFor(p, rig),
  });
  group.add(makeSkinnedMesh(geometry, material, skeleton));
  group.add(buttonRow(p, rig, torsoSlice(p, 0.009, 0.58, 0.798, 5), 0.6, 0.778, 5, '#2a2320', 0.004));
  if (chain) {
    const anchorRows = torsoSlice(p, 0.010, 0.578, 0.79, 7);
    const a = surfacePoint(anchorRows, 0.635 * s, FRONT - 0.6, 0);
    const b = surfacePoint(anchorRows, 0.635 * s, FRONT + 0.6, 0);
    const sag = new THREE.Vector3(0, 0.605 * s, torsoRadiusAt(anchorRows, 0.62 * s).rzF + 0.004 * s);
    const curve = new THREE.QuadraticBezierCurve3(a, sag, b);
    const chainMesh = new THREE.Mesh(new THREE.TubeGeometry(curve, 10, 0.0016 * s, 4), flatMaterial('#a98b4e', 0.35, { metalness: 0.7 }));
    attachWorld(rig, chainMesh, 'Spine1');
  }
  return group;
}

function buildBraces(p, rig, skeleton, accent) {
  const s = p.height;
  const group = new THREE.Group();
  const material = clothMaterial({ colorName: accent, wear: 0.2 });
  const rows = torsoSlice(p, 0.006, 0.575, 0.835, 8);
  for (const side of [1, -1]) {
    const phiF = FRONT - side * 0.42;
    const phiB = FRONT + Math.PI + side * 0.42;
    const pts = [];
    for (const y of [0.585, 0.65, 0.72, 0.785]) pts.push(surfacePoint(rows, y * s, phiF, 0.004 * s));
    pts.push(new THREE.Vector3(side * 0.052 * s, 0.845 * s, -0.01 * s));
    for (const y of [0.78, 0.71, 0.64, 0.585]) pts.push(surfacePoint(rows, y * s, phiB, 0.004 * s));
    const widths = pts.map(() => 0.014 * s);
    const strap = ribbon(pts, widths, new THREE.Vector3(0, 0, 1), material.clone());
    // skin the strap by height so it follows the torso
    const geo = strap.geometry;
    const pos = geo.getAttribute('position');
    const skinIndices = [];
    const skinWeights = [];
    const weightFn = torsoWeightsFor(p, rig);
    for (let i = 0; i < pos.count; i += 1) {
      const pairs = weightFn(0, 0, new THREE.Vector3(pos.getX(i), pos.getY(i), pos.getZ(i)));
      const idx = [0, 0, 0, 0];
      const w = [0, 0, 0, 0];
      pairs.slice(0, 4).forEach((pr, k) => { idx[k] = pr[0]; w[k] = pr[1]; });
      skinIndices.push(...idx);
      skinWeights.push(...w);
    }
    geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skinIndices, 4));
    geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(skinWeights, 4));
    const skinned = new THREE.SkinnedMesh(geo, strap.material);
    skinned.castShadow = true;
    skinned.frustumCulled = false;
    skinned.bind(skeleton, new THREE.Matrix4());
    group.add(skinned);
  }
  return group;
}

function buildShirtBody(p, rig, skeleton, { colorName = 'ivory', pattern, wear }) {
  const s = p.height;
  const group = new THREE.Group();
  const material = clothMaterial({ colorName, pattern: pattern === 'stripe' ? 'stripe' : 'plain', wear: wear * 0.5 });
  const rows = torsoSlice(p, 0.004, 0.575, 0.828, 6);
  group.add(makeSkinnedMesh(buildLoft({ sections: rows, segments: 16, ringsPer: 2, capEnd: true, uvTile: 0.3, weightFn: torsoWeightsFor(p, rig) }), material, skeleton));
  for (const side of [1, -1]) {
    const puff = (t) => (t > 0.9 ? 1.25 : 1 + Math.sin(t * Math.PI) * 0.12);
    const sections = armSections(p, rig, side, 0.006, puff);
    const geometry = buildLoft({ sections, segments: 10, ringsPer: 1, uvTile: 0.3, capStart: true, weightFn: armWeights(rig, side) });
    group.add(makeSkinnedMesh(geometry, material.clone(), skeleton));
  }
  return group;
}

// Under a coat only the collar area, the V bib, and the cuffs can be seen;
// building the full shirt would spend a third of the triangle budget on
// hidden cloth.
function buildShirtMinimal(p, rig, skeleton) {
  const s = p.height;
  const group = new THREE.Group();
  const white = flatMaterial('#efe9dc', 0.7);
  const bibRows = torsoSlice(p, 0.0035, 0.71, 0.828, 3);
  group.add(makeSkinnedMesh(buildLoft({
    sections: bibRows, segments: 8, ringsPer: 1,
    phiStart: FRONT - 0.42, phiLength: 0.84,
    weightFn: torsoWeightsFor(p, rig),
  }), white, skeleton));
  for (const side of [1, -1]) {
    const S = side > 0 ? 'L' : 'R';
    const el = rig.joints[`Forearm${S}`];
    const wr = rig.joints[`Hand${S}`];
    const a = el.clone().lerp(wr, 0.94);
    const b = el.clone().lerp(wr, 1.0);
    const r = 0.017 * s;
    group.add(makeSkinnedMesh(buildLoft({
      sections: [
        { pos: a, rx: r, rzF: r, rzB: r, n: 2 },
        { pos: b, rx: r * 0.96, rzF: r * 0.96, rzB: r * 0.96, n: 2 },
      ],
      segments: 8, ringsPer: 1, weightFn: armWeights(rig, side),
    }), white.clone(), skeleton));
  }
  return group;
}

function buildCoat(p, rig, skeleton, opts) {
  const {
    colorName, pattern, wear, hemY, flare, ease = 0.011, shoulderPad = 0.005,
    buttons = 3, stanceY = 0.72,
  } = opts;
  const s = p.height;
  const group = new THREE.Group();
  const material = clothMaterial({ colorName, pattern, wear });

  const easeFn = (y) => ease + shoulderPad * smoothstep(0.74, 0.81, y);

  // one continuous coat body: closed below the button stance, the front
  // gap widening smoothly into the V above it
  const withGap = (row, gap) => ({
    ...row,
    phiStart: FRONT + gap,
    phiLength: Math.PI * 2 - gap * 2,
  });
  const bodyRows = [];
  const waistRow = torsoRadiusAt(torsoSections(p, 0), 0.60 * s);
  for (let i = 0; i <= 3; i += 1) {
    const t = 1 - i / 3;
    const y = (0.60 - (0.60 - hemY) * t) * s;
    const grow = 1 + (flare - 1) * t ** 1.3;
    // extra clearance below the waist: the trouser legs pass just inside
    const clear = (ease + 0.004 * t) * s;
    bodyRows.push(withGap({
      pos: new THREE.Vector3(0, y, -0.004 * s * t),
      rx: (waistRow.rx + clear) * grow,
      rzF: (waistRow.rzF + clear) * grow,
      rzB: (waistRow.rzB + clear) * (grow * 1.06),
      n: 2.3,
    }, 0.02));
  }
  const upperGaps = [[0.65, 0.02], [stanceY, 0.06], [0.775, 0.2], [0.806, 0.35], [0.838, 0.5]];
  for (const [y, gap] of upperGaps) {
    const rows = torsoSlice(p, easeFn, y, y, 1);
    bodyRows.push(withGap(rows[0], gap));
  }
  group.add(makeSkinnedMesh(buildLoft({
    sections: bodyRows, segments: 16, ringsPer: 1, uvTile: 0.3,
    capEnd: true,
    weightFn: torsoWeightsFor(p, rig),
  }), material, skeleton));

  // lapels fold back along the V edges
  const lapelRows = torsoSlice(p, easeFn, 0.60, 0.838, 5);
  for (const side of [1, -1]) {
    const pts = [
      surfacePoint(lapelRows, 0.828 * s, FRONT - side * 0.48, 0.004 * s),
      surfacePoint(lapelRows, 0.785 * s, FRONT - side * 0.28, 0.007 * s),
      surfacePoint(lapelRows, (stanceY + 0.005) * s, FRONT - side * 0.08, 0.005 * s),
    ];
    const lapel = ribbon(pts, [0.016 * s, 0.021 * s, 0.010 * s], new THREE.Vector3(0, 0.25, 1).normalize(), material.clone());
    attachWorld(rig, lapel, 'Chest');
  }

  // sleeves: long, only a thin band of shirt cuff shows
  for (const side of [1, -1]) {
    const sleeveSections = armSections(p, rig, side, ease + 0.003, null);
    sleeveSections.pop();
    sleeveSections[0].pos.lerp(sleeveSections[1].pos, 0.45);
    for (const k of ['rx', 'rzF', 'rzB']) sleeveSections[0][k] *= 0.9;
    const wr = rig.joints[`Hand${side > 0 ? 'L' : 'R'}`];
    const el = rig.joints[`Forearm${side > 0 ? 'L' : 'R'}`];
    const cuffEnd = el.clone().lerp(wr, 0.97);
    const r = (0.0205 + ease) * s;
    sleeveSections.push({ pos: cuffEnd, rx: r, rzF: r, rzB: r, n: 2 });
    const geometrySleeve = buildLoft({
      sections: sleeveSections, segments: 10, ringsPer: 1, uvTile: 0.3,
      capStart: true, // sleeve heads are visible from above
      weightFn: armWeights(rig, side),
    });
    group.add(makeSkinnedMesh(geometrySleeve, material.clone(), skeleton));
  }

  // rolled collar in plain self-colored cloth: patterned collars swirl
  const collarColor = new THREE.Color(CLOTH_COLORS[colorName] || '#333').multiplyScalar(0.82);
  const neckR = 0.037 * s;
  const collar = buildLoft({
    sections: [
      { pos: new THREE.Vector3(0, 0.812 * s, -0.006 * s), rx: neckR * 1.18, rzF: neckR * 1.25, rzB: neckR * 1.22, n: 2.2 },
      { pos: new THREE.Vector3(0, 0.845 * s, -0.008 * s), rx: neckR * 1.22, rzF: neckR * 1.28, rzB: neckR * 1.35, n: 2.2 },
      { pos: new THREE.Vector3(0, 0.824 * s, -0.010 * s), rx: neckR * 1.42, rzF: neckR * 1.35, rzB: neckR * 1.6, n: 2.2 },
    ],
    segments: 12, ringsPer: 1,
    phiStart: FRONT + 0.85,
    phiLength: Math.PI * 2 - 1.7,
    weightFn: chainWeights([{ bone: rig.index.Chest, to: 0.4 }, { bone: rig.index.Neck, to: 10 }], 0.3),
  });
  group.add(makeSkinnedMesh(collar, flatMaterial(collarColor, 0.9), skeleton));

  if (buttons > 0) {
    group.add(buttonRow(p, rig, torsoSlice(p, easeFn, 0.575, 0.838, 5), stanceY - buttons * 0.035, stanceY, buttons, '#1d1916', 0.005));
  }

  // hip pocket flaps on shorter coats
  if (hemY >= 0.42) {
    const flapRows = torsoSlice(p, easeFn, 0.5, 0.6, 3);
    for (const side of [1, -1]) {
      const pts = [
        surfacePoint(flapRows, 0.565 * s, FRONT - side * 0.72, 0.004 * s),
        surfacePoint(flapRows, 0.558 * s, FRONT - side * 0.5, 0.005 * s),
      ];
      const flap = ribbon(pts, [0.02 * s, 0.02 * s], new THREE.Vector3(0, 0, 1), material.clone());
      attachWorld(rig, flap, 'Root');
    }
  }
  return group;
}

// ---------- women's pieces ----------

function skirtWeights(p, rig) {
  return (t, phi) => {
    const d = smoothstep(0.16, 0.72, t) * 0.85;
    if (d <= 0) return [[rig.index.Root, 1]];
    const sF = Math.max(0, Math.sin(phi)) ** 2;
    const sB = Math.max(0, -Math.sin(phi)) ** 2;
    const sL = Math.max(0, Math.cos(phi)) ** 2;
    const sR = Math.max(0, -Math.cos(phi)) ** 2;
    const pairs = [[rig.index.Root, 1 - d]];
    if (sF > sB) pairs.push([rig.index.SkirtF, d * sF]);
    else pairs.push([rig.index.SkirtB, d * sB]);
    if (sL > sR) pairs.push([rig.index.SkirtL, d * sL]);
    else pairs.push([rig.index.SkirtR, d * sR]);
    return pairs;
  };
}

function buildSkirt(p, rig, skeleton, { colorName, pattern, wear, fullness = 1, train = 0, trim = null }) {
  const s = p.height;
  const group = new THREE.Group();
  const material = clothMaterial({ colorName, pattern, wear, repeat: [7, 4] });
  const base = torsoSections(p, 0);
  const waist = torsoRadiusAt(base, 0.60 * s);
  const hip = torsoRadiusAt(base, 0.53 * s);
  const hemR = 0.20 * s * fullness;
  const sections = [
    { pos: new THREE.Vector3(0, 0.605 * s, 0), rx: waist.rx + 0.006 * s, rzF: waist.rzF + 0.006 * s, rzB: waist.rzB + 0.008 * s, n: 2.2 },
    { pos: new THREE.Vector3(0, 0.53 * s, 0), rx: hip.rx + 0.012 * s, rzF: hip.rzF + 0.010 * s, rzB: hip.rzB + 0.016 * s, n: 2.2 },
    { pos: new THREE.Vector3(0, 0.40 * s, -0.004 * s), rx: hip.rx * 1.35, rzF: hip.rzF * 1.3, rzB: hip.rzB * 1.45, n: 2.1 },
    { pos: new THREE.Vector3(0, 0.22 * s, -0.010 * s), rx: hemR * 0.78, rzF: hemR * 0.72, rzB: hemR * 0.82 + train * 0.04 * s, n: 2.05 },
    { pos: new THREE.Vector3(0, 0.035 * s, -0.014 * s - train * 0.02 * s), rx: hemR, rzF: hemR * 0.92, rzB: hemR * 1.05 + train * 0.09 * s, n: 2 },
  ];
  const geometry = buildLoft({ sections, segments: 20, ringsPer: 1, uvTile: 0.3, weightFn: skirtWeights(p, rig) });
  group.add(makeSkinnedMesh(geometry, material, skeleton));

  if (trim) {
    const trimMat = clothMaterial({ colorName: trim, wear: 0, sheen: 0.5 });
    for (const hY of [0.09, 0.13]) {
      const t = hY / 0.605;
      const r = hemR * (1 - t * 0.85);
      const band = buildLoft({
        sections: [
          { pos: new THREE.Vector3(0, (hY - 0.008) * s, -0.012 * s), rx: r * 1.005, rzF: r * 0.93, rzB: r * 1.06, n: 2 },
          { pos: new THREE.Vector3(0, (hY + 0.008) * s, -0.012 * s), rx: r * 0.97, rzF: r * 0.9, rzB: r * 1.02, n: 2 },
        ],
        segments: 20, ringsPer: 1, weightFn: skirtWeights(p, rig),
      });
      group.add(makeSkinnedMesh(band, trimMat.clone(), skeleton));
    }
  }
  return group;
}

function buildBodice(p, rig, skeleton, { colorName, pattern, wear, puff, accent, buttons = true, blouson = 0 }) {
  const s = p.height;
  const group = new THREE.Group();
  const material = clothMaterial({ colorName, pattern, wear, repeat: [6, 4] });
  const rows = torsoSlice(p, 0.006, 0.585, 0.838, 6, (y) => blouson * Math.max(0, Math.sin((y - 0.6) / 0.24 * Math.PI)) * 0.012);
  group.add(makeSkinnedMesh(buildLoft({ sections: rows, segments: 16, ringsPer: 2, capEnd: true, uvTile: 0.3, weightFn: torsoWeightsFor(p, rig) }), material, skeleton));

  // leg-of-mutton sleeves: full at the shoulder, tight past the elbow
  for (const side of [1, -1]) {
    const sections = armSections(p, rig, side, 0.005, (t) => {
      if (t < 0.5) return 1 + puff * Math.sin((t / 0.5) * Math.PI) ** 0.9;
      return 1 + Math.max(0, 0.14 - (t - 0.5) * 0.6);
    });
    const geometry = buildLoft({ sections, segments: 12, ringsPer: 1, uvTile: 0.3, capStart: true, weightFn: armWeights(rig, side) });
    group.add(makeSkinnedMesh(geometry, material.clone(), skeleton));
  }

  // standing collar
  const neckR = (p.sex === 'female' ? 0.031 : 0.035) * s;
  const collar = buildLoft({
    sections: [
      { pos: new THREE.Vector3(0, 0.81 * s, -0.004 * s), rx: neckR * 1.2, rzF: neckR * 1.22, rzB: neckR * 1.25, n: 2.1 },
      { pos: new THREE.Vector3(0, 0.845 * s, -0.002 * s), rx: neckR * 1.06, rzF: neckR * 1.08, rzB: neckR * 1.12, n: 2.1 },
    ],
    segments: 10, ringsPer: 1,
    weightFn: chainWeights([{ bone: rig.index.Chest, to: 0.3 }, { bone: rig.index.Neck, to: 10 }], 0.3),
  });
  group.add(makeSkinnedMesh(collar, clothMaterial({ colorName: accent, wear: 0 }), skeleton));

  // belt at the waist
  const waist = torsoRadiusAt(torsoSections(p, 0), 0.60 * s);
  const belt = buildLoft({
    sections: [
      { pos: new THREE.Vector3(0, 0.588 * s, 0), rx: waist.rx + 0.009 * s, rzF: waist.rzF + 0.009 * s, rzB: waist.rzB + 0.009 * s, n: 2.2 },
      { pos: new THREE.Vector3(0, 0.615 * s, 0), rx: waist.rx + 0.008 * s, rzF: waist.rzF + 0.008 * s, rzB: waist.rzB + 0.008 * s, n: 2.2 },
    ],
    segments: 12, ringsPer: 1, weightFn: torsoWeightsFor(p, rig),
  });
  group.add(makeSkinnedMesh(belt, clothMaterial({ colorName: accent === colorName ? 'black' : accent, wear: 0, sheen: 0.4 }), skeleton));

  if (buttons) group.add(buttonRow(p, rig, torsoSlice(p, 0.008, 0.585, 0.838, 8), 0.63, 0.8, 7, CLOTH_COLORS[accent] || '#2a2320', 0.0032));
  return group;
}

function buildApron(p, rig, skeleton) {
  const s = p.height;
  const material = clothMaterial({ colorName: 'cream', wear: 0.45 });
  const base = torsoSections(p, 0);
  const waist = torsoRadiusAt(base, 0.60 * s);
  const hemR = 0.19 * s;
  const sections = [
    { pos: new THREE.Vector3(0, 0.60 * s, 0.004 * s), rx: waist.rx + 0.011 * s, rzF: waist.rzF + 0.011 * s, rzB: waist.rzB, n: 2.2 },
    { pos: new THREE.Vector3(0, 0.42 * s, 0), rx: (waist.rx + 0.011 * s) * 1.35, rzF: waist.rzF * 1.5, rzB: waist.rzB, n: 2.1 },
    { pos: new THREE.Vector3(0, 0.14 * s, -0.006 * s), rx: hemR * 0.95, rzF: hemR * 0.88, rzB: hemR * 0.9, n: 2 },
  ];
  const geometry = buildLoft({
    sections, segments: 10, ringsPer: 1, phiStart: 0.35, phiLength: Math.PI - 0.7,
    weightFn: skirtWeights(p, rig),
  });
  const mesh = makeSkinnedMesh(geometry, material, skeleton);
  mesh.material.side = THREE.DoubleSide;
  return mesh;
}

// ---------- outfit assembly ----------

export function buildOutfit(p, rig, skeleton) {
  const group = new THREE.Group();
  const { outfit } = p;
  const opts = { colorName: p.coatColor, pattern: p.fabricPattern, wear: p.wear };
  const bootShine = p.socialClass === 'upper' ? 0.8 : p.socialClass === 'middle' ? 0.6 : 0.3;
  const bootColor = p.socialClass === 'laborer' ? '#2e251c' : '#1c1815';

  if (p.sex === 'male') {
    group.add(buildBoots(p, rig, skeleton, { color: bootColor, shine: bootShine }));
    if (outfit === 'shirtsleeves') {
      group.add(buildTrousers(p, rig, skeleton, { colorName: p.legColor, pattern: p.fabricPattern, wear: p.wear }));
      group.add(buildShirtBody(p, rig, skeleton, { colorName: p.coatColor, pattern: p.fabricPattern, wear: p.wear }));
      group.add(buildBraces(p, rig, skeleton, p.accentColor));
      group.add(buildShirtCollarAndTie(p, rig, skeleton, { tie: 'kerchief' }));
    } else {
      const coatBy = {
        workJacket: { hemY: 0.50, flare: 1.05, buttons: 4, stanceY: 0.75, ease: 0.013 },
        sackSuit: { hemY: 0.44, flare: 1.12, buttons: 3, stanceY: 0.72 },
        frockCoat: { hemY: 0.30, flare: 1.45, buttons: 4, stanceY: 0.74, shoulderPad: 0.007 },
      };
      const co = coatBy[outfit] || coatBy.sackSuit;
      group.add(buildTrousers(p, rig, skeleton, {
        colorName: p.legColor, pattern: p.fabricPattern, wear: p.wear,
        skipSeat: true, legsTop: co.hemY - 0.02,
      }));
      group.add(buildShirtMinimal(p, rig, skeleton));
      group.add(buildWaistcoat(p, rig, skeleton, {
        colorName: outfit === 'frockCoat' ? p.accentColor : p.legColor,
        pattern: 'plain', wear: p.wear, accent: p.accentColor,
        chain: false, frontOnly: true, // a closed coat hides the chain
      }));
      group.add(buildShirtCollarAndTie(p, rig, skeleton, { tie: 'fourInHand' }));
      group.add(buildCoat(p, rig, skeleton, { ...opts, ...co }));
    }
  } else {
    group.add(buildBoots(p, rig, skeleton, { color: bootColor, shine: bootShine * 0.7 }));
    const puffBy = { workDress: 0.5, shirtwaist: 1.0, walkingDress: 1.35, visitingDress: 1.6 };
    const fullnessBy = { workDress: 0.92, shirtwaist: 1, walkingDress: 1.08, visitingDress: 1.18 };
    const bodiceColor = outfit === 'shirtwaist' ? (['cream', 'ivory', 'dove', 'chambray'].includes(p.coatColor) ? p.coatColor : 'ivory') : p.coatColor;
    group.add(buildSkirt(p, rig, skeleton, {
      colorName: p.legColor, pattern: p.fabricPattern, wear: p.wear,
      fullness: fullnessBy[outfit] || 1,
      train: outfit === 'visitingDress' ? 1 : 0,
      trim: outfit === 'visitingDress' ? p.accentColor : null,
    }));
    group.add(buildBodice(p, rig, skeleton, {
      colorName: bodiceColor, pattern: p.fabricPattern, wear: p.wear,
      puff: puffBy[outfit] || 1, accent: p.accentColor,
      blouson: outfit === 'shirtwaist' ? 1 : 0,
    }));
    if (outfit === 'workDress') group.add(buildApron(p, rig, skeleton));
  }
  return group;
}
