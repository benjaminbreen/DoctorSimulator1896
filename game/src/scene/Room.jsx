import { useMemo } from 'react';
import * as THREE from 'three';
import { useLoader } from '@react-three/fiber';
import { RigidBody, CuboidCollider } from '@react-three/rapier';
import { woodTexture, plasterTexture } from './textures.js';
import { surfaceUrl } from '../world/victorianCatalog.js';

// Seamless wall/floor images from the Victorian pack, when a room names
// them. Both slots always load together so the hook order stays stable.
function useLoaderMaps(wallName, floorName) {
  const urls = [
    wallName ? surfaceUrl(wallName) : surfaceUrl('Plaster01'),
    floorName ? surfaceUrl(floorName) : surfaceUrl('WoodenFloor_01'),
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

// Wood trim around an opening: two jambs, a lintel, and a sill for windows.
// Visual only — the derived wall boxes stay the collision truth.
function OpeningFrame({ hole, color }) {
  const alongX = hole.normal[2] !== 0;
  const depth = hole.thickness + 0.06;
  const jamb = 0.08;
  const box = (along, y, alongSize, ySize, depthSize) => ({
    position: alongX
      ? [hole.position[0] + along, y, hole.position[2]]
      : [hole.position[0], y, hole.position[2] + along],
    size: alongX ? [alongSize, ySize, depthSize] : [depthSize, ySize, alongSize],
  });
  const parts = [
    box(-(hole.width / 2 + jamb / 2), hole.position[1], jamb, hole.height, depth),
    box(hole.width / 2 + jamb / 2, hole.position[1], jamb, hole.height, depth),
    box(0, hole.position[1] + hole.height / 2 + jamb / 2, hole.width + jamb * 2, jamb, depth),
  ];
  if (hole.type === 'window') {
    parts.push(box(0, hole.position[1] - hole.height / 2 - 0.03, hole.width + 0.2, 0.06, depth + 0.06));
  }
  // Blocked doors get a closed leaf so the opening is not a black void.
  const leaf = hole.type === 'door' && hole.blocked ? box(0, hole.position[1], hole.width, hole.height, 0.05) : null;
  return (
    <group>
      {parts.map((part, index) => (
        <mesh key={index} position={part.position} castShadow>
          <boxGeometry args={part.size} />
          <meshStandardMaterial color={color} roughness={0.7} />
        </mesh>
      ))}
      {leaf && (
        <mesh position={leaf.position}>
          <boxGeometry args={leaf.size} />
          <meshStandardMaterial color={color} roughness={0.6} />
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
  const wallMap = useMemo(() => {
    if (room.exterior) return null;
    const texture = (packMaps.wall ?? plasterTexture(colors.wall)).clone();
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.needsUpdate = true;
    // Wallpaper repeats are per-wall-box, and boxes vary in width, so scale
    // by the box rather than a fixed count. Roughly a 1.2m paper drop.
    texture.repeat.set(packMaps.wall ? 3.2 : 2.5, packMaps.wall ? 2.2 : 2.5);
    return texture;
  }, [room, colors, packMaps]);

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
          <meshStandardMaterial map={floorMap} roughness={0.72} />
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
          <meshStandardMaterial map={wallMap} roughness={0.88} />
        </mesh>
      ))}
      {room.openingHoles.map((hole) => (
        <OpeningFrame key={`${hole.id}:frame`} hole={hole} color={colors.trim ?? '#3a2c1e'} />
      ))}
    </group>
  );
}
