import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { BallCollider, RigidBody } from '@react-three/rapier';
import ThrowableVisual from './ThrowableVisual.jsx';
import {
  advanceThrowableThrow,
  getThrowablePlay,
  throwableVelocity,
} from '../world/throwablePlay.js';
import { throwableDefinition } from '../world/throwables.js';
import { queueCarriageProjectileHit } from '../world/carriageImpacts.js';
import { terrainHeight } from '../world/terrain.js';
import { notice } from '../world/notices.js';
import { gameDebug } from '../debug.js';

const GRAVITY = -9.81;
const GUIDE_POINTS = 34;
const GUIDE_STEP = 0.075;
const IMPACT_LIFE = 0.72;
const DUST_GEOMETRY = new THREE.SphereGeometry(0.045, 6, 4);
const FLECK_GEOMETRY = new THREE.TetrahedronGeometry(0.038, 0);
const cameraDirection = new THREE.Vector3();
const launchDirection = new THREE.Vector3();

function launchOrigin(velocity) {
  launchDirection.set(velocity[0], velocity[1], velocity[2]).normalize();
  const hand = gameDebug.throwableHandPosition;
  return [
    hand[0] + launchDirection.x * 0.28,
    hand[1] + 0.02 + launchDirection.y * 0.18,
    hand[2] + launchDirection.z * 0.28,
  ];
}

function ThrowableAimGuide() {
  const line = useRef();
  const landing = useRef();
  const positions = useMemo(() => new Float32Array(GUIDE_POINTS * 3), []);

  useFrame(() => {
    const play = getThrowablePlay();
    const definition = throwableDefinition(play.heldType);
    const visible = play.phase === 'charging' && Boolean(definition);
    if (line.current) line.current.visible = visible;
    if (landing.current) landing.current.visible = visible;
    if (!visible || !line.current || !gameDebug.camera) return;

    line.current.material.color.set(definition.aimColor);
    landing.current.material.color.set(definition.aimColor);
    gameDebug.camera.getWorldDirection(cameraDirection);
    const velocity = throwableVelocity(cameraDirection, play.charge, play.heldType);
    const origin = launchOrigin(velocity);
    let count = GUIDE_POINTS;
    for (let index = 0; index < GUIDE_POINTS; index += 1) {
      const time = index * GUIDE_STEP;
      const x = origin[0] + velocity[0] * time;
      const y = origin[1] + velocity[1] * time + 0.5 * GRAVITY * time * time;
      const z = origin[2] + velocity[2] * time;
      positions[index * 3] = x;
      positions[index * 3 + 1] = y;
      positions[index * 3 + 2] = z;
      if (index > 2 && y <= terrainHeight(x, z) + 0.07) {
        positions[index * 3 + 1] = terrainHeight(x, z) + 0.07;
        count = index + 1;
        break;
      }
    }
    line.current.geometry.setDrawRange(0, count);
    line.current.geometry.attributes.position.needsUpdate = true;
    const end = (count - 1) * 3;
    landing.current.position.set(positions[end], positions[end + 1] + 0.015, positions[end + 2]);
  });

  return (
    <>
      <line ref={line} frustumCulled={false} visible={false}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[positions, 3]} />
        </bufferGeometry>
        <lineBasicMaterial color="#d8e89a" transparent opacity={0.82} depthWrite={false} />
      </line>
      <mesh ref={landing} rotation={[Math.PI / 2, 0, 0]} visible={false}>
        <torusGeometry args={[0.17, 0.018, 6, 20]} />
        <meshBasicMaterial color="#d8e89a" transparent opacity={0.85} depthWrite={false} />
      </mesh>
    </>
  );
}

function ThrownObject({ item, onImpact, onExpire }) {
  const body = useRef();
  const collider = useRef();
  const age = useRef(0);
  const expired = useRef(false);
  const lastImpact = useRef(-Infinity);
  const hitCarriages = useRef(new Set());
  const definition = throwableDefinition(item.type);

  const impact = (other = null) => {
    if (!body.current) return;
    const kind = other?.rigidBodyObject?.userData?.gameKind;
    if (kind === 'player') return;
    const position = body.current.translation();
    const velocity = body.current.linvel();
    const speed = Math.hypot(velocity.x, velocity.y, velocity.z);
    if (speed < 1.5 || age.current - lastImpact.current < 0.16) return;
    lastImpact.current = age.current;
    const carriageId = kind === 'horseless-carriage'
      ? other.rigidBodyObject.userData.carriageId
      : null;
    const firstCarriageHit = carriageId !== null && !hitCarriages.current.has(carriageId);
    if (firstCarriageHit) hitCarriages.current.add(carriageId);
    onImpact({
      id: `${item.id}:${Math.round(age.current * 1000)}`,
      projectileId: item.id,
      type: item.type,
      position: [position.x, position.y, position.z],
      velocity: [velocity.x, velocity.y, velocity.z],
      speed,
      carriageId,
      firstCarriageHit,
    });
  };

  useFrame((_, delta) => {
    age.current += delta;
    // Let the object clear the throwing hand and player capsule before its
    // cheap round collider joins the physics scene.
    collider.current?.setEnabled(age.current > 0.1);
    if (age.current > 14 && !expired.current) {
      expired.current = true;
      onExpire(item.id);
    }
  });

  if (!definition) return null;

  return (
    <RigidBody
      ref={body}
      type="dynamic"
      colliders={false}
      position={item.origin}
      linearVelocity={item.velocity}
      angularVelocity={[7.5, 11, -5.5]}
      linearDamping={0.02}
      angularDamping={0.22}
      ccd
      onCollisionEnter={({ other }) => impact(other)}
      userData={{ gameKind: 'throwable-projectile', throwableType: item.type }}
    >
      <BallCollider
        ref={collider}
        args={[definition.colliderRadius]}
        density={definition.density}
        friction={definition.friction}
        restitution={definition.restitution}
      />
      <ThrowableVisual type={item.type} />
    </RigidBody>
  );
}

