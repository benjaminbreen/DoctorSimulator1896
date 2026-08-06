import * as THREE from 'three';

const clamp01 = (value) => THREE.MathUtils.clamp(value, 0, 1);
const smoothstep = (minimum, maximum, value) => {
  const x = clamp01((value - minimum) / Math.max(0.00001, maximum - minimum));
  return x * x * (3 - 2 * x);
};
const gaussian = (value, centre, width) => Math.exp(-((value - centre) ** 2) / (2 * width * width));
const triangleHash = (seed, triangle) => {
  const value = Math.sin(seed * 17.173 + triangle * 91.729) * 43758.5453;
  return value - Math.floor(value);
};

function coherentField(x, y, z, seed) {
  const phase = seed * 0.071;
  return (
    Math.sin(x * 27 + phase) * 0.44
    + Math.sin(y * 39 - phase * 0.7) * 0.31
    + Math.sin((x + y + z) * 61 + phase * 1.9) * 0.17
    + Math.sin((x - z) * 113 - phase * 2.3) * 0.08
  );
}

function makeSkinMicroTexture(seed) {
  const size = 128;
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const v = y / size;
      const broad = Math.sin((u * 7.1 + seed * 0.013) * Math.PI * 2)
        * Math.sin((v * 8.7 - seed * 0.009) * Math.PI * 2);
      const pores = Math.sin((u * 41.3 + v * 29.7 + seed * 0.021) * Math.PI * 2);
      const cross = Math.sin((u * 73.9 - v * 67.1 - seed * 0.017) * Math.PI * 2);
      const value = THREE.MathUtils.clamp(Math.round(205 + broad * 11 + pores * 6 + cross * 3), 150, 240);
      const offset = (y * size + x) * 4;
      data[offset] = value;
      data[offset + 1] = value;
      data[offset + 2] = value;
      data[offset + 3] = 255;
    }
  }
  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  texture.name = 'B2_SkinMicrostructure';
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(4.5, 7.5);
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  return texture;
}

function skinMetrics(geometry) {
  geometry.computeBoundingBox();
  const box = geometry.boundingBox;
  const height = box.max.y - box.min.y;
  const headMinY = box.max.y - height * 0.175;
  const position = geometry.attributes.position;
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (let index = 0; index < position.count; index++) {
    if (position.getY(index) < headMinY) continue;
    minX = Math.min(minX, position.getX(index));
    maxX = Math.max(maxX, position.getX(index));
    minZ = Math.min(minZ, position.getZ(index));
    maxZ = Math.max(maxZ, position.getZ(index));
  }
  return {
    minY: box.min.y,
    maxY: box.max.y,
    height,
    headMinY,
    headHeight: box.max.y - headMinY,
    headCentreX: (minX + maxX) / 2,
    headHalfWidth: Math.max(0.001, (maxX - minX) / 2),
    headMinZ: minZ,
    headDepth: Math.max(0.001, maxZ - minZ),
  };
}

