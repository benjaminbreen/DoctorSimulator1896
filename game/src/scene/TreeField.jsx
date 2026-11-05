import { useCallback, useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { useFrame, useLoader, useThree } from '@react-three/fiber';
import { GLTFLoader } from './modelLoader.js';
import { MeshoptDecoder } from 'meshoptimizer';
import { TREE_MODELS, TREE_MODEL_URLS, TREE_LOD_URLS, treeSpecies } from '../world/treeModels.js';
import { applyWind } from './foliageWind.js';
import { farShadowState } from './atmosphere.js';
import { getKTX2Loader } from './ktx2.js';
import { sharePackTextures } from './packTextures.js';
import { freezeStaticTransforms } from './lib/staticScene.js';
import {gameDebug} from '../debug.js';

// How far a canopy top travels, as a fraction of the tree's height. A big elm
// moving a quarter of a metre is a breeze; much more and it reads as a storm.
const TREE_SWAY = 0.03;

// Instanced period trees baked from EZ-Tree; world/treeModels.js lists them.
// Each item names a species and a height; the variant is picked by position.

// Leaf cards take per-instance canopy colors; the trunk keeps its own bark.
// The Shapespark elms name their leaf material 'branch...'.
function isLeafMaterial(name) {
  return /branch|leaf|leaves/i.test(name ?? '');
}

// Bent normals light a leaf cluster as a volume instead of a flat card.
// Keep some of the source normal so individual branches still catch light.
// Also stores `crownShade`: low deep inside and under the crown, where
// little sky reaches, 1 at the outer shell.
function softenCanopyNormals(geometry, height) {
  const position=geometry.attributes.position,normal=geometry.attributes.normal;
  const outward=new THREE.Vector3(),source=new THREE.Vector3();
  const middle=height*.56;
  let reach=0;
  for(let i=0;i<position.count;i++){
    reach=Math.max(reach,Math.hypot(position.getX(i),(position.getY(i)-middle)*.65,position.getZ(i)));
  }
  const shade=new Float32Array(position.count);
  for(let i=0;i<position.count;i++){
    outward.set(position.getX(i), (position.getY(i)-middle)*.65, position.getZ(i));
    const depth=outward.length()/Math.max(reach,1e-3);
    const under=THREE.MathUtils.smoothstep((position.getY(i)-middle)/height,-.35,.25);
    shade[i]=(.35+.65*THREE.MathUtils.smoothstep(depth,.25,.9))*(.7+.3*under);
    outward.normalize();
    source.fromBufferAttribute(normal,i);
    if(source.dot(outward)<0)source.negate();
    source.lerp(outward,.7).normalize();normal.setXYZ(i,source.x,source.y,source.z);
  }
  geometry.setAttribute('crownShade',new THREE.BufferAttribute(shade,1));
}

// Leaf lighting on top of the wind patch: crown shade darkens the inside,
// and sun showing through the leaves lights the edges when the camera looks
// toward the sun. The sun colour and direction are the haze uniforms.
function shadeCrown(material) {
  const previous = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    previous?.(shader, renderer);
    shader.vertexShader = 'attribute float crownShade;\nvarying float vCrownShade;\n' + shader.vertexShader.replace(
      '#include <begin_vertex>',
      '#include <begin_vertex>\n  vCrownShade = crownShade;',
    );
    shader.fragmentShader = 'varying float vCrownShade;\n' + shader.fragmentShader
      .replace(
        '#include <alphamap_fragment>',
        `#include <alphamap_fragment>
         diffuseColor.rgb *= vCrownShade;`,
      )
      .replace(
        '#include <opaque_fragment>',
        `#if defined( USE_FOG ) && defined( FOG_EXP2 )
           float leafToward = max(dot(normalize(vFogWorldOffset), hazeSunDir), 0.0);
           float leafEdge = smoothstep(0.6, 1.0, vCrownShade);
           outgoingLight += diffuseColor.rgb * hazeSunColor * (pow(leafToward, 4.0) * 3.2 + 0.25) * leafEdge;
         #endif
         #include <opaque_fragment>`,
      );
  };
  const key = material.customProgramCacheKey();
  material.customProgramCacheKey = () => `${key}|crown-shade-v1`;
  return material;
}

