import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { useFrame, useLoader } from '@react-three/fiber';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'meshoptimizer';
import { RigidBody, CuboidCollider } from '@react-three/rapier';
import { modelUrl, modelSize } from '../world/modelPacks.js';
import { applyWind } from './foliageWind.js';

// Grass bends much further for its size than a tree does.
const GROUND_SWAY = 0.12;
import { itemBoxes, boxDensity } from '../physics/propBodies.js';

// A pack material set fully transparent is a fault in the source, never an
// intention — the piece could not be seen at all. The Victorian fireplace
// ships this way, which is why no room that placed a hearth ever had one.
function repairOpacity(material) {
  if (material.opacity === 0 && !material.alphaMap) {
    material.transparent = false;
    material.opacity = 1;
  }
  return material;
}

// One loose piece: a cloned scene on a dynamic body. Not instanced — a
// multi-material model is several meshes, and one instanced mesh per part
// cannot be driven by a single body. There are only a handful per room.
function LooseProp({ item, gltf }) {
  const object = useMemo(() => {
    const clone = gltf.scene.clone(true);
    clone.traverse((node) => {
      if (!node.isMesh) return;
      node.castShadow = true;
      node.receiveShadow = true;
      node.material = repairOpacity(node.material.clone());
      node.material.side = THREE.FrontSide;
    });
    return clone;
  }, [gltf]);

  const boxes = itemBoxes(item);
  return (
    <RigidBody
      type="dynamic"
      colliders={false}
      position={item.position}
      rotation={[0, item.yaw ?? 0, 0]}
      density={boxDensity(boxes, item.mass ?? 10)}
      friction={0.9}
      linearDamping={0.5}
      angularDamping={0.8}
    >
      {boxes.map((box, index) => (
        <CuboidCollider key={index} args={box.half} position={box.center} />
      ))}
      <primitive object={object} scale={item.modelScale ?? 1} />
    </RigidBody>
  );
}

// A placement names a model; the registry knows which pack holds it.
const urlFor = (item) => modelUrl(item.model);

const scratchColor = new THREE.Color();

// Big scatters (the lawn tufts run to thousands) split into grid cells so
// frustum culling can drop the cells behind the camera. Small batches stay
// whole: a handful of benches is one draw either way.
const CHUNK = 36;
const CHUNK_MIN = 100;

function splitIntoChunks(placements) {
  if (placements.length < CHUNK_MIN) return [placements];
  const cells = new Map();
  for (const item of placements) {
    const key = `${Math.floor(item.position[0] / CHUNK)}:${Math.floor(item.position[2] / CHUNK)}`;
    const cell = cells.get(key);
    if (cell) cell.push(item);
    else cells.set(key, [item]);
  }
  return [...cells.values()];
}

// Centre and radius of a group's positions, for the distance cull.
function groupBounds(group) {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const item of group) {
    const [x, y, z] = item.position;
    minX = Math.min(minX, x); maxX = Math.max(maxX, x);
    minY = Math.min(minY, y); maxY = Math.max(maxY, y);
    minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z);
  }
  const center = new THREE.Vector3((minX + maxX) / 2, (minY + maxY) / 2, (minZ + maxZ) / 2);
  const radius = Math.hypot(maxX - minX, maxY - minY, maxZ - minZ) / 2;
  return { center, radius };
}

