import * as THREE from 'three';

const TAU = Math.PI * 2;
const clamp01 = (value) => THREE.MathUtils.clamp(value, 0, 1);
const smooth = (value) => {
  const x = clamp01(value);
  return x * x * (3 - 2 * x);
};
const gauss = (distance, sigma) => Math.exp(-(distance * distance) / (2 * sigma * sigma));

function wrapAngle(angle) {
  return Math.atan2(Math.sin(angle), Math.cos(angle));
}

function randomAt(seed, index) {
  const value = Math.sin(seed * 12.9898 + index * 78.233) * 43758.5453;
  return value - Math.floor(value);
}

export function findBodyMesh(model) {
  let body = null;
  let best = 0;
  model?.traverse((object) => {
    if (!object.isSkinnedMesh) return;
    if (object.name === 'Human_Body') {
      body = object;
      best = Infinity;
      return;
    }
    const count = object.geometry?.attributes?.position?.count || 0;
    if (count > best) {
      best = count;
      body = object;
    }
  });
  return body;
}

export function sampleScalp(model, frame) {
  const body = findBodyMesh(model);
  if (!body) return null;
  const AZ = 64;
  const ROWS = 17;
  const ray = new THREE.Raycaster();
  ray.far = 0.6;
  const dir = new THREE.Vector3();
  const origin = new THREE.Vector3();
  const samples = [];
  for (let a = 0; a < AZ; a++) {
    const azimuth = (a / AZ) * TAU;
    const column = [];
    for (let row = 0; row < ROWS; row++) {
      const t = row / (ROWS - 1);
      const polar = 0.04 + t * (Math.PI * 0.62);
      dir.copy(frame.headUp).multiplyScalar(Math.cos(polar))
        .addScaledVector(frame.forward, Math.sin(polar) * Math.cos(azimuth))
        .addScaledVector(frame.right, Math.sin(polar) * Math.sin(azimuth));
      origin.copy(frame.centre).addScaledVector(dir, 0.45);
      ray.set(origin, dir.clone().negate());
      const hits = ray.intersectObject(body, false);
      column.push(hits.length ? hits[0].point.clone() : frame.centre.clone().addScaledVector(dir, 0.088));
    }
    samples.push(column);
  }

  // Ears and the nose can be the first ray hit. Clamp those isolated outliers
  // so neither one tents the hair shell away from the skull.
  for (let row = 0; row < ROWS; row++) {
    const radii = samples.map((column) => column[row].distanceTo(frame.centre)).sort((a, b) => a - b);
    const median = radii[Math.floor(AZ / 2)];
    for (let a = 0; a < AZ; a++) {
      const point = samples[a][row];
      const distance = point.distanceTo(frame.centre);
      if (distance > median * 1.20) point.sub(frame.centre).multiplyScalar((median * 1.08) / distance).add(frame.centre);
    }
  }
  return { samples, AZ, ROWS };
}

export function scalpPoint(scalp, azimuth, rowValue) {
  const azimuthValue = ((azimuth % TAU) + TAU) % TAU / TAU * scalp.AZ;
  const a0 = Math.floor(azimuthValue) % scalp.AZ;
  const a1 = (a0 + 1) % scalp.AZ;
  const aMix = azimuthValue - Math.floor(azimuthValue);
  const safeRow = THREE.MathUtils.clamp(rowValue, 0, scalp.ROWS - 1);
  const r0 = Math.floor(safeRow);
  const r1 = Math.min(scalp.ROWS - 1, r0 + 1);
  const rMix = safeRow - r0;
  const p0 = scalp.samples[a0][r0].clone().lerp(scalp.samples[a0][r1], rMix);
  const p1 = scalp.samples[a1][r0].clone().lerp(scalp.samples[a1][r1], rMix);
  return p0.lerp(p1, aMix);
}

