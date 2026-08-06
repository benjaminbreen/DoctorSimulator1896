import * as THREE from 'three';

function hash(seed, index) {
  const value = Math.sin(seed * 12.9898 + index * 78.233) * 43758.5453;
  return value - Math.floor(value);
}

function prepareFacetedMesh(mesh, role, seed) {
  if (mesh.userData.stylizedPrepared) return;
  const source = mesh.geometry;
  const geometry = source.index ? source.toNonIndexed() : source.clone();
  geometry.computeVertexNormals();
  const triangles = Math.floor(geometry.attributes.position.count / 3);
  geometry.userData.stylizedNoise = new Float32Array(triangles);
  for (let triangle = 0; triangle < triangles; triangle++) {
    geometry.userData.stylizedNoise[triangle] = hash(seed, triangle + role.length * 997) * 2 - 1;
  }
  mesh.geometry = geometry;
  source.dispose();
  mesh.userData.stylizedPrepared = true;
  mesh.userData.stylizedRole = role;

  const material = new THREE.MeshStandardMaterial({
    name: role === 'skin' ? 'Stylized_Human' : `Stylized_${role}`,
    color: '#ffffff', roughness: 0.9, metalness: 0,
    vertexColors: true, flatShading: true, side: THREE.FrontSide,
  });
  if (Array.isArray(mesh.material)) {
    for (const item of mesh.material) item?.dispose?.();
  } else mesh.material?.dispose?.();
  mesh.material = material;
}

function updatePlaneTones(mesh, values) {
  const geometry = mesh.geometry;
  const position = geometry.attributes.position;
  const normal = geometry.attributes.normal;
  const noise = geometry.userData.stylizedNoise;
  if (!position || !normal || !noise) return;
  const colors = geometry.attributes.color?.array || new Float32Array(position.count * 3);
  const contrast = THREE.MathUtils.clamp(values.stylizedPlaneContrast ?? 0.42, 0, 1);
  const role = mesh.userData.stylizedRole;
  for (let triangle = 0; triangle < noise.length; triangle++) {
    const vertex = triangle * 3;
    const facing = normal.getZ(vertex) * 0.58 + normal.getY(vertex) * 0.20 - Math.abs(normal.getX(vertex)) * 0.08;
    const roleScale = role === 'skin' ? 1 : 0.62;
    const tone = THREE.MathUtils.clamp(
      0.90 + contrast * roleScale * (facing * 0.10 + noise[triangle] * 0.095),
      0.68,
      1.08,
    );
    for (let corner = 0; corner < 3; corner++) {
      const offset = (vertex + corner) * 3;
      colors[offset] = tone;
      colors[offset + 1] = tone * (role === 'skin' ? 0.985 : 1);
      colors[offset + 2] = tone * (role === 'skin' ? 0.96 : 0.985);
    }
  }
  if (!geometry.attributes.color) geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  else geometry.attributes.color.needsUpdate = true;
  const roughness = THREE.MathUtils.clamp(values.stylizedSurfaceRoughness ?? 0.9, 0.55, 1);
  if (role === 'skin') mesh.material.color.set(values.skinTone ?? '#b98269');
  else if (role === 'garment') mesh.material.color.set(values.dressColor ?? '#263526');
  else if (role === 'shoes') mesh.material.color.set(values.trimColor ?? '#251914').multiplyScalar(0.55);
  mesh.material.roughness = role === 'skin' ? roughness : Math.min(1, roughness + 0.04);
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
    if (object.userData.stylizedPrepared) updatePlaneTones(object, values);
    if (object.name === 'Eyes') {
      const eyeContrast = THREE.MathUtils.clamp(values.stylizedEyeContrast ?? 0.34, 0, 1);
      const tint = new THREE.Color('#aa9a84').lerp(new THREE.Color('#ffffff'), eyeContrast * 0.72);
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      for (const material of materials) {
        if (!material?.color) continue;
        material.color.copy(tint);
        material.roughness = 0.88;
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
