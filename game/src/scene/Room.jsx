import { useMemo } from 'react';
import { RigidBody, CuboidCollider } from '@react-three/rapier';
import { woodTexture, plasterTexture } from './textures.js';

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
  const floorMap = useMemo(() => {
    if (room.exterior) return null;
    const texture = woodTexture(colors.floor).clone();
    texture.needsUpdate = true;
    texture.repeat.set(room.floor.size[0] / 2.4, room.floor.size[2] / 2.4);
    return texture;
  }, [room, colors]);
  const wallMap = useMemo(() => {
    if (room.exterior) return null;
    const texture = plasterTexture(colors.wall).clone();
    texture.needsUpdate = true;
    texture.repeat.set(2.5, 2.5);
    return texture;
  }, [room, colors]);

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
          <meshStandardMaterial map={floorMap} roughness={0.8} />
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
          <meshStandardMaterial map={wallMap} roughness={0.9} />
        </mesh>
      ))}
      {room.openingHoles.map((hole) => (
        <OpeningFrame key={`${hole.id}:frame`} hole={hole} color={colors.trim ?? '#3a2c1e'} />
      ))}
    </group>
  );
}
