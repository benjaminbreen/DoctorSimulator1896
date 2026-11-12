// Every building in the park zone. Ordinary street buildings are built once,
// when the park loads, and are never swapped for another version. A landmark
// is one authored model, mounted by GameCanvas (see Landmark below).
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useLoader } from '@react-three/fiber';
import MetropolitanClub from './MetropolitanClub.jsx';
import Rooftops from './Rooftops.jsx';
import WindowField from './WindowField.jsx';
import { roofCapTop } from '../world/rooftops.js';
import GildedAgeLandmarks from './GildedAgeLandmarks.jsx';
import { identifyLandmark } from '../world/landmarkInformation.js';
import { freezeStaticTransforms } from './lib/staticScene.js';
import { facadeBrickFinish } from '../world/facade.js';
import { createFacadeMaterial, FACADE_TEXTURE_URLS, prepareFacadeTextures } from './facadeMaterials.js';

function hash01(seed) {
  const value = Math.sin(seed * 12.9898) * 43758.5453;
  return value - Math.floor(value);
}

function idHash(id) {
  let total = 0;
  for (let i = 0; i < id.length; i += 1) total = (total * 31 + id.charCodeAt(i)) | 0;
  return Math.abs(total);
}

// Street buildings: facade sized to the massing, roof cap, chimneys, and a
// water tank on the taller blocks — the 1890s skyline furniture.
function Backdrop({ item, facadeTextures }) {
  const seed = idHash(item.id);
  const facadeMaterial = useMemo(
    () => createFacadeMaterial(
      facadeTextures,
      item.facadeStyle ?? seed % 4,
      seed,
      false,
      item.size[1],
      item.facadeTone,
      false,
      facadeBrickFinish(item)??'smooth',
    ),
    [facadeTextures, item.facadeStyle, item.facadeTone, item.brickFinish, item.frontageFamily, item.size, seed],
  );
  useEffect(() => () => facadeMaterial.dispose(), [facadeMaterial]);
  const capY = item.size[1] / 2 + 0.25;
  const chimneys = 1 + (seed % 3);
  const castsShadow = item.shadows ?? true;
  const identify = item.landmarkLabel
    ? (event) => identifyLandmark(item, event)
    : undefined;
  return (
    <group
      position={item.position}
      rotation={[0, item.yaw ?? 0, 0]}
      onClick={identify}
    >
      <mesh castShadow={castsShadow} receiveShadow>
        <boxGeometry args={item.size} />
        <primitive attach="material" object={facadeMaterial} />
      </mesh>
      <mesh position={[0, capY, 0]} castShadow={castsShadow} receiveShadow>
        <boxGeometry args={[item.size[0] + 0.5, 0.5, item.size[2] + 0.5]} />
        <meshStandardMaterial color="#4c4138" roughness={0.95} />
      </mesh>
      {Array.from({ length: chimneys }, (_, index) => (
        <mesh
          key={index}
          position={[
            (hash01(seed + index * 3) - 0.5) * item.size[0] * 0.7,
            capY + 0.85,
            (hash01(seed + index * 7) - 0.5) * item.size[2] * 0.6,
          ]}
          castShadow={castsShadow}
          receiveShadow
        >
          <boxGeometry args={[0.55, 1.2, 0.55]} />
          <meshStandardMaterial color="#4a3a32" roughness={0.95} />
        </mesh>
      ))}
      {item.roof === 'cone' && (
        <mesh position={[0, capY + 2.4, 0]} castShadow={castsShadow} receiveShadow>
          <coneGeometry args={[Math.min(item.size[0], item.size[2]) * 0.42, 5, 12]} />
          <meshStandardMaterial color="#3e4046" roughness={0.85} />
        </mesh>
      )}
      {item.roof === 'mansard' && (
        <mesh position={[0, capY + 1.5, 0]} rotation={[0, Math.PI / 4, 0]} castShadow={castsShadow} receiveShadow>
          <coneGeometry args={[Math.max(item.size[0], item.size[2]) * 0.6, 3.2, 4]} />
          <meshStandardMaterial color="#43454c" roughness={0.9} />
        </mesh>
      )}
      {!item.roof && item.size[1] > 18 && seed % 3 === 0 && (
        <group position={[item.size[0] * 0.2, capY + 1.3, -item.size[2] * 0.15]}>
          <mesh castShadow={castsShadow} receiveShadow>
            <cylinderGeometry args={[0.95, 1.05, 1.7, 12]} />
            <meshStandardMaterial color="#5a4636" roughness={0.9} />
          </mesh>
          <mesh position={[0, 1.15, 0]} castShadow={castsShadow} receiveShadow>
            <coneGeometry args={[1.1, 0.7, 12]} />
            <meshStandardMaterial color="#4a3a2e" roughness={0.9} />
          </mesh>
        </group>
      )}
    </group>
  );
}

