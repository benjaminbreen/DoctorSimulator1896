// Bakes the park's period trees and shrubs from EZ-Tree (MIT, Daniel
// Greenheck) into game/public/models/trees/, with a manifest in the same shape
// as the converted packs. Species follow Peet, Trees and Shrubs of Central
// Park (1903). Run from the repository root: node scripts/models/build-park-trees.mjs
//
// EZ-Tree loads its textures through TextureLoader at import time, which needs
// a DOM. In Node the loader is swapped for one that only records the data URL.

import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import * as THREE from 'three';
import { Document } from '@gltf-transform/core';
import { EXTMeshoptCompression } from '@gltf-transform/extensions';
import { quantize, reorder } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer';
import sharp from 'sharp';
import { createIO } from '../lib/glb-pipeline.mjs';

THREE.TextureLoader.prototype.load = function load(url) {
  const texture = new THREE.Texture();
  texture.userData.url = url;
  return texture;
};
const { Tree } = await import('@dgreenheck/ez-tree');
await Promise.all([MeshoptEncoder.ready, MeshoptSimplifier.ready]);

const OUT = 'game/public/models/trees';
const CREDIT = {
  title: 'EZ-Tree procedural tree',
  author: 'Daniel Greenheck (https://github.com/dgreenheck/ez-tree)',
  license: 'MIT; bark textures CC0 (Poly Haven, TextureCan)',
  source: 'https://github.com/dgreenheck/ez-tree',
};

// Leaf sprites are photographed sprigs. Aspen ships in autumn yellow, so it is
// turned green for June; the rest are shifted toward each species.
// modulate: hue in degrees, saturation and brightness as multipliers.
const LEAVES = {
  elm: { source: 'aspen', modulate: { hue: 52, saturation: 0.62, brightness: 0.72 } },
  cottonwood: { source: 'aspen', modulate: { hue: 48, saturation: 0.7, brightness: 0.8 } },
  poplar: { source: 'aspen', modulate: { hue: 46, saturation: 0.75, brightness: 0.78 } },
  willow: { source: 'ash', modulate: { hue: -14, saturation: 0.8, brightness: 1.28 } },
  cypress: { source: 'pine', modulate: { hue: -10, saturation: 1.0, brightness: 1.3 } },
  pine: { source: 'pine', modulate: { hue: 6, saturation: 0.8, brightness: 0.82 } },
  beech: { source: 'oak', modulate: { hue: -128, saturation: 0.75, brightness: 0.62 } },
  broadleaf: { source: 'oak', modulate: { hue: 4, saturation: 0.86, brightness: 0.92 } },
  compound: { source: 'ash', modulate: { hue: 6, saturation: 0.86, brightness: 1.06 } },
  ailanthus: { source: 'ash', modulate: { hue: -4, saturation: 0.9, brightness: 1.12 } },
  // Shrubs fan several sprigs into one card (`cluster`): a single sprig is
  // too sparse, and a shrub needs to read as a solid mound of leaf.
  privet: { source: 'ash', cluster: 7, modulate: { hue: 8, saturation: 0.9, brightness: 0.85 } },
  spirea: { source: 'ash', cluster: 6, modulate: { hue: 6, saturation: 0.72, brightness: 1.05 }, blossom: '#f4f1e6' },
  sumac: { source: 'ash', cluster: 3, modulate: { hue: 2, saturation: 0.9, brightness: 1.05 } },
  knotweed: { source: 'aspen', cluster: 5, modulate: { hue: 58, saturation: 0.85, brightness: 0.78 } },
};

const DECIDUOUS_FORCE = { direction: { x: 0, y: 1, z: 0 } };