function hash01(seed) {
  const value = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return value - Math.floor(value);
}

// Flatten a loaded GLB into world-space geometries with the trunk base at the
// origin, split into leaf and bark parts.
function extractParts(gltf, origin = null) {
  const parts = [];
  gltf.scene.updateMatrixWorld(true);
  gltf.scene.traverse((node) => {
    if (!node.isMesh) return;
    const geometry = node.geometry.clone();
    // The LOD positions are normalized integers. Transforming them in that
    // storage clips metre-scale coordinates and collapses distant crowns.
    for(const name of ['position','normal']){
      const attribute=geometry.attributes[name];
      if(!attribute||attribute.array instanceof Float32Array)continue;
      const values=new Float32Array(attribute.count*3);
      for(let i=0;i<attribute.count;i++){
        values[i*3]=attribute.getX(i);values[i*3+1]=attribute.getY(i);values[i*3+2]=attribute.getZ(i);
      }
      geometry.setAttribute(name,new THREE.BufferAttribute(values,3));
    }
    geometry.applyMatrix4(node.matrixWorld);
    parts.push({ geometry, material: node.material, materialName: node.material?.name ?? '' });
  });
  const box = new THREE.Box3();
  for (const part of parts) {
    part.geometry.computeBoundingBox();
    box.union(part.geometry.boundingBox);
  }
  const center = origin?.center ?? box.getCenter(new THREE.Vector3());
  const base = origin?.base ?? box.min.y;
  for (const part of parts) {
    part.geometry.translate(-center.x, -base, -center.z);
    if(isLeafMaterial(part.materialName))softenCanopyNormals(part.geometry,origin?.height??box.max.y-base);
  }
  return { parts, height: origin?.height ?? box.max.y - box.min.y, center, base };
}

const scratchMatrix = new THREE.Matrix4();
const scratchPos = new THREE.Vector3();
const scratchQuat = new THREE.Quaternion();
const scratchScale = new THREE.Vector3();
const scratchColor = new THREE.Color();
const UP = new THREE.Vector3(0, 1, 0);