function prepareFacetedMesh(mesh, role, seed) {
  if (mesh.userData.stylizedPrepared) return;
  const source = mesh.geometry;
  const working = source.clone();
  if (!working.attributes.normal) working.computeVertexNormals();
  const geometry = working.index ? working.toNonIndexed() : working.clone();
  working.dispose();
  geometry.userData.stylizedSmoothNormals = new Float32Array(geometry.attributes.normal.array);
  geometry.computeVertexNormals();
  geometry.userData.stylizedFlatNormals = new Float32Array(geometry.attributes.normal.array);
  geometry.userData.stylizedSeed = seed;
  geometry.userData.skinMetrics = role === 'skin' ? skinMetrics(geometry) : null;
  mesh.geometry = geometry;
  source.dispose();
  mesh.userData.stylizedPrepared = true;
  mesh.userData.stylizedRole = role;

  let material;
  if (role === 'skin') {
    const microTexture = makeSkinMicroTexture(seed);
    material = new THREE.MeshPhysicalMaterial({
      name: 'B2_AnatomicalSkin',
      color: '#ffffff',
      roughness: 0.82,
      metalness: 0,
      vertexColors: true,
      flatShading: false,
      side: THREE.FrontSide,
      sheen: 0.12,
      sheenColor: new THREE.Color('#8f6253'),
      sheenRoughness: 0.92,
      specularIntensity: 0.32,
      bumpMap: microTexture,
      bumpScale: 0.0011,
      roughnessMap: microTexture,
    });
    material.userData.skinMicroTexture = microTexture;
  } else {
    material = new THREE.MeshStandardMaterial({
      name: `Stylized_${role}`,
      color: '#ffffff',
      roughness: 0.9,
      metalness: 0,
      vertexColors: true,
      flatShading: true,
      side: THREE.FrontSide,
    });
  }
  const oldMaterials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  for (const oldMaterial of oldMaterials) oldMaterial?.dispose?.();
  mesh.material = material;
}

function updateNormalBlend(mesh, values) {
  if (mesh.userData.stylizedRole !== 'skin') return;
  const geometry = mesh.geometry;
  const smoothNormals = geometry.userData.stylizedSmoothNormals;
  const flatNormals = geometry.userData.stylizedFlatNormals;
  const normal = geometry.attributes.normal;
  if (!smoothNormals || !flatNormals || !normal) return;
  const blend = clamp01(values.stylizedTriangleBlend ?? 0.36);
  const output = normal.array;
  for (let index = 0; index < output.length; index += 3) {
    let x = THREE.MathUtils.lerp(flatNormals[index], smoothNormals[index], blend);
    let y = THREE.MathUtils.lerp(flatNormals[index + 1], smoothNormals[index + 1], blend);
    let z = THREE.MathUtils.lerp(flatNormals[index + 2], smoothNormals[index + 2], blend);
    const inverseLength = 1 / Math.max(0.00001, Math.hypot(x, y, z));
    x *= inverseLength; y *= inverseLength; z *= inverseLength;
    output[index] = x; output[index + 1] = y; output[index + 2] = z;
  }
  normal.needsUpdate = true;
}