function seeded(seed) {
  let value = seed * 1664525 + 1013904223;
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 4294967296;
  };
}

function ThrowableImpact({ item, onDone }) {
  const particles = useRef([]);
  const age = useRef(0);
  const definition = throwableDefinition(item.type);
  const { dustMaterial, fleckMaterial, pieces } = useMemo(() => {
    const numericId = String(item.id).split('').reduce((total, char) => total + char.charCodeAt(0), 0);
    const rand = seeded(numericId + 17);
    const count = item.carriageId === null ? 7 : 10;
    const force = Math.min(1, item.speed / 12);
    const bits = Array.from({ length: count }, (_, index) => ({
      fleck: item.carriageId !== null ? index % 3 === 0 : index === count - 1,
      velocity: new THREE.Vector3(
        (rand() - 0.5) * (0.8 + force),
        0.38 + rand() * (0.65 + force * 0.55),
        (rand() - 0.5) * (0.8 + force),
      ),
      spin: (rand() - 0.5) * 16,
      scale: 0.45 + rand() * 0.8,
    }));
    return {
      pieces: bits,
      dustMaterial: new THREE.MeshBasicMaterial({
        color: '#b3a27c', transparent: true, opacity: 0.42, depthWrite: false,
      }),
      fleckMaterial: new THREE.MeshStandardMaterial({
        color: definition?.impactColor ?? '#a8b273',
        transparent: true,
        opacity: 0.82,
        roughness: 0.85,
      }),
    };
  }, [item, definition]);

  useEffect(() => () => {
    dustMaterial.dispose();
    fleckMaterial.dispose();
  }, [dustMaterial, fleckMaterial]);

  useFrame((_, delta) => {
    age.current += delta;
    const time = age.current;
    const life = Math.max(0, 1 - time / IMPACT_LIFE);
    dustMaterial.opacity = 0.42 * life;
    fleckMaterial.opacity = 0.82 * life;
    pieces.forEach((piece, index) => {
      const particle = particles.current[index];
      if (!particle) return;
      particle.position.set(
        piece.velocity.x * time,
        piece.velocity.y * time + 0.5 * GRAVITY * 0.12 * time * time,
        piece.velocity.z * time,
      );
      particle.rotation.x += piece.spin * delta;
      particle.rotation.z -= piece.spin * 0.7 * delta;
      const expansion = piece.fleck ? 1 : 1 + time * 1.8;
      particle.scale.setScalar(piece.scale * life * expansion);
    });
    if (time >= IMPACT_LIFE) onDone(item.id);
  });

  return (
    <group position={[item.position[0], item.position[1] + 0.035, item.position[2]]}>
      {pieces.map((piece, index) => (
        <mesh
          key={index}
          ref={(node) => (particles.current[index] = node)}
          geometry={piece.fleck ? FLECK_GEOMETRY : DUST_GEOMETRY}
          material={piece.fleck ? fleckMaterial : dustMaterial}
          scale={piece.scale}
        />
      ))}
    </group>
  );
}

export default function ThrowableProjectiles() {
  const [projectiles, setProjectiles] = useState([]);
  const [impacts, setImpacts] = useState([]);

  useFrame((_, delta) => {
    const play = getThrowablePlay();
    if (play.phase !== 'windup' || !play.pendingVelocity) return;
    const launch = advanceThrowableThrow(delta, launchOrigin(play.pendingVelocity));
    if (launch) setProjectiles((current) => [...current, launch].slice(-8));
  });

  const impact = (result) => {
    setImpacts((current) => [...current, result].slice(-10));
    if (result.firstCarriageHit) {
      const definition = throwableDefinition(result.type);
      queueCarriageProjectileHit(result.carriageId, result.velocity, definition?.carriagePower ?? 0.2);
      notice(`THWACK — the ${definition?.label.toLowerCase() ?? 'object'} rocks the horseless carriage.`, {
        key: 'throwable-carriage',
        seconds: 3,
      });
    }
  };

  return (
    <>
      <ThrowableAimGuide />
      {projectiles.map((item) => (
        <ThrownObject
          key={item.id}
          item={item}
          onImpact={impact}
          onExpire={(id) => setProjectiles((current) => current.filter((entry) => entry.id !== id))}
        />
      ))}
      {impacts.map((item) => (
        <ThrowableImpact
          key={item.id}
          item={item}
          onDone={(id) => setImpacts((current) => current.filter((entry) => entry.id !== id))}
        />
      ))}
    </>
  );
}
