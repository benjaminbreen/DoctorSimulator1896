import { useRef, useState } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { RigidBody, BallCollider, CuboidCollider, CylinderCollider } from '@react-three/rapier';
import PropShape from './PropShape.jsx';
import PropMaterial from './PropMaterial.jsx';
import { PUSHCART_SPECS } from '../world/pushcarts.js';

// Dynamic vendor carts. Each is one rigid body: the player can shove it and
// a carriage's kinematic collider can knock it over. The wheels only grip
// along their own line — a per-frame scrub bleeds off sideways velocity, so
// a push in line with the wheels rolls and a broadside shove scrubs short.
// Past ~45° of lean the cart spills: heap decor vanishes and every load
// piece becomes its own small rigid body where it sat.

const quat = new THREE.Quaternion();
const pieceQuat = new THREE.Quaternion();
const euler = new THREE.Euler();
const vec = new THREE.Vector3();
const forward = new THREE.Vector3();
const up = new THREE.Vector3();

const TIP_LIMIT = 0.7;

function Part({ part }) {
  return (
    <mesh position={part.position} rotation={part.rotation ?? [0, 0, 0]} castShadow receiveShadow>
      <PropShape item={part} />
      <PropMaterial item={part} />
    </mesh>
  );
}

function PieceCollider({ collider }) {
  const shared = { friction: collider.friction ?? 0.5, density: collider.density ?? 300 };
  if (collider.type === 'ball') return <BallCollider args={collider.args} {...shared} />;
  if (collider.type === 'cylinder') return <CylinderCollider args={collider.args} {...shared} />;
  return <CuboidCollider args={collider.args} {...shared} />;
}

// One spilled good, loose on the street from the moment it appears.
function LoosePiece({ item }) {
  return (
    <RigidBody
      type="dynamic"
      colliders={false}
      position={item.position}
      rotation={item.rotation}
      linearVelocity={item.velocity}
      linearDamping={0.3}
      angularDamping={0.5}
    >
      <PieceCollider collider={item.collider} />
      {item.parts.map((part, index) => (
        <Part key={index} part={part} />
      ))}
    </RigidBody>
  );
}

// Convert every piece's cart-local transform to a world transform, carrying
// the cart's velocity so the goods leave with the crash instead of dropping
// straight down.
function spillPieces(spec, rb) {
  const t = rb.translation();
  const q = rb.rotation();
  const vel = rb.linvel();
  quat.set(q.x, q.y, q.z, q.w);
  return spec.pieces.map((piece, index) => {
    vec.set(...piece.position).applyQuaternion(quat);
    const rot = piece.rotation ?? [0, 0, 0];
    pieceQuat.setFromEuler(euler.set(rot[0], rot[1], rot[2]));
    pieceQuat.premultiply(quat);
    euler.setFromQuaternion(pieceQuat);
    const jitter = ((index * 37) % 7 - 3) * 0.05;
    return {
      key: index,
      position: [t.x + vec.x, t.y + vec.y, t.z + vec.z],
      rotation: [euler.x, euler.y, euler.z],
      velocity: [vel.x + jitter, vel.y, vel.z - jitter],
      collider: piece.collider,
      parts: piece.parts,
    };
  });
}

function Pushcart({ spec }) {
  const body = useRef(null);
  const wheelRefs = useRef([]);
  const [spilled, setSpilled] = useState(null);

  useFrame((_, delta) => {
    const rb = body.current;
    if (!rb || rb.isSleeping()) return;
    const dt = Math.min(delta, 0.05);
    const q = rb.rotation();
    quat.set(q.x, q.y, q.z, q.w);
    forward.set(1, 0, 0).applyQuaternion(quat);
    up.set(0, 1, 0).applyQuaternion(quat);
    if (up.y < TIP_LIMIT) {
      // Knocked over: dump the goods once, then let plain friction take it.
      if (!spilled) setSpilled(spillPieces(spec, rb));
      return;
    }
    const vel = rb.linvel();
    const along = vel.x * forward.x + vel.z * forward.z;
    const latX = vel.x - forward.x * along;
    const latZ = vel.z - forward.z * along;
    if (latX * latX + latZ * latZ > 1e-6) {
      const keep = Math.exp(-9 * dt);
      rb.setLinvel(
        { x: forward.x * along + latX * keep, y: vel.y, z: forward.z * along + latZ * keep },
        false,
      );
    }
    for (const wheel of wheelRefs.current) {
      if (wheel) wheel.rotation.z += (along * dt) / spec.wheelRadius;
    }
  });

  const { tray, legs, handles } = spec.colliders;
  return (
    <>
      <RigidBody
        ref={body}
        type="dynamic"
        colliders={false}
        position={spec.position}
        rotation={[0, spec.yaw, 0]}
        linearDamping={0.35}
        angularDamping={1.4}
      >
        <CuboidCollider args={tray.half} position={tray.position} friction={0.5} density={110} />
        {/* Legs slide rather than grip: a real cart is walked, not dragged. */}
        <CuboidCollider args={legs.half} position={legs.position} friction={0.3} density={400} />
        <CuboidCollider args={handles.half} position={handles.position} friction={0.6} density={150} />
        {spec.wheels.map((wheel, index) => (
          <CylinderCollider
            key={`c${index}`}
            args={[wheel.halfWidth, spec.wheelRadius]}
            position={wheel.center}
            rotation={[Math.PI / 2, 0, 0]}
            friction={0.12}
            density={240}
          />
        ))}
        {spec.chassis.map((part, index) => (
          <Part key={index} part={part} />
        ))}
        {!spilled &&
          spec.decor.map((part, index) => <Part key={`d${index}`} part={part} />)}
        {!spilled &&
          spec.pieces.map((piece, index) => (
            <group key={`p${index}`} position={piece.position} rotation={piece.rotation ?? [0, 0, 0]}>
              {piece.parts.map((part, j) => (
                <Part key={j} part={part} />
              ))}
            </group>
          ))}
        {spec.wheels.map((wheel, index) => (
          <group
            key={`w${index}`}
            position={wheel.center}
            ref={(node) => (wheelRefs.current[index] = node)}
          >
            {wheel.parts.map((part, j) => (
              <Part key={j} part={part} />
            ))}
          </group>
        ))}
      </RigidBody>
      {spilled?.map((item) => (
        <LoosePiece key={item.key} item={item} />
      ))}
    </>
  );
}

export default function Pushcarts() {
  return PUSHCART_SPECS.map((spec) => <Pushcart key={spec.id} spec={spec} />);
}
