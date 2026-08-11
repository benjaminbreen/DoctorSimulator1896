import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { fillInstances } from './lib/instances.js';
import StaticColliders from './lib/StaticColliders.jsx';
import { buildCarousel, CAROUSEL } from '../world/carousel.js';
import { canopyTexture, friezeTexture, drumTexture, platformTexture, valanceTexture } from './carouselPaint.js';
import { getInteraction, useInstrument, stopUsing } from '../world/interaction.js';
import { gameDebug } from '../debug.js';
import { recover } from '../world/player.js';

// The 1871 carousel: static pavilion (posts, rails, rounding boards,
// scallop valance, striped canopy, pennant) around the rotating machine —
// painted platform, drum, mast, sweeps, brass poles, and eighteen horses.
// Horses are one merged geometry instanced in three paint layers. Negative
// spin so the horses lead with their heads; the outer row gallops.

const SPEED = -0.3; // rad/s — a leisurely mule's pace, heads first
const scratch = new THREE.Object3D();
const scratchColor = new THREE.Color();

function merged(parts) {
  const geometries = parts.map(([geometry, x, y, z, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1]) => {
    const matrix = new THREE.Matrix4().compose(
      new THREE.Vector3(x, y, z),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)),
      new THREE.Vector3(sx, sy, sz),
    );
    return geometry.applyMatrix4(matrix);
  });
  const out = mergeGeometries(geometries);
  geometries.forEach((geometry) => geometry.dispose());
  return out;
}

// A carousel jumper facing +x, proud arched neck, forelegs tucked, hind
// legs trailing — feet near y = 0.2 so the horse rides its pole.
function horseGeometries() {
  const box = (...args) => new THREE.BoxGeometry(...args);
  const cyl = (rTop, rBottom, len, seg = 8) => new THREE.CylinderGeometry(rTop, rBottom, len, seg);
  const sphere = (r) => new THREE.SphereGeometry(r, 12, 9);
  const Z90 = Math.PI / 2;
  const body = merged([
    // Barrel, chest, rump, belly line.
    [cyl(0.215, 0.215, 0.6, 12), 0, 1.06, 0, 0, 0, Z90],
    [sphere(0.235), 0.34, 1.07, 0, 0, 0, 0, 1, 0.96, 0.92],
    [sphere(0.245), -0.33, 1.05, 0, 0, 0, 0, 1, 0.94, 0.9],
    // Neck rising forward, throat, and the head.
    [cyl(0.115, 0.165, 0.5, 10), 0.47, 1.36, 0, 0, 0, -0.55],
    [sphere(0.11), 0.6, 1.56, 0],
    [box(0.3, 0.17, 0.15), 0.72, 1.58, 0, 0, 0, -0.12],
    [cyl(0.052, 0.075, 0.2, 8), 0.88, 1.55, 0, 0, 0, Z90 + 0.15],
    [box(0.05, 0.14, 0.045), 0.63, 1.7, 0.05, 0, 0, -0.15],
    [box(0.05, 0.14, 0.045), 0.63, 1.7, -0.05, 0, 0, -0.15],
    // Forelegs tucked at the knee, hind legs trailing back.
    [cyl(0.042, 0.055, 0.32, 7), 0.32, 0.85, 0.13, 0, 0, 1.15],
    [cyl(0.042, 0.055, 0.32, 7), 0.32, 0.85, -0.13, 0, 0, 1.15],
    [cyl(0.03, 0.042, 0.3, 7), 0.48, 0.74, 0.13, 0, 0, 2.5],
    [cyl(0.03, 0.042, 0.3, 7), 0.48, 0.74, -0.13, 0, 0, 2.5],
    [cyl(0.05, 0.062, 0.34, 7), -0.4, 0.82, 0.12, 0, 0, -1.0],
    [cyl(0.05, 0.062, 0.34, 7), -0.4, 0.82, -0.12, 0, 0, -1.0],
    [cyl(0.032, 0.045, 0.34, 7), -0.6, 0.62, 0.12, 0, 0, -0.3],
    [cyl(0.032, 0.045, 0.34, 7), -0.6, 0.62, -0.12, 0, 0, -0.3],
  ]);
  const tack = merged([
    // Blanket in two scalloped layers, saddle with rolled cantle and pommel.
    [box(0.5, 0.035, 0.46), -0.01, 1.26, 0],
    [box(0.44, 0.045, 0.4), -0.01, 1.28, 0],
    [box(0.3, 0.1, 0.27), -0.01, 1.33, 0],
    [cyl(0.05, 0.05, 0.26, 8), -0.15, 1.38, 0, Z90, 0, 0],
    [cyl(0.04, 0.04, 0.18, 8), 0.12, 1.38, 0, Z90, 0, 0],
    // Girth around the barrel, stirrup straps, bridle, reins.
    [new THREE.TorusGeometry(0.245, 0.022, 6, 18), 0, 1.06, 0, 0, Z90, 0],
    [box(0.04, 0.3, 0.02), 0, 1.12, 0.21],
    [box(0.04, 0.3, 0.02), 0, 1.12, -0.21],
    [box(0.02, 0.15, 0.015), 0.68, 1.58, 0.08],
    [box(0.02, 0.15, 0.015), 0.68, 1.58, -0.08],
    [box(0.02, 0.02, 0.17), 0.8, 1.55, 0],
    [box(0.72, 0.016, 0.016), 0.48, 1.47, 0.075, 0, 0, 0.16],
    [box(0.72, 0.016, 0.016), 0.48, 1.47, -0.075, 0, 0, 0.16],
  ]);
  const dark = merged([
    // Crest mane in three falls, forelock, three-segment tail, hooves, eyes.
    [box(0.32, 0.16, 0.05), 0.38, 1.52, 0, 0, 0, -0.55],
    [box(0.26, 0.14, 0.05), 0.52, 1.64, 0, 0, 0, -0.4],
    [box(0.1, 0.15, 0.04), 0.66, 1.72, 0, 0, 0, -0.2],
    [cyl(0.035, 0.05, 0.3, 6), -0.46, 1.22, 0, 0, 0, 0.9],
    [cyl(0.028, 0.042, 0.34, 6), -0.63, 1.05, 0, 0, 0, 0.35],
    [cyl(0.016, 0.03, 0.3, 6), -0.72, 0.86, 0, 0, 0, -0.1],
    [box(0.09, 0.08, 0.095), 0.55, 0.62, 0.13],
    [box(0.09, 0.08, 0.095), 0.55, 0.62, -0.13],
    [box(0.09, 0.08, 0.095), -0.68, 0.47, 0.12],
    [box(0.09, 0.08, 0.095), -0.68, 0.47, -0.12],
    [box(0.035, 0.035, 0.02), 0.68, 1.62, 0.085],
    [box(0.035, 0.035, 0.02), 0.68, 1.62, -0.085],
  ]);
  return { body, tack, dark };
}

