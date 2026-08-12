// Every prop the props panel can stand on the grid, from both sources: the
// pieces built out of primitives in code, and the converted GLB packs.
//
// A built entry knows how to make itself at an origin; a model entry is just
// a name the loader resolves. The panel does not care which is which beyond
// choosing a renderer.

import { INSTRUMENTS } from './instruments.js';
import { COACHWORKS } from './coachworks.js';
import { bookcase, labeledBottle, reagentBottleRack, screen, vaseOfFlowers } from './furnishings.js';
import { LABEL_FONT_IDS, LABEL_FONT_LABELS } from './labelFonts.js';
import victorian from '../../public/models/victorian/manifest.json' with { type: 'json' };
import park from '../../public/models/park/manifest.json' with { type: 'json' };
import props from '../../public/models/props/manifest.json' with { type: 'json' };

const BOOKCASE_SCHEMA = {
  version: 1,
  groups: [
    {
      id: 'dimensions',
      label: 'Dimensions',
      parameters: [
        { id: 'width', label: 'Width (m)', type: 'range', min: 1, max: 3.2, step: 0.05, default: 2 },
        { id: 'height', label: 'Height (m)', type: 'range', min: 1.4, max: 2.8, step: 0.05, default: 2.3 },
        { id: 'depth', label: 'Depth (m)', type: 'range', min: 0.3, max: 0.6, step: 0.01, default: 0.4 },
      ],
    },
    {
      id: 'finish',
      label: 'Finish',
      parameters: [
        { id: 'color', label: 'Carcass colour', type: 'color', default: '#3d2f22', vary: false },
      ],
    },
  ],
};

const SCREEN_SCHEMA = {
  version: 1,
  groups: [
    {
      id: 'construction',
      label: 'Construction',
      parameters: [
        { id: 'leaves', label: 'Leaves', type: 'range', min: 2, max: 5, step: 1, default: 3 },
        { id: 'leafWidth', label: 'Leaf width (m)', type: 'range', min: 0.45, max: 0.75, step: 0.01, default: 0.58 },
        { id: 'height', label: 'Height (m)', type: 'range', min: 1.4, max: 2, step: 0.02, default: 1.72 },
        { id: 'fold', label: 'Fold angle', type: 'range', min: 0.05, max: 0.55, step: 0.01, default: 0.34 },
      ],
    },
    {
      id: 'finish',
      label: 'Finish',
      parameters: [
        { id: 'frame', label: 'Frame colour', type: 'color', default: '#3b2b1d', vary: false },
        { id: 'panel', label: 'Panel colour', type: 'color', default: '#7b6a4e', vary: false },
      ],
    },
  ],
};

const VASE_SCHEMA = {
  version: 1,
  groups: [
    {
      id: 'arrangement',
      label: 'Arrangement',
      parameters: [
        { id: 'count', label: 'Flower count', type: 'range', min: 3, max: 16, step: 1, default: 8 },
        { id: 'height', label: 'Vase height (m)', type: 'range', min: 0.18, max: 0.4, step: 0.01, default: 0.28 },
        { id: 'radius', label: 'Vase radius (m)', type: 'range', min: 0.055, max: 0.13, step: 0.005, default: 0.085 },
      ],
    },
    {
      id: 'finish',
      label: 'Finish',
      parameters: [
        { id: 'glass', label: 'Glass colour', type: 'color', default: '#cddfd8', vary: false },
      ],
    },
  ],
};

