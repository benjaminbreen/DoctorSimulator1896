import * as THREE from 'three';
import { createHairSystem } from './hair/index.js';
import { createMhrHairFormSystem } from './mhr-hair-forms.js';

/* Procedural 1890s costume + hair, rebuilt live from preset values.
   Geometry is constructed in world space at the skeleton's rest pose, then
   attached to bones with Object3D.attach so every piece follows animation.
   The caller must snap the skeleton to rest before rebuild(). */

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

const world = (bone, out = new THREE.Vector3()) => bone.getWorldPosition(out);

function primaryBodyMesh(model) {
  let preferred = null;
  let largest = null;
  let largestCount = 0;
  model?.traverse((object) => {
    if (!object.isSkinnedMesh || !object.geometry?.attributes?.position) return;
    const count = object.geometry.attributes.position.count;
    if (/^(body_mesh|human_body)$/i.test(object.name)) preferred = object;
    if (count > largestCount) { largest = object; largestCount = count; }
  });
  return preferred || largest;
}

/* Measure the currently posed and morphed body instead of dressing an assumed
   average torso. The returned ellipses enclose every central torso vertex in
   each horizontal slice, with enough clearance to prevent z-fighting and
   body punch-through. */
export function sampleTorsoFit(model, top, bottom, right, forward, shoulderHalfWidth, slices = 11) {
  const body = primaryBodyMesh(model);
  if (!body || slices < 2 || Math.abs(top.y - bottom.y) < 0.001) return null;
  body.updateMatrixWorld(true);
  const rows = Array.from({ length: slices }, () => ({ side: 0, front: -Infinity, back: Infinity, samples: 0 }));
  const point = new THREE.Vector3();
  const centre = new THREE.Vector3();
  const relative = new THREE.Vector3();
  const span = top.y - bottom.y;
  const lateralLimit = Math.max(0.14, shoulderHalfWidth * 0.94);
  const skinIndex = body.geometry.attributes.skinIndex;
  const skinWeight = body.geometry.attributes.skinWeight;
  const excludedBoneIndices = new Set();
  body.skeleton?.bones?.forEach((bone, index) => {
    if (/(uparm|upperarm|lowarm|lowerarm|wrist|hand|thumb|index|middle|ring|pinky|upleg|thigh|lowleg|calf|foot|toe)/i.test(bone.name)) {
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
    const t = (top.y - point.y) / span;
    if (t < -0.04 || t > 1.04) continue;
    centre.copy(top).lerp(bottom, THREE.MathUtils.clamp(t, 0, 1));
    relative.subVectors(point, centre);
    const side = relative.dot(right);
    if (Math.abs(side) > lateralLimit) continue; // exclude arms
    const depth = relative.dot(forward);
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

function conformalYokeGeometry(model, centre, bottomY, topY, right, forward, lateralLimit, depthLimit) {
  const body = primaryBodyMesh(model);
  const sourceIndex = body?.geometry?.index;
  const sourcePosition = body?.geometry?.attributes?.position;
  if (!body || !sourcePosition) return null;
  body.updateMatrixWorld(true);
  const worldPositions = Array.from({ length: sourcePosition.count }, () => new THREE.Vector3());
  for (let vertex = 0; vertex < sourcePosition.count; vertex++) {
    body.getVertexPosition(vertex, worldPositions[vertex]).applyMatrix4(body.matrixWorld);
  }
  const positions = [];
  const indices = [];
  const selectedTriangles = [];
  const accumulatedNormals = new Map();
  const relative = new THREE.Vector3();
  const outward = new THREE.Vector3();
  const triangleCount = sourceIndex ? sourceIndex.count / 3 : sourcePosition.count / 3;
  for (let triangle = 0; triangle < triangleCount; triangle++) {
    const ids = sourceIndex
      ? [sourceIndex.getX(triangle * 3), sourceIndex.getX(triangle * 3 + 1), sourceIndex.getX(triangle * 3 + 2)]
      : [triangle * 3, triangle * 3 + 1, triangle * 3 + 2];
    const points = ids.map((id) => worldPositions[id]);
    const centroid = points[0].clone().add(points[1]).add(points[2]).multiplyScalar(1 / 3);
    if (centroid.y < bottomY || centroid.y > topY) continue;
    relative.subVectors(centroid, centre);
    const side = relative.dot(right);
    const depth = relative.dot(forward);
    if (Math.abs(side) > lateralLimit || Math.abs(depth) > depthLimit) continue;
    const triangleNormal = points[1].clone().sub(points[0])
      .cross(points[2].clone().sub(points[0])).normalize();
    outward.copy(right).multiplyScalar(side).addScaledVector(forward, depth);
    if (triangleNormal.dot(outward) < 0) triangleNormal.negate();
    selectedTriangles.push(ids);
    for (const id of ids) {
      if (!accumulatedNormals.has(id)) accumulatedNormals.set(id, new THREE.Vector3());
      accumulatedNormals.get(id).add(triangleNormal);
    }
  }
  if (!selectedTriangles.length) return null;
  // Weld adjacent source triangles and use an averaged surface normal for the
  // cloth clearance. Per-triangle offsets separate at every edge and reveal a
  // conspicuous web of the underlying skin.
  const remap = new Map();
  for (const ids of selectedTriangles) {
    for (const id of ids) {
      if (!remap.has(id)) {
        const normal = accumulatedNormals.get(id).normalize();
        const point = worldPositions[id].clone().addScaledVector(normal, 0.0085);
        remap.set(id, positions.length / 3);
        positions.push(point.x, point.y, point.z);
      }
      indices.push(remap.get(id));
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function ringGeometry(rings, segments, ringFn, { capTop = true, capBottom = true } = {}) {
  // ringFn(t) -> { center: Vector3, rx, rz, forward: Vector3, back: number }
  const positions = []; const indices = [];
  const right = new THREE.Vector3(); const fwd = new THREE.Vector3(); const point = new THREE.Vector3();
  const centers = [];
  for (let ring = 0; ring < rings; ring++) {
    const t = ring / (rings - 1);
    const r = ringFn(t);
    centers.push(r.center.clone());
    fwd.copy(r.forward).setY(0).normalize();
    right.crossVectors(new THREE.Vector3(0, 1, 0), fwd).normalize();
    for (let segment = 0; segment < segments; segment++) {
      const a = (segment / segments) * Math.PI * 2;
      let f = Math.cos(a); let s = Math.sin(a);
      point.copy(r.center).addScaledVector(fwd, f * r.rz).addScaledVector(right, s * r.rx);
      if (r.back && f < 0) point.addScaledVector(fwd, f * r.back);
      positions.push(point.x, point.y, point.z);
    }
  }
  for (let ring = 0; ring < rings - 1; ring++) for (let segment = 0; segment < segments; segment++) {
    const next = (segment + 1) % segments;
    const a = ring * segments + segment, b = ring * segments + next;
    const c = (ring + 1) * segments + next, d = (ring + 1) * segments + segment;
    indices.push(a, b, c, a, c, d);
  }
  let base = rings * segments;
  if (capTop) {
    positions.push(centers[0].x, centers[0].y, centers[0].z);
    for (let segment = 0; segment < segments; segment++) indices.push(base, (segment + 1) % segments, segment);
    base += 1;
  }
  if (capBottom) {
    const last = centers[centers.length - 1];
    positions.push(last.x, last.y, last.z);
    const row = (rings - 1) * segments;
    for (let segment = 0; segment < segments; segment++) indices.push(base, row + segment, row + (segment + 1) % segments);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function yokeGeometry(outerCenter, innerCenter, outerRx, outerRz, innerRx, innerRz, forward, segments = 40) {
  const positions = [];
  const indices = [];
  const up = new THREE.Vector3(0, 1, 0);
  const fwd = forward.clone().setY(0).normalize();
  const right = new THREE.Vector3().crossVectors(up, fwd).normalize();
  for (let segment = 0; segment < segments; segment++) {
    const angle = segment / segments * Math.PI * 2;
    const front = Math.cos(angle);
    const side = Math.sin(angle);
    const outer = outerCenter.clone().addScaledVector(fwd, front * outerRz).addScaledVector(right, side * outerRx);
    const inner = innerCenter.clone().addScaledVector(fwd, front * innerRz).addScaledVector(right, side * innerRx);
    positions.push(outer.x, outer.y, outer.z, inner.x, inner.y, inner.z);
  }
  for (let segment = 0; segment < segments; segment++) {
    const next = (segment + 1) % segments;
    const outer = segment * 2;
    const inner = outer + 1;
    const nextOuter = next * 2;
    const nextInner = nextOuter + 1;
    indices.push(outer, nextOuter, nextInner, outer, nextInner, inner);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function tubeAlong(a, b, radiusFn, { radialSegments = 18, lengthSegments = 12, bulge = null, capEnds = true } = {}) {
  const axis = new THREE.Vector3().subVectors(b, a);
  const length = axis.length(); axis.normalize();
  const helper = Math.abs(axis.y) > 0.94 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
  const u = new THREE.Vector3().crossVectors(axis, helper).normalize();
  const v = new THREE.Vector3().crossVectors(axis, u).normalize();
  const positions = []; const indices = []; const point = new THREE.Vector3();
  for (let ring = 0; ring <= lengthSegments; ring++) {
    const t = ring / lengthSegments;
    const radius = radiusFn(t);
    for (let segment = 0; segment < radialSegments; segment++) {
      const angle = (segment / radialSegments) * Math.PI * 2;
      point.copy(a).addScaledVector(axis, t * length)
        .addScaledVector(u, Math.cos(angle) * radius)
        .addScaledVector(v, Math.sin(angle) * radius);
      if (bulge) point.addScaledVector(bulge.dir, bulge.amount(t, angle));
      positions.push(point.x, point.y, point.z);
    }
  }
  for (let ring = 0; ring < lengthSegments; ring++) for (let segment = 0; segment < radialSegments; segment++) {
    const next = (segment + 1) % radialSegments;
    const q = ring * radialSegments + segment, r = ring * radialSegments + next;
    const s = (ring + 1) * radialSegments + next, t2 = (ring + 1) * radialSegments + segment;
    indices.push(q, r, s, q, s, t2);
  }
  let base = (lengthSegments + 1) * radialSegments;
  if (capEnds) {
    positions.push(a.x, a.y, a.z);
    for (let segment = 0; segment < radialSegments; segment++) indices.push(base, (segment + 1) % radialSegments, segment);
    base += 1;
    positions.push(b.x, b.y, b.z);
    const row = lengthSegments * radialSegments;
    for (let segment = 0; segment < radialSegments; segment++) indices.push(base, row + segment, row + (segment + 1) % radialSegments);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

export function createCostume(scene, bones, model = null) {
  // The comparison GLB carries a legacy fitted bun, but it is identity-specific
  // and cannot respond to hairstyle, volume, hairline, greying, or texture
  // controls. Keeping it visible made every MHR subject inherit the same bald
  // crown. Hide that source asset and use the live, scalp-fitted system for all
  // runtime identities; authored production hair can return later as a proper
  // style library with explicit compatibility metadata.
  model?.traverse((object) => {
    const name = `${object.name || ''} ${object.geometry?.name || ''}`.toLowerCase();
    if (name.includes('authored_hair_bun') || name.includes('hair_bun_brown')) object.visible = false;
  });
  const hairSystem = model?.getObjectByName?.('body_mesh')
    ? createMhrHairFormSystem(scene, bones, model)
    : createHairSystem(scene, bones, model);
  const materials = {
    dress: new THREE.MeshStandardMaterial({ name: 'CostumeDress', color: '#171525', roughness: 0.82, side: THREE.DoubleSide }),
    trim: new THREE.MeshStandardMaterial({ name: 'CostumeTrim', color: '#4f4333', roughness: 0.72, side: THREE.DoubleSide }),
    // Kept on the public costume contract for main.js and console calibration.
    hair: hairSystem.materials.base,
  };
  let pieces = []; // { mesh, bone }

  function add(name, geometry, material, bone) {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = name; mesh.castShadow = true; mesh.frustumCulled = false;
    mesh.receiveShadow = material !== materials.hair;
    scene.add(mesh);
    if (bone) bone.attach(mesh);
    pieces.push({ mesh, bone });
    return mesh;
  }

  function disposeCostumePieces() {
    for (const { mesh } of pieces) { mesh.parent?.remove(mesh); mesh.geometry.dispose(); }
    pieces = [];
  }

  function rebuild(v) {
    disposeCostumePieces();
    materials.dress.color.set(v.dressColor); materials.dress.roughness = v.fabricRoughness;
    materials.trim.color.set(v.trimColor);
    if (!bones.pelvis || !bones.head) return;

    const styles = {
      'conservative-day': { sleeve: 0.78, skirt: 0.96, bustle: 0.65, collar: 1.05, buttons: 0, apron: false, band: false },
      'fashionable-1896': { sleeve: 1.62, skirt: 1.10, bustle: 1.15, collar: 0.92, buttons: 1, apron: false, band: true },
      'mourning-dress': { sleeve: 0.92, skirt: 1.04, bustle: 0.45, collar: 1.25, buttons: 2, apron: false, band: true },
      'working-day': { sleeve: 0.62, skirt: 0.82, bustle: 0.18, collar: 0.82, buttons: -1, apron: true, band: false },
      'visiting-dress': { sleeve: 1.28, skirt: 1.18, bustle: 1.05, collar: 1.08, buttons: 1, apron: false, band: true },
      'mens-sack-suit': { sleeve: 0.70, skirt: 0.9, bustle: 0, collar: 0.85, buttons: -1, apron: false, band: false },
      'mens-formal-suit': { sleeve: 0.64, skirt: 0.9, bustle: 0, collar: 1.08, buttons: 0, apron: false, band: true },
      'mens-working-clothes': { sleeve: 0.56, skirt: 0.9, bustle: 0, collar: 0.66, buttons: -1, apron: false, band: false },
      'mens-mourning-suit': { sleeve: 0.66, skirt: 0.9, bustle: 0, collar: 1.04, buttons: 0, apron: false, band: true },
    };
    const dressStyle = styles[v.outfitStyle] || styles['conservative-day'];
    const massFactor = 1 + ((v.weight ?? 0.48) - 0.48) * 0.42;
    const masculine = (v.gender ?? 0.5) >= 0.55;

    const P = world(bones.pelvis); const H = world(bones.head);
    const N = bones.neck ? world(bones.neck) : H.clone().add(new THREE.Vector3(0, -0.08, 0));
    const C = bones.spine03 ? world(bones.spine03) : P.clone().lerp(N, 0.7);
    const kneeL = bones.calfL ? world(bones.calfL) : null;
    const kneeR = bones.calfR ? world(bones.calfR) : null;
    const footY = bones.footL ? world(bones.footL).y : 0.03;
    const seated = (v.seated ?? 1) >= 0.5;
    const knee = kneeL && kneeR ? kneeL.clone().add(kneeR).multiplyScalar(0.5) : P.clone().add(new THREE.Vector3(0, -0.3, 0.35));
    const forward = knee.clone().sub(P); forward.y = 0;
    if (forward.lengthSq() < 1e-6) forward.set(0, 0, 1);
    forward.normalize();
    const up = new THREE.Vector3(0, 1, 0);
    const right = new THREE.Vector3().crossVectors(up, forward).normalize();
    const shoulderL = bones.upperarmL ? world(bones.upperarmL) : C.clone().addScaledVector(right, 0.18);
    const shoulderR = bones.upperarmR ? world(bones.upperarmR) : C.clone().addScaledVector(right, -0.18);
    const shoulderCenter = shoulderL.clone().add(shoulderR).multiplyScalar(0.5);
    const shoulderHalfWidth = Math.max(0.17, shoulderL.distanceTo(shoulderR) * 0.5 + 0.025);
    const torsoTop = shoulderCenter.clone().lerp(N, 0.20);
    const torsoFit = sampleTorsoFit(model, torsoTop, P, right, forward, shoulderHalfWidth, 11);

    /* --- bodice / jacket shell ---
       MPFB carries an authored base garment, but MHR is a bare body. This
       lightweight shell gives both engines a complete period silhouette until
       fitted, skinned production garments replace the procedural foundation. */
    const torsoGeo = ringGeometry(11, 36, (t) => {
      const fit = torsoFit?.[Math.round(t * 10)];
      const centre = torsoTop.clone().lerp(P, t).addScaledVector(
        forward,
        fit?.offset ?? (masculine ? 0.006 : 0.014 * Math.sin(t * Math.PI)),
      );
      const chest = Math.sin(t * Math.PI);
      const fittedWidth = massFactor * ((masculine ? 0.175 : 0.158) + chest * (masculine ? 0.032 : 0.026));
      const shoulderEnvelope = THREE.MathUtils.lerp(
        shoulderHalfWidth + 0.026,
        0,
        THREE.MathUtils.smoothstep(t, 0.02, 0.30),
      );
      return {
        center: centre,
        rx: Math.max(fittedWidth, fit?.rx || 0, shoulderEnvelope),
        rz: Math.max(massFactor * ((masculine ? 0.118 : 0.108) + chest * (masculine ? 0.022 : 0.032)), fit?.rz || 0),
        forward,
        back: 0,
      };
    }, { capTop: false });
    add(masculine ? 'Costume_SackJacket' : 'Costume_Bodice', torsoGeo, materials.dress, bones.spine02 || bones.pelvis);

    // A high-neck 1890s bodice needs a real shoulder/chest yoke. A torso tube
    // alone leaves bare wedges between its top ellipse, the collar, and the
    // separately attached sleeve heads. Bridge that space with an annular,
    // body-fitted panel while preserving a small neck opening.
    const topFit = torsoFit?.[0];
    const yokeOuter = torsoTop.clone().addScaledVector(forward, topFit?.offset || 0);
    const yokeInner = N.clone().lerp(H, 0.10);
    const fallbackYoke = yokeGeometry(
      yokeOuter,
      yokeInner,
      Math.max(shoulderHalfWidth + 0.052, (topFit?.rx || 0.19) + 0.018),
      Math.max(0.150 * massFactor, (topFit?.rz || 0.12) + 0.018),
      0.066 * THREE.MathUtils.clamp(v.collarSpread ?? 1, 0.75, 1.3),
      0.064 * THREE.MathUtils.clamp(v.collarSpread ?? 1, 0.75, 1.3),
      forward,
    );
    const fittedYoke = conformalYokeGeometry(
      model,
      shoulderCenter,
      torsoTop.y - 0.075,
      yokeInner.y + 0.035,
      right,
      forward,
      shoulderHalfWidth + 0.065,
      0.205 * massFactor,
    );
    add('Costume_ShoulderYoke', fittedYoke || fallbackYoke, materials.dress, bones.spine02 || bones.pelvis);
    if (fittedYoke) fallbackYoke.dispose();

    /* --- skirt --- */
    const waistY = P.y + 0.105 + (v.waistHeight || 0) * 0.4;
    const hemY = footY + 0.045 + (1.0 - v.skirtLength) * 0.55;
    const lap = knee.clone().addScaledVector(forward, 0.055);
    const drape = (v.skirtDrape ?? 0.6) * (seated ? 1 : 0);
    const skirtGeo = !masculine && ringGeometry(14, 44, (t) => {
      const center = new THREE.Vector3();
      let rx; let rz; let back = 0;
      if (seated) {
        // waist -> lap shelf -> fall to hem between the knees
        const shelf = THREE.MathUtils.smoothstep(t, 0.06, 0.42);
        const fall = THREE.MathUtils.smoothstep(t, 0.42, 1);
        const y = THREE.MathUtils.lerp(waistY, P.y + 0.035, shelf) * (1 - fall) + hemY * fall;
        center.copy(P).setY(y);
        center.addScaledVector(forward, (lap.clone().sub(P).dot(forward)) * shelf * drape * (1 - fall * 0.15));
        rx = massFactor * THREE.MathUtils.lerp(0.155 * v.bodiceFit, 0.365 * v.skirtFullness * dressStyle.skirt, THREE.MathUtils.smoothstep(t, 0, 0.7));
        rz = massFactor * THREE.MathUtils.lerp(0.125 * v.bodiceFit, 0.31 * v.skirtFullness * dressStyle.skirt, THREE.MathUtils.smoothstep(t, 0, 0.75));
        back = v.bustleAmount * dressStyle.bustle * 0.35 * (1 - t) + 0.06 * fall;
      } else {
        const eased = t * t * (3 - 2 * t);
        center.copy(P).setY(THREE.MathUtils.lerp(waistY, hemY, t));
        rx = massFactor * THREE.MathUtils.lerp(0.155 * v.bodiceFit, 0.4 * v.skirtFullness * dressStyle.skirt, eased);
        rz = massFactor * THREE.MathUtils.lerp(0.125 * v.bodiceFit, 0.34 * v.skirtFullness * dressStyle.skirt, eased);
        back = v.bustleAmount * dressStyle.bustle * 0.4 * (1 - t);
      }
      return { center, rx, rz, forward, back };
    });
    if (skirtGeo) add('Costume_Skirt', skirtGeo, materials.dress, bones.pelvis);

    /* --- men's trousers --- */
    if (masculine) {
      const trouserWaist = ringGeometry(5, 32, (t) => ({
        center: P.clone().addScaledVector(up, THREE.MathUtils.lerp(0.115, -0.135, t))
          .addScaledVector(forward, seated ? 0.028 * t : 0),
        rx: massFactor * THREE.MathUtils.lerp(0.185, 0.205, t),
        rz: massFactor * THREE.MathUtils.lerp(0.145, 0.165, t),
        forward,
        back: seated ? 0.025 : 0,
      }), { capTop: false, capBottom: false });
      add('Costume_TrouserWaist', trouserWaist, materials.dress, bones.pelvis);
    }
    if (masculine) for (const side of ['L', 'R']) {
      const thigh = bones[`thigh${side}`]; const calf = bones[`calf${side}`]; const foot = bones[`foot${side}`];
      if (!thigh || !calf) continue;
      const hipAt = world(thigh); const kneeAt = world(calf);
      const thighGeo = tubeAlong(hipAt, kneeAt, (t) => massFactor * THREE.MathUtils.lerp(0.112, 0.086, t), { radialSegments: 18, lengthSegments: 9 });
      add(`Costume_TrouserThigh_${side}`, thighGeo, materials.dress, thigh);
      const kneeCover = new THREE.SphereGeometry(0.108 * massFactor, 20, 14);
      kneeCover.scale(1.02, 0.84, 1.08);
      kneeCover.translate(kneeAt.x, kneeAt.y, kneeAt.z);
      add(`Costume_TrouserKnee_${side}`, kneeCover, materials.dress, calf);
      if (foot) {
        const ankleAt = world(foot);
        const shinGeo = tubeAlong(kneeAt, ankleAt, (t) => massFactor * THREE.MathUtils.lerp(0.088, 0.065, t), { radialSegments: 18, lengthSegments: 9 });
        add(`Costume_TrouserShin_${side}`, shinGeo, materials.dress, calf);
      }
    }

    /* --- sleeves --- */
    for (const side of ['L', 'R']) {
      const upper = bones[`upperarm${side}`]; const lower = bones[`lowerarm${side}`]; const hand = bones[`hand${side}`];
      if (!upper || !lower) continue;
      const S = world(upper); const E = world(lower);
      // Start on the shoulder joint itself. Pulling the sleeve root inward
      // exposed a crescent of bare deltoid between the fitted yoke and puff.
      const sleeveStart = S.clone().lerp(shoulderCenter, 0.025).addScaledVector(up, 0.008);
      const sleeveStrength = THREE.MathUtils.clamp((v.sleeveVolume ?? 0.8) * dressStyle.sleeve, 0.35, 1.45);
      const W = hand ? world(hand) : null;
      const upperEnd = W ? E.clone().lerp(W, 0.10) : E;
      const puff = tubeAlong(sleeveStart, upperEnd, (t) => {
        const bell = Math.exp(-((t - 0.24) ** 2) / 0.055);
        return (0.060 + 0.027 * bell * sleeveStrength) * Math.sqrt(massFactor);
      }, { radialSegments: 18, lengthSegments: 14, capEnds: false });
      add(`Costume_SleevePuff_${side}`, puff, materials.dress, upper);
      if (W) {
        const cuffEnd = E.clone().lerp(W, THREE.MathUtils.clamp(v.sleeveLength, 0.6, 1.05));
        const lowerStart = E.clone().lerp(S, 0.12);
        const forearm = tubeAlong(lowerStart, cuffEnd, (t) => (0.060 - 0.016 * t) * Math.sqrt(massFactor), {
          radialSegments: 18, lengthSegments: 8, capEnds: false,
        });
        add(`Costume_SleeveForearm_${side}`, forearm, materials.dress, lower);
        const cuff = tubeAlong(cuffEnd.clone().lerp(E, 0.11), cuffEnd, () => 0.048 * Math.sqrt(massFactor), { lengthSegments: 2 });
        add(`Costume_Cuff_${side}`, cuff, materials.trim, lower);
      }
    }

    /* --- collar --- */
    const collarBase = N.clone().lerp(H, 0.12);
    const collarTop = N.clone().lerp(H, 0.12 + 0.3 * v.collarHeight * dressStyle.collar);
    const collar = tubeAlong(collarBase, collarTop, () => 0.048 * v.collarSpread, { lengthSegments: 3 });
    add('Costume_Collar', collar, materials.trim, bones.neck || bones.head);

    /* --- bodice placket + buttons --- */
    const chestForward = forward.clone();
    const count = Math.max(3, Math.round((v.buttonCount ?? 6) + dressStyle.buttons));
    for (let index = 0; index < count; index++) {
      const spacing = THREE.MathUtils.clamp(v.buttonSpacing, 0.6, 1.3);
      const t = THREE.MathUtils.lerp(0.12, 0.84, count === 1 ? 0 : Math.min(1, (index / (count - 1)) * spacing));
      const fit = torsoFit?.[Math.round(t * 10)];
      const at = torsoTop.clone().lerp(P, t).addScaledVector(
        chestForward,
        fit ? fit.offset + fit.rz + 0.007 : 0.14,
      );
      const button = new THREE.SphereGeometry(0.0072, 12, 8);
      button.translate(at.x, at.y, at.z);
      add(`Costume_Button_${index}`, button, materials.trim, bones.spine03 || bones.pelvis);
    }

    if (dressStyle.apron) {
      const apronAt = P.clone().setY(P.y - 0.18).addScaledVector(forward, 0.245);
      const apron = new THREE.BoxGeometry(0.35 * massFactor, 0.48, 0.008);
      apron.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), forward));
      apron.translate(apronAt.x, apronAt.y, apronAt.z);
      add('Costume_WorkingApron', apron, materials.trim, bones.pelvis);
    }
    if (dressStyle.band) {
      const bandCenter = P.clone().setY(waistY - 0.11).addScaledVector(forward, 0.018);
      const waistFit = torsoFit?.at(-1);
      const band = ringGeometry(3, 36, (t) => ({
        center: bandCenter.clone().addScaledVector(up, (t - 0.5) * 0.045).addScaledVector(forward, waistFit?.offset || 0),
        rx: Math.max(0.17 * massFactor * v.bodiceFit, waistFit?.rx || 0),
        rz: Math.max(0.14 * massFactor * v.bodiceFit, waistFit?.rz || 0), forward, back: 0,
      }), { capTop: false, capBottom: false });
      add('Costume_ContrastBand', band, materials.trim, bones.pelvis);
    }

    hairSystem.rebuild(v);
  }

  function dispose() {
    disposeCostumePieces();
    hairSystem.dispose();
  }

  return {
    rebuild,
    dispose,
    materials,
    updateHair: (values) => hairSystem.materials.update(values),
    invalidateFit: () => hairSystem.invalidateScalp?.(),
    pieces: () => [...pieces, ...hairSystem.pieces().map((mesh) => ({ mesh, bone: bones.head }))],
  };
}
