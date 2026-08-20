import {
  RENDERER_C_LIVE_BODY_IDS,
  RENDERER_C_LIVE_FACE_IDS,
} from './rendererCRecipe.js';
import {
  applyRendererCBrowSurface,
  applyRendererCHairSurface,
  applyRendererCSkinSurface,
} from './rendererCSurface.js';
import {
  applyRendererCMenswearSurface,
  applyRendererCWomenWardrobeSurface,
  setRendererCWomenWardrobeVisible,
} from './rendererCWardrobeSurface.js';

function clamp(value, minimum = -1, maximum = 1) {
  return Math.max(minimum, Math.min(maximum, value));
}

function mixHex(left, right, amount) {
  const channels = (value) => [1, 3, 5].map((index) => Number.parseInt(value.slice(index, index + 2), 16));
  const from = channels(left);
  const to = channels(right);
  return `#${from.map((value, index) => Math.round(value + (to[index] - value) * clamp(amount, 0, 1))
    .toString(16).padStart(2, '0')).join('')}`;
}

function isWardrobeObject(object) {
  for (let current = object; current; current = current.parent) {
    if (current.userData?.renderer_c_role === 'clothe') return true;
    if (/RendererC_(?:BaseGarment|WorkGarment|VictorianGarment|VictorianDress|GoldenDress|EliteMorningSuit)/.test(current.name)) return true;
  }
  return false;
}

function morphWeight(root, name, value, { skipWardrobe = false } = {}) {
  if (!name) return false;
  let changed = false;
  root.traverse((object) => {
    if (skipWardrobe && isWardrobeObject(object)) return;
    const index = object.morphTargetDictionary?.[name];
    if (index === undefined) return;
    if (Math.abs((object.morphTargetInfluences[index] || 0) - value) > 1e-5) changed = true;
    object.morphTargetInfluences[index] = value;
  });
  return changed;
}

function signedMorph(root, parameterId, value, options) {
  const normalized = clamp(Number(value) || 0);
  const positiveChanged = morphWeight(root, `rc_live_${parameterId}_pos`, Math.max(0, normalized), options);
  const negativeChanged = morphWeight(root, `rc_live_${parameterId}_neg`, Math.max(0, -normalized), options);
  return positiveChanged || negativeChanged;
}

function bodySignedValue(parameterId, value, cohort) {
  const centers = { weight: 0.48, muscle: cohort === 'men' ? 0.38 : 0.27, proportions: 0.50 };
  const ranges = { weight: [0.24, 0.78], muscle: [0.18, 0.72], proportions: [0.28, 0.74] };
  const center = centers[parameterId];
  const [low, high] = ranges[parameterId];
  return value >= center ? (value - center) / (high - center) : (value - center) / (center - low);
}

function collectVariants(root) {
  const variants = new Map();
  root.traverse((object) => {
    const role = object.userData?.renderer_c_variant_role;
    if (!['brows', 'lashes', 'hair', 'eyes', 'teeth'].includes(role)) return;
    if (!variants.has(role)) variants.set(role, []);
    variants.get(role).push(object);
  });
  return variants;
}

function setVariants(variants, anchor) {
  const slots = { brows: 'browSlot', lashes: 'lashSlot', hair: 'hairSlot', eyes: 'eyeSlot', teeth: 'teethSlot' };
  for (const [role, objects] of variants) {
    const slot = anchor?.[slots[role]] ?? 0;
    for (const object of objects) object.visible = Number(object.userData.renderer_c_variant_slot) === slot;
  }
}

function setNamedVisible(root, name, visible) {
  const object = root.getObjectByName(name);
  if (object) object.visible = visible;
}

function materialsUnder(object) {
  const materials = [];
  object?.traverse((child) => {
    if (!child.isMesh && !child.isSkinnedMesh) return;
    materials.push(...(Array.isArray(child.material) ? child.material : [child.material]).filter(Boolean));
  });
  return materials;
}

function namedRoots(root, prefix) {
  const matches = [];
  root.traverse((object) => {
    if (object.name.startsWith(prefix)) matches.push(object);
  });
  return matches;
}

function configureCutout(material, alphaTest = 0.18) {
  material.transparent = false;
  material.opacity = 1;
  material.alphaTest = alphaTest;
  material.depthTest = true;
  material.depthWrite = true;
  material.needsUpdate = true;
}

function configureOpaque(material) {
  material.transparent = false;
  material.opacity = 1;
  material.alphaTest = 0;
  material.depthTest = true;
  material.depthWrite = true;
  material.needsUpdate = true;
}

