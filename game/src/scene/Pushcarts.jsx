import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { RigidBody, BallCollider, CuboidCollider, CylinderCollider } from '@react-three/rapier';
import PropShape from './PropShape.jsx';
import PropMaterial from './PropMaterial.jsx';
import {
  OPENING_CHAOS_CART_ID,
  PUSHCART_SPECS,
  pushcartStartsAsTrafficObstacle,
} from '../world/pushcarts.js';
import { gameDebug } from '../debug.js';
import { getPlayer, harm, pushcartImpactEffect } from '../world/player.js';
import { removeThrowableSource, reportThrowableSource } from '../world/throwablePlay.js';
import { recordGrievance } from '../world/grievances.js';
import { raiseTheftOutcry, raiseVendorScold } from '../world/outcry.js';
import { ownerOfCart } from '../world/postedNpcs.js';
import { removeAgent, reportAgent } from '../world/agents.js';
import ThrowableProjectiles from './ThrowableProjectiles.jsx';
import { reportMajorStreetEvent } from '../world/majorStreetEvents.js';

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
const pieceWorld = [0, 0, 0];

const TIP_LIMIT = 0.7;

function Part({ part }) {
  return (
    <mesh
      position={part.position}
      rotation={part.rotation ?? [0, 0, 0]}
      scale={part.scale ?? [1, 1, 1]}
      castShadow
      receiveShadow
    >
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
function LoosePiece({ item, sourceId, onTake }) {
  const body = useRef(null);
  const reported = useRef(false);
  const wasSleeping = useRef(false);
  useEffect(() => () => {
    if (sourceId) removeThrowableSource(sourceId);
  }, [sourceId]);
  useFrame(() => {
    if (!sourceId || !body.current) return;
    const sleeping = body.current.isSleeping();
    if (reported.current && sleeping && wasSleeping.current) return;
    const t = body.current.translation();
    pieceWorld[0] = t.x;
    pieceWorld[1] = t.y;
    pieceWorld[2] = t.z;
    reportThrowableSource(sourceId, item.throwable, pieceWorld, onTake);
    reported.current = true;
    wasSleeping.current = sleeping;
  });
  return (
    <RigidBody
      ref={body}
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
function spillPieces(spec, rb, taken) {
  const t = rb.translation();
  const q = rb.rotation();
  const vel = rb.linvel();
  quat.set(q.x, q.y, q.z, q.w);
  return spec.pieces.flatMap((piece, index) => {
    if (taken.has(index)) return [];
    vec.set(...piece.position).applyQuaternion(quat);
    const rot = piece.rotation ?? [0, 0, 0];
    pieceQuat.setFromEuler(euler.set(rot[0], rot[1], rot[2]));
    pieceQuat.premultiply(quat);
    euler.setFromQuaternion(pieceQuat);
    const jitter = ((index * 37) % 7 - 3) * 0.05;
    return [{
      key: index,
      throwable: piece.throwable,
      position: [t.x + vec.x, t.y + vec.y, t.z + vec.z],
      rotation: [euler.x, euler.y, euler.z],
      velocity: [vel.x + jitter, vel.y, vel.z - jitter],
      collider: piece.collider,
      parts: piece.parts,
    }];
  });
}

function Pushcart({ spec }) {
  const body = useRef(null);
  const wheelRefs = useRef([]);
  const lastPlayerImpact = useRef(-Infinity);
  const lastVehicleImpact = useRef(-Infinity);
  const [spilled, setSpilled] = useState(null);
  const [taken, setTaken] = useState(() => new Set());
  const sourceTransform = useRef([NaN, NaN, NaN, NaN, NaN, NaN, NaN]);
  const takeCallbacks = useRef(new Map());
  const trafficActive = useRef(pushcartStartsAsTrafficObstacle(spec.id));
  const trafficDelay = useRef(0);
  const trafficIds = useRef(spec.trafficFootprint.centers.map((_, index) =>
    `road-obstacle:${spec.id}:${index}`));
  const throwableId = (index) => `${spec.id}:${spec.pieces[index].throwable}:${index}`;
  const takePiece = (index) => {
    // Helping yourself to a manned cart is theft, and the man remembers it.
    // An unmanned cart has nobody to mind.
    const owner = ownerOfCart(spec.id);
    if (owner) recordGrievance(owner.id, 'theft');
    // An officer who can see the cart challenges the taking. With no officer
    // about, the man it belongs to says it himself.
    const position = body.current?.translation?.();
    const challenged = position
      ? raiseTheftOutcry({ x: position.x, z: position.z, seed: index })
      : null;
    if (!challenged && owner) {
      raiseVendorScold({ speaker: owner.dialogueName, anchorId: owner.id, seed: index });
    }
    removeThrowableSource(throwableId(index));
    setTaken((previous) => {
      if (previous.has(index)) return previous;
      const next = new Set(previous);
      next.add(index);
      return next;
    });
    return true;
  };
  const takeCallback = (index) => {
    if (!takeCallbacks.current.has(index)) {
      takeCallbacks.current.set(index, () => takePiece(index));
    }
    return takeCallbacks.current.get(index);
  };

  useEffect(() => () => {
    spec.pieces.forEach((piece, index) => {
      if (piece.throwable) removeThrowableSource(throwableId(index));
    });
    trafficIds.current.forEach(removeAgent);
    delete gameDebug.pushcarts[spec.id];
  }, [spec]);

  const onCollisionEnter = ({ other }) => {
    const otherKind = other.rigidBodyObject?.userData?.gameKind;
    const vehicleImpact = otherKind === 'horseless-carriage'
      || otherKind === 'horse-drawn-vehicle'
      || otherKind === 'horse-team';
    if (vehicleImpact) {
      const now = getPlayer().clock;
      if (now - lastVehicleImpact.current >= 4) {
        lastVehicleImpact.current = now;
        const position = body.current?.translation?.();
        if (position) {
          reportMajorStreetEvent({
            sourceId: other.rigidBodyObject?.userData?.carriageId
              ?? other.rigidBodyObject?.userData?.vehicleId,
            targetId: spec.id,
            targetKind: 'pushcart',
            x: position.x,
            z: position.z,
          });
        }
      }
    }
    if (spec.id === OPENING_CHAOS_CART_ID && otherKind === 'horseless-carriage') {
      // Give the striking carriage time to clear the cart before avoidance
      // switches on. The dynamic body remains free to roll or tip differently
      // on every impact.
      trafficActive.current = true;
      trafficDelay.current = Math.max(trafficDelay.current, 0.75);
    }
    if (otherKind !== 'player') return;
    const rb = body.current;
    if (!rb) return;
    const cartVelocity = rb.linvel();
    const playerVelocity = gameDebug.player.velocity;
    const relativeSpeed = Math.hypot(
      cartVelocity.x - playerVelocity[0],
      cartVelocity.y - playerVelocity[1],
      cartVelocity.z - playerVelocity[2],
    );
    const effect = pushcartImpactEffect(relativeSpeed);
    const now = getPlayer().clock;
    if (!effect || now - lastPlayerImpact.current < 2) return;
    lastPlayerImpact.current = now;
    harm(effect);
  };

  useFrame((_, delta) => {
    const rb = body.current;
    if (!rb) return;
    trafficDelay.current = Math.max(0, trafficDelay.current - Math.min(delta, 0.05));
    if (trafficActive.current && trafficDelay.current <= 0) {
      const t = rb.translation();
      const q = rb.rotation();
      quat.set(q.x, q.y, q.z, q.w);
      spec.trafficFootprint.centers.forEach((center, index) => {
        vec.set(...center).applyQuaternion(quat);
        reportAgent(
          trafficIds.current[index],
          t.x + vec.x,
          t.z + vec.z,
          spec.trafficFootprint.radius,
          { obstacleKind: 'pushcart', obstacleId: spec.id, trafficPolicy: 'soft' },
        );
      });
    } else {
      trafficIds.current.forEach(removeAgent);
    }
    const debugTranslation = rb.translation();
    const debugRotation = rb.rotation();
    gameDebug.pushcarts[spec.id] = {
      position: [debugTranslation.x, debugTranslation.y, debugTranslation.z],
      rotation: [debugRotation.x, debugRotation.y, debugRotation.z, debugRotation.w],
      trafficActive: trafficActive.current,
      trafficDelay: trafficDelay.current,
      spilled: Boolean(spilled),
    };
    if (!spilled) {
      const t = rb.translation();
      const q = rb.rotation();
      const previous = sourceTransform.current;
      const moved = !Number.isFinite(previous[0])
        || Math.abs(t.x - previous[0]) + Math.abs(t.y - previous[1]) + Math.abs(t.z - previous[2])
          + Math.abs(q.x - previous[3]) + Math.abs(q.y - previous[4])
          + Math.abs(q.z - previous[5]) + Math.abs(q.w - previous[6]) > 1e-5;
      if (moved) {
        previous[0] = t.x;
        previous[1] = t.y;
        previous[2] = t.z;
        previous[3] = q.x;
        previous[4] = q.y;
        previous[5] = q.z;
        previous[6] = q.w;
        quat.set(q.x, q.y, q.z, q.w);
        spec.pieces.forEach((piece, index) => {
          if (!piece.throwable || taken.has(index)) return;
          vec.set(...piece.position).applyQuaternion(quat);
          pieceWorld[0] = t.x + vec.x;
          pieceWorld[1] = t.y + vec.y;
          pieceWorld[2] = t.z + vec.z;
          reportThrowableSource(
            throwableId(index),
            piece.throwable,
            pieceWorld,
            takeCallback(index),
          );
        });
      }
    }
    if (rb.isSleeping()) return;
    const dt = Math.min(delta, 0.05);
    const q = rb.rotation();
    quat.set(q.x, q.y, q.z, q.w);
    forward.set(1, 0, 0).applyQuaternion(quat);
    up.set(0, 1, 0).applyQuaternion(quat);
    if (up.y < TIP_LIMIT) {
      // Knocked over: dump the goods once, then let plain friction take it.
      if (!spilled) setSpilled(spillPieces(spec, rb, taken));
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
        onCollisionEnter={onCollisionEnter}
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
          spec.pieces.map((piece, index) => !taken.has(index) && (
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
      {spilled?.map((item) => !taken.has(item.key) && (
        <LoosePiece
          key={item.key}
          item={item}
          sourceId={item.throwable ? throwableId(item.key) : null}
          onTake={takeCallback(item.key)}
        />
      ))}
    </>
  );
}

export default function Pushcarts() {
  return (
    <>
      {PUSHCART_SPECS.map((spec) => <Pushcart key={spec.id} spec={spec} />)}
      <ThrowableProjectiles />
    </>
  );
}
