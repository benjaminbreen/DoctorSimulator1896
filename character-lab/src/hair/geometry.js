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

function angleLerp(from, to, amount) {
  return from + wrapAngle(to - from) * amount;
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
  const templePuff = gauss(Math.abs(wrapAngle(azimuth)) - 1.10, 0.38)
    * gauss(t - 0.68, 0.24) * (profile.templePuff ?? 0.72);
  thickness += 0.0085 * templePuff * (values.sideVolume ?? 1);
  thickness *= volume;
  // Low-frequency, seeded variation breaks the mathematically perfect dome
  // without turning the silhouette into random lumps.
  const seedPhase = (Number(values.seed) || 1) * 0.017;
  const irregularity = Math.sin(azimuth * 2 + seedPhase) * 0.55
    + Math.sin(azimuth * 3 - seedPhase * 1.7) * 0.30
    + Math.sin(t * Math.PI * 3 + seedPhase * 0.7) * 0.15;
  thickness *= 1 + irregularity * (0.018 + (values.waveAmount ?? 0.35) * 0.025);
  // Finish almost flush with the scalp. The old 30% minimum made the leading
  // edge hover like the brim of a hat.
  thickness *= 0.12 + 0.88 * smooth((1 - t) / 0.18);
  return thickness;
}

function scalpCoordinatesForDirection(scalp, frame, direction) {
  const polar = Math.acos(THREE.MathUtils.clamp(direction.dot(frame.headUp), -1, 1));
  const azimuth = Math.atan2(direction.dot(frame.right), direction.dot(frame.forward));
  const row = THREE.MathUtils.clamp(
    (polar - 0.04) / (Math.PI * 0.62) * (scalp.ROWS - 1), 0, scalp.ROWS - 1,
  );
  return { azimuth, row };
}

function slerpDirection(from, to, amount) {
  const dot = THREE.MathUtils.clamp(from.dot(to), -0.99999, 0.99999);
  const angle = Math.acos(dot);
  if (angle < 0.0001) return from.clone().lerp(to, amount).normalize();
  const denominator = Math.sin(angle);
  return from.clone().multiplyScalar(Math.sin((1 - amount) * angle) / denominator)
    .addScaledVector(to, Math.sin(amount * angle) / denominator).normalize();
}

export function flowAnchor(profile, values, seedAzimuth = Math.PI) {
  const cropped = ['cropped-waves', 'short-parted'].includes(profile.mass);
  const sweep = THREE.MathUtils.clamp(values.flowSweep ?? 0.68, 0, 1);
  const convergence = cropped ? 0.30 : THREE.MathUtils.lerp(0.22, 0.075, sweep);
  return {
    azimuth: Math.PI + wrapAngle(seedAzimuth - Math.PI) * convergence,
    row: profile.flowAnchorRow ?? (cropped ? 0.20 : 0.62),
  };
}

/** Trace one streamline of the comb field from a hairline seed to the rear
 * mass anchor, on the scalp surface. Front seeds detour over the crown guide
 * (hair swept up and back); nape seeds travel directly up into the mass. */
