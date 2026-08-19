import * as THREE from 'three';

// Skinned loft builder: sweeps a superellipse cross-section along a spine
// curve. Every body part and garment in the parametric figure is one of
// these, so silhouette quality lives here.

function clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }

function smoothstep(a, b, v) {
  const t = clamp((v - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
}

// Uniform Catmull-Rom over an array of scalars, f in [0, values.length - 1].
function crScalar(values, f) {
  const last = values.length - 1;
  const i = clamp(Math.floor(f), 0, Math.max(0, last - 1));
  const t = f - i;
  const p0 = values[Math.max(i - 1, 0)];
  const p1 = values[i];
  const p2 = values[Math.min(i + 1, last)];
  const p3 = values[Math.min(i + 2, last)];
  return 0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t
    + (-p0 + 3 * p1 - 3 * p2 + p3) * t * t * t);
}

function superellipse(phi, n) {
  const c = Math.cos(phi);
  const s = Math.sin(phi);
  const e = 2 / n;
  return {
    x: Math.sign(c) * Math.abs(c) ** e,
    z: Math.sign(s) * Math.abs(s) ** e,
  };
}

// sections: [{ pos: Vector3, rx, rzF, rzB, n }], ordered along the spine.
// rzF is the radius toward frontHint, rzB away from it. weightFn(t, phi, pos)
// returns up to four [boneIndex, weight] pairs; omit it for rigid geometry.
export function buildLoft({
  sections,
  segments = 16,
  ringsPer = 2,
  frontHint = new THREE.Vector3(0, 0, 1),
  phiStart = 0,
  phiLength = Math.PI * 2,
  capStart = false,
  capEnd = false,
  weightFn = null,
  shadeFn = null,
  uvTile = 0, // >0: metric UVs, one texture tile per this many meters
}) {
  const points = sections.map((s) => s.pos.clone());
  const curve = new THREE.CatmullRomCurve3(points, false, 'catmullrom', 0.5);
  const chan = (key, dflt) => sections.map((s) => s[key] ?? dflt);
  const rxs = chan('rx', 0);
  const rzFs = chan('rzF', 0);
  const rzBs = chan('rzB', 0);
  const ns = chan('n', 2);
  // per-section phi range: lets one loft close below a front opening and
  // taper the gap above it (coat V-fronts) without stacked sector seams
  const phiSs = chan('phiStart', phiStart);
  const phiLs = chan('phiLength', phiLength);

  const rings = sections.length === 1 ? 1 : (sections.length - 1) * ringsPer + 1;
  const cols = segments + 1;
  const closed = Math.abs(phiLength - Math.PI * 2) < 1e-6;

  const positions = [];
  const uvs = [];
  const skinIndices = [];
  const skinWeights = [];
  const colors = [];
  const up = frontHint.clone().normalize();

  const pushWeights = (t, phi, pos) => {
    if (!weightFn) return;
    const pairs = weightFn(t, phi, pos) || [];
    const idx = [0, 0, 0, 0];
    const w = [0, 0, 0, 0];
    let total = 0;
    for (let k = 0; k < Math.min(4, pairs.length); k += 1) {
      idx[k] = pairs[k][0];
      w[k] = pairs[k][1];
      total += pairs[k][1];
    }
    if (total <= 0) { w[0] = 1; total = 1; }
    skinIndices.push(idx[0], idx[1], idx[2], idx[3]);
    skinWeights.push(w[0] / total, w[1] / total, w[2] / total, w[3] / total);
  };

  const pushShade = (t, phi) => {
    if (!shadeFn) return;
    const c = shadeFn(t, phi);
    colors.push(c[0], c[1], c[2]);
  };

  const ringCenters = [];
  let vDist = 0;
  let prevCenter = null;
  for (let r = 0; r < rings; r += 1) {
    const s = rings === 1 ? 0 : r / (rings - 1);
    const f = s * (sections.length - 1);
    const center = curve.getPoint(s);
    ringCenters.push(center);
    if (prevCenter) vDist += center.distanceTo(prevCenter);
    prevCenter = center;
    const tangent = sections.length === 1
      ? new THREE.Vector3(0, 1, 0)
      : curve.getTangent(s).normalize();
    let u = new THREE.Vector3().crossVectors(tangent, up);
    if (u.lengthSq() < 1e-8) u = new THREE.Vector3(1, 0, 0);
    u.normalize();
    const v = new THREE.Vector3().crossVectors(u, tangent).normalize();

    const rx = crScalar(rxs, f);
    const rzF = crScalar(rzFs, f);
    const rzB = crScalar(rzBs, f);
    const n = Math.max(1.6, crScalar(ns, f));
    const ringPhiS = crScalar(phiSs, f);
    const ringPhiL = crScalar(phiLs, f);

    // metric UVs: constant physical pattern size regardless of body radius
    const rzAvg = (rzF + rzB) / 2;
    const perimeter = Math.PI * (3 * (rx + rzAvg) - Math.sqrt((3 * rx + rzAvg) * (rx + 3 * rzAvg)));
    const uScale = uvTile > 0 ? (perimeter * (ringPhiL / (Math.PI * 2))) / uvTile : 1;
    const vCoord = uvTile > 0 ? vDist / uvTile : s;

    for (let c = 0; c < cols; c += 1) {
      const phi = ringPhiS + (c / segments) * ringPhiL;
      const e = superellipse(phi, n);
      const rz = e.z >= 0 ? rzF : rzB;
      const p = center.clone()
        .addScaledVector(u, e.x * rx)
        .addScaledVector(v, e.z * rz);
      positions.push(p.x, p.y, p.z);
      uvs.push((c / segments) * uScale, vCoord);
      pushWeights(s, phi, p);
      pushShade(s, phi);
    }
  }

  const indices = [];
  for (let r = 0; r < rings - 1; r += 1) {
    for (let c = 0; c < segments; c += 1) {
      const a = r * cols + c;
      const b = a + 1;
      const d = a + cols;
      const e = d + 1;
      indices.push(a, d, b, b, d, e);
    }
  }

  const addCap = (ringIndex, flip) => {
    const center = ringCenters[ringIndex];
    const t = ringIndex === 0 ? 0 : 1;
    const ci = positions.length / 3;
    positions.push(center.x, center.y, center.z);
    uvs.push(0.5, t);
    pushWeights(t, 0, center);
    pushShade(t, 0);
    const base = ringIndex * cols;
    for (let c = 0; c < segments; c += 1) {
      const a = base + c;
      const b = base + c + 1;
      if (flip) indices.push(ci, b, a);
      else indices.push(ci, a, b);
    }
  };
  if (capStart) addCap(0, false);
  if (capEnd && rings > 1) addCap(rings - 1, true);

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  if (weightFn) {
    geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skinIndices, 4));
    geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(skinWeights, 4));
  }
  if (shadeFn) geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  if (closed) mergeSeamNormals(geometry, rings, cols);
  return geometry;
}

