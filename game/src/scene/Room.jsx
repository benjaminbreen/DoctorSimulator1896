import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { useLoader } from '@react-three/fiber';
import { RigidBody, CuboidCollider } from '@react-three/rapier';
import { woodTexture, plasterTexture } from './textures.js';
import { surfaceUrl } from '../world/victorianCatalog.js';

// Seamless wall/floor images from the Victorian pack, when a room names
// them. Both slots always load together so the hook order stays stable.
function useLoaderMaps(wallName, floorName) {
  const urls = [
    wallName ? surfaceUrl(wallName) : surfaceUrl('victorian/Plaster01'),
    floorName ? surfaceUrl(floorName) : surfaceUrl('victorian/WoodenFloor_01'),
  ];
  const [wall, floor] = useLoader(THREE.TextureLoader, urls);
  return useMemo(() => {
    for (const texture of [wall, floor]) {
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    }
    return { wall: wallName ? wall : null, floor: floorName ? floor : null };
  }, [wall, floor, wallName, floorName]);
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
  // Blocked doors get a closed leaf so the opening is not a black void.
  // Slightly under opening size so its edges clear the reveal planes.
  const leaf =
    hole.type === 'door' && hole.blocked
      ? box(0, hole.position[1] - 0.01, hole.width - 0.02, hole.height - 0.02, 0.05)
      : null;
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
      {leaf && (
        <mesh position={leaf.position}>
          <boxGeometry args={leaf.size} />
          <meshStandardMaterial color={color} roughness={0.4} />
        </mesh>
      )}
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
    const texture = (packMaps.floor ?? woodTexture(colors.floor)).clone();
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.needsUpdate = true;
    // The pack's parquet tile is about 1.6m across; the canvas fallback was
    // authored for 2.4m.
    const tile = packMaps.floor ? 1.6 : 2.4;
    texture.repeat.set(room.floor.size[0] / tile, room.floor.size[2] / tile);
    return texture;
  }, [room, colors, packMaps]);
  // A box's UVs run 0..1 per face whatever its size, so one shared repeat
  // count prints the paper at a different scale on every wall — a six-metre
  // wall and the pier beside a window end up with visibly different patterns
  // meeting at the corner. One texture per distinct box size instead, each
  // repeat worked out from the box, so the drop is the same width everywhere.
  const wallMaps = useMemo(() => {
    if (room.exterior) return null;
    const source = packMaps.wall ?? plasterTexture(colors.wall);
    const tile = packMaps.wall ? 1.15 : 1.6;
    const cache = new Map();
    for (const box of room.wallBoxes) {
      const along = Math.max(box.size[0], box.size[2]);
      const key = `${along.toFixed(2)}:${box.size[1].toFixed(2)}`;
      if (cache.has(key)) continue;
      const texture = source.clone();
      texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
      texture.repeat.set(Math.max(along / tile, 0.4), Math.max(box.size[1] / tile, 0.4));
      texture.needsUpdate = true;
      cache.set(key, texture);
    }
    return cache;
  }, [room, colors, packMaps]);

  const wallMapFor = (box) =>
    wallMaps?.get(`${Math.max(box.size[0], box.size[2]).toFixed(2)}:${box.size[1].toFixed(2)}`) ?? null;

  useEffect(() => {
    if (!wallMaps) return undefined;
    return () => {
      for (const texture of wallMaps.values()) texture.dispose();
    };
  }, [wallMaps]);

  const colliderBoxes = [
    ...(room.exterior ? [] : [room.floor]),
    ...(room.ceiling ? [room.ceiling] : []),
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
          <meshStandardMaterial map={floorMap} roughness={0.56} />
        </mesh>
      )}
      {room.ceiling && (
        <mesh position={room.ceiling.position} castShadow>
          <boxGeometry args={room.ceiling.size} />
          <meshStandardMaterial color={colors.ceiling} roughness={0.95} />
        </mesh>
      )}
      {room.wallBoxes.map((box) => (
        <mesh key={box.id} position={box.position} castShadow receiveShadow>
          <boxGeometry args={box.size} />
          <meshStandardMaterial map={wallMapFor(box)} roughness={0.88} />
        </mesh>
      ))}
      {room.openingHoles.map((hole) => (
        <OpeningFrame key={`${hole.id}:frame`} hole={hole} color={colors.trim ?? '#3a2c1e'} />
      ))}
    </group>
  );
}