export function hairlineDepth(profile, values, azimuth) {
  const front = Math.max(0, Math.cos(azimuth)) ** 2.2;
  const back = Math.max(0, -Math.cos(azimuth)) ** 1.7;
  const sides = Math.max(0, 1 - front - back);
  const absoluteFrontAngle = Math.abs(wrapAngle(azimuth));
  const ageRecession = Math.max(0, (values.age ?? 0.5) - 0.58) * 0.08;
  const templeRecession = (0.018 + 0.065 * (values.templeRecession ?? 0.18) + ageRecession)
    * gauss(absoluteFrontAngle - 0.82, 0.30);
  const height = (values.hairlineHeight ?? 0) * 0.065;
  const subtleCentrePoint = profile.part ? 0.012 * gauss(absoluteFrontAngle, 0.20) : 0;
  return THREE.MathUtils.clamp(
    profile.frontDepth * front + profile.sideDepth * sides + profile.napeDepth * back
      - templeRecession - height + subtleCentrePoint,
    0.38,
    0.99,
  );
}

export function hairThickness(profile, values, azimuth, t) {
  const front = Math.max(0, Math.cos(azimuth)) ** 1.5;
  const back = Math.max(0, -Math.cos(azimuth)) ** 1.25;
  const sides = Math.max(0, 1 - front - back);
  const volume = 0.72 + 0.34 * (values.hairVolume ?? 1);
  let thickness = 0.0042
    + (0.008 + 0.013 * ((values.hairHeight ?? 1) - 0.8)) * profile.crown * (1 - t) ** 1.45
    + 0.018 * profile.sides * (values.sideVolume ?? 1) * sides * gauss(t - 0.58, 0.28)
    + 0.010 * back * (0.30 + 0.70 * t);
  thickness *= volume;
  // Finish almost flush with the scalp. The old 30% minimum made the leading
  // edge hover like the brim of a hat.
  thickness *= 0.12 + 0.88 * smooth((1 - t) / 0.18);
  return thickness;
}

