import * as THREE from 'three';

const nextFrame = () => new Promise((resolve) => requestAnimationFrame(resolve));
const shadowSides = [THREE.BackSide, THREE.FrontSide, THREE.DoubleSide];
const depthVariants = new WeakMap();

function configureDepth(depth, material) {
  depth.map = material.map;
  depth.alphaMap = material.alphaMap;
  depth.alphaTest = material.alphaToCoverage ? .5 : material.alphaTest;
  depth.side = material.shadowSide ?? shadowSides[material.side];
  depth.displacementMap = material.displacementMap;
  depth.displacementScale = material.displacementScale;
  depth.displacementBias = material.displacementBias;
}

function depthVariantKey(material) {
  return [material.shadowSide ?? shadowSides[material.side], Boolean(material.map),
    Boolean(material.alphaMap), material.alphaTest > 0 || material.alphaToCoverage,
    Boolean(material.displacementMap)].join(':');
}

function additionalDepth(base, material) {
  let variants = depthVariants.get(base);
  if (!variants) depthVariants.set(base, variants = new Map());
  let depth = variants.get(material);
  if (!depth) {
    depth = base.clone();
    depth.onBeforeCompile = base.onBeforeCompile;
    depth.customProgramCacheKey = base.customProgramCacheKey;
    material.addEventListener('dispose', () => depth.dispose());
    variants.set(material, depth);
  }
  configureDepth(depth, material);
  return depth;
}

// Ignore hidden wardrobe variants, but include the stage being prepared.
export function visitPreparationObjects(root, visit) {
  visit(root);
  for (const child of root.children) {
    if (child.visible || child.userData.preparing) visitPreparationObjects(child, visit);
  }
}

// Compile against the final lights and render target, then upload offscreen.
// compileAsync alone leaves textures, vertex buffers and shadow variants cold.
export async function prepareStage(renderer, root, camera, scene, cancelled) {
  const pending = [];
  root.traverse(object => { if (object.userData.preparation) pending.push(object.userData.preparation); });
  await Promise.all(pending);
  if (cancelled()) return;
  root.updateWorldMatrix(true, true);
  const target = new THREE.WebGLRenderTarget(16, 16);
  const warmScene = new THREE.Scene();
  warmScene.environment = scene.environment;
  warmScene.environmentIntensity = scene.environmentIntensity;
  warmScene.fog = scene.fog;
  const lights = [];
  scene.traverseVisible((object) => { if (object.isLight) lights.push(object); });
  const proxies = [];
  const depthMaterials = new Map();
  const materials = new Set();
  visitPreparationObjects(root, (object) => {
    if (!object.isMesh && !object.isPoints && !object.isLine && !object.isSprite) return;
    const sourceMaterials = [].concat(object.material ?? []);
    for (const material of sourceMaterials) materials.add(material);
    const geometries = object.userData.warmGeometries ?? [object.geometry];
    for (const geometry of new Set(geometries)) {
      const proxy = object.clone(false);
      proxy.geometry = geometry;
      proxy.visible = true;
      proxy.frustumCulled = false;
      proxy.castShadow = false;
      proxy.matrixAutoUpdate = false;
      proxy.matrix.copy(object.matrixWorld);
      if (object.isInstancedMesh) {
        proxy.instanceMatrix = object.instanceMatrix;
        proxy.instanceColor = object.instanceColor;
        proxy.count = Math.min(1, object.count);
      }
      proxies.push({ proxy, object });
    }
    if (!object.isMesh) return;
    // Keep the prepared depth material on the live mesh so its compiled
    // program survives preparation. ShadowMap supplies its per-draw maps.
    if (!object.customDepthMaterial) {
      let depth = depthMaterials.get(object.material);
      if (!depth) {
        depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
        depthMaterials.set(object.material, depth);
        sourceMaterials[0]?.addEventListener('dispose', () => depth.dispose());
      }
      object.customDepthMaterial = depth;
    }
  });
  const compileRoot = new THREE.Group();
  for (const { proxy } of proxies) compileRoot.add(proxy);
  const compile = async () => {
    const previous = renderer.getRenderTarget();
    renderer.setRenderTarget(target);
    let pending;
    try { pending = renderer.compileAsync(compileRoot, camera, scene); }
    finally { renderer.setRenderTarget(previous); }
    await pending;
  };
  try {
    await compile();
    if (renderer.toneMapping !== THREE.NoToneMapping) await renderer.compileAsync(compileRoot, camera, scene);
    if (cancelled()) return;
    // Point-light distance shadows are left to interiors. Outdoor shadows
    // use these depth variants, including wind and skinned figures.
    const extraDepthProxies = [];
    for (const { proxy, object } of proxies) {
      if (!object.customDepthMaterial) continue;
      const sourceMaterials = [].concat(object.material);
      const depth = object.customDepthMaterial;
      configureDepth(depth, sourceMaterials[0]);
      proxy.material = depth;
      // ShadowMap selects a material per geometry group. A later group can
      // need different sidedness or alpha maps than the first one.
      const variants = new Set([depthVariantKey(sourceMaterials[0])]);
      for (const material of sourceMaterials.slice(1)) {
        const key = depthVariantKey(material);
        if (variants.has(key)) continue;
        variants.add(key);
        const extra = proxy.clone(false);
        if (proxy.isInstancedMesh) {
          extra.instanceMatrix = proxy.instanceMatrix;
          extra.instanceColor = proxy.instanceColor;
        }
        extra.material = additionalDepth(depth, material);
        compileRoot.add(extra);
        extraDepthProxies.push({ proxy: extra });
      }
    }
    await compile();
    if (cancelled()) return;
    for (const { proxy, object } of proxies) proxy.material = object.material;
    const textures = new Set();
    for (const material of materials) {
      for (const value of Object.values(material)) if (value?.isTexture) textures.add(value);
      const uniforms = renderer.properties.get(material).uniforms ?? material.uniforms ?? {};
      for (const uniform of Object.values(uniforms)) if (uniform?.value?.isTexture) textures.add(uniform.value);
    }
    for (const texture of textures) {
      if (cancelled()) return;
      if (!texture.image || texture.isRenderTargetTexture || renderer.properties.get(texture).__version === texture.version) continue;
      await nextFrame();
      if (!cancelled()) renderer.initTexture(texture);
    }
    const uploads = [...proxies, ...extraDepthProxies];
    for (let at = 0; at < uploads.length; at += 32) {
      await nextFrame();
      if (cancelled()) return;
      warmScene.children = [...lights, ...uploads.slice(at, at + 32).map(({ proxy }) => proxy)];
      const previousTarget = renderer.getRenderTarget();
      const shadowAuto = renderer.shadowMap.autoUpdate;
      const shadowNeeded = renderer.shadowMap.needsUpdate;
      renderer.shadowMap.autoUpdate = false;
      renderer.shadowMap.needsUpdate = false;
      try {
        renderer.setRenderTarget(target);
        renderer.render(warmScene, camera);
      } finally {
        renderer.setRenderTarget(previousTarget);
        renderer.shadowMap.autoUpdate = shadowAuto;
        renderer.shadowMap.needsUpdate = shadowNeeded;
      }
    }
  } finally {
    warmScene.children = [];
    compileRoot.clear();
    target.dispose();
  }
}