// Each entry is an EZ-Tree option set plus the height it is baked to.
// `variants` are seeds; the common species get two silhouettes.
const SPECIES = [
  {
    // American elm: a short trunk dividing into several ascending limbs that
    // arch out at the top, the vase shape.
    id: 'elm', height: 16, variants: [7, 31],
    options: {
      type: 'deciduous',
      bark: { type: 'oak', tint: 0xcfc8bc, textureScale: { x: 0.6, y: 5 } },
      branch: {
        levels: 3,
        angle: { 1: 26, 2: 44, 3: 50 },
        children: { 0: 6, 1: 4, 2: 4 },
        force: { ...DECIDUOUS_FORCE, strength: -0.018 },
        gnarliness: { 0: 0.04, 1: 0.12, 2: 0.16, 3: 0.08 },
        length: { 0: 30, 1: 30, 2: 13, 3: 5 },
        radius: { 0: 2.2, 1: 0.62, 2: 0.6, 3: 0.7 },
        sections: { 0: 7, 1: 6, 2: 4, 3: 2 },
        segments: { 0: 7, 1: 5, 2: 3, 3: 3 },
        start: { 1: 0.3, 2: 0.35, 3: 0.1 },
        taper: { 0: 0.75, 1: 0.6, 2: 0.7, 3: 0.7 },
        twist: { 0: 0.05, 1: 0.1, 2: 0, 3: 0 },
      },
      leaves: { type: 'aspen', billboard: 'double', angle: 40, count: 4, start: 0.1, size: 6.2, sizeVariance: 0.5, alphaTest: 0.5 },
    },
  },
  {
    // Weeping willow: a stout trunk, broad limbs, and long whips hanging to
    // the ground. A downward force bends thin stems far more than thick ones
    // (EZ-Tree divides it by radius), so the limbs arch and the whips hang.
    id: 'willow', height: 12, variants: [12],
    options: {
      type: 'deciduous',
      bark: { type: 'willow', tint: 0xd8d0c4, textureScale: { x: 0.6, y: 4 } },
      branch: {
        levels: 3,
        angle: { 1: 50, 2: 40, 3: 30 },
        children: { 0: 6, 1: 5, 2: 4 },
        force: { direction: { x: 0, y: -1, z: 0 }, strength: 0.035 },
        gnarliness: { 0: 0.1, 1: 0.1, 2: 0.04, 3: 0.03 },
        length: { 0: 26, 1: 20, 2: 18, 3: 12 },
        radius: { 0: 2.4, 1: 0.6, 2: 0.4, 3: 0.55 },
        sections: { 0: 6, 1: 5, 2: 6, 3: 5 },
        segments: { 0: 7, 1: 4, 2: 3, 3: 3 },
        start: { 1: 0.4, 2: 0.2, 3: 0.1 },
        taper: { 0: 0.7, 1: 0.7, 2: 0.8, 3: 0.8 },
        twist: { 0: 0, 1: 0, 2: 0, 3: 0 },
      },
      leaves: { type: 'ash', billboard: 'double', angle: 12, count: 4, start: 0.05, size: 4.8, sizeVariance: 0.4, alphaTest: 0.45 },
    },
  },
  {
    // Bald cypress: a narrow, regular cone of soft feathery foliage.
    id: 'cypress', height: 13, variants: [5],
    options: {
      type: 'evergreen',
      bark: { type: 'willow', tint: 0xc9a68c, textureScale: { x: 0.6, y: 4 } },
      branch: {
        levels: 1,
        angle: { 1: 105, 2: 30, 3: 30 },
        children: { 0: 46, 1: 0, 2: 0 },
        force: { ...DECIDUOUS_FORCE, strength: 0.004 },
        gnarliness: { 0: 0.02, 1: 0.08, 2: 0, 3: 0 },
        length: { 0: 60, 1: 13, 2: 1, 3: 1 },
        radius: { 0: 1.3, 1: 0.3, 2: 0.5, 3: 0.5 },
        sections: { 0: 10, 1: 4, 2: 1, 3: 1 },
        segments: { 0: 7, 1: 3, 2: 3, 3: 3 },
        start: { 1: 0.16, 2: 0, 3: 0 },
        taper: { 0: 0.7, 1: 0.7, 2: 0.7, 3: 0.7 },
        twist: { 0: 0, 1: 0, 2: 0, 3: 0 },
      },
      leaves: { type: 'pine', billboard: 'double', angle: 20, count: 9, start: 0.05, size: 4.4, sizeVariance: 0.3, alphaTest: 0.35 },
    },
  },
  {
    // Cottonwood: tall, coarse, open crown on a heavy trunk.
    id: 'cottonwood', height: 18, variants: [21],
    options: {
      type: 'deciduous',
      bark: { type: 'oak', tint: 0xd6d0c4, textureScale: { x: 0.6, y: 5 } },
      branch: {
        levels: 3,
        angle: { 1: 38, 2: 48, 3: 50 },
        children: { 0: 7, 1: 4, 2: 3 },
        force: { ...DECIDUOUS_FORCE, strength: 0.004 },
        gnarliness: { 0: 0.06, 1: 0.2, 2: 0.2, 3: 0.1 },
        length: { 0: 50, 1: 24, 2: 11, 3: 5 },
        radius: { 0: 2.6, 1: 0.55, 2: 0.6, 3: 0.7 },
        sections: { 0: 8, 1: 6, 2: 4, 3: 2 },
        segments: { 0: 7, 1: 5, 2: 3, 3: 3 },
        start: { 1: 0.38, 2: 0.3, 3: 0.1 },
        taper: { 0: 0.7, 1: 0.6, 2: 0.7, 3: 0.7 },
        twist: { 0: 0.1, 1: 0.05, 2: 0, 3: 0 },
      },
      leaves: { type: 'aspen', billboard: 'double', angle: 36, count: 4, start: 0.1, size: 6.4, sizeVariance: 0.5, alphaTest: 0.5 },
    },
  },
  {
    // Lombardy poplar: a column. Steep limbs held tight to the stem.
    id: 'poplar', height: 17, variants: [9],
    options: {
      type: 'deciduous',
      bark: { type: 'birch', tint: 0x9f988c, textureScale: { x: 0.6, y: 4 } },
      branch: {
        levels: 2,
        angle: { 1: 14, 2: 22, 3: 20 },
        children: { 0: 22, 1: 4, 2: 0 },
        force: { ...DECIDUOUS_FORCE, strength: 0.03 },
        gnarliness: { 0: 0.02, 1: 0.05, 2: 0.08, 3: 0 },
        length: { 0: 70, 1: 22, 2: 7, 3: 1 },
        radius: { 0: 1.4, 1: 0.4, 2: 0.6, 3: 0.6 },
        sections: { 0: 10, 1: 4, 2: 2, 3: 1 },
        segments: { 0: 7, 1: 3, 2: 3, 3: 3 },
        start: { 1: 0.12, 2: 0.2, 3: 0 },
        taper: { 0: 0.8, 1: 0.7, 2: 0.7, 3: 0.7 },
        twist: { 0: 0, 1: 0, 2: 0, 3: 0 },
      },
      leaves: { type: 'aspen', billboard: 'double', angle: 18, count: 5, start: 0.1, size: 4.8, sizeVariance: 0.4, alphaTest: 0.5 },
    },
  },
  {
    // Purple European beech: low-branched dense dome, smooth grey bark.
    id: 'beech', height: 12, variants: [3],
    options: {
      type: 'deciduous',
      bark: { type: 'birch', tint: 0x8d8a86, textureScale: { x: 0.6, y: 4 } },
      branch: {
        levels: 3,
        angle: { 1: 52, 2: 46, 3: 40 },
        children: { 0: 8, 1: 4, 2: 3 },
        force: { ...DECIDUOUS_FORCE, strength: -0.01 },
        gnarliness: { 0: 0.02, 1: 0.1, 2: 0.12, 3: 0.08 },
        length: { 0: 26, 1: 20, 2: 10, 3: 4 },
        radius: { 0: 2.0, 1: 0.6, 2: 0.6, 3: 0.7 },
        sections: { 0: 6, 1: 5, 2: 4, 3: 2 },
        segments: { 0: 7, 1: 4, 2: 3, 3: 3 },
        start: { 1: 0.22, 2: 0.25, 3: 0.1 },
        taper: { 0: 0.7, 1: 0.6, 2: 0.7, 3: 0.7 },
        twist: { 0: 0, 1: 0.05, 2: 0, 3: 0 },
      },
      leaves: { type: 'oak', billboard: 'double', angle: 40, count: 5, start: 0.1, size: 5.4, sizeVariance: 0.4, alphaTest: 0.5 },
    },
  },
  {
    // White, Austrian and Scotch pine: open and a little ragged. The second
    // seed is thinner, for the ones Peet found "doing very poorly".
    id: 'pine', height: 12, variants: [14, 40],
    options: {
      type: 'evergreen',
      bark: { type: 'pine', tint: 0xd0c4b8, textureScale: { x: 0.6, y: 4 } },
      branch: {
        levels: 2,
        angle: { 1: 100, 2: 40, 3: 30 },
        children: { 0: 26, 1: 3, 2: 0 },
        force: { ...DECIDUOUS_FORCE, strength: 0.006 },
        gnarliness: { 0: 0.05, 1: 0.14, 2: 0.1, 3: 0 },
        length: { 0: 60, 1: 22, 2: 9, 3: 1 },
        radius: { 0: 1.5, 1: 0.35, 2: 0.5, 3: 0.5 },
        sections: { 0: 10, 1: 4, 2: 2, 3: 1 },
        segments: { 0: 7, 1: 3, 2: 3, 3: 3 },
        start: { 1: 0.3, 2: 0.2, 3: 0 },
        taper: { 0: 0.7, 1: 0.7, 2: 0.7, 3: 0.7 },
        twist: { 0: 0, 1: 0, 2: 0, 3: 0 },
      },
      leaves: { type: 'pine', billboard: 'double', angle: 24, count: 7, start: 0.2, size: 5.0, sizeVariance: 0.25, alphaTest: 0.35 },
    },
  },
  {
    // Maple, hornbeam, catalpa, horsechestnut: a rounded broadleaf crown, the
    // bulk of the park's canopy.
    id: 'broadleaf', height: 12, variants: [18, 44],
    options: {
      type: 'deciduous',
      bark: { type: 'oak', tint: 0xe2dccf, textureScale: { x: 0.6, y: 5 } },
      branch: {
        levels: 3,
        angle: { 1: 46, 2: 48, 3: 40 },
        children: { 0: 7, 1: 4, 2: 3 },
        force: { ...DECIDUOUS_FORCE, strength: -0.006 },
        gnarliness: { 0: 0.03, 1: 0.12, 2: 0.14, 3: 0.08 },
        length: { 0: 30, 1: 18, 2: 10, 3: 4.5 },
        radius: { 0: 1.8, 1: 0.6, 2: 0.6, 3: 0.7 },
        sections: { 0: 6, 1: 5, 2: 4, 3: 2 },
        segments: { 0: 7, 1: 4, 2: 3, 3: 3 },
        start: { 1: 0.32, 2: 0.25, 3: 0.1 },
        taper: { 0: 0.7, 1: 0.6, 2: 0.7, 3: 0.7 },
        twist: { 0: 0.05, 1: 0.05, 2: 0, 3: 0 },
      },
      leaves: { type: 'oak', billboard: 'double', angle: 40, count: 5, start: 0.1, size: 5.4, sizeVariance: 0.45, alphaTest: 0.5 },
    },
  },
  {
    // Honey locust, pagoda tree, ash: airy crowns of compound leaves.
    id: 'compound', height: 13, variants: [26],
    options: {
      type: 'deciduous',
      bark: { type: 'oak', tint: 0xb8b0a4, textureScale: { x: 0.6, y: 5 } },
      branch: {
        levels: 3,
        angle: { 1: 40, 2: 44, 3: 46 },
        children: { 0: 7, 1: 3, 2: 3 },
        force: { ...DECIDUOUS_FORCE, strength: 0.002 },
        gnarliness: { 0: 0.05, 1: 0.18, 2: 0.18, 3: 0.08 },
        length: { 0: 38, 1: 20, 2: 10, 3: 4 },
        radius: { 0: 1.7, 1: 0.55, 2: 0.6, 3: 0.7 },
        sections: { 0: 7, 1: 5, 2: 4, 3: 2 },
        segments: { 0: 7, 1: 4, 2: 3, 3: 3 },
        start: { 1: 0.38, 2: 0.3, 3: 0.1 },
        taper: { 0: 0.7, 1: 0.6, 2: 0.7, 3: 0.7 },
        twist: { 0: 0.05, 1: 0.05, 2: 0, 3: 0 },
      },
      leaves: { type: 'ash', billboard: 'double', angle: 34, count: 4, start: 0.1, size: 5.6, sizeVariance: 0.4, alphaTest: 0.5 },
    },
  },
  {
    // Tree of heaven: a weed tree of the walls and waste corners. Few stout,
    // forking stems and big compound leaves at the tips.
    id: 'ailanthus', height: 8, variants: [11],
    options: {
      type: 'deciduous',
      bark: { type: 'birch', tint: 0xa8a29a, textureScale: { x: 0.6, y: 3 } },
      branch: {
        levels: 2,
        angle: { 1: 34, 2: 40, 3: 30 },
        children: { 0: 5, 1: 4, 2: 0 },
        force: { ...DECIDUOUS_FORCE, strength: 0.01 },
        gnarliness: { 0: 0.1, 1: 0.2, 2: 0.1, 3: 0 },
        length: { 0: 26, 1: 16, 2: 6, 3: 1 },
        radius: { 0: 1.2, 1: 0.55, 2: 0.6, 3: 0.6 },
        sections: { 0: 6, 1: 5, 2: 2, 3: 1 },
        segments: { 0: 6, 1: 4, 2: 3, 3: 3 },
        start: { 1: 0.4, 2: 0.3, 3: 0 },
        taper: { 0: 0.7, 1: 0.6, 2: 0.7, 3: 0.7 },
        twist: { 0: 0, 1: 0, 2: 0, 3: 0 },
      },
      leaves: { type: 'ash', billboard: 'double', angle: 50, count: 6, start: 0.4, size: 5.2, sizeVariance: 0.3, alphaTest: 0.5 },
    },
  },
];