const LABELED_BOTTLE_SCHEMA = {
  version: 2,
  groups: [
    {
      id: 'form',
      label: 'Bottle form',
      parameters: [
        { id: 'height', label: 'Height (m)', type: 'range', min: 0.1, max: 0.28, step: 0.005, default: 0.18 },
        { id: 'radius', label: 'Radius (m)', type: 'range', min: 0.025, max: 0.065, step: 0.0025, default: 0.04 },
        { id: 'shoulderRoundness', label: 'Shoulder roundness', type: 'range', min: 0, max: 1, step: 0.02, default: 0.62 },
        { id: 'neckRatio', label: 'Neck width', type: 'range', min: 0.34, max: 0.66, step: 0.01, default: 0.43 },
        { id: 'wallThickness', label: 'Glass wall (m)', type: 'range', min: 0.001, max: 0.004, step: 0.00025, default: 0.002 },
        { id: 'baseThickness', label: 'Glass base (m)', type: 'range', min: 0.002, max: 0.009, step: 0.0005, default: 0.0045 },
        { id: 'liquidLevel', label: 'Liquid level', type: 'range', min: 0.1, max: 0.92, step: 0.02, default: 0.58 },
        { id: 'meniscusDepth', label: 'Meniscus depth', type: 'range', min: 0, max: 0.0035, step: 0.00025, default: 0.0015 },
      ],
    },
    {
      id: 'label',
      label: 'Printed label',
      parameters: [
        {
          id: 'labelText',
          label: 'Label text',
          type: 'text',
          maxLength: 42,
          default: 'PREPARATION',
          fontSelector: 'labelFont',
          vary: false,
        },
        {
          id: 'labelFont',
          label: 'Typeface',
          type: 'select',
          options: LABEL_FONT_IDS,
          optionLabels: LABEL_FONT_LABELS,
          default: 'caslon',
          fontPreview: true,
          vary: false,
        },
        { id: 'labelWrap', label: 'Label wrap', type: 'range', min: 1.6, max: 4.5, step: 0.05, default: 3.25 },
        { id: 'labelHeight', label: 'Label height', type: 'range', min: 0.28, max: 0.68, step: 0.02, default: 0.46 },
        { id: 'labelPosition', label: 'Label position', type: 'range', min: -0.25, max: 0.25, step: 0.01, default: 0 },
        { id: 'paperAge', label: 'Paper age', type: 'range', min: 0, max: 1, step: 0.02, default: 0.25 },
        { id: 'labelPaper', label: 'Paper colour', type: 'color', default: '#ded0aa', vary: false },
        { id: 'labelInk', label: 'Ink colour', type: 'color', default: '#2d2118', vary: false },
      ],
    },
    {
      id: 'finish',
      label: 'Contents and glass',
      parameters: [
        { id: 'glass', label: 'Glass colour', type: 'color', default: '#a9c7bd', vary: false },
        { id: 'glassRoughness', label: 'Glass roughness', type: 'range', min: 0.01, max: 0.24, step: 0.01, default: 0.07 },
        { id: 'glassClarity', label: 'Glass transmission', type: 'range', min: 0.55, max: 1, step: 0.01, default: 0.96 },
        { id: 'liquid', label: 'Liquid colour', type: 'color', default: '#6f4b25', vary: false },
        { id: 'liquidDepth', label: 'Liquid clarity depth (m)', type: 'range', min: 0.025, max: 0.25, step: 0.005, default: 0.085 },
      ],
    },
  ],
};

