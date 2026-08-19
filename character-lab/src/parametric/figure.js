import * as THREE from 'three';
import { buildSkeleton } from './skeleton.js';
import { createHeadShape, layoutFaceBones, buildHead, applyFaceBaseline } from './head.js';
import { buildNeck, buildHand } from './body.js';
import { buildOutfit } from './garments.js';
import { buildHat } from './hats.js';
import { buildGrooming } from './grooming.js';
import { skinMaterial } from './fabric.js';
import { createAnimator } from './animate.js';

// Assembles one complete figure from a parameter set.
export function buildFigure(params) {
  const p = applyFaceBaseline(params);
  const group = new THREE.Group();
  const rig = buildSkeleton(p);
  const shape = createHeadShape(p);
  layoutFaceBones(p, rig, shape);

  group.add(rig.bones.Root);
  group.updateMatrixWorld(true);
  const skeleton = new THREE.Skeleton(rig.boneList);

  const skin = skinMaterial(p.skinTone);
  group.add(buildNeck(p, rig, skeleton, skin));
  group.add(buildHand(p, rig, skeleton, 1, skin));
  group.add(buildHand(p, rig, skeleton, -1, skin));

  const head = buildHead(p, rig, skeleton, shape);
  group.add(head.group);
  group.add(buildOutfit(p, rig, skeleton));
  group.add(buildGrooming(p, rig, skeleton, shape));
  buildHat(p, rig, shape);

  const animator = createAnimator(p, rig, head.headMesh);

  const dispose = () => {
    group.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) {
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        for (const m of mats) { m.map?.dispose(); m.dispose(); }
      }
    });
  };

  return { group, rig, skeleton, params: p, update: animator.update, dispose };
}