// Shrubs are ground cover, not trees: they go through the prop renderer and
// the ground-cover scatter, so their names are manifest keys.
const SHRUBS = [
  {
    // California privet: dense, dark and glossy, often clipped.
    id: 'privet', height: 2.2, variants: [4],
    options: shrubOptions({ children: 9, spread: 30, length: 12, leaves: { count: 12, size: 4.8 } }),
  },
  {
    // Van Houtte's spirea and its kin, in white flower in June.
    id: 'spirea', height: 1.7, variants: [8],
    options: shrubOptions({ children: 10, spread: 46, length: 13, droop: -0.03, leaves: { count: 11, size: 5.0 } }),
  },
  {
    // Staghorn sumac: a few bare upright stems, compound leaves on top.
    id: 'sumac', height: 3.2, variants: [6],
    options: shrubOptions({ children: 6, spread: 20, length: 20, leaves: { count: 6, size: 7.0, start: 0.55 } }),
  },
  {
    // Japanese knotweed: a thicket of cane-like stems with broad leaves.
    id: 'knotweed', height: 2.4, variants: [15],
    options: shrubOptions({ children: 16, spread: 24, length: 17, leaves: { count: 8, size: 4.4, start: 0.15 } }),
  },
];

function shrubOptions({ children, spread, length, droop = -0.015, leaves }) {
  return {
    type: 'deciduous',
    bark: { type: 'oak', tint: 0x9a9080, textureScale: { x: 0.5, y: 3 } },
    branch: {
      levels: 2,
      angle: { 1: spread, 2: 46, 3: 40 },
      children: { 0: children, 1: 3, 2: 0 },
      force: { ...DECIDUOUS_FORCE, strength: droop },
      gnarliness: { 0: 0.1, 1: 0.14, 2: 0.1, 3: 0 },
      length: { 0: 0.1, 1: length, 2: length * 0.45, 3: 1 },
      radius: { 0: 0.6, 1: 0.5, 2: 0.6, 3: 0.6 },
      sections: { 0: 1, 1: 4, 2: 3, 3: 1 },
      segments: { 0: 3, 1: 3, 2: 3, 3: 3 },
      start: { 1: 0, 2: 0.3, 3: 0 },
      taper: { 0: 0.7, 1: 0.7, 2: 0.7, 3: 0.7 },
      twist: { 0: 0, 1: 0, 2: 0, 3: 0 },
    },
    leaves: { type: 'ash', billboard: 'double', angle: 50, start: 0.15, sizeVariance: 0.4, alphaTest: 0.5, ...leaves },
  };
}