function updatePlaneTones(mesh, values) {
  const geometry = mesh.geometry;
  const position = geometry.attributes.position;
  const normal = geometry.attributes.normal;
  if (!position || !normal) return;
  const colors = geometry.attributes.color?.array || new Float32Array(position.count * 3);
  const contrast = clamp01(values.stylizedPlaneContrast ?? 0.3);
  const detail = clamp01(values.stylizedSkinDetail ?? 0.42);
  const warmth = THREE.MathUtils.clamp(values.stylizedSkinWarmth ?? 0.28, -1, 1);
  const pigment = clamp01(values.stylizedPigmentVariation ?? 0.3);
  const cheekBlush = clamp01(values.stylizedCheekBlush ?? 0.42);
  const noseRedness = clamp01(values.stylizedNoseRedness ?? 0.3);
  const foreheadWarmth = clamp01(values.stylizedForeheadWarmth ?? 0.18);
  const lipTint = clamp01(values.stylizedLipTint ?? 0.52);
  const freckleAmount = clamp01(values.stylizedFreckleAmount ?? 0.08);
  const skinColor = new THREE.Color(values.skinTone ?? '#b98269');
  const lipColor = new THREE.Color(values.stylizedLipColor ?? '#a96260');
  const lipRatio = new THREE.Vector3(
    THREE.MathUtils.clamp(lipColor.r / Math.max(0.03, skinColor.r), 0.35, 1.5),
    THREE.MathUtils.clamp(lipColor.g / Math.max(0.03, skinColor.g), 0.28, 1.3),
    THREE.MathUtils.clamp(lipColor.b / Math.max(0.03, skinColor.b), 0.28, 1.3),
  );
  const role = mesh.userData.stylizedRole;
  const seed = geometry.userData.stylizedSeed || 1;
  const metrics = geometry.userData.skinMetrics;

  for (let vertex = 0; vertex < position.count; vertex += 3) {
    const x = (position.getX(vertex) + position.getX(vertex + 1) + position.getX(vertex + 2)) / 3;
    const y = (position.getY(vertex) + position.getY(vertex + 1) + position.getY(vertex + 2)) / 3;
    const z = (position.getZ(vertex) + position.getZ(vertex + 1) + position.getZ(vertex + 2)) / 3;
    const nx = normal.getX(vertex);
    const ny = normal.getY(vertex);
    const nz = normal.getZ(vertex);
    const facing = nz * 0.58 + ny * 0.16 - Math.abs(nx) * 0.055;
    const field = coherentField(x, y, z, seed);
    const roleScale = role === 'skin' ? 1 : 0.58;
    let tone = 0.965 + contrast * roleScale * (facing * 0.075 + field * 0.024);
    let red = 0;
    let green = 0;
    let blue = 0;
    let lipMask = 0;

    if (role === 'skin' && metrics) {
      const head = smoothstep(metrics.headMinY - metrics.headHeight * 0.08, metrics.headMinY + metrics.headHeight * 0.08, y);
      const faceX = (x - metrics.headCentreX) / metrics.headHalfWidth;
      const faceY = (y - metrics.headMinY) / metrics.headHeight;
      const front = smoothstep(0.38, 0.78, (z - metrics.headMinZ) / metrics.headDepth) * head;
      const cheek = (
        gaussian(faceX, -0.34, 0.22) + gaussian(faceX, 0.34, 0.22)
      ) * gaussian(faceY, 0.43, 0.15) * front;
      const nose = gaussian(faceX, 0, 0.16) * gaussian(faceY, 0.49, 0.19) * front;
      const forehead = gaussian(faceX, 0, 0.58) * gaussian(faceY, 0.79, 0.17) * front;
      const eyeSocket = (
        gaussian(faceX, -0.31, 0.18) + gaussian(faceX, 0.31, 0.18)
      ) * gaussian(faceY, 0.63, 0.10) * front;
      const mouthShadow = gaussian(faceX, 0, 0.34) * gaussian(faceY, 0.28, 0.065) * front;
      const jawShadow = gaussian(faceX, 0, 0.58) * gaussian(faceY, 0.10, 0.12) * front;
      lipMask = gaussian(faceX, 0, 0.36) * gaussian(faceY, 0.405, 0.048) * front;
      const ageVariation = (values.age ?? 0.55) * pigment * field * front;
      const freckle = triangleHash(seed, vertex / 3);
      const freckleThreshold = 0.995 - freckleAmount * 0.07;
      const freckleStrength = freckle > freckleThreshold
        ? smoothstep(freckleThreshold, 1, freckle) * front * (0.05 + freckleAmount * 0.13)
        : 0;
      tone -= eyeSocket * contrast * 0.045 + mouthShadow * 0.022 + jawShadow * 0.025;
      tone -= freckleStrength;
      red += cheek * cheekBlush * 0.080 + nose * noseRedness * 0.072
        + forehead * foreheadWarmth * 0.035 + warmth * 0.025 + ageVariation * 0.012;
      green -= cheek * cheekBlush * 0.037 + nose * noseRedness * 0.034
        + forehead * foreheadWarmth * 0.012 + warmth * 0.010 + freckleStrength * 0.18;
      blue -= cheek * cheekBlush * 0.082 + nose * noseRedness * 0.074
        + forehead * foreheadWarmth * 0.038 + warmth * 0.030 + ageVariation * 0.022 + freckleStrength * 0.24;
    }

    tone = THREE.MathUtils.clamp(tone, 0.76, 1.06);
    const lipMix = clamp01(lipMask * lipTint);
    const baseRed = tone + red;
    const baseGreen = tone + green;
    const baseBlue = tone + blue;
    const finalRed = THREE.MathUtils.lerp(baseRed, baseRed * lipRatio.x, lipMix);
    const finalGreen = THREE.MathUtils.lerp(baseGreen, baseGreen * lipRatio.y, lipMix);
    const finalBlue = THREE.MathUtils.lerp(baseBlue, baseBlue * lipRatio.z, lipMix);
    for (let corner = 0; corner < 3; corner++) {
      const offset = (vertex + corner) * 3;
      colors[offset] = THREE.MathUtils.clamp(finalRed, 0.58, 1.12);
      colors[offset + 1] = THREE.MathUtils.clamp(finalGreen, 0.52, 1.08);
      colors[offset + 2] = THREE.MathUtils.clamp(finalBlue, 0.50, 1.06);
    }
  }
  if (!geometry.attributes.color) geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  else geometry.attributes.color.needsUpdate = true;

  const roughness = THREE.MathUtils.clamp(values.stylizedSurfaceRoughness ?? 0.82, 0.55, 1);
  if (role === 'skin') {
    mesh.material.color.set(values.skinTone ?? '#b98269');
    mesh.material.roughness = roughness;
    if (mesh.material.userData.matteFinishUniform) mesh.material.userData.matteFinishUniform.value = 1;
    mesh.material.bumpScale = 0.0002 + detail * 0.0014;
    const poreScale = THREE.MathUtils.clamp(values.stylizedPoreScale ?? 1, 0.35, 2.5);
    mesh.material.userData.skinMicroTexture?.repeat.set(2.6 + poreScale * 2.4, 4.2 + poreScale * 4.6);
    mesh.material.specularIntensity = THREE.MathUtils.lerp(0.42, 0.22, roughness);
    mesh.material.sheen = 0.08 + detail * 0.10;
  } else if (role === 'garment') {
    mesh.material.color.set(values.dressColor ?? '#263526');
    mesh.material.roughness = Math.min(1, roughness + 0.04);
  } else if (role === 'shoes') {
    mesh.material.color.set(values.trimColor ?? '#251914').multiplyScalar(0.55);
    mesh.material.roughness = Math.min(1, roughness + 0.04);
  }
}

