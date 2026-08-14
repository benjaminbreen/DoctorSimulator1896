import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { useLoader } from '@react-three/fiber';
import { RigidBody, CuboidCollider } from '@react-three/rapier';
import { lobbyMosaicTexture, netherlandMosaicTexture, woodTexture, plasterTexture, marbleSurface } from './textures.js';
import { propTexture } from './propMaterials.js';
import { surfaceUrl } from '../world/victorianCatalog.js';

// Door-leaf wood, repeated to the leaf's size. Shared across mounts.
const doorMapCache = new Map();
function doorMap(width, height) {
  const key = `${width.toFixed(2)}:${height.toFixed(2)}`;
  if (!doorMapCache.has(key)) {
    const source = propTexture('mahogany');
    const map = source ? source.clone() : null;
    if (map) {
      map.repeat.set(width / 0.3, height / 0.3);
      map.needsUpdate = true;
    }
    doorMapCache.set(key, map);
  }
  return doorMapCache.get(key);
}

// One paneled door leaf, built from the hinge outward along local +x:
// stiles and rails proud, four recessed panels, a brass knob. The silhouette
// is what makes it read as a door instead of a slab.
function DoorLeaf({ width, height, hinge, yaw }) {
  const t = 0.055;
  const stile = 0.13;
  const map = doorMap(width, height);
  const panelWidth = width / 2 - stile - 0.045;
  const lockY = Math.min(1.0, height * 0.38);
  const upperY = (lockY + 0.07 + height - 0.14) / 2;
  const upperH = height - 0.14 - lockY - 0.07 - 0.06;
  const lowerY = (0.22 + lockY - 0.07) / 2;
  const lowerH = lockY - 0.07 - 0.22 - 0.06;
  const frame = [
    { position: [stile / 2, height / 2, 0], size: [stile, height, t] },
    { position: [width - stile / 2, height / 2, 0], size: [stile, height, t] },
    { position: [width / 2, height / 2, 0], size: [0.1, height, t] },
    { position: [width / 2, height - 0.07, 0], size: [width, 0.14, t] },
    { position: [width / 2, lockY, 0], size: [width, 0.14, t] },
    { position: [width / 2, 0.11, 0], size: [width, 0.22, t] },
  ];
  const panels = [];
  for (const side of [0, 1]) {
    const x = side ? width - stile - panelWidth / 2 - 0.015 : stile + panelWidth / 2 + 0.015;
    panels.push({ position: [x, upperY, 0], size: [panelWidth, Math.max(upperH, 0.2), t * 0.5] });
    panels.push({ position: [x, lowerY, 0], size: [panelWidth, Math.max(lowerH, 0.2), t * 0.5] });
  }
  return (
    <group position={hinge} rotation={[0, yaw, 0]}>
      {frame.map((part, index) => (
        <mesh key={`frame-${index}`} position={part.position} castShadow>
          <boxGeometry args={part.size} />
          <meshStandardMaterial map={map} roughness={0.42} />
        </mesh>
      ))}
      {panels.map((part, index) => (
        <mesh key={`panel-${index}`} position={part.position}>
          <boxGeometry args={part.size} />
          <meshStandardMaterial map={map} color="#c9beb2" roughness={0.5} />
        </mesh>
      ))}
      <mesh position={[width - 0.2, lockY + 0.06, t / 2 + 0.03]}>
        <sphereGeometry args={[0.035, 12, 10]} />
        <meshStandardMaterial color="#8a6b2e" metalness={0.9} roughness={0.35} />
      </mesh>
    </group>
  );
}