function FacadeBatch({ entries, facadeTextures }) {
  const meshRef = useRef();
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const style = entries[0]?.facadeStyle ?? 0;
  const tone = entries[0]?.facadeTone ?? null;
  const groundStart = entries[0]
    ? entries[0].position[1] - entries[0].size[1] / 2
    : 0;
  const material = useMemo(
    () => createFacadeMaterial(
      facadeTextures,
      style,
      idHash(entries[0]?.id ?? ''),
      false,
      groundStart,
      tone,
      true,
      facadeBrickFinish(entries[0])??'smooth',
    ),
    [entries, facadeTextures, groundStart, style, tone],
  );
  useEffect(() => () => material.dispose(), [material]);
  useLayoutEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    entries.forEach((entry, index) => {
      dummy.position.set(...entry.position);
      dummy.rotation.set(0, entry.yaw ?? 0, 0);
      dummy.scale.set(...entry.size);
      dummy.updateMatrix();
      mesh.setMatrixAt(index, dummy.matrix);
      mesh.setColorAt(
        index,
        new THREE.Color('#ffffff').offsetHSL(0, 0, (hash01(idHash(entry.id)) - 0.5) * 0.08),
      );
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [dummy, entries]);
  return (
    // Street masses share batches by material and brick finish, so the
    // complete masses can afford to cast. Leaving this off did not remove
    // building shadows altogether: WindowField's projecting trim still cast,
    // producing stray sill-and-stoop marks with no wall silhouette around
    // them.
    <instancedMesh
      ref={meshRef}
      args={[undefined, undefined, entries.length]}
      castShadow
      receiveShadow
    >
      <boxGeometry args={[1, 1, 1]} />
      <primitive attach="material" object={material} />
    </instancedMesh>
  );
}

function MansardBatch({ entries }) {
  const meshRef = useRef();
  const dummy = useMemo(() => new THREE.Object3D(), []);
  useLayoutEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    entries.forEach((entry, index) => {
      const radius = Math.max(entry.size[0], entry.size[2]) * 0.6;
      dummy.position.set(
        entry.position[0],
        entry.position[1] + entry.size[1] / 2 + 1.75,
        entry.position[2],
      );
      dummy.rotation.set(0, Math.PI / 4, 0);
      dummy.scale.set(radius, 3.2, radius);
      dummy.updateMatrix();
      mesh.setMatrixAt(index, dummy.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
  }, [dummy, entries]);
  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, entries.length]} castShadow receiveShadow>
      <coneGeometry args={[1, 1, 4]} />
      <meshStandardMaterial color="#43454c" roughness={0.9} />
    </instancedMesh>
  );
}

