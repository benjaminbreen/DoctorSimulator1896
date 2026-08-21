import * as THREE from 'three';
import { sampleTorsoFit } from './costume.js';

// Provisional art-direction palettes. Historical labels and final combinations
// remain subject to the project's research review.
export const RENDERER_C_MENSWEAR_PALETTES = Object.freeze({
  'work-earth': Object.freeze({
    label: 'Work · earth', coat: '#554535', trousers: '#463b31', waistcoat: '#665442', shirt: '#c8bca4', neckwear: '#50352c', hardware: '#78664b', shoes: '#241a15', roughness: 0.94,
  }),
  'work-indigo': Object.freeze({
    label: 'Work · indigo', coat: '#39464b', trousers: '#344047', waistcoat: '#4b4a40', shirt: '#c5baa4', neckwear: '#5b3d32', hardware: '#78694e', shoes: '#211a16', roughness: 0.93,
  }),
  'trade-charcoal': Object.freeze({
    label: 'Tradesman · charcoal', coat: '#343536', trousers: '#303133', waistcoat: '#4b4840', shirt: '#d3cbbd', neckwear: '#5a3934', hardware: '#8b7650', shoes: '#211916', roughness: 0.88,
  }),
  'trade-brown': Object.freeze({
    label: 'Tradesman · brown', coat: '#4a4036', trousers: '#3d3935', waistcoat: '#665743', shirt: '#d0c6b5', neckwear: '#34453b', hardware: '#8d744c', shoes: '#241915', roughness: 0.9,
  }),
  'trade-olive': Object.freeze({
    label: 'Tradesman · olive', coat: '#3f4539', trousers: '#353a35', waistcoat: '#595847', shirt: '#d1c8b7', neckwear: '#583b35', hardware: '#86734f', shoes: '#211a15', roughness: 0.9,
  }),
  'formal-black-grey': Object.freeze({
    label: 'Professional · black and grey', coat: '#202123', trousers: '#464749', waistcoat: '#333235', shirt: '#ddd6c9', neckwear: '#34282a', lining: '#33242b', hardware: '#9a8050', shoes: '#171313', roughness: 0.84,
  }),
  'formal-navy-grey': Object.freeze({
    label: 'Professional · navy and grey', coat: '#252d37', trousers: '#44474a', waistcoat: '#343b43', shirt: '#ddd7cb', neckwear: '#533a36', lining: '#392832', hardware: '#967b4d', shoes: '#171415', roughness: 0.84,
  }),
  'elite-charcoal-dove': Object.freeze({
    label: 'Elite · charcoal and dove', coat: '#1c1e20', trousers: '#4a4948', waistcoat: '#716f68', shirt: '#e1dcd0', neckwear: '#4b2931', lining: '#38262d', hardware: '#9b8354', shoes: '#151214', roughness: 0.82,
  }),
  'elite-midnight-buff': Object.freeze({
    label: 'Elite · midnight and buff', coat: '#1c2530', trousers: '#48494a', waistcoat: '#74654e', shirt: '#ded7c9', neckwear: '#56382f', lining: '#3d2930', hardware: '#967c4e', shoes: '#151315', roughness: 0.82,
  }),
  mourning: Object.freeze({
    label: 'Mourning · black', coat: '#171718', trousers: '#242425', waistcoat: '#202021', shirt: '#d5d0c6', neckwear: '#181719', lining: '#201b1d', hardware: '#554b3d', shoes: '#141212', roughness: 0.9,
  }),
});

export const RENDERER_C_MENSWEAR_GEOMETRY_IDS = new Set([
  'outfitStyle', 'coatLength', 'coatFullness', 'lapelWidth', 'trouserWidth',
  'waistcoatFit', 'workingLayer', 'formalCoatCut', 'collarHeight', 'collarSpread',
]);

export const RENDERER_C_MENSWEAR_MATERIAL_IDS = new Set([
  'menswearPalette', 'fabricPattern', 'garmentWear', 'dressColor', 'trimColor', 'fabricRoughness',
]);

const PATTERN_IDS = Object.freeze({ plain: 0, twill: 1, herringbone: 2, pinstripe: 3 });
const world = (bone, out = new THREE.Vector3()) => bone.getWorldPosition(out);

