import * as THREE from 'three';

const clamp01 = (value) => THREE.MathUtils.clamp(value, 0, 1);
const smoothstep = (minimum, maximum, value) => {
  const x = clamp01((value - minimum) / Math.max(0.00001, maximum - minimum));
  return x * x * (3 - 2 * x);
};
const gaussian = (value, centre, width) => Math.exp(-((value - centre) ** 2) / (2 * width * width));
const hash2D = (x, y, seed) => {
  const value = Math.sin(x * 127.1 + y * 311.7 + seed * 17.173) * 43758.5453;
  return value - Math.floor(value);
};

function valueNoise(u, v, scale, seed) {
  const x = u * scale;
  const y = v * scale;
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = smoothstep(0, 1, x - x0);
  const fy = smoothstep(0, 1, y - y0);
  const top = THREE.MathUtils.lerp(hash2D(x0, y0, seed), hash2D(x0 + 1, y0, seed), fx);
  const bottom = THREE.MathUtils.lerp(hash2D(x0, y0 + 1, seed), hash2D(x0 + 1, y0 + 1, seed), fx);
  return THREE.MathUtils.lerp(top, bottom, fy);
}

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
      const value = THREE.MathUtils.clamp(Math.round(190 + broad * 22 + pores * 17 + cross * 8), 112, 244);
      const offset = (y * size + x) * 4;
      data[offset] = value;
      data[offset + 1] = value;
      data[offset + 2] = value;
      data[offset + 3] = 255;
    }
  }
  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  texture.name = 'SkinMicrostructure';
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(4.5, 7.5);
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  return texture;
}

function makePlaneNormals(smoothNormals) {
  const output = new Float32Array(smoothNormals.length);
  for (let index = 0; index < smoothNormals.length; index += 3) {
    // Renderer A cannot split vertices without multiplying all 52 facial
    // targets. A gently quantized normal field supplies a topology-safe
    // faceting endpoint for the same live smoothing control used by B.
    let x = Math.round(smoothNormals[index] * 3) / 3;
    let y = Math.round(smoothNormals[index + 1] * 3) / 3;
    let z = Math.round(smoothNormals[index + 2] * 3) / 3;
    const inverseLength = 1 / Math.max(0.00001, Math.hypot(x, y, z));
    output[index] = x * inverseLength;
    output[index + 1] = y * inverseLength;
    output[index + 2] = z * inverseLength;
  }
  return output;
}