// Copies of the sprig fanned out from the card's stem end (bottom centre),
// each turned and shrunk a little, front copies drawn last.
function fanSprigs(source, size, copies) {
  const out = Buffer.alloc(size * size * 4);
  let seed = copies * 97;
  const random = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let c = 0; c < copies; c += 1) {
    const angle = ((c + 0.5) / copies - 0.5) * 1.6 + (random() - 0.5) * 0.25;
    const scale = 0.62 + random() * 0.3;
    const [cos, sin] = [Math.cos(angle), Math.sin(angle)];
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        const dx = x - size / 2;
        const dy = y - size;
        const sx = Math.round(size / 2 + (dx * cos + dy * sin) / scale);
        const sy = Math.round(size + (-dx * sin + dy * cos) / scale);
        if (sx < 0 || sy < 0 || sx >= size || sy >= size) continue;
        const i = (sy * size + sx) * 4;
        const a = source[i + 3] / 255;
        if (a <= 0) continue;
        const o = (y * size + x) * 4;
        for (let k = 0; k < 3; k += 1) out[o + k] = source[i + k] * a + out[o + k] * (1 - a);
        out[o + 3] = Math.max(out[o + 3], source[i + 3]);
      }
    }
  }
  return out;
}

// Shrubs are drawn as props, without the tree renderer's canopy shading, so
// it is baked here: every card is wound to face out of the mound and its
// normals bent outward, so the bush lights as one rounded mass.
function shadeAsMound(leaves, height) {
  const { position, normal, index } = leaves;
  const centre = [0, height * 0.42, 0];
  const v = (i) => [position[i * 3], position[i * 3 + 1], position[i * 3 + 2]];
  for (let t = 0; t < index.length; t += 3) {
    const [a, b, c] = [v(index[t]), v(index[t + 1]), v(index[t + 2])];
    const e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const e2 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const face = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
    const out = [0, 1, 2].map((k) => (a[k] + b[k] + c[k]) / 3 - centre[k]);
    if (face[0] * out[0] + face[1] * out[1] + face[2] * out[2] < 0) [index[t + 1], index[t + 2]] = [index[t + 2], index[t + 1]];
  }
  // Recompute card normals after the rewinding, then bend them 70% outward.
  normal.fill(0);
  for (let t = 0; t < index.length; t += 3) {
    const [a, b, c] = [v(index[t]), v(index[t + 1]), v(index[t + 2])];
    const e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const e2 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const face = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
    const length = Math.hypot(...face) || 1;
    for (const i of [index[t], index[t + 1], index[t + 2]]) for (let k = 0; k < 3; k += 1) normal[i * 3 + k] = face[k] / length;
  }
  const count = position.length / 3;
  const reach = new Float32Array(count);
  let farthest = 0;
  for (let i = 0; i < count; i += 1) {
    const out = [position[i * 3] - centre[0], (position[i * 3 + 1] - centre[1]) * 0.8 + height * 0.25, position[i * 3 + 2] - centre[2]];
    const length = Math.hypot(...out) || 1;
    const bent = [0, 1, 2].map((k) => normal[i * 3 + k] * 0.3 + (out[k] / length) * 0.7);
    const bentLength = Math.hypot(...bent) || 1;
    for (let k = 0; k < 3; k += 1) normal[i * 3 + k] = bent[k] / bentLength;
    reach[i] = Math.hypot(position[i * 3], (position[i * 3 + 1] - centre[1]) * 1.3, position[i * 3 + 2]);
    farthest = Math.max(farthest, reach[i]);
  }
  // Occlusion: leaves deep in the mound and near the ground get less sky.
  const color = new Float32Array(count * 3);
  for (let i = 0; i < count; i += 1) {
    const depth = Math.min(1, reach[i] / farthest) ** 1.5;
    const shade = (0.42 + 0.58 * depth) * (0.72 + 0.28 * Math.min(1, position[i * 3 + 1] / height));
    color.fill(shade, i * 3, i * 3 + 3);
  }
  leaves.color = color;
}

