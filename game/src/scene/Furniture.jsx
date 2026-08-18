import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { useLoader } from '@react-three/fiber';
import { RigidBody, CuboidCollider, CylinderCollider } from '@react-three/rapier';
import { itemBoxes, boxDensity, rotateOffset } from '../physics/propBodies.js';
import PropShape from './PropShape.jsx';
import PropMaterial from './PropMaterial.jsx';
import MetropolitanClub from './MetropolitanClub.jsx';
import GildedAgeLandmarks, { isGildedAgeLandmark } from './GildedAgeLandmarks.jsx';
import { getInteraction, subscribe } from '../world/interaction.js';
import { identifyLandmark } from '../world/landmarkInformation.js';
import { freezeStaticTransforms } from './lib/staticScene.js';
import {
  createFacadeMaterial,
  FACADE_TEXTURE_URLS,
  prepareFacadeTextures,
} from './facadeMaterials.js';

// An interaction that draws its own working copy of a prop — the instrument
// stage, the pipe in the player's hand — names the group it replaces, and the
// room's copy comes down for the duration or the two fight for the same space.
//
// It rides the interaction and not the prop's affordance: examining the pipe
// is also an interaction with it, and hiding the thing you asked to look at
// leaves the camera framing an empty table.
function useHiddenGroup() {
  const [group, setGroup] = useState(() => getInteraction().using?.hideGroup ?? null);
  useEffect(() => subscribe((state) => setGroup(state.using?.hideGroup ?? null)), []);
  return group;
}

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
    ),
    [facadeTextures, item.facadeStyle, item.facadeTone, item.size, seed],
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
    // These 131 street buildings collapse to seven material batches, so the
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
  const { batches, caps, chimneys, mansards } = useMemo(() => {
    const grouped = new Map();
    const roofCaps = [];
    const chimneyPots = [];
    const mansardRoofs = [];
    for (const item of items) {
      if (item.kind !== 'backdrop' || !item.frontageFamily || item.landmarkLabel) continue;
      const key = `${item.facadeStyle ?? 0}:${Number.isInteger(item.facadeTone) ? item.facadeTone : 'default'}`;
      const batch = grouped.get(key) ?? [];
      batch.push(item);
      grouped.set(key, batch);
      roofCaps.push({
        id: `${item.id}-roof-cap`,
        position: [item.position[0], item.position[1] + item.size[1] / 2 + 0.25, item.position[2]],
        size: [item.size[0] + 0.5, 0.5, item.size[2] + 0.5],
        color: '#4c4138',
      });
      const chimneySeed = idHash(item.id);
      chimneyPots.push({
        id: `${item.id}-chimney`,
        position: [
          item.position[0] + (hash01(chimneySeed) - 0.5) * item.size[0] * 0.45,
          item.position[1] + item.size[1] / 2 + 1.05,
          item.position[2] + (hash01(chimneySeed * 2.7) - 0.5) * item.size[2] * 0.4,
        ],
        size: [0.48, 1.1, 0.48],
        color: item.facadeStyle === 1 ? '#51382e' : '#4a3a32',
      });
      if (item.roof === 'mansard') mansardRoofs.push(item);
    }
    return {
      batches: [...grouped.entries()],
      caps: roofCaps,
      chimneys: chimneyPots,
      mansards: mansardRoofs,
    };
  }, [items]);
  return (
    <group>
      {batches.map(([key, entries]) => (
        <FacadeBatch key={key} entries={entries} facadeTextures={facadeTextures} />
      ))}
      <InfillBatch entries={caps} />
      <InfillBatch entries={chimneys} />
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
      <meshStandardMaterial vertexColors roughness={0.95} />
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

function ItemGeometry({ item }) {
  return <PropShape item={item} />;
}

// The shapes that make up one built piece, each at its own local offset. Both
// the loose bodies and the fixed props draw them: a glove left on a bench is
// the same list of parts as a vase, minus the falling over.
function ItemParts({ parts }) {
  return parts.map((part, index) => (
    <mesh
      key={index}
      position={part.position}
      rotation={part.rotation ?? [0, 0, 0]}
      renderOrder={part.renderOrder ?? 0}
      castShadow={part.castShadow ?? true}
      receiveShadow={part.receiveShadow ?? true}
    >
      <ItemGeometry item={part} />
      <PropMaterial item={part} />
    </mesh>
  ));
}

function ItemCollider({ item }) {
  if (item.shape === 'cylinder' || item.shape === 'tree') {
    return <CylinderCollider args={[item.size[1] / 2, item.size[0] / 2]} position={item.position} />;
  }
  if (item.colliderQuaternion) {
    return (
      <CuboidCollider
        args={[item.size[0] / 2, item.size[1] / 2, item.size[2] / 2]}
        position={item.position}
        quaternion={item.colliderQuaternion}
      />
    );
  }
  // Tilted props (planks, awnings) keep a single box: the compound offsets
  // below only rotate about Y.
  if (item.rotation) {
    return (
      <CuboidCollider
        args={[item.size[0] / 2, item.size[1] / 2, item.size[2] / 2]}
        position={item.position}
        rotation={item.rotation}
      />
    );
  }
  const yaw = item.yaw ?? 0;
  return itemBoxes(item).map((box, index) => (
    <CuboidCollider
      key={index}
      args={box.half}
      position={rotateOffset(item.position, box.center, yaw)}
      rotation={[0, yaw, 0]}
    />
  ));
}

// A loose placeholder piece: mesh and collider ride the same dynamic body.
//
// `parts` makes one body out of several shapes — a flower is a stem and a
// head, and they have to fall together or they are two objects that happen
// to be touching. Each part carries its own local offset and tilt; the body
// takes one collider around the lot, because a cut flower does not need its
// petals simulated.
function DynamicItem({ item, material }) {
  const boxes = itemBoxes(item);
  const parts = item.parts ?? null;
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
      {item.shape === 'cylinder' ? (
        <CylinderCollider args={[item.size[1] / 2, item.size[0] / 2]} />
      ) : (
        boxes.map((box, index) => (
          <CuboidCollider key={index} args={box.half} position={box.center} />
        ))
      )}
      {parts ? (
        <ItemParts parts={parts} />
      ) : (
        <mesh castShadow receiveShadow>
          <ItemGeometry item={item} />
          {material}
        </mesh>
      )}
    </RigidBody>
  );
}

