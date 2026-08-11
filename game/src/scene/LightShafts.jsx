import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { degToRad } from '../movement/mathUtils.js';
import { solarRamps } from '../world/solar.js';

// Daylight coming through the sashes: a soft wedge of lit air angling down
// into the room, with a little dust turning over inside it. The beam has to
// come first — motes on their own have nothing to belong to and read as
// insects. Both fade out with the sun.
//
// One camera-facing quad per window, not a volume. A box intersects the
// floor, the far wall, and its neighbours, and every one of those crossings
// draws a hard line that gives the trick away. A quad turned edge-on to the
// viewer has only one crossing — the floor — and the beam is already faded
// out by the time it gets there, because its length is cut to the distance
// the light actually travels before it lands.

const MOTES_PER_WINDOW = 14;
// Scattered daylight, warmer than the source it came through.
const SUNBEAM = new THREE.Color('#ffd6a2');
const warm = new THREE.Color();

// The quad spans y 0..1 from the window outward, x -0.5..0.5 across the
// opening; the vertex shader flares it toward the far end.
const SHAFT_VERTEX = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    vec3 p = position;
    p.x *= mix(1.0, 1.45, uv.y);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  }
`;

// Zero alpha at every edge, so the quad has no silhouette: a cosine lobe
// across the beam, and a falloff along it that reaches nothing before the
// light hits the floor.
const SHAFT_FRAGMENT = `
  uniform vec3 uColor;
  uniform float uIntensity;
  varying vec2 vUv;
  void main() {
    float across = cos((vUv.x - 0.5) * 3.14159265);
    // max() is load-bearing: interpolation puts vUv.y a hair over 1 at the far
    // edge, and pow() of a negative base is undefined — it returns NaN, and
    // the bloom pass then smears that NaN over the whole frame as black.
    float along = pow(max(1.0 - vUv.y, 0.0), 1.8);
    // Short fade at the mouth: the quad turns about the beam, so at the very
    // start half its width can swing behind the wall and clip.
    along *= smoothstep(0.0, 0.08, vUv.y);
    gl_FragColor = vec4(uColor, across * across * along * uIntensity);
  }
