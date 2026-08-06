import * as THREE from 'three';
import { getHairProfile } from './profiles.js';
import {
  buildFlowRibbons, buildHairlineWisps, buildHairShells, sampleScalp, scalpPoint,
} from './geometry.js';
import { createHairMaterials } from './materials.js';

const worldPosition = (bone, target = new THREE.Vector3()) => bone.getWorldPosition(target);

function tubeFromPoints(points, radius, segments = 64) {
  const curve = new THREE.CatmullRomCurve3(points, false, 'centripetal');
  return new THREE.TubeGeometry(curve, segments, radius, 7, false);
}

export function createHairSystem(scene, bones, model) {
  const materials = createHairMaterials();
  let pieces = [];
  let scalpCache = null;

  function add(name, geometry, material = materials.base) {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = name;
    mesh.castShadow = true;
    mesh.receiveShadow = false;
    mesh.frustumCulled = false;
    scene.add(mesh);
    bones.head.attach(mesh);
    pieces.push(mesh);
    return mesh;
  }

  function disposePieces() {
    for (const mesh of pieces) {
      mesh.parent?.remove(mesh);
      mesh.geometry.dispose();
    }
    pieces = [];
  }

  function frameFor(values) {
    const pelvis = worldPosition(bones.pelvis);
    const head = worldPosition(bones.head);
    const neck = bones.neck ? worldPosition(bones.neck) : head.clone().add(new THREE.Vector3(0, -0.08, 0));
    const kneeL = bones.calfL ? worldPosition(bones.calfL) : null;
    const kneeR = bones.calfR ? worldPosition(bones.calfR) : null;
    const forward = kneeL && kneeR
      ? kneeL.clone().add(kneeR).multiplyScalar(0.5).sub(pelvis).setY(0)
      : new THREE.Vector3(0, 0, 1);
    if (forward.lengthSq() < 1e-6) forward.set(0, 0, 1);
    forward.normalize();
    const headUp = head.clone().sub(neck).normalize();
    const right = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), forward).normalize();
    return {
      centre: head.clone().addScaledVector(headUp, 0.055), head, neck, headUp, forward, right,
      seed: Number(values.seed) || 1,
    };
  }

  function addSpiralCoil(at, outward, frame, radius, loose = 0) {
    const points = [];
    const turns = 2.65;
    for (let index = 0; index <= 48; index++) {
      const t = index / 48;
      const angle = t * Math.PI * 2 * turns;
      const r = radius * (1 - t * 0.70);
      points.push(at.clone()
        .addScaledVector(frame.right, Math.cos(angle) * r)
        .addScaledVector(frame.headUp, Math.sin(angle) * r * (0.88 + loose * 0.2))
        .addScaledVector(outward, 0.004 + t * 0.006));
    }
    add('Hair_Coil', tubeFromPoints(points, 0.0035 + loose * 0.001), materials.highlight, 72);
  }

  function addBackMass(profile, values, frame, scalp) {
    if (['cropped-waves', 'short-parted'].includes(profile.mass)) return;
    const row = profile.mass === 'low-bun' || profile.mass === 'chignon' ? 0.86 : 0.58;
    const surface = scalpPoint(scalp, Math.PI, row * (scalp.ROWS - 1));
    const outward = surface.clone().sub(frame.centre).normalize();
    const radius = 0.044 * (values.bunSize ?? 0.92);
    const at = surface.clone().addScaledVector(outward, radius * 0.44)
      .addScaledVector(frame.headUp, radius * (profile.bunHeight ?? 0));
    const mass = new THREE.SphereGeometry(radius, 24, 18);
    const scale = profile.bunScale || [1, 0.82, 0.7];
    mass.scale(scale[0], scale[1], scale[2]);
    mass.translate(at.x, at.y, at.z);
    add('Hair_BackMass', mass);

    // Two offset lobes break the perfect primitive silhouette; a spiral tube
    // provides readable winding at portrait distance.
    if (profile.mass === 'chignon') {
      for (const sign of [-1, 1]) {
        const lobeAt = at.clone().addScaledVector(frame.right, sign * radius * 0.56)
          .addScaledVector(frame.headUp, -radius * 0.08);
        const lobe = new THREE.SphereGeometry(radius * 0.62, 18, 13);
        lobe.scale(0.78, 1.05, 0.65);
        lobe.translate(lobeAt.x, lobeAt.y, lobeAt.z);
        add(`Hair_ChignonLobe_${sign}`, lobe, materials.strand);
      }
    }
    addSpiralCoil(at, outward, frame, radius * 0.78, profile.mass === 'chignon' ? 0.5 : 0);
  }

  function addCroppedWaves(profile, values, frame, scalp) {
    if (!['cropped-waves', 'short-parted'].includes(profile.mass)) return;
    const waveAmount = values.waveAmount ?? 0.35;
    for (const side of [-1, 1]) {
      for (let lock = 0; lock < (profile.mass === 'cropped-waves' ? 4 : 2); lock++) {
        const azimuth = side * (1.15 + lock * 0.22);
        const points = [];
        for (let segment = 0; segment <= 14; segment++) {
          const t = segment / 14;
          const row = (0.50 + t * 0.28) * (scalp.ROWS - 1);
          const point = scalpPoint(scalp, azimuth, row);
          const outward = point.clone().sub(frame.centre).normalize();
          point.addScaledVector(outward, 0.006 + waveAmount * 0.004)
            .addScaledVector(frame.right, side * Math.sin(t * Math.PI * 2.1 + lock) * waveAmount * 0.004);
          points.push(point);
        }
        add(`Hair_Wave_${side}_${lock}`, tubeFromPoints(points, 0.0032 + waveAmount * 0.0015, 28), lock % 2 ? materials.highlight : materials.strand);
      }
    }
  }

  function addPompadour(profile, values, frame, scalp) {
    if (profile.mass !== 'pompadour') return;
    for (const side of [-1, 1]) {
      const surface = scalpPoint(scalp, side * 0.43, 0.35 * (scalp.ROWS - 1));
      const outward = surface.clone().sub(frame.centre).normalize();
      const radius = 0.038 * (values.hairVolume ?? 1);
      const at = surface.clone().addScaledVector(outward, radius * 0.40).addScaledVector(frame.headUp, 0.016);
      const puff = new THREE.SphereGeometry(radius, 22, 15);
      puff.scale(1.35, 0.72, 0.68);
      puff.translate(at.x, at.y, at.z);
      add(`Hair_Pompadour_${side}`, puff, side > 0 ? materials.strand : materials.base);
    }
  }

  function addBraidedCrown(profile, values, frame, scalp) {
    if (profile.mass !== 'braided-crown') return;
    const points = [];
    for (let step = 0; step <= 32; step++) {
      const azimuth = -Math.PI * 0.72 + (step / 32) * Math.PI * 1.44;
      const surface = scalpPoint(scalp, azimuth, 0.34 * (scalp.ROWS - 1));
      const outward = surface.clone().sub(frame.centre).normalize();
      surface.addScaledVector(outward, 0.014 + Math.sin(step * Math.PI) * 0.0015);
      points.push(surface);
    }
    add('Hair_BraidedCrown', tubeFromPoints(points, 0.0075, 72), materials.strand);
  }

  function rebuild(values) {
    disposePieces();
    materials.update(values);
    if (!bones.head || !bones.pelvis) return;
    const frame = frameFor(values);
    if (!scalpCache) scalpCache = sampleScalp(model, frame);
    if (!scalpCache) return;
    const profile = getHairProfile(values.hairStyle);
    const shells = buildHairShells(scalpCache, frame, profile, values);
    shells.forEach((geometry, index) => add(`Hair_Scalp_${index}`, geometry));
    add('Hair_FlowRibbons', buildFlowRibbons(scalpCache, frame, profile, values), materials.strand);
    if ((values.wispAmount ?? 0.45) > 0.02) {
      add('Hair_HairlineWisps', buildHairlineWisps(scalpCache, frame, profile, values), materials.wisp);
    }
    addBackMass(profile, values, frame, scalpCache);
    addCroppedWaves(profile, values, frame, scalpCache);
    addPompadour(profile, values, frame, scalpCache);
    addBraidedCrown(profile, values, frame, scalpCache);
  }

  return {
    rebuild,
    dispose: disposePieces,
    destroy() {
      disposePieces();
      materials.dispose();
    },
    materials,
    pieces: () => pieces,
  };
}