// Placeholder props: box, cylinder, sphere, or cone per blueprint entry, mesh
// and collider from the same data. `collider: false` marks decor, `dynamic`
// marks a piece loose enough to push around.
export default function Furniture({ items, runtime }) {
  const hiddenGroup = useHiddenGroup();
  // No dependency list: any re-render may mount static pieces (the ritual
  // hides and restores a group), and new mounts need composing before the
  // freeze prunes them out of the per-frame matrix walk.
  const staticRef = useRef(null);
  useEffect(() => freezeStaticTransforms(staticRef.current));
  const [barkCol, barkNrm, brickCol, pavingCol, ...facadeSources] = useLoader(THREE.TextureLoader, [
    '/textures/bark_col.webp',
    '/textures/bark_nrm.webp',
    '/textures/brick_col.webp',
    '/textures/paving_col.webp',
    ...FACADE_TEXTURE_URLS,
  ]);
  const maps = useMemo(() => {
    for (const texture of [barkCol, brickCol, pavingCol, barkNrm]) {
      texture.wrapS = THREE.RepeatWrapping;
      texture.wrapT = THREE.RepeatWrapping;
    }
    barkCol.colorSpace = THREE.SRGBColorSpace;
    brickCol.colorSpace = THREE.SRGBColorSpace;
    pavingCol.colorSpace = THREE.SRGBColorSpace;
    const facades = prepareFacadeTextures(facadeSources);
    return { bark: barkCol, barkNormal: barkNrm, brick: brickCol, paving: pavingCol, facades };
  }, [barkCol, barkNrm, brickCol, pavingCol, ...facadeSources]);

  // Dynamic pieces carry their own body, so they stay out of the shared
  // fixed one; the catalog models among them belong to VictorianProps.
  const solid = items.filter((item) => item.collider !== false && !item.dynamic);
  const loose = items.filter((item) => item.dynamic && !item.model);
  const pavingClones = useMemo(() => new Map(), [maps]);

  function materialFor(item) {
    if (item.kind === 'tree' && item.shape === 'cylinder') {
      return <meshStandardMaterial map={maps.bark} normalMap={maps.barkNormal} color="#b0a294" roughness={0.9} />;
    }
    if (item.texture === 'brick') {
      return <meshStandardMaterial map={maps.brick} roughness={0.85} />;
    }
    if (item.texture === 'paving' || item.texture === 'road') {
      // Clone per item so the repeat matches its footprint; roads tile finer
      // (granite setts) and carry a darker tint.
      const tile = item.texture === 'road' ? 1.7 : 2.4;
      let paving = pavingClones.get(item.id);
      if (!paving) {
        paving = maps.paving.clone();
        paving.repeat.set(Math.max(1, item.size[0] / tile), Math.max(1, item.size[2] / tile));
        pavingClones.set(item.id, paving);
      }
      return <meshStandardMaterial map={paving} color={item.color ?? '#ffffff'} roughness={0.9} />;
    }
    if (item.glass) {
      return <PropMaterial item={item} />;
    }
    // Cast iron and painted metal pick up the sky; wood and stone stay flat.
    if (item.metal) {
      return (
        <meshStandardMaterial
          color={item.color ?? '#33383c'}
          metalness={0.85}
          roughness={0.38}
          envMapIntensity={0.8}
        />
      );
    }
    // A named finish carries its own texture and physical properties; the
    // fallback is the painted-wood look the placeholder boxes have always had.
    if (item.finish) return <PropMaterial item={item} />;
    return (
      <meshStandardMaterial
        color={item.color ?? '#4a3826'}
        roughness={item.roughness ?? 0.8}
        metalness={item.metalness ?? 0}
        emissive={item.emissive ?? '#000000'}
        emissiveIntensity={item.emissive ? 2.2 : 0}
      />
    );
  }

  return (
    <group>
      <GildedAgeLandmarks items={items} facadeTextures={maps.facades} runtime={runtime} />
      <RigidBody type="fixed" colliders={false}>
        {solid.map((item) => (
          <ItemCollider key={item.id} item={item} />
        ))}
      </RigidBody>
      {loose.map((item) => {
        // Loose pieces hide with their group too: the pipe leaves the table
        // while the ritual's working copy is in the player's hand.
        if (hiddenGroup && item.id.startsWith(`${hiddenGroup}-`)) return null;
        return <DynamicItem key={item.id} item={item} material={materialFor(item)} />;
      })}
      <group ref={staticRef}>
      <BlockInfill items={items} />
      <ProceduralFacades items={items} facadeTextures={maps.facades} />
      {items.map((item) => {
        if (hiddenGroup && item.id.startsWith(`${hiddenGroup}-`)) return null;
        if (item.kind === 'backdrop') {
          if (item.landmarkModel === 'metropolitan-club') {
            return <MetropolitanClub key={item.id} item={item} />;
          }
          if (isGildedAgeLandmark(item)) return null;
          if (item.frontageFamily && !item.landmarkLabel) return null;
          return <Backdrop key={item.id} item={item} facadeTextures={maps.facades} />;
        }
        // Trees render through the instanced TreeField, catalog pieces
        // through PropModels, framed pictures through WallArt; all still
        // take their colliders here. `render: false` marks collider-only
        // boxes whose visuals live elsewhere (the Gapstow stonework).
        if (
          item.kind === 'tree'
          || item.kind === 'wallArt'
          || item.kind === 'block-infill'
          || item.model
          || item.dynamic
          || item.render === false
        ) return null;
        // A fixed piece may be built of parts too — a dropped glove, the
        // petals under a vase. Without this it draws as its bounding box.
        if (item.parts?.length) {
          return (
            <group key={item.id} position={item.position} rotation={[0, item.yaw ?? 0, 0]}>
              <ItemParts parts={item.parts} />
            </group>
          );
        }
        return (
          <mesh
            key={item.id}
            position={item.position}
            rotation={item.rotation ?? [0, item.yaw ?? 0, 0]}
            onClick={item.landmarkLabel
              ? (event) => identifyLandmark(item, event)
              : undefined}
            castShadow={item.collider !== false || item.shape === 'sphere'}
            receiveShadow
          >
            <ItemGeometry item={item} />
            {materialFor(item)}
          </mesh>
        );
      })}
      </group>
    </group>
  );
}
