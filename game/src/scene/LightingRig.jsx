import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { damp, degToRad } from '../movement/mathUtils.js';
import { portalDimming } from '../world/windowDressing.js';
import { examinationFocus, examinationPresentation } from '../consultation/examPresentation.js';

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

// One window carries the room's shadow. Six windows each casting their own
// soft shadow set is six full scene passes a frame and reads as mud on the
// floor; one dominant sun with the rest as unshadowed fill reads as a room
// with a light direction. A portal can claim it with `castShadow: true`,
// otherwise the brightest one takes it.
const SHADOW_PORTALS = 1;

// The shadow camera stays a box around the caster's own window, and that is
// deliberate: three treats anything outside it as lit, so the far side of the
// room keeps the flat window light it has always had. Widening it to the
// whole room puts the ceiling between the sun and the floor and the room goes
// dark, because a portal light is light that has already come through the
// glass and should not be blocked by the shell a second time.
const SHADOW_EXTENT = 4.5;

// Smooth deterministic flicker in roughly [-1, 1].
function flickerNoise(time, seed) {
  return (
    Math.sin(time * 13.7 + seed) * 0.5 +
    Math.sin(time * 7.3 + seed * 2.1) * 0.35 +
    Math.sin(time * 29.1 + seed * 4.7) * 0.15
  );
}

