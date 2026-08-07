import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { degToRad } from '../movement/mathUtils.js';

// Sun offset outside a window: the hole normal rotated by azimuth, tilted up
// by elevation.
function sunOffset(normal, elevationDeg, azimuthDeg) {
  const azimuth = degToRad(azimuthDeg);
  const elevation = degToRad(elevationDeg);
  const cos = Math.cos(azimuth);
  const sin = Math.sin(azimuth);
  const hx = normal[0] * cos + normal[2] * sin;
  const hz = -normal[0] * sin + normal[2] * cos;
  return [hx * Math.cos(elevation), Math.sin(elevation), hz * Math.cos(elevation)];
}

// Smooth deterministic flicker in roughly [-1, 1].
function flickerNoise(time, seed) {
  return (
    Math.sin(time * 13.7 + seed) * 0.5 +
    Math.sin(time * 7.3 + seed * 2.1) * 0.35 +
    Math.sin(time * 29.1 + seed * 4.7) * 0.15
  );
}

export default function LightingRig({ room, config, runtime }) {
  const ambientRef = useRef();
  const hemisphereRef = useRef();
  const portalRefs = useRef([]);
  const gaslightRefs = useRef([]);
  const shadowMapSize = Number(runtime.values.shadowMapSize);

  const portals = useMemo(
    () =>
      config.windowPortals
        .map((portal) => ({ ...portal, hole: room.windowHoles.find((hole) => hole.id === portal.windowId) }))
        .filter((portal) => portal.hole)
        .map((portal) => ({ ...portal, target: new THREE.Object3D() })),
    [config, room],
  );
  const gaslights = useMemo(
    () =>
      config.gaslights
        .map((gaslight) => ({ ...gaslight, marker: room.lightMarkers.find((marker) => marker.id === gaslight.propId) }))
        .filter((gaslight) => gaslight.marker),
    [config, room],
  );

  useFrame((state) => {
    const values = runtime.values;
    const time = state.clock.elapsedTime;
    if (ambientRef.current) ambientRef.current.intensity = values.ambientIntensity;
    if (hemisphereRef.current) hemisphereRef.current.intensity = values.hemisphereIntensity;

    portals.forEach((portal, index) => {
      const light = portalRefs.current[index];
      if (!light) return;
      const offset = sunOffset(portal.hole.normal, values.windowElevationDeg, portal.azimuthDeg);
      light.position.set(
        portal.hole.position[0] + offset[0] * 4,
        portal.hole.position[1] + offset[1] * 4,
        portal.hole.position[2] + offset[2] * 4,
      );
      light.intensity = portal.intensity * values.windowIntensity;
      light.color.set(values.windowColor);
      light.castShadow = values.shadowsEnabled;
      light.shadow.radius = values.shadowRadius;
    });

    gaslights.forEach((gaslight, index) => {
      const light = gaslightRefs.current[index];
      if (!light) return;
      // Per-light flicker amplitude from the JSON, scaled by the panel.
      const flicker = 1 + flickerNoise(time, index * 17.3) * (gaslight.flicker ?? 0.1) * values.gaslightFlicker;
      light.intensity = gaslight.intensity * values.gaslightIntensity * flicker;
      light.color.set(values.gaslightColor);
      light.castShadow = values.shadowsEnabled && gaslight.castShadow;
      light.shadow.radius = values.shadowRadius;
    });
  });

  return (
    <group>
      <ambientLight ref={ambientRef} color={config.ambient.color} intensity={config.ambient.intensity} />
      <hemisphereLight
        ref={hemisphereRef}
        color={config.hemisphere.skyColor}
        groundColor={config.hemisphere.groundColor}
        intensity={config.hemisphere.intensity}
      />
      {room.windowHoles.map((hole) => (
        // Unlit sky pane in the hole so windows read as windows, not voids.
        <mesh
          key={`${hole.id}:sky`}
          position={hole.position}
          rotation={[0, Math.atan2(-hole.normal[0], -hole.normal[2]), 0]}
        >
          <planeGeometry args={[hole.width, hole.height]} />
          <meshBasicMaterial color={config.windowSky ?? '#b8c4de'} side={2} />
        </mesh>
      ))}
      {portals.map((portal, index) => (
        <group key={portal.windowId}>
          <primitive
            object={portal.target}
            position={[
              portal.hole.position[0] - portal.hole.normal[0] * 2,
              portal.hole.position[1] - 0.6,
              portal.hole.position[2] - portal.hole.normal[2] * 2,
            ]}
          />
          <directionalLight
            ref={(light) => {
              portalRefs.current[index] = light;
            }}
            target={portal.target}
            castShadow
            shadow-mapSize-width={shadowMapSize}
            shadow-mapSize-height={shadowMapSize}
            shadow-camera-near={0.1}
            shadow-camera-far={16}
            shadow-camera-left={-4.5}
            shadow-camera-right={4.5}
            shadow-camera-top={4.5}
            shadow-camera-bottom={-4.5}
            shadow-bias={-0.0004}
          />
        </group>
      ))}
      {gaslights.map((gaslight, index) => (
        <group key={gaslight.propId} position={gaslight.marker.position}>
          <pointLight
            ref={(light) => {
              gaslightRefs.current[index] = light;
            }}
            distance={gaslight.distance}
            decay={gaslight.decay}
            shadow-mapSize-width={shadowMapSize}
            shadow-mapSize-height={shadowMapSize}
            shadow-bias={-0.001}
          />
          {/* Simple fixture: brass stem, cup, glowing globe. */}
          <mesh position={[0, -0.22, 0]}>
            <cylinderGeometry args={[0.014, 0.014, 0.3, 8]} />
            <meshStandardMaterial color="#8a6b3a" roughness={0.35} metalness={0.4} />
          </mesh>
          <mesh position={[0, -0.06, 0]}>
            <cylinderGeometry args={[0.05, 0.02, 0.05, 10]} />
            <meshStandardMaterial color="#8a6b3a" roughness={0.35} metalness={0.4} />
          </mesh>
          <mesh>
            <sphereGeometry args={[0.055, 12, 8]} />
            <meshStandardMaterial emissive="#ffc57a" emissiveIntensity={4} color="#664a22" />
          </mesh>
        </group>
      ))}
    </group>
  );
}
