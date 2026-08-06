import * as THREE from 'three';
import { createHairSystem } from './hair/index.js';

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
  const hairSystem = createHairSystem(scene, bones, model);
  const materials = {
    dress: new THREE.MeshStandardMaterial({ name: 'CostumeDress', color: '#171525', roughness: 0.82 }),
    trim: new THREE.MeshStandardMaterial({ name: 'CostumeTrim', color: '#4f4333', roughness: 0.72 }),
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
    pieces: () => [...pieces, ...hairSystem.pieces().map((mesh) => ({ mesh, bone: bones.head }))],
  };
}