// Twelve-facet canopy cone, u following the angle so the stripes land one
// sector per facet. Double-sided: the underside shows the stripes in shade.
function canopyGeometry(roof, sides) {
  const positions = [];
  const uvs = [];
  for (let k = 0; k < sides; k += 1) {
    const a1 = (k / sides) * Math.PI * 2;
    const a2 = ((k + 1) / sides) * Math.PI * 2;
    const p1 = [Math.cos(a1) * roof.eaveR, roof.eaveY, Math.sin(a1) * roof.eaveR];
    const p2 = [Math.cos(a2) * roof.eaveR, roof.eaveY, Math.sin(a2) * roof.eaveR];
    const apex = [0, roof.apexY, 0];
    const normalY = (p2[2] - p1[2]) * (apex[0] - p1[0]) - (p2[0] - p1[0]) * (apex[2] - p1[2]);
    const [a, b] = normalY > 0 ? [p1, p2] : [p2, p1];
    const [ua, ub] = normalY > 0 ? [k / sides, (k + 1) / sides] : [(k + 1) / sides, k / sides];
    positions.push(...a, ...b, ...apex);
    uvs.push(ua, 1, ub, 1, (k + 0.5) / sides, 0);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.computeVertexNormals();
  return geo;
}

// Swallow pennant: a tapered strip whose vertices ripple in useFrame.
function pennantGeometry(length, hoist) {
  const geo = new THREE.PlaneGeometry(length, hoist, 12, 3);
  geo.translate(length / 2, 0, 0);
  const position = geo.attributes.position;
  for (let i = 0; i < position.count; i += 1) {
    const x = position.getX(i);
    position.setY(i, position.getY(i) * (1 - 0.78 * (x / length)));
  }
  return geo;
}

export default function Carousel() {
  const spinRef = useRef(null);
  const windRef = useRef(null);
  const pennantRef = useRef(null);

  const built = useMemo(() => buildCarousel(), []);

  const parts = useMemo(() => {
    const cream = new THREE.MeshStandardMaterial({ color: '#e9dfc4', roughness: 0.66 });
    const brass = new THREE.MeshStandardMaterial({ color: '#b08d3f', metalness: 0.8, roughness: 0.35, envMapIntensity: 1.1 });
    const vermilion = new THREE.MeshStandardMaterial({ color: '#a23520', roughness: 0.7 });
    const darkWood = new THREE.MeshStandardMaterial({ color: '#4c3826', roughness: 0.95 });

    // Static pavilion pieces share one instanced mesh of cream paint.
    const creamBoxes = [...built.posts, ...built.rails, ...built.steps];
    const pavilion = fillInstances(new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), cream, creamBoxes.length), creamBoxes);

    // Rounding boards and the cut-out scallop valance below them.
    const frieze = new THREE.MeshStandardMaterial({ map: friezeTexture(), roughness: 0.7 });
    const chord = 2 * built.rounding.radius * Math.sin(Math.PI / built.sides);
    const rounding = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), frieze, built.sides);
    for (let k = 0; k < built.sides; k += 1) {
      const a1 = (k / built.sides) * Math.PI * 2;
      const a2 = ((k + 1) / built.sides) * Math.PI * 2;
      scratch.position.set(
        ((Math.cos(a1) + Math.cos(a2)) / 2) * built.rounding.radius,
        built.rounding.y,
        ((Math.sin(a1) + Math.sin(a2)) / 2) * built.rounding.radius,
      );
      scratch.rotation.set(0, -Math.atan2(Math.sin(a2) - Math.sin(a1), Math.cos(a2) - Math.cos(a1)), 0);
      scratch.scale.set(chord + 0.05, built.rounding.height, 0.07);
      scratch.updateMatrix();
      rounding.setMatrixAt(k, scratch.matrix);
    }
    scratch.rotation.set(0, 0, 0);
    scratch.scale.set(1, 1, 1);
    rounding.instanceMatrix.needsUpdate = true;
    rounding.computeBoundingSphere?.();
    rounding.castShadow = true;

    const valanceMap = valanceTexture();
    valanceMap.repeat.set(built.sides * 1.5, 1);
    const valance = new THREE.Mesh(
      new THREE.CylinderGeometry(built.rounding.radius - 0.02, built.rounding.radius - 0.02, 0.3, 48, 1, true),
      new THREE.MeshStandardMaterial({ map: valanceMap, transparent: false, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.75 }),
    );
    valance.position.y = built.rounding.y - built.rounding.height / 2 - 0.13;

    const canopy = new THREE.Mesh(
      canopyGeometry(built.roof, built.sides),
      new THREE.MeshStandardMaterial({ map: canopyTexture(built.sides), roughness: 0.8, side: THREE.DoubleSide }),
    );
    canopy.castShadow = true;
    const finial = new THREE.Mesh(new THREE.SphereGeometry(0.15, 12, 10), brass);
    finial.position.y = built.roof.apexY + 0.1;
    const flagpole = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.03, 0.85, 8), brass);
    flagpole.position.y = built.roof.apexY + 0.5;
    const pennant = new THREE.Mesh(
      pennantGeometry(1.05, 0.3),
      new THREE.MeshStandardMaterial({ color: '#c03a22', roughness: 0.85, side: THREE.DoubleSide }),
    );
    pennant.position.y = built.roof.apexY + 0.78;

    // Rotating machine: platform (painted top, dark underside), rim lip,
    // drum, mast, sweeps out to the pole heads, poles, horses.
    const platform = new THREE.Mesh(
      new THREE.CylinderGeometry(built.platform.radius, built.platform.radius, built.platform.height, 48),
      [darkWood, new THREE.MeshStandardMaterial({ map: platformTexture(), roughness: 0.8 }), darkWood],
    );
    platform.position.y = built.platform.height / 2;
    platform.receiveShadow = true;
    const rim = new THREE.Mesh(
      new THREE.CylinderGeometry(built.platform.radius + 0.05, built.platform.radius + 0.05, built.platform.height - 0.02, 48, 1, true),
      vermilion,
    );
    rim.position.y = built.platform.height / 2;
    const drum = new THREE.Mesh(
      new THREE.CylinderGeometry(built.drum.radius, built.drum.radius, built.drum.height, 24),
      [new THREE.MeshStandardMaterial({ map: drumTexture(), roughness: 0.7 }), cream, cream],
    );
    drum.position.y = built.drum.y + built.drum.height / 2;
    drum.castShadow = true;
    const drumCap = new THREE.Mesh(new THREE.CylinderGeometry(0.5, built.drum.radius + 0.06, 0.3, 24), brass);
    drumCap.position.y = built.drum.y + built.drum.height + 0.15;

    // Real mirrors in the drum's gold frames: chrome ovals that reflect the
    // environment probe and sweep the park as the drum turns. Panel angles
    // match the cylinder's UV layout (x = r sin, z = r cos).
    const mirrorPanels = [1, 3, 5, 7];
    const mirrors = new THREE.InstancedMesh(
      new THREE.CircleGeometry(1, 28),
      new THREE.MeshStandardMaterial({ color: '#dfe6ea', metalness: 1, roughness: 0.06, envMapIntensity: 1.5 }),
      mirrorPanels.length,
    );
    mirrorPanels.forEach((panel, index) => {
      const theta = ((panel + 0.5) / 8) * Math.PI * 2;
      scratch.position.set(
        Math.sin(theta) * (built.drum.radius + 0.02),
        built.drum.y + built.drum.height / 2,
        Math.cos(theta) * (built.drum.radius + 0.02),
      );
      scratch.rotation.set(0, theta, 0);
      scratch.scale.set(0.2, 0.55, 1);
      scratch.updateMatrix();
      mirrors.setMatrixAt(index, scratch.matrix);
    });
    scratch.rotation.set(0, 0, 0);
    scratch.scale.set(1, 1, 1);
    mirrors.instanceMatrix.needsUpdate = true;
    mirrors.computeBoundingSphere?.();
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(built.mast.radius, built.mast.radius, built.mast.top, 10), brass);
    mast.position.y = built.mast.top / 2;

    const sweepMastY = built.mast.top - 0.25;
    const sweeps = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 0.09, 0.07), vermilion, built.horses.length);
    const poles = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.035, 0.035, 1, 8), brass, built.horses.length);
    built.horses.forEach((horse, index) => {
      const drop = sweepMastY - built.poleTopY;
      const length = Math.hypot(horse.radius, drop);
      scratch.position.set(
        Math.cos(horse.angle) * horse.radius * 0.5,
        (sweepMastY + built.poleTopY) / 2,
        Math.sin(horse.angle) * horse.radius * 0.5,
      );
      scratch.rotation.set(0, -horse.angle, -Math.asin(drop / length));
      scratch.scale.set(length, 1, 1);
      scratch.updateMatrix();
      sweeps.setMatrixAt(index, scratch.matrix);

      const poleH = built.poleTopY - built.platform.height;
      scratch.position.set(
        Math.cos(horse.angle) * horse.radius,
        built.platform.height + poleH / 2,
        Math.sin(horse.angle) * horse.radius,
      );
      scratch.rotation.set(0, 0, 0);
      scratch.scale.set(1, poleH, 1);
      scratch.updateMatrix();
      poles.setMatrixAt(index, scratch.matrix);
    });
    scratch.scale.set(1, 1, 1);
    sweeps.instanceMatrix.needsUpdate = true;
    poles.instanceMatrix.needsUpdate = true;
    sweeps.computeBoundingSphere?.();
    poles.computeBoundingSphere?.();
    sweeps.castShadow = true;

    const horseGeo = horseGeometries();
    const horseMeshes = ['body', 'tack', 'dark'].map((layer) => {
      const mesh = new THREE.InstancedMesh(
        horseGeo[layer],
        new THREE.MeshStandardMaterial({ roughness: layer === 'body' ? 0.5 : 0.68 }),
        built.horses.length,
      );
      built.horses.forEach((horse, index) => {
        mesh.setColorAt(index, scratchColor.setRGB(...horse[layer === 'body' ? 'body' : layer === 'tack' ? 'accent' : 'dark']));
      });
      mesh.instanceColor.needsUpdate = true;
      mesh.castShadow = true;
      // Refilled every frame for the gallop; culling would use stale spheres.
      mesh.frustumCulled = false;
      return mesh;
    });

    return {
      pavilion, rounding, valance, canopy, finial, flagpole, pennant,
      platform, rim, drum, drumCap, mirrors, mast, sweeps, poles, horseMeshes,
    };
  }, [built]);

  // Ride on E: mount the nearest outer horse from either entry, dismount on
  // the next press. The interaction store handles the rest — PlayerRig
  // freezes and hides the body, CameraRig eases onto the moving framing that
  // this component steers from the saddle every frame.
  const rideRef = useRef({ horse: null, since: 0, framing: null });
  useEffect(() => {
    const onKey = (event) => {
      if (event.code !== 'KeyE') return;
      const ride = rideRef.current;
      const now = performance.now();
      if (ride.horse !== null) {
        if (now - ride.since > 350) {
          ride.horse = null;
          stopUsing();
        }
        return;
      }
      const reach = getInteraction().reach;
      if (!reach?.id?.startsWith('carousel-ride')) return;
      // Nearest outer-row horse to where the player stands.
      const player = gameDebug.player.position;
      const spin = spinRef.current?.rotation.y ?? 0;
      let best = null;
      let bestDistance = Infinity;
      built.horses.forEach((horse, index) => {
        if (!horse.bobs) return;
        const psi = horse.angle - spin - CAROUSEL.yaw;
        const x = CAROUSEL.x + Math.cos(psi) * horse.radius;
        const z = CAROUSEL.z + Math.sin(psi) * horse.radius;
        const distance = (x - player[0]) ** 2 + (z - player[2]) ** 2;
        if (distance < bestDistance) {
          bestDistance = distance;
          best = index;
        }
      });
      if (best === null) return;
      ride.horse = best;
      ride.since = now;
      ride.framing = { position: [0, 0, 0], target: [0, 0, 0] };
      recover({
        neurasthenia: 10,
        source: 'carousel',
        label: 'Rode on the carousel',
      });
      useInstrument({ id: 'carousel-ride', framing: ride.framing });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [built]);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    if (spinRef.current) spinRef.current.rotation.y = t * SPEED;
    // Horses ride their poles; only the outer row gallops.
    for (const mesh of parts.horseMeshes) {
      built.horses.forEach((horse, index) => {
        const bob = horse.bobs ? Math.sin(t * 2.1 + horse.phase) * 0.13 + 0.13 : 0.02;
        scratch.position.set(
          Math.cos(horse.angle) * horse.radius,
          built.platform.height + bob,
          Math.sin(horse.angle) * horse.radius,
        );
        scratch.rotation.set(0, horse.yaw, 0);
        scratch.updateMatrix();
        mesh.setMatrixAt(index, scratch.matrix);
      });
      mesh.instanceMatrix.needsUpdate = true;
    }
    scratch.rotation.set(0, 0, 0);
    // Steer the ride framing from the saddle of the chosen horse.
    const ride = rideRef.current;
    if (ride.horse !== null) {
      if (getInteraction().using?.id !== 'carousel-ride') {
        // Something else ended the ride (their escape handling); let go.
        ride.horse = null;
      } else {
        const horse = built.horses[ride.horse];
        const spin = spinRef.current?.rotation.y ?? 0;
        const psi = horse.angle - spin - CAROUSEL.yaw;
        const bob = Math.sin(t * 2.1 + horse.phase) * 0.13 + 0.13;
        const eyeY = built.ground + built.platform.height + bob + 2.02;
        const ex = CAROUSEL.x + Math.cos(psi) * horse.radius;
        const ez = CAROUSEL.z + Math.sin(psi) * horse.radius;
        ride.framing.position[0] = ex;
        ride.framing.position[1] = eyeY;
        ride.framing.position[2] = ez;
        // Look ahead along the direction of travel, dipping with the gallop.
        ride.framing.target[0] = ex - Math.sin(psi) * 4;
        ride.framing.target[1] = eyeY - 0.25 - bob * 0.3;
        ride.framing.target[2] = ez + Math.cos(psi) * 4;
      }
    }
    // The pennant streams leeward and ripples toward its tip.
    if (windRef.current) windRef.current.rotation.y = 0.9 + Math.sin(t * 0.17) * 0.35;
    const flag = pennantRef.current;
    if (flag) {
      const position = flag.geometry.attributes.position;
      for (let i = 0; i < position.count; i += 1) {
        const x = position.getX(i);
        const reach = x / 1.05;
        position.setZ(i, Math.sin(x * 6.5 - t * 7.5) * 0.11 * reach * reach + Math.sin(t * 1.3) * 0.03 * reach);
      }
      position.needsUpdate = true;
      flag.geometry.computeVertexNormals();
    }
  });

  return (
    <>
      <group position={[CAROUSEL.x, built.ground, CAROUSEL.z]} rotation={[0, CAROUSEL.yaw, 0]}>
        <primitive object={parts.pavilion} />
        <primitive object={parts.rounding} />
        <primitive object={parts.valance} />
        <primitive object={parts.canopy} />
        <primitive object={parts.finial} />
        <primitive object={parts.flagpole} />
        <group ref={windRef}>
          <primitive object={parts.pennant} ref={pennantRef} />
        </group>
        <group ref={spinRef}>
          <primitive object={parts.platform} />
          <primitive object={parts.rim} />
          <primitive object={parts.drum} />
          <primitive object={parts.drumCap} />
          <primitive object={parts.mirrors} />
          <primitive object={parts.mast} />
          <primitive object={parts.sweeps} />
          <primitive object={parts.poles} />
          {parts.horseMeshes.map((mesh, index) => (
            <primitive key={index} object={mesh} />
          ))}
        </group>
      </group>
      <StaticColliders entries={built.colliders} />
    </>
  );
}