function ProceduralFacades({ items, facadeTextures }) {
  const { batches, caps, mansards } = useMemo(() => {
    const grouped = new Map();
    const roofCaps = [];
    const mansardRoofs = [];
    for (const item of items) {
      if (item.kind !== 'backdrop' || !item.frontageFamily || item.landmarkLabel) continue;
      const key = `${item.facadeStyle ?? 0}:${Number.isInteger(item.facadeTone) ? item.facadeTone : 'default'}:${facadeBrickFinish(item)??'stone'}`;
      const batch = grouped.get(key) ?? [];
      batch.push(item);
      grouped.set(key, batch);
      roofCaps.push({
        id: `${item.id}-roof-cap`,
        position: [item.position[0], roofCapTop(item) - 0.25, item.position[2]],
        size: [item.size[0] + 0.5, 0.5, item.size[2] + 0.5],
        // Match the crown to its stone family; brick keeps a painted cornice.
        color: ['#57453a','#4c4138','#9a8f7d','#4c433b','#b7af9e','#77746b'][item.facadeStyle??0],
      });
      // Tar and gravel flat roof inside the cornice, so the stone colour above
      // stays on the cap's edge and does not cover the whole roof.
      roofCaps.push({
        id: `${item.id}-roof`,
        position: [item.position[0], roofCapTop(item) + 0.02, item.position[2]],
        size: [item.size[0] - 0.3, 0.05, item.size[2] - 0.3],
        color: hash01(idHash(item.id)) < 0.5 ? '#3d3a36' : '#45403a',
      });
      if (item.roof === 'mansard') mansardRoofs.push(item);
    }
    return {
      batches: [...grouped.entries()],
      caps: roofCaps,
      mansards: mansardRoofs,
    };
  }, [items]);
  return (
    <group>
      {batches.map(([key, entries]) => (
        <FacadeBatch key={key} entries={entries} facadeTextures={facadeTextures} />
      ))}
      <InfillBatch entries={caps} />
      <Rooftops items={items} />
      <MansardBatch entries={mansards} />
    </group>
  );
}

function InfillBatch({ entries }) {
  const meshRef = useRef();
  const dummy = useMemo(() => new THREE.Object3D(), []);
  useLayoutEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    entries.forEach((entry, index) => {
      dummy.position.set(...entry.position);
      dummy.rotation.set(0, entry.yaw ?? 0, 0);
      dummy.scale.set(...entry.size);
      dummy.updateMatrix();
      mesh.setMatrixAt(index, dummy.matrix);
      mesh.setColorAt(index, new THREE.Color(entry.color ?? '#716e65'));
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [dummy, entries]);

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, entries.length]} receiveShadow>
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial roughness={0.95} />
    </instancedMesh>
  );
}

function BlockInfill({ items }) {
  const batches = useMemo(() => {
    const grouped = new Map();
    for (const item of items) {
      if (item.kind !== 'block-infill') continue;
      const batch = grouped.get(item.infillType) ?? [];
      batch.push(item);
      grouped.set(item.infillType, batch);
    }
    return [...grouped.entries()];
  }, [items]);
  return batches.map(([type, entries]) => <InfillBatch key={type} entries={entries} />);
}

function useFacadeTextures() {
  const sources = useLoader(THREE.TextureLoader, FACADE_TEXTURE_URLS);
  return useMemo(() => prepareFacadeTextures(sources), [sources]);
}

// One authored landmark: the Metropolitan Club or a GildedAgeLandmarks model.
export function Landmark({ item, runtime }) {
  const facades = useFacadeTextures();
  const items = useMemo(() => [item], [item]);
  if (item.landmarkModel === 'metropolitan-club') {
    return <group ref={freezeStaticTransforms}><MetropolitanClub item={item} /></group>;
  }
  return <GildedAgeLandmarks items={items} facadeTextures={facades} runtime={runtime} />;
}

// items: every backdrop without a landmark model, plus the block infill.
// groups: the same buildings split by district, so each batch of windows can
// be skipped when its district is out of view.
export default function StreetBuildings({ items, groups, runtime, simple }) {
  const facades = useFacadeTextures();
  return (
    <group name="street buildings">
      <group ref={freezeStaticTransforms}>
        <BlockInfill items={items} />
        <ProceduralFacades items={items} facadeTextures={facades} />
        {items.map((item) => (item.kind === 'backdrop' && !(item.frontageFamily && !item.landmarkLabel)
          ? <Backdrop key={item.id} item={item} facadeTextures={facades} /> : null))}
      </group>
      {groups.map((group, index) => <WindowField key={index} items={group} runtime={runtime} simple={simple} alley={index === 0} />)}
    </group>
  );
}