const REAGENT_RACK_SCHEMA = {
  version: 1,
  groups: [
    {
      id: 'layout',
      label: 'Rack layout',
      parameters: [
        { id: 'columns', label: 'Bottle columns', type: 'range', min: 4, max: 10, step: 1, default: 6 },
        { id: 'rows', label: 'Bottle rows', type: 'range', min: 1, max: 2, step: 1, default: 1 },
        { id: 'slotGap', label: 'Slot gap (m)', type: 'range', min: 0.008, max: 0.05, step: 0.002, default: 0.018 },
        { id: 'rowGap', label: 'Row gap (m)', type: 'range', min: 0.01, max: 0.08, step: 0.005, default: 0.025 },
        { id: 'emptyRate', label: 'Empty slots', type: 'range', min: 0, max: 0.75, step: 0.05, default: 0 },
        { id: 'frameThickness', label: 'Frame stock (m)', type: 'range', min: 0.009, max: 0.025, step: 0.001, default: 0.014 },
        { id: 'rackBaseThickness', label: 'Base thickness (m)', type: 'range', min: 0.014, max: 0.04, step: 0.002, default: 0.022 },
        { id: 'edgeBevel', label: 'Edge bevel (m)', type: 'range', min: 0.001, max: 0.007, step: 0.0005, default: 0.0035 },
      ],
    },
    {
      id: 'bottles',
      label: 'Bottle family',
      parameters: [
        { id: 'bottleHeight', label: 'Bottle height (m)', type: 'range', min: 0.12, max: 0.24, step: 0.005, default: 0.18 },
        { id: 'bottleRadius', label: 'Bottle radius (m)', type: 'range', min: 0.028, max: 0.052, step: 0.002, default: 0.04 },
        { id: 'shapeVariety', label: 'Shape variety', type: 'range', min: 0, max: 1, step: 0.02, default: 0.68 },
        { id: 'liquidVariation', label: 'Liquid-level variety', type: 'range', min: 0, max: 1, step: 0.02, default: 0.72 },
        { id: 'wallThickness', label: 'Glass wall (m)', type: 'range', min: 0.001, max: 0.004, step: 0.00025, default: 0.002 },
        { id: 'glassBaseThickness', label: 'Glass base (m)', type: 'range', min: 0.002, max: 0.009, step: 0.0005, default: 0.0045 },
        { id: 'meniscusDepth', label: 'Meniscus depth', type: 'range', min: 0, max: 0.0035, step: 0.00025, default: 0.0015 },
      ],
    },
    {
      id: 'labels',
      label: 'Bottle labels',
      parameters: [
        { id: 'labelText', label: 'Label text', type: 'text', maxLength: 36, default: 'PREPARATION', fontSelector: 'labelFont', vary: false },
        { id: 'numberLabels', label: 'Number bottles', type: 'toggle', default: true, vary: false },
        { id: 'labelFont', label: 'Typeface', type: 'select', options: LABEL_FONT_IDS, optionLabels: LABEL_FONT_LABELS, default: 'caslon', fontPreview: true, vary: false },
        { id: 'labelWrap', label: 'Label wrap', type: 'range', min: 1.8, max: 4.3, step: 0.05, default: 3.25 },
        { id: 'labelHeight', label: 'Label height', type: 'range', min: 0.3, max: 0.62, step: 0.02, default: 0.46 },
        { id: 'labelPosition', label: 'Label position', type: 'range', min: -0.2, max: 0.2, step: 0.01, default: 0 },
        { id: 'paperAge', label: 'Paper age', type: 'range', min: 0, max: 1, step: 0.02, default: 0.34 },
        { id: 'labelPaper', label: 'Paper colour', type: 'color', default: '#ded0aa', vary: false },
        { id: 'labelInk', label: 'Ink colour', type: 'color', default: '#2d2118', vary: false },
      ],
    },
    {
      id: 'materials',
      label: 'Glass and contents',
      parameters: [
        { id: 'glass', label: 'Glass colour', type: 'color', default: '#a9c7bd', vary: false },
        { id: 'glassRoughness', label: 'Glass roughness', type: 'range', min: 0.01, max: 0.24, step: 0.01, default: 0.07 },
        { id: 'glassClarity', label: 'Glass transmission', type: 'range', min: 0.55, max: 1, step: 0.01, default: 0.96 },
        { id: 'liquidDepth', label: 'Liquid clarity depth (m)', type: 'range', min: 0.025, max: 0.25, step: 0.005, default: 0.085 },
        { id: 'liquidA', label: 'Liquid colour A', type: 'color', default: '#6f3f1d', vary: false },
        { id: 'liquidB', label: 'Liquid colour B', type: 'color', default: '#b17118', vary: false },
        { id: 'liquidC', label: 'Liquid colour C', type: 'color', default: '#657052', vary: false },
      ],
    },
    {
      id: 'wood',
      label: 'Wood finish',
      parameters: [
        { id: 'woodTint', label: 'Wood tint', type: 'color', default: '#9d8462', vary: false },
        { id: 'woodRoughness', label: 'Wood roughness', type: 'range', min: 0.35, max: 1, step: 0.02, default: 0.75 },
        { id: 'normalStrength', label: 'Grain relief', type: 'range', min: 0, max: 1.2, step: 0.02, default: 0.52 },
        { id: 'textureIntensity', label: 'Texture intensity', type: 'range', min: 0, max: 2, step: 0.05, default: 1.15 },
        { id: 'textureScale', label: 'Texture scale', type: 'range', min: 0.8, max: 7, step: 0.1, default: 2.8 },
      ],
    },
  ],
};