function dataUrlBytes(url) {
  return Buffer.from(url.slice(url.indexOf(',') + 1), 'base64');
}

function shortHash(bytes) {
  return createHash('sha256').update(bytes).digest('hex').slice(0, 8);
}

// One encoded image per key, so species that share a bark share its bytes and
// the runtime's hashed-name texture sharing uploads it once.
const imageCache = new Map();

async function encodeImage(key, build) {
  if (!imageCache.has(key)) {
    const bytes = await build();
    imageCache.set(key, { bytes, name: `${key}-${shortHash(bytes)}` });
  }
  return imageCache.get(key);
}

const sourceLeaves = {};
const sourceBark = {};

function leafImage(id) {
  const recipe = LEAVES[id];
  return encodeImage(`leaves-${id}`, async () => {
    let image = sharp(dataUrlBytes(sourceLeaves[recipe.source])).ensureAlpha().resize(512, 512);
    image = image.modulate(recipe.modulate);
    if (recipe.cluster) {
      const { data, info } = await image.raw().toBuffer({ resolveWithObject: true });
      image = sharp(fanSprigs(data, info.width, recipe.cluster), { raw: info });
    }
    if (recipe.blossom) {
      // Scatter small cream flower heads over the sprig, only where there is
      // already leaf, so the blossom keeps the sprig's silhouette.
      const { data, info } = await image.raw().toBuffer({ resolveWithObject: true });
      const blossom = new THREE.Color(recipe.blossom);
      let seed = 1;
      const random = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
      for (let n = 0; n < 900; n += 1) {
        const cx = Math.floor(random() * info.width);
        const cy = Math.floor(random() * info.height * 0.85);
        const r = 3 + random() * 4;
        for (let y = -r; y <= r; y += 1) {
          for (let x = -r; x <= r; x += 1) {
            if (x * x + y * y > r * r) continue;
            const px = cx + x;
            const py = cy + y;
            if (px < 0 || py < 0 || px >= info.width || py >= info.height) continue;
            const i = (py * info.width + px) * 4;
            if (data[i + 3] < 128) continue;
            const shade = 0.82 + random() * 0.18;
            data[i] = blossom.r * 255 * shade;
            data[i + 1] = blossom.g * 255 * shade;
            data[i + 2] = blossom.b * 255 * shade;
          }
        }
      }
      image = sharp(data, { raw: info });
    }
    return image.webp({ quality: 84, alphaQuality: 90 }).toBuffer();
  });
}

