import * as THREE from 'three';
import { resolveHairPalette } from './hair/palette.js';

// Lightweight portrait hair for Meta MHR. The older cross-renderer hair
// system solves strand flow, texture synthesis and dense scalp fitting. MHR
// only needs adjustable period silhouette blocks at this stage: two low-poly
// shell panels, one or two rear masses, and a handful of form-defining ridges.

const clamp = (value, minimum, maximum) => THREE.MathUtils.clamp(value, minimum, maximum);

function worldPosition(object) {
  return object.getWorldPosition(new THREE.Vector3());
}

function frameFor(model, bones, values) {
  model.updateMatrixWorld(true);
  const head = worldPosition(bones.head);
  const neck = bones.neck ? worldPosition(bones.neck) : head.clone().add(new THREE.Vector3(0, -0.08, 0));
  const up = head.clone().sub(neck).normalize();
  const forward = new THREE.Vector3(0, 0, 1).transformDirection(model.matrixWorld);
  forward.addScaledVector(up, -forward.dot(up));
  if (forward.lengthSq() < 1e-8) forward.set(0, 0, 1);
  forward.normalize();
  const right = new THREE.Vector3().crossVectors(up, forward).normalize();
  const body = model.getObjectByName?.('body_mesh');
  const landmarks = body?.geometry?.userData?.faceLandmarks;
  const source = body?.geometry?.attributes?.position;
  const samples = { right: [], up: [], forward: [] };
  const point = new THREE.Vector3();
  if (body?.getVertexPosition && source && landmarks) {
    const cutoff = landmarks.mouthY - landmarks.eyeSpan * 0.72;
    for (let vertex = 0; vertex < source.count; vertex += 1) {
      if (source.getY(vertex) < cutoff) continue;
      body.getVertexPosition(vertex, point).applyMatrix4(body.matrixWorld).sub(head);
      samples.right.push(point.dot(right));
      samples.up.push(point.dot(up));
      samples.forward.push(point.dot(forward));
    }
  }
  const percentile = (items, amount, fallback) => {
    if (items.length < 20) return fallback;
    items.sort((a, b) => a - b);
    return items[Math.round((items.length - 1) * amount)];
  };
  const left = percentile(samples.right, 0.025, -0.084);
  const rightEdge = percentile(samples.right, 0.975, 0.084);
  const bottom = percentile(samples.up, 0.025, 0.0);
  const top = percentile(samples.up, 0.995, 0.212);
  const back = percentile(samples.forward, 0.025, -0.094);
  const front = percentile(samples.forward, 0.91, 0.094);
  const centre = head.clone()
    .addScaledVector(right, (left + rightEdge) * 0.5)
    .addScaledVector(up, bottom + (top - bottom) * 0.55)
    // The front percentile still includes brow/nasal projection. Bias the
    // fitted ellipsoid toward the posterior cranium so its forehead surface
    // meets, rather than floats in front of, the face.
    .addScaledVector(forward, back + (front - back) * 0.43);
  const width = Math.max(0.074, (rightEdge - left) * 0.52);
  const height = Math.max(0.096, (top - bottom) * 0.53);
  const depth = Math.max(0.080, (front - back) * 0.53);
  return {
    centre, head, up, forward, right,
    radii: { width, height, depth },
  };
}

function ellipsoidPoint(frame, azimuth, polar, lift = 0) {
  const sin = Math.sin(polar);
  const cos = Math.cos(polar);
  const point = frame.centre.clone()
    .addScaledVector(frame.right, sin * Math.sin(azimuth) * frame.radii.width)
    .addScaledVector(frame.up, cos * frame.radii.height)
    .addScaledVector(frame.forward, sin * Math.cos(azimuth) * frame.radii.depth);
  const outward = point.clone().sub(frame.centre).normalize();
  return point.addScaledVector(outward, lift);
}

