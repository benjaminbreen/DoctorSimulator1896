import * as THREE from 'three';

/* Procedural 1890s costume + hair, rebuilt live from preset values.
   Geometry is constructed in world space at the skeleton's rest pose, then
   attached to bones with Object3D.attach so every piece follows animation.
   The caller must snap the skeleton to rest before rebuild(). */

const BONE_CANDIDATES = {
  pelvis: ['pelvis'], spine01: ['spine_01'], spine02: ['spine_02'], spine03: ['spine_03'],
  neck: ['neck_01', 'neck'], head: ['head'],
  clavicleL: ['clavicle_l'], clavicleR: ['clavicle_r'],
  upperarmL: ['upperarm_l'], upperarmR: ['upperarm_r'],
  lowerarmL: ['lowerarm_l'], lowerarmR: ['lowerarm_r'],
  handL: ['hand_l'], handR: ['hand_r'],
  thighL: ['thigh_l'], thighR: ['thigh_r'],
  calfL: ['calf_l'], calfR: ['calf_r'],
  footL: ['foot_l'], footR: ['foot_r'],
};

export function findBones(model) {
  const all = new Map();
  model.traverse((object) => { if (object.isBone) all.set(object.name.toLowerCase(), object); });
  const bones = { fingers: [] };
  for (const [key, names] of Object.entries(BONE_CANDIDATES)) {
    bones[key] = null;
    for (const name of names) if (all.has(name)) { bones[key] = all.get(name); break; }
  }
  for (const [name, bone] of all) {
    if (/(index|middle|ring|pinky)_0[1-3]_[lr]$/.test(name)) bones.fingers.push(bone);
  }
  bones.all = [...all.values()];
  return bones;
}