function traceFlow(scalp, frame, profile, values, seedAzimuth, segments) {
  const depth = hairlineDepth(profile, values, seedAzimuth);
  const anchor = flowAnchor(profile, values, seedAzimuth);
  const sweep = THREE.MathUtils.clamp(values.flowSweep ?? 0.68, 0, 1);
  const frontness = smooth((Math.cos(wrapAngle(seedAzimuth)) + 1) / 2);
  // Front strands must pass close over the crown or the polar cap goes bald —
  // the streamline union is the only scalp coverage there. Parted styles pull
  // sideways off the part; unparted hair travels straight over the top.
  const sidewaysPull = profile.part
    ? THREE.MathUtils.lerp(0.62, 0.18 + sweep * 0.36, frontness)
    : THREE.MathUtils.lerp(0.62, 0.10, frontness);
  const guideAzimuth = angleLerp(seedAzimuth, Math.PI, sidewaysPull);
  const directGuideRow = (depth + anchor.row) / 2;
  const profileGuideRow = profile.flowGuideRow ?? THREE.MathUtils.lerp(0.36, 0.24, sweep);
  const crownGuideRow = profileGuideRow * (1 - 0.78 * frontness);
  const guideRow = THREE.MathUtils.lerp(directGuideRow, crownGuideRow, frontness);
  const rowScale = scalp.ROWS - 1;
  const startDirection = scalpPoint(scalp, seedAzimuth, depth * rowScale).sub(frame.centre).normalize();
  const guideDirection = scalpPoint(scalp, guideAzimuth, guideRow * rowScale).sub(frame.centre).normalize();
  const endDirection = scalpPoint(scalp, anchor.azimuth, anchor.row * rowScale).sub(frame.centre).normalize();
  const samples = [];
  for (let segment = 0; segment <= segments; segment++) {
    const t = segment / segments;
    // Stop short of full convergence: the mass geometry covers the last
    // stretch, and a true pinch degenerates the shell's tangent basis.
    const arc = t * 0.955;
    const split = 0.58;
    const direction = arc < split
      ? slerpDirection(startDirection, guideDirection, smooth(arc / split))
      : slerpDirection(guideDirection, endDirection, smooth((arc - split) / (1 - split)));
    const coordinates = scalpCoordinatesForDirection(scalp, frame, direction);
    const point = scalpPoint(scalp, coordinates.azimuth, coordinates.row);
    const localDepth = hairlineDepth(profile, values, coordinates.azimuth) * rowScale;
    const shellT = THREE.MathUtils.clamp(coordinates.row / Math.max(0.001, localDepth), 0, 1);
    samples.push({ point, azimuth: coordinates.azimuth, row: coordinates.row, shellT, t });
  }
  return { samples, anchor, depth };
}

/** A fitted centreline running from a real hairline seed toward the style's
 * rear mass. Both visible ribbons and verification use this same field. */
export function buildFlowPath(scalp, frame, profile, values, seedAzimuth, segments = 12) {
  const { samples, anchor } = traceFlow(scalp, frame, profile, values, seedAzimuth, segments);
  const wave = values.waveAmount ?? 0.35;
  const centres = samples.map((sample) => {
    const point = sample.point.clone();
    const outward = point.clone().sub(frame.centre).normalize();
    point.addScaledVector(outward, hairThickness(profile, values, sample.azimuth, sample.shellT) + 0.00125);
    const across = new THREE.Vector3().crossVectors(frame.headUp, outward);
    if (across.lengthSq() < 0.00001) across.copy(frame.right);
    across.normalize();
    point.addScaledVector(across, Math.sin(sample.t * Math.PI * (2.0 + wave * 1.6) + seedAzimuth * 2.3)
      * wave * 0.0017 * Math.sin(sample.t * Math.PI));
    return point;
  });
  return { centres, anchor, start: centres[0] };
}

