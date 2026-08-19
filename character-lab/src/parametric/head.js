import * as THREE from 'three';
import { smoothstep, clamp, buildLoft } from './surfaces.js';
import { HAIR_COLORS, EYE_COLORS, SKIN_TONES } from './params.js';

// Parametric head: a sphere with sampling densified toward the face,
// sculpted by smooth displacement fields (brow ridge, sockets, nose, cheeks,
// jaw, chin). Complexion is vertex color; expressions are two procedural
// morph targets plus jaw/brow/lid bones.

// Crowd budget: the whole figure targets ~5k tris, so the head gets a coarse
// grid with sampling warped hard toward the face.
const ROWS = 24;
const COLS = 34;

// Ben's hand-tuned baseline (2026-08-18), folded in so sliders at zero and
// random rolls center on this look: wider-set eyes, narrower nose, fuller
// cheeks, longer wider face, thinner lips.
const FACE_BASELINE = {
  faceWidth: 0.5, faceLength: 0.74, jawWidth: 1.0, chin: -0.34,
  cheekbones: 0, gauntness: -1.0, noseSize: 0, noseWidth: -0.78,
  noseBridge: 0.43, eyeSize: 0, eyeSpacing: 1.0, browWeight: 0.49,
  mouthWidth: 0.03, lipFullness: -0.68, earSize: 0.12,
};

export function applyFaceBaseline(p) {
  const out = { ...p };
  for (const [k, v] of Object.entries(FACE_BASELINE)) out[k] = (p[k] ?? 0) + v;
  return out;
}

// Windowed cosine falloff around a feature direction. c is the cutoff dot.
function mask(d, f, c, k = 2) {
  const dot = d.x * f.x + d.y * f.y + d.z * f.z;
  if (dot <= c) return 0;
  return ((dot - c) / (1 - c)) ** k;
}

function norm(x, y, z) { return new THREE.Vector3(x, y, z).normalize(); }

// Authored centerline profile: [dir-space y, z as fraction of head depth].
// The face front blends toward this curve, so the silhouette (forehead,
// brow, maxilla, lips, chin, throat) is designed rather than emergent.
function profileCurve(p, male) {
  const chinZ = clamp(1.03 + p.chin * 0.08 + (male ? 0.015 : 0), 0.98, 1.14);
  return [
    [1.0, 0.10], [0.62, 0.72], [0.30, 0.96], [0.12, 0.90],
    [-0.15, 0.95], [-0.45, 0.985], [-0.60, 0.965], [-0.74, 0.95],
    [-0.84, chinZ], [-0.93, 0.72], [-1.0, 0.2],
  ];
}

function profileZ(points, y) {
  if (y >= points[0][0]) return points[0][1];
  for (let i = 0; i < points.length - 1; i += 1) {
    const [y0, z0] = points[i];
    const [y1, z1] = points[i + 1];
    if (y <= y0 && y >= y1) {
      const t = (y0 - y) / (y0 - y1);
      const e = t * t * (3 - 2 * t);
      return z0 + (z1 - z0) * e;
    }
  }
  return points[points.length - 1][1];
}

// All face landmark directions in unit-sphere space: y up, z out the face.
function landmarks(p) {
  const spread = 0.35 + p.eyeSpacing * 0.075;
  return {
    eyeL: norm(spread, 0.03, 0.88), eyeR: norm(-spread, 0.03, 0.88),
    browL: norm(spread * 0.95, 0.26, 0.85), browR: norm(-spread * 0.95, 0.26, 0.85),
    noseRidge: norm(0, -0.1, 1), noseTip: norm(0, -0.30, 0.96),
    noseWingL: norm(0.13, -0.38, 0.9), noseWingR: norm(-0.13, -0.38, 0.9),
    mouth: norm(0, -0.60, 0.80),
    cornerL: norm(0.24, -0.575, 0.74), cornerR: norm(-0.24, -0.575, 0.74),
    chin: norm(0, -0.9, 0.44),
    jawL: norm(0.6, -0.56, 0.18), jawR: norm(-0.6, -0.56, 0.18),
    cheekL: norm(0.58, -0.08, 0.56), cheekR: norm(-0.58, -0.08, 0.56),
    hollowL: norm(0.58, -0.38, 0.46), hollowR: norm(-0.58, -0.38, 0.46),
    earL: norm(0.99, -0.02, -0.08), earR: norm(-0.99, -0.02, -0.08),
  };
}