const world = (bone, out = new THREE.Vector3()) => bone.getWorldPosition(out);

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
  const materials = {
    dress: new THREE.MeshStandardMaterial({ name: 'CostumeDress', color: '#171525', roughness: 0.82 }),
    trim: new THREE.MeshStandardMaterial({ name: 'CostumeTrim', color: '#4f4333', roughness: 0.72 }),
    // DoubleSide: the shell is an open surface — single-sided rendering lets the
    // eye pass through culled backfaces to the scalp ("see-through hair").
    // BackSide shadows + no receiveShadow kill self-shadow acne on the thin shell.
    hair: new THREE.MeshStandardMaterial({ name: 'CostumeHair', color: '#0d0908', roughness: 0.92, side: THREE.DoubleSide, shadowSide: THREE.BackSide }),
  };
  let pieces = []; // { mesh, bone }
  let scalpCache = null; // sampled once per loaded GLB; head identity is baked, so it never changes between rebuilds

  function findBodyMesh() {
    if (!model) return null;
    let body = null; let best = 0;
    model.traverse((object) => {
      if (!object.isSkinnedMesh) return;
      if (object.name === 'Human_Body') { body = object; best = Infinity; return; }
      const count = object.geometry?.attributes?.position?.count || 0;
      if (count > best) { best = count; body = object; }
    });
    return body;
  }

  /* Raycast the actual (morphed, posed-to-rest) head mesh from a hemisphere of
     directions around the skull centre. The hair is then built as an offset
     shell over these samples, so it hugs any generated head instead of
     floating as a primitive. */
  function sampleScalp(frame) {
    const body = findBodyMesh();
    if (!body) return null;
    const AZ = 40; const ROWS = 13;
    const ray = new THREE.Raycaster(); ray.far = 0.6;
    const dir = new THREE.Vector3(); const origin = new THREE.Vector3();
    const samples = [];
    for (let a = 0; a < AZ; a++) {
      const az = (a / AZ) * Math.PI * 2; // 0 faces forward
      const column = [];
      for (let row = 0; row < ROWS; row++) {
        const t = row / (ROWS - 1);
        const polar = 0.05 + t * (Math.PI * 0.62); // pole to well below the ear line (~116°)
        dir.copy(frame.headUp).multiplyScalar(Math.cos(polar))
          .addScaledVector(frame.forward, Math.sin(polar) * Math.cos(az))
          .addScaledVector(frame.right, Math.sin(polar) * Math.sin(az));
        origin.copy(frame.C).addScaledVector(dir, 0.45);
        ray.set(origin, dir.clone().negate());
        const hits = ray.intersectObject(body, false);
        column.push(hits.length ? hits[0].point.clone() : frame.C.clone().addScaledVector(dir, 0.088));
      }
      samples.push(column);
    }
    // per-row outlier clamp: ears and nose tips would otherwise tent the hair
    for (let row = 0; row < ROWS; row++) {
      const radii = samples.map((column) => column[row].distanceTo(frame.C)).sort((x, y) => x - y);
      const median = radii[Math.floor(AZ / 2)];
      for (let a = 0; a < AZ; a++) {
        const point = samples[a][row];
        const distance = point.distanceTo(frame.C);
        if (distance > median * 1.22) point.sub(frame.C).multiplyScalar((median * 1.1) / distance).add(frame.C);
      }
    }
    return { samples, AZ, ROWS };
  }

  const scalpAt = (scalp, a, rowF) => {
    const low = Math.floor(rowF); const high = Math.min(scalp.ROWS - 1, low + 1);
    return scalp.samples[a % scalp.AZ][low].clone().lerp(scalp.samples[a % scalp.AZ][high], rowF - low);
  };

  function add(name, geometry, material, bone) {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = name; mesh.castShadow = true; mesh.frustumCulled = false;
    mesh.receiveShadow = material !== materials.hair;
    scene.add(mesh);
    if (bone) bone.attach(mesh);
    pieces.push({ mesh, bone });
    return mesh;
  }

  function dispose() {
    for (const { mesh } of pieces) { mesh.parent?.remove(mesh); mesh.geometry.dispose(); }
    pieces = [];
  }

  function rebuild(v) {
    dispose();
    materials.dress.color.set(v.dressColor); materials.dress.roughness = v.fabricRoughness;
    materials.trim.color.set(v.trimColor); materials.hair.color.set(v.hairColor);
    if (!bones.pelvis || !bones.head) return;

    const styles = {
      'conservative-day': { sleeve: 0.78, skirt: 0.96, bustle: 0.65, collar: 1.05, buttons: 0, apron: false, band: false },
      'fashionable-1896': { sleeve: 1.62, skirt: 1.10, bustle: 1.15, collar: 0.92, buttons: 1, apron: false, band: true },
      'mourning-dress': { sleeve: 0.92, skirt: 1.04, bustle: 0.45, collar: 1.25, buttons: 2, apron: false, band: true },
      'working-day': { sleeve: 0.62, skirt: 0.82, bustle: 0.18, collar: 0.82, buttons: -1, apron: true, band: false },
      'visiting-dress': { sleeve: 1.28, skirt: 1.18, bustle: 1.05, collar: 1.08, buttons: 1, apron: false, band: true },
    };
    const dressStyle = styles[v.outfitStyle] || styles['conservative-day'];
    const massFactor = 1 + ((v.weight ?? 0.48) - 0.48) * 0.42;

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

    /* --- skirt --- */
    const waistY = P.y + 0.105 + (v.waistHeight || 0) * 0.4;
    const hemY = footY + 0.045 + (1.0 - v.skirtLength) * 0.55;
    const lap = knee.clone().addScaledVector(forward, 0.055);
    const drape = (v.skirtDrape ?? 0.6) * (seated ? 1 : 0);
    const skirtGeo = ringGeometry(14, 44, (t) => {
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
    add('Costume_Skirt', skirtGeo, materials.dress, bones.pelvis);

    /* --- sleeves --- */
    for (const side of ['L', 'R']) {
      const upper = bones[`upperarm${side}`]; const lower = bones[`lowerarm${side}`]; const hand = bones[`hand${side}`];
      if (!upper || !lower) continue;
      const S = world(upper); const E = world(lower);
      const puff = tubeAlong(S.clone().addScaledVector(up, 0.028), E, (t) => {
        const bell = Math.exp(-((t - 0.24) ** 2) / 0.055);
        return (0.049 + 0.062 * bell * v.sleeveVolume * dressStyle.sleeve) * Math.sqrt(massFactor);
      }, { lengthSegments: 14 });
      add(`Costume_SleevePuff_${side}`, puff, materials.dress, upper);
      if (hand) {
        const W = world(hand);
        const cuffEnd = E.clone().lerp(W, THREE.MathUtils.clamp(v.sleeveLength, 0.6, 1.05));
        const forearm = tubeAlong(E, cuffEnd, (t) => 0.047 - 0.012 * t, { lengthSegments: 8 });
        add(`Costume_SleeveForearm_${side}`, forearm, materials.dress, lower);
        const cuff = tubeAlong(cuffEnd.clone().lerp(E, 0.08), cuffEnd, () => 0.0375, { lengthSegments: 2 });
        add(`Costume_Cuff_${side}`, cuff, materials.trim, lower);
      }
    }

    /* --- collar --- */
    const collarBase = N.clone().lerp(H, 0.12);
    const collarTop = N.clone().lerp(H, 0.12 + 0.3 * v.collarHeight * dressStyle.collar);
    const collar = tubeAlong(collarBase, collarTop, () => 0.0555 * v.collarSpread, { lengthSegments: 3 });
    add('Costume_Collar', collar, materials.trim, bones.neck || bones.head);

    /* --- bodice placket + buttons --- */
    const chestForward = forward.clone();
    const placketTop = N.clone().addScaledVector(chestForward, 0.092).addScaledVector(up, -0.025);
    const placketBottom = P.clone().setY(waistY + 0.015).addScaledVector(chestForward, 0.14);
    const count = Math.max(3, Math.round((v.buttonCount ?? 6) + dressStyle.buttons));
    for (let index = 0; index < count; index++) {
      const t = count === 1 ? 0 : (index / (count - 1)) * THREE.MathUtils.clamp(v.buttonSpacing, 0.6, 1.3);
      const at = placketTop.clone().lerp(placketBottom, Math.min(1, t));
      const bulgeOut = 0.028 * Math.sin(Math.min(1, t) * Math.PI);
      at.addScaledVector(chestForward, bulgeOut);
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
      const band = ringGeometry(3, 36, (t) => ({
        center: bandCenter.clone().addScaledVector(up, (t - 0.5) * 0.045),
        rx: 0.17 * massFactor * v.bodiceFit, rz: 0.14 * massFactor * v.bodiceFit, forward, back: 0,
      }), { capTop: false, capBottom: false });
      add('Costume_ContrastBand', band, materials.trim, bones.pelvis);
    }

    /* --- hair: scalp-fitted shell --- */
    const headUp = H.clone().sub(N).normalize();
    const hairStyle = v.hairStyle || 'center-parted-bun';
    const profiles = {
      'center-parted-bun': { crown: 1.0, sides: .85, front: 0.30, nape: 0.80, part: 'center' },
      'side-parted-bun': { crown: 1.0, sides: .75, front: 0.30, nape: 0.80, part: 'side' },
      'low-bun': { crown: 0.9, sides: .65, front: 0.31, nape: 0.85, part: 'center' },
      'coiled-bun': { crown: 0.95, sides: .55, front: 0.30, nape: 0.82, part: 'center' },
      'loose-chignon': { crown: 0.9, sides: 1.05, front: 0.32, nape: 0.85, part: 'center' },
      'swept-back': { crown: 1.25, sides: .40, front: 0.24, nape: 0.80, part: null },
      'pompadour': { crown: 1.4, sides: .55, front: 0.26, nape: 0.80, part: null },
      'braided-crown': { crown: 1.15, sides: .45, front: 0.29, nape: 0.78, part: null },
      'cropped-waves': { crown: 0.85, sides: .35, front: 0.30, nape: 0.62, part: 'center' },
      'short-parted': { crown: 0.8, sides: .15, front: 0.31, nape: 0.60, part: 'center' },
    };
    const profile = profiles[hairStyle] || profiles['center-parted-bun'];
    const frame = { C: H.clone().addScaledVector(headUp, 0.055), right, forward, headUp };
    if (!scalpCache) scalpCache = sampleScalp(frame);

    if (scalpCache) {
      const scalp = scalpCache;
      const BR = 14; // build rows per column
      const volumeScale = 0.65 + 0.5 * (v.hairVolume ?? 1);
      const partHalf = (0.06 + v.partWidth * 0.16) * Math.PI; // azimuth half-width of the part groove
      const partAz = profile.part === 'side' ? 0.42 : 0;
      const positions = []; const indices = [];
      const out = new THREE.Vector3();
      const thicknessAt = (az, t) => {
        const front = Math.max(0, Math.cos(az)) ** 1.3;
        const backW = Math.max(0, -Math.cos(az)) ** 1.1;
        const sideW = Math.max(0, 1 - front - backW);
        let thickness = 0.008
          + (0.010 + 0.016 * ((v.hairHeight ?? 1) - 0.8)) * profile.crown * (1 - t) ** 1.4
          + 0.030 * profile.sides * (v.sideVolume ?? 1) * sideW * Math.exp(-(((t - 0.58) / 0.3) ** 2))
          + 0.017 * backW * (0.25 + 0.75 * t);
        thickness *= volumeScale;
        if (profile.part && t < 0.4 && Math.cos(az) > 0.1) {
          const azOff = Math.atan2(Math.sin(az - partAz), Math.cos(az - partAz));
          if (Math.abs(azOff) < partHalf) thickness *= 0.35 + 0.45 * (Math.abs(azOff) / partHalf);
        }
        // taper to the skin at the hairline so the edge never floats
        thickness *= THREE.MathUtils.clamp((1 - t) * 5, 0.3, 1);
        return thickness;
      };
      const tMaxAt = (az) => {
        const front = Math.max(0, Math.cos(az)) ** 1.3;
        const backW = Math.max(0, -Math.cos(az)) ** 1.1;
        const sideW = Math.max(0, 1 - front - backW);
        // profile.front is an offset over a 0.34 base so the hairline lands
        // ~2 finger-widths above the brow; the head bone's seated lean tilts
        // the polar frame, so coverage errs generous rather than receded
        return (0.40 + profile.front) * front + (0.85 + 0.12 * profile.sides) * sideW + profile.nape * 1.25 * backW;
      };
      for (let a = 0; a < scalp.AZ; a++) {
        const az = (a / scalp.AZ) * Math.PI * 2;
        const tMax = tMaxAt(az);
        for (let row = 0; row <= BR; row++) {
          const t = row / BR;
          const point = scalpAt(scalp, a, t * tMax * (scalp.ROWS - 1));
          out.copy(point).sub(frame.C).normalize();
          point.addScaledVector(out, thicknessAt(az, t));
          positions.push(point.x, point.y, point.z);
        }
      }
      const columnSize = BR + 1;
      for (let a = 0; a < scalp.AZ; a++) for (let row = 0; row < BR; row++) {
        const b2 = ((a + 1) % scalp.AZ) * columnSize;
        const a2 = a * columnSize;
        indices.push(a2 + row, b2 + row, b2 + row + 1, a2 + row, b2 + row + 1, a2 + row + 1);
      }
      // apex cap
      const apexBase = positions.length / 3;
      const apex = scalpAt(scalp, 0, 0).addScaledVector(headUp, thicknessAt(0, 0) * 1.05);
      positions.push(apex.x, apex.y, apex.z);
      for (let a = 0; a < scalp.AZ; a++) indices.push(apexBase, ((a + 1) % scalp.AZ) * columnSize, a * columnSize);
      const shell = new THREE.BufferGeometry();
      shell.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      shell.setIndex(indices);
      shell.computeVertexNormals();
      add('Costume_HairShell', shell, materials.hair, bones.head);
    }

    // sampled anchor points for accessories — grounded on the real skull
    const anchor = (azFrac, tFrac) => scalpCache
      ? scalpAt(scalpCache, Math.round(azFrac * scalpCache.AZ) % scalpCache.AZ, tFrac * (scalpCache.ROWS - 1))
      : H.clone().addScaledVector(headUp, 0.07);
    const napePoint = anchor(0.5, 0.85);
    const backPoint = anchor(0.5, 0.5);
    const topPoint = anchor(0, 0.04);
    const skull = topPoint.clone().addScaledVector(headUp, -0.02); // legacy-compatible reference
    const earR = anchor(0.25, 0.6); const earL = anchor(0.75, 0.6);
    const headWidthFactor = Math.max(0.8, earR.distanceTo(earL) / 0.13);

    const cropped = ['cropped-waves', 'short-parted'].includes(hairStyle);
    if (!cropped) {
      const backOut = napePoint.clone().sub(frame.C); backOut.y = 0;
      if (backOut.lengthSq() < 1e-6) backOut.copy(forward).negate();
      backOut.normalize();
      const bunR = 0.049 * v.bunSize;
      const bun = new THREE.SphereGeometry(bunR, 20, 16);
      let at;
      if (hairStyle === 'low-bun') at = napePoint.clone().addScaledVector(backOut, bunR * 0.55);
      else if (hairStyle === 'loose-chignon') { at = napePoint.clone().addScaledVector(backOut, bunR * 0.5).addScaledVector(headUp, 0.012); bun.scale(1.35, 0.72, 1.15); }
      else if (hairStyle === 'coiled-bun') { at = backPoint.clone().addScaledVector(backOut, bunR * 0.4); bun.scale(1.12, 1.12, 0.72); }
      else if (hairStyle === 'side-parted-bun') at = backPoint.clone().addScaledVector(backOut, bunR * 0.45).addScaledVector(right, 0.025);
      else if (hairStyle === 'swept-back') { at = anchor(0.5, 0.22).addScaledVector(backOut, bunR * 0.35).addScaledVector(headUp, 0.01); bun.scale(1.25, 0.7, 1.1); }
      else if (hairStyle === 'braided-crown') { at = backPoint.clone().addScaledVector(backOut, bunR * 0.3); bun.scale(0.72, 0.72, 0.72); }
      else at = backPoint.clone().addScaledVector(backOut, bunR * 0.45).addScaledVector(headUp, 0.008);
      bun.translate(at.x, at.y, at.z);
      add('Costume_HairBun', bun, materials.hair, bones.head);
    }
    if (hairStyle === 'pompadour') {
      const front = anchor(0, 0.14);
      const puff = new THREE.SphereGeometry(0.05 * v.hairVolume, 20, 14);
      puff.scale(1.2 * headWidthFactor, 0.7, 0.85);
      const at = front.clone().addScaledVector(headUp, 0.022).addScaledVector(forward, 0.008);
      puff.translate(at.x, at.y, at.z);
      add('Costume_HairPompadour', puff, materials.hair, bones.head);
    }
    if (hairStyle === 'braided-crown') {
      const braidRadius = earR.distanceTo(earL) * 0.5 + 0.012;
      const braid = new THREE.TorusGeometry(braidRadius, 0.011, 10, 40);
      braid.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), headUp));
      const at = topPoint.clone().addScaledVector(headUp, -0.014);
      braid.translate(at.x, at.y, at.z);
      add('Costume_HairBraidedCrown', braid, materials.hair, bones.head);
    }
    if (hairStyle === 'coiled-bun') {
      const backOut2 = backPoint.clone().sub(frame.C).setY(0).normalize();
      const coil = new THREE.TorusGeometry(0.034 * v.bunSize, 0.008, 9, 32);
      coil.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), backOut2));
      const at = backPoint.clone().addScaledVector(backOut2, 0.055 * v.bunSize);
      coil.translate(at.x, at.y, at.z);
      add('Costume_HairBunCoil', coil, materials.hair, bones.head);
    }
    if (hairStyle === 'cropped-waves') {
      for (const [sideSign, ear] of [[-1, earL], [1, earR]]) for (let wave = 0; wave < 3; wave++) {
        const curl = new THREE.SphereGeometry(0.018 * (v.sideVolume ?? 1), 12, 9);
        const at = ear.clone().addScaledVector(right, sideSign * 0.008)
          .addScaledVector(headUp, 0.014 + wave * 0.02).addScaledVector(forward, -0.02 + wave * 0.007);
        curl.translate(at.x, at.y, at.z);
        add(`Costume_HairWave_${sideSign}_${wave}`, curl, materials.hair, bones.head);
      }
    }
  }

  return { rebuild, dispose, materials, pieces: () => pieces };
}
