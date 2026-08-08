import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { degToRad } from '../movement/mathUtils.js';
import { windowSkyTexture } from './textures.js';
import { solarRamps } from '../world/solar.js';

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

// `skyPanes` off means WindowView is drawing the real captured view instead
// of the procedural gradient stand-in.
export default function LightingRig({ room, config, runtime, skyPanes = true }) {
  const ambientRef = useRef();
  const hemisphereRef = useRef();
  const portalRefs = useRef([]);
  const gaslightRefs = useRef([]);
  const skyRefs = useRef([]);
  const skyMap = useMemo(() => windowSkyTexture(), []);
  const shadowMapSize = Number(runtime.values.shadowMapSize);
  skyRefs.current = [];

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
    // `scale` lets a zone dim the panel's global fill without the panel
    // losing meaning. Gas-lit interiors use very little.
    if (ambientRef.current) {
      ambientRef.current.intensity = values.ambientIntensity * (config.ambient.scale ?? 1);
    }
    if (hemisphereRef.current) {
      hemisphereRef.current.intensity = values.hemisphereIntensity * (config.hemisphere.scale ?? 1);
    }

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

    // The view outside dims and warms with the sun, so a lamp-lit dusk room
    // does not sit behind a noon-bright pane.
    const { daylight, golden, night } = solarRamps(values.timeOfDay);
    for (const mesh of skyRefs.current) {
      const material = mesh.material;
      const level = 0.1 + daylight * 0.95;
      material.color.setRGB(
        level * (1 + golden * 0.35),
        level * (1 + golden * 0.1),
        level * (1 - golden * 0.15 + night * 0.25),
      );
    }

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
      {skyPanes && room.windowHoles.map((hole) => (
        // Sky pane in the hole: graded sky over the rooftops opposite, dimmed
        // toward dusk by the frame loop, so the window is not a white slab.
        <mesh
          key={`${hole.id}:sky`}
          ref={(mesh) => {
            if (mesh) skyRefs.current.push(mesh);
          }}
          position={hole.position}
          rotation={[0, Math.atan2(-hole.normal[0], -hole.normal[2]), 0]}
        >
          <planeGeometry args={[hole.width, hole.height]} />
          <meshBasicMaterial map={skyMap} side={THREE.DoubleSide} toneMapped={false} />
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
          {/* Brass stem and cup, only where no catalog model supplies one. */}
          {gaslight.marker.fixture !== false && (
            <>
              <mesh position={[0, -0.22, 0]}>
                <cylinderGeometry args={[0.014, 0.014, 0.3, 8]} />
                <meshStandardMaterial color="#8a6b3a" roughness={0.35} metalness={0.4} />
              </mesh>
              <mesh position={[0, -0.06, 0]}>
                <cylinderGeometry args={[0.05, 0.02, 0.05, 10]} />
                <meshStandardMaterial color="#8a6b3a" roughness={0.35} metalness={0.4} />
              </mesh>
            </>
          )}
          {/* The flame itself: a small bright ball the bloom pass catches. */}
          <mesh>
            <sphereGeometry args={[gaslight.flameRadius ?? 0.055, 10, 8]} />
            <meshBasicMaterial color="#ffdca6" toneMapped={false} />
          </mesh>
        </group>
      ))}
    </group>
  );
}