function barkImage(type, slot) {
  return encodeImage(`bark-${type}-${slot}`, () => {
    // Normal maps are data: kept lossless, at a size a trunk a few metres
    // off can use.
    return slot === 'normal'
      ? sharp(dataUrlBytes(sourceBark[type][slot])).resize(256, 256).webp({ lossless: true }).toBuffer()
      : sharp(dataUrlBytes(sourceBark[type][slot])).resize(512, 512).webp({ quality: 80 }).toBuffer();
  });
}

function generate(options, seed) {
  const tree = new Tree();
  tree.options.copy({ ...options, seed });
  tree.options.seed = seed;
  tree.generate();
  tree.updateMatrixWorld(true);
  const leafMap = tree.leavesMesh.material.map?.userData.url;
  if (leafMap) sourceLeaves[options.leaves.type] = leafMap;
  const barkMaterial = tree.branchesMesh.material;
  sourceBark[options.bark.type] ??= {
    color: barkMaterial.map.userData.url,
    normal: barkMaterial.normalMap.userData.url,
  };
  return tree;
}

// Arrays in metres with the trunk base at the origin. Bark UVs carry the
// texture repeat EZ-Tree would otherwise set on the texture.
function extract(tree, options, height) {
  const box = new THREE.Box3().setFromObject(tree);
  const scale = height / (box.max.y - box.min.y);
  const repeat = options.bark.textureScale;
  const part = (mesh, uvScale) => {
    const geometry = mesh.geometry;
    const position = Float32Array.from(geometry.attributes.position.array, (v, i) => (i % 3 === 1 ? (v - box.min.y) * scale : v * scale));
    const uv = Float32Array.from(geometry.attributes.uv.array, (v, i) => v * (i % 2 === 0 ? uvScale.x : uvScale.y));
    return {
      position,
      normal: Float32Array.from(geometry.attributes.normal.array),
      uv,
      index: Uint32Array.from(geometry.index.array),
    };
  };
  return {
    bark: part(tree.branchesMesh, { x: repeat.x, y: 1 / repeat.y }),
    leaves: part(tree.leavesMesh, { x: 1, y: 1 }),
    width: Math.max(box.max.x - box.min.x, box.max.z - box.min.z) * scale,
  };
}