function hairlinePolar(azimuth, values, style) {
  const front = Math.max(0, Math.cos(azimuth));
  const back = Math.max(0, -Math.cos(azimuth));
  const sides = Math.max(0, 1 - front - back);
  const height = clamp(Number(values.hairlineHeight) || 0, -1, 1);
  const recession = clamp(Number(values.templeRecession) || 0, 0, 1);
  const temples = Math.exp(-((Math.abs(azimuth) - 0.88) ** 2) / 0.16);
  const base = front * (style === 'pompadour' ? 1.03 : 1.10) + sides * 1.47 + back * 1.76;
  return base - front * height * 0.12 - temples * recession * 0.10;
}

function shellLift(azimuth, polar, maxPolar, values, style) {
  const volume = clamp(Number(values.hairVolume) || 1, 0.55, 1.55);
  const sideVolume = clamp(Number(values.sideVolume) || 1, 0.55, 1.55);
  const hairHeight = clamp(Number(values.hairHeight) || 1, 0.55, 1.55);
  const front = Math.max(0, Math.cos(azimuth));
  const sides = Math.sin(azimuth) ** 2;
  const crown = Math.max(0, Math.cos(polar));
  const edgeFade = Math.max(0.14, Math.sin(Math.PI * polar / Math.max(0.001, maxPolar)) ** 0.34);
  const pompadour = style === 'pompadour' ? front * Math.max(0, 1 - polar / 1.18) * 0.018 : 0;
  return edgeFade * (
    0.0045 + volume * 0.0062 + sides * sideVolume * 0.0045 + crown * hairHeight * 0.0040 + pompadour
  );
}