function decorateFabricMaterial(material, patternScale = 1) {
  const uniforms = {
    pattern: { value: 0 },
    scale: { value: patternScale },
    wear: { value: 0 },
  };
  material.userData.menswearUniforms = uniforms;
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, {
      menswearPattern: uniforms.pattern,
      menswearPatternScale: uniforms.scale,
      menswearWear: uniforms.wear,
    });
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vMenswearPosition;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvMenswearPosition = transformed;');
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        '#include <common>\nvarying vec3 vMenswearPosition;\nuniform float menswearPattern;\nuniform float menswearPatternScale;\nuniform float menswearWear;',
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        float fabricMark = 0.0;
        float weaveScale = menswearPatternScale;
        if (menswearPattern > 0.5 && menswearPattern < 1.5) {
          fabricMark = sin((vMenswearPosition.x + vMenswearPosition.y * 0.48) * weaveScale) * 0.45;
        } else if (menswearPattern > 1.5 && menswearPattern < 2.5) {
          float chevron = abs(fract(vMenswearPosition.y * weaveScale * 0.018) - 0.5);
          fabricMark = sin((vMenswearPosition.x + chevron * 0.085) * weaveScale) * 0.52;
        } else if (menswearPattern > 2.5) {
          fabricMark = smoothstep(0.91, 0.98, fract((vMenswearPosition.x + 0.5) * weaveScale * 0.16)) * 1.25 - 0.12;
        }
        float wearNoise = fract(sin(dot(floor(vMenswearPosition * 17.0), vec3(12.9898, 78.233, 37.719))) * 43758.5453) - 0.5;
        diffuseColor.rgb *= 1.0 + fabricMark * 0.055 + wearNoise * menswearWear * 0.075;`,
      );
  };
  material.customProgramCacheKey = () => 'renderer-c-menswear-fabric-v1';
  return material;
}

function fabric(name, color, scale = 140) {
  return decorateFabricMaterial(new THREE.MeshStandardMaterial({
    name, color, roughness: 0.9, metalness: 0, side: THREE.DoubleSide,
  }), scale);
}

function panelGeometry(points) {
  const positions = points.flatMap((point) => point.toArray());
  const indices = [];
  for (let index = 1; index < points.length - 1; index += 1) indices.push(0, index, index + 1);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function ribbonGeometry(start, end, width, right, lift) {
  const half = right.clone().multiplyScalar(width * 0.5);
  const offset = lift.clone();
  return panelGeometry([
    start.clone().sub(half).add(offset),
    end.clone().sub(half).add(offset),
    end.clone().add(half).add(offset),
    start.clone().add(half).add(offset),
  ]);
}

function paletteFor(values) {
  if (values.outfitStyle === 'mens-mourning-suit') return RENDERER_C_MENSWEAR_PALETTES.mourning;
  if (values.menswearPalette === 'custom') {
    const coat = new THREE.Color(values.dressColor || '#343536');
    const accent = new THREE.Color(values.trimColor || '#5a4938');
    const hex = (color) => `#${color.getHexString()}`;
    return {
      coat: hex(coat), trousers: hex(coat.clone().multiplyScalar(0.78)),
      waistcoat: hex(coat.clone().lerp(accent, 0.42)), shirt: '#d3cbbd',
      neckwear: hex(accent), lining: hex(coat.clone().lerp(accent, 0.22)),
      hardware: '#8b7650', shoes: '#211916', roughness: 0.88,
    };
  }
  return RENDERER_C_MENSWEAR_PALETTES[values.menswearPalette]
    || RENDERER_C_MENSWEAR_PALETTES['trade-charcoal'];
}