// Blocked doors draw their leaves here: closed in the opening, or — for
// `open` doors — swung into the room, with WindowSky showing beyond.
function DoorLeaves({ hole }) {
  const alongX = hole.normal[2] !== 0;
  const axis = alongX ? 0 : 2;
  const double = hole.width >= 1.4;
  const OPEN = 1.92;
  const bottom = hole.position[1] - hole.height / 2;
  const leaves = [];
  const sides = double ? [-1, 1] : [-1];
  for (const dir of sides.map((side) => -side)) {
    // dir +1: hinge at the low end of the axis, leaf extending positive.
    const leafWidth = double ? hole.width / 2 - 0.01 : hole.width - 0.02;
    const hinge = [...hole.position];
    hinge[1] = bottom + 0.01;
    hinge[axis] += -dir * hole.width / 2 + dir * 0.01;
    const baseYaw = alongX ? (dir > 0 ? 0 : Math.PI) : (dir > 0 ? -Math.PI / 2 : Math.PI / 2);
    // Sign worked out so an open leaf's tip swings to the room side of the
    // wall (opposite the hole normal) for either wall orientation.
    const swingFactor = alongX ? Math.sign(hole.normal[2]) : -Math.sign(hole.normal[0]);
    const swing = hole.open ? dir * swingFactor * OPEN : 0;
    leaves.push(
      <DoorLeaf
        key={dir}
        width={leafWidth}
        height={hole.height - 0.04}
        hinge={hinge}
        yaw={baseYaw + swing}
      />,
    );
  }
  return <group>{leaves}</group>;
}

// Seamless wall/floor images from the Victorian pack, when a room names
// them. Both slots always load together so the hook order stays stable.
function useLoaderMaps(wallName, floorName) {
  const packWallName = wallName?.startsWith('procedural/') ? null : wallName;
  const packFloorName = floorName?.startsWith('procedural/') ? null : floorName;
  const urls = [
    packWallName ? surfaceUrl(packWallName) : surfaceUrl('victorian/Plaster01'),
    packFloorName ? surfaceUrl(packFloorName) : surfaceUrl('victorian/WoodenFloor_01'),
  ];
  const [wall, floor] = useLoader(THREE.TextureLoader, urls);
  return useMemo(() => {
    for (const texture of [wall, floor]) {
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    }
    return { wall: packWallName ? wall : null, floor: packFloorName ? floor : null };
  }, [wall, floor, packWallName, packFloorName]);
}

// Joinery around an opening. Not a flat band: a period casing is a wide
// outer architrave with a bead standing proud of it, a head that oversails
// the jambs, and — on a window — a projecting sill with an apron under it.
// The steps are what catch the light; one flat board reads as paint.
// Visual only — the derived wall boxes stay the collision truth.
function OpeningFrame({ hole, color }) {
  const alongX = hole.normal[2] !== 0;
  const depth = hole.thickness + 0.06;
  const casing = 0.14;
  const bead = 0.05;
  const box = (along, y, alongSize, ySize, depthSize) => ({
    position: alongX
      ? [hole.position[0] + along, y, hole.position[2]]
      : [hole.position[0], y, hole.position[2] + along],
    size: alongX ? [alongSize, ySize, depthSize] : [depthSize, ySize, alongSize],
  });
  const top = hole.position[1] + hole.height / 2;
  const half = hole.width / 2;
  const parts = [];
  // Joinery flush with the opening shares planes with the derived wall
  // boxes and z-fights. Every part overlaps into the opening by this much.
  const nudge = 0.012;

  for (const side of [-1, 1]) {
    // Outer architrave, then a narrower bead set on top of it and standing
    // into the room.
    parts.push(box(side * (half + casing / 2 - nudge), hole.position[1], casing, hole.height + casing, depth));
    parts.push(box(side * (half + bead / 2 - nudge), hole.position[1], bead, hole.height + 0.02, depth + 0.05));
  }
  parts.push(box(0, top + casing / 2 - nudge, hole.width + casing * 2, casing, depth));
  parts.push(box(0, top + bead / 2 - nudge, hole.width + bead * 2, bead, depth + 0.05));
  // Head moulding: a thin cap oversailing the casing on both sides.
  parts.push(box(0, top + casing + 0.03, hole.width + casing * 2 + 0.1, 0.06, depth + 0.09));

  if (hole.type === 'window') {
    const sill = hole.position[1] - hole.height / 2;
    // Sill board proud of the wall box under the window, not level with it.
    parts.push(box(0, sill - 0.04 + nudge, hole.width + casing * 2 + 0.12, 0.08, depth + 0.12));
    parts.push(box(0, sill - 0.18, hole.width + casing * 0.6, 0.2, depth + 0.02));
  }
  return (
    <group>
      {parts.map((part, index) => (
        <mesh key={index} position={part.position} castShadow>
          <boxGeometry args={part.size} />
          {/* Joinery was painted or varnished and reads glossy against flat
              wallpaper. The contrast in sheen does more for the period than
              either surface does alone. */}
          <meshStandardMaterial color={color} roughness={0.42} />
        </mesh>
      ))}
      {hole.type === 'door' && hole.blocked && <DoorLeaves hole={hole} />}
    </group>
  );
}