function setAppearance(root, prefix, { color, roughness, cutout = false, alphaTest = 0.18 } = {}) {
  for (const object of namedRoots(root, prefix)) {
    for (const material of materialsUnder(object)) {
      if (color && material.color) material.color.set(color);
      if (roughness != null && 'roughness' in material) material.roughness = clamp(Number(roughness), 0.35, 1);
      if (cutout) configureCutout(material, alphaTest);
      else configureOpaque(material);
    }
  }
}

function tintCombinedEyeTexture(material, eyeColor) {
  if (!eyeColor || !material.map?.image || typeof document === 'undefined') return;
  if (!material.userData.rendererCEyeTintSource) {
    const image = material.map.image;
    const canvas = document.createElement('canvas');
    canvas.width = image.width;
    canvas.height = image.height;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    context.drawImage(image, 0, 0);
    material.userData.rendererCEyeTintSource = context.getImageData(0, 0, canvas.width, canvas.height);
    material.userData.rendererCEyeTintCanvas = canvas;
    material.map = material.map.clone();
    material.map.image = canvas;
  }

  const source = material.userData.rendererCEyeTintSource;
  const canvas = material.userData.rendererCEyeTintCanvas;
  const context = canvas.getContext('2d');
  const output = context.createImageData(source.width, source.height);
  output.data.set(source.data);
  const target = [1, 3, 5].map((index) => Number.parseInt(eyeColor.slice(index, index + 2), 16));
  for (let index = 0; index < output.data.length; index += 4) {
    const red = source.data[index];
    const green = source.data[index + 1];
    const blue = source.data[index + 2];
    const high = Math.max(red, green, blue);
    const low = Math.min(red, green, blue);
    const chroma = high - low;
    const light = red * 0.299 + green * 0.587 + blue * 0.114;
    // Select any coloured iris midtone. Neutral sclera, black pupils and white
    // catchlights retain their source values.
    const mask = Math.min(1, Math.max(0, (chroma - 5) / 25))
      * Math.min(1, Math.max(0, (light - 20) / 45))
      * Math.min(1, Math.max(0, (225 - light) / 80));
    if (mask <= 0) continue;
    const contrast = clamp(0.72 + (light / 255) * 0.4, 0.72, 1.12);
    for (let channel = 0; channel < 3; channel += 1) {
      const tinted = clamp(target[channel] * contrast, 0, 255);
      output.data[index + channel] = source.data[index + channel]
        + (tinted - source.data[index + channel]) * mask * 0.94;
    }
  }
  context.putImageData(output, 0, 0);
  material.map.needsUpdate = true;
}

function setEyeAppearance(root, eyeColor, ageCue = 0) {
  const scleraColor = mixHex('#d8cec4', '#c3b5a6', ageCue * 0.62);
  const combinedColor = mixHex('#d8d0c8', '#c5b8aa', ageCue * 0.58);
  for (const object of namedRoots(root, 'RendererC_Eyes')) {
    for (const material of materialsUnder(object)) {
      const name = material.name.toLowerCase();
      if (material.color) {
        if (name.includes('sclera')) material.color.set(scleraColor);
        else if (name.includes('iris') && !material.map) material.color.set(eyeColor || '#735b3f');
        // MPFB's high-poly eye uses one colour texture for sclera, iris, and
        // pupil. Tinting that whole material to the iris colour makes the
        // sclera black. Use a neutral off-white to keep the sclera below the
        // face highlights without shifting it toward the selected iris hue.
        else material.color.set(combinedColor);
      }
      if (material.map) tintCombinedEyeTexture(material, eyeColor);
      if ('roughness' in material) material.roughness = 0.58 + ageCue * 0.07;
      if ('metalness' in material) material.metalness = 0;
      // The MPFB eye atlas is exported as BLEND because transparent texels
      // surround the painted sclera. Treat it as a very light cutout so those
      // black RGB texels do not become opaque in Three.js.
      if (material.map) configureCutout(material, 0.02);
      else configureOpaque(material);
    }
  }
}

