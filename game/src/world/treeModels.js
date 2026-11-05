// Which tree models the park loads. Kept beside the other catalogs rather
// than inside TreeField so the boot preloader can name them without pulling
// the renderer into the eager bundle.

import { modelUrl, packModels } from './modelPacks.js';

// Baked by scripts/models/build-park-trees.mjs; each has a `-lod` twin. The
// two Shapespark elms are the original park trees, kept for the big shade
// trees at the Plaza entrance (species 'old-elm').
const OLD_ELMS = ['shapespark_plants__Tree-01-1_0', 'shapespark_plants__Tree-01-3_2'];
export const TREE_MODELS = [...packModels('trees').filter((name) => name.startsWith('park-tree-')), ...OLD_ELMS];

export function treeSpecies(name) {
  if (OLD_ELMS.includes(name)) return 'old-elm';
  return name.replace(/^park-tree-/, '').replace(/-\d+$/, '');
}

export const TREE_MODEL_URLS = TREE_MODELS.map(modelUrl);

export const TREE_LOD_URLS = TREE_MODEL_URLS.map((url) => url.replace('.glb', '-lod.glb'));