// Renders the GLB pack pieces a zone asked for — Victorian interior sets and
// park set dressing alike. Every converter recentres a piece with its base at
// the origin, so a position is the model's ground-contact point. Repeated
// anchored pieces are instanced; loose ones get their own body.
export default function PropModels({ items }) {
  const urls = useMemo(() => {
    const set = new Set();
    for (const item of items) if (item.model) set.add(urlFor(item));
    return [...set].sort();
  }, [items]);

  const gltfs = useLoader(GLTFLoader, urls, (loader) => loader.setMeshoptDecoder(MeshoptDecoder));
  const byUrl = useMemo(
    () => new Map(urls.map((url, index) => [url, gltfs[index]])),
    [urls, gltfs],
  );
  const loose = useMemo(() => items.filter((item) => item.dynamic), [items]);

  const meshes = useMemo(() => {
    const built = [];

    for (const url of urls) {
      const gltf = byUrl.get(url);
      const placements = items.filter((item) => urlFor(item) === url && !item.dynamic);
      if (!gltf || placements.length === 0) continue;

      // Flatten the model into world-space geometry per material, so each
      // distinct part becomes one InstancedMesh across all placements.
      const parts = [];
      gltf.scene.updateMatrixWorld(true);
      gltf.scene.traverse((node) => {
        if (!node.isMesh) return;
        const geometry = node.geometry.clone();
        geometry.applyMatrix4(node.matrixWorld);
        parts.push({ geometry, material: node.material });
      });

      // A placement may carry a `color` to tint the piece: set dressing from a
      // stylised pack arrives in the pack's own palette, which is rarely the
      // palette of the scene it is being planted in.
      const tinted = placements.some((item) => item.color);
      // Only planting sways. A placement has to ask for it: this renderer also
      // draws the benches, the lampposts, and the railing.
      const windy = placements.every((item) => item.wind);
      // Dense ground cover opts out of the shadow pass: thousands of tufts
      // would double their draw cost for shadows nobody can see.
      const shadowless = placements.every((item) => item.shadow === false);
      const height = modelSize(placements[0].model)[1];
      // The wind patch mutates the source material, so windy parts share one
      // patched material and depth material across every chunk.
      const materials = parts.map((part) => {
        const material = repairOpacity(
          Array.isArray(part.material) ? part.material[0].clone() : part.material.clone(),
        );
        // Side comes from the GLB: the converter already culls backfaces on
        // everything except foliage, whose leaf cards need both.
        // Cutout foliage has to write depth to shadow itself correctly.
        if (material.alphaTest > 0) material.depthWrite = true;
        const depth = windy
          ? applyWind(material, { reference: height, amplitude: GROUND_SWAY, rootShade: 0.74 })
          : null;
        return { material, depth };
      });

      for (const group of splitIntoChunks(placements)) {
        // A placement may name how far it stays visible; the chunk takes the
        // nearest ask. Small pieces vanish long before they stop costing.
        const far = Math.min(...group.map((item) => item.far ?? Infinity));
        const cull = Number.isFinite(far) ? { ...groupBounds(group), far } : null;

        parts.forEach((part, partIndex) => {
          const { material, depth } = materials[partIndex];
          const mesh = new THREE.InstancedMesh(part.geometry, material, group.length);
          if (depth) mesh.customDepthMaterial = depth;
          group.forEach((item, index) => {
            const matrix = new THREE.Matrix4();
            // A scalar scales the piece as one; an array stretches it per
            // axis, which is how one clump model becomes wide, tall, or
            // squat tufts.
            const scale = item.modelScale ?? 1;
            const [sx, sy, sz] = Array.isArray(scale) ? scale : [scale, scale, scale];
            matrix.compose(
              new THREE.Vector3(item.position[0], item.position[1], item.position[2]),
              new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), item.yaw ?? 0),
              new THREE.Vector3(sx, sy, sz),
            );
            mesh.setMatrixAt(index, matrix);
            // Instance colour multiplies the texture, so an untinted
            // placement in a tinted batch has to be explicitly white.
            if (tinted) mesh.setColorAt(index, scratchColor.set(item.color ?? '#ffffff'));
          });
          mesh.instanceMatrix.needsUpdate = true;
          if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
          // Per-chunk bounds, or the frustum test uses the whole-field sphere
          // and never culls anything.
          mesh.computeBoundingSphere();
          mesh.castShadow = !shadowless;
          mesh.receiveShadow = true;
          if (cull) mesh.userData.distanceCull = cull;
          built.push(mesh);
        });
      }
    }
    return built;
  }, [items, urls, byUrl]);

  useEffect(
    () => () => {
      for (const mesh of meshes) {
        mesh.geometry.dispose();
        mesh.material.dispose();
        mesh.dispose();
      }
    },
    [meshes],
  );

  // Chunks past their draw distance stop rendering entirely. The check is a
  // few dozen squared distances; the savings are the vertex work.
  useFrame(({ camera }) => {
    for (const mesh of meshes) {
      const cull = mesh.userData.distanceCull;
      if (!cull) continue;
      const limit = cull.far + cull.radius;
      mesh.visible = camera.position.distanceToSquared(cull.center) <= limit * limit;
    }
  });

  return (
    <group>
      {meshes.map((mesh, index) => (
        <primitive key={index} object={mesh} />
      ))}
      {loose.map((item) => {
        const gltf = byUrl.get(urlFor(item));
        return gltf ? <LooseProp key={item.id} item={item} gltf={gltf} /> : null;
      })}
    </group>
  );
}