function shellGeometry(frame, values, options = {}) {
  const columns = 18;
  const rows = 10;
  const positions = [];
  const indices = [];
  const style = options.style || 'centre-coil';
  const sign = options.sign || 0;
  const partWidth = sign ? THREE.MathUtils.lerp(0.018, 0.105, clamp(Number(values.partWidth) || 0.28, 0, 1)) : 0;
  for (let column = 0; column <= columns; column += 1) {
    const u = column / columns;
    for (let row = 0; row <= rows; row += 1) {
      const t = row / rows;
      const gap = partWidth * (1 - t) ** 1.7;
      const azimuth = sign ? sign * (gap + u * (Math.PI - gap)) : -Math.PI + u * Math.PI * 2;
      const maximum = hairlinePolar(azimuth, values, style);
      const polar = 0.045 + t * (maximum - 0.045);
      const point = ellipsoidPoint(frame, azimuth, polar, shellLift(azimuth, polar, maximum, values, style));
      positions.push(point.x, point.y, point.z);
    }
  }
  for (let column = 0; column < columns; column += 1) {
    for (let row = 0; row < rows; row += 1) {
      const a = column * (rows + 1) + row;
      const b = a + rows + 1;
      indices.push(a, a + 1, b + 1, a, b + 1, b);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function transformPrimitive(geometry, frame, at, scale) {
  geometry.scale(scale[0], scale[1], scale[2]);
  const basis = new THREE.Matrix4().makeBasis(frame.right, frame.up, frame.forward);
  basis.setPosition(at);
  geometry.applyMatrix4(basis);
  return geometry;
}

function ridgeGeometry(frame, values, style, side, lane) {
  const points = [];
  const part = style === 'centre-coil';
    const startAzimuth = side * (part ? 0.055 + lane * 0.085 : 0.12 + lane * 0.11);
  const endAzimuth = side * (0.72 + lane * 0.20);
  for (let step = 0; step <= 9; step += 1) {
    const t = step / 9;
    const azimuth = THREE.MathUtils.lerp(startAzimuth, endAzimuth, t);
    const maximum = hairlinePolar(azimuth, values, style);
    const polar = THREE.MathUtils.lerp(0.18 + lane * 0.045, maximum * 0.88, t);
    points.push(ellipsoidPoint(
      frame, azimuth, polar,
      shellLift(azimuth, polar, maximum, values, style) + 0.0012,
    ));
  }
  return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 22, 0.00105, 5, false);
}

function formGeometries(frame, values, style) {
  const geometries = [];
  if (style === 'centre-coil') {
    geometries.push(
      ['MHR_Hair_LeftPanel', shellGeometry(frame, values, { style, sign: -1 }), 'base'],
      ['MHR_Hair_RightPanel', shellGeometry(frame, values, { style, sign: 1 }), 'base'],
    );
  } else {
    geometries.push(['MHR_Hair_PompadourShell', shellGeometry(frame, values, { style }), 'base']);
  }
  for (const side of [-1, 1]) for (let lane = 0; lane < 4; lane += 1) {
    geometries.push([`MHR_Hair_Ridge_${side}_${lane}`, ridgeGeometry(frame, values, style, side, lane), 'detail']);
  }

  const bunScale = clamp(Number(values.bunSize) || 1, 0.55, 1.55);
  if (style === 'centre-coil') {
    const radius = 0.040 * bunScale;
    const at = frame.centre.clone()
      .addScaledVector(frame.forward, -(frame.radii.depth + radius * 0.47))
      .addScaledVector(frame.up, 0.041 + (Number(values.hairHeight) || 1) * 0.008);
    geometries.push([
      'MHR_Hair_HighKnot',
      transformPrimitive(new THREE.SphereGeometry(1, 18, 12), frame, at, [radius * 1.04, radius * 0.90, radius * 0.72]),
      'base',
    ]);
    geometries.push([
      'MHR_Hair_Coil',
      transformPrimitive(new THREE.TorusGeometry(radius * 0.56, radius * 0.13, 6, 22), frame, at.clone().addScaledVector(frame.forward, -radius * 0.58), [1, 1, 1]),
      'detail',
    ]);
  } else {
    const radius = 0.043 * bunScale;
    const at = frame.centre.clone()
      .addScaledVector(frame.forward, -(frame.radii.depth + radius * 0.42))
      .addScaledVector(frame.up, -0.020);
    for (const side of [-1, 1]) {
      geometries.push([
        `MHR_Hair_Chignon_${side}`,
        transformPrimitive(
          new THREE.SphereGeometry(1, 16, 10), frame,
          at.clone().addScaledVector(frame.right, side * radius * 0.48),
          [radius * 0.82, radius * 0.76, radius * 0.68],
        ),
        side > 0 ? 'detail' : 'base',
      ]);
    }
  }
  return geometries;
}

function styleFor(values) {
  return ['pompadour', 'loose-chignon', 'swept-back'].includes(values.hairStyle)
    ? 'pompadour' : 'centre-coil';
}

export function createMhrHairFormSystem(scene, bones, model) {
  const base = new THREE.MeshStandardMaterial({
    name: 'MHR_HairForm', color: '#2b1a12', roughness: 0.76, metalness: 0,
    side: THREE.DoubleSide,
  });
  const detail = base.clone();
  detail.name = 'MHR_HairFormDetail';
  let pieces = [];

  function updateMaterials(values) {
    const palette = resolveHairPalette(values);
    const grey = clamp(Number(values.greyAmount) || 0, 0, 1);
    const contrast = clamp(Number(values.strandContrast) || 0.45, 0, 1);
    base.color.set(palette.base).lerp(new THREE.Color('#858078'), grey * 0.62);
    detail.color.copy(base.color).lerp(new THREE.Color(palette.sheen), 0.22 + contrast * 0.30);
  }

  function disposePieces() {
    for (const mesh of pieces) { mesh.parent?.remove(mesh); mesh.geometry.dispose(); }
    pieces = [];
  }

  function rebuild(values) {
    disposePieces();
    updateMaterials(values);
    if (!bones.head || !bones.neck) return;
    const frame = frameFor(model, bones, values);
    for (const [name, geometry, material] of formGeometries(frame, values, styleFor(values))) {
      const mesh = new THREE.Mesh(geometry, material === 'detail' ? detail : base);
      mesh.name = name;
      mesh.castShadow = true;
      mesh.frustumCulled = false;
      scene.add(mesh);
      bones.head.attach(mesh);
      pieces.push(mesh);
    }
  }

  function dispose() {
    disposePieces();
    base.dispose(); detail.dispose();
  }

  return {
    rebuild, dispose, destroy: dispose,
    invalidateScalp() {},
    materials: { base, detail, update: updateMaterials, dispose() {} },
    pieces: () => pieces,
  };
}