export function createRendererCMenswear(scene, bones, model) {
  const carrier = model?.getObjectByName?.('RendererC_BaseGarment');
  const workCarrier = model?.getObjectByName?.('RendererC_WorkGarment');
  const victorianCarrier = model?.getObjectByName?.('RendererC_VictorianGarment');
  const eliteCarrier = model?.getObjectByName?.('RendererC_EliteMorningSuit');
  const authoredMeshes = [];
  model?.traverse?.((object) => {
    if (object.isSkinnedMesh && object.name.startsWith('RendererC_AuthoredVictorianWaistcoat_')) {
      authoredMeshes.push(object);
    }
  });
  const eliteMeshes = [];
  eliteCarrier?.traverse?.((object) => {
    if (object.isSkinnedMesh) eliteMeshes.push(object);
  });
  if (!carrier?.isSkinnedMesh || !workCarrier?.isSkinnedMesh) {
    throw new Error('Renderer C menswear needs its tailored and working fitted garment carriers');
  }

  const materials = {
    coat: fabric('RendererC_Menswear_Coat', '#343536', 150),
    trousers: fabric('RendererC_Menswear_Trousers', '#303133', 155),
    waistcoat: fabric('RendererC_Menswear_Waistcoat', '#4b4840', 165),
    shirt: fabric('RendererC_Menswear_Shirt', '#d3cbbd', 185),
    neckwear: fabric('RendererC_Menswear_Neckwear', '#5a3934', 175),
    lining: fabric('RendererC_Menswear_Lining', '#38272d', 170),
    hardware: new THREE.MeshStandardMaterial({ name: 'RendererC_Menswear_Hardware', color: '#8b7650', roughness: 0.58, metalness: 0.16 }),
    hidden: new THREE.MeshBasicMaterial({ name: 'RendererC_Menswear_Hidden', visible: false }),
  };

  const shoeMaterials = [];
  model?.traverse((object) => {
    if (!object.isMesh || !object.name.includes('RendererC_Shoes')) return;
    const list = Array.isArray(object.material) ? object.material : [object.material];
    shoeMaterials.push(...list);
  });
  let pieces = [];
  const eliteOriginal = eliteCarrier ? {
    visible: eliteCarrier.visible,
    meshes: eliteMeshes.map((mesh) => ({
      mesh,
      material: mesh.material,
      morphs: mesh.morphTargetInfluences?.slice() || [],
    })),
  } : null;
  const authoredOriginal = authoredMeshes.map((mesh) => ({ mesh, visible: mesh.visible }));

  function garmentComponents(mesh, role) {
    const geometry = mesh.geometry;
    const positions = geometry.attributes.position;
    const index = geometry.index;
    if (role === 'working' && mesh.isSkinnedMesh
      && geometry.attributes.skinIndex && geometry.attributes.skinWeight) {
      const skinIndex = geometry.attributes.skinIndex;
      const skinWeight = geometry.attributes.skinWeight;
      const regions = new Map([
        ['shirt', { indices: [], vertices: new Set(), kind: 'shirt' }],
        ['sleeve', { indices: [], vertices: new Set(), kind: 'sleeve' }],
        ['trousers', { indices: [], vertices: new Set(), kind: 'trousers' }],
      ]);
      const regionForBone = (bone) => {
        const name = bone?.name?.toLowerCase().replaceAll(/[^a-z0-9]/g, '') || '';
        if (['leftupleg', 'rightupleg', 'leftleg', 'rightleg', 'leftfoot', 'rightfoot']
          .some((part) => name.includes(part))) return 'trousers';
        if (['leftshoulder', 'rightshoulder', 'leftarm', 'rightarm', 'leftforearm', 'rightforearm', 'lefthand', 'righthand']
          .some((part) => name.includes(part))) return 'sleeve';
        return 'shirt';
      };
      for (let offset = 0; offset < index.count; offset += 3) {
        const vertices = [index.getX(offset), index.getX(offset + 1), index.getX(offset + 2)];
        const scores = { shirt: 0, sleeve: 0, trousers: 0 };
        for (const vertex of vertices) {
          for (let influence = 0; influence < 4; influence += 1) {
            const bone = mesh.skeleton.bones[skinIndex.getComponent(vertex, influence)];
            scores[regionForBone(bone)] += skinWeight.getComponent(vertex, influence);
          }
        }
        const kind = Object.keys(scores).sort((left, right) => scores[right] - scores[left])[0];
        regions.get(kind).indices.push(...vertices);
        vertices.forEach((vertex) => regions.get(kind).vertices.add(vertex));
      }
      const components = [...regions.values()].filter((component) => component.indices.length);
      geometry.clearGroups();
      const reordered = [];
      for (let componentIndex = 0; componentIndex < components.length; componentIndex += 1) {
        const component = components[componentIndex];
        const start = reordered.length;
        reordered.push(...component.indices);
        geometry.addGroup(start, component.indices.length, componentIndex);
      }
      geometry.setIndex(reordered);
      return components;
    }
    const parents = Int32Array.from({ length: positions.count }, (_, vertex) => vertex);
    const find = (vertex) => {
      let root = vertex;
      while (parents[root] !== root) root = parents[root];
      while (parents[vertex] !== vertex) {
        const next = parents[vertex];
        parents[vertex] = root;
        vertex = next;
      }
      return root;
    };
    const unite = (left, right) => {
      const a = find(left); const b = find(right);
      if (a !== b) parents[b] = a;
    };
    for (let offset = 0; offset < index.count; offset += 3) {
      const a = index.getX(offset); const b = index.getX(offset + 1); const c = index.getX(offset + 2);
      unite(a, b); unite(a, c);
    }
    const byRoot = new Map();
    for (let offset = 0; offset < index.count; offset += 3) {
      const ids = [index.getX(offset), index.getX(offset + 1), index.getX(offset + 2)];
      const root = find(ids[0]);
      if (!byRoot.has(root)) byRoot.set(root, { indices: [], vertices: new Set() });
      byRoot.get(root).indices.push(...ids);
      ids.forEach((vertex) => byRoot.get(root).vertices.add(vertex));
    }
    const components = [...byRoot.values()].map((component) => {
      const box = new THREE.Box3();
      const point = new THREE.Vector3();
      for (const vertex of component.vertices) box.expandByPoint(point.fromBufferAttribute(positions, vertex));
      const center = box.getCenter(new THREE.Vector3());
      const count = component.vertices.size;
      let kind;
      if (role === 'working') {
        if (box.max.y < 0.32) kind = 'trousers';
        else if (box.min.y > 0.82) kind = 'collar';
        else if (Math.abs(center.x) > 0.30) kind = 'sleeve';
        else kind = 'shirt';
      } else {
        kind = 'coat';
        if (count <= 48) kind = 'hardware';
        else if (box.max.y < 0.34) kind = 'trousers';
        else if (Math.abs(center.x) < 0.08 && box.max.x - box.min.x < 0.17 && box.min.y > 0.48) kind = 'neckwear';
        else if (Math.abs(center.x) > 0.22 && count < 210) kind = 'shirt';
        else if (box.min.y > 0.93) kind = 'shirt';
        else if (Math.abs(center.x) < 0.13 && count > 300 && box.max.x - box.min.x < 0.25) kind = 'waistcoat';
        else if (Math.abs(center.x) > 0.21) kind = 'sleeve';
      }
      return { ...component, box, center, kind };
    }).sort((left, right) => right.vertices.size - left.vertices.size);

    const reordered = [];
    geometry.clearGroups();
    for (let componentIndex = 0; componentIndex < components.length; componentIndex += 1) {
      const component = components[componentIndex];
      const start = reordered.length;
      reordered.push(...component.indices);
      geometry.addGroup(start, component.indices.length, componentIndex);
    }
    geometry.setIndex(reordered);
    return components;
  }

  function prepareCarrier(mesh, role) {
    const position = mesh.geometry.attributes.position;
    const state = {
      mesh,
      role,
      originalMaterial: mesh.material,
      originalIndex: mesh.geometry.index.clone(),
      originalGroups: mesh.geometry.groups.map((group) => ({ ...group })),
      originalPositions: new Float32Array(position.count * 3),
      originalVisible: mesh.visible,
    };
    for (let vertex = 0; vertex < position.count; vertex += 1) {
      state.originalPositions[vertex * 3] = position.getX(vertex);
      state.originalPositions[vertex * 3 + 1] = position.getY(vertex);
      state.originalPositions[vertex * 3 + 2] = position.getZ(vertex);
    }
    state.components = garmentComponents(mesh, role);
    state.vertexKinds = Array.from({ length: position.count }, () => new Set());
    for (const component of state.components) {
      for (const vertex of component.vertices) state.vertexKinds[vertex].add(component.kind);
    }
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    return state;
  }

  const tailoredState = prepareCarrier(carrier, 'tailored');
  const workingState = prepareCarrier(workCarrier, 'working');
  const victorianState = victorianCarrier?.isSkinnedMesh
    ? prepareCarrier(victorianCarrier, 'victorian')
    : null;
  const carrierStates = [tailoredState, workingState, victorianState].filter(Boolean);
  const components = tailoredState.components;

  function add(name, geometry, material, bone) {
    if (!geometry) return null;
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = name;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    scene.add(mesh);
    if (bone) bone.attach(mesh);
    pieces.push({ mesh, bone });
    return mesh;
  }

  function clear() {
    for (const { mesh } of pieces) {
      mesh.parent?.remove(mesh);
      mesh.geometry.dispose();
    }
    pieces = [];
  }

  function materialFor(component, values, role) {
    if (component.kind === 'trousers') return materials.trousers;
    if (component.kind === 'hardware') return materials.hardware;
    if (role === 'working' && values.outfitStyle === 'mens-authored-victorian-set') {
      // Keep the fitted MPFB shirt continuous beneath the authored waistcoat.
      // Hiding torso triangles by their dominant bone produced torn armholes
      // wherever shoulder weights blended into the chest.
      return materials.shirt;
    }
    if (component.kind === 'neckwear') {
      return values.outfitStyle === 'mens-victorian-sample' ? materials.hidden : materials.neckwear;
    }
    if (role === 'working') {
      if (component.kind === 'shirt' && values.workingLayer === 'waistcoat') return materials.waistcoat;
      return materials.shirt;
    }
    if (component.kind === 'shirt' || component.kind === 'collar') return materials.shirt;
    if (component.kind === 'waistcoat') {
      if (values.outfitStyle === 'mens-working-clothes' && values.workingLayer === 'shirt-braces') return materials.shirt;
      return materials.waistcoat;
    }
    if (values.outfitStyle === 'mens-working-clothes' && values.workingLayer !== 'work-jacket') return materials.shirt;
    return materials.coat;
  }

  function applyCarrierSilhouette(state, values) {
    const { mesh, role, originalPositions, vertexKinds } = state;
    const position = mesh.geometry.attributes.position;
    const victorianSample = values.outfitStyle === 'mens-victorian-sample';
    const tailored = role !== 'working';
    const formal = ['mens-formal-suit', 'mens-mourning-suit'].includes(values.outfitStyle);
    const working = values.outfitStyle === 'mens-working-clothes';
    const frock = (values.formalCoatCut || 'morning-cutaway') === 'frock-coat';
    const length = THREE.MathUtils.clamp(values.coatLength ?? 1, 0.82, 1.18);
    const fullness = THREE.MathUtils.clamp(values.coatFullness ?? 1, 0.82, 1.22);
    const trouserWidth = THREE.MathUtils.clamp(values.trouserWidth ?? 1, 0.82, 1.22);
    const waistcoatFit = THREE.MathUtils.clamp(values.waistcoatFit ?? 1, 0.88, 1.14);
    const lapelWidth = THREE.MathUtils.clamp(values.lapelWidth ?? 1, 0.72, 1.35);
    const collarHeight = THREE.MathUtils.clamp(values.collarHeight ?? 0.82, 0.25, 1.4);
    const collarSpread = THREE.MathUtils.clamp(values.collarSpread ?? 1, 0.65, 1.45);
    for (let vertex = 0; vertex < position.count; vertex += 1) {
      const offset = vertex * 3;
      let x = originalPositions[offset];
      let y = originalPositions[offset + 1];
      let z = originalPositions[offset + 2];
      const kinds = vertexKinds[vertex];
      if (tailored && (kinds.has('coat') || kinds.has('sleeve'))) {
        const fullnessAmount = (fullness - 1) * (kinds.has('sleeve') ? 0.045 : 0.09);
        x *= 1 + fullnessAmount;
        z *= 1 + fullnessAmount * 0.72;
      }
      if (tailored && kinds.has('coat')) {
        if (z > -0.02 && y > 0.44) x *= 1 + (lapelWidth - 1) * 0.16;
        const hem = THREE.MathUtils.clamp((0.47 - y) / 0.40, 0, 1);
        if (formal) {
          // The back and side hem form a continuous morning or frock coat from
          // the already weight-painted jacket rather than a rigid added skirt.
          const cutaway = frock ? 1 : THREE.MathUtils.clamp((0.16 - z) / 0.34, 0.08, 1);
          y -= hem * cutaway * 0.30 * length;
          x *= 1 + hem * 0.035 * fullness;
        } else if (!working || values.workingLayer === 'work-jacket') {
          y -= hem * (victorianSample ? 0.10 : 0.045) * length;
        }
      }
      if (tailored && kinds.has('waistcoat')) {
        x *= waistcoatFit;
        z *= 1 + (waistcoatFit - 1) * 0.65;
      }
      if (victorianSample && kinds.has('neckwear')) {
        x *= 0.58;
        y = 0.93 + (y - 0.93) * 0.55;
      }
      if ((kinds.has('shirt') || kinds.has('collar')) && y > 0.82 && Math.abs(x) < 0.20) {
        x *= collarSpread;
        const collarBase = role === 'working' ? 0.83 : 0.94;
        y = collarBase + (y - collarBase) * (0.72 + collarHeight * 0.34);
      }
      if (kinds.has('trousers')) {
        const legCenter = x < 0 ? -0.165 : 0.165;
        x = legCenter + (x - legCenter) * trouserWidth;
        z *= 1 + (trouserWidth - 1) * 0.72;
      }
      position.setXYZ(vertex, x, y, z);
    }
    position.needsUpdate = true;
    mesh.geometry.computeVertexNormals();
    mesh.geometry.computeBoundingSphere();
    if (role === 'victorian') {
      // The imported suit ships its own textures; the flat pattern materials
      // are what made it read as clay. Keep its authored surfaces.
      mesh.geometry.setIndex(state.originalIndex);
      mesh.geometry.groups = state.originalGroups.map((group) => ({ ...group }));
      mesh.material = state.originalMaterial;
    } else {
      mesh.material = state.components.map((component) => materialFor(component, values, role));
    }
  }

  function updateMaterials(values) {
    const palette = paletteFor(values);
    const colors = {
      coat: palette.coat,
      trousers: palette.trousers,
      waistcoat: palette.waistcoat,
      shirt: palette.shirt,
      neckwear: palette.neckwear,
      lining: palette.lining || palette.neckwear,
      hardware: palette.hardware,
    };
    const roughness = THREE.MathUtils.clamp(values.fabricRoughness ?? palette.roughness, 0.45, 1);
    const pattern = PATTERN_IDS[values.fabricPattern] ?? PATTERN_IDS.plain;
    const wear = THREE.MathUtils.clamp(values.garmentWear ?? 0.12, 0, 1);
    for (const [key, material] of Object.entries(materials)) {
      if (key === 'hidden') continue;
      material.color.set(colors[key]);
      if ('roughness' in material) material.roughness = key === 'hardware' ? 0.58 : Math.max(roughness, palette.roughness - 0.08);
      if (material.userData.menswearUniforms) {
        const eliteFormal = ['mens-formal-suit', 'mens-mourning-suit'].includes(values.outfitStyle);
        material.userData.menswearUniforms.pattern.value = key === 'shirt' || key === 'neckwear' || key === 'lining' ? 0
          : eliteFormal && key === 'trousers' ? PATTERN_IDS.pinstripe : pattern;
        material.userData.menswearUniforms.wear.value = key === 'shirt' ? wear * 0.35 : wear;
      }
      material.needsUpdate = true;
    }
    for (const material of shoeMaterials) {
      material.color?.set(palette.shoes);
      if ('roughness' in material) material.roughness = 0.84;
      material.needsUpdate = true;
    }
    for (const state of carrierStates) {
      if (state.role === 'victorian') continue;
      state.mesh.material = state.components.map((component) => materialFor(component, values, state.role));
    }
    const eliteMaterialByName = {
      RendererC_Elite_Coat: materials.coat,
      RendererC_Elite_Trousers: materials.trousers,
      RendererC_Elite_Waistcoat: materials.waistcoat,
      RendererC_Elite_Shirt: materials.shirt,
      RendererC_Elite_Neckwear: materials.neckwear,
      RendererC_Elite_Lining: materials.lining,
      RendererC_Elite_Hardware: materials.hardware,
    };
    for (const mesh of eliteMeshes) {
      mesh.material = eliteMaterialByName[mesh.userData.eliteMaterialName || mesh.material?.name]
        || mesh.material;
    }
  }

  function setEliteMorph(name, value) {
    const weight = THREE.MathUtils.clamp(value, -1, 1);
    for (const mesh of eliteMeshes) {
      const index = mesh.morphTargetDictionary?.[name];
      if (index !== undefined) mesh.morphTargetInfluences[index] = weight;
    }
  }

  function updateEliteMorphs(values) {
    if (!eliteCarrier) return;
    setEliteMorph('elite_frock_coat', values.formalCoatCut === 'frock-coat' ? 1 : 0);
    setEliteMorph('elite_coat_length', ((values.coatLength ?? 1) - 1) / 0.18);
    setEliteMorph('elite_coat_fullness', ((values.coatFullness ?? 1) - 1) / 0.22);
    setEliteMorph('elite_lapel_width', ((values.lapelWidth ?? 1) - 1) / 0.35);
    setEliteMorph('elite_trouser_width', ((values.trouserWidth ?? 1) - 1) / 0.22);
    setEliteMorph('elite_waistcoat_fit', ((values.waistcoatFit ?? 1) - 1) / 0.14);
    setEliteMorph('elite_collar_height', ((values.collarHeight ?? 0.92) - 0.92) / 0.48);
    setEliteMorph('elite_collar_spread', ((values.collarSpread ?? 0.96) - 0.96) / 0.45);
  }

  function rebuild(values) {
    clear();
    updateMaterials(values);
    applyCarrierSilhouette(tailoredState, values);
    applyCarrierSilhouette(workingState, values);
    if (victorianState) applyCarrierSilhouette(victorianState, values);
    if (!bones.pelvis || !bones.head) return;

    const outfit = values.outfitStyle || 'mens-sack-suit';
    const working = outfit === 'mens-working-clothes';
    const eliteFormal = ['mens-formal-suit', 'mens-mourning-suit'].includes(outfit) && eliteMeshes.length > 0;
    const useVictorianCarrier = outfit === 'mens-victorian-sample' && Boolean(victorianCarrier);
    const useAuthoredVictorian = outfit === 'mens-authored-victorian-set' && authoredMeshes.length > 0;
    const workingLayer = values.workingLayer || 'shirt-braces';
    const useWorkingCarrier = (working && workingLayer !== 'work-jacket') || useAuthoredVictorian;
    carrier.visible = !useWorkingCarrier && !useVictorianCarrier && !eliteFormal && !useAuthoredVictorian;
    workCarrier.visible = useWorkingCarrier;
    if (victorianCarrier) victorianCarrier.visible = useVictorianCarrier;
    if (eliteCarrier) eliteCarrier.visible = eliteFormal;
    for (const mesh of authoredMeshes) mesh.visible = useAuthoredVictorian;
    updateEliteMorphs(values);

    const pelvis = world(bones.pelvis);
    const head = world(bones.head);
    const neck = bones.neck ? world(bones.neck) : head.clone().add(new THREE.Vector3(0, -0.09, 0));
    const kneeL = bones.calfL ? world(bones.calfL) : null;
    const kneeR = bones.calfR ? world(bones.calfR) : null;
    const knee = kneeL && kneeR
      ? kneeL.clone().add(kneeR).multiplyScalar(0.5)
      : pelvis.clone().add(new THREE.Vector3(0, -0.35, 0.28));
    const forward = knee.clone().sub(pelvis).setY(0);
    if (forward.lengthSq() < 1e-6) forward.set(0, 0, 1);
    forward.normalize();
    const up = new THREE.Vector3(0, 1, 0);
    const right = new THREE.Vector3().crossVectors(up, forward).normalize();
    const chest = bones.spine03 ? world(bones.spine03) : pelvis.clone().lerp(neck, 0.72);
    const shoulderL = bones.upperarmL ? world(bones.upperarmL) : chest.clone().addScaledVector(right, 0.19);
    const shoulderR = bones.upperarmR ? world(bones.upperarmR) : chest.clone().addScaledVector(right, -0.19);
    const shoulderCenter = shoulderL.clone().add(shoulderR).multiplyScalar(0.5);
    const shoulderHalf = Math.max(0.17, shoulderL.distanceTo(shoulderR) * 0.5 + 0.025);
    const torsoTop = shoulderCenter.clone().lerp(neck, 0.18);
    const fit = sampleTorsoFit(model, torsoTop, pelvis, right, forward, shoulderHalf, 13);
    const fitAt = (t) => fit?.[Math.round(THREE.MathUtils.clamp(t, 0, 1) * 12)] || { rx: 0.19, rz: 0.13, offset: 0 };
    const frontAt = (t, side = 0, clearance = 0.009) => {
      const row = fitAt(t);
      return torsoTop.clone().lerp(pelvis, t)
        .addScaledVector(forward, row.offset + row.rz + clearance)
        .addScaledVector(right, side);
    };
    if (outfit === 'mens-victorian-sample') {
      const throat = frontAt(0.035, 0, 0.022);
      const knot = frontAt(0.085, 0, 0.025);
      const lower = frontAt(0.29, 0, 0.023);
      add('RendererC_Menswear_Cravat', panelGeometry([
        throat.clone().addScaledVector(right, -0.036),
        throat.clone().addScaledVector(right, 0.036),
        knot.clone().addScaledVector(right, 0.030),
        lower.clone().addScaledVector(right, 0.017),
        lower.clone().addScaledVector(right, -0.017),
        knot.clone().addScaledVector(right, -0.030),
      ]), materials.neckwear, bones.spine03 || bones.neck);
    }
    // Braces are the only separate cloth layer in the working silhouette. They
    // overlap a continuously skinned shirt carrier and never bridge a joint.
    if (working && workingLayer === 'shirt-braces') {
      for (const side of [-1, 1]) {
        const start = frontAt(0.13, side * 0.090, 0.020);
        const end = frontAt(0.93, side * 0.066, 0.023);
        add(`RendererC_Menswear_Brace_${side < 0 ? 'L' : 'R'}`,
          ribbonGeometry(start, end, 0.025, right, forward.clone().multiplyScalar(0.004)),
          materials.waistcoat, bones.spine02 || bones.pelvis);
      }
    }

  }

  function dispose() {
    clear();
    for (const state of carrierStates) {
      const { mesh, originalPositions, originalIndex, originalGroups } = state;
      const position = mesh.geometry.attributes.position;
      for (let vertex = 0; vertex < position.count; vertex += 1) {
        position.setXYZ(vertex, originalPositions[vertex * 3], originalPositions[vertex * 3 + 1], originalPositions[vertex * 3 + 2]);
      }
      position.needsUpdate = true;
      mesh.geometry.setIndex(originalIndex);
      mesh.geometry.clearGroups();
      for (const group of originalGroups) mesh.geometry.addGroup(group.start, group.count, group.materialIndex);
      mesh.material = state.originalMaterial;
      mesh.visible = state.originalVisible;
    }
    if (eliteCarrier && eliteOriginal) {
      eliteCarrier.visible = eliteOriginal.visible;
      for (const original of eliteOriginal.meshes) {
        original.mesh.material = original.material;
        original.mesh.morphTargetInfluences?.forEach((_value, index) => {
          original.mesh.morphTargetInfluences[index] = original.morphs[index] || 0;
        });
      }
    }
    for (const original of authoredOriginal) original.mesh.visible = original.visible;
    for (const material of Object.values(materials)) material.dispose();
  }

  return {
    rebuild,
    dispose,
    materials,
    updateMaterials,
    invalidateFit() {},
    carrier,
    workCarrier,
    victorianCarrier,
    eliteCarrier,
    authoredMeshes,
    components,
    pieces: () => [
      ...[carrier, workCarrier, victorianCarrier].filter((mesh) => mesh?.visible).map((mesh) => ({ mesh, bone: null })),
      ...(eliteCarrier?.visible ? eliteMeshes.map((mesh) => ({ mesh, bone: null })) : []),
      ...authoredMeshes.filter((mesh) => mesh.visible).map((mesh) => ({ mesh, bone: null })),
      ...pieces,
    ],
    stats: () => ({
      pieces: 1 + pieces.length,
      components: tailoredState.components.length + workingState.components.length,
      triangles: [
        ...[carrier, workCarrier, victorianCarrier].filter((mesh) => mesh?.visible),
        ...(eliteCarrier?.visible ? eliteMeshes : []),
        ...authoredMeshes.filter((mesh) => mesh.visible),
      ].reduce(
        (sum, mesh) => sum + (mesh.geometry.index?.count || mesh.geometry.attributes.position.count) / 3,
        0,
      )
        + pieces.reduce((sum, { mesh }) => sum + (mesh.geometry.index?.count || mesh.geometry.attributes.position.count) / 3, 0),
    }),
  };
}