// Shared head shape closure: hair, hats, and the head mesh itself all sample
// the same displaced surface so shells sit flush.
export function createHeadShape(p) {
  const s = p.height;
  const hs = p.headSize;
  const L = landmarks(p);
  const male = p.sex === 'male';

  const ax = 0.0480 * hs * (1 + p.faceWidth * 0.14) * s;
  const ay = 0.0660 * hs * (1 + p.faceLength * 0.12) * s;
  const az = 0.0578 * hs * s;
  const center = new THREE.Vector3(0, 0.9375 * s * (1 + (hs - 1) * 0.4), -0.004 * s);

  const u = (v) => v * s * hs; // feature amplitudes scale with head size
  const profile = profileCurve(p, male);

  const displace = (d) => {
    // start on the ellipsoid
    const pos = new THREE.Vector3(d.x * ax, d.y * ay, d.z * az);

    // jaw taper: lower face narrows toward the chin. Clamped: extreme rolls
    // must never produce a collapsed, chinless lower face.
    const lower = smoothstep(-0.15, -0.8, d.y) * smoothstep(-0.45, 0.1, d.z);
    const jawSlim = clamp(0.20 - p.jawWidth * 0.14 - (male ? 0.035 : 0) + Math.max(0, p.gauntness) * 0.05, 0.04, 0.32);
    pos.x *= 1 - lower * jawSlim;

    // blend the face front toward the authored profile curve. The gate
    // relaxes for the lower face: chin directions have low raw frontness
    // but must still reach their authored projection.
    const relax = smoothstep(-0.45, -0.9, d.y) * 0.45;
    const pw = smoothstep(0.35, 0.7, d.z + relax) * smoothstep(0.6, 0.25, Math.abs(d.x));
    if (pw > 0) {
      const target = az * profileZ(profile, d.y);
      pos.z = pos.z * (1 - pw) + target * pw;
    }
    // sides under the jaw still cut back toward the throat
    const under = smoothstep(-0.62, -0.92, d.y) * smoothstep(0.35, -0.45, d.z) * smoothstep(0.15, 0.45, Math.abs(d.x));
    pos.z -= under * u(0.014);

    let out = 0; // displacement along the radial direction
    out += (mask(d, L.jawL, 0.8, 2.2) + mask(d, L.jawR, 0.8, 2.2)) * u(0.0035 + p.jawWidth * 0.004 + (male ? 0.0012 : 0));
    // brow ridge: band across the front above the eyes
    const browBand = Math.exp(-(((d.y - 0.27) / 0.13) ** 2)) * smoothstep(0.35, 0.75, d.z);
    out += browBand * u(0.0038 + p.browWeight * 0.008 + (male ? 0.002 : 0));
    // eye sockets, with a deeper recessed aperture the eyeball sits inside
    const sockets = mask(d, L.eyeL, 0.9, 1.8) + mask(d, L.eyeR, 0.9, 1.8);
    out -= sockets * u(0.0055 + Math.max(0, p.gauntness) * 0.0015);
    const aperture = mask(d, L.eyeL, 0.945, 1.3) + mask(d, L.eyeR, 0.945, 1.3);
    out -= aperture * u(0.004 + p.eyeSize * 0.0015);
    // eyelid rims around the aperture
    const lidUp = (mask(d, L.eyeL, 0.9, 1.6) * smoothstep(0.01, 0.07, d.y - L.eyeL.y))
      + (mask(d, L.eyeR, 0.9, 1.6) * smoothstep(0.01, 0.07, d.y - L.eyeR.y));
    const lidLo = (mask(d, L.eyeL, 0.9, 1.6) * smoothstep(0.015, 0.06, L.eyeL.y - d.y))
      + (mask(d, L.eyeR, 0.9, 1.6) * smoothstep(0.015, 0.06, L.eyeR.y - d.y));
    out += lidUp * u(0.0035) + lidLo * u(0.0025);
    // cheekbones and hollows
    out += (mask(d, L.cheekL, 0.82, 2) + mask(d, L.cheekR, 0.82, 2)) * u(0.0032 + p.cheekbones * 0.008);
    out -= (mask(d, L.hollowL, 0.84, 2) + mask(d, L.hollowR, 0.84, 2)) * u(Math.max(0, p.gauntness) * 0.008 + 0.0008 - Math.max(0, -p.gauntness) * 0.004);
    // temples slightly in
    out -= (mask(d, norm(0.8, 0.3, 0.35), 0.88, 2) + mask(d, norm(-0.8, 0.3, 0.35), 0.88, 2)) * u(0.002);

    pos.addScaledVector(d, out);

    const front = smoothstep(0.55, 0.9, d.z);

    // chin ball roundness on top of the profile curve's projection
    const chinM = mask(d, norm(0, -0.76, 0.62), 0.78, 1.7);
    pos.z += chinM * u(0.004 + p.chin * 0.0025);
    // mentolabial fold between lower lip and chin: this crease is what makes
    // a chin read from the front, not just in profile
    const mento = Math.exp(-(((d.y + 0.74) / 0.035) ** 2)) * (1 - Math.min(1, Math.abs(d.x) / 0.22)) * smoothstep(0.4, 0.7, d.z);
    pos.z -= mento * u(0.0024);

    // nose, built from directional lobes rather than one forward ridge — a
    // single +z displacement can only make a triangular bas-relief.
    const nWidth = Math.max(0.65, 1 + p.noseWidth * 0.55);
    const nSize = (1 + p.noseSize * 0.8) * (male ? 1 : 0.85);
    // dorsum: rounded cross-section, widening toward the base
    const widthAt = Math.max(0.10, (0.115 + 0.13 * smoothstep(0.2, -0.34, d.y)) * nWidth);
    const nx = Math.min(1, Math.abs(d.x) / widthAt);
    const ny = (d.y + 0.11) / 0.27;
    const ridge = Math.cos(nx * Math.PI / 2) * Math.max(0, 1 - ny * ny) * front;
    pos.z += ridge ** 1.1 * u(0.010) * nSize;
    pos.z += mask(d, norm(0, 0.14, 0.99), 0.93, 2) * u(0.0025 + p.noseBridge * 0.009);
    // tip: its own lobe, pushed slightly downward so it overhangs
    const tipM = mask(d, norm(0, -0.28, 0.96), 0.88, 1.5);
    pos.addScaledVector(norm(0, -0.12, 0.99), tipM * u(0.013) * nSize);
    // alar wings bulge LATERALLY: front-view width lives here
    for (const sgn of [1, -1]) {
      const wingM = mask(d, norm(sgn * 0.30 * nWidth, -0.34, 0.88), 0.925, 1.6);
      pos.addScaledVector(norm(sgn * 0.6, -0.12, 0.78), wingM * u(0.008) * nWidth);
    }
    // nostril wells: real divots, not just paint
    for (const sgn of [1, -1]) {
      const nosM = mask(d, norm(sgn * 0.15 * nWidth, -0.44, 0.88), 0.965, 1.8);
      pos.addScaledVector(d, -nosM * u(0.0042));
    }
    // philtrum groove from nose base to upper lip
    const phil = Math.exp(-((d.x / 0.055) ** 2)) * Math.exp(-(((d.y + 0.49) / 0.04) ** 2)) * front;
    pos.z -= phil * u(0.0022);
    // cut under the nose base
    pos.z -= Math.exp(-(((d.y + 0.45) / 0.026) ** 2)) * (1 - Math.min(1, Math.abs(d.x) / 0.2)) * front * u(0.0025);

    // a soft base swell under the separate lip meshes
    const mouthBand = smoothstep(0.5, 0.82, d.z) * (1 - Math.min(1, Math.abs(d.x) / (0.30 + p.mouthWidth * 0.06)));
    if (mouthBand > 0) {
      pos.z += Math.exp(-(((d.y + 0.60) / 0.09) ** 2)) * mouthBand * u(0.0014);
    }
    return pos.add(center);
  };

  return { displace, landmarks: L, center, axes: { ax, ay, az }, scale: s * hs };
}