function buildStreamlinePatch(scalp, frame, profile, values, seedStart, seedEnd, columns) {
  const rows = 16;
  const parted = Boolean(profile.part);
  const positions = [];
  const uvs = [];
  const colors = [];
  const indices = [];
  const seed = Number(values.seed) || 1;
  const outward = new THREE.Vector3();
  for (let column = 0; column <= columns; column++) {
    const u = column / columns;
    const seedAzimuth = THREE.MathUtils.lerp(seedStart, seedEnd, u);
    const { samples } = traceFlow(scalp, frame, profile, values, seedAzimuth, rows);
    // Whole locks vary slightly in value; this is what reads as combed hair
    // rather than a single moulded surface at portrait distance.
    const clump = 1 + (randomAt(seed + 11, column) - 0.5) * 0.10;
    for (let row = 0; row <= rows; row++) {
      const sample = samples[row];
      let thickness = hairThickness(profile, values, sample.azimuth, sample.shellT);
      if (parted) {
        const edgeDistance = Math.min(u, 1 - u);
        const nearPartFront = 1 - smooth(sample.t / 0.55);
        thickness *= 1 - (1 - (0.30 + 0.70 * smooth(edgeDistance / 0.085))) * nearPartFront;
      }
      outward.copy(sample.point).sub(frame.centre).normalize();
      const point = sample.point.clone().addScaledVector(outward, thickness);
      positions.push(point.x, point.y, point.z);
      // v runs root-to-mass along the comb direction, so the strand texture's
      // v=0 root shadow always lands exactly on the hairline.
      uvs.push(u, sample.t);
      const tone = clump * (0.88 + 0.12 * smooth(sample.t / 0.30));
      colors.push(tone, tone, tone);
    }
  }
  const stride = rows + 1;
  for (let column = 0; column < columns; column++) for (let row = 0; row < rows; row++) {
    const a = column * stride + row;
    const b = a + stride;
    indices.push(a, b, b + 1, a, b + 1, a + 1);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeTangents();
  return geometry;
}

export function buildHairShells(scalp, frame, profile, values) {
  if (!profile.part) {
    return [buildStreamlinePatch(scalp, frame, profile, values, 0, TAU, 96)];
  }
  const part = profile.partAzimuth;
  const gap = THREE.MathUtils.lerp(0.035, 0.105, values.partWidth ?? 0.28);
  // The angular gap exists only at the seeds; the streamlines converge toward
  // the anchor, so the visible part tapers away naturally over the crown.
  return [
    buildStreamlinePatch(scalp, frame, profile, values, part + gap, part + Math.PI - 0.015, 52),
    buildStreamlinePatch(scalp, frame, profile, values, part - gap, part - Math.PI + 0.015, 52),
  ];
}

function appendRibbon(target, centres, widths, frame, alphaTip = false, colorMultiplier = null) {
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
    if (target.colors) {
      const color = colorMultiplier || [1, 1, 1];
      target.colors.push(...color, ...color);
    }
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
  if (target.colors?.length) geometry.setAttribute('color', new THREE.Float32BufferAttribute(target.colors, 3));
  geometry.setIndex(target.indices);
  geometry.computeVertexNormals();
  geometry.computeTangents();
  return geometry;
}

export function buildFlowRibbons(scalp, frame, profile, values) {
  const target = { positions: [], uvs: [], colors: [], indices: [] };
  const count = 44;
  const seed = Number(values.seed) || 1;
  const greyColor = [0.62, 0.60, 0.57];
  for (let ribbon = 0; ribbon < count; ribbon++) {
    const azimuth = (ribbon + 0.5 + (randomAt(seed, ribbon) - 0.5) * 0.48) / count * TAU;
    const partClearance = THREE.MathUtils.lerp(0.045, 0.115, values.partWidth ?? 0.28);
    if (profile.part && Math.abs(wrapAngle(azimuth - profile.partAzimuth)) < partClearance) continue;
    const { centres } = buildFlowPath(scalp, frame, profile, values, azimuth, 12);
    const widths = centres.map(() => 0.0014 + randomAt(seed + 31, ribbon) * 0.0016);
    // Natural greying selects complete hairs, weighted toward the temples,
    // rather than turning the whole cap uniformly grey.
    const temple = gauss(Math.abs(wrapAngle(azimuth)) - 1.20, 0.48);
    const greyProbability = THREE.MathUtils.clamp(values.greyAmount ?? 0, 0, 1) * (0.22 + temple * 0.78);
    const isGrey = randomAt(seed + 900, ribbon) < greyProbability;
    // Non-grey ribbons stay near the shell value; the material supplies only a
    // restrained sheen lift, never the cream fronds of the first attempt.
    const lift = 0.94 + randomAt(seed + 620, ribbon) * 0.16;
    const multiplier = isGrey ? greyColor : [lift, lift, lift];
    appendRibbon(target, centres, widths, frame, false, multiplier);
  }
  return finishRibbons(target);
}

export function buildHairlineWisps(scalp, frame, profile, values) {
  const target = { positions: [], uvs: [], colors: [], indices: [] };
  const amount = values.wispAmount ?? 0.45;
  const templeCount = Math.round(6 + amount * 14);
  const napeCount = Math.round(3 + amount * 7);
  const count = templeCount + napeCount;
  const seed = (Number(values.seed) || 1) + 500;
  for (let wisp = 0; wisp < count; wisp++) {
    const atNape = wisp >= templeCount;
    const localIndex = atNape ? wisp - templeCount : wisp;
    const side = localIndex % 2 ? 1 : -1;
    const localCount = atNape ? napeCount : templeCount;
    const rank = Math.floor(localIndex / 2) / Math.max(1, Math.ceil(localCount / 2) - 1);
    const azimuth = atNape
      ? Math.PI + side * (0.10 + rank * 0.72 + (randomAt(seed, wisp) - 0.5) * 0.12)
      : side * (0.42 + rank * 1.02 + (randomAt(seed, wisp) - 0.5) * 0.11);
    const depth = hairlineDepth(profile, values, azimuth);
    const centres = [];
    const widths = [];
    const segments = 6;
    for (let segment = 0; segment <= segments; segment++) {
      // Baby hairs barely cross the hairline; the first attempt let these run
      // far onto the forehead and they read as painted fronds.
      const t = (atNape ? 0.84 : 0.78) + (segment / segments) * (atNape ? 0.22 : 0.24 + amount * 0.04);
      const point = scalpPoint(scalp, azimuth, t * depth * (scalp.ROWS - 1));
      const outward = point.clone().sub(frame.centre).normalize();
      const sideDirection = scalpPoint(scalp, azimuth + 0.022, t * depth * (scalp.ROWS - 1))
        .sub(scalpPoint(scalp, azimuth - 0.022, t * depth * (scalp.ROWS - 1))).normalize();
      point.addScaledVector(outward, hairThickness(profile, values, azimuth, Math.min(t, 1)) + 0.0018);
      point.addScaledVector(sideDirection, Math.sin((segment / segments) * Math.PI) * side
        * (randomAt(seed + 91, wisp) - 0.2) * (atNape ? 0.006 : 0.0045) * amount);
      if (atNape) point.addScaledVector(frame.headUp, -((segment / segments) ** 1.4) * 0.009 * amount);
      centres.push(point);
      widths.push(0.0009 + randomAt(seed + 181, wisp) * 0.0011);
    }
    appendRibbon(target, centres, widths, frame, true);
  }
  return finishRibbons(target);
}

/** Shading factor (0 = untouched skin, 1 = full root shadow) for one world
 * position against the fitted hairline. Painted into the skin overlay texture
 * as a smooth gradient — geometry fringes and alpha dithering both shimmered. */
export function scalpShadeFactor(scalp, frame, profile, values, worldPoint) {
  const direction = worldPoint.clone().sub(frame.centre);
  const distance = direction.length();
  if (distance < 0.02 || distance > 0.22) return 0;
  direction.divideScalar(distance);
  const polar = Math.acos(THREE.MathUtils.clamp(direction.dot(frame.headUp), -1, 1));
  const azimuth = Math.atan2(direction.dot(frame.right), direction.dot(frame.forward));
  const rowFraction = (polar - 0.04) / (Math.PI * 0.62);
  if (rowFraction > 1.35) return 0;
  // Only surfaces lying on the skull get shading: the ears and nose protrude
  // past the fitted scalp radius and must not inherit a shadow band.
  const surface = scalpPoint(scalp, azimuth, clamp01(rowFraction) * (scalp.ROWS - 1));
  const radius = surface.distanceTo(frame.centre);
  if (distance > radius + 0.010 || distance < radius - 0.030) return 0;
  const depth = hairlineDepth(profile, values, azimuth);
  const signedRows = (rowFraction - depth) * (scalp.ROWS - 1);
  if (signedRows > 0.85) return 0;
  // Full covered scalp sits under an opaque shell; the flat term only shows
  // through the part gap, where a dark seam is the correct read.
  const deep = 0.42 * smooth((-signedRows - 0.55) / 1.6);
  const rim = 0.40 * gauss(signedRows + 0.55, 0.45);
  return Math.min(0.58, Math.max(deep, rim)) * smooth((0.45 - signedRows) / 0.6);
}
