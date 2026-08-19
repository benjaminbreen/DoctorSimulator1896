import * as THREE from 'three';

/* Procedural 1890s garment shell, shared by character-lab and the game.
   Geometry is constructed in scene space at the pose current during rebuild,
   then bound to the body's skeleton as skinned meshes: bodice and sleeves copy
   weights from the nearest body vertices, the skirt gets procedural hip/thigh
   weights plus hem sway bones. Pieces without a usable skinned body fall back
   to rigid bone attachment. Hair is the caller's concern (the lab layers its
   hair systems on top; the game's figures carry their own). */

/* Every value the generator reads, so a caller may pass a sparse set (the
   game's patient recipes carry no garment sliders). Mirrors the lab schema
   defaults. */
export const COSTUME_DEFAULTS = Object.freeze({
  gender: 0.3, weight: 0.48, seated: 1, outfitStyle: 'conservative-day',
  dressColor: '#38202f', secondaryColor: '#817064', trimColor: '#b08a62',
  fabricRoughness: 1.0, fabricSheen: 0.72, fabricRelief: 0.72, fabricScale: 1,
  bodiceFit: 0.96, waistHeight: 0.03, waistTaper: 0.55, bustCurve: 0.55,
  frontPointDepth: 0.5, necklineHeight: 0.78,
  skirtFullness: 1.08, skirtLength: 1.0, skirtDrape: 0.62, hipSpring: 0.5,
  frontFlatness: 0.65, hemPleatCount: 10, hemPleatDepth: 0.45, trainLength: 0.2,
  bustleAmount: 0.12, hemTrimRows: 1, hemRuffle: 0.35, seamLines: 0.4,
  sleeveVolume: 0.82, sleeveLength: 0.98, puffLength: 0.45, sleeveTaper: 0.6,
  gatherDepth: 0.4, cuffWidth: 0.58, cuffThickness: 0.35,
  collarHeight: 0.86, collarSpread: 0.92, collarThickness: 0.35,
  buttonCount: 6, buttonSpacing: 0.95, trimWidth: 0.42, placketWidth: 0.34,
  swayAmount: 0.55, swayStiffness: 0.5, swayDamping: 0.5,
});

const BONE_CANDIDATES = {
  pelvis: ['pelvis', 'c_spine0', 'mixamorighips', 'mixamorig:hips'],
  spine01: ['spine_01', 'c_spine0', 'mixamorigspine', 'mixamorig:spine'],
  spine02: ['spine_02', 'c_spine1', 'mixamorigspine1', 'mixamorig:spine1'],
  spine03: ['spine_03', 'c_spine2', 'mixamorigspine2', 'mixamorig:spine2'],
  neck: ['neck_01', 'neck', 'c_neck', 'mixamorigneck', 'mixamorig:neck'],
  head: ['head', 'c_head', 'mixamorighead', 'mixamorig:head'],
  clavicleL: ['clavicle_l', 'l_clavicle', 'mixamorigleftshoulder', 'mixamorig:leftshoulder'],
  clavicleR: ['clavicle_r', 'r_clavicle', 'mixamorigrightshoulder', 'mixamorig:rightshoulder'],
  upperarmL: ['upperarm_l', 'l_uparm', 'mixamorigleftarm', 'mixamorig:leftarm'],
  upperarmR: ['upperarm_r', 'r_uparm', 'mixamorigrightarm', 'mixamorig:rightarm'],
  lowerarmL: ['lowerarm_l', 'l_lowarm', 'mixamorigleftforearm', 'mixamorig:leftforearm'],
  lowerarmR: ['lowerarm_r', 'r_lowarm', 'mixamorigrightforearm', 'mixamorig:rightforearm'],
  handL: ['hand_l', 'l_wrist', 'mixamoriglefthand', 'mixamorig:lefthand'],
  handR: ['hand_r', 'r_wrist', 'mixamorigrighthand', 'mixamorig:righthand'],
  thighL: ['thigh_l', 'l_upleg', 'mixamorigleftupleg', 'mixamorig:leftupleg'],
  thighR: ['thigh_r', 'r_upleg', 'mixamorigrightupleg', 'mixamorig:rightupleg'],
  calfL: ['calf_l', 'l_lowleg', 'mixamorigleftleg', 'mixamorig:leftleg'],
  calfR: ['calf_r', 'r_lowleg', 'mixamorigrightleg', 'mixamorig:rightleg'],
  footL: ['foot_l', 'l_foot', 'mixamorigleftfoot', 'mixamorig:leftfoot'],
  footR: ['foot_r', 'r_foot', 'mixamorigrightfoot', 'mixamorig:rightfoot'],
};

export function findBones(model) {
  const all = new Map();
  model.traverse((object) => { if (object.isBone) all.set(object.name.toLowerCase(), object); });
  const bones = { fingers: [], thumbs: [], fingerRoots: { L: null, R: null } };
  for (const [key, names] of Object.entries(BONE_CANDIDATES)) {
    bones[key] = null;
    for (const name of names) if (all.has(name)) { bones[key] = all.get(name); break; }
  }
  for (const [name, bone] of all) {
    if (/(index|middle|ring|pinky)_0[1-3]_[lr]$/.test(name)
      || /(?:left|right)hand(?:index|middle|ring|pinky)[1-3]$/.test(name)) bones.fingers.push(bone);
    if (/thumb_0[1-3]_[lr]$/.test(name) || /(?:left|right)handthumb[1-3]$/.test(name)) bones.thumbs.push(bone);
    const middleRoot = name.match(/middle_01_([lr])$/);
    if (middleRoot) bones.fingerRoots[middleRoot[1].toUpperCase()] = bone;
    if (/lefthandmiddle1$/.test(name)) bones.fingerRoots.L = bone;
    if (/righthandmiddle1$/.test(name)) bones.fingerRoots.R = bone;
  }
  bones.all = [...all.values()];
  return bones;
}

function primaryBodyMesh(model) {
  let preferred = null;
  let largest = null;
  let largestCount = 0;
  model?.traverse((object) => {
    if (!object.isSkinnedMesh || !object.geometry?.attributes?.position) return;
    const count = object.geometry.attributes.position.count;
    // Prefer the fitted carrier over the largest mesh: the production dress
    // has more vertices, but its hip-rebound skirt spreads across the lap
    // when seated and poisons both the fit ellipses and copied weights.
    if (/^(body_mesh|human_body|RendererC_BaseGarment)$/i.test(object.name)) preferred = object;
    if (count > largestCount) { largest = object; largestCount = count; }
  });
  return preferred || largest;
}

/* Measure the currently posed and morphed body instead of dressing an assumed
   average torso. The returned ellipses enclose every central torso vertex in
   each horizontal slice, with enough clearance to prevent z-fighting and
   body punch-through. */
export function sampleTorsoFit(model, top, bottom, right, forward, shoulderHalfWidth, slices = 11, coordinateSpace = null, { excludeHead = false, excludeLimbs = true } = {}) {
  const body = primaryBodyMesh(model);
  if (!body || slices < 2 || Math.abs(top.y - bottom.y) < 0.001) return null;
  body.updateMatrixWorld(true);
  // getVertexPosition reads skeleton.boneMatrices, which the renderer only
  // fills during a draw. Compute them here so a build before the first
  // rendered frame (the game's actor mount) measures the posed body, not a
  // zeroed skeleton collapsing every vertex to the origin.
  body.skeleton?.update?.();
  const rows = Array.from({ length: slices }, () => ({ side: 0, front: -Infinity, back: Infinity, samples: 0 }));
  const point = new THREE.Vector3();
  const centre = new THREE.Vector3();
  const relative = new THREE.Vector3();
  // Slice perpendicular to the top->bottom axis, not world-horizontal. A
  // seated torso leans ~25 degrees; horizontal slices of a diagonal body
  // are long front-to-back, and a garment enclosing them becomes a vertical
  // tub standing off the back. Vertical spans behave exactly as before.
  const axisDir = top.clone().sub(bottom);
  const span = axisDir.length();
  axisDir.normalize();
  const depthDir = new THREE.Vector3().crossVectors(right, axisDir).normalize();
  if (depthDir.dot(forward) < 0) depthDir.negate();
  const lateralLimit = Math.max(0.14, shoulderHalfWidth * 0.94);
  const skinIndex = body.geometry.attributes.skinIndex;
  const skinWeight = body.geometry.attributes.skinWeight;
  const excludedBoneIndices = new Set();
  // leftarm/rightarm/forearm cover Mixamo names, which the UE-style tokens
  // miss; without them the seated forearms inflate the torso measurement.
  // excludeHead matters for neck-band measurements: with the chin dropped,
  // horizontal slices otherwise measure the jaw as neck.
  // excludeLimbs: false lets a skirt-band measurement see the carrier's own
  // leg-weighted skirt, which is exactly what the shell skirt must clear.
  const parts = [];
  if (excludeLimbs) parts.push('uparm|upperarm|leftarm|rightarm|lowarm|lowerarm|forearm|wrist|hand|thumb|index|middle|ring|pinky|upleg|thigh|lowleg|calf|foot|toe');
  if (excludeHead) parts.push('head');
  const excluded = parts.length ? new RegExp(`(${parts.join('|')})`, 'i') : null;
  if (excluded) body.skeleton?.bones?.forEach((bone, index) => {
    if (excluded.test(bone.name)) {
      excludedBoneIndices.add(index);
    }
  });

  for (let vertex = 0; vertex < body.geometry.attributes.position.count; vertex += 1) {
    if (skinIndex && skinWeight && excludedBoneIndices.size) {
      let excludedWeight = 0;
      for (let influence = 0; influence < 4; influence++) {
        if (excludedBoneIndices.has(skinIndex.getComponent(vertex, influence))) {
          excludedWeight += skinWeight.getComponent(vertex, influence);
        }
      }
      if (excludedWeight > 0.22) continue;
    }
    body.getVertexPosition(vertex, point).applyMatrix4(body.matrixWorld);
    if (coordinateSpace) coordinateSpace.worldToLocal(point);
    const t = relative.subVectors(top, point).dot(axisDir) / span;
    if (t < -0.04 || t > 1.04) continue;
    centre.copy(top).lerp(bottom, THREE.MathUtils.clamp(t, 0, 1));
    relative.subVectors(point, centre);
    const side = relative.dot(right);
    if (Math.abs(side) > lateralLimit) continue; // exclude arms
    const depth = relative.dot(depthDir);
    const row = rows[Math.round(THREE.MathUtils.clamp(t, 0, 1) * (slices - 1))];
    row.side = Math.max(row.side, Math.abs(side));
    row.front = Math.max(row.front, depth);
    row.back = Math.min(row.back, depth);
    row.samples += 1;
  }

  // Neighbouring valid rows fill sparse slices at the neckline and waist.
  for (let index = 0; index < rows.length; index += 1) {
    if (rows[index].samples) continue;
    let nearest = null;
    for (let radius = 1; radius < rows.length && !nearest; radius += 1) {
      nearest = rows[index - radius]?.samples ? rows[index - radius]
        : rows[index + radius]?.samples ? rows[index + radius] : null;
    }
    if (nearest) Object.assign(rows[index], nearest);
  }

  const measured = rows.map((row, index) => {
    if (!row.samples || !Number.isFinite(row.front) || !Number.isFinite(row.back)) {
      return { rx: 0.18, rz: 0.13, offset: 0, samples: 0 };
    }
    const waistBias = index / (slices - 1);
    return {
      rx: row.side + THREE.MathUtils.lerp(0.025, 0.021, waistBias),
      rz: (row.front - row.back) * 0.5 + 0.025,
      offset: (row.front + row.back) * 0.5,
      samples: row.samples,
    };
  });
  // A short smoothing pass removes polygon-to-polygon jitter without ever
  // shrinking below the original measured envelope.
  return measured.map((row, index) => {
    const neighbours = measured.slice(Math.max(0, index - 1), Math.min(measured.length, index + 2));
    return {
      rx: Math.max(row.rx, neighbours.reduce((sum, item) => sum + item.rx, 0) / neighbours.length),
      rz: Math.max(row.rz, neighbours.reduce((sum, item) => sum + item.rz, 0) / neighbours.length),
      offset: neighbours.reduce((sum, item) => sum + item.offset, 0) / neighbours.length,
      samples: row.samples,
    };
  });
}