// Far version: a third of the leaf cards, the survivors grown about their
// stem so the crown keeps its mass, and the bark simplified hard.
function distant({ bark, leaves, width }, double) {
  const quadsPerLeaf = double ? 2 : 1;
  const vertsPerLeaf = quadsPerLeaf * 4;
  const leafCount = leaves.position.length / 3 / vertsPerLeaf;
  const keep = [];
  for (let leaf = 0; leaf < leafCount; leaf += 1) if (leaf % 3 === 0) keep.push(leaf);
  const position = new Float32Array(keep.length * vertsPerLeaf * 3);
  const normal = new Float32Array(position.length);
  const uv = new Float32Array(keep.length * vertsPerLeaf * 2);
  const index = new Uint32Array(keep.length * quadsPerLeaf * 6);
  keep.forEach((leaf, k) => {
    const src = leaf * vertsPerLeaf;
    // Vertices 1 and 2 of the first quad are the leaf's stem end.
    const ox = (leaves.position[(src + 1) * 3] + leaves.position[(src + 2) * 3]) / 2;
    const oy = (leaves.position[(src + 1) * 3 + 1] + leaves.position[(src + 2) * 3 + 1]) / 2;
    const oz = (leaves.position[(src + 1) * 3 + 2] + leaves.position[(src + 2) * 3 + 2]) / 2;
    for (let v = 0; v < vertsPerLeaf; v += 1) {
      const s = (src + v) * 3;
      const d = (k * vertsPerLeaf + v) * 3;
      position[d] = ox + (leaves.position[s] - ox) * 1.7;
      position[d + 1] = oy + (leaves.position[s + 1] - oy) * 1.7;
      position[d + 2] = oz + (leaves.position[s + 2] - oz) * 1.7;
      normal.set(leaves.normal.subarray(s, s + 3), d);
      uv.set(leaves.uv.subarray((src + v) * 2, (src + v) * 2 + 2), (k * vertsPerLeaf + v) * 2);
    }
    for (let q = 0; q < quadsPerLeaf; q += 1) {
      const base = k * vertsPerLeaf + q * 4;
      index.set([base, base + 1, base + 2, base, base + 2, base + 3], (k * quadsPerLeaf + q) * 6);
    }
  });
  const [simplified] = MeshoptSimplifier.simplify(
    bark.index, bark.position, 3, Math.floor(bark.index.length * 0.05) * 3, 0.04, [],
  );
  return { bark: { ...bark, index: Uint32Array.from(simplified) }, leaves: { position, normal, uv, index }, width };
}

