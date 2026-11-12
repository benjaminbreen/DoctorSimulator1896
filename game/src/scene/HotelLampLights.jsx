import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { solarRamps, smoothstep } from '../world/solar.js';

const HOTEL_LAMP_LIGHT_COLOR = '#ffc879';
const HOTEL_LAMP_LIGHT_BUDGET = 4;
const HOTEL_LAMP_LIGHT_DISTANCE = 11;
const HOTEL_LAMP_LIGHT_CULL_DISTANCE = 46;
// Each side has a wall lantern and a standard whose pools overlap. Four lower
// intensities give the same warm fill without burning out the stonework.
const HOTEL_LAMP_DAY_INTENSITY = 2.8;
const HOTEL_LAMP_DUSK_INTENSITY = 7.5;

export function hotelLampLayout(width, height) {
  const west = -width / 2;
  const base = -height / 2;
  return [
    { kind: 'wall', position: [west - 1.25, base + 3.12, -3.12] },
    { kind: 'wall', position: [west - 1.25, base + 3.12, 0.92] },
    { kind: 'post', position: [west - 1.75, base + 3.58, -4.05] },
    { kind: 'post', position: [west - 1.75, base + 3.58, 1.85] },
  ];
}

// Four fixed, shadowless lights keep the symmetrical entrance stable as the
// camera moves. The set culls as one when the hotel is distant; reassigning a
// smaller pool between fixtures made alternate lanterns visibly switch off.
// They deliberately cast no shadows: a point-light shadow would render the
// scene six extra times per fixture.
export default function HotelLampLights({ hotel, runtime, ready }) {
  const groupRef = useRef();
  const lightRefs = useRef([]);
  const cameraLocal = useMemo(() => new THREE.Vector3(), []);
  const fixturePoints = useMemo(
    () => hotelLampLayout(...hotel.size).map(({ position }) => new THREE.Vector3().fromArray(position)),
    [hotel],
  );

  useFrame(({ camera }) => {
    const group = groupRef.current;
    if (!group) return;
    group.worldToLocal(cameraLocal.copy(camera.position));

    let nearestDistanceSq = Infinity;
    fixturePoints.forEach((point) => {
      const distanceSq = cameraLocal.distanceToSquared(point);
      nearestDistanceSq = Math.min(nearestDistanceSq, distanceSq);
    });

    let dusk = 0;
    if (runtime) {
      const { altitude, night } = solarRamps(runtime.values.timeOfDay, runtime.values.dayOfYear);
      dusk = Math.max(1 - smoothstep(2, 10, altitude), night);
    }
    const intensity = THREE.MathUtils.lerp(HOTEL_LAMP_DAY_INTENSITY, HOTEL_LAMP_DUSK_INTENSITY, dusk);
    // Culled by intensity, never by visibility: hiding a light changes the
    // scene's light count, and every material then recompiles its program on
    // the walk toward the hotel — a multi-hundred-ms hitch mid-street.
    const near = ready && nearestDistanceSq <= HOTEL_LAMP_LIGHT_CULL_DISTANCE ** 2;
    fixturePoints.forEach((point, index) => {
      const light = lightRefs.current[index];
      if (!light) return;
      light.position.copy(point);
      light.intensity = near ? intensity : 0;
    });
  });

  return (
    <group ref={groupRef} position={hotel.position} rotation={[0, hotel.yaw ?? 0, 0]}
      name="fixed four-light hotel lantern pool">
      {Array.from({ length: HOTEL_LAMP_LIGHT_BUDGET }, (_, index) => (
        <pointLight
          key={index}
          ref={(light) => {
            lightRefs.current[index] = light;
          }}
          color={HOTEL_LAMP_LIGHT_COLOR}
          intensity={0}
          distance={HOTEL_LAMP_LIGHT_DISTANCE}
          decay={2}
          castShadow={false}
        />
      ))}
    </group>
  );
}

