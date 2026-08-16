// Which tree pieces the park loads. Kept beside the other catalogs rather
// than inside TreeField so the boot preloader can name them without pulling
// the renderer into the eager bundle.

import { modelUrl } from './modelPacks.js';

// Two well-separated source variants per species keep the silhouettes varied;
// random spin, scale and canopy tint supply the rest. Loading all four doubled
// the tree payload and render buckets for very little visible gain at park
// viewing distances.
export const TREE_SOURCE_VARIANTS = [0, 2];
const SOURCE_VARIANT_STRIDE = 4;
const ARCHETYPE_MODELS = ['Tree-01', 'Tree-02', 'Tree-03'];

// The converter names a split piece `<source>__<group>`, and the kit's groups
// retain their original four-variant index even though only variants 1 and 3
// are loaded here: Tree-01-1_0, Tree-01-3_2, … Tree-03-3_10.
const MODEL_NAMES = ARCHETYPE_MODELS.flatMap((name, archetype) =>
  TREE_SOURCE_VARIANTS.map((sourceVariant) => (
    `shapespark_plants__${name}-${sourceVariant + 1}_${archetype * SOURCE_VARIANT_STRIDE + sourceVariant}`
  )),
);

export const TREE_MODEL_URLS = MODEL_NAMES.map(modelUrl);