function buildPatch(scalp, frame, profile, values, startMeridian, endMeridian) {
  const columns = 34;
  const rows = 14;
  const positions = [];
  const uvs = [];
  const indices = [];
  const hasPart = Boolean(profile.part);
  const maximumGap = hasPart ? THREE.MathUtils.lerp(0.018, 0.060, values.partWidth ?? 0.28) : 0;
  const outward = new THREE.Vector3();
  for (let row = 0; row <= rows; row++) {
    const t = row / rows;
    const partTaper = 1 - smooth(t / 0.62);
    const gap = maximumGap * partTaper;
    for (let column = 0; column <= columns; column++) {
      const u = column / columns;
      const azimuth = THREE.MathUtils.lerp(startMeridian + gap, endMeridian - gap, u);
      const depth = hairlineDepth(profile, values, azimuth);
      const point = scalpPoint(scalp, azimuth, t * depth * (scalp.ROWS - 1));
      outward.copy(point).sub(frame.centre).normalize();
      let thickness = hairThickness(profile, values, azimuth, t);
      if (hasPart && t < 0.66) {
        const edgeDistance = Math.min(u, 1 - u);
        thickness *= 0.25 + 0.75 * smooth(edgeDistance / 0.10);
      }
      point.addScaledVector(outward, thickness);
      positions.push(point.x, point.y, point.z);
      uvs.push((((azimuth % TAU) + TAU) % TAU) / TAU * 2.5, t);
    }
  }
  const stride = columns + 1;
  for (let row = 0; row < rows; row++) for (let column = 0; column < columns; column++) {
    const a = row * stride + column;
    const b = a + 1;
    const c = a + stride + 1;
    const d = a + stride;
    indices.push(a, b, c, a, c, d);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

export function buildHairShells(scalp, frame, profile, values) {
  if (!profile.part) return [buildPatch(scalp, frame, profile, values, 0, TAU)];
  const part = profile.partAzimuth;
  return [
    buildPatch(scalp, frame, profile, values, part, part + Math.PI),
    buildPatch(scalp, frame, profile, values, part + Math.PI, part + TAU),
  ];
}

function appendRibbon(target, centres, widths, frame, alphaTip = false) {
  const base = target.positions.length / 3;
  for (let i = 0; i < centres.length; i++) {
    const previous = centres[Math.max(0, i - 1)];
    const next = centres[Math.min(centres.length - 1, i + 1)];
    const tangent = next.clone().sub(previous).normalize();
    const outward = centres[i].clone().sub(frame.centre).normalize();
    const across = new THREE.Vector3().crossVectors(tangent, outward).normalize();
    const taper = alphaTip ? Math.sin((i / (centres.length - 1)) * Math.PI) ** 0.35 : Math.min(1, i * 0.8, (centres.length - 1 - i) * 0.8);
    const halfWidth = widths[i] * taper;
    const left = centres[i].clone().addScaledVector(across, halfWidth);
    const right = centres[i].clone().addScaledVector(across, -halfWidth);
    target.positions.push(left.x, left.y, left.z, right.x, right.y, right.z);
    target.uvs.push(0, i / (centres.length - 1), 1, i / (centres.length - 1));
  }
  for (let i = 0; i < centres.length - 1; i++) {
    const a = base + i * 2;
    target.indices.push(a, a + 1, a + 3, a, a + 3, a + 2);
  }
}

function finishRibbons(target) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(target.positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(target.uvs, 2));
  geometry.setIndex(target.indices);
  geometry.computeVertexNormals();
  return geometry;
}

export function buildFlowRibbons(scalp, frame, profile, values) {
  const target = { positions: [], uvs: [], indices: [] };
  const count = 48;
  const seed = Number(values.seed) || 1;
  const wave = values.waveAmount ?? 0.35;
  for (let ribbon = 0; ribbon < count; ribbon++) {
    const azimuth = (ribbon + 0.5 + (randomAt(seed, ribbon) - 0.5) * 0.48) / count * TAU;
    const depth = hairlineDepth(profile, values, azimuth);
    const centres = [];
    const widths = [];
    const segments = 8;
    for (let segment = 0; segment <= segments; segment++) {
      const t = 0.08 + (segment / segments) * 0.86;
      const point = scalpPoint(scalp, azimuth, t * depth * (scalp.ROWS - 1));
      const outward = point.clone().sub(frame.centre).normalize();
      const side = scalpPoint(scalp, azimuth + 0.025, t * depth * (scalp.ROWS - 1))
        .sub(scalpPoint(scalp, azimuth - 0.025, t * depth * (scalp.ROWS - 1))).normalize();
      point.addScaledVector(outward, hairThickness(profile, values, azimuth, t) + 0.0012);
      point.addScaledVector(side, Math.sin(t * Math.PI * (2.2 + wave * 1.8) + ribbon * 0.9) * wave * 0.0015);
      centres.push(point);
      widths.push(0.0022 + randomAt(seed + 31, ribbon) * 0.0022);
    }
    appendRibbon(target, centres, widths, frame);
  }
  return finishRibbons(target);
}

export function buildHairlineWisps(scalp, frame, profile, values) {
  const target = { positions: [], uvs: [], indices: [] };
  const amount = values.wispAmount ?? 0.45;
  const count = Math.round(8 + amount * 18);
  const seed = (Number(values.seed) || 1) + 500;
  for (let wisp = 0; wisp < count; wisp++) {
    const side = wisp % 2 ? 1 : -1;
    const rank = Math.floor(wisp / 2) / Math.max(1, Math.ceil(count / 2) - 1);
    const azimuth = side * (0.10 + rank * 1.22 + (randomAt(seed, wisp) - 0.5) * 0.09);
    const depth = hairlineDepth(profile, values, azimuth);
    const centres = [];
    const widths = [];
    const segments = 6;
    for (let segment = 0; segment <= segments; segment++) {
      const t = 0.72 + (segment / segments) * (0.34 + amount * 0.035);
      const point = scalpPoint(scalp, azimuth, t * depth * (scalp.ROWS - 1));
      const outward = point.clone().sub(frame.centre).normalize();
      const sideDirection = scalpPoint(scalp, azimuth + 0.022, t * depth * (scalp.ROWS - 1))
        .sub(scalpPoint(scalp, azimuth - 0.022, t * depth * (scalp.ROWS - 1))).normalize();
      point.addScaledVector(outward, hairThickness(profile, values, azimuth, Math.min(t, 1)) + 0.0018);
      point.addScaledVector(sideDirection, Math.sin((segment / segments) * Math.PI) * side * (randomAt(seed + 91, wisp) - 0.2) * 0.004 * amount);
      centres.push(point);
      widths.push(0.0011 + randomAt(seed + 181, wisp) * 0.0013);
    }
    appendRibbon(target, centres, widths, frame, true);
  }
  return finishRibbons(target);
}