function applyIdentity(root, manifest, values, variants, activeAnchor, force = false) {
  const anchors = manifest?.anchors || [];
  const anchorIndex = clamp(Math.round(Number(values.rendererCAnchor) || 0), 0, Math.max(0, anchors.length - 1));
  let changed = false;
  for (let index = 0; index < anchors.length; index += 1) {
    changed = morphWeight(root, anchors[index].morph, index === anchorIndex ? 1 : 0) || changed;
  }
  if (force || anchorIndex !== activeAnchor) {
    setVariants(variants, anchors[anchorIndex]);
    changed = true;
  }

  const age = Number(values.age ?? manifest?.neutralAge ?? 0.555);
  changed = morphWeight(root, manifest?.demographicMorphs?.ageYoung, clamp((0.555 - age) / 0.05, 0, 1)) || changed;
  const ageGeometry = Number.isFinite(Number(values.ageGeometry))
    ? clamp(Number(values.ageGeometry), 0, 1) * 1.22
    : clamp((age - 0.555) / (0.84 - 0.555), 0, 1.22);
  changed = morphWeight(root, manifest?.demographicMorphs?.ageOld, ageGeometry) || changed;
  changed = morphWeight(root, manifest?.demographicMorphs?.asian, clamp(Number(values.asian) || 0, 0, 1)) || changed;
  changed = morphWeight(root, manifest?.demographicMorphs?.african, clamp(Number(values.african) || 0, 0, 1)) || changed;

  for (const id of RENDERER_C_LIVE_FACE_IDS) changed = signedMorph(root, id, values[id], { skipWardrobe: true }) || changed;
  for (const id of RENDERER_C_LIVE_BODY_IDS) {
    changed = signedMorph(root, id, bodySignedValue(id, Number(values[id]), manifest?.cohort)) || changed;
  }

  const heightCenter = manifest?.cohort === 'men' ? 0.53 : 0.47;
  const heightScale = 1 + ((Number(values.height) || heightCenter) - heightCenter) * 0.28;
  root.scale.set(1, heightScale, 1);
  root.updateMatrixWorld(true);
  return { activeAnchor: anchorIndex, changed };
}

export function createRendererCController(root, manifest, initialValues = {}) {
  const variants = collectVariants(root);
  let activeAnchor = -1;

  function applyValues(values, { force = false } = {}) {
    const result = applyIdentity(root, manifest, values, variants, activeAnchor, force);
    activeAnchor = result.activeAnchor;
    return result.changed;
  }

  applyValues(initialValues, { force: true });
  return {
    manifest,
    anchors: manifest?.anchors || [],
    variants,
    applyValues,
    get activeAnchor() { return activeAnchor; },
  };
}

// SkeletonUtils clones geometry and bones but continues to share materials.
// Each actor needs independent materials for patient-specific colours.
export function cloneRendererCMaterials(root) {
  root.traverse((object) => {
    if (!object.isMesh && !object.isSkinnedMesh) return;
    if (Array.isArray(object.material)) object.material = object.material.map((material) => material?.clone());
    else if (object.material) object.material = object.material.clone();
  });
  return root;
}

export function applyRendererCAppearance(root, recipe) {
  const values = recipe.values || {};
  const presentation = recipe.presentation || {};
  const surfaceValues = { ...values, appearanceSeed: recipe.appearanceSeed };
  const skinTone = values.skinTone || '#d9ad91';
  const hairColor = values.hairColor || '#3c2418';
  const browColor = values.browColor || hairColor;
  const greyAmount = clamp(Number(values.greyAmount) || 0, 0, 1);
  const ageCue = clamp(Number(values.ageGeometry ?? values.wrinkleAmount) || 0, 0, 1);
  const agedLashColor = mixHex(values.lashColor || '#17100c', '#817d76', Math.pow(greyAmount, 1.5) * 0.28);
  const toothColor = mixHex('#ded8c9', '#b9aa8f', ageCue * 0.56);
  const dressColor = values.dressColor || presentation.dressColor || '#3d2630';
  const secondaryColor = values.secondaryColor || presentation.secondaryColor || '#5f3d23';
  const trimColor = values.trimColor || presentation.trimColor || '#665148';
  const skinRoughness = values.skinRoughness ?? 0.9;
  const fabricRoughness = values.fabricRoughness ?? 0.92;

  const body = root.getObjectByName('Human_Body');
  for (const material of materialsUnder(body)) {
    if (material.color) material.color.set(skinTone);
    if ('roughness' in material) material.roughness = clamp(skinRoughness, 0.35, 1);
    configureOpaque(material);
  }
  applyRendererCSkinSurface(root, surfaceValues);

  setEyeAppearance(root, values.eyeColor, ageCue);
  setAppearance(root, 'RendererC_Teeth', { color: toothColor, roughness: 0.62 + ageCue * 0.08 });
  setAppearance(root, 'RendererC_Hair', { color: hairColor, roughness: 0.88, cutout: true, alphaTest: 0.22 });
  applyRendererCHairSurface(root, surfaceValues);
  setAppearance(root, 'RendererC_Brows', {
    color: browColor, roughness: 0.9, cutout: true, alphaTest: 0.28 + ageCue * 0.08,
  });
  applyRendererCBrowSurface(root, surfaceValues);
  setAppearance(root, 'RendererC_Lashes', {
    color: agedLashColor, roughness: 0.92, cutout: true, alphaTest: 0.4 + ageCue * 0.04,
  });

  setAppearance(root, 'RendererC_BaseGarment', { color: dressColor, roughness: fabricRoughness });
  for (const prefix of ['RendererC_VictorianDress', 'RendererC_WorkGarment', 'RendererC_VictorianGarment']) {
    for (const object of namedRoots(root, prefix)) {
      for (const material of materialsUnder(object)) {
        // A flat tint over an authored diffuse map darkens it to mud; only
        // recolor untextured carrier materials.
        if (material.color && !material.map) material.color.set(material.name.includes('Trim') ? trimColor : dressColor);
        if ('roughness' in material) material.roughness = clamp(fabricRoughness, 0.35, 1);
        configureOpaque(material);
      }
    }
  }
  for (const object of namedRoots(root, 'RendererC_GoldenDress')) {
    for (const material of materialsUnder(object)) {
      if (material.color) {
        const color = material.name.includes('Accent')
          ? trimColor
          : material.name.includes('Secondary') ? secondaryColor : dressColor;
        material.color.set(color);
      }
      if ('roughness' in material) material.roughness = clamp(fabricRoughness, 0.45, 1);
      configureOpaque(material);
    }
  }
  if (recipe.cohort === 'women' || root.getObjectByName('RendererC_VictorianDress')) {
    applyRendererCWomenWardrobeSurface(root, {
      ...values,
      dressColor,
      trimColor,
      clothingWrinkles: Number(presentation.clothingWrinkles) || 0,
    });
    const outfit = presentation.outfitId;
    const productionDress = outfit ? outfit === 'fitted-dress' : (values.womenGarmentMode || 'production-dress') === 'production-dress';
    setRendererCWomenWardrobeVisible(root, productionDress);
  }
  if (recipe.cohort === 'men') {
    applyRendererCMenswearSurface(root, {
      ...values,
      clothingWrinkles: Number(presentation.clothingWrinkles) || 0,
    });
  }
  setAppearance(root, 'RendererC_Shoes', { color: '#211713', roughness: 0.82 });
}