// The duplicated seam column gets split normals from computeVertexNormals;
// average them so closed lofts shade as one surface.
function mergeSeamNormals(geometry, rings, cols) {
  const normal = geometry.getAttribute('normal');
  for (let r = 0; r < rings; r += 1) {
    const a = r * cols;
    const b = r * cols + cols - 1;
    const nx = (normal.getX(a) + normal.getX(b)) / 2;
    const ny = (normal.getY(a) + normal.getY(b)) / 2;
    const nz = (normal.getZ(a) + normal.getZ(b)) / 2;
    normal.setXYZ(a, nx, ny, nz);
    normal.setXYZ(b, nx, ny, nz);
  }
  normal.needsUpdate = true;
}

// Weight function for a chain of bones along the loft: spans is
// [{ bone, to }] with cumulative end positions in t, last `to` >= 1.
export function chainWeights(spans, blend = 0.08) {
  return (t) => {
    let i = 0;
    while (i < spans.length - 1 && t > spans[i].to) i += 1;
    const pairs = [[spans[i].bone, 1]];
    if (i < spans.length - 1) {
      const w = smoothstep(spans[i].to - blend, spans[i].to + blend, t);
      if (w > 0) { pairs[0][1] = 1 - w; pairs.push([spans[i + 1].bone, w]); }
    }
    if (i > 0) {
      const w = 1 - smoothstep(spans[i - 1].to - blend, spans[i - 1].to + blend, t);
      if (w > 0) { pairs[0][1] -= w; pairs.push([spans[i - 1].bone, w]); }
    }
    return pairs;
  };
}

export function makeSkinnedMesh(geometry, material, skeleton) {
  const mesh = new THREE.SkinnedMesh(geometry, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.frustumCulled = false;
  mesh.bind(skeleton, new THREE.Matrix4());
  return mesh;
}

export { clamp, smoothstep, crScalar };
