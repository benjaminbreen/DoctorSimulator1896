import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { useFrame, useLoader } from '@react-three/fiber';
import { RigidBody, CuboidCollider, CylinderCollider } from '@react-three/rapier';
import { useFurnitureSound } from './useFurnitureSound.js';
import { itemBoxes, boxDensity } from '../physics/propBodies.js';
import FurnitureColliders from './FurnitureColliders.jsx';
import PropShape from './PropShape.jsx';
import PropMaterial from './PropMaterial.jsx';
import { startLaboratoryBenchDetail, updateLaboratoryBenchDetail } from './propMaterials.js';
import { gameDebug } from '../debug.js';
import { getInteraction, subscribe } from '../world/interaction.js';
import { identifyLandmark } from '../world/landmarkInformation.js';
import { freezeStaticTransforms } from './lib/staticScene.js';

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


function ItemGeometry({ item }) {
  return <PropShape item={item} />;
}

// The shapes that make up one built piece, each at its own local offset. Both
// the loose bodies and the fixed props draw them: a glove left on a bench is
// the same list of parts as a vase, minus the falling over.
function ItemParts({ parts, deferBottleDetail }) {
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
      <PropMaterial item={part} deferBottleDetail={deferBottleDetail} />
    </mesh>
  ));
}

// A loose placeholder piece: mesh and collider ride the same dynamic body.
//
// `parts` makes one body out of several shapes — a flower is a stem and a
// head, and they have to fall together or they are two objects that happen
// to be touching. Each part carries its own local offset and tilt; the body
// takes one collider around the lot, because a cut flower does not need its
// petals simulated.
function DynamicItem({ item, material, frozen }) {
  const bodyRef = useRef(null);
  const response = useFurnitureSound(bodyRef, item);
  const boxes = itemBoxes(item);
  const parts = item.parts ?? null;
  return (
    <RigidBody
      ref={bodyRef}
      userData={{ materialResponse: response }}
      type={frozen ? 'fixed' : 'dynamic'}
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
function surfaceNeeds(items) {
  return {
    bark: items.some(item => item.kind === 'tree' && item.shape === 'cylinder'),
    brick: items.some(item => item.texture === 'brick'),
    paving: items.some(item => ['paving', 'road', 'blockstone'].includes(item.texture)),
  };
}

function surfaceUrls(needs) {
  return [
    ...(needs.bark ? ['/textures/bark_col.webp', '/textures/bark_nrm.webp'] : []),
    ...(needs.brick ? ['/textures/brick_col.webp'] : []),
    ...(needs.paving ? ['/textures/paving_col.webp'] : []),
  ];
}

function LaboratoryBenchDetail({ positions, studyBottles }) {
  useFrame(() => {
    if (!gameDebug.stats.boot.complete) return;
    const [x, y, z] = gameDebug.player.position;
    if (positions.some(([px, py, pz]) => Math.hypot(x - px, y - py, z - pz) < 3.5)) {
      startLaboratoryBenchDetail(studyBottles);
    }
    updateLaboratoryBenchDetail();
  });
  return null;
}

export default function Furniture({ items, runtime, propsReady = true, fixedColliders = true, deferBottleDetail = false }) {
  const hiddenGroup = useHiddenGroup();
  // No dependency list: any re-render may mount static pieces (the ritual
  // hides and restores a group), and new mounts need composing before the
  // freeze prunes them out of the per-frame matrix walk.
  const staticRef = useRef(null);
  useEffect(() => freezeStaticTransforms(staticRef.current));
  // Load only the surfaces this room uses. An interior has no trees, street
  // or facades, and those maps were 7 MB of its first load.
  const needs = useMemo(() => surfaceNeeds(items), [items]);
  const loaded = useLoader(THREE.TextureLoader, surfaceUrls(needs));
  const maps = useMemo(() => {
    const queue = [...loaded];
    const take = (needed, count) => (needed ? queue.splice(0, count) : []);
    const [bark = null, barkNormal = null] = take(needs.bark, 2);
    const [brick = null] = take(needs.brick, 1);
    const [paving = null] = take(needs.paving, 1);
    for (const texture of [bark, brick, paving, barkNormal]) {
      if (!texture) continue;
      texture.wrapS = THREE.RepeatWrapping;
      texture.wrapT = THREE.RepeatWrapping;
      texture.anisotropy = 8;
      if (texture !== barkNormal) texture.colorSpace = THREE.SRGBColorSpace;
    }
    return { bark, barkNormal, brick, paving };
  }, [loaded, needs]);

  // Dynamic pieces carry their own body, so they stay out of the shared
  // fixed one; the catalog models among them belong to VictorianProps.
  const loose = items.filter((item) => item.dynamic && !item.model);
  const pavingClones = useMemo(() => new Map(), [maps]);
  const benchPositions = useMemo(() => items.filter(item => (
    item.finish === 'laboratoryDeal' || item.parts?.some(part => part.finish === 'laboratoryDeal')
  )).map(item => item.position), [items]);

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
    if (item.texture === 'blockstone') {
      // A wall, not a slab: box side faces map u along the box's long axis
      // and v up, so the repeat is length x height. Small tile, so the paving
      // image reads as coursed cut stone.
      const tile = 1.1;
      let stone = pavingClones.get(item.id);
      if (!stone) {
        stone = maps.paving.clone();
        stone.repeat.set(
          Math.max(1, Math.max(item.size[0], item.size[2]) / tile),
          Math.max(0.5, item.size[1] / tile),
        );
        pavingClones.set(item.id, stone);
      }
      return <meshStandardMaterial map={stone} color={item.color ?? '#8a8578'} roughness={0.94} />;
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
      {benchPositions.length > 0 && <LaboratoryBenchDetail positions={benchPositions} studyBottles={deferBottleDetail} />}
      {fixedColliders && <FurnitureColliders items={items} />}
      {loose.map((item) => {
        // Loose pieces hide with their group too: the pipe leaves the table
        // while the ritual's working copy is in the player's hand.
        if (hiddenGroup && item.id.startsWith(`${hiddenGroup}-`)) return null;
        // `awaitProps` holds a piece rigid until the catalog models are in:
        // the vase's table mounts a stage later, and a dynamic vase would
        // spend that gap falling through where the table will be.
        return (
          <DynamicItem
            key={item.id}
            item={item}
            material={materialFor(item)}
            frozen={Boolean(item.awaitProps) && !propsReady}
          />
        );
      })}
      <group ref={staticRef}>
      {items.map((item) => {
        if (hiddenGroup && item.id.startsWith(`${hiddenGroup}-`)) return null;
        // Trees render through the instanced TreeField, catalog pieces
        // through PropModels, framed pictures through WallArt; all still
        // take their colliders here. `render: false` marks collider-only
        // boxes whose visuals live elsewhere (the Gapstow stonework).
        if (
          item.kind === 'tree'
          || item.kind === 'wallArt'
          // StreetBuildings.jsx draws the park's buildings.
          || item.kind === 'backdrop'
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
              <ItemParts parts={item.parts} deferBottleDetail={deferBottleDetail} />
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