// Face bones must sit exactly on the generated features; call before the
// skeleton binding is captured.
export function layoutFaceBones(p, rig, shape) {
  const { displace, landmarks: L } = shape;
  const headWorld = rig.joints.Head;
  const place = (name, world) => {
    const bone = rig.bones[name];
    bone.position.copy(world).sub(headWorld);
    rig.joints[name] = world.clone();
  };
  const eyeL = displace(L.eyeL).addScaledVector(L.eyeL, -0.0035 * shape.scale);
  const eyeR = displace(L.eyeR).addScaledVector(L.eyeR, -0.0035 * shape.scale);
  place('EyeL', eyeL); place('EyeR', eyeR);
  place('LidL', eyeL); place('LidR', eyeR);
  place('BrowL', displace(L.browL)); place('BrowR', displace(L.browR));
  const jaw = displace(L.earL).lerp(displace(L.earR), 0.5);
  jaw.z -= 0.004 * shape.scale;
  place('Jaw', jaw);
}

// Painted face texture: per-pixel contours in the head's UV space, so the
// shading detail survives the coarse crowd-budget mesh. Each texel maps
// back through the sampling warp to a direction on the head sphere, and
// the features are painted with the same field math the sculpt uses.
export function paintFaceTexture(p, L) {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(size, size);
  const data = img.data;

  const male = p.sex === 'male';
  // paint in sRGB display space: routing through THREE.Color would write
  // linear components into an sRGB canvas and darken everything
  const hexRgb = (hex) => {
    const n = parseInt(hex.slice(1), 16);
    return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
  };
  const base = hexRgb(SKIN_TONES[p.skinTone]);
  const lipRgb = hexRgb('#8a4a42');
  const lipMix = male ? 0.5 : 0.62;
  const lipColor = base.map((c, i) => c * (1 - lipMix) + lipRgb[i] * lipMix);
  const age = p.age ?? 40;
  const aged = smoothstep(42, 72, age);

  const d = { x: 0, y: 0, z: 0 };
  for (let py = 0; py < size; py += 1) {
    const uLat = (py / (size - 1)) * Math.PI;
    const lat = uLat + 0.45 * Math.sin(2 * uLat) / 2;
    const sy = Math.cos(lat);
    const sr = Math.sin(lat);
    for (let px = 0; px < size; px += 1) {
      const t = (px / (size - 1)) * Math.PI * 2 - Math.PI;
      const lon = t - 0.62 * Math.sin(t);
      d.x = sr * Math.sin(lon);
      d.y = sy;
      d.z = sr * Math.cos(lon);

      let r = base[0], g = base[1], b = base[2];
      // skin grain so the surface never reads as smooth plastic
      const grain = (Math.sin(px * 12.9898 + py * 78.233) * 43758.5453) % 1;
      const gr = 1 + (grain - 0.5) * 0.055;
      r *= gr; g *= gr; b *= gr;

      const front = smoothstep(0.3, 0.7, d.z);
      // orbital shading and aperture
      const socket = mask(d, L.eyeL, 0.87, 1.5) + mask(d, L.eyeR, 0.87, 1.5);
      const aperture = mask(d, L.eyeL, 0.955, 1.4) + mask(d, L.eyeR, 0.955, 1.4);
      const lash = (mask(d, L.eyeL, 0.92, 1.7) * smoothstep(0.05, 0.02, Math.abs(d.y - L.eyeL.y - 0.05)))
        + (mask(d, L.eyeR, 0.92, 1.7) * smoothstep(0.05, 0.02, Math.abs(d.y - L.eyeR.y - 0.05)));
      let dark = socket * 0.10 + aperture * 0.42 + lash * 0.38;
      // under-eye with age
      dark += (mask(d, L.eyeL, 0.9, 1.8) + mask(d, L.eyeR, 0.9, 1.8)) * smoothstep(0.01, 0.05, L.eyeL.y - d.y) * (0.05 + aged * 0.12);
      // nostrils
      const nostrils = Math.exp(-(((d.y + 0.52) / 0.05) ** 2))
        * (Math.exp(-(((d.x - 0.13) / 0.05) ** 2)) + Math.exp(-(((d.x + 0.13) / 0.05) ** 2))) * front;
      dark += nostrils * 0.4;
      // nose side shading gives the ridge its planes
      const noseSide = Math.exp(-(((Math.abs(d.x) - 0.1) / 0.05) ** 2)) * Math.exp(-(((d.y + 0.2) / 0.3) ** 2)) * front;
      dark += noseSide * 0.06;
      // mouth line between the lip meshes
      const mouthLine = Math.exp(-(((d.y + 0.61) / 0.018) ** 2))
        * (1 - Math.min(1, Math.abs(d.x) / (0.26 + p.mouthWidth * 0.05))) * front;
      dark += mouthLine * 0.42;
      // mentolabial and nasolabial creases
      dark += Math.exp(-(((d.y + 0.74) / 0.03) ** 2)) * (1 - Math.min(1, Math.abs(d.x) / 0.2)) * front * 0.10;
      const nasX = Math.abs(d.x) - (0.2 + (-d.y - 0.42) * 0.38);
      const naso = Math.exp(-((nasX / 0.045) ** 2)) * smoothstep(-0.4, -0.5, d.y) * (1 - smoothstep(-0.62, -0.72, d.y)) * front;
      dark += naso * (0.05 + aged * 0.16);
      // temple and jaw-edge shading round the face off
      dark += (mask(d, { x: 0.85, y: 0.25, z: 0.35 }, 0.9, 2) + mask(d, { x: -0.85, y: 0.25, z: 0.35 }, 0.9, 2)) * 0.06;
      dark += smoothstep(-0.62, -0.95, d.y) * smoothstep(0.2, -0.3, d.z) * 0.10;

      r *= 1 - dark; g *= 1 - dark * 1.06; b *= 1 - dark;

      // warmth: cheeks, nose tip, ears
      const warm = (mask(d, L.cheekL, 0.86, 2) + mask(d, L.cheekR, 0.86, 2)) * (male ? 0.4 : 0.6)
        + mask(d, L.noseTip, 0.92, 2.2) * 0.5;
      g *= 1 - warm * 0.08; b *= 1 - warm * 0.12;

      // lips painted under the lip meshes so gaps never show skin
      const lipBand = Math.exp(-(((d.y + 0.615) / 0.075) ** 2))
        * (1 - Math.min(1, Math.abs(d.x) / (0.28 + p.mouthWidth * 0.05))) * front;
      const lw = Math.min(1, lipBand * 1.4);
      r = r * (1 - lw) + lipColor[0] * lw;
      g = g * (1 - lw) + lipColor[1] * lw;
      b = b * (1 - lw) + lipColor[2] * lw;

      // shaved beard shadow
      if (male && p.facialHair === 'clean') {
        const shave = smoothstep(-0.3, -0.6, d.y) * smoothstep(-0.1, 0.4, d.z) * 0.07;
        r -= shave; g -= shave * 0.9; b -= shave * 0.7;
      }

      const i = (py * size + px) * 4;
      data[i] = Math.max(0, Math.min(255, r * 255));
      data[i + 1] = Math.max(0, Math.min(255, g * 255));
      data[i + 2] = Math.max(0, Math.min(255, b * 255));
      data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

export function buildHead(p, rig, skeleton, shape) {
  const { displace, landmarks: L } = shape;
  const s = p.height;
  const group = new THREE.Group();

  const positions = [];
  const skinIndices = [];
  const skinWeights = [];
  const uvs = [];
  const smile = [];
  const frown = [];
  const dirs = [];

  const iHead = rig.index.Head;
  const iJaw = rig.index.Jaw;
  const iBrowL = rig.index.BrowL;
  const iBrowR = rig.index.BrowR;

  for (let row = 0; row <= ROWS; row += 1) {
    const uLat = (row / ROWS) * Math.PI;
    const lat = uLat + 0.45 * Math.sin(2 * uLat) / 2; // densify mid-face band
    for (let col = 0; col <= COLS; col += 1) {
      const tLon = (col / COLS) * Math.PI * 2 - Math.PI;
      const lon = tLon - 0.62 * Math.sin(tLon); // densify toward the face
      const d = new THREE.Vector3(
        Math.sin(lat) * Math.sin(lon),
        Math.cos(lat),
        Math.sin(lat) * Math.cos(lon),
      );
      dirs.push(d);
      const pos = displace(d);
      positions.push(pos.x, pos.y, pos.z);
      uvs.push(col / COLS, 1 - row / ROWS);

      // skin weights: jaw region to the Jaw bone, brow patches to brow bones
      const jawW = Math.min(0.9,
        smoothstep(-0.52, -0.70, d.y) * smoothstep(-0.35, 0.1, d.z) * 1.1
        + (mask(d, L.jawL, 0.86, 2) + mask(d, L.jawR, 0.86, 2)) * 0.4);
      const browW = Math.min(0.65, (mask(d, L.browL, 0.93, 2) * 1.2));
      const browWR = Math.min(0.65, (mask(d, L.browR, 0.93, 2) * 1.2));
      const rest = Math.max(0, 1 - jawW - browW - browWR);
      skinIndices.push(iHead, iJaw, iBrowL, iBrowR);
      skinWeights.push(rest, jawW, browW, browWR);

      // morph targets: smile lifts the corners and cheeks, frown drops them
      const cornerPull = mask(d, L.cornerL, 0.9, 2) + mask(d, L.cornerR, 0.9, 2);
      const cheekLift = mask(d, L.cheekL, 0.86, 2) + mask(d, L.cheekR, 0.86, 2);
      const mouthArea = smoothstep(0.45, 0.75, d.z) * Math.exp(-(((d.y + 0.60) / 0.15) ** 2));
      smile.push(
        cornerPull * 0.004 * s * Math.sign(d.x || 1) * 0.6,
        (cornerPull * 0.0065 + cheekLift * 0.002) * s,
        (cornerPull * 0.001 - mouthArea * 0.0012) * s,
      );
      frown.push(
        -cornerPull * 0.0015 * s * Math.sign(d.x || 1),
        -(cornerPull * 0.005 + mouthArea * 0.0008) * s,
        -cornerPull * 0.0012 * s,
      );
    }
  }

  const indices = [];
  const cols = COLS + 1;
  for (let row = 0; row < ROWS; row += 1) {
    for (let col = 0; col < COLS; col += 1) {
      const a = row * cols + col;
      const b = a + 1;
      const c = a + cols;
      const e = c + 1;
      if (row > 0) indices.push(a, c, b);
      if (row < ROWS - 1) indices.push(b, c, e);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skinIndices, 4));
  geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(skinWeights, 4));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  // average the duplicated seam column
  const normal = geometry.getAttribute('normal');
  for (let row = 0; row <= ROWS; row += 1) {
    const a = row * cols;
    const b = row * cols + COLS;
    const nx = (normal.getX(a) + normal.getX(b)) / 2;
    const ny = (normal.getY(a) + normal.getY(b)) / 2;
    const nz = (normal.getZ(a) + normal.getZ(b)) / 2;
    normal.setXYZ(a, nx, ny, nz);
    normal.setXYZ(b, nx, ny, nz);
  }
  geometry.morphAttributes.position = [
    new THREE.Float32BufferAttribute(smile, 3),
    new THREE.Float32BufferAttribute(frown, 3),
  ];
  geometry.morphTargetsRelative = true;

  const material = new THREE.MeshStandardMaterial({
    map: paintFaceTexture(p, L),
    roughness: 0.55,
  });
  const headMesh = new THREE.SkinnedMesh(geometry, material);
  headMesh.castShadow = true;
  headMesh.receiveShadow = true;
  headMesh.frustumCulled = false;
  headMesh.bind(skeleton, new THREE.Matrix4());
  headMesh.morphTargetInfluences = [0, 0];
  group.add(headMesh);

  group.add(buildEyes(p, rig, shape));
  group.add(buildEars(p, rig, shape));
  group.add(buildBrows(p, rig, shape));
  group.add(buildLips(p, rig, skeleton, shape));
  return { group, headMesh };
}

// Lips as their own meshes: at the crowd triangle budget the head grid is
// too coarse to carry them as displacement. Lower lip rides the jaw bone,
// so the mouth actually opens.
function buildLips(p, rig, skeleton, shape) {
  const s = shape.scale;
  const group = new THREE.Group();
  const skin = new THREE.Color(SKIN_TONES[p.skinTone]);
  const material = new THREE.MeshStandardMaterial({
    color: skin.clone().lerp(new THREE.Color('#7e3a34'), p.sex === 'female' ? 0.65 : 0.5),
    roughness: 0.48,
  });
  const w = 0.30 + p.mouthWidth * 0.09;
  const full = 1 + p.lipFullness * 0.5;

  const lipArc = (yCenter, thick) => {
    const sections = [];
    for (const t of [-1, -0.55, 0, 0.55, 1]) {
      const dir = new THREE.Vector3(t * w, yCenter - Math.abs(t) * 0.035, 1).normalize();
      const pos = shape.displace(dir).addScaledVector(dir, 0.0008 * s);
      const taper = (1 - Math.abs(t) * 0.75) * thick * full;
      sections.push({ pos, rx: taper, rzF: taper * 0.9, rzB: taper * 0.5, n: 2 });
    }
    return sections;
  };

  const upperGeo = buildLoft({
    sections: lipArc(-0.565, 0.0032 * s), segments: 6, ringsPer: 1, capStart: true, capEnd: true,
    frontHint: new THREE.Vector3(0, 0, 1),
    weightFn: () => [[rig.index.Head, 1]],
  });
  const lowerGeo = buildLoft({
    sections: lipArc(-0.655, 0.0040 * s), segments: 6, ringsPer: 1, capStart: true, capEnd: true,
    frontHint: new THREE.Vector3(0, 0, 1),
    weightFn: () => [[rig.index.Jaw, 0.85], [rig.index.Head, 0.15]],
  });
  for (const geo of [upperGeo, lowerGeo]) {
    const mesh = new THREE.SkinnedMesh(geo, material);
    mesh.castShadow = false;
    mesh.frustumCulled = false;
    mesh.bind(skeleton, new THREE.Matrix4());
    group.add(mesh);
  }
  return group;
}

function buildEyes(p, rig, shape) {
  const group = new THREE.Group();
  // larger and shallower-set than anatomical: small deep eyes vanish at
  // crowd distance
  const r = 0.0104 * (1 + p.eyeSize * 0.18) * shape.scale;
  const skinBase = new THREE.Color(SKIN_TONES[p.skinTone]);
  const lidSkin = new THREE.MeshStandardMaterial({ color: skinBase.clone().multiplyScalar(0.9), roughness: 0.55 });
  const white = new THREE.MeshStandardMaterial({ color: '#d5cfc2', roughness: 0.35 });
  const iris = new THREE.MeshStandardMaterial({ color: EYE_COLORS[p.eyeColor], roughness: 0.28 });
  const pupil = new THREE.MeshStandardMaterial({ color: '#0b0908', roughness: 0.25 });

  for (const S of ['L', 'R']) {
    const eyeBone = rig.bones[`Eye${S}`];
    const lidBone = rig.bones[`Lid${S}`];
    const ball = new THREE.Mesh(new THREE.SphereGeometry(r, 10, 7), white);
    // iris as a shallow lens on the ball, pupil proud of it
    const irisMesh = new THREE.Mesh(new THREE.SphereGeometry(r * 0.60, 10, 5), iris);
    irisMesh.scale.z = 0.35;
    irisMesh.position.z = r * 0.82;
    const pupilMesh = new THREE.Mesh(new THREE.SphereGeometry(r * 0.27, 7, 4), pupil);
    pupilMesh.scale.z = 0.4;
    pupilMesh.position.z = r * 0.93;
    ball.add(irisMesh, pupilMesh);
    eyeBone.add(ball);

    // lid shells: narrow rims at rest so the iris stays visible; blink
    // swings the bone
    const upper = new THREE.Mesh(new THREE.SphereGeometry(r * 1.1, 10, 3, 0, Math.PI * 2, 0, Math.PI * 0.27), lidSkin);
    upper.rotation.x = 0.18;
    const lower = new THREE.Mesh(new THREE.SphereGeometry(r * 1.08, 10, 2, 0, Math.PI * 2, Math.PI * 0.76, Math.PI * 0.24), lidSkin);
    lower.rotation.x = -0.1;
    lidBone.add(upper, lower);
  }
  return group;
}

function buildEars(p, rig, shape) {
  const group = new THREE.Group();
  // plain material: the head's vertexColors material would render black on
  // geometry with no color attribute
  const material = new THREE.MeshStandardMaterial({
    color: new THREE.Color(SKIN_TONES[p.skinTone]).multiplyScalar(0.92),
    roughness: 0.6,
  });
  const s = shape.scale;
  const size = 1 + p.earSize * 0.45;
  for (const side of [1, -1]) {
    const dir = side > 0 ? shape.landmarks.earL : shape.landmarks.earR;
    const world = shape.displace(dir);
    const geo = new THREE.SphereGeometry(1, 8, 6, 0, Math.PI);
    geo.scale(0.006 * s * size, 0.014 * s * size, 0.0095 * s * size);
    const ear = new THREE.Mesh(geo, material);
    ear.castShadow = true;
    const local = world.clone().sub(rig.joints.Head);
    local.x += side * 0.001 * s;
    ear.position.copy(local);
    ear.rotation.y = side * Math.PI / 2 * 0.99;
    ear.rotation.z = side * -0.1;
    rig.bones.Head.add(ear);
  }
  return group;
}

function buildBrows(p, rig, shape) {
  const group = new THREE.Group();
  const s = shape.scale;
  const color = new THREE.Color(HAIR_COLORS[p.hairColor]).multiplyScalar(0.75);
  const material = new THREE.MeshStandardMaterial({ color, roughness: 0.9 });
  const w = 0.0026 * s * (1 + p.browWeight * 0.5);
  for (const side of [1, -1]) {
    const geo = new THREE.BufferGeometry();
    const pts = [];
    const idx = [];
    const segs = 7;
    for (let i = 0; i <= segs; i += 1) {
      const t = i / segs;
      const x = (t - 0.5) * 0.024 * s;
      const y = Math.sin(t * Math.PI) * 0.0022 * s - 0.001 * s - (t > 0.6 ? (t - 0.6) * 0.003 * s : 0);
      const taper = 0.6 + 0.6 * Math.sin(Math.min(1, t * 1.4) * Math.PI * 0.5);
      pts.push(x, y + w * 0.5 * taper, 0, x, y - w * 0.5 * taper, 0);
      if (i < segs) {
        const a = i * 2;
        idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
    }
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    const brow = new THREE.Mesh(geo, material);
    brow.position.set(0, 0.002 * s, 0.0075 * s);
    brow.rotation.y = side * -0.35;
    brow.rotation.z = side * -0.06;
    if (side < 0) brow.scale.x = -1;
    rig.bones[side > 0 ? 'BrowL' : 'BrowR'].add(brow);
  }
  return group;
}