function finishGeometry(positions, uvs, indices, weld = null) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  if (weld) {
    // The seam column is duplicated for uv wrapping; average its normals so
    // lighting does not show a vertical crease at the join.
    const normal = geometry.attributes.normal;
    for (let ring = 0; ring < weld.rings; ring++) {
      const a = ring * weld.stride;
      const b = a + weld.segments;
      const x = normal.getX(a) + normal.getX(b);
      const y = normal.getY(a) + normal.getY(b);
      const z = normal.getZ(a) + normal.getZ(b);
      const length = Math.hypot(x, y, z) || 1;
      normal.setXYZ(a, x / length, y / length, z / length);
      normal.setXYZ(b, x / length, y / length, z / length);
    }
  }
  return geometry;
}

/* ringFn(t) -> { center, rx, rz | rzFront/rzBack, forward, back?, shape?, drop? }
   shape(angle, f, s) multiplies the radius (pleats, gathers); drop(angle, f, s)
   offsets y (train, pointed bodice front). f/s are cos/sin of the ring angle
   with f = +1 at centre front. */
function ringGeometry(rings, segments, ringFn, { capTop = true, capBottom = true, uvScale = null, axis = null } = {}) {
  const positions = []; const uvs = []; const indices = [];
  const right = new THREE.Vector3(); const fwd = new THREE.Vector3(); const point = new THREE.Vector3();
  const up = axis ? axis.clone().normalize() : new THREE.Vector3(0, 1, 0);
  const centers = [];
  const stride = segments + 1;
  for (let ring = 0; ring < rings; ring++) {
    const t = ring / (rings - 1);
    const r = ringFn(t);
    centers.push(r.center.clone());
    // Rings lie perpendicular to the axis (the spine for the bodice, world
    // vertical for the gravity-hung skirt).
    fwd.copy(r.forward).addScaledVector(up, -r.forward.dot(up)).normalize();
    right.crossVectors(up, fwd).normalize();
    const rzFront = r.rzFront ?? r.rz;
    const rzBack = r.rzBack ?? r.rz;
    for (let segment = 0; segment <= segments; segment++) {
      const a = ((segment % segments) / segments) * Math.PI * 2;
      const f = Math.cos(a); const s = Math.sin(a);
      const radial = r.shape ? r.shape(a, f, s) : 1;
      point.copy(r.center)
        .addScaledVector(fwd, f * (f >= 0 ? rzFront : rzBack) * radial)
        .addScaledVector(right, s * r.rx * radial);
      if (r.back && f < 0) point.addScaledVector(fwd, f * r.back);
      if (r.drop) point.addScaledVector(up, r.drop(a, f, s));
      positions.push(point.x, point.y, point.z);
      uvs.push((segment / segments) * (uvScale?.u ?? 1), t * (uvScale?.v ?? 1));
    }
  }
  for (let ring = 0; ring < rings - 1; ring++) for (let segment = 0; segment < segments; segment++) {
    const a = ring * stride + segment; const b = a + 1;
    const c = (ring + 1) * stride + segment + 1; const d = c - 1;
    // Rings run from top to bottom. This winding keeps the radial normals
    // facing out; the reverse order makes broad bodice and skirt panels shade
    // as though their normals point into the body.
    indices.push(a, c, b, a, d, c);
  }
  let base = rings * stride;
  if (capTop) {
    positions.push(centers[0].x, centers[0].y, centers[0].z);
    uvs.push(0.5, 0);
    for (let segment = 0; segment < segments; segment++) indices.push(base, segment + 1, segment);
    base += 1;
  }
  if (capBottom) {
    const last = centers[centers.length - 1];
    positions.push(last.x, last.y, last.z);
    uvs.push(0.5, uvScale?.v ?? 1);
    const row = (rings - 1) * stride;
    for (let segment = 0; segment < segments; segment++) indices.push(base, row + segment, row + segment + 1);
  }
  return finishGeometry(positions, uvs, indices, { rings, stride, segments });
}

function tubeAlong(a, b, radiusFn, { radialSegments = 18, lengthSegments = 12, capEnds = true } = {}) {
  const axis = new THREE.Vector3().subVectors(b, a);
  const length = axis.length(); axis.normalize();
  const helper = Math.abs(axis.y) > 0.94 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
  const u = new THREE.Vector3().crossVectors(axis, helper).normalize();
  const v = new THREE.Vector3().crossVectors(axis, u).normalize();
  const positions = []; const uvs = []; const indices = []; const point = new THREE.Vector3();
  const stride = radialSegments + 1;
  for (let ring = 0; ring <= lengthSegments; ring++) {
    const t = ring / lengthSegments;
    const radius = radiusFn(t);
    for (let segment = 0; segment <= radialSegments; segment++) {
      const angle = ((segment % radialSegments) / radialSegments) * Math.PI * 2;
      point.copy(a).addScaledVector(axis, t * length)
        .addScaledVector(u, Math.cos(angle) * radius)
        .addScaledVector(v, Math.sin(angle) * radius);
      positions.push(point.x, point.y, point.z);
      uvs.push(segment / radialSegments, t * length * 2);
    }
  }
  for (let ring = 0; ring < lengthSegments; ring++) for (let segment = 0; segment < radialSegments; segment++) {
    const q = ring * stride + segment; const r = q + 1;
    const s = (ring + 1) * stride + segment + 1; const t2 = s - 1;
    indices.push(q, r, s, q, s, t2);
  }
  let base = (lengthSegments + 1) * stride;
  if (capEnds) {
    positions.push(a.x, a.y, a.z);
    uvs.push(0.5, 0);
    for (let segment = 0; segment < radialSegments; segment++) indices.push(base, segment + 1, segment);
    base += 1;
    positions.push(b.x, b.y, b.z);
    uvs.push(0.5, 1);
    const row = lengthSegments * stride;
    for (let segment = 0; segment < radialSegments; segment++) indices.push(base, row + segment, row + segment + 1);
  }
  return finishGeometry(positions, uvs, indices, { rings: lengthSegments + 1, stride, segments: radialSegments });
}

/* Tube following a polyline with parallel-transport frames, so a single
   sleeve can run shoulder -> elbow -> wrist and bend smoothly when skinned.
   radiusFn(t) sets the profile; radialFn(t, angle) modulates it (gathers). */