// What a window shows is WindowView's or WindowSky's job; this rig only makes
// light.
export default function LightingRig({
  room,
  config,
  runtime,
  dressing,
  maxShadowMapSize = Infinity,
}) {
  const ambientRef = useRef();
  const hemisphereRef = useRef();
  const portalRefs = useRef([]);
  const gaslightRefs = useRef([]);
  // Eases toward 1 while the examination reading is up: the room falls to
  // near-black and a key/rim pair picks the patient out of it.
  const examBlend = useRef(0);
  const examKeyRef = useRef();
  const examRimRef = useRef();
  const examTarget = useMemo(() => new THREE.Object3D(), []);
  const shadowMapSize = Math.min(Number(runtime.values.shadowMapSize), maxShadowMapSize);

  const portals = useMemo(() => {
    const found = config.windowPortals
      .map((portal) => ({ ...portal, hole: room.windowHoles.find((hole) => hole.id === portal.windowId) }))
      .filter((portal) => portal.hole)
      .map((portal) => ({ ...portal, target: new THREE.Object3D() }));
    // Pinned portals first, then the brightest, until the budget is spent.
    // `castShadow: false` takes a window out of the running.
    const casters = new Set(
      found
        .filter((portal) => portal.castShadow !== false)
        .sort((a, b) => (b.castShadow === true) - (a.castShadow === true) || b.intensity - a.intensity)
        .slice(0, SHADOW_PORTALS)
        .map((portal) => portal.windowId),
    );
    // A shade half down or a blind turned nearly shut is worth less light.
    return found.map((portal) => ({
      ...portal,
      casts: casters.has(portal.windowId),
      dimming: portalDimming(dressing?.get(portal.windowId)),
    }));
  }, [config, room, dressing]);
  const gaslights = useMemo(
    () =>
      config.gaslights
        .map((gaslight) => ({ ...gaslight, marker: room.lightMarkers.find((marker) => marker.id === gaslight.propId) }))
        .filter((gaslight) => gaslight.marker),
    [config, room],
  );
  // Spot lights aim at a target object, so each needs its own.
  const spotTargets = useMemo(() => gaslights.map(() => new THREE.Object3D()), [gaslights]);

  useFrame((state, delta) => {
    const values = runtime.values;
    const time = state.clock.elapsedTime;
    const exam = examBlend.current = damp(
      examBlend.current,
      examinationPresentation() ? 1 : 0,
      3.5,
      Math.min(delta, 1 / 30),
    );
    // `scale` lets a zone dim the panel's global fill without the panel
    // losing meaning. Gas-lit interiors use very little.
    if (ambientRef.current) {
      ambientRef.current.intensity = values.ambientIntensity * (config.ambient.scale ?? 1)
        * (1 - exam * 0.86);
    }
    if (hemisphereRef.current) {
      hemisphereRef.current.intensity = values.hemisphereIntensity * (config.hemisphere.scale ?? 1)
        * (1 - exam * 0.88);
    }

    // The exam pair only spends light when the reading is up; the rest of the
    // time both spots idle at zero and cost nothing.
    const focusPoint = examinationFocus();
    if (focusPoint && exam > 0.001) {
      examTarget.position.set(...focusPoint);
      if (examKeyRef.current) {
        examKeyRef.current.position.set(focusPoint[0] - 1.4, focusPoint[1] + 0.82, focusPoint[2] - 1.35);
        examKeyRef.current.intensity = 11 * exam;
      }
      if (examRimRef.current) {
        examRimRef.current.position.set(focusPoint[0] + 1.1, focusPoint[1] + 1.0, focusPoint[2] + 1.2);
        examRimRef.current.intensity = 6 * exam;
      }
    } else {
      if (examKeyRef.current) examKeyRef.current.intensity = 0;
      if (examRimRef.current) examRimRef.current.intensity = 0;
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
      light.intensity = portal.intensity * values.windowIntensity * portal.dimming
        * (1 - exam * 0.95);
      light.color.set(values.windowColor);
      light.castShadow = values.shadowsEnabled && portal.casts;
      light.shadow.radius = values.shadowRadius;
    });

    gaslights.forEach((gaslight, index) => {
      const light = gaslightRefs.current[index];
      if (!light) return;
      // Per-light flicker amplitude from the JSON, scaled by the panel.
      const flicker = 1 + flickerNoise(time, index * 17.3) * (gaslight.flicker ?? 0.1) * values.gaslightFlicker;
      // In the reading the lamps recede to embers rather than going out:
      // bloom keeps their glow, the room around them goes dark.
      light.intensity = gaslight.intensity * values.gaslightIntensity * flicker
        * (1 - exam * 0.85);
      light.color.set(values.gaslightColor);
      light.castShadow = values.shadowsEnabled && gaslight.castShadow;
      light.shadow.radius = values.shadowRadius;
    });
  });

  return (
    <group>
      {/* The examination pair: warm key from the doctor's side, cool rim from
          behind, both unshadowed. Zero intensity outside the reading. */}
      <primitive object={examTarget} />
      <spotLight
        ref={examKeyRef}
        target={examTarget}
        color="#ffc57a"
        intensity={0}
        angle={0.5}
        penumbra={0.8}
        distance={6}
        decay={2}
      />
      <spotLight
        ref={examRimRef}
        target={examTarget}
        color="#9fb4d8"
        intensity={0}
        angle={0.5}
        penumbra={0.9}
        distance={6}
        decay={2}
      />
      <ambientLight ref={ambientRef} color={config.ambient.color} intensity={config.ambient.intensity} />
      <hemisphereLight
        ref={hemisphereRef}
        color={config.hemisphere.skyColor}
        groundColor={config.hemisphere.groundColor}
        intensity={config.hemisphere.intensity}
      />
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
          {/* The caster's map is doubled so the one remaining shadow keeps the
              texel density all six used to have. */}
          <directionalLight
            ref={(light) => {
              portalRefs.current[index] = light;
            }}
            target={portal.target}
            castShadow={portal.casts}
            shadow-mapSize-width={portal.casts
              ? Math.min(shadowMapSize * 2, 2048, maxShadowMapSize)
              : shadowMapSize}
            shadow-mapSize-height={portal.casts
              ? Math.min(shadowMapSize * 2, 2048, maxShadowMapSize)
              : shadowMapSize}
            shadow-camera-near={0.1}
            shadow-camera-far={16}
            shadow-camera-left={-SHADOW_EXTENT}
            shadow-camera-right={SHADOW_EXTENT}
            shadow-camera-top={SHADOW_EXTENT}
            shadow-camera-bottom={-SHADOW_EXTENT}
            shadow-bias={-0.0004}
          />
        </group>
      ))}
      {gaslights.map((gaslight, index) => (
        <group key={gaslight.propId} position={gaslight.marker.position}>
          {/* Shadow casters are downward spots: one shadow face instead of a
              point light's six, which is what makes three of them affordable.
              Everything else stays a cheap unshadowed point light. */}
          {gaslight.castShadow ? (
            <>
              <primitive object={spotTargets[index]} position={[0, -3, 0]} />
              <spotLight
                ref={(light) => {
                  gaslightRefs.current[index] = light;
                }}
                target={spotTargets[index]}
                angle={gaslight.coneAngle ?? 1.25}
                penumbra={0.85}
                distance={gaslight.distance}
                decay={gaslight.decay}
                castShadow
                shadow-mapSize-width={shadowMapSize}
                shadow-mapSize-height={shadowMapSize}
                shadow-camera-near={0.2}
                shadow-camera-far={gaslight.distance + 4}
                shadow-bias={-0.0012}
              />
            </>
          ) : (
            <pointLight
              ref={(light) => {
                gaslightRefs.current[index] = light;
              }}
              distance={gaslight.distance}
              decay={gaslight.decay}
            />
          )}
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
        </group>
      ))}
      {/* Burner glows, placed per flame rather than per light — a twin-armed
          sconce shows one under each shade, a candelabra a whole ring. */}
      {room.flameMarkers?.map((marker) => (
        <mesh key={marker.id} position={marker.position}>
          <sphereGeometry args={[marker.radius ?? 0.04, 8, 6]} />
          <meshBasicMaterial color="#ffdca6" toneMapped={false} />
        </mesh>
      ))}
    </group>
  );
}
