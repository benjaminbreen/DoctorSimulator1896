// Versioned recipes for developer-authored procedural props and scatter.
// Geometry stays in each family builder; this module owns only values,
// deterministic variation, validation, and placement.

export const ASSET_RECIPE_VERSION = 1;
export const SCATTER_RECIPE_VERSION = 1;

export const scatterSchema = {
  version: SCATTER_RECIPE_VERSION,
  groups: [
    {
      id: 'distribution',
      label: 'Distribution',
      parameters: [
        { id: 'count', label: 'Count', type: 'range', min: 1, max: 40, step: 1, default: 12 },
        { id: 'width', label: 'Area width (m)', type: 'range', min: 0.5, max: 12, step: 0.1, default: 5 },
        { id: 'depth', label: 'Area depth (m)', type: 'range', min: 0.5, max: 12, step: 0.1, default: 5 },
        { id: 'clustering', label: 'Clustering', type: 'range', min: 0, max: 1, step: 0.05, default: 0.25 },
        { id: 'edgeBias', label: 'Edge bias', type: 'range', min: 0, max: 1, step: 0.05, default: 0 },
      ],
    },
    {
      id: 'variation',
      label: 'Placement variation',
      parameters: [
        { id: 'rotationJitter', label: 'Rotation', type: 'range', min: 0, max: 3.1416, step: 0.05, default: 3.1416 },
        { id: 'scaleJitter', label: 'Scale', type: 'range', min: 0, max: 0.45, step: 0.01, default: 0.08 },
        { id: 'varyAssetSeed', label: 'Vary asset seed', type: 'toggle', default: true },
      ],
    },
  ],
};

export function schemaParameters(schema) {
  return schema?.groups?.flatMap((group) =>
    group.parameters.map((parameter) => ({ ...parameter, group: group.id })),
  ) ?? [];
}

export function schemaDefaults(schema) {
  return Object.fromEntries(schemaParameters(schema).map((parameter) => [parameter.id, parameter.default]));
}

export function coerceParameter(parameter, value) {
  if (parameter.type === 'toggle') return Boolean(value);
  if (parameter.type === 'text') {
    const oneLine = String(value ?? '')
      .replace(/[\r\n\t]+/g, ' ');
    return oneLine.slice(0, parameter.maxLength ?? 80);
  }
  if (parameter.type === 'select') {
    return parameter.options.includes(value) ? value : parameter.default;
  }
  if (parameter.type === 'color') {
    return /^#[0-9a-f]{6}$/i.test(String(value)) ? String(value) : parameter.default;
  }
  const number = Number(value);
  if (!Number.isFinite(number)) return parameter.default;
  const clamped = Math.min(parameter.max, Math.max(parameter.min, number));
  if (!parameter.step) return clamped;
  const steps = Math.round((clamped - parameter.min) / parameter.step);
  const snapped = Math.min(parameter.max, Math.max(parameter.min, parameter.min + steps * parameter.step));
  return Number(snapped.toFixed(6));
}

function normalizeValues(schema, values) {
  return Object.fromEntries(schemaParameters(schema).map((parameter) => [
    parameter.id,
    coerceParameter(parameter, values?.[parameter.id] ?? parameter.default),
  ]));
}

function integerSeed(value, fallback = 1) {
  const seed = Math.trunc(Number(value));
  return Number.isSafeInteger(seed) ? seed : fallback;
}

export function nextSeed(seed) {
  return (Math.imul(integerSeed(seed), 1664525) + 1013904223) >>> 0;
}

function hash01(seed) {
  let value = integerSeed(seed) >>> 0;
  value ^= value >>> 16;
  value = Math.imul(value, 0x7feb352d);
  value ^= value >>> 15;
  value = Math.imul(value, 0x846ca68b);
  value ^= value >>> 16;
  return (value >>> 0) / 4294967296;
}