function tubeAlongPath(points, radiusFn, { radialSegments = 20, capEnds = false, radialFn = null, uvScale = null } = {}) {
  const positions = []; const uvs = []; const indices = [];
  const tangent = new THREE.Vector3();
  const normal = new THREE.Vector3();
  const binormal = new THREE.Vector3();
  const point = new THREE.Vector3();
  const stride = radialSegments + 1;
  const rings = points.length;
  for (let ring = 0; ring < rings; ring++) {
    const t = ring / (rings - 1);
    const previous = points[Math.max(0, ring - 1)];
    const next = points[Math.min(rings - 1, ring + 1)];
    tangent.subVectors(next, previous).normalize();
    if (ring === 0) {
      const helper = Math.abs(tangent.y) > 0.94 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
      normal.crossVectors(tangent, helper).normalize();
    } else {
      normal.addScaledVector(tangent, -normal.dot(tangent));
      if (normal.lengthSq() < 1e-8) normal.set(1, 0, 0).addScaledVector(tangent, -tangent.x);
      normal.normalize();
    }
    binormal.crossVectors(tangent, normal).normalize();
    const radius = radiusFn(t);
    for (let segment = 0; segment <= radialSegments; segment++) {
      const angle = ((segment % radialSegments) / radialSegments) * Math.PI * 2;
      const modulated = radius * (radialFn ? radialFn(t, angle) : 1);
      point.copy(points[ring])
        .addScaledVector(normal, Math.cos(angle) * modulated)
        .addScaledVector(binormal, Math.sin(angle) * modulated);
      positions.push(point.x, point.y, point.z);
      uvs.push((segment / radialSegments) * (uvScale?.u ?? 1), t * (uvScale?.v ?? 1));
    }
  }
  for (let ring = 0; ring < rings - 1; ring++) for (let segment = 0; segment < radialSegments; segment++) {
    const q = ring * stride + segment; const r = q + 1;
    const s = (ring + 1) * stride + segment + 1; const t2 = s - 1;
    indices.push(q, r, s, q, s, t2);
  }
  let base = rings * stride;
  if (capEnds) {
    const first = points[0]; const last = points[rings - 1];
    positions.push(first.x, first.y, first.z);
    uvs.push(0.5, 0);
    for (let segment = 0; segment < radialSegments; segment++) indices.push(base, segment + 1, segment);
    base += 1;
    positions.push(last.x, last.y, last.z);
    uvs.push(0.5, 1);
    const row = (rings - 1) * stride;
    for (let segment = 0; segment < radialSegments; segment++) indices.push(base, row + segment, row + segment + 1);
  }
  return finishGeometry(positions, uvs, indices, { rings, stride, segments: radialSegments });
}

/* Snapshot of the skinned body used for weight transfer: vertex positions in
   costume space, per-vertex arm/leg weight sums for filtering, and a uniform
   grid for nearest-vertex queries. Rebuilt each costume rebuild so it tracks
   identity morphs and the current pose. */
function buildBindingSource(model, scene, bones) {
  const body = primaryBodyMesh(model);
  const skeleton = body?.skeleton;
  const geometry = body?.geometry;
  const skinIndex = geometry?.attributes?.skinIndex;
  const skinWeight = geometry?.attributes?.skinWeight;
  if (!skeleton || !skinIndex || !skinWeight) return null;
  body.updateMatrixWorld(true);
  // Same render-independence guarantee as sampleTorsoFit.
  skeleton.update?.();
  const descendantGroup = (bone) => {
    for (let node = bone; node; node = node.parent) {
      if (node === bones.upperarmL) return 1;
      if (node === bones.upperarmR) return 2;
      if (node === bones.thighL || node === bones.thighR) return 3;
    }
    return 0;
  };
  const groupOf = skeleton.bones.map(descendantGroup);
  const count = geometry.attributes.position.count;
  const positions = new Float32Array(count * 3);
  const armL = new Float32Array(count);
  const armR = new Float32Array(count);
  const legs = new Float32Array(count);
  const cell = 0.07;
  const grid = new Map();
  const point = new THREE.Vector3();
  for (let vertex = 0; vertex < count; vertex++) {
    body.getVertexPosition(vertex, point).applyMatrix4(body.matrixWorld);
    scene.worldToLocal(point);
    positions[vertex * 3] = point.x;
    positions[vertex * 3 + 1] = point.y;
    positions[vertex * 3 + 2] = point.z;
    for (let influence = 0; influence < 4; influence++) {
      const group = groupOf[skinIndex.getComponent(vertex, influence)];
      if (!group) continue;
      const weight = skinWeight.getComponent(vertex, influence);
      if (group === 1) armL[vertex] += weight;
      else if (group === 2) armR[vertex] += weight;
      else legs[vertex] += weight;
    }
    const key = `${Math.round(point.x / cell)},${Math.round(point.y / cell)},${Math.round(point.z / cell)}`;
    let bucket = grid.get(key);
    if (!bucket) grid.set(key, bucket = []);
    bucket.push(vertex);
  }
  return { skeleton, skinIndex, skinWeight, positions, armL, armR, legs, grid, cell };
}

/* Blend the skin weights of the three nearest accepted body vertices.
   A single nearest vertex works but shows faceting across the elbow and
   shoulder; a small inverse-distance blend keeps the garment smooth. */
function copyWeights(source, x, y, z, filter, out) {
  const { positions, grid, cell } = source;
  const ix = Math.round(x / cell); const iy = Math.round(y / cell); const iz = Math.round(z / cell);
  const best = [];
  for (let radius = 0; radius <= 7; radius++) {
    for (let dx = -radius; dx <= radius; dx++) for (let dy = -radius; dy <= radius; dy++) for (let dz = -radius; dz <= radius; dz++) {
      if (Math.max(Math.abs(dx), Math.abs(dy), Math.abs(dz)) !== radius) continue;
      const bucket = grid.get(`${ix + dx},${iy + dy},${iz + dz}`);
      if (!bucket) continue;
      for (const vertex of bucket) {
        if (filter && !filter(vertex)) continue;
        const px = positions[vertex * 3] - x;
        const py = positions[vertex * 3 + 1] - y;
        const pz = positions[vertex * 3 + 2] - z;
        const d2 = px * px + py * py + pz * pz;
        if (best.length < 3) {
          best.push({ d2, vertex });
          best.sort((a, b) => a.d2 - b.d2);
        } else if (d2 < best[2].d2) {
          best[2] = { d2, vertex };
          best.sort((a, b) => a.d2 - b.d2);
        }
      }
    }
    // Cells beyond this shell cannot beat what we already hold.
    if (best.length === 3 && Math.sqrt(best[2].d2) < Math.max(0, radius - 1) * cell) break;
  }
  if (!best.length) {
    if (filter) return copyWeights(source, x, y, z, null, out);
    out.indices[0] = 0; out.weights[0] = 1;
    out.indices[1] = out.indices[2] = out.indices[3] = 0;
    out.weights[1] = out.weights[2] = out.weights[3] = 0;
    return out;
  }
  const accumulated = new Map();
  for (const { d2, vertex } of best) {
    const blend = 1 / (Math.sqrt(d2) + 0.004);
    for (let influence = 0; influence < 4; influence++) {
      const weight = source.skinWeight.getComponent(vertex, influence) * blend;
      if (!weight) continue;
      const bone = source.skinIndex.getComponent(vertex, influence);
      accumulated.set(bone, (accumulated.get(bone) || 0) + weight);
    }
  }
  const top = [...accumulated.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4);
  let sum = 0;
  for (const [, weight] of top) sum += weight;
  for (let slot = 0; slot < 4; slot++) {
    out.indices[slot] = top[slot] ? top[slot][0] : 0;
    out.weights[slot] = top[slot] ? top[slot][1] / sum : 0;
  }
  return out;
}

let weaveTextureCache = null;
function weaveNormalTexture() {
  if (weaveTextureCache) return weaveTextureCache;
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size; canvas.height = size;
  const context = canvas.getContext('2d');
  const image = context.createImageData(size, size);
  const height = new Float32Array(size * size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    // twill diagonal plus a finer weft line; both periods divide the tile
    const rib = Math.sin(((x * 2 + y) / size) * Math.PI * 24);
    const weft = Math.sin((y / size) * Math.PI * 56) * 0.4;
    height[y * size + x] = rib + weft;
  }
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const xp = height[y * size + ((x + 1) % size)];
    const xm = height[y * size + ((x - 1 + size) % size)];
    const yp = height[((y + 1) % size) * size + x];
    const ym = height[((y - 1 + size) % size) * size + x];
    const nx = (xm - xp) * 0.5;
    const ny = (ym - yp) * 0.5;
    const inverse = 1 / Math.hypot(nx, ny, 1);
    const offset = (y * size + x) * 4;
    image.data[offset] = (nx * inverse * 0.5 + 0.5) * 255;
    image.data[offset + 1] = (ny * inverse * 0.5 + 0.5) * 255;
    image.data[offset + 2] = (inverse * 0.5 + 0.5) * 255;
    image.data[offset + 3] = 255;
  }
  context.putImageData(image, 0, 0);
  weaveTextureCache = new THREE.CanvasTexture(canvas);
  weaveTextureCache.wrapS = THREE.RepeatWrapping;
  weaveTextureCache.wrapT = THREE.RepeatWrapping;
  return weaveTextureCache;
}

