// 1896 silhouette pass for the women's cohort master: inflate the garment
// vertices weighted to the upper arms into leg-of-mutton sleeve volume, and
// pinch the covered waist slightly. Pure vertex displacement driven by the
// existing skin weights — no Blender, no new assets, reversible from the
// .bak written beside the master.
//
//   node scripts/characters/inflate-1896-sleeves.mjs           # apply
//   node scripts/characters/inflate-1896-sleeves.mjs --restore # undo
//
// The displacement runs along vertex normals, so the sleeve keeps its
// stitching lines; the skinning weights are untouched and the clips play
// unchanged. Amounts are metres.

import { copyFile, access } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createIO } from '../lib/glb-pipeline.mjs';

const MASTER = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../game/public/models/characters/renderer-c-women.glb',
);
const BACKUP = `${MASTER}.pre-sleeves.bak`;

// Peak sleeve inflation at the upper arm, in metres. 1896 is the peak of the
// gigot sleeve: generous above the elbow, tight below.
const SLEEVE_PUFF = 0.032;
// How strongly forearm weight cancels the puff (keeps the wrist tight).
const FOREARM_TAPER = 1.35;
// Slight waist pinch where spine weights dominate, in metres.
const WAIST_PINCH = -0.006;
// Fill the lower sleeve out to meet the cuff ring, in metres: cloth gathered
// into a cuff is fuller than the arm, never tighter.
const FOREARM_FILL = 0.012;

const GARMENT_NAME = /^RendererC_(?:BaseGarment|VictorianDress|VictorianDressFitSource|GoldenDress)/;

function smooth(t) {
  const clamped = Math.max(0, Math.min(1, t));
  return clamped * clamped * (3 - 2 * clamped);
}

if (process.argv.includes('--restore')) {
  await copyFile(BACKUP, MASTER);
  console.log('restored master from backup');
  process.exit(0);
}

try {
  await access(BACKUP);
  console.log('backup already exists; refusing to re-apply on top of an inflated master.');
  console.log('run with --restore first if you want a fresh pass.');
  process.exit(1);
} catch {
  await copyFile(MASTER, BACKUP);
}

const io = await createIO();
const document = await io.read(MASTER);
const root = document.getRoot();

let touchedMeshes = 0;
let movedVertices = 0;

for (const skin of root.listSkins()) {
  const joints = skin.listJoints().map((joint) => joint.getName().toLowerCase().replace(/^mixamorig:?/, ''));
  const upperArm = new Set();
  const foreArm = new Set();
  const spine = new Set();
  const hands = new Set();
  joints.forEach((name, index) => {
    if (name === 'leftarm' || name === 'rightarm') upperArm.add(index);
    if (name === 'leftforearm' || name === 'rightforearm') foreArm.add(index);
    if (name === 'spine' || name === 'spine1') spine.add(index);
    if (name === 'lefthand' || name === 'righthand') hands.add(index);
  });
  if (!upperArm.size) continue;

  for (const node of root.listNodes()) {
    if (node.getSkin() !== skin) continue;
    const mesh = node.getMesh();
    if (!mesh || !GARMENT_NAME.test(node.getName()) && !GARMENT_NAME.test(mesh.getName())) continue;
    for (const primitive of mesh.listPrimitives()) {
      const position = primitive.getAttribute('POSITION');
      const normal = primitive.getAttribute('NORMAL');
      const jointsAttr = primitive.getAttribute('JOINTS_0');
      const weightsAttr = primitive.getAttribute('WEIGHTS_0');
      if (!position || !normal || !jointsAttr || !weightsAttr) continue;
      const positions = position.getArray().slice();
      const normals = normal.getArray();
      const jointIds = jointsAttr.getArray();
      const weights = weightsAttr.getArray();
      let moved = 0;
      for (let vertex = 0; vertex < position.getCount(); vertex += 1) {
        let armWeight = 0;
        let foreWeight = 0;
        let spineWeight = 0;
        let handWeight = 0;
        for (let slot = 0; slot < 4; slot += 1) {
          const joint = jointIds[vertex * 4 + slot];
          const weight = weights[vertex * 4 + slot];
          if (upperArm.has(joint)) armWeight += weight;
          if (foreArm.has(joint)) foreWeight += weight;
          if (spine.has(joint)) spineWeight += weight;
          if (hands.has(joint)) handWeight += weight;
        }
        const puff = smooth(armWeight - foreWeight * FOREARM_TAPER) * SLEEVE_PUFF;
        const pinch = smooth(spineWeight) * WAIST_PINCH;
        // The forearm fabric fills toward the cuff so sleeve and cuff meet.
        const fill = smooth(foreWeight - armWeight * 0.4 + handWeight) * FOREARM_FILL;
        const amount = puff + pinch + fill;
        if (Math.abs(amount) < 1e-5) continue;
        positions[vertex * 3] += normals[vertex * 3] * amount;
        positions[vertex * 3 + 1] += normals[vertex * 3 + 1] * amount;
        positions[vertex * 3 + 2] += normals[vertex * 3 + 2] * amount;
        moved += 1;
      }
      if (moved > 0) {
        position.setArray(positions);
        movedVertices += moved;
      }
    }
    touchedMeshes += 1;
  }
}

if (movedVertices === 0) {
  console.log('no garment vertices matched; master left untouched (backup removed is safe to delete).');
  process.exit(1);
}

await io.write(MASTER, document);
console.log(`inflated ${movedVertices} vertices across ${touchedMeshes} garment meshes`);
console.log(`backup at ${path.basename(BACKUP)}; undo with --restore`);