export function applyRendererCWardrobe(root, recipe) {
  const outfitId = recipe.presentation?.outfitId;
  if (recipe.cohort === 'women') {
    const fittedDress = outfitId === 'fitted-dress';
    const goldenDress = outfitId === 'golden-dress';
    const seated = ['clinic-idle', 'sitting-talking', 'sitting-distressed'].includes(recipe.animation.body);
    setNamedVisible(root, 'RendererC_BaseGarment', !goldenDress);
    setNamedVisible(root, 'RendererC_VictorianDress', fittedDress && !seated);
    setNamedVisible(root, 'RendererC_VictorianDetails', false);
    setNamedVisible(root, 'RendererC_VictorianDressFitSource', fittedDress && seated);
    setNamedVisible(root, 'RendererC_GoldenDressBodice', goldenDress);
    setNamedVisible(root, 'RendererC_GoldenDressSkirt', goldenDress && !seated);
    setNamedVisible(root, 'RendererC_GoldenDressSeatedSkirt', goldenDress && seated);
    setNamedVisible(root, 'RendererC_GoldenDressDetails', goldenDress);
    morphWeight(root, 'rc_seated_lap', goldenDress && seated ? 1 : 0);
    setNamedVisible(root, 'RendererC_Shoes', !fittedDress && !goldenDress);
    setRendererCWomenWardrobeVisible(root, fittedDress);
    return goldenDress ? 'golden-dress' : fittedDress ? 'fitted-dress' : 'carrier-only';
  }

  // The elite morning suit failed visual review; it stays reachable by its
  // explicit lab ids only, never as the fallback.
  const selected = outfitId === 'working-clothes'
    ? 'working-clothes'
    : outfitId === 'victorian-carrier'
      ? 'victorian-carrier'
      : outfitId === 'authored-waistcoat'
        ? 'authored-waistcoat'
        : ['mens-formal-suit', 'mens-mourning-suit'].includes(outfitId)
          ? 'elite-morning-suit'
          : 'sack-suit';
  setNamedVisible(root, 'RendererC_BaseGarment', selected === 'sack-suit');
  setNamedVisible(root, 'RendererC_WorkGarment', selected === 'working-clothes');
  setNamedVisible(root, 'RendererC_VictorianGarment', selected === 'victorian-carrier');
  setNamedVisible(root, 'RendererC_EliteMorningSuit', selected === 'elite-morning-suit');
  root.traverse((object) => {
    if (object.name.startsWith('RendererC_AuthoredVictorianWaistcoat_')) object.visible = selected === 'authored-waistcoat';
  });
  return selected;
}

export function applyRendererCRecipe(root, manifest, recipe) {
  const anchorIndex = clamp(recipe.anchor?.index || 0, 0, Math.max(0, (manifest?.anchors?.length || 0) - 1));
  const values = { ...recipe.values, rendererCAnchor: anchorIndex };
  applyIdentity(root, manifest, values, collectVariants(root), -1, true);
  applyRendererCWardrobe(root, recipe);
  applyRendererCAppearance(root, recipe);
  root.updateMatrixWorld(true);
}