// Room shell: meshes and fixed colliders both come from the derived blueprint
// boxes, so they can never drift apart. Exterior zones let Terrain own the
// ground; only blockers and any walls remain here.
export default function Room({ room, lighting }) {
  const colors = lighting.materials;
  // Generated interiors name a seamless surface from the Victorian pack;
  // hand-authored rooms fall back to the canvas textures.
  const packMaps = useLoaderMaps(colors.wallTexture, colors.floorTexture);
  const floorMap = useMemo(() => {
    if (room.exterior) return null;
    // Marble floors are drawn once at the floor's real size — slab joints
    // instead of a repeat, so nothing tiles.
    if (colors.floorTexture === 'procedural/marble') {
      return marbleSurface(room.floor.size[0], room.floor.size[2], {
        seed: 7,
        base: colors.floor,
        slabGrid: 1.45,
        roughnessBase: 0.3,
      });
    }
    const mosaic =
      colors.floorTexture === 'procedural/lobby-mosaic' ||
      colors.floorTexture === 'procedural/netherland-mosaic';
    const mosaicSource =
      colors.floorTexture === 'procedural/netherland-mosaic' ? netherlandMosaicTexture() : lobbyMosaicTexture();
    const texture = (mosaic ? mosaicSource : (packMaps.floor ?? woodTexture(colors.floor))).clone();
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.needsUpdate = true;
    // The pack's parquet tile is about 1.6m across; the canvas fallback was
    // authored for 2.4m.
    const tile = mosaic ? 1.0 : (packMaps.floor ? 1.6 : 2.4);
    texture.repeat.set(room.floor.size[0] / tile, room.floor.size[2] / tile);
    return { map: texture };
  }, [room, colors, packMaps]);
  // Annex slabs repeat by their own footprint, or the boards change scale
  // at the doorway.
  const patchFloorMaps = useMemo(() => {
    if (room.exterior || !room.floorPatches?.length) return [];
    const source = packMaps.floor ?? woodTexture(colors.floor);
    const tile = packMaps.floor ? 1.6 : 2.4;
    return room.floorPatches.map((patch) => {
      const texture = source.clone();
      texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
      texture.repeat.set(patch.size[0] / tile, patch.size[2] / tile);
      texture.needsUpdate = true;
      return texture;
    });
  }, [room, colors, packMaps]);
  useEffect(() => {
    if (!patchFloorMaps.length) return undefined;
    return () => {
      for (const texture of patchFloorMaps) texture.dispose();
    };
  }, [patchFloorMaps]);
  // A box's UVs run 0..1 per face whatever its size, so one shared repeat
  // count prints the paper at a different scale on every wall — a six-metre
  // wall and the pier beside a window end up with visibly different patterns
  // meeting at the corner. One texture per distinct box size instead, each
  // repeat worked out from the box, so the drop is the same width everywhere.
  const wallMaps = useMemo(() => {
    if (room.exterior) return null;
    const marble = colors.wallTexture === 'procedural/marble';
    const source = marble ? null : (packMaps.wall ?? plasterTexture(colors.wall));
    const tile = packMaps.wall ? 1.15 : 1.6;
    const cache = new Map();
    let seed = 11;
    for (const box of room.wallBoxes) {
      const along = Math.max(box.size[0], box.size[2]);
      const key = `${along.toFixed(2)}:${box.size[1].toFixed(2)}`;
      if (cache.has(key)) continue;
      // Marble is drawn per distinct wall size, mapped once across the box:
      // no repeat, so no visible tiling. Same-size boxes share a slab, which
      // reads as book-matching rather than a fault.
      if (marble) {
        seed += 13;
        cache.set(key, marbleSurface(along, box.size[1], { seed, base: colors.wall, roughnessBase: 0.42 }));
        continue;
      }
      const texture = source.clone();
      texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
      texture.repeat.set(Math.max(along / tile, 0.4), Math.max(box.size[1] / tile, 0.4));
      texture.needsUpdate = true;
      cache.set(key, { map: texture });
    }
    return cache;
  }, [room, colors, packMaps]);

  const wallMapFor = (box) =>
    wallMaps?.get(`${Math.max(box.size[0], box.size[2]).toFixed(2)}:${box.size[1].toFixed(2)}`) ?? null;

  useEffect(() => {
    if (!wallMaps) return undefined;
    return () => {
      // Marble sets are cached module-wide and shared across mounts.
      for (const entry of wallMaps.values()) {
        if (!entry.shared) entry.map.dispose();
      }
    };
  }, [wallMaps]);

  const colliderBoxes = [
    ...(room.exterior ? [] : [room.floor]),
    ...(room.ceiling ? [room.ceiling] : []),
    ...(room.floorPatches ?? []),
    ...(room.ceilingPatches ?? []),
    ...room.wallBoxes,
    ...room.blockerBoxes,
  ];

  return (
    <group>
      <RigidBody type="fixed" colliders={false}>
        {colliderBoxes.map((box) => (
          <CuboidCollider
            key={box.id}
            args={[box.size[0] / 2, box.size[1] / 2, box.size[2] / 2]}
            position={box.position}
            rotation={[0, box.yaw ?? 0, 0]}
          />
        ))}
      </RigidBody>
      {!room.exterior && (
        <mesh position={room.floor.position} receiveShadow>
          <boxGeometry args={room.floor.size} />
          {/* Pack textures already carry their colour, so they go untinted;
              variety comes from which one the room picked. */}
          {/* Waxed boards: enough sheen to carry a window's reflection down
              the room, not enough to read as varnish. */}
          <meshStandardMaterial
            map={floorMap?.map ?? null}
            roughnessMap={floorMap?.roughnessMap ?? null}
            roughness={colors.floorRoughness ?? 0.56}
          />
        </mesh>
      )}
      {room.ceiling && (
        <mesh position={room.ceiling.position} castShadow>
          <boxGeometry args={room.ceiling.size} />
          <meshStandardMaterial color={colors.ceiling} roughness={0.95} />
        </mesh>
      )}
      {(room.floorPatches ?? []).map((patch, index) => (
        <mesh key={patch.id} position={patch.position} receiveShadow>
          <boxGeometry args={patch.size} />
          <meshStandardMaterial map={patchFloorMaps[index] ?? null} roughness={0.56} />
        </mesh>
      ))}
      {(room.ceilingPatches ?? []).map((patch) => (
        <mesh key={patch.id} position={patch.position} castShadow>
          <boxGeometry args={patch.size} />
          <meshStandardMaterial color={colors.ceiling} roughness={0.95} />
        </mesh>
      ))}
      {room.wallBoxes.map((box) => (
        <mesh key={box.id} position={box.position} castShadow receiveShadow>
          <boxGeometry args={box.size} />
          <meshStandardMaterial
            map={wallMapFor(box)?.map ?? null}
            roughnessMap={wallMapFor(box)?.roughnessMap ?? null}
            roughness={colors.wallRoughness ?? 0.88}
          />
        </mesh>
      ))}
      {room.openingHoles.map((hole) => (
        <OpeningFrame key={`${hole.id}:frame`} hole={hole} color={colors.trim ?? '#3a2c1e'} />
      ))}
    </group>
  );
}
