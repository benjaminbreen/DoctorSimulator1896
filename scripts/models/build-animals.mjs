// Build the Menagerie and Pond animals from their Sketchfab sources (see
// docs/credits.md). Each keeps only the clips the game plays, with textures
// capped at 1024 px.
//
//   node scripts/models/build-animals.mjs

import path from 'node:path';
import sharp from 'sharp';
import { metalRough, prune, resample, textureCompress } from '@gltf-transform/functions';
import {
  CHARACTER_QUANTIZATION,
  compressAccessors,
  compressCharacterTextures,
  createIO,
  triangleCount,
} from '../lib/glb-pipeline.mjs';

const ROOT = path.resolve(import.meta.dirname, '..', '..');
const ANIMALS = [
  { source: 'bear-a.glb', out: 'bear.glb', clips: null },
  {
    source: 'elk.glb',
    out: 'elk.glb',
    clips: ['Stand_Eating_01', 'Stand_Breathing_01', 'Walk', 'WalkSlow', 'Trot', 'Lying_Breathing_01', 'Trans_Stand_to_Lying', 'Trans_Lying_to_Stand'],
  },
  { source: 'duck.glb', out: 'mallard.glb', clips: null },
];

const io = await createIO();
for (const animal of ANIMALS) {
  const document = await io.read(path.join(ROOT, 'assets-local/menagerie', animal.source));
  const root = document.getRoot();
  if (animal.clips) {
    for (const clip of root.listAnimations()) {
      if (!animal.clips.includes(clip.getName())) clip.dispose();
    }
  }
  // The elk ships spec/gloss materials, which three.js no longer reads.
  await document.transform(
    metalRough(),
    resample(),
    prune({ keepAttributes: true, keepLeaves: true }),
    textureCompress({ encoder: sharp, resize: [1024, 1024] }),
  );
  await compressCharacterTextures(document);
  await compressAccessors(document, CHARACTER_QUANTIZATION);
  const out = path.join(ROOT, 'game/public/models', animal.out);
  await io.write(out, document);
  const clips = root.listAnimations().map((clip) => {
    const end = Math.max(...clip.listSamplers().map((sampler) => sampler.getInput().getMax([])[0]));
    return `${clip.getName()} ${end.toFixed(2)}s`;
  });
  console.log(`${animal.out}: ${triangleCount(root)} triangles; ${clips.join(', ')}`);
}