function makeWeldedSmoothNormals(geometry, flatNormals) {
  const position = geometry.attributes.position;
  const clustersByPosition = new Map();
  const assignments = new Array(position.count);
  for (let index = 0; index < position.count; index++) {
    const key = `${Math.round(position.getX(index) * 100000)},${Math.round(position.getY(index) * 100000)},${Math.round(position.getZ(index) * 100000)}`;
    const normal = [flatNormals[index * 3], flatNormals[index * 3 + 1], flatNormals[index * 3 + 2]];
    const clusters = clustersByPosition.get(key) || [];
    let cluster = clusters.find((candidate) => {
      const length = Math.max(0.00001, Math.hypot(...candidate));
      return (candidate[0] * normal[0] + candidate[1] * normal[1] + candidate[2] * normal[2]) / length > 0.45;
    });
    if (!cluster) {
      cluster = [0, 0, 0];
      clusters.push(cluster);
      clustersByPosition.set(key, clusters);
    }
    cluster[0] += normal[0]; cluster[1] += normal[1]; cluster[2] += normal[2];
    assignments[index] = cluster;
  }
  const output = new Float32Array(flatNormals.length);
  for (let index = 0; index < position.count; index++) {
    const [x, y, z] = assignments[index];
    const inverseLength = 1 / Math.max(0.00001, Math.hypot(x, y, z));
    output[index * 3] = x * inverseLength;
    output[index * 3 + 1] = y * inverseLength;
    output[index * 3 + 2] = z * inverseLength;
  }
  return output;
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

function objectBoundsInBody(object, body) {
  if (!object?.geometry?.attributes?.position) return null;
  const toBody = body.matrixWorld.clone().invert().multiply(object.matrixWorld);
  const position = object.geometry.attributes.position;
  const bounds = new THREE.Box3();
  const point = new THREE.Vector3();
  for (let index = 0; index < position.count; index++) {
    bounds.expandByPoint(point.fromBufferAttribute(position, index).applyMatrix4(toBody));
  }
  return bounds;
}

function findFaceLandmarks(model, body) {
  model.updateMatrixWorld(true);
  const eyes = objectBoundsInBody(model.getObjectByName('Eyes'), body);
  const teeth = objectBoundsInBody(model.getObjectByName('Teeth'), body);
  if (!eyes || !teeth) {
    // Single-surface character systems such as MHR do not expose separate eye
    // and teeth objects.  Their stable anthropomorphic topology still gives us
    // a useful face frame from the head bounds, keeping freckles and lip tint
    // localized instead of painting entire triangles or the lower face.
    const metrics = skinMetrics(body.geometry);
    const position = body.geometry.attributes.position;
    let minX = Infinity, maxX = -Infinity, frontZ = -Infinity;
    for (let index = 0; index < position.count; index++) {
      if (position.getY(index) < metrics.headMinY) continue;
      minX = Math.min(minX, position.getX(index));
      maxX = Math.max(maxX, position.getX(index));
      frontZ = Math.max(frontZ, position.getZ(index));
    }
    const headWidth = Math.max(0.001, maxX - minX);
    return {
      centerX: (minX + maxX) / 2,
      eyeY: metrics.maxY - metrics.height * 0.067,
      eyeZ: frontZ - headWidth * 0.18,
      eyeSpan: headWidth * 0.68,
      eyeHalfSeparation: headWidth * 0.18,
      mouthY: metrics.maxY - metrics.height * 0.122,
      mouthZ: frontZ - headWidth * 0.12,
      mouthWidth: headWidth * 0.43,
      mouthHeight: metrics.height * 0.018,
      frontZ,
    };
  }
  const eyeCenter = eyes.getCenter(new THREE.Vector3());
  const eyeSize = eyes.getSize(new THREE.Vector3());
  const mouthCenter = teeth.getCenter(new THREE.Vector3());
  const mouthSize = teeth.getSize(new THREE.Vector3());
  return {
    centerX: eyeCenter.x,
    eyeY: eyeCenter.y,
    eyeZ: eyeCenter.z,
    eyeSpan: eyeSize.x,
    eyeHalfSeparation: eyeSize.x * 0.29,
    mouthY: mouthCenter.y,
    mouthZ: Math.max(mouthCenter.z, teeth.max.z),
    mouthWidth: mouthSize.x,
    mouthHeight: mouthSize.y,
    frontZ: Math.max(eyes.max.z, teeth.max.z),
  };
}

function splatMask(mask, size, centreX, centreY, radius, strength) {
  const extent = Math.ceil(radius * 2.2);
  for (let y = Math.max(0, centreY - extent); y <= Math.min(size - 1, centreY + extent); y++) {
    for (let x = Math.max(0, centreX - extent); x <= Math.min(size - 1, centreX + extent); x++) {
      const distance = Math.hypot(x - centreX, y - centreY);
      if (distance > extent) continue;
      const value = strength * Math.exp(-(distance * distance) / (2 * radius * radius));
      const offset = y * size + x;
      mask[offset] = Math.max(mask[offset], value);
    }
  }
}

function createFaceOverlay(mesh, landmarks, seed) {
  const size = 512;
  const lipMask = new Float32Array(size * size);
  const freckleMask = new Float32Array(size * size);
  const position = mesh.geometry.attributes.position;
  const uv = mesh.geometry.attributes.uv;
  if (!position || !uv || !landmarks) return null;
  const vertical = Math.max(0.001, landmarks.eyeY - landmarks.mouthY);

  for (let vertex = 0; vertex < position.count; vertex++) {
    const x = position.getX(vertex);
    const y = position.getY(vertex);
    const z = position.getZ(vertex);
    const lipFront = smoothstep(
      landmarks.mouthZ - landmarks.eyeSpan * 0.08,
      landmarks.mouthZ + landmarks.eyeSpan * 0.08,
      z,
    );
    const lip = gaussian(x, landmarks.centerX, landmarks.mouthWidth * 0.45)
      * gaussian(y, landmarks.mouthY, landmarks.mouthHeight * 0.12) * lipFront;
    const freckleBridge = gaussian(x, landmarks.centerX, landmarks.eyeSpan * 0.19)
      * gaussian(y, landmarks.eyeY - vertical * 0.16, vertical * 0.22);
    const freckleCheeks = (
      gaussian(x, landmarks.centerX - landmarks.eyeSpan * 0.33, landmarks.eyeSpan * 0.27)
      + gaussian(x, landmarks.centerX + landmarks.eyeSpan * 0.33, landmarks.eyeSpan * 0.27)
    ) * gaussian(y, landmarks.eyeY - vertical * 0.23, vertical * 0.16);
    const freckleFront = smoothstep(
      landmarks.frontZ - landmarks.eyeSpan * 0.35,
      landmarks.frontZ + landmarks.eyeSpan * 0.10,
      z,
    );
    const freckle = clamp01((freckleBridge + freckleCheeks * 0.72) * freckleFront);
    const pixelX = Math.round(clamp01(uv.getX(vertex)) * (size - 1));
    const pixelY = Math.round(clamp01(uv.getY(vertex)) * (size - 1));
    if (lip > 0.025) splatMask(lipMask, size, pixelX, pixelY, 3.2, lip);
    if (freckle > 0.04) splatMask(freckleMask, size, pixelX, pixelY, 5.5, freckle);
  }

  const candidates = [];
  for (let offset = 0; offset < freckleMask.length; offset++) {
    if (freckleMask[offset] > 0.10) candidates.push(offset);
  }
  let randomState = (Math.round(seed) || 1) >>> 0;
  const random = () => {
    randomState = (Math.imul(randomState, 1664525) + 1013904223) >>> 0;
    return randomState / 4294967296;
  };
  const spots = [];
  for (let index = 0; index < 180 && candidates.length; index++) {
    const offset = candidates[Math.floor(random() * candidates.length)];
    spots.push({
      x: offset % size,
      y: Math.floor(offset / size),
      radius: 0.65 + random() * 1.75,
      strength: 0.36 + random() * 0.56,
      rank: random(),
    });
  }

  const data = new Uint8Array(size * size * 4);
  data.fill(255);
  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  texture.name = 'SkinFaceOverlay';
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  return {
    data, texture, size, lipMask, freckleMask, spots,
    multipliers: new Float32Array(size * size * 3),
  };
}

function installFaceOverlay(material, texture) {
  if (!material || material.userData.faceOverlayUniform) return;
  const uniform = { value: texture };
  const previousCompile = material.onBeforeCompile;
  const previousCacheKey = material.customProgramCacheKey.bind(material);
  material.userData.faceOverlayUniform = uniform;
  material.userData.faceOverlayTexture = texture;
  material.onBeforeCompile = (shader, renderer) => {
    previousCompile.call(material, shader, renderer);
    shader.uniforms.skinFaceOverlay = uniform;
    shader.vertexShader = `varying vec2 vSkinFaceUv;\n${shader.vertexShader}`.replace(
      '#include <uv_vertex>',
      '#include <uv_vertex>\nvSkinFaceUv = uv;',
    );
    shader.fragmentShader = `uniform sampler2D skinFaceOverlay;\nvarying vec2 vSkinFaceUv;\n${shader.fragmentShader}`.replace(
      '#include <map_fragment>',
      '#include <map_fragment>\ndiffuseColor.rgb *= texture2D(skinFaceOverlay, vSkinFaceUv).rgb;',
    );
  };
  material.customProgramCacheKey = () => `${previousCacheKey()}|skin-face-overlay-v1`;
  material.needsUpdate = true;
}

function updateFaceOverlay(mesh, values, skinColor, lipColor) {
  const overlay = mesh.userData.faceOverlay;
  if (!overlay) return;
  const lipTint = clamp01(values.stylizedLipTint ?? 0.52);
  const freckleAmount = clamp01(values.stylizedFreckleAmount ?? 0.08);
  const lipRatio = [
    THREE.MathUtils.clamp(lipColor.r / Math.max(0.03, skinColor.r), 0.35, 1),
    THREE.MathUtils.clamp(lipColor.g / Math.max(0.03, skinColor.g), 0.28, 1),
    THREE.MathUtils.clamp(lipColor.b / Math.max(0.03, skinColor.b), 0.28, 1),
  ];
  const { multipliers } = overlay;
  multipliers.fill(1);
  for (let pixel = 0; pixel < overlay.lipMask.length; pixel++) {
    const mix = clamp01(overlay.lipMask[pixel] * lipTint * 1.55);
    const offset = pixel * 3;
    multipliers[offset] *= THREE.MathUtils.lerp(1, lipRatio[0], mix);
    multipliers[offset + 1] *= THREE.MathUtils.lerp(1, lipRatio[1], mix);
    multipliers[offset + 2] *= THREE.MathUtils.lerp(1, lipRatio[2], mix);
  }
  const activeRank = freckleAmount * 1.08;
  for (const spot of overlay.spots) {
    if (spot.rank > activeRank) continue;
    const radius = spot.radius * (0.82 + freckleAmount * 0.30);
    const extent = Math.ceil(radius * 2.4);
    for (let y = Math.max(0, Math.floor(spot.y - extent)); y <= Math.min(overlay.size - 1, Math.ceil(spot.y + extent)); y++) {
      for (let x = Math.max(0, Math.floor(spot.x - extent)); x <= Math.min(overlay.size - 1, Math.ceil(spot.x + extent)); x++) {
        const distance = Math.hypot(x - spot.x, y - spot.y);
        if (distance > extent) continue;
        const pixel = y * overlay.size + x;
        const zone = overlay.freckleMask[pixel];
        if (zone <= 0) continue;
        const alpha = Math.exp(-(distance * distance) / (2 * radius * radius))
          * spot.strength * zone * (0.38 + freckleAmount * 0.48);
        const offset = pixel * 3;
        multipliers[offset] *= 1 - alpha * 0.20;
        multipliers[offset + 1] *= 1 - alpha * 0.38;
        multipliers[offset + 2] *= 1 - alpha * 0.48;
      }
    }
  }
  // Root shadow along the fitted hairline, painted by the hair system. A
  // texture gradient stays smooth in motion where geometry fringes and alpha
  // dithering both shimmered.
  if (overlay.scalpMask && overlay.scalpTint) {
    for (let pixel = 0; pixel < overlay.scalpMask.length; pixel++) {
      const mix = overlay.scalpMask[pixel];
      if (mix <= 0) continue;
      const offset = pixel * 3;
      multipliers[offset] *= THREE.MathUtils.lerp(1, overlay.scalpTint[0], mix);
      multipliers[offset + 1] *= THREE.MathUtils.lerp(1, overlay.scalpTint[1], mix);
      multipliers[offset + 2] *= THREE.MathUtils.lerp(1, overlay.scalpTint[2], mix);
    }
  }
  for (let pixel = 0; pixel < overlay.lipMask.length; pixel++) {
    const source = pixel * 3;
    const target = pixel * 4;
    overlay.data[target] = Math.round(clamp01(multipliers[source]) * 255);
    overlay.data[target + 1] = Math.round(clamp01(multipliers[source + 1]) * 255);
    overlay.data[target + 2] = Math.round(clamp01(multipliers[source + 2]) * 255);
    overlay.data[target + 3] = 255;
  }
  overlay.texture.needsUpdate = true;
}

/** Recompose the skin overlay for a model whose masks changed outside the
 * normal slider path (the hair system repaints the scalp band on rebuild). */
export function refreshSkinOverlay(model, values) {
  let body = null;
  model?.traverse((object) => {
    if (!body && object.isMesh && object.userData.faceOverlay) body = object;
  });
  if (!body) return;
  const skinColor = new THREE.Color(values.skinTone ?? '#b98269');
  const lipColor = new THREE.Color(values.stylizedLipColor ?? '#a96260');
  updateFaceOverlay(body, values, skinColor, lipColor);
}

function prepareFacetedMesh(mesh, role, seed) {
  if (mesh.userData.skinAppearancePrepared) return;
  const source = mesh.geometry;
  const working = source.clone();
  if (!working.attributes.normal) working.computeVertexNormals();
  const geometry = working.index ? working.toNonIndexed() : working.clone();
  working.dispose();
  geometry.computeVertexNormals();
  geometry.userData.stylizedFlatNormals = new Float32Array(geometry.attributes.normal.array);
  geometry.userData.stylizedSmoothNormals = makeWeldedSmoothNormals(geometry, geometry.userData.stylizedFlatNormals);
  geometry.userData.stylizedSeed = seed;
  geometry.userData.skinMetrics = role === 'skin' ? skinMetrics(geometry) : null;
  mesh.geometry = geometry;
  source.dispose();
  mesh.userData.stylizedPrepared = true;
  mesh.userData.skinAppearancePrepared = true;
  mesh.userData.skinSurfaceStyle = 'stylized';
  mesh.userData.stylizedRole = role;

  let material;
  if (role === 'skin') {
    const microTexture = makeSkinMicroTexture(seed);
    material = new THREE.MeshPhysicalMaterial({
      name: 'AnatomicalSkin',
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

function prepareCurrentSkinMesh(mesh, seed) {
  if (mesh.userData.skinAppearancePrepared) return;
  const geometry = mesh.geometry;
  if (!geometry.attributes.normal) geometry.computeVertexNormals();
  const smoothNormals = new Float32Array(geometry.attributes.normal.array);
  geometry.userData.stylizedSmoothNormals = smoothNormals;
  geometry.userData.stylizedFlatNormals = makePlaneNormals(smoothNormals);
  geometry.userData.stylizedSeed = seed;
  geometry.userData.skinMetrics = skinMetrics(geometry);
  mesh.userData.skinAppearancePrepared = true;
  mesh.userData.skinSurfaceStyle = 'current';
  mesh.userData.stylizedRole = 'skin';

  const microTexture = makeSkinMicroTexture(seed);
  const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  for (const material of materials) {
    if (!material) continue;
    // Preserve renderer A's original diffuse skin texture and material type.
    // Only add properties supported by MeshStandard/PhysicalMaterial.
    material.vertexColors = true;
    material.bumpMap = microTexture;
    material.roughnessMap = microTexture;
    material.userData.skinMicroTexture = microTexture;
    material.needsUpdate = true;
  }
}

function updateNormalBlend(mesh, values) {
  if (mesh.userData.stylizedRole !== 'skin') return;
  const geometry = mesh.geometry;
  const smoothNormals = geometry.userData.stylizedSmoothNormals;
  const flatNormals = geometry.userData.stylizedFlatNormals;
  const normal = geometry.attributes.normal;
  if (!smoothNormals || !flatNormals || !normal) return;
  const requestedBlend = clamp01(values.stylizedTriangleBlend ?? 0.36);
  const blend = requestedBlend;
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
  const skinColor = new THREE.Color(values.skinTone ?? '#b98269');
  const lipColor = new THREE.Color(values.stylizedLipColor ?? '#a96260');
  const role = mesh.userData.stylizedRole;
  const seed = geometry.userData.stylizedSeed || 1;
  const landmarks = geometry.userData.faceLandmarks;
  const uv = geometry.attributes.uv;

  for (let vertex = 0; vertex < position.count; vertex++) {
    const x = position.getX(vertex);
    const y = position.getY(vertex);
    const z = position.getZ(vertex);
    const nx = normal.getX(vertex);
    const ny = normal.getY(vertex);
    const nz = normal.getZ(vertex);
    const facing = nz * 0.58 + ny * 0.16 - Math.abs(nx) * 0.055;
    const field = coherentField(x, y, z, seed);
    const roleScale = role === 'skin' ? 1 : 0.58;
    let tone = 0.955 + contrast * roleScale * (facing * 0.17 + field * 0.07);
    let red = 0;
    let green = 0;
    let blue = 0;

    if (role === 'skin') {
      red += warmth * 0.075;
      green -= warmth * 0.032;
      blue -= warmth * 0.085;
    }

    if (role === 'skin' && landmarks) {
      const vertical = Math.max(0.001, landmarks.eyeY - landmarks.mouthY);
      const front = smoothstep(
        landmarks.frontZ - landmarks.eyeSpan * 0.62,
        landmarks.frontZ + landmarks.eyeSpan * 0.10,
        z,
      );
      const foreheadFront = smoothstep(
        landmarks.frontZ - landmarks.eyeSpan * 0.82,
        landmarks.frontZ + landmarks.eyeSpan * 0.10,
        z,
      );
      const cheek = (
        gaussian(x, landmarks.centerX - landmarks.eyeSpan * 0.40, landmarks.eyeSpan * 0.28)
        + gaussian(x, landmarks.centerX + landmarks.eyeSpan * 0.40, landmarks.eyeSpan * 0.28)
      ) * gaussian(y, landmarks.eyeY - vertical * 0.38, vertical * 0.42) * front;
      const nose = gaussian(x, landmarks.centerX, landmarks.eyeSpan * 0.18)
        * gaussian(y, landmarks.eyeY - vertical * 0.46, vertical * 0.52) * front;
      const forehead = gaussian(x, landmarks.centerX, landmarks.eyeSpan * 0.64)
        * gaussian(y, landmarks.eyeY + vertical * 0.78, vertical * 0.70) * foreheadFront;
      const eyeSocket = (
        gaussian(x, landmarks.centerX - landmarks.eyeHalfSeparation, landmarks.eyeSpan * 0.18)
        + gaussian(x, landmarks.centerX + landmarks.eyeHalfSeparation, landmarks.eyeSpan * 0.18)
      ) * gaussian(y, landmarks.eyeY, vertical * 0.22) * front;
      const mouthShadow = gaussian(x, landmarks.centerX, landmarks.mouthWidth * 0.72)
        * gaussian(y, landmarks.mouthY, landmarks.mouthHeight * 0.34) * front;
      const jawShadow = gaussian(x, landmarks.centerX, landmarks.eyeSpan * 0.66)
        * gaussian(y, landmarks.mouthY - vertical * 0.58, vertical * 0.34) * front;
      const faceZone = gaussian(x, landmarks.centerX, landmarks.eyeSpan * 0.72)
        * gaussian(y, (landmarks.eyeY + landmarks.mouthY) / 2, vertical * 1.25) * front;
      const textureU = uv ? uv.getX(vertex) : x * 3;
      const textureV = uv ? uv.getY(vertex) : y * 3;
      const pigmentNoise = (valueNoise(textureU, textureV, 24, seed + 13) - 0.5) * 2;
      const ageVariation = (0.45 + (values.age ?? 0.55) * 0.55) * pigment * pigmentNoise * faceZone;

      tone += ageVariation * 0.075;
      tone -= eyeSocket * contrast * 0.085 + mouthShadow * 0.045 + jawShadow * 0.05;
      red += cheek * cheekBlush * 0.19 + nose * noseRedness * 0.18
        + forehead * foreheadWarmth * 0.24 + ageVariation * 0.055;
      green -= cheek * cheekBlush * 0.085 + nose * noseRedness * 0.080
        + forehead * foreheadWarmth * 0.080;
      blue -= cheek * cheekBlush * 0.20 + nose * noseRedness * 0.19
        + forehead * foreheadWarmth * 0.25 + ageVariation * 0.095;
    }

    tone = THREE.MathUtils.clamp(tone, 0.76, 1.06);
    const baseRed = tone + red;
    const baseGreen = tone + green;
    const baseBlue = tone + blue;
    const offset = vertex * 3;
    colors[offset] = THREE.MathUtils.clamp(baseRed, 0.58, 1.12);
    colors[offset + 1] = THREE.MathUtils.clamp(baseGreen, 0.52, 1.08);
    colors[offset + 2] = THREE.MathUtils.clamp(baseBlue, 0.50, 1.06);
  }
  if (!geometry.attributes.color) geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  else geometry.attributes.color.needsUpdate = true;

  const roughness = THREE.MathUtils.clamp(values.stylizedSurfaceRoughness ?? 0.82, 0.55, 1);
  if (role === 'skin') {
    const poreScale = THREE.MathUtils.clamp(values.stylizedPoreScale ?? 1, 0.35, 2.5);
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const material of materials) {
      if (!material) continue;
      const tint = material.map
        ? new THREE.Color('#ffffff').lerp(skinColor, 0.75)
        : skinColor;
      material.color.copy(tint);
      material.roughness = roughness;
      material.bumpScale = 0.00015 + detail * 0.00385;
      // Higher scale means visibly larger features, so repeat frequency falls.
      material.userData.skinMicroTexture?.repeat.set(6.4 - poreScale * 1.4, 11 - poreScale * 2.2);
      if ('specularIntensity' in material) material.specularIntensity = THREE.MathUtils.lerp(0.42, 0.22, roughness);
      if ('sheen' in material) material.sheen = 0.08 + detail * 0.10;
    }
    updateFaceOverlay(mesh, values, skinColor, lipColor);
  } else if (role === 'garment') {
    mesh.material.color.set(values.dressColor ?? '#263526');
    mesh.material.roughness = Math.min(1, roughness + 0.04);
  } else if (role === 'shoes') {
    mesh.material.color.set(values.trimColor ?? '#251914').multiplyScalar(0.55);
    mesh.material.roughness = Math.min(1, roughness + 0.04);
  }
}

export function prepareSkinModel(model, values, { stylized = false } = {}) {
  const seed = Number(values.seed) || 1;
  let body = null;
  model.traverse((object) => {
    if (!object.isMesh) return;
    if (object.name === 'Human_Body' || object.name === 'body_mesh') {
      body = object;
      if (stylized) prepareFacetedMesh(object, 'skin', seed);
      else prepareCurrentSkinMesh(object, seed);
    } else if (stylized && object.name === 'Dress_Bodice') prepareFacetedMesh(object, 'garment', seed + 101);
    else if (stylized && object.name === 'Shoes') prepareFacetedMesh(object, 'shoes', seed + 211);
    else if (stylized && object.name === 'Teeth') object.visible = false;
  });
  if (body) {
    const landmarks = findFaceLandmarks(model, body);
    body.geometry.userData.faceLandmarks = landmarks;
    if (!body.userData.faceOverlay) body.userData.faceOverlay = createFaceOverlay(body, landmarks, seed);
    if (body.userData.faceOverlay) {
      const materials = Array.isArray(body.material) ? body.material : [body.material];
      for (const material of materials) installFaceOverlay(material, body.userData.faceOverlay.texture);
    }
  }
  updateSkinModel(model, values);
}

/** Refresh topology-stable skin bases after an identity morph has been baked
 * into the base position/normal attributes (used by MHR's live identity path). */
export function refreshSkinGeometry(model, values) {
  let body = null;
  model?.traverse((object) => {
    if (!body && object.isMesh && object.userData.skinAppearancePrepared && object.userData.stylizedRole === 'skin') body = object;
  });
  if (!body) return;
  const geometry = body.geometry;
  if (!geometry.attributes.normal) geometry.computeVertexNormals();
  const smoothNormals = new Float32Array(geometry.attributes.normal.array);
  geometry.userData.stylizedSmoothNormals = smoothNormals;
  geometry.userData.stylizedFlatNormals = makePlaneNormals(smoothNormals);
  geometry.userData.skinMetrics = skinMetrics(geometry);
  geometry.userData.faceLandmarks = findFaceLandmarks(model, body);
  if (body.userData.faceOverlay) {
    body.userData.faceOverlay.texture?.dispose?.();
    body.userData.faceOverlay = createFaceOverlay(body, geometry.userData.faceLandmarks, Number(values.seed) || 1);
    const materials = Array.isArray(body.material) ? body.material : [body.material];
    for (const material of materials) {
      if (!material) continue;
      if (material.userData.faceOverlayUniform) material.userData.faceOverlayUniform.value = body.userData.faceOverlay.texture;
      material.userData.faceOverlayTexture = body.userData.faceOverlay.texture;
    }
  }
}

export function prepareStylizedModel(model, values) {
  prepareSkinModel(model, values, { stylized: true });
}

export function updateSkinModel(model, values) {
  if (!model) return;
  model.traverse((object) => {
    if (!object.isMesh) return;
    if (object.userData.skinAppearancePrepared) {
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

export function updateStylizedModel(model, values) {
  updateSkinModel(model, values);
}

export function styleProceduralCostume(costume, values) {
  if (!costume) return;
  for (const material of [costume.materials.dress, costume.materials.trim]) {
    material.flatShading = true;
    material.roughness = Math.max(material.roughness, values.stylizedSurfaceRoughness ?? 0.9);
    material.needsUpdate = true;
  }
  // Hair uses its own flow-aligned normals and anisotropic response in both
  // renderers. Flattening it with the clothing was a major source of the felt
  // cap appearance in renderer B.
  const hair = costume.materials.hair;
  if (hair) {
    hair.flatShading = false;
    hair.roughness = Math.min(hair.roughness, 0.70);
    hair.needsUpdate = true;
  }
}