export function createCostumeShell(scene, bones, model = null) {
  const materials = {
    // Physical material for the sheen lobe: wool and silk read through the
    // grazing-angle highlight far more than through base roughness.
    dress: new THREE.MeshPhysicalMaterial({
      name: 'CostumeDress', color: '#171525', roughness: 0.82, side: THREE.DoubleSide,
      sheen: 0.35, sheenRoughness: 0.6, sheenColor: new THREE.Color('#b8a898'),
    }),
    trim: new THREE.MeshStandardMaterial({ name: 'CostumeTrim', color: '#4f4333', roughness: 0.72, side: THREE.DoubleSide }),
    // Contrast fabric for the plastron front panel and lace-adjacent details.
    secondary: new THREE.MeshStandardMaterial({ name: 'CostumeSecondary', color: '#817064', roughness: 0.78, side: THREE.DoubleSide }),
  };
  let pieces = []; // { mesh, bone }
  let bindingSource = null;
  let extendedSkeleton = null;
  let swayBones = [];
  let swayRest = [];
  let swayParticles = [];
  let swayVelocities = [];

  const pointInScene = (bone, out = new THREE.Vector3()) => {
    bone.getWorldPosition(out);
    return scene.worldToLocal(out);
  };

  function add(name, geometry, material, bone, weightFn = null) {
    let mesh;
    if (weightFn && extendedSkeleton) {
      const count = geometry.attributes.position.count;
      const indexArray = new Uint16Array(count * 4);
      const weightArray = new Float32Array(count * 4);
      const out = { indices: [0, 0, 0, 0], weights: [1, 0, 0, 0] };
      const position = geometry.attributes.position;
      for (let vertex = 0; vertex < count; vertex++) {
        weightFn(position.getX(vertex), position.getY(vertex), position.getZ(vertex), out);
        for (let slot = 0; slot < 4; slot++) {
          indexArray[vertex * 4 + slot] = out.indices[slot];
          weightArray[vertex * 4 + slot] = out.weights[slot];
        }
      }
      geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(indexArray, 4));
      geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(weightArray, 4));
      mesh = new THREE.SkinnedMesh(geometry, material);
      mesh.name = name; mesh.castShadow = true; mesh.frustumCulled = false;
      mesh.receiveShadow = true;
      scene.add(mesh);
      mesh.updateMatrixWorld(true);
      mesh.bind(extendedSkeleton, mesh.matrixWorld.clone());
      pieces.push({ mesh, bone: null });
      return mesh;
    }
    mesh = new THREE.Mesh(geometry, material);
    mesh.name = name; mesh.castShadow = true; mesh.frustumCulled = false;
    mesh.receiveShadow = true;
    scene.add(mesh);
    if (bone) bone.attach(mesh);
    pieces.push({ mesh, bone });
    return mesh;
  }

  function disposeSway() {
    for (const bone of swayBones) bone.parent?.remove(bone);
    swayBones = [];
    swayRest = [];
    swayParticles = [];
    swayVelocities = [];
  }

  function disposeCostumePieces() {
    for (const { mesh } of pieces) { mesh.parent?.remove(mesh); mesh.geometry.dispose(); }
    pieces = [];
    disposeSway();
    extendedSkeleton?.dispose();
    extendedSkeleton = null;
  }

  function updateMaterials(values) {
    materials.secondary.color.set(values.secondaryColor ?? '#817064');
    materials.dress.sheen = THREE.MathUtils.clamp((values.fabricSheen ?? 0.72) * 0.55, 0, 1);
    materials.dress.sheenColor.set(values.dressColor ?? '#171525').lerp(new THREE.Color('#f2e6d8'), 0.55);
    const relief = THREE.MathUtils.clamp(values.fabricRelief ?? 0.72, 0, 1.5);
    if (relief > 0.02) {
      const texture = weaveNormalTexture();
      texture.repeat.set(1, 1); // uvs are metre-scaled per piece; repeat sets weave density
      texture.repeat.multiplyScalar(42 * THREE.MathUtils.clamp(values.fabricScale ?? 1, 0.45, 2.5));
      if (materials.dress.normalMap !== texture) {
        materials.dress.normalMap = texture;
        materials.dress.needsUpdate = true;
      }
      materials.dress.normalScale.set(relief * 0.24, relief * 0.24);
    } else if (materials.dress.normalMap) {
      materials.dress.normalMap = null;
      materials.dress.needsUpdate = true;
    }
  }

  function rebuild(values = {}) {
    const v = { ...COSTUME_DEFAULTS };
    for (const key in values) if (values[key] != null) v[key] = values[key];
    disposeCostumePieces();
    materials.dress.color.set(v.dressColor); materials.dress.roughness = v.fabricRoughness;
    materials.trim.color.set(v.trimColor);
    updateMaterials(v);
    if (!bones.pelvis || !bones.head) return;

    const styles = {
      // Sleeve factors sit high across the board: 1896 was the peak of the
      // gigot sleeve, and even conservative day dresses carried real volume.
      'conservative-day': { sleeve: 1.0, skirt: 0.96, bustle: 0.65, collar: 1.05, buttons: 0, apron: false, band: false },
      'fashionable-1896': { sleeve: 1.62, skirt: 1.10, bustle: 1.15, collar: 0.92, buttons: 1, apron: false, band: true },
      'mourning-dress': { sleeve: 1.05, skirt: 1.04, bustle: 0.45, collar: 1.25, buttons: 2, apron: false, band: true },
      'working-day': { sleeve: 0.8, skirt: 0.82, bustle: 0.18, collar: 0.82, buttons: -1, apron: true, band: false },
      'visiting-dress': { sleeve: 1.35, skirt: 1.18, bustle: 1.05, collar: 1.08, buttons: 1, apron: false, band: true },
      'mens-sack-suit': { sleeve: 0.70, skirt: 0.9, bustle: 0, collar: 0.85, buttons: -1, apron: false, band: false },
      'mens-formal-suit': { sleeve: 0.64, skirt: 0.9, bustle: 0, collar: 1.08, buttons: 0, apron: false, band: true },
      'mens-working-clothes': { sleeve: 0.56, skirt: 0.9, bustle: 0, collar: 0.66, buttons: -1, apron: false, band: false },
      'mens-mourning-suit': { sleeve: 0.66, skirt: 0.9, bustle: 0, collar: 1.04, buttons: 0, apron: false, band: true },
    };
    const dressStyle = styles[v.outfitStyle] || styles['conservative-day'];
    const massFactor = 1 + ((v.weight ?? 0.48) - 0.48) * 0.42;
    const masculine = (v.gender ?? 0.5) >= 0.55;

    scene.updateWorldMatrix(true, false);
    model?.updateMatrixWorld(true);
    bindingSource = buildBindingSource(model, scene, bones);
    const P = pointInScene(bones.pelvis); const H = pointInScene(bones.head);
    const N = bones.neck ? pointInScene(bones.neck) : H.clone().add(new THREE.Vector3(0, -0.08, 0));
    const C = bones.spine03 ? pointInScene(bones.spine03) : P.clone().lerp(N, 0.7);
    const kneeL = bones.calfL ? pointInScene(bones.calfL) : null;
    const kneeR = bones.calfR ? pointInScene(bones.calfR) : null;
    const footY = bones.footL ? pointInScene(bones.footL).y : 0.03;
    const seated = (v.seated ?? 1) >= 0.5;
    const knee = kneeL && kneeR ? kneeL.clone().add(kneeR).multiplyScalar(0.5) : P.clone().add(new THREE.Vector3(0, -0.3, 0.35));
    const forward = knee.clone().sub(P); forward.y = 0;
    if (forward.lengthSq() < 1e-6) forward.set(0, 0, 1);
    forward.normalize();
    const up = new THREE.Vector3(0, 1, 0);
    const right = new THREE.Vector3().crossVectors(up, forward).normalize();
    const shoulderL = bones.upperarmL ? pointInScene(bones.upperarmL) : C.clone().addScaledVector(right, 0.18);
    const shoulderR = bones.upperarmR ? pointInScene(bones.upperarmR) : C.clone().addScaledVector(right, -0.18);
    const shoulderCenter = shoulderL.clone().add(shoulderR).multiplyScalar(0.5);
    const shoulderHalfWidth = Math.max(0.17, shoulderL.distanceTo(shoulderR) * 0.5 + 0.025);
    const torsoTop = shoulderCenter.clone().lerp(N, 0.20);
    const torsoFit = sampleTorsoFit(model, torsoTop, P, right, forward, shoulderHalfWidth, 11, scene);
    const rendererCPrototype = Boolean(model?.getObjectByName?.('RendererC_BaseGarment'));

    /* --- layout scalars needed before any geometry (sway bones bind first) --- */
    const waistY = P.y + 0.105 + (v.waistHeight || 0) * 0.4;
    // Floor-anchored: the Mixamo foot bone is the ankle joint, ~19cm up on
    // the renderer-c rig, and anchoring there cut every skirt at the shin.
    const hemY = Math.min(0.035, footY) + 0.03 + (1.0 - v.skirtLength) * 0.55;
    const waistFit = torsoFit?.at(-1);
    const waistRx = Math.max(0.155 * v.bodiceFit, (waistFit?.rx || 0) + 0.012);
    const waistRz = Math.max(0.125 * v.bodiceFit, (waistFit?.rz || 0) + 0.014);
    const gaitAllowance = rendererCPrototype ? 1.14 : 1;
    const hemRx = massFactor * 0.4 * v.skirtFullness * dressStyle.skirt * gaitAllowance;
    const hemRz = massFactor * 0.34 * v.skirtFullness * dressStyle.skirt * gaitAllowance;
    const frontFlatness = THREE.MathUtils.clamp(v.frontFlatness ?? 0.65, 0, 1);
    const pleatCount = Math.max(4, Math.round(v.hemPleatCount ?? 10));
    const pleatDepth = THREE.MathUtils.clamp(v.hemPleatDepth ?? 0.45, 0, 1);
    const train = THREE.MathUtils.clamp(v.trainLength ?? 0.2, 0, 1);
    const backMask = (f) => THREE.MathUtils.smoothstep(-f, -0.1, 0.35);
    const pleatShape = (t) => {
      const amplitude = 0.045 * pleatDepth * THREE.MathUtils.smoothstep(t, 0.3, 1);
      return (a, f) => 1 + amplitude * backMask(f) * (Math.pow(0.5 + 0.5 * Math.sin(a * pleatCount), 1.35) - 0.42) * 2;
    };

    /* --- sway bones and the extended skeleton --- */
    const sourceSkeleton = bindingSource?.skeleton || null;
    const hipIndex = sourceSkeleton ? sourceSkeleton.bones.indexOf(bones.pelvis) : -1;
    const thighLIndex = sourceSkeleton && bones.thighL ? sourceSkeleton.bones.indexOf(bones.thighL) : -1;
    const thighRIndex = sourceSkeleton && bones.thighR ? sourceSkeleton.bones.indexOf(bones.thighR) : -1;
    const swayCount = !masculine && sourceSkeleton && hipIndex >= 0 ? 6 : 0;
    if (swayCount) {
      const worldPoint = new THREE.Vector3();
      for (let index = 0; index < swayCount; index++) {
        const angle = (index / swayCount) * Math.PI * 2;
        worldPoint.copy(P)
          .addScaledVector(forward, Math.cos(angle) * hemRz * 0.85)
          .addScaledVector(right, Math.sin(angle) * hemRx * 0.85)
          .setY(hemY + 0.05);
        scene.localToWorld(worldPoint);
        const bone = new THREE.Bone();
        bone.name = `CostumeSway_${index}`;
        bones.pelvis.add(bone);
        bones.pelvis.updateWorldMatrix(true, false);
        bone.position.copy(bones.pelvis.worldToLocal(worldPoint.clone()));
        swayBones.push(bone);
        swayRest.push(bone.position.clone());
        swayParticles.push(worldPoint.clone());
        swayVelocities.push(new THREE.Vector3());
      }
      bones.pelvis.updateWorldMatrix(true, true);
    }
    if (sourceSkeleton) {
      extendedSkeleton = new THREE.Skeleton([...sourceSkeleton.bones, ...swayBones]);
    }
    const swayBase = sourceSkeleton ? sourceSkeleton.bones.length : 0;

    /* --- weight functions --- */
    const source = bindingSource;
    // Allow moderate arm influence: garment vertices near the armscye must
    // track the arm the way the underlying body does, or the underlayer
    // shears out from beneath the shell whenever the pose leaves the bind.
    const torsoFilter = source
      ? (vertex) => source.armL[vertex] < 0.55 && source.armR[vertex] < 0.55 && source.legs[vertex] < 0.5
      : null;
    const armLFilter = source ? (vertex) => source.armL[vertex] > 0.25 : null;
    const armRFilter = source ? (vertex) => source.armR[vertex] > 0.25 : null;
    const copyFrom = (filter) => (source
      ? (x, y, z, out) => copyWeights(source, x, y, z, filter, out)
      : null);
    const leftSign = bones.thighL
      ? (Math.sign(pointInScene(bones.thighL).clone().sub(P).dot(right)) || 1)
      : 1;
    const hipHalf = Math.max(0.09, waistRx * 1.15);
    const skirtWeights = source && hipIndex >= 0 ? (x, y, z, out) => {
      const t = THREE.MathUtils.clamp((waistY - y) / Math.max(0.001, waistY - hemY), 0, 1);
      const dx = x - P.x; const dz = z - P.z;
      const side = dx * right.x + dz * right.z;
      const depth = dx * forward.x + dz * forward.z;
      // Thigh influence lets the skirt follow the stride without collapsing
      // between the legs; the cap keeps the hem a garment, not tights.
      const legInfluence = (thighLIndex >= 0 && thighRIndex >= 0)
        ? 0.55 * THREE.MathUtils.smoothstep(t, 0.12, 0.7) : 0;
      const sideBlend = THREE.MathUtils.clamp(0.5 + (leftSign * side) / (2 * hipHalf), 0, 1);
      const sway = swayCount ? 0.4 * THREE.MathUtils.smoothstep(t, 0.55, 1) : 0;
      const structural = 1 - sway;
      out.indices[0] = hipIndex;
      out.weights[0] = (1 - legInfluence) * structural;
      out.indices[1] = thighLIndex >= 0 ? thighLIndex : hipIndex;
      out.weights[1] = legInfluence * sideBlend * structural;
      out.indices[2] = thighRIndex >= 0 ? thighRIndex : hipIndex;
      out.weights[2] = legInfluence * (1 - sideBlend) * structural;
      if (sway) {
        let angle = Math.atan2(side * leftSign, depth);
        if (angle < 0) angle += Math.PI * 2;
        out.indices[3] = swayBase + (Math.round((angle / (Math.PI * 2)) * swayCount) % swayCount);
        out.weights[3] = sway;
      } else {
        out.indices[3] = hipIndex;
        out.weights[3] = 0;
      }
      return out;
    } : copyFrom(torsoFilter);

    /* --- bodice / jacket shell ---
       MPFB carries an authored base garment, but MHR is a bare body. This
       lightweight shell gives both engines a complete period silhouette until
       fitted, skinned production garments replace the procedural foundation. */
    const pointDepth = THREE.MathUtils.clamp(v.frontPointDepth ?? 0.5, 0, 1);
    // The torso frame follows the spine, so the bodice hugs a leaning body
    // instead of standing off it as a vertical tub. The skirt keeps world
    // vertical: it hangs by gravity.
    const torsoAxis = torsoTop.clone().sub(P).normalize();
    const torsoForward = forward.clone().addScaledVector(torsoAxis, -forward.dot(torsoAxis)).normalize();
    const torsoRight = new THREE.Vector3().crossVectors(torsoAxis, torsoForward).normalize();
    // Seated, the torso measurement at pelvis height wraps the buttocks and
    // chair; letting the bodice follow it produces a flat brim behind the
    // back. Freeze fit and radii at the waist and let the skirt own the rest.
    const tWaist = THREE.MathUtils.clamp((torsoTop.y - waistY) / Math.max(0.01, torsoTop.y - P.y), 0, 1);
    const bodiceRing = (rowT) => {
      const t = seated ? Math.min(rowT, tWaist) : rowT;
      const fit = torsoFit?.[Math.round(t * 10)];
      const centre = torsoTop.clone().lerp(P, rowT).addScaledVector(
        torsoForward,
        fit?.offset ?? (masculine ? 0.006 : 0.014 * Math.sin(t * Math.PI)),
      );
      const chest = Math.sin(t * Math.PI);
      const fit01 = v.bodiceFit ?? 1;
      const bust = THREE.MathUtils.clamp(v.bustCurve ?? 0.55, 0, 1);
      const fittedWidth = massFactor * fit01 * ((masculine ? 0.175 : 0.158) + chest * (masculine ? 0.032 : 0.026));
      // Decays slowly: the scapula and arm-root flesh are arm-weighted, so
      // the fit measurement rightly ignores them and only this envelope
      // keeps the upper back covered.
      const shoulderEnvelope = THREE.MathUtils.lerp(
        shoulderHalfWidth + 0.026,
        0,
        THREE.MathUtils.smoothstep(t, 0.02, 0.45),
      );
      // Corset line: pull the analytic shell in toward the waist while always
      // keeping the measured-body clearance. Without this the bodice reads as
      // a tube; the cinched waist IS the period silhouette.
      const taper = THREE.MathUtils.clamp(v.waistTaper ?? 0.55, 0, 1);
      const cinch = masculine
        ? 1
        : THREE.MathUtils.lerp(1, THREE.MathUtils.lerp(0.95, 0.74, taper), THREE.MathUtils.smoothstep(t, 0.5, 0.95));
      const dip = masculine ? 0 : pointDepth * 0.05 * THREE.MathUtils.smoothstep(t, 0.72, 1);
      // Tailoring is asymmetric: bust carried forward, back nearly flat. A
      // symmetric ellipse is what read as armour plate.
      const rzBase = massFactor * fit01 * (masculine ? 0.118 : 0.098);
      return {
        center: centre,
        // The measured surface is the skin, not the finished cloth surface.
        // Keep a small physical allowance so the body cannot z-fight through
        // the bodice or turn the whole front panel into a self-shadow.
        rx: Math.max(fittedWidth * cinch, (fit?.rx || 0) + 0.010, shoulderEnvelope),
        rzFront: Math.max(
          (rzBase + chest * (masculine ? 0.022 : 0.052 * bust)) * cinch,
          (fit?.rz || 0) + 0.012,
        ),
        rzBack: Math.max(
          (rzBase * (masculine ? 1 : 0.94) + chest * 0.010) * cinch,
          (fit?.rz || 0) + 0.013,
        ),
        forward,
        back: 0,
        // 1890s bodices close in a point at centre front, below the waistline.
        drop: dip ? (a, f) => -dip * Math.max(0, f) ** 3 : null,
      };
    };
    // Measure the actual neck so the collar clasps it instead of standing
    // open around it like a tube. sampleTorsoFit bakes roughly 2cm of
    // garment clearance into its rows; subtract most of that back out.
    // The band starts low on the neck so it overlaps the bodice's neck zone
    // at any head lean; the measurement stays on the neck proper so the
    // trapezius onset cannot widen the collar.
    const collarBase = N.clone().lerp(H, 0.05);
    const collarTop = N.clone().lerp(H, 0.12 + 0.3 * v.collarHeight * dressStyle.collar);
    const measureBase = N.clone().lerp(H, 0.12);
    const neckFit = sampleTorsoFit(model, measureBase.clone().lerp(collarTop, 0.5), measureBase, right, forward, 0.11, 3, scene, { excludeHead: true });
    let neckR = 0;
    let neckOffset = 0;
    let neckRows = 0;
    for (const row of neckFit || []) {
      if (!row.samples) continue;
      neckR = Math.max(neckR, Math.max(row.rx, row.rz) - 0.014);
      neckOffset += row.offset;
      neckRows += 1;
    }
    neckOffset = neckRows ? neckOffset / neckRows : 0;
    if (!neckR) neckR = 0.044;
    neckR *= 0.92 + 0.12 * THREE.MathUtils.clamp(v.collarSpread ?? 1, 0.65, 1.45);
    const neckTuck = neckR * 0.94; // top ring hides inside the collar band
    const neckAnchor = N.clone().lerp(H, 0.04 + 0.10 * THREE.MathUtils.clamp(v.necklineHeight ?? 0.78, 0, 1));
    const shoulderRing = bodiceRing(0);
    const yokeFit = sampleTorsoFit(model, neckAnchor, shoulderRing.center, right, forward, shoulderHalfWidth, 5, scene, { excludeHead: true });

    /* One continuous surface from collar to waist. Separate bodice, yoke and
       collar shells always read as armour plates: every edge, gap and normal
       break between them shows. The neck zone occupies the top 30% of the
       rings, fit-clamped to the measured neck-to-shoulder band. */
    const NECK_ZONE = 0.3;
    const compositeRing = (u) => {
      if (u < NECK_ZONE) {
        const s = u / NECK_ZONE;
        const eased = Math.sin((s * Math.PI) / 2);
        const fit = yokeFit?.[Math.round(s * 4)];
        const center = neckAnchor.clone().lerp(shoulderRing.center, eased);
        if (fit) center.addScaledVector(torsoForward, fit.offset);
        return {
          center,
          rx: Math.max(THREE.MathUtils.lerp(neckTuck, shoulderRing.rx, eased), (fit?.rx || 0) + 0.006),
          rzFront: Math.max(THREE.MathUtils.lerp(neckTuck, shoulderRing.rzFront, eased), (fit?.rz || 0) + 0.006),
          // Straight profile down the back: the bowed ease belongs on the
          // chest, not over the trapezius.
          rzBack: Math.max(THREE.MathUtils.lerp(neckTuck, shoulderRing.rzBack, s), (fit?.rz || 0) + 0.006),
          forward,
          back: 0,
        };
      }
      return bodiceRing((u - NECK_ZONE) / (1 - NECK_ZONE));
    };
    const torsoGeo = ringGeometry(16, 36, compositeRing, { capTop: false, uvScale: { u: 1.25, v: 0.75 }, axis: torsoAxis });
    add(masculine ? 'Costume_SackJacket' : 'Costume_Bodice', torsoGeo, materials.dress, bones.spine02 || bones.pelvis, copyFrom(torsoFilter));

    // Contrast plastron: the inset front panel of a nineties bodice, in the
    // secondary fabric. A strip following the bodice front surface, wide at
    // the yoke, meeting the waist point below.
    if (!masculine) {
      const plastronHalf = THREE.MathUtils.lerp(0.018, 0.05, THREE.MathUtils.clamp(v.placketWidth ?? 0.34, 0, 1));
      const rows = 11; const cols = 5;
      const positions = []; const uvs = []; const indices = [];
      for (let row = 0; row < rows; row++) {
        // Ends at the waist: past it the plastron would poke through the
        // skirt and float buttons over the lap when seated.
        const t = THREE.MathUtils.lerp(0.02, 0.82, row / (rows - 1));
        const ring = bodiceRing(t);
        const dropAt = ring.drop ? ring.drop(0, 1, 0) : 0;
        const taper = THREE.MathUtils.lerp(1, 0.55, t); // narrows toward the waist point
        for (let col = 0; col < cols; col++) {
          const side = (col / (cols - 1) - 0.5) * 2 * plastronHalf * taper;
          const bulge = ring.rzFront * Math.max(0.5, 1 - 0.5 * (side / Math.max(ring.rx, 0.01)) ** 2);
          const at = ring.center.clone()
            .addScaledVector(torsoRight, side)
            .addScaledVector(torsoForward, bulge + 0.0045)
            .addScaledVector(torsoAxis, dropAt);
          positions.push(at.x, at.y, at.z);
          uvs.push((col / (cols - 1)) * 0.1, t * 0.55);
        }
      }
      for (let row = 0; row < rows - 1; row++) for (let col = 0; col < cols - 1; col++) {
        const a = row * cols + col; const b = a + 1;
        const c = (row + 1) * cols + col + 1; const d = c - 1;
        indices.push(a, c, b, a, d, c);
      }
      add('Costume_Plastron', finishGeometry(positions, uvs, indices), materials.secondary, bones.spine02 || bones.pelvis, copyFrom(torsoFilter));
    }

    if (!masculine) {
      // Piping cord riding the exact seam ring of the merged surface. Any
      // independently derived ellipse eventually detaches and floats.
      const seamRing = compositeRing(NECK_ZONE);
      const pipeRx = seamRing.rx + 0.0025;
      const pipeRzFront = seamRing.rzFront + 0.0025;
      const pipeRzBack = seamRing.rzBack + 0.0025;
      const pipeCenter = seamRing.center.clone();
      const pipingPath = [];
      for (let step = 0; step <= 36; step++) {
        const angle = (step / 36) * Math.PI * 2;
        const front = Math.cos(angle);
        pipingPath.push(pipeCenter.clone()
          .addScaledVector(torsoForward, front * (front >= 0 ? pipeRzFront : pipeRzBack))
          .addScaledVector(torsoRight, Math.sin(angle) * pipeRx));
      }
      const piping = tubeAlongPath(pipingPath, () => 0.0035, { radialSegments: 8, uvScale: { u: 0.03, v: 1.2 } });
      add('Costume_YokePiping', piping, materials.trim, bones.spine02 || bones.pelvis, copyFrom(torsoFilter));
    }

    /* --- skirt --- */
    const lap = knee.clone().addScaledVector(forward, 0.055);
    const drape = (v.skirtDrape ?? 0.6) * (seated ? 1 : 0);
    // Rear fullness as a rounded lobe below the waist at centre back, falling
    // off around the ring and vertically. A uniform rearward shear of the
    // back half reads as a shifted cylinder, not a padded form.
    const bustleStrength = v.bustleAmount * dressStyle.bustle;
    const bustleLobe = (t) => bustleStrength * 0.5 * Math.exp(-(((t - 0.24) / 0.26) ** 2));
    const trainLobe = (t) => train * 0.3 * THREE.MathUtils.smoothstep(t, 0.55, 1);
    // The carrier's own skirt is leg-weighted and therefore invisible to the
    // torso fit, yet it is exactly what the shell skirt must clear. Measure
    // the upper skirt band with limbs included and floor the radii on it.
    const skirtFit = masculine ? null : sampleTorsoFit(
      model,
      P.clone().setY(waistY),
      P.clone().setY(THREE.MathUtils.lerp(waistY, hemY, 0.6)),
      right, forward, 0.4, 7, scene,
      { excludeLimbs: false },
    );
    // Raised gore seam lines: seven panels, phased so centre front sits
    // between two seams the way a gored skirt is actually cut.
    const seamAmp = THREE.MathUtils.clamp(v.seamLines ?? 0.4, 0, 1) * (seated ? 0.008 : 0.012);
    const seamRidge = (a) => 1 + seamAmp * Math.pow(0.5 + 0.5 * Math.cos(a * 7 + Math.PI), 40);
    const skirtRing = (t) => {
      const center = new THREE.Vector3();
      const pleat = pleatShape(t);
      let rx; let rzFront; let rzBack; let back = 0; let drop = null; let lobe;
      if (seated) {
        // waist -> lap shelf -> fall to hem between the knees. Overlapping
        // ramps and the knee push round the shelf edge; hard-adjacent ramps
        // put a right-angle crease across the lap.
        const shelf = THREE.MathUtils.smoothstep(t, 0.05, 0.46);
        const fall = THREE.MathUtils.smoothstep(t, 0.40, 0.97);
        const y = THREE.MathUtils.lerp(waistY, P.y + 0.035, shelf) * (1 - fall) + hemY * fall;
        center.copy(P).setY(y);
        center.addScaledVector(forward, (lap.clone().sub(P).dot(forward)) * shelf * drape * (1 - fall * 0.1));
        // Fabric tents over the knees rather than breaking at them.
        center.addScaledVector(forward, Math.sin(fall * Math.PI) * 0.025);
        rx = massFactor * THREE.MathUtils.lerp(waistRx, 0.365 * v.skirtFullness * dressStyle.skirt, THREE.MathUtils.smoothstep(t, 0, 0.7));
        rzFront = massFactor * THREE.MathUtils.lerp(waistRz, 0.31 * v.skirtFullness * dressStyle.skirt, THREE.MathUtils.smoothstep(t, 0, 0.75));
        // The back must reach chair depth and hang off the seat edge; a
        // symmetric bell leaves the sitter's rear outside the skirt.
        rzBack = massFactor * THREE.MathUtils.lerp(
          waistRz,
          0.31 * v.skirtFullness * dressStyle.skirt + 0.10,
          THREE.MathUtils.smoothstep(t, 0, 0.45),
        );
        // Hem tucks slightly inward, pooling like cloth instead of ending as
        // a cut cylinder.
        const tuck = THREE.MathUtils.lerp(1, 0.96, THREE.MathUtils.smoothstep(t, 0.9, 1));
        rx *= tuck; rzFront *= tuck; rzBack *= tuck;
        lobe = (f) => 1 + bustleLobe(t) * 0.7 * Math.max(0, -f) ** 1.7;
      } else {
        const eased = t * t * (3 - 2 * t);
        // Hip spring: how quickly the skirt takes its width below the waist.
        // Low keeps it clinging over the hips; high springs out immediately.
        // max(t, 0): the waistband samples this ring slightly above the
        // waist, and a negative base with a fractional exponent is NaN.
        const spring = THREE.MathUtils.lerp(
          eased,
          Math.pow(Math.max(t, 0), 0.62),
          THREE.MathUtils.clamp(v.hipSpring ?? 0.5, 0, 1) * 0.55,
        );
        center.copy(P).setY(THREE.MathUtils.lerp(waistY, hemY, t));
        rx = THREE.MathUtils.lerp(massFactor * waistRx, hemRx, spring);
        // Gored front: the period skirt falls nearly plumb at centre front
        // while the fullness gathers to the sides and back.
        rzFront = THREE.MathUtils.lerp(
          massFactor * waistRz,
          THREE.MathUtils.lerp(hemRz, massFactor * waistRz + 0.025, frontFlatness),
          eased,
        );
        rzBack = THREE.MathUtils.lerp(massFactor * waistRz, hemRz * (1 + 0.1 * frontFlatness), spring);
        const bandT = t / 0.6; // the measurement spans the skirt's top 60%
        const fitRow = bandT <= 1.04 ? skirtFit?.[Math.round(THREE.MathUtils.clamp(bandT, 0, 1) * 6)] : null;
        if (fitRow?.samples) {
          // Row clearances are baked into the measurement.
          rx = Math.max(rx, fitRow.rx);
          rzFront = Math.max(rzFront, fitRow.offset + fitRow.rz);
          rzBack = Math.max(rzBack, fitRow.rz - fitRow.offset);
        }
        lobe = (f) => 1 + bustleLobe(t) * Math.max(0, -f) ** 1.7 + trainLobe(t) * Math.max(0, -f) ** 1.3;
        if (train) drop = (a, f) => -train * 0.02 * backMask(f) * THREE.MathUtils.smoothstep(t, 0.85, 1);
      }
      // Soft vertical fall folds on the side panels; the flat front and the
      // pleated back stay as cut.
      const foldAmp = seated ? 0 : 0.007 * THREE.MathUtils.smoothstep(t, 0.35, 1);
      return {
        center, rx, rzFront, rzBack, forward, back, drop,
        shape: (a, f, s) => pleat(a, f) * lobe(f) * seamRidge(a)
          * (1 + foldAmp * s * s * (1 - Math.max(0, -f)) * Math.sin(a * 5 + 1.3)),
      };
    };
    const skirtGeo = !masculine && ringGeometry(14, 44, skirtRing, { uvScale: { u: 2.3, v: Math.max(0.3, waistY - hemY) } });
    if (skirtGeo) add('Costume_Skirt', skirtGeo, materials.dress, bones.pelvis, skirtWeights);

    // Trim bands and a scalloped flounce ride the same ring function as the
    // skirt, so they follow the gores, pleats, bustle and train exactly.
    if (skirtGeo) {
      const trimRows = Math.round(THREE.MathUtils.clamp(v.hemTrimRows ?? 1, 0, 3));
      const bandWidth = THREE.MathUtils.lerp(0.01, 0.035, THREE.MathUtils.clamp(v.trimWidth ?? 0.42, 0, 1));
      const bandHeight = bandWidth / Math.max(0.3, waistY - hemY);
      for (let rowIndex = 0; rowIndex < trimRows; rowIndex++) {
        const tCenter = 0.94 - rowIndex * 0.075;
        const band = ringGeometry(2, 44, (tt) => {
          const ring = skirtRing(tCenter + (tt - 0.5) * bandHeight);
          return { ...ring, rx: ring.rx + 0.003, rzFront: ring.rzFront + 0.003, rzBack: ring.rzBack + 0.003 };
        }, { capTop: false, capBottom: false, uvScale: { u: 2.3, v: bandWidth } });
        add(`Costume_HemTrim_${rowIndex}`, band, materials.trim, bones.pelvis, skirtWeights);
      }
      const ruffle = THREE.MathUtils.clamp(v.hemRuffle ?? 0.35, 0, 1);
      if (ruffle > 0.02 && !seated) {
        const flounce = ringGeometry(3, 60, (tt) => {
          const ring = skirtRing(THREE.MathUtils.lerp(0.9, 1.0, tt));
          const base = ring.shape;
          return {
            ...ring,
            rx: ring.rx + 0.007, rzFront: ring.rzFront + 0.007, rzBack: ring.rzBack + 0.007,
            shape: (a, f, s) => base(a, f, s) * (1 + 0.05 * ruffle * Math.sin(a * 34) * tt),
          };
        }, { capTop: false, capBottom: false, uvScale: { u: 2.4, v: 0.12 } });
        add('Costume_HemFlounce', flounce, materials.dress, bones.pelvis, skirtWeights);
      }
    }
    if (!masculine) {
      // A real garment needs a continuous waist seam. It rides the skirt's
      // own ring function: built as flared cylinders on the pelvis axis it
      // stood off the leaning seated torso as a hard stepped ring.
      const waistband = ringGeometry(3, 44, (tt) => {
        const ring = skirtRing(THREE.MathUtils.lerp(-0.015, 0.05, tt));
        return { ...ring, rx: ring.rx + 0.004, rzFront: ring.rzFront + 0.004, rzBack: ring.rzBack + 0.004 };
      }, { capTop: false, capBottom: false, uvScale: { u: 1.1, v: 0.07 } });
      add('Costume_WaistSeam', waistband, materials.dress, bones.pelvis, skirtWeights);

      // The free MakeClothes carrier supplies the real torso and sleeve skin
      // weights, but its modern skirt has an open walking slit. Dark fitted
      // underlayers keep that slit from exposing skin beneath the period skirt.
      for (const side of ['L', 'R']) {
        const thigh = bones[`thigh${side}`];
        const calf = bones[`calf${side}`];
        const foot = bones[`foot${side}`];
        if (!thigh || !calf) continue;
        const hipAt = pointInScene(thigh);
        const kneeAt = pointInScene(calf);
        add(
          `Costume_PetticoatThigh_${side}`,
          tubeAlong(hipAt, kneeAt, (u) => THREE.MathUtils.lerp(0.105, 0.082, u) * Math.sqrt(massFactor), {
            radialSegments: 16, lengthSegments: 7,
          }),
          materials.dress,
          thigh,
        );
        const kneeCover = new THREE.SphereGeometry(0.088 * Math.sqrt(massFactor), 16, 12);
        kneeCover.scale(1, 0.82, 1);
        kneeCover.translate(kneeAt.x, kneeAt.y, kneeAt.z);
        add(`Costume_PetticoatKnee_${side}`, kneeCover, materials.dress, calf);
        if (foot) {
          add(
            `Costume_PetticoatCalf_${side}`,
            tubeAlong(kneeAt, pointInScene(foot), (u) => THREE.MathUtils.lerp(0.078, 0.052, u) * Math.sqrt(massFactor), {
              radialSegments: 16, lengthSegments: 7,
            }),
            materials.dress,
            calf,
          );
        }
      }
    }

    /* --- men's trousers --- */
    if (masculine) {
      const trouserWaist = ringGeometry(5, 32, (t) => ({
        center: P.clone().addScaledVector(up, THREE.MathUtils.lerp(0.115, -0.135, t))
          .addScaledVector(forward, seated ? 0.028 * t : 0),
        rx: massFactor * THREE.MathUtils.lerp(0.185, 0.205, t),
        rz: massFactor * THREE.MathUtils.lerp(0.145, 0.165, t),
        forward,
        back: seated ? 0.025 : 0,
      }), { capTop: false, capBottom: false, uvScale: { u: 1.2, v: 0.25 } });
      add('Costume_TrouserWaist', trouserWaist, materials.dress, bones.pelvis);
    }
    if (masculine) for (const side of ['L', 'R']) {
      const thigh = bones[`thigh${side}`]; const calf = bones[`calf${side}`]; const foot = bones[`foot${side}`];
      if (!thigh || !calf) continue;
      const hipAt = pointInScene(thigh); const kneeAt = pointInScene(calf);
      const thighGeo = tubeAlong(hipAt, kneeAt, (t) => massFactor * THREE.MathUtils.lerp(0.112, 0.086, t), { radialSegments: 18, lengthSegments: 9 });
      add(`Costume_TrouserThigh_${side}`, thighGeo, materials.dress, thigh);
      const kneeCover = new THREE.SphereGeometry(0.108 * massFactor, 20, 14);
      kneeCover.scale(1.02, 0.84, 1.08);
      kneeCover.translate(kneeAt.x, kneeAt.y, kneeAt.z);
      add(`Costume_TrouserKnee_${side}`, kneeCover, materials.dress, calf);
      if (foot) {
        const ankleAt = pointInScene(foot);
        const shinGeo = tubeAlong(kneeAt, ankleAt, (t) => massFactor * THREE.MathUtils.lerp(0.088, 0.065, t), { radialSegments: 18, lengthSegments: 9 });
        add(`Costume_TrouserShin_${side}`, shinGeo, materials.dress, calf);
      }
    }

    /* --- sleeves: one continuous tube across the elbow --- */
    const sleeveStrength = THREE.MathUtils.clamp((v.sleeveVolume ?? 0.8) * dressStyle.sleeve, 0.35, 1.6);
    const puffLength = THREE.MathUtils.lerp(0.30, 0.60, THREE.MathUtils.clamp(v.puffLength ?? 0.45, 0, 1));
    const puffAmplitude = (0.022 + 0.06 * (sleeveStrength - 0.35) / 1.25) * Math.sqrt(massFactor);
    const sleeveTaper = THREE.MathUtils.clamp(v.sleeveTaper ?? 0.6, 0, 1);
    const gatherDepth = THREE.MathUtils.clamp(v.gatherDepth ?? 0.4, 0, 1);
    for (const side of ['L', 'R']) {
      const upper = bones[`upperarm${side}`]; const lower = bones[`lowerarm${side}`]; const hand = bones[`hand${side}`];
      if (!upper || !lower) continue;
      const S = pointInScene(upper); const E = pointInScene(lower);
      const W = hand ? pointInScene(hand) : E.clone().lerp(S, -0.85);
      // Start above and inside the shoulder joint: an 1896 sleeve head stood
      // proud of the shoulder line, and the raised head is also what covers
      // the deltoid. Kept modest — overdone it reads as a pointed epaulette.
      const sleeveStart = S.clone().lerp(shoulderCenter, 0.08).addScaledVector(up, 0.022);
      const cuffEnd = E.clone().lerp(W, THREE.MathUtils.clamp(v.sleeveLength ?? 0.98, 0.6, 1.05));
      const curve = new THREE.CatmullRomCurve3([sleeveStart, E, cuffEnd]);
      // Radii clear the carrier's cloth surface, not just the arm itself.
      const baseR = 0.06 * Math.sqrt(massFactor);
      const wristR = (0.054 - 0.014 * sleeveTaper) * Math.sqrt(massFactor);
      // The elbow control point sits at curve parameter 0.5 on a three-point
      // Catmull-Rom regardless of segment lengths; a distance-ratio estimate
      // put the elbow pad centimetres from the actual crease.
      const radiusFn = (t) => {
        const bell = Math.exp(-(((t - puffLength * 0.42) / (puffLength * 0.42)) ** 2));
        const body = THREE.MathUtils.lerp(baseR, wristR, THREE.MathUtils.smoothstep(t, Math.max(puffLength * 0.85, 0.68), 1));
        const elbowPad = 0.013 * Math.exp(-(((t - 0.5) / 0.17) ** 2));
        // Wide and low: a rounded head, not a spike.
        const shoulderCap = 0.01 * Math.exp(-((t / 0.15) ** 2));
        return body + puffAmplitude * bell + elbowPad + shoulderCap;
      };
      const gatherFn = gatherDepth ? (t, angle) => {
        const zone = Math.exp(-(((t - puffLength * 0.3) / (puffLength * 0.5)) ** 2));
        return 1 + 0.05 * gatherDepth * Math.sin(angle * 13) * zone;
      } : null;
      add(
        `Costume_Sleeve_${side}`,
        tubeAlongPath(curve.getPoints(16), radiusFn, {
          radialSegments: 20, radialFn: gatherFn, uvScale: { u: 0.38, v: 0.6 },
        }),
        materials.dress,
        upper,
        copyFrom(side === 'L' ? armLFilter : armRFilter),
      );
      if (hand) {
        const cuffLength = THREE.MathUtils.lerp(0.05, 0.22, THREE.MathUtils.clamp(v.cuffWidth ?? 0.58, 0, 1));
        const cuffRadius = wristR + 0.005 + THREE.MathUtils.clamp(v.cuffThickness ?? 0.35, 0, 1.5) * 0.004;
        // Overshoot toward the hand: the wrist joint sits short of where the
        // hand mesh begins, and a flexed wrist rotates out of a short cuff.
        const cuffTip = cuffEnd.clone().addScaledVector(W.clone().sub(E).normalize(), 0.028);
        const cuff = tubeAlong(cuffTip.clone().lerp(E, cuffLength), cuffTip, () => cuffRadius, { lengthSegments: 2 });
        add(`Costume_Cuff_${side}`, cuff, materials.trim, lower, copyFrom(side === 'L' ? armLFilter : armRFilter));
      }
    }

    /* --- collar --- */
    // Snug measured band; the fixed-radius tube stood open around the neck.
    // Clears the carrier's own neckline cloth, or its ragged edge pokes
    // through the band.
    const collarRadius = neckR + 0.006 + THREE.MathUtils.clamp(v.collarThickness ?? 0.35, 0, 1.5) * 0.005;
    const collarA = collarBase.clone().addScaledVector(forward, neckOffset);
    const collarB = collarTop.clone().addScaledVector(forward, neckOffset * 0.8);
    const collar = tubeAlong(collarA, collarB, (t) => THREE.MathUtils.lerp(collarRadius + 0.003, collarRadius, t), { lengthSegments: 3 });
    add('Costume_Collar', collar, materials.trim, bones.neck || bones.head, copyFrom(null));
    if (!masculine) {
      // Brooch at the collar base, the standard closure in nineties portraits.
      const broochAt = collarA.clone().addScaledVector(forward, collarRadius + 0.004);
      const brooch = new THREE.SphereGeometry(0.011, 12, 8);
      brooch.scale(1, 0.85, 0.55);
      brooch.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), forward));
      brooch.translate(broochAt.x, broochAt.y, broochAt.z);
      add('Costume_Brooch', brooch, materials.trim, bones.neck || bones.head, copyFrom(null));
    }

    /* --- bodice placket + buttons --- */
    const chestForward = forward.clone();
    const count = Math.max(3, Math.round((v.buttonCount ?? 6) + dressStyle.buttons));
    for (let index = 0; index < count; index++) {
      const spacing = THREE.MathUtils.clamp(v.buttonSpacing, 0.6, 1.3);
      const t = THREE.MathUtils.lerp(0.12, 0.78, count === 1 ? 0 : Math.min(1, (index / (count - 1)) * spacing));
      // Sit on the finished cloth (bodice ring + plastron), not the skin fit,
      // or the buttons sink beneath the panel they are meant to close.
      const ring = bodiceRing(t);
      const at = ring.center.clone().addScaledVector(torsoForward, ring.rzFront + 0.0105);
      if (ring.drop) at.addScaledVector(torsoAxis, ring.drop(0, 1, 0));
      const button = new THREE.SphereGeometry(0.0095, 12, 8);
      button.translate(at.x, at.y, at.z);
      add(`Costume_Button_${index}`, button, materials.trim, bones.spine03 || bones.pelvis, copyFrom(torsoFilter));
    }

    if (dressStyle.apron) {
      const apronAt = P.clone().setY(P.y - 0.18).addScaledVector(forward, 0.245);
      const apron = new THREE.BoxGeometry(0.35 * massFactor, 0.48, 0.008);
      apron.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), forward));
      apron.translate(apronAt.x, apronAt.y, apronAt.z);
      add('Costume_WorkingApron', apron, materials.trim, bones.pelvis, copyFrom(null));
    }
    // Under the shell the carrier must read as dark lining, not a second
    // garment: a residual gap then shows shadowed underlayer instead of
    // contrasting corduroy.
    if (rendererCPrototype) {
      const lining = materials.dress.color.clone().multiplyScalar(0.35);
      model?.getObjectByName?.('RendererC_BaseGarment')?.traverse((object) => {
        if (!object.isMesh) return;
        for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
          if (!material?.color) continue;
          if (!material.userData.shellLiningOriginal) material.userData.shellLiningOriginal = material.color.clone();
          material.color.copy(lining);
        }
      });
    }

    if (dressStyle.band) {
      const bandCenter = P.clone().setY(waistY - 0.11).addScaledVector(forward, 0.018);
      const bandFit = torsoFit?.at(-1);
      const bandRz = Math.max(0.14 * massFactor * v.bodiceFit, bandFit?.rz || 0);
      const band = ringGeometry(3, 36, (t) => ({
        center: bandCenter.clone().addScaledVector(up, (t - 0.5) * 0.045).addScaledVector(forward, bandFit?.offset || 0),
        rx: Math.max(0.17 * massFactor * v.bodiceFit, bandFit?.rx || 0),
        rz: bandRz, forward, back: 0,
      }), { capTop: false, capBottom: false, uvScale: { u: 1.1, v: 0.05 } });
      add('Costume_ContrastBand', band, materials.trim, bones.pelvis, skirtWeights);
      if (!masculine) {
        const buckleAt = bandCenter.clone()
          .addScaledVector(forward, (bandFit?.offset || 0) + bandRz + 0.009);
        const buckle = new THREE.BoxGeometry(0.034, 0.05, 0.012);
        buckle.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), forward));
        buckle.translate(buckleAt.x, buckleAt.y, buckleAt.z);
        add('Costume_BeltBuckle', buckle, materials.trim, bones.pelvis, skirtWeights);
      }
    }

  }

  /* Spring-damper hem sway: each sway bone chases its rest point under the
     pelvis, so the hem lags on turns and strides and settles when still.
     Heavy wool over petticoats moves in exactly this low, damped register. */
  const swayTarget = new THREE.Vector3();
  const swayOffset = new THREE.Vector3();
  const swayQuat = new THREE.Quaternion();
  function update(delta, values = {}) {
    if (!swayBones.length || !bones.pelvis) return;
    const dt = THREE.MathUtils.clamp(delta, 0, 0.05);
    if (!dt) return;
    bones.pelvis.updateWorldMatrix(true, false);
    const amount = THREE.MathUtils.clamp(values.swayAmount ?? 0.55, 0, 1);
    const stiffness = THREE.MathUtils.lerp(30, 170, THREE.MathUtils.clamp(values.swayStiffness ?? 0.5, 0, 1));
    const damping = THREE.MathUtils.lerp(2.5, 16, THREE.MathUtils.clamp(values.swayDamping ?? 0.5, 0, 1));
    bones.pelvis.getWorldQuaternion(swayQuat).invert();
    for (let index = 0; index < swayBones.length; index++) {
      swayTarget.copy(swayRest[index]).applyMatrix4(bones.pelvis.matrixWorld);
      const particle = swayParticles[index];
      const velocity = swayVelocities[index];
      swayOffset.subVectors(swayTarget, particle);
      velocity.addScaledVector(swayOffset, stiffness * dt);
      velocity.multiplyScalar(Math.exp(-damping * dt));
      particle.addScaledVector(velocity, dt);
      swayOffset.subVectors(particle, swayTarget);
      const length = swayOffset.length();
      if (length > 0.16) {
        swayOffset.multiplyScalar(0.16 / length);
        particle.copy(swayTarget).add(swayOffset);
      }
      // Vertical lag reads as the skirt stretching, not swishing.
      swayOffset.y *= 0.25;
      swayOffset.multiplyScalar(amount).applyQuaternion(swayQuat);
      swayBones[index].position.copy(swayRest[index]).add(swayOffset);
    }
  }

  function dispose() {
    disposeCostumePieces();
    model?.getObjectByName?.('RendererC_BaseGarment')?.traverse((object) => {
      if (!object.isMesh) return;
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
        if (material?.userData?.shellLiningOriginal) {
          material.color.copy(material.userData.shellLiningOriginal);
          delete material.userData.shellLiningOriginal;
        }
      }
    });
  }

  return {
    rebuild,
    dispose,
    update,
    updateMaterials,
    materials,
    pieces: () => [...pieces],
  };
}