export function createAssetRecipe(definition, input = {}) {
  if (!definition?.family || !definition?.schema) return null;
  return {
    schemaVersion: ASSET_RECIPE_VERSION,
    kind: 'procedural-asset',
    family: definition.family,
    seed: integerSeed(input.seed, definition.defaultSeed ?? 1),
    values: normalizeValues(definition.schema, input.values),
    historicalStatus: definition.historicalStatus ?? 'draft',
  };
}

export function createScatterRecipe(input = {}) {
  return {
    schemaVersion: SCATTER_RECIPE_VERSION,
    kind: 'procedural-scatter',
    seed: integerSeed(input.seed, 1),
    values: normalizeValues(scatterSchema, input.values),
  };
}

function validateValues(schema, values, errors) {
  if (!values || typeof values !== 'object') {
    errors.push('values must be an object');
    return;
  }
  for (const parameter of schemaParameters(schema)) {
    const value = values[parameter.id];
    if (parameter.type === 'toggle') {
      if (typeof value !== 'boolean') errors.push(`${parameter.id} must be true or false`);
      continue;
    }
    if (parameter.type === 'text') {
      if (typeof value !== 'string') errors.push(`${parameter.id} must be text`);
      else if (value.length > (parameter.maxLength ?? 80)) errors.push(`${parameter.id} is too long`);
      continue;
    }
    if (parameter.type === 'select') {
      if (!parameter.options.includes(value)) errors.push(`${parameter.id} is not a supported option`);
      continue;
    }
    if (parameter.type === 'color') {
      if (!/^#[0-9a-f]{6}$/i.test(String(value))) errors.push(`${parameter.id} must be a six-digit colour`);
      continue;
    }
    if (!Number.isFinite(value) || value < parameter.min || value > parameter.max) {
      errors.push(`${parameter.id} must be between ${parameter.min} and ${parameter.max}`);
    }
  }
}

export function validateAssetRecipe(definition, recipe) {
  const errors = [];
  if (!recipe || typeof recipe !== 'object') return ['recipe must be an object'];
  if (recipe.schemaVersion !== ASSET_RECIPE_VERSION) errors.push(`schemaVersion must be ${ASSET_RECIPE_VERSION}`);
  if (recipe.kind !== 'procedural-asset') errors.push('kind must be procedural-asset');
  if (recipe.family !== definition?.family) errors.push(`family must be ${definition?.family}`);
  if (!Number.isSafeInteger(recipe.seed)) errors.push('seed must be an integer');
  validateValues(definition?.schema, recipe.values, errors);
  return errors;
}

export function validateScatterRecipe(recipe) {
  const errors = [];
  if (!recipe || typeof recipe !== 'object') return ['scatter recipe must be an object'];
  if (recipe.schemaVersion !== SCATTER_RECIPE_VERSION) errors.push(`schemaVersion must be ${SCATTER_RECIPE_VERSION}`);
  if (recipe.kind !== 'procedural-scatter') errors.push('kind must be procedural-scatter');
  if (!Number.isSafeInteger(recipe.seed)) errors.push('seed must be an integer');
  validateValues(scatterSchema, recipe.values, errors);
  return errors;
}

export function setRecipeValue(definition, recipe, id, value) {
  const parameter = schemaParameters(definition.schema).find((candidate) => candidate.id === id);
  if (!parameter) return recipe;
  return createAssetRecipe(definition, {
    ...recipe,
    values: { ...recipe.values, [id]: coerceParameter(parameter, value) },
  });
}

export function setScatterValue(recipe, id, value) {
  const parameter = schemaParameters(scatterSchema).find((candidate) => candidate.id === id);
  if (!parameter) return recipe;
  return createScatterRecipe({
    ...recipe,
    values: { ...recipe.values, [id]: coerceParameter(parameter, value) },
  });
}

export function varyAssetRecipe(definition, recipe, seed = nextSeed(recipe.seed)) {
  const values = {};
  schemaParameters(definition.schema).forEach((parameter, index) => {
    if (parameter.vary === false || parameter.type === 'color' || parameter.type === 'toggle' || parameter.type === 'text') {
      values[parameter.id] = recipe.values[parameter.id];
      return;
    }
    const roll = hash01(seed + index * 1013);
    if (parameter.type === 'select') {
      values[parameter.id] = parameter.options[Math.min(parameter.options.length - 1, Math.floor(roll * parameter.options.length))];
      return;
    }
    values[parameter.id] = coerceParameter(parameter, parameter.min + roll * (parameter.max - parameter.min));
  });
  return createAssetRecipe(definition, { seed, values });
}

// Variant sheets have a total complexity budget. Without one, a compound
// family can multiply hundreds of meshes and large texture sets twelvefold.
export function generateAssetVariants(definition, recipe, options = {}) {
  const maxVariants = options.maxVariants ?? 6;
  const maxParts = options.maxParts ?? 240;
  const minVariants = Math.min(maxVariants, options.minVariants ?? 2);
  const variants = [];
  let previewParts = 0;
  let seed = recipe.seed;

  for (let index = 0; index < maxVariants; index += 1) {
    seed = nextSeed(seed);
    const variant = {
      ...varyAssetRecipe(definition, recipe, seed),
      previewQuality: 'variants',
    };
    const parts = assetBuildStats(definition.build(`variant-budget-${index}`, [0, 0, 0], variant)).parts;
    if (variants.length >= minVariants && previewParts + parts > maxParts) break;
    previewParts += parts;
    variants.push(variant);
  }
  return variants;
}

function clusterCentres(seed, width, depth) {
  return Array.from({ length: 3 }, (_, index) => [
    (hash01(seed + 500 + index * 17) - 0.5) * width * 0.72,
    (hash01(seed + 700 + index * 29) - 0.5) * depth * 0.72,
  ]);
}

export function generateScatterPlacements(assetRecipe, scatterRecipe) {
  const values = createScatterRecipe(scatterRecipe).values;
  const seed = integerSeed(scatterRecipe?.seed, 1);
  const centres = clusterCentres(seed, values.width, values.depth);
  const placements = [];

  for (let index = 0; index < values.count; index += 1) {
    let x = (hash01(seed + index * 41 + 1) - 0.5) * values.width;
    let z = (hash01(seed + index * 41 + 2) - 0.5) * values.depth;
    const centre = centres[Math.floor(hash01(seed + index * 41 + 3) * centres.length)];
    x += (centre[0] - x) * values.clustering;
    z += (centre[1] - z) * values.clustering;

    if (values.edgeBias > 0) {
      const horizontal = hash01(seed + index * 41 + 4) > 0.5;
      const sign = hash01(seed + index * 41 + 5) > 0.5 ? 1 : -1;
      if (horizontal) x += (sign * values.width / 2 - x) * values.edgeBias;
      else z += (sign * values.depth / 2 - z) * values.edgeBias;
    }

    const scaleRoll = hash01(seed + index * 41 + 6) * 2 - 1;
    placements.push({
      id: `scatter-${index}`,
      position: [Number(x.toFixed(3)), 0, Number(z.toFixed(3))],
      yaw: Number(((hash01(seed + index * 41 + 7) * 2 - 1) * values.rotationJitter).toFixed(4)),
      scale: Number((1 + scaleRoll * values.scaleJitter).toFixed(4)),
      assetSeed: values.varyAssetSeed ? nextSeed(assetRecipe.seed + index) : assetRecipe.seed,
    });
  }
  return placements;
}

export function assetBuildStats(items) {
  const materialKeys = new Set();
  let parts = 0;
  let modelReferences = 0;
  for (const item of items) {
    const renderables = item.parts?.length ? item.parts : [item];
    parts += renderables.length;
    for (const part of renderables) {
      if (part.model || item.model) modelReferences += 1;
      materialKeys.add(JSON.stringify([
        part.finish ?? item.finish ?? null,
        part.color ?? item.color ?? null,
        Boolean(part.glass ?? item.glass),
        part.roughness ?? item.roughness ?? null,
        part.label ?? item.label ?? null,
      ]));
    }
  }
  return { items: items.length, parts, materials: materialKeys.size, modelReferences };
}