export function prepareStylizedModel(model, values) {
  const seed = Number(values.seed) || 1;
  model.traverse((object) => {
    if (!object.isMesh) return;
    if (object.name === 'Human_Body') prepareFacetedMesh(object, 'skin', seed);
    else if (object.name === 'Dress_Bodice') prepareFacetedMesh(object, 'garment', seed + 101);
    else if (object.name === 'Shoes') prepareFacetedMesh(object, 'shoes', seed + 211);
    else if (object.name === 'Teeth') object.visible = false;
  });
  updateStylizedModel(model, values);
}

export function updateStylizedModel(model, values) {
  if (!model) return;
  model.traverse((object) => {
    if (!object.isMesh) return;
    if (object.userData.stylizedPrepared) {
      updateNormalBlend(object, values);
      updatePlaneTones(object, values);
    }
    if (object.name === 'Eyes') {
      const eyeContrast = clamp01(values.stylizedEyeContrast ?? 0.3);
      const tint = new THREE.Color('#b5a897').lerp(new THREE.Color('#fffaf0'), 0.38 + eyeContrast * 0.42);
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      for (const material of materials) {
        if (!material?.color) continue;
        material.color.copy(tint);
        material.roughness = 0.74;
        material.metalness = 0;
      }
    }
  });
}

export function styleProceduralCostume(costume, values) {
  if (!costume) return;
  for (const material of [costume.materials.dress, costume.materials.trim, costume.materials.hair]) {
    material.flatShading = true;
    material.roughness = Math.max(material.roughness, values.stylizedSurfaceRoughness ?? 0.9);
    material.needsUpdate = true;
  }
}