export default function TreeField({ items }) {
  const gl = useThree((state) => state.gl);
  const configure = useCallback((loader) => {
    loader.setMeshoptDecoder(MeshoptDecoder);
    loader.setKTX2Loader(getKTX2Loader(gl));
  }, [gl]);
  const gltfs = useLoader(GLTFLoader, [...TREE_MODEL_URLS, ...TREE_LOD_URLS], configure);

  const meshes = useMemo(() => {
    const models = gltfs.slice(0, TREE_MODEL_URLS.length).map((gltf) => extractParts(sharePackTextures(gltf)));
    const distant = gltfs.slice(TREE_MODEL_URLS.length).map((gltf, index) => extractParts(gltf, models[index]));
    const materials = new Map();
    const bySpecies = new Map();
    TREE_MODELS.forEach((name, index) => {
      const species = treeSpecies(name);
      if (!bySpecies.has(species)) bySpecies.set(species, []);
      bySpecies.get(species).push(index);
    });

    // Small geographic cells let both the eye and the sun cull whole groves.
    const buckets = new Map();
    for (const item of items) {
      const choices = bySpecies.get(item.tree?.species) ?? bySpecies.get('broadleaf');
      const model = choices[Math.floor(hash01(item.position[0] * 7.3 + item.position[2] * 13.7) * choices.length)];
      const key = `${model}:${Math.floor(item.position[0] / 50)}:${Math.floor(item.position[2] / 50)}`;
      if (!buckets.has(key)) buckets.set(key, { model, trees: [] });
      buckets.get(key).trees.push(item);
    }

    const built = [];
    for (const { model: key, trees } of buckets.values()) {
      const model = models[key];
      for (const part of model.parts) {
        const leaf = isLeafMaterial(part.materialName);
        // The baked materials carry the textures, and the leaves are an alpha
        // cutout that keeps both faces. Instance colour multiplies the leaf
        // map; the bark keeps its baked species tint.
        let surface = materials.get(part);
        if (!surface) {
          const material = part.material.clone();
          material.metalness=0;material.roughness=leaf ? .92 : .88;
          if (material.alphaTest > 0) material.depthWrite = true;
          const depth = leaf ? applyWind(material, { reference: model.height, amplitude: TREE_SWAY }) : undefined;
          if (leaf) shadeCrown(material);
          materials.set(part, surface = { material, depth });
        }
        const mesh = new THREE.InstancedMesh(part.geometry, surface.material, trees.length);
        mesh.customDepthMaterial = surface.depth;
        mesh.name = `tree-cell-${key}`;
        const farPart = distant[key].parts.find((candidate) => candidate.materialName === part.materialName);
        mesh.userData.nearGeometry = part.geometry;
        mesh.userData.farGeometry = farPart?.geometry ?? part.geometry;
        mesh.userData.warmGeometries = [part.geometry, mesh.userData.farGeometry];
        trees.forEach((item, index) => {
          const groundY = item.position[1] - item.size[1] / 2;
          const spin = (item.position[0] * 3.1 + item.position[2]) % Math.PI;
          const scale = item.tree.height / model.height;
          scratchQuat.setFromAxisAngle(UP, spin);
          scratchPos.set(item.position[0], groundY, item.position[2]);
          scratchScale.setScalar(scale);
          scratchMatrix.compose(scratchPos, scratchQuat, scratchScale);
          mesh.setMatrixAt(index, scratchMatrix);
          if (leaf) {
            scratchColor.set(item.color);
            scratchColor.offsetHSL(0, -0.06, (hash01(item.position[0] * 3.7 + item.position[2]) - 0.5) * 0.055);
            mesh.setColorAt(index, scratchColor);
          }
        });
        mesh.instanceMatrix.needsUpdate = true;
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.computeBoundingSphere();
        mesh.boundingSphere.radius += model.height * .06;
        built.push(mesh);
      }
    }
    return built;
  }, [items, gltfs]);

  useFrame(({ camera }) => {
    scratchPos.fromArray(gameDebug.player.position);
    for (const mesh of meshes) {
      const distance = camera.position.distanceTo(mesh.boundingSphere.center) - mesh.boundingSphere.radius;
      const far = distance > (mesh.userData.far ? 30 : 38);
      if (far !== mesh.userData.far) {
        mesh.userData.far = far;
        mesh.geometry = far ? mesh.userData.farGeometry : mesh.userData.nearGeometry;
      }
      // Distant crowns retain their silhouette without another alpha-tested
      // draw into the nearby sun map. Large nearby groves still cast together.
      mesh.castShadow=farShadowState.casting||mesh.boundingSphere.center.distanceTo(scratchPos)-mesh.boundingSphere.radius<32;
    }
  });

  useEffect(() => () => {
    const resources = new Set();
    for (const mesh of meshes) {
      resources.add(mesh.userData.nearGeometry);
      resources.add(mesh.userData.farGeometry);
      resources.add(mesh.material);
      if (mesh.customDepthMaterial) resources.add(mesh.customDepthMaterial);
      mesh.dispose();
    }
    for (const resource of resources) resource.dispose();
  }, [meshes]);

  return (
    <group ref={(node) => freezeStaticTransforms(node)}>
      {meshes.map((mesh, index) => (
        <primitive key={index} object={mesh} />
      ))}
    </group>
  );
}