`;

function hash01(seed) {
  const value = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return value - Math.floor(value);
}

export default function LightShafts({ room, runtime, dressing }) {
  const motesRef = useRef();

  const windows = useMemo(
    () => room.windowHoles.filter((hole) => hole.type === 'window'),
    [room],
  );

  // Floor height and the room's span, so a beam can be cut where it lands.
  const floorY = room.floor.position[1] + room.floor.size[1] / 2;

  const geometry = useMemo(() => {
    const plane = new THREE.PlaneGeometry(1, 1);
    plane.translate(0, 0.5, 0);
    return plane;
  }, []);

  const shafts = useMemo(
    () =>
      windows.map((hole) => {
        const material = new THREE.ShaderMaterial({
          vertexShader: SHAFT_VERTEX,
          fragmentShader: SHAFT_FRAGMENT,
          transparent: true,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
          side: THREE.DoubleSide,
          uniforms: {
            uColor: { value: new THREE.Color('#ffdcae') },
            uIntensity: { value: 0 },
          },
        });
        const mesh = new THREE.Mesh(geometry, material);
        mesh.frustumCulled = false;
        // Beam start: just inside the glass, at the middle of the opening.
        const inset = hole.thickness * 0.5 + 0.05;
        const origin = new THREE.Vector3(
          hole.position[0] - hole.normal[0] * inset,
          hole.position[1],
          hole.position[2] - hole.normal[2] * inset,
        );
        return {
          hole,
          mesh,
          material,
          origin,
          // A drawn shade blocks the beam outright, unlike the portal
          // light, which keeps a floor for the bounce this renderer lacks.
          open: dressing?.get(hole.id)?.openFraction ?? 1,
          inward: new THREE.Vector3(-hole.normal[0], 0, -hole.normal[2]).normalize(),
          // How far the room reaches away from this wall.
          span: room.floor.size[Math.abs(hole.normal[0]) > 0.5 ? 0 : 2],
          axis: new THREE.Vector3(),
          length: 1,
        };
      }),
    [windows, geometry, room, dressing],
  );

  const motes = useMemo(
    () =>
      windows.flatMap((hole, index) =>
        Array.from({ length: MOTES_PER_WINDOW }, (_, i) => {
          const seed = index * 977 + i * 13;
          return {
            shaft: index,
            // Kept inside the wedge, so every speck sits in lit air.
            u: (hash01(seed) - 0.5) * hole.width * 0.9,
            v: (hash01(seed + 1) - 0.5) * hole.height * 0.9,
            along: hash01(seed + 2),
            rate: 0.03 + hash01(seed + 3) * 0.05,
            sway: hash01(seed + 4) * Math.PI * 2,
            size: 0.0022 + hash01(seed + 5) * 0.004,
          };
        }),
      ),
    [windows],
  );

  const moteGeometry = useMemo(() => new THREE.SphereGeometry(1, 4, 3), []);
  const moteMaterial = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color: '#ffdcb4',
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    [],
  );

  useEffect(
    () => () => {
      for (const shaft of shafts) shaft.material.dispose();
      geometry.dispose();
      moteGeometry.dispose();
      moteMaterial.dispose();
    },
    [shafts, geometry, moteGeometry, moteMaterial],
  );

  // Scratch, reused every frame: the mote loop runs a hundred times a frame
  // and must not allocate.
  const scratch = useMemo(
    () => ({
      toCam: new THREE.Vector3(),
      side: new THREE.Vector3(),
      normal: new THREE.Vector3(),
      up: new THREE.Vector3(0, 1, 0),
      basis: new THREE.Matrix4(),
      matrix: new THREE.Matrix4(),
      position: new THREE.Vector3(),
      quaternion: new THREE.Quaternion(),
      scale: new THREE.Vector3(),
    }),
    [],
  );

  useFrame((state) => {
    const values = runtime.values;
    const { daylight, golden } = solarRamps(values.timeOfDay);
    const strength = daylight * values.windowIntensity;
    const visible = strength > 0.02;
    // Lit air always reads warmer than the light that made it — scattering
    // drops the blue first. Straight window colour gives grey fog, not a
    // sunbeam, and warms further as the sun sinks.
    warm.set(values.windowColor).lerp(SUNBEAM, 0.6 + golden * 0.3);

    // Beams follow the same sun elevation the window portals use, so the
    // lit air and the lit floor agree.
    const elevation = degToRad(values.windowElevationDeg);
    const sin = Math.max(Math.sin(elevation), 0.02);
    const cos = Math.max(Math.cos(elevation), 0.02);

    for (const shaft of shafts) {
      const { hole, mesh, material, origin, inward } = shaft;
      mesh.visible = visible;
      if (!visible) continue;

      shaft.axis.set(inward.x * cos, -sin, inward.z * cos).normalize();
      // Stop at the floor, or at the far wall for a low sun.
      shaft.length = Math.max(
        0.6,
        Math.min((origin.y - floorY) / sin, (shaft.span - 0.4) / cos),
      );

      // Turn the quad about the beam so its face is toward the camera. Edge
      // on it would be a bright line, so fade it out as it gets there.
      scratch.toCam.copy(state.camera.position).sub(origin);
      scratch.side.crossVectors(shaft.axis, scratch.toCam);
      if (scratch.side.lengthSq() < 1e-6) scratch.side.crossVectors(shaft.axis, scratch.up);
      scratch.side.normalize();
      scratch.normal.crossVectors(scratch.side, shaft.axis).normalize();
      scratch.basis.makeBasis(scratch.side, shaft.axis, scratch.normal);
      mesh.quaternion.setFromRotationMatrix(scratch.basis);
      mesh.position.copy(origin);
      mesh.scale.set(hole.width, shaft.length, 1);

      scratch.toCam.normalize();
      const facing = 1 - Math.abs(shaft.axis.dot(scratch.toCam));
      material.uniforms.uIntensity.value =
        strength * 0.15 * values.shaftIntensity * shaft.open * THREE.MathUtils.smoothstep(facing, 0, 0.3);
      material.uniforms.uColor.value.copy(warm);
    }

    const mesh = motesRef.current;
    if (!mesh || motes.length === 0) return;
    moteMaterial.opacity = Math.min(0.7, strength * 0.34 * values.moteDensity);
    mesh.visible = visible;
    if (!visible) return;

    const time = state.clock.elapsedTime;
    for (let index = 0; index < motes.length; index += 1) {
      const mote = motes[index];
      const shaft = shafts[mote.shaft];
      scratch.side.crossVectors(shaft.axis, scratch.up).normalize();

      // Drift down the beam and wrap, with a slow sideways turn.
      const travel = ((mote.along + time * mote.rate) % 1) * shaft.length;
      const drift = Math.sin(time * 0.3 + mote.sway) * 0.09;
      scratch.position
        .copy(shaft.origin)
        .addScaledVector(shaft.axis, travel)
        .addScaledVector(scratch.side, mote.u + drift)
        .addScaledVector(scratch.up, mote.v + Math.cos(time * 0.22 + mote.sway) * 0.05);
      scratch.scale.setScalar(mote.size);
      scratch.matrix.compose(scratch.position, scratch.quaternion, scratch.scale);
      mesh.setMatrixAt(index, scratch.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  });

  if (windows.length === 0) return null;
  return (
    <group>
      {shafts.map((shaft) => (
        <primitive key={shaft.hole.id} object={shaft.mesh} />
      ))}
      <instancedMesh
        ref={motesRef}
        args={[moteGeometry, moteMaterial, motes.length]}
        frustumCulled={false}
      />
    </group>
  );
}