function triangles(geometry) {
  return `${geometry.bark.index.length / 3}+${geometry.leaves.index.length / 3}`;
}

async function writeGlb(io, path, geometry, species, leafKey, textured = true) {
  const document = new Document();
  const buffer = document.createBuffer();
  const scene = document.createScene();
  const texture = async (image, mime = 'image/webp') => document.createTexture(image.name).setImage(image.bytes).setMimeType(mime);

  // The far file is geometry only: TreeField draws it with the near model's
  // materials, matched by name.
  const tint = new THREE.Color(species.options.bark.tint);
  const barkMaterial = document.createMaterial('bark')
    .setBaseColorFactor([tint.r, tint.g, tint.b, 1])
    .setRoughnessFactor(0.92)
    .setMetallicFactor(0);
  const leafMaterial = document.createMaterial('leaves')
    .setAlphaMode('MASK')
    .setAlphaCutoff(species.options.leaves.alphaTest)
    // Shrub cards all face out of the mound (shadeAsMound); a back face
    // would light with the normal flipped, as a dark card.
    .setDoubleSided(!SHRUBS.includes(species))
    .setRoughnessFactor(0.9)
    .setMetallicFactor(0);

  const primitive = (part, material) => {
    const accessor = (array, type) => document.createAccessor().setArray(array).setType(type).setBuffer(buffer);
    const prim = document.createPrimitive();
    if (part.color) prim.setAttribute('COLOR_0', accessor(part.color, 'VEC3'));
    return prim
      .setAttribute('POSITION', accessor(part.position, 'VEC3'))
      .setAttribute('NORMAL', accessor(part.normal, 'VEC3'))
      .setAttribute('TEXCOORD_0', accessor(part.uv, 'VEC2'))
      .setIndices(accessor(part.index, 'SCALAR'))
      .setMaterial(material);
  };
  if (textured) {
    barkMaterial
      .setBaseColorTexture(await texture(await barkImage(species.options.bark.type, 'color')))
      .setNormalTexture(await texture(await barkImage(species.options.bark.type, 'normal')));
    leafMaterial.setBaseColorTexture(await texture(await leafImage(leafKey)));
  }
  for (const [name, part, material] of [['bark', geometry.bark, barkMaterial], ['leaves', geometry.leaves, leafMaterial]]) {
    const mesh = document.createMesh(name).addPrimitive(primitive(part, material));
    scene.addChild(document.createNode(name).setMesh(mesh));
  }
  await document.transform(
    quantize({ quantizePosition: 14, quantizeNormal: 10, quantizeTexcoord: 12 }),
    reorder({ encoder: MeshoptEncoder, target: 'size' }),
  );
  document.createExtension(EXTMeshoptCompression).setRequired(true)
    .setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.QUANTIZE });
  await writeFile(path, await io.writeBinary(document));
}

const io = await createIO();
await mkdir(OUT, { recursive: true });
const manifest = {};
for (const [group, list] of [['tree', SPECIES], ['shrub', SHRUBS]]) {
  for (const species of list) {
    for (const [index, seed] of species.variants.entries()) {
      const name = `${group === 'tree' ? 'park-tree' : 'park-shrub'}-${species.id}-${index}`;
      const tree = generate(species.options, seed);
      const near = extract(tree, species.options, species.height);
      if (group === 'shrub') shadeAsMound(near.leaves, species.height);
      const double = species.options.leaves.billboard === 'double';
      await writeGlb(io, `${OUT}/${name}.glb`, near, species, species.id);
      let lodNote = '';
      if (group === 'tree') {
        const far = distant(near, double);
        await writeGlb(io, `${OUT}/${name}-lod.glb`, far, species, species.id, false);
        lodNote = ` / far ${triangles(far)}`;
      }
      manifest[name] = {
        file: `${name}.glb`,
        min: [-near.width / 2, 0, -near.width / 2],
        size: [near.width, species.height, near.width],
        credit: CREDIT,
      };
      console.log(`${name}: ${triangles(near)} triangles${lodNote}, ${near.width.toFixed(1)}m wide`);
    }
  }
}
await writeFile(`${OUT}/manifest.json`, `${JSON.stringify(manifest, null, 1)}\n`);