const BUILT_FURNITURE = {
  bookcase: {
    label: 'Bookcase, filled',
    note: 'Carcass, shelves, and books shelved per bay.',
    family: 'bookcase',
    schema: BOOKCASE_SCHEMA,
    defaultSeed: 1,
    historicalStatus: 'draft',
    performanceBudget: { maxParts: 260, maxMaterials: 8 },
    build: (id, o, recipe) => bookcase(id, o[0], o[2], 0, {
      height: recipe?.values?.height ?? 2.3,
      width: recipe?.values?.width ?? 2,
      depth: recipe?.values?.depth ?? 0.4,
      color: recipe?.values?.color ?? '#3d2f22',
      seed: recipe?.seed ?? 1,
    }),
  },
  screen: {
    label: 'Folding screen',
    note: 'Three leaves on hinges. What a patient undressed behind.',
    family: 'folding-screen',
    schema: SCREEN_SCHEMA,
    defaultSeed: 1,
    historicalStatus: 'draft',
    performanceBudget: { maxParts: 30, maxMaterials: 4 },
    build: (id, o, recipe) => screen(id, o[0], o[2], 0, {
      leaves: recipe?.values?.leaves ?? 3,
      leafWidth: recipe?.values?.leafWidth ?? 0.58,
      height: recipe?.values?.height ?? 1.72,
      fold: recipe?.values?.fold ?? 0.34,
      frame: recipe?.values?.frame ?? '#3b2b1d',
      panel: recipe?.values?.panel ?? '#7b6a4e',
    }),
  },
  'vase-of-flowers': {
    label: 'Vase of flowers',
    note: 'Glass, water, and cut stems on one loose body.',
    family: 'vase-of-flowers',
    schema: VASE_SCHEMA,
    defaultSeed: 11,
    historicalStatus: 'draft',
    performanceBudget: { maxParts: 36, maxMaterials: 10 },
    build: (id, o, recipe) => vaseOfFlowers(id, o[0], o[1], o[2], {
      count: recipe?.values?.count ?? 8,
      seed: recipe?.seed ?? 11,
      height: recipe?.values?.height ?? 0.28,
      radius: recipe?.values?.radius ?? 0.085,
      glass: recipe?.values?.glass ?? '#cddfd8',
    }),
  },
  'labeled-bottle-proof': {
    label: 'Labeled bottle — workflow proof',
    note: 'Neutral test object. Form, wording, and typography need reference review before use as historical content.',
    family: 'labeled-bottle-proof',
    schema: LABELED_BOTTLE_SCHEMA,
    defaultSeed: 23,
    historicalStatus: 'draft — reference required',
    performanceBudget: { maxParts: 8, maxMaterials: 7 },
    build: (id, o, recipe) => labeledBottle(id, o[0], o[1], o[2], {
      height: recipe?.values?.height ?? 0.18,
      radius: recipe?.values?.radius ?? 0.04,
      shoulderRoundness: recipe?.values?.shoulderRoundness ?? 0.62,
      neckRatio: recipe?.values?.neckRatio ?? 0.43,
      wallThickness: recipe?.values?.wallThickness ?? 0.002,
      baseThickness: recipe?.values?.baseThickness ?? 0.0045,
      liquidLevel: recipe?.values?.liquidLevel ?? 0.58,
      meniscusDepth: recipe?.values?.meniscusDepth ?? 0.0015,
      labelText: recipe?.values?.labelText ?? 'PREPARATION',
      labelFont: recipe?.values?.labelFont ?? 'caslon',
      labelWrap: recipe?.values?.labelWrap ?? 3.25,
      labelHeight: recipe?.values?.labelHeight ?? 0.46,
      labelPosition: recipe?.values?.labelPosition ?? 0,
      paperAge: recipe?.values?.paperAge ?? 0.25,
      labelPaper: recipe?.values?.labelPaper ?? '#ded0aa',
      labelInk: recipe?.values?.labelInk ?? '#2d2118',
      glass: recipe?.values?.glass ?? '#a9c7bd',
      glassRoughness: recipe?.values?.glassRoughness ?? 0.07,
      glassClarity: recipe?.values?.glassClarity ?? 0.96,
      liquid: recipe?.values?.liquid ?? '#6f4b25',
      liquidDepth: recipe?.values?.liquidDepth ?? 0.085,
    }),
  },
  'reagent-bottle-rack': {
    label: 'Reagent bottle rack — workflow proof',
    note: 'Editable rack and bottle family. Construction, labels, and contents require historical reference review.',
    family: 'reagent-bottle-rack',
    schema: REAGENT_RACK_SCHEMA,
    defaultSeed: 37,
    historicalStatus: 'draft — reference required',
    performanceBudget: { maxParts: 128, maxMaterials: 28 },
    build: (id, o, recipe) => reagentBottleRack(id, o[0], o[1], o[2], {
      seed: recipe?.seed ?? 37,
      ...(recipe?.values ?? {}),
      previewQuality: recipe?.previewQuality,
    }),
  },
};

// Groups in the order the panel lists them.
export const PROP_GROUPS = [
  { id: 'instruments', label: 'Laboratory apparatus', kind: 'built', entries: INSTRUMENTS },
  { id: 'coachworks', label: 'Coachworks workshop', kind: 'built', entries: COACHWORKS },
  { id: 'built', label: 'Built furniture', kind: 'built', entries: BUILT_FURNITURE },
  { id: 'victorian', label: 'Victorian pack', kind: 'model', manifest: victorian },
  { id: 'props', label: 'Props pack', kind: 'model', manifest: props },
  { id: 'park', label: 'Park pack', kind: 'model', manifest: park },
];

// One flat list, each row carrying everything the panel needs to show it.
export function propList() {
  const rows = [];
  for (const group of PROP_GROUPS) {
    if (group.kind === 'built') {
      for (const [name, entry] of Object.entries(group.entries)) {
        rows.push({
          key: `${group.id}/${name}`,
          name,
          label: entry.label,
          note: entry.note,
          group: group.label,
          kind: 'built',
          build: entry.build,
          family: entry.family ?? null,
          schema: entry.schema ?? null,
          defaultSeed: entry.defaultSeed ?? 1,
          defaultValues: entry.defaultValues ?? null,
          historicalStatus: entry.historicalStatus ?? null,
          performanceBudget: entry.performanceBudget ?? null,
        });
      }
    } else {
      for (const [name, entry] of Object.entries(group.manifest)) {
        rows.push({
          key: `${group.id}/${name}`,
          name,
          label: name,
          note: entry.credit ? `${entry.credit.author} — ${entry.credit.license}` : null,
          group: group.label,
          kind: 'model',
          size: entry.size,
          pack: group.id,
          file: entry.file,
        });
      }
    }
  }
  return rows;
}

// Bounds of a built prop's items, so the panel can frame and measure it the
// same way the converter measures a model.
export function builtBounds(items) {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  const eat = (position, size) => {
    for (let axis = 0; axis < 3; axis += 1) {
      min[axis] = Math.min(min[axis], position[axis] - size[axis] / 2);
      max[axis] = Math.max(max[axis], position[axis] + size[axis] / 2);
    }
  };
  for (const item of items) {
    if (item.parts) {
      if (item.boundsSize) {
        eat(
          item.position.map((value, axis) => value + (item.boundsCenter?.[axis] ?? 0)),
          item.boundsSize,
        );
        continue;
      }
      for (const part of item.parts) {
        eat(
          [
            item.position[0] + part.position[0],
            item.position[1] + part.position[1],
            item.position[2] + part.position[2],
          ],
          part.size,
        );
      }
    } else {
      eat(item.position, item.size);
    }
  }
  if (!Number.isFinite(min[0])) return { min: [0, 0, 0], max: [0, 0, 0], size: [0, 0, 0] };
  return { min, max, size: max.map((value, axis) => value - min[axis]) };
}
