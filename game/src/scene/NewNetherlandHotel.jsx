import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame, useLoader } from '@react-three/fiber';
import { identifyLandmark } from '../world/landmarkInformation.js';
import { solarRamps, smoothstep } from '../world/solar.js';

const TRIM_STONE = '#87624a';
const GLASS = '#252d2c';
const IRON = '#222728';
const DOOR = '#32251f';
const LAMP_DAY_COLOR = new THREE.Color('#625d53');
const LAMP_DUSK_COLOR = new THREE.Color('#e2ba73');

// The supplied brick photograph is a useful relief source, but its strong red
// albedo does not match period descriptions of the hotel as dull yellowish or
// buff brick. Grade it in linear colour after the map is sampled so the brick
// variation survives without making the whole upper building red.
function gradedMapMaterial(options, { target, saturation, tintMix, lift }) {
  const material = new THREE.MeshStandardMaterial(options);
  const tint = new THREE.Color(target);
  const targetVector = [tint.r, tint.g, tint.b].map((channel) => channel.toFixed(6)).join(', ');
  material.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <map_fragment>',
      `#include <map_fragment>
      float gradedMapLuma = dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722));
      diffuseColor.rgb = mix(vec3(gradedMapLuma), diffuseColor.rgb, ${saturation.toFixed(3)});
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(${targetVector}), ${tintMix.toFixed(3)});
      diffuseColor.rgb *= ${lift.toFixed(3)};`,
    );
  };
  material.customProgramCacheKey = () => `graded-map-${target}-${saturation}-${tintMix}-${lift}`;
  return material;
}

function InstancedBoxes({ name, instances, geometry, material, castShadow = false, receiveShadow = false }) {
  const meshRef = useRef();
  useLayoutEffect(() => {
    if (!meshRef.current) return;
    const dummy = new THREE.Object3D();
    instances.forEach((instance, index) => {
      dummy.position.fromArray(instance.position);
      dummy.rotation.fromArray(instance.rotation ?? [0, 0, 0]);
      dummy.scale.fromArray(instance.scale);
      dummy.updateMatrix();
      meshRef.current.setMatrixAt(index, dummy.matrix);
    });
    meshRef.current.instanceMatrix.needsUpdate = true;
    meshRef.current.computeBoundingBox();
    meshRef.current.computeBoundingSphere();
  }, [instances]);
  if (!instances.length) return null;
  return (
    <instancedMesh
      ref={meshRef}
      name={name}
      args={[geometry, material, instances.length]}
      castShadow={castShadow}
      receiveShadow={receiveShadow}
    />
  );
}

function MasonryArchBlocks({ face, radius, spring, depth, boxGeometry, material }) {
  const instances = useMemo(() => {
    const blockCount = Math.max(7, Math.round(radius * 10));
    const pierRows = Math.max(3, Math.round(spring / 0.55));
    const archRadius = radius + 0.02;
    const blocks = Array.from({ length: blockCount }, (_, index) => {
      const theta = (index + 0.5) * Math.PI / blockCount;
      return face === 'west' ? {
        position: [-depth, spring + Math.sin(theta) * archRadius, Math.cos(theta) * archRadius],
        rotation: [theta, 0, 0],
        scale: [0.34, Math.PI * archRadius / blockCount * 0.88, 0.34],
      } : {
        position: [Math.cos(theta) * archRadius, spring + Math.sin(theta) * archRadius, depth],
        rotation: [0, 0, theta],
        scale: [0.34, Math.PI * archRadius / blockCount * 0.88, 0.34],
      };
    });
    for (const offset of [-radius, radius]) {
      for (let index = 0; index < pierRows; index += 1) {
        blocks.push(face === 'west' ? {
          position: [-depth, (index + 0.5) * spring / pierRows, offset],
          scale: [0.34, spring / pierRows * 0.9, 0.36],
        } : {
          position: [offset, (index + 0.5) * spring / pierRows, depth],
          scale: [0.36, spring / pierRows * 0.9, 0.34],
        });
      }
    }
    return blocks;
  }, [depth, face, radius, spring]);
  return (
    <InstancedBoxes
      name={`${face} rusticated arch blocks`}
      instances={instances}
      geometry={boxGeometry}
      material={material}
    />
  );
}

export function roundedFootprintPoints(width, depth, radius, segments = 16) {
  const hx = width / 2;
  const hz = depth / 2;
  const safeRadius = Math.min(radius, width * 0.42, depth * 0.42);
  const cx = -hx + safeRadius;
  const cz = hz - safeRadius;
  const points = [
    new THREE.Vector2(-hx, -hz),
    new THREE.Vector2(hx, -hz),
    new THREE.Vector2(hx, hz),
    new THREE.Vector2(cx, hz),
  ];
  for (let index = 1; index <= segments; index += 1) {
    const angle = Math.PI / 2 + (Math.PI / 2) * (index / segments);
    points.push(new THREE.Vector2(
      cx + Math.cos(angle) * safeRadius,
      cz + Math.sin(angle) * safeRadius,
    ));
  }
  return points;
}

// A real rounded footprint, not a box with a cylinder pasted onto its corner.
// Every vertical band uses the same perimeter, so masonry courses remain
// continuous through the Fifth Avenue/59th Street turn.
export function createRoundedPrismGeometry(width, depth, radius, bottom, top, metresPerRepeat = 3.2) {
  const points = roundedFootprintPoints(width, depth, radius);
  const positions = [];
  const normals = [];
  const uvs = [];
  const indices = [];
  let distance = 0;

  for (let index = 0; index < points.length; index += 1) {
    const nextIndex = (index + 1) % points.length;
    const start = points[index];
    const end = points[nextIndex];
    const dx = end.x - start.x;
    const dz = end.y - start.y;
    const length = Math.hypot(dx, dz);
    const nx = dz / length;
    const nz = -dx / length;
    const base = positions.length / 3;
    positions.push(
      start.x, bottom, start.y,
      end.x, bottom, end.y,
      end.x, top, end.y,
      start.x, top, start.y,
    );
    for (let vertex = 0; vertex < 4; vertex += 1) normals.push(nx, 0, nz);
    uvs.push(
      distance / metresPerRepeat, bottom / metresPerRepeat,
      (distance + length) / metresPerRepeat, bottom / metresPerRepeat,
      (distance + length) / metresPerRepeat, top / metresPerRepeat,
      distance / metresPerRepeat, top / metresPerRepeat,
    );
    indices.push(base, base + 2, base + 1, base, base + 3, base + 2);
    distance += length;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

function createArcPanelGeometry({
  cx,
  cz,
  radius,
  thetaStart,
  thetaEnd,
  bottom,
  spring,
  rise = 0,
  segments = 12,
}) {
  const positions = [];
  const normals = [];
  const uvs = [];
  const indices = [];
  for (let index = 0; index <= segments; index += 1) {
    const t = index / segments;
    const theta = THREE.MathUtils.lerp(thetaStart, thetaEnd, t);
    const archT = Math.abs(t * 2 - 1);
    const top = spring + rise * Math.sqrt(Math.max(0, 1 - archT * archT));
    const x = cx + Math.cos(theta) * radius;
    const z = cz + Math.sin(theta) * radius;
    const nx = Math.cos(theta);
    const nz = Math.sin(theta);
    positions.push(x, bottom, z, x, top, z);
    normals.push(nx, 0, nz, nx, 0, nz);
    uvs.push(t, 0, t, 1);
    if (index < segments) {
      const base = index * 2;
      indices.push(base, base + 2, base + 3, base, base + 3, base + 1);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

function createArchFillGeometry(width, height, depth) {
  const radius = width / 2;
  const spring = height - radius;
  const shape = new THREE.Shape();
  shape.moveTo(-radius, 0);
  shape.lineTo(-radius, spring);
  shape.absarc(0, spring, radius, Math.PI, 0, true);
  shape.lineTo(radius, 0);
  shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: false,
    curveSegments: 16,
  });
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  return geometry;
}

function createGableGeometry(width, height, depth) {
  const shape = new THREE.Shape();
  shape.moveTo(-width / 2, 0);
  shape.lineTo(width / 2, 0);
  shape.lineTo(0, height);
  shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: false,
  });
  geometry.computeVertexNormals();
  return geometry;
}

function createHipRoofGeometry(width, depth, height, ridgeOffsetX = 0) {
  const hx = width / 2;
  const hz = depth / 2;
  const ridgeHalf = Math.max(0.8, hz - height * 0.72);
  const faces = [];
  const addTriangle = (a, b, c, expected) => {
    const ab = new THREE.Vector3().subVectors(b, a);
    const ac = new THREE.Vector3().subVectors(c, a);
    const normal = new THREE.Vector3().crossVectors(ab, ac);
    if (normal.dot(expected) < 0) faces.push(a, c, b);
    else faces.push(a, b, c);
  };
  const nw = new THREE.Vector3(-hx, 0, -hz);
  const ne = new THREE.Vector3(hx, 0, -hz);
  const se = new THREE.Vector3(hx, 0, hz);
  const sw = new THREE.Vector3(-hx, 0, hz);
  const rn = new THREE.Vector3(ridgeOffsetX, height, -ridgeHalf);
  const rs = new THREE.Vector3(ridgeOffsetX, height, ridgeHalf);
  addTriangle(nw, rn, rs, new THREE.Vector3(-1, 1, 0));
  addTriangle(nw, rs, sw, new THREE.Vector3(-1, 1, 0));
  addTriangle(ne, se, rs, new THREE.Vector3(1, 1, 0));
  addTriangle(ne, rs, rn, new THREE.Vector3(1, 1, 0));
  addTriangle(nw, ne, rn, new THREE.Vector3(0, 1, -1));
  addTriangle(sw, rs, se, new THREE.Vector3(0, 1, 1));
  const geometry = new THREE.BufferGeometry().setFromPoints(faces);
  const position = geometry.getAttribute('position');
  const uvs = [];
  for (let index = 0; index < position.count; index += 1) {
    uvs.push(
      (position.getX(index) + hx) / 2.2,
      (position.getZ(index) + hz) / 2.2,
    );
  }
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

// A steep lower roof ring makes the crown visible from street level. The
// matching rounded rings follow the masonry footprint instead of leaving a
// square roof corner hanging over the curved facade.
function createRoundedMansardGeometry(width, depth, radius, inset, height) {
  const outer = roundedFootprintPoints(width, depth, radius, 16);
  const inner = roundedFootprintPoints(
    width - inset * 2,
    depth - inset * 2,
    Math.max(0.7, radius - inset),
    16,
  );
  const positions = [];
  const uvs = [];
  const indices = [];
  let distance = 0;
  for (let index = 0; index < outer.length; index += 1) {
    const next = (index + 1) % outer.length;
    const base = positions.length / 3;
    positions.push(
      outer[index].x, 0, outer[index].y,
      outer[next].x, 0, outer[next].y,
      inner[next].x, height, inner[next].y,
      inner[index].x, height, inner[index].y,
    );
    const segment = outer[index].distanceTo(outer[next]);
    uvs.push(distance / 2.4, 0, (distance + segment) / 2.4, 0, (distance + segment) / 2.4, height / 2.4, distance / 2.4, height / 2.4);
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
    distance += segment;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

function WestArch({
  along,
  bottom,
  width,
  height,
  wallX,
  fillGeometry,
  torusGeometry,
  boxGeometry,
  glassMaterial,
  trimMaterial,
  depth = 0.2,
  fillInset = 0.04,
  masonryBlocks = false,
}) {
  const radius = width / 2;
  const spring = height - radius;
  return (
    <group position={[wallX, bottom, along]}>
      <mesh
        geometry={fillGeometry}
        material={glassMaterial}
        rotation={[0, -Math.PI / 2, 0]}
        position={[-fillInset, 0, 0]}
        receiveShadow
      />
      {masonryBlocks ? (
        <MasonryArchBlocks
          face="west"
          radius={radius}
          spring={spring}
          depth={depth}
          boxGeometry={boxGeometry}
          material={trimMaterial}
        />
      ) : (
        <>
          <mesh
            geometry={torusGeometry}
            material={trimMaterial}
            rotation={[0, -Math.PI / 2, 0]}
            position={[-depth, spring, 0]}
            scale={[radius, radius, 1]}
            castShadow
          />
          {[-radius, radius].map((offset) => (
            <mesh
              key={offset}
              geometry={boxGeometry}
              material={trimMaterial}
              position={[-depth, spring / 2, offset]}
              scale={[0.28, spring, 0.32]}
              castShadow
            />
          ))}
        </>
      )}
    </group>
  );
}

function SouthArch({
  along,
  bottom,
  width,
  height,
  wallZ,
  fillGeometry,
  torusGeometry,
  boxGeometry,
  glassMaterial,
  trimMaterial,
  depth = 0.2,
  fillInset = 0.04,
  masonryBlocks = false,
}) {
  const radius = width / 2;
  const spring = height - radius;
  return (
    <group position={[along, bottom, wallZ]}>
      <mesh geometry={fillGeometry} material={glassMaterial} position={[0, 0, fillInset]} receiveShadow />
      {masonryBlocks ? (
        <MasonryArchBlocks
          face="south"
          radius={radius}
          spring={spring}
          depth={depth}
          boxGeometry={boxGeometry}
          material={trimMaterial}
        />
      ) : (
        <>
          <mesh
            geometry={torusGeometry}
            material={trimMaterial}
            position={[0, spring, depth]}
            scale={[radius, radius, 1]}
            castShadow
          />
          {[-radius, radius].map((offset) => (
            <mesh
              key={offset}
              geometry={boxGeometry}
              material={trimMaterial}
              position={[offset, spring / 2, depth]}
              scale={[0.32, spring, 0.28]}
              castShadow
            />
          ))}
        </>
      )}
    </group>
  );
}

function WestArchSashes({ along, bottom, width, height, wallX, boxGeometry, material }) {
  const radius = width / 2;
  const spring = height - radius;
  const faceX = wallX - 0.23;
  const instances = useMemo(() => [
    { position: [faceX, bottom + spring * 0.5, along], scale: [0.08, spring, 0.045] },
    { position: [faceX, bottom + spring, along], scale: [0.08, 0.055, width - 0.16] },
    { position: [faceX, bottom + spring + radius * 0.38, along], scale: [0.08, radius * 0.67, 0.045] },
  ], [along, bottom, faceX, radius, spring, width]);
  return (
    <InstancedBoxes name="recessed west arch sashes" instances={instances} geometry={boxGeometry} material={material} />
  );
}

function SouthArchSashes({ along, bottom, width, height, wallZ, boxGeometry, material }) {
  const radius = width / 2;
  const spring = height - radius;
  const faceZ = wallZ + 0.23;
  const instances = useMemo(() => [
    { position: [along, bottom + spring * 0.5, faceZ], scale: [0.045, spring, 0.08] },
    { position: [along, bottom + spring, faceZ], scale: [width - 0.16, 0.055, 0.08] },
    { position: [along, bottom + spring + radius * 0.38, faceZ], scale: [0.045, radius * 0.67, 0.08] },
  ], [along, bottom, faceZ, radius, spring, width]);
  return (
    <InstancedBoxes name="recessed south arch sashes" instances={instances} geometry={boxGeometry} material={material} />
  );
}

function WestArchGlazingBars({
  along,
  bottom,
  width,
  height,
  wallX,
  boxGeometry,
  material,
}) {
  const radius = width / 2;
  const spring = height - radius;
  const faceX = wallX - 0.19;
  return (
    <group name="two-storey glazing subdivision">
      {[-width * 0.24, 0, width * 0.24].map((offset) => (
        <mesh
          key={`vertical-${offset}`}
          geometry={boxGeometry}
          material={material}
          position={[faceX, bottom + spring / 2, along + offset]}
          scale={[0.13, spring, 0.09]}
          castShadow
        />
      ))}
      <mesh
        geometry={boxGeometry}
        material={material}
        position={[faceX, bottom + spring * 0.49, along]}
        scale={[0.13, 0.11, width - 0.22]}
        castShadow
      />
      <mesh
        geometry={boxGeometry}
        material={material}
        position={[faceX, bottom + spring, along]}
        scale={[0.13, 0.13, width - 0.16]}
        castShadow
      />
      <mesh
        geometry={boxGeometry}
        material={material}
        position={[faceX, bottom + spring + radius * 0.42, along]}
        scale={[0.13, radius * 0.72, 0.09]}
        castShadow
      />
    </group>
  );
}

function RectWindow({
  face,
  along,
  y,
  width,
  height,
  wall,
  boxGeometry,
  glassMaterial,
  trimMaterial,
  sashMaterial,
  projection = 0.015,
}) {
  const west = face === 'west';
  const position = west ? [wall - projection, y, along] : [along, y, wall + projection];
  const scale = west ? [0.035, height, width] : [width, height, 0.035];
  const sillPosition = west
    ? [wall - 0.09, y - height / 2 - 0.12, along]
    : [along, y - height / 2 - 0.12, wall + 0.09];
  const sillScale = west ? [0.16, 0.14, width + 0.2] : [width + 0.2, 0.14, 0.16];
  return (
    <group>
      <mesh geometry={boxGeometry} material={glassMaterial} position={position} scale={scale} receiveShadow />
      <mesh geometry={boxGeometry} material={trimMaterial} position={sillPosition} scale={sillScale} castShadow />
      <mesh
        geometry={boxGeometry}
        material={trimMaterial}
        position={west
          ? [wall - 0.1, y + height / 2 + 0.12, along]
          : [along, y + height / 2 + 0.12, wall + 0.1]}
        scale={west ? [0.18, 0.18, width + 0.22] : [width + 0.22, 0.18, 0.18]}
        castShadow
      />
      <mesh
        geometry={boxGeometry}
        material={sashMaterial}
        position={west
          ? [wall - 0.04, y, along]
          : [along, y, wall + 0.04]}
        scale={west ? [0.1, height - 0.12, 0.07] : [0.07, height - 0.12, 0.1]}
        castShadow
      />
      <mesh
        geometry={boxGeometry}
        material={sashMaterial}
        position={west
          ? [wall - 0.04, y, along]
          : [along, y, wall + 0.04]}
        scale={west ? [0.1, 0.07, width - 0.1] : [width - 0.1, 0.07, 0.1]}
        castShadow
      />
    </group>
  );
}

function RectWindowBatch({
  name,
  face,
  records,
  width,
  height,
  wall,
  boxGeometry,
  glassMaterials,
  trimMaterial,
  sashMaterial,
}) {
  const west = face === 'west';
  const batches = useMemo(() => {
    const glassClear = [];
    const glassDim = [];
    const roomsDark = [];
    const roomsSoft = [];
    const hollandShades = [];
    const curtainPanels = [];
    const sills = [];
    const lintels = [];
    const stoneJambs = [];
    const sashJambs = [];
    const sashRails = [];
    const muntins = [];
    records.forEach((record, index) => {
      const { along, y } = record;
      const projection = record.projection ?? 0.015;
      const facePosition = west ? wall - projection : wall + projection;
      const at = (nextY, alongOffset = 0, inset = 0) => (west
        ? [facePosition + inset, nextY, along + alongOffset]
        : [along + alongOffset, nextY, facePosition - inset]);
      const verticalScale = (span, thick) => (west
        ? [0.075, span, thick]
        : [thick, span, 0.075]);
      const horizontalScale = (span, thick) => (west
        ? [0.075, thick, span]
        : [span, thick, 0.075]);
      const paneHeight = height / 2 - 0.13;
      const paneScale = west
        ? [0.025, paneHeight, width - 0.18]
        : [width - 0.18, paneHeight, 0.025];
      const upperPane = { position: at(y + height * 0.255, 0, -0.09), scale: paneScale };
      const lowerPane = { position: at(y - height * 0.255, 0, -0.09), scale: paneScale };

      // Rolled and cylinder glass was neither perfectly flat nor a blue
      // mirror. Adjacent lights get a very small neutral value shift while
      // the dark room and fabric behind them do most of the visual work.
      (index % 3 === 0 ? glassDim : glassClear).push(upperPane);
      (index % 4 === 1 ? glassDim : glassClear).push(lowerPane);
      const room = {
        position: at(y, 0, -0.035),
        scale: west ? [0.035, height - 0.12, width - 0.14] : [width - 0.14, height - 0.12, 0.035],
      };
      (index % 5 === 2 ? roomsSoft : roomsDark).push(room);

      if (index % 5 === 1 || index % 7 === 4) {
        const drop = index % 2 ? 0.42 : 0.6;
        const shadeHeight = height * drop;
        hollandShades.push({
          position: at(y + height / 2 - shadeHeight / 2 - 0.07, 0, -0.062),
          scale: west
            ? [0.025, shadeHeight, width - 0.25]
            : [width - 0.25, shadeHeight, 0.025],
        });
      } else if (index % 6 === 3) {
        for (const side of [-1, 1]) curtainPanels.push({
          position: at(y - 0.03, side * width * 0.34, -0.065),
          scale: west
            ? [0.035, height * 0.78, width * 0.2]
            : [width * 0.2, height * 0.78, 0.035],
        });
      }

      sills.push({
        position: at(y - height / 2 - 0.12, 0, -0.13),
        scale: west ? [0.2, 0.14, width + 0.28] : [width + 0.28, 0.14, 0.2],
      });
      lintels.push({
        position: at(y + height / 2 + 0.12, 0, -0.135),
        scale: west ? [0.22, 0.18, width + 0.3] : [width + 0.3, 0.18, 0.22],
      });
      for (const side of [-1, 1]) {
        stoneJambs.push({
          position: at(y, side * (width / 2 + 0.08), -0.12),
          scale: verticalScale(height + 0.18, 0.15),
        });
        sashJambs.push({
          position: at(y, side * (width / 2 - 0.045), -0.135),
          scale: verticalScale(height - 0.03, 0.085),
        });
      }
      for (const railY of [y - height / 2 + 0.045, y, y + height / 2 - 0.045]) {
        sashRails.push({ position: at(railY, 0, -0.137), scale: horizontalScale(width, railY === y ? 0.1 : 0.075) });
      }
      muntins.push({ position: at(y, 0, -0.139), scale: verticalScale(height - 0.16, 0.045) });
    });
    return {
      glassClear, glassDim, roomsDark, roomsSoft, hollandShades, curtainPanels,
      sills, lintels, stoneJambs, sashJambs, sashRails, muntins,
    };
  }, [height, records, wall, west, width]);
  return (
    <group name={name}>
      <InstancedBoxes name={`${name} dark rooms`} instances={batches.roomsDark} geometry={boxGeometry} material={glassMaterials.roomDark} />
      <InstancedBoxes name={`${name} softly lit rooms`} instances={batches.roomsSoft} geometry={boxGeometry} material={glassMaterials.roomSoft} />
      <InstancedBoxes name={`${name} holland shades`} instances={batches.hollandShades} geometry={boxGeometry} material={glassMaterials.shadeCloth} />
      <InstancedBoxes name={`${name} curtain panels`} instances={batches.curtainPanels} geometry={boxGeometry} material={glassMaterials.curtain} />
      <InstancedBoxes name={`${name} clear old glass`} instances={batches.glassClear} geometry={boxGeometry} material={glassMaterials.glass} receiveShadow />
      <InstancedBoxes name={`${name} dim old glass`} instances={batches.glassDim} geometry={boxGeometry} material={glassMaterials.glassShade} receiveShadow />
      <InstancedBoxes name={`${name} sills`} instances={batches.sills} geometry={boxGeometry} material={trimMaterial} />
      <InstancedBoxes name={`${name} lintels`} instances={batches.lintels} geometry={boxGeometry} material={trimMaterial} />
      <InstancedBoxes name={`${name} stone jambs`} instances={batches.stoneJambs} geometry={boxGeometry} material={trimMaterial} />
      <InstancedBoxes name={`${name} sash jambs`} instances={batches.sashJambs} geometry={boxGeometry} material={sashMaterial} />
      <InstancedBoxes name={`${name} double-hung sash rails`} instances={batches.sashRails} geometry={boxGeometry} material={sashMaterial} />
      <InstancedBoxes name={`${name} narrow muntins`} instances={batches.muntins} geometry={boxGeometry} material={sashMaterial} />
    </group>
  );
}

function WestRectWindowAt({
  x,
  z,
  y,
  width,
  height,
  boxGeometry,
  glassMaterial,
  roomMaterial,
  trimMaterial,
  sashMaterial = trimMaterial,
  mullions = true,
}) {
  return (
    <group>
      {roomMaterial && (
        <mesh
          geometry={boxGeometry}
          material={roomMaterial}
          position={[x + 0.045, y, z]}
          scale={[0.055, height - 0.08, width - 0.08]}
        />
      )}
      <mesh
        geometry={boxGeometry}
        material={glassMaterial}
        position={[x, y, z]}
        scale={[0.10, height, width]}
        receiveShadow
      />
      <mesh
        geometry={boxGeometry}
        material={trimMaterial}
        position={[x - 0.08, y - height / 2 - 0.14, z]}
        scale={[0.22, 0.16, width + 0.24]}
        castShadow
      />
      {mullions && (
        <>
          <mesh
            geometry={boxGeometry}
            material={sashMaterial}
            position={[x - 0.07, y, z]}
            scale={[0.15, height - 0.1, 0.07]}
            castShadow
          />
          <mesh
            geometry={boxGeometry}
            material={sashMaterial}
            position={[x - 0.07, y, z]}
            scale={[0.15, 0.07, width - 0.08]}
            castShadow
          />
        </>
      )}
    </group>
  );
}

function WestGablePavilion({
  centerZ,
  wallX,
  baseY,
  width,
  shoulderHeight,
  gableHeight,
  depth,
  gableGeometry,
  boxGeometry,
  brickMaterial,
  glassMaterial,
  roomMaterial,
  trimMaterial,
  sashMaterial,
  finialMaterial = trimMaterial,
  lowerWindowOffsets,
  lowerWindowY,
  upperWindowWidth = 0.82,
  upperWindowHeight = 1.48,
  upperWindow = true,
}) {
  const facadeX = wallX - 0.12;
  const halfWidth = width / 2;
  const rakeLength = Math.hypot(halfWidth, gableHeight);
  const rakeAngle = Math.atan2(gableHeight, halfWidth);
  return (
    <group name="occupied west roof pavilion">
      <mesh
        geometry={boxGeometry}
        material={brickMaterial}
        position={[wallX + depth / 2 - 0.04, baseY + shoulderHeight / 2, centerZ]}
        scale={[depth, shoulderHeight, width]}
        castShadow
        receiveShadow
      />
      <mesh
        geometry={gableGeometry}
        material={brickMaterial}
        position={[wallX - 0.04, baseY + shoulderHeight - 0.02, centerZ]}
        rotation={[0, Math.PI / 2, 0]}
        castShadow
        receiveShadow
      />
      {lowerWindowOffsets.map((offset) => (
        <WestRectWindowAt
          key={offset}
          x={facadeX - 0.03}
          z={centerZ + offset}
          y={lowerWindowY}
          width={1.02}
          height={1.72}
          boxGeometry={boxGeometry}
          glassMaterial={glassMaterial}
          roomMaterial={roomMaterial}
          trimMaterial={trimMaterial}
          sashMaterial={sashMaterial}
        />
      ))}
      {upperWindow && (
        <WestRectWindowAt
          x={facadeX - 0.03}
          z={centerZ}
          y={baseY + shoulderHeight + gableHeight * 0.36}
          width={upperWindowWidth}
          height={upperWindowHeight}
          boxGeometry={boxGeometry}
          glassMaterial={glassMaterial}
          roomMaterial={roomMaterial}
          trimMaterial={trimMaterial}
          sashMaterial={sashMaterial}
        />
      )}
      <mesh
        geometry={boxGeometry}
        material={trimMaterial}
        position={[facadeX - 0.08, baseY + shoulderHeight - 0.06, centerZ]}
        scale={[0.24, 0.16, width + 0.18]}
        castShadow
      />
      {[-1, 1].map((side) => (
        <mesh
          key={`gable-rake-${side}`}
          geometry={boxGeometry}
          material={trimMaterial}
          position={[
            facadeX - 0.12,
            baseY + shoulderHeight + gableHeight / 2,
            centerZ + side * width / 4,
          ]}
          rotation={[side > 0 ? rakeAngle : Math.PI - rakeAngle, 0, 0]}
          scale={[0.28, 0.2, rakeLength + 0.18]}
          castShadow
        />
      ))}
      {[-halfWidth, halfWidth].map((offset) => (
        <mesh
          key={`gable-pier-${offset}`}
          geometry={boxGeometry}
          material={trimMaterial}
          position={[facadeX - 0.1, baseY + shoulderHeight / 2, centerZ + offset]}
          scale={[0.28, shoulderHeight + 0.2, 0.25]}
          castShadow
        />
      ))}
      {[-halfWidth, 0, halfWidth].map((offset, index) => (
        <mesh
          key={`gable-finial-${offset}`}
          material={finialMaterial}
          position={[
            facadeX - 0.12,
            index === 1 ? baseY + shoulderHeight + gableHeight + 0.22 : baseY + shoulderHeight + 0.28,
            centerZ + offset,
          ]}
          castShadow
        >
          <sphereGeometry args={[index === 1 ? 0.2 : 0.15, 10, 8]} />
        </mesh>
      ))}
    </group>
  );
}

function SouthGablePavilion({
  centerX,
  wallZ,
  baseY,
  width,
  shoulderHeight,
  gableGeometry,
  boxGeometry,
  brickMaterial,
  glassMaterial,
  roomMaterial,
  trimMaterial,
  sashMaterial,
  finialMaterial = trimMaterial,
}) {
  const depth = 0.42;
  const gableHeight = 2.35;
  const facadeZ = wallZ + 0.16;
  const rakeLength = Math.hypot(width / 2, gableHeight);
  const rakeAngle = Math.atan2(gableHeight, width / 2);
  return (
    <group name="occupied south roof pavilion">
      <mesh
        geometry={boxGeometry}
        material={brickMaterial}
        position={[centerX, baseY + shoulderHeight / 2, wallZ - depth / 2]}
        scale={[width, shoulderHeight, depth]}
        castShadow
        receiveShadow
      />
      <mesh
        geometry={gableGeometry}
        material={brickMaterial}
        position={[centerX, baseY + shoulderHeight - 0.02, wallZ - 0.08]}
        castShadow
        receiveShadow
      />
      <mesh
        geometry={boxGeometry}
        material={roomMaterial}
        position={[centerX, baseY + shoulderHeight * 0.55, facadeZ - 0.025]}
        scale={[0.88, 1.5, 0.06]}
      />
      <mesh
        geometry={boxGeometry}
        material={glassMaterial}
        position={[centerX, baseY + shoulderHeight * 0.55, facadeZ]}
        scale={[0.9, 1.55, 0.10]}
        receiveShadow
      />
      {[-0.45, 0, 0.45].map((offset, index) => (
        <mesh
          key={`south-dormer-sash-${index}`}
          geometry={boxGeometry}
          material={sashMaterial}
          position={[
            centerX + (index === 1 ? 0 : offset),
            baseY + shoulderHeight * 0.55 + (index === 1 ? 0 : 0),
            facadeZ + 0.065,
          ]}
          scale={index === 1 ? [0.9, 0.075, 0.08] : [0.065, 1.48, 0.08]}
          castShadow
        />
      ))}
      <mesh
        geometry={boxGeometry}
        material={trimMaterial}
        position={[centerX, baseY + shoulderHeight - 0.05, facadeZ + 0.06]}
        scale={[width + 0.16, 0.16, 0.22]}
        castShadow
      />
      {[-1, 1].map((side) => (
        <mesh
          key={`south-gable-rake-${side}`}
          geometry={boxGeometry}
          material={trimMaterial}
          position={[
            centerX + side * width / 4,
            baseY + shoulderHeight + gableHeight / 2,
            facadeZ + 0.08,
          ]}
          rotation={[0, 0, side > 0 ? -rakeAngle : rakeAngle]}
          scale={[rakeLength + 0.1, 0.16, 0.18]}
          castShadow
        />
      ))}
      <mesh
        material={finialMaterial}
        position={[centerX, baseY + shoulderHeight + gableHeight + 0.18, facadeZ + 0.04]}
        castShadow
      >
        <sphereGeometry args={[0.14, 10, 8]} />
      </mesh>
    </group>
  );
}

function FormalTopiary({ position, scale = 1, foliageMaterials, trunkMaterial, variant = 0 }) {
  const clusters = [
    [-0.36, 0.46, -0.1, 0.5, 0.37, 0.42],
    [0.34, 0.45, -0.08, 0.48, 0.4, 0.43],
    [-0.28, 0.56, 0.26, 0.46, 0.39, 0.4],
    [0.27, 0.58, 0.25, 0.45, 0.41, 0.39],
    [-0.02, 0.67, -0.22, 0.5, 0.43, 0.42],
    [0, 0.76, 0.16, 0.54, 0.42, 0.43],
    [-0.17, 0.9, -0.02, 0.4, 0.35, 0.36],
    [0.22, 0.88, 0.04, 0.36, 0.33, 0.34],
  ];
  const branches = [
    [-0.17, 0.37, 0.03, 0.46],
    [0.18, 0.39, 0.02, -0.43],
    [-0.08, 0.58, 0.12, 0.24],
  ];
  return (
    <group
      name="clipped boxwood topiary"
      position={position}
      rotation={[0, variant ? Math.PI : 0, 0]}
      scale={[scale, scale, scale]}
    >
      <mesh material={trunkMaterial} position={[0, 0.34, 0]} castShadow>
        <cylinderGeometry args={[0.075, 0.12, 0.68, 7]} />
      </mesh>
      {branches.map(([x, y, z, angle], index) => (
        <mesh
          key={`branch-${index}`}
          material={trunkMaterial}
          position={[x, y, z]}
          rotation={[0.18 * (index - 1), 0, angle]}
          castShadow
        >
          <cylinderGeometry args={[0.035, 0.05, 0.58, 6]} />
        </mesh>
      ))}
      {clusters.map(([x, y, z, sx, sy, sz], index) => (
        <mesh
          key={`leaf-cluster-${index}`}
          material={foliageMaterials[(index + variant) % foliageMaterials.length]}
          position={[x, y, z]}
          rotation={[index * 0.17, index * 0.61, index * 0.11]}
          scale={[sx, sy, sz]}
          castShadow
          receiveShadow
        >
          <icosahedronGeometry args={[1, 1]} />
        </mesh>
      ))}
    </group>
  );
}

function TurretPennant({ position, poleMaterial }) {
  const material = useMemo(() => new THREE.ShaderMaterial({
    name: 'low-cost red and gold turret pennant',
    side: THREE.DoubleSide,
    uniforms: {
      uTime: { value: 0 },
      uRed: { value: new THREE.Color('#8d201d') },
      uGold: { value: new THREE.Color('#d2a43f') },
    },
    vertexShader: `
      uniform float uTime;
      varying vec2 vUv;
      varying float vFoldLight;

      void main() {
        vUv = uv;
        vec3 animated = position;
        float freeEdge = pow(uv.x, 0.78);
        float broadWave = sin(uTime * 2.35 + position.x * 1.85 + uv.y * 0.8);
        float smallRipple = sin(uTime * 3.8 + position.x * 3.7 - uv.y * 2.1);
        animated.z += freeEdge * (broadWave * 0.18 + smallRipple * 0.055);
        animated.y += freeEdge * freeEdge * sin(uTime * 1.8 + position.x * 2.3) * 0.065;
        vFoldLight = 0.88 + 0.12 * cos(uTime * 2.35 + position.x * 1.85);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(animated, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 uRed;
      uniform vec3 uGold;
      varying vec2 vUv;
      varying float vFoldLight;

      void main() {
        float halfSpan = 0.5 * (1.0 - vUv.x);
        float insideEdge = halfSpan - abs(vUv.y - 0.5);
        if (insideEdge < 0.0) discard;

        float edgeGold = 1.0 - smoothstep(0.018, 0.052, insideEdge);
        float hoistGold = 1.0 - smoothstep(0.035, 0.07, vUv.x);
        vec2 emblemUv = (vUv - vec2(0.22, 0.5)) * vec2(1.0, 1.55);
        float emblemGold = 1.0 - smoothstep(0.072, 0.092, length(emblemUv));
        float goldMask = max(edgeGold, max(hoistGold, emblemGold));
        vec3 flagColor = mix(uRed, uGold, goldMask) * vFoldLight;
        gl_FragColor = vec4(flagColor, 1.0);
      }
    `,
  }), []);
  const geometry = useMemo(() => {
    const pennant = new THREE.PlaneGeometry(4.35, 1.65, 12, 2);
    pennant.translate(2.175, 0, 0);
    return pennant;
  }, []);

  useEffect(() => () => {
    material.dispose();
    geometry.dispose();
  }, [geometry, material]);

  useFrame((state) => {
    material.uniforms.uTime.value = state.clock.elapsedTime;
  });

  return (
    <group name="animated red and gold turret pennant" position={position} rotation={[0, -0.55, 0]}>
      <mesh material={poleMaterial} position={[0, 1.6, 0]} castShadow>
        <cylinderGeometry args={[0.045, 0.065, 3.2, 8]} />
      </mesh>
      <mesh material={poleMaterial} position={[0, 3.28, 0]} castShadow>
        <sphereGeometry args={[0.12, 10, 8]} />
      </mesh>
      <mesh geometry={geometry} material={material} position={[0.08, 2.34, 0]} />
    </group>
  );
}

export default function NewNetherlandHotel({ item, runtime }) {
  const [sx, sy, sourceDepth] = item.size;
  // The old footprint was visibly too narrow from Fifth Avenue. A modest
  // widening gives the three-bay arcade, entrance and rounded corner enough
  // room to match the mockup without changing the building's street position.
  const sz = sourceDepth + 2.4;
  const bottom = -sy / 2;
  const radius = 3.65;
  const podiumTop = bottom + 8.6;
  // The mockup devotes much more of the silhouette to an occupied roof crown
  // than the old tower did. Lowering the wall eave slightly keeps the body from
  // reading as a tall slab while the pavilions recover that height above it.
  const eave = bottom + 25.6;
  const westWall = -sx / 2;
  const southWall = sz / 2;
  const cornerCenter = useMemo(() => ({
    x: westWall + radius,
    z: southWall - radius,
  }), [radius, southWall, westWall]);
  const turretRadius = 1.55;
  const outward = (radius - turretRadius) / Math.SQRT2;
  const turretX = cornerCenter.x - outward;
  const turretZ = cornerCenter.z + outward;
  // The rounded masonry corner already supplies the lower tower. The roof
  // turret is therefore only a single occupied drum, not a three-storey silo.
  const turretBottom = eave - 0.85;
  const turretHeight = 4.5;
  const turretTop = turretBottom + turretHeight;

  const [brickMap, stoneMap, roofMap] = useLoader(THREE.TextureLoader, [
    '/textures/new-netherland/brick.png',
    '/textures/new-netherland/rusticated-stone.png',
    '/textures/new-netherland/slate-shingles.png',
  ]);
  const surfaceMaps = useMemo(() => {
    const prepare = (source, repeatX, repeatY) => {
      const texture = source.clone();
      texture.wrapS = THREE.RepeatWrapping;
      texture.wrapT = THREE.RepeatWrapping;
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.repeat.set(repeatX, repeatY);
      texture.anisotropy = 8;
      texture.needsUpdate = true;
      return texture;
    };
    return {
      brick: prepare(brickMap, 1.3, 1.5),
      // BoxGeometry normally maps the full image over each face. This repeat
      // restores the same brick scale as the metre-mapped rounded shaft on the
      // tall, flat Fifth Avenue pavilion.
      brickPanel: prepare(brickMap, 1.5, 8),
      stone: prepare(stoneMap, 0.78, 0.86),
      roof: prepare(roofMap, 1.4, 1.4),
    };
  }, [brickMap, roofMap, stoneMap]);
  useEffect(() => () => Object.values(surfaceMaps).forEach((texture) => texture.dispose()), [surfaceMaps]);

  const materials = useMemo(() => ({
    brick: gradedMapMaterial({
      map: surfaceMaps.brick,
      bumpMap: surfaceMaps.brick,
      bumpScale: -0.055,
      color: '#fff4ea',
      roughness: 0.84,
      metalness: 0,
    }, {
      target: '#c99172',
      saturation: 0.6,
      tintMix: 0.3,
      lift: 1.11,
    }),
    brickPanel: gradedMapMaterial({
      map: surfaceMaps.brickPanel,
      bumpMap: surfaceMaps.brickPanel,
      bumpScale: -0.045,
      color: '#fff4ea',
      roughness: 0.84,
      metalness: 0,
    }, {
      target: '#c99172',
      saturation: 0.6,
      tintMix: 0.3,
      lift: 1.11,
    }),
    brickDark: gradedMapMaterial({
      map: surfaceMaps.brick,
      bumpMap: surfaceMaps.brick,
      bumpScale: -0.05,
      color: '#fff6ea',
      roughness: 0.86,
      metalness: 0,
    }, {
      target: '#a8745c',
      saturation: 0.54,
      tintMix: 0.34,
      lift: 1.04,
    }),
    base: new THREE.MeshStandardMaterial({
      map: surfaceMaps.stone,
      bumpMap: surfaceMaps.stone,
      bumpScale: 0.095,
      color: '#ca947b',
      emissive: '#311814',
      emissiveIntensity: 0.12,
      roughness: 0.88,
      metalness: 0,
    }),
    baseTrim: new THREE.MeshStandardMaterial({
      map: surfaceMaps.stone,
      bumpMap: surfaceMaps.stone,
      bumpScale: 0.075,
      color: '#97614c',
      roughness: 0.87,
      metalness: 0,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    }),
    arcadeTrim: new THREE.MeshStandardMaterial({
      color: '#987057',
      roughness: 0.84,
      metalness: 0,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    }),
    trim: new THREE.MeshStandardMaterial({
      color: TRIM_STONE,
      roughness: 0.82,
      metalness: 0,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    }),
    roof: new THREE.MeshStandardMaterial({
      map: surfaceMaps.roof,
      bumpMap: surfaceMaps.roof,
      bumpScale: 0.055,
      color: '#d7dcde',
      roughness: 0.82,
      metalness: 0.02,
      side: THREE.DoubleSide,
    }),
    // The view is principally a dark room with cloth behind old cylinder
    // glass. Keep specular response weak and neutral; saturated blue panels
    // read as modern sealed glazing at this scale.
    glass: new THREE.MeshPhysicalMaterial({
      color: GLASS,
      roughness: 0.46,
      metalness: 0,
      clearcoat: 0.12,
      clearcoatRoughness: 0.68,
      envMapIntensity: 0.16,
      transparent: true,
      opacity: 0.3,
      depthWrite: false,
    }),
    glassShade: new THREE.MeshPhysicalMaterial({
      color: '#1d2526',
      roughness: 0.58,
      metalness: 0,
      clearcoat: 0.06,
      clearcoatRoughness: 0.78,
      envMapIntensity: 0.08,
      transparent: true,
      opacity: 0.38,
      depthWrite: false,
    }),
    archGlass: new THREE.MeshStandardMaterial({
      color: '#202827',
      roughness: 0.68,
      metalness: 0,
      envMapIntensity: 0.1,
    }),
    archGlassDim: new THREE.MeshStandardMaterial({
      color: '#171d1c',
      roughness: 0.78,
      metalness: 0,
      envMapIntensity: 0.04,
    }),
    roomDark: new THREE.MeshStandardMaterial({ color: '#171817', roughness: 0.96, metalness: 0 }),
    roomSoft: new THREE.MeshStandardMaterial({
      color: '#4b4436',
      emissive: '#2d2418',
      emissiveIntensity: 0.08,
      roughness: 0.94,
      metalness: 0,
    }),
    shadeCloth: new THREE.MeshStandardMaterial({ color: '#b8ad94', roughness: 0.98, metalness: 0 }),
    curtain: new THREE.MeshStandardMaterial({ color: '#756956', roughness: 0.97, metalness: 0 }),
    iron: new THREE.MeshStandardMaterial({ color: IRON, roughness: 0.48, metalness: 0.62 }),
    // Window sash was ordinarily painted wood. A matte response also avoids
    // subpixel metallic highlights crawling along the narrow muntins.
    windowSash: new THREE.MeshStandardMaterial({ color: '#202322', roughness: 0.78, metalness: 0.05 }),
    bronze: new THREE.MeshStandardMaterial({ color: '#a47731', roughness: 0.25, metalness: 0.82, envMapIntensity: 1.35 }),
    topiaryTrunk: new THREE.MeshStandardMaterial({ color: '#4b3526', roughness: 0.9, metalness: 0 }),
    door: new THREE.MeshStandardMaterial({ color: DOOR, roughness: 0.72, metalness: 0 }),
    foliage: new THREE.MeshStandardMaterial({ color: '#263d2c', roughness: 0.98, metalness: 0, flatShading: true }),
    foliageLight: new THREE.MeshStandardMaterial({ color: '#38533a', roughness: 0.98, metalness: 0, flatShading: true }),
    foliageShade: new THREE.MeshStandardMaterial({ color: '#1c3023', roughness: 1, metalness: 0, flatShading: true }),
    lampGlass: new THREE.MeshStandardMaterial({
      color: LAMP_DAY_COLOR,
      emissive: '#9d6327',
      emissiveIntensity: 0,
      roughness: 0.34,
      metalness: 0,
    }),
  }), [surfaceMaps]);
  useEffect(() => () => Object.values(materials).forEach((material) => material.dispose()), [materials]);
  useFrame(() => {
    if (!runtime) return;
    const { altitude, night } = solarRamps(runtime.values.timeOfDay, runtime.values.dayOfYear);
    const dusk = Math.max(1 - smoothstep(2, 10, altitude), night);
    materials.lampGlass.emissiveIntensity = dusk * 2.1;
    materials.lampGlass.color.copy(LAMP_DAY_COLOR).lerp(LAMP_DUSK_COLOR, dusk);
    materials.roomSoft.emissiveIntensity = 0.06 + dusk * 0.5;
  });

  const geometry = useMemo(() => {
    const unitBox = new THREE.BoxGeometry(1, 1, 1);
    const unitTorus = new THREE.TorusGeometry(1, 0.105, 8, 24, Math.PI);
    const podium = createRoundedPrismGeometry(sx + 0.22, sz + 0.22, radius + 0.11, bottom, podiumTop - 0.12);
    const podiumSpandrel = createRoundedPrismGeometry(
      sx + 0.08,
      sz + 0.08,
      radius + 0.04,
      podiumTop - 0.18,
      podiumTop + 0.62,
    );
    const shaft = createRoundedPrismGeometry(sx, sz, radius, podiumTop - 0.05, eave);
    const courseHeights = [bottom + 15.2, bottom + 20.5, eave - 0.55];
    const courses = courseHeights.map((y, index) => createRoundedPrismGeometry(
      sx + 0.34 + index * 0.06,
      sz + 0.34 + index * 0.06,
      radius + 0.17 + index * 0.03,
      y - (index === 3 ? 0.28 : 0.16),
      y + (index === 2 ? 0.38 : 0.16),
      3.2,
    ));
    const podiumCornice = createRoundedPrismGeometry(
      sx + 0.34,
      sz + 0.34,
      radius + 0.17,
      podiumTop - 0.14,
      podiumTop + 0.28,
      3.2,
    );
    const podiumBelt = createRoundedPrismGeometry(
      sx + 0.48,
      sz + 0.48,
      radius + 0.24,
      bottom + 4.35,
      bottom + 4.62,
      3.2,
    );
    const cornerGroundSurrounds = [];
    const cornerGroundWindows = [];
    for (const theta of [0.865, 0.785, 0.705, 0.625].map((value) => Math.PI * value)) {
      cornerGroundSurrounds.push(createArcPanelGeometry({
        cx: cornerCenter.x,
        cz: cornerCenter.z,
        radius: radius + 0.22,
        thetaStart: theta + Math.PI * 0.043,
        thetaEnd: theta - Math.PI * 0.043,
        bottom: bottom + 0.5,
        spring: bottom + 4.25,
        rise: 0.72,
        segments: 8,
      }));
      cornerGroundWindows.push(createArcPanelGeometry({
        cx: cornerCenter.x,
        cz: cornerCenter.z,
        radius: radius + 0.27,
        thetaStart: theta + Math.PI * 0.03,
        thetaEnd: theta - Math.PI * 0.03,
        bottom: bottom + 0.8,
        spring: bottom + 4.03,
        rise: 0.52,
        segments: 7,
      }));
    }
    const cornerWindows = [];
    const cornerWindowRooms = [];
    const cornerWindowSashes = [];
    const cornerWindowSills = [];
    const cornerWindowLintels = [];
    for (const y of [podiumTop + 2.35, podiumTop + 5.2, bottom + 17.5, bottom + 22.65]) {
      for (const theta of [Math.PI * 0.86, Math.PI * 0.64]) {
        const windowStart = theta + 0.11;
        const windowEnd = theta - 0.11;
        cornerWindowRooms.push(createArcPanelGeometry({
          cx: cornerCenter.x,
          cz: cornerCenter.z,
          radius: radius + 0.04,
          thetaStart: windowStart,
          thetaEnd: windowEnd,
          bottom: y - 0.9,
          spring: y + 0.9,
          segments: 5,
        }));
        cornerWindows.push(createArcPanelGeometry({
          cx: cornerCenter.x,
          cz: cornerCenter.z,
          radius: radius + 0.06,
          thetaStart: theta + 0.11,
          thetaEnd: theta - 0.11,
          bottom: y - 0.9,
          spring: y + 0.9,
          segments: 5,
        }));
        // One central muntin and a double-hung meeting rail follow the curve
        // instead of appearing as flat bars pasted across the corner.
        cornerWindowSashes.push(createArcPanelGeometry({
          cx: cornerCenter.x,
          cz: cornerCenter.z,
          radius: radius + 0.1,
          thetaStart: theta + 0.011,
          thetaEnd: theta - 0.011,
          bottom: y - 0.86,
          spring: y + 0.86,
          segments: 2,
        }));
        cornerWindowSashes.push(createArcPanelGeometry({
          cx: cornerCenter.x,
          cz: cornerCenter.z,
          radius: radius + 0.105,
          thetaStart: windowStart + 0.008,
          thetaEnd: windowEnd - 0.008,
          bottom: y - 0.055,
          spring: y + 0.055,
          segments: 5,
        }));
        cornerWindowSills.push(createArcPanelGeometry({
          cx: cornerCenter.x,
          cz: cornerCenter.z,
          radius: radius + 0.12,
          thetaStart: theta + 0.125,
          thetaEnd: theta - 0.125,
          bottom: y - 1.06,
          spring: y - 0.84,
          segments: 5,
        }));
        cornerWindowLintels.push(createArcPanelGeometry({
          cx: cornerCenter.x,
          cz: cornerCenter.z,
          radius: radius + 0.12,
          thetaStart: theta + 0.125,
          thetaEnd: theta - 0.125,
          bottom: y + 0.9,
          spring: y + 1.1,
          segments: 5,
        }));
      }
    }
    const turretWindows = [];
    const turretWindowRails = [];
    for (const offset of [1.65]) {
      for (const theta of [Math.PI * 0.89, Math.PI * 0.76, Math.PI * 0.63]) {
        turretWindows.push(createArcPanelGeometry({
          cx: turretX,
          cz: turretZ,
          radius: turretRadius + 0.035,
          thetaStart: theta + 0.052,
          thetaEnd: theta - 0.052,
          bottom: turretBottom + offset - 0.72,
          spring: turretBottom + offset + 0.55,
          rise: 0.22,
          segments: 5,
        }));
        turretWindowRails.push(createArcPanelGeometry({
          cx: turretX,
          cz: turretZ,
          radius: turretRadius + 0.075,
          thetaStart: theta + 0.046,
          thetaEnd: theta - 0.046,
          bottom: turretBottom + offset - 0.055,
          spring: turretBottom + offset + 0.055,
          rise: 0,
          segments: 4,
        }));
      }
    }
    const entranceFill = createArchFillGeometry(2.4, 3.75, 0.16);
    const entranceTorus = new THREE.TorusGeometry(1, 0.16, 8, 28, Math.PI);
    const arcadeFill = createArchFillGeometry(3.25, 4.65, 0.12);
    const baseArchFill = createArchFillGeometry(1.45, 2.75, 0.10);
    const upperBaseArchFill = createArchFillGeometry(1.25, 2.45, 0.10);
    const frontGableMain = createGableGeometry(5.35, 3.35, 1.3);
    const sideGable = createGableGeometry(2.75, 2.35, 0.28);
    const roofSkirtHeight = 5.35;
    const roofSkirtInset = 3.05;
    const roofSkirt = createRoundedMansardGeometry(
      sx + 0.85,
      sz + 0.85,
      radius + 0.42,
      roofSkirtInset,
      roofSkirtHeight,
    );
    const roof = createHipRoofGeometry(
      sx + 0.85 - roofSkirtInset * 2,
      sz + 0.85 - roofSkirtInset * 2,
      4.6,
      -0.8,
    );
    const leftPavilionRoof = createHipRoofGeometry(2.7, 4.3, 3.8);
    return {
      unitBox,
      unitTorus,
      podium,
      podiumSpandrel,
      shaft,
      courses,
      podiumCornice,
      podiumBelt,
      cornerGroundSurrounds,
      cornerGroundWindows,
      cornerWindows,
      cornerWindowRooms,
      cornerWindowSashes,
      cornerWindowSills,
      cornerWindowLintels,
      turretWindows,
      turretWindowRails,
      entranceFill,
      entranceTorus,
      arcadeFill,
      baseArchFill,
      upperBaseArchFill,
      frontGableMain,
      sideGable,
      roofSkirt,
      roof,
      leftPavilionRoof,
    };
  }, [bottom, cornerCenter, eave, podiumTop, radius, sx, sz, turretBottom, turretRadius, turretX, turretZ]);
  useEffect(() => () => {
    Object.values(geometry).flat().forEach((entry) => entry?.dispose?.());
  }, [geometry]);

  const frontUpperWindows = useMemo(() => {
    const records = [];
    for (const y of [bottom + 17.5, bottom + 22.65]) {
      // One bay belongs to the left pavilion. The remaining four belong to
      // the central facade between it and the rounded corner.
      records.push({ y, z: -8.1, projection: 0.28 });
      for (const z of [-5.15, -2.45, 0.25, 2.95]) records.push({ y, z, projection: 0.015 });
    }
    return records;
  }, [bottom]);
  const sideUpperWindows = useMemo(() => {
    const records = [];
    for (const y of [bottom + 11.35, bottom + 14.65, bottom + 17.5, bottom + 20.35, bottom + 23.2]) {
      for (const x of [-4.8, -1.7, 1.4, 4.5, 7.5]) records.push({ x, y });
    }
    return records;
  }, [bottom]);
  const frontUpperWindowBatch = useMemo(
    () => frontUpperWindows.map(({ y, z, projection }) => ({ y, along: z, projection })),
    [frontUpperWindows],
  );
  const sideUpperWindowBatch = useMemo(
    () => sideUpperWindows.map(({ x, y }) => ({ y, along: x })),
    [sideUpperWindows],
  );
  const roofDentilInstances = useMemo(() => [
    ...[-9.45, -8.55, -7.65, -6.75, -5.85, -4.95, -4.05, -3.15, -2.25, -1.35, -0.45, 0.45, 1.35, 2.25, 3.15]
      .map((z) => ({ position: [westWall - 0.38, eave - 0.78, z], scale: [0.48, 0.34, 0.38] })),
    ...[-5.8, -4.9, -4.0, -3.1, -2.2, -1.3, -0.4, 0.5, 1.4, 2.3, 3.2, 4.1, 5.0, 5.9, 6.8, 7.7, 8.6]
      .map((x) => ({ position: [x, eave - 0.78, southWall + 0.38], scale: [0.38, 0.34, 0.48] })),
  ], [eave, southWall, westWall]);
  const arcadeDentilInstances = useMemo(() => [
    ...[-9.2, -8.55, -7.9, -7.25, -6.6, -5.95, -5.3, -4.65, -4.0, -3.35, -2.7, -2.05, -1.4, -0.75, -0.1, 0.55, 1.2, 1.85, 2.5, 3.15]
      .map((z) => ({ position: [westWall - 0.38, bottom + 14.84, z], scale: [0.46, 0.3, 0.3] })),
  ], [bottom, westWall]);

  const identify = (event) => {
    identifyLandmark(item, event);
  };

  return (
    <group
      name="New Netherland Hotel phase-one reconstruction"
      position={item.position}
      rotation={[0, item.yaw ?? 0, 0]}
      onClick={identify}
      userData={{ reconstructionPass: 'phase-2-material-and-ornament', source: 'new-netherlands-hero-render-mockup' }}
    >
      <group name="rounded masonry shell">
        <mesh geometry={geometry.podium} material={materials.base} castShadow receiveShadow />
        <mesh geometry={geometry.podiumSpandrel} material={materials.brick} castShadow receiveShadow />
        <mesh geometry={geometry.shaft} material={materials.brick} castShadow receiveShadow />
        <mesh geometry={geometry.podiumBelt} material={materials.baseTrim} castShadow receiveShadow />
        <mesh geometry={geometry.podiumCornice} material={materials.baseTrim} castShadow receiveShadow />
        {geometry.courses.map((course, index) => (
          <mesh key={index} geometry={course} material={materials.trim} castShadow receiveShadow />
        ))}
      </group>

      <group name="street-level openings">
        {[-8.3, -6.65, -4.45, 1.15, 2.8].map((z) => (
          <group key={z}>
            <WestArch
              along={z}
              bottom={bottom + 0.65}
              width={1.45}
              height={2.75}
              wallX={westWall - 0.18}
              fillGeometry={geometry.baseArchFill}
              torusGeometry={geometry.unitTorus}
              boxGeometry={geometry.unitBox}
              glassMaterial={materials.archGlassDim}
              trimMaterial={materials.baseTrim}
              masonryBlocks
            />
            <WestArchSashes
              along={z}
              bottom={bottom + 0.65}
              width={1.45}
              height={2.75}
              wallX={westWall - 0.18}
              boxGeometry={geometry.unitBox}
              material={materials.windowSash}
            />
            <WestArch
              along={z}
              bottom={bottom + 5.15}
              width={1.25}
              height={2.45}
              wallX={westWall - 0.18}
              fillGeometry={geometry.upperBaseArchFill}
              torusGeometry={geometry.unitTorus}
              boxGeometry={geometry.unitBox}
              glassMaterial={materials.archGlass}
              trimMaterial={materials.baseTrim}
              masonryBlocks
            />
            <WestArchSashes
              along={z}
              bottom={bottom + 5.15}
              width={1.25}
              height={2.45}
              wallX={westWall - 0.18}
              boxGeometry={geometry.unitBox}
              material={materials.windowSash}
            />
          </group>
        ))}
        <group name="projecting entrance portal">
          <WestArch
          along={-1.1}
          bottom={bottom + 0.65}
          width={2.4}
          height={3.75}
          wallX={westWall - 0.17}
          fillGeometry={geometry.entranceFill}
          torusGeometry={geometry.entranceTorus}
          boxGeometry={geometry.unitBox}
          glassMaterial={materials.door}
          trimMaterial={materials.baseTrim}
          depth={0.38}
          fillInset={0.34}
          />
          <mesh
            geometry={geometry.unitBox}
            material={materials.iron}
            position={[westWall - 0.57, bottom + 1.9, -1.1]}
            scale={[0.12, 3.0, 0.08]}
            castShadow
          />
          <mesh
            geometry={geometry.unitBox}
            material={materials.iron}
            position={[westWall - 0.57, bottom + 2.05, -1.1]}
            scale={[0.12, 0.08, 1.95]}
            castShadow
          />
          {[-1.42, 1.42].map((offset) => (
            <mesh
              key={offset}
              geometry={geometry.unitBox}
              material={materials.baseTrim}
              position={[westWall - 0.54, bottom + 2.05, -1.1 + offset]}
              scale={[0.66, 3.55, 0.42]}
              castShadow
              receiveShadow
            />
          ))}
          <mesh
            geometry={geometry.unitBox}
            material={materials.baseTrim}
            position={[westWall - 0.52, bottom + 0.62, -1.1]}
            scale={[0.72, 0.28, 3.18]}
            castShadow
          />
          <mesh
            geometry={geometry.unitBox}
            material={materials.baseTrim}
            position={[westWall - 0.66, bottom + 4.25, -1.1]}
            scale={[0.84, 0.36, 3.45]}
            castShadow
            receiveShadow
          />
          {[-1.47, 1.47].map((offset) => (
            <group key={`portal-column-${offset}`}>
              <mesh
                material={materials.baseTrim}
                position={[westWall - 0.82, bottom + 2.18, -1.1 + offset]}
                castShadow
              >
                <cylinderGeometry args={[0.29, 0.34, 3.25, 12]} />
              </mesh>
              <mesh
                geometry={geometry.unitBox}
                material={materials.baseTrim}
                position={[westWall - 0.82, bottom + 3.9, -1.1 + offset]}
                scale={[0.7, 0.28, 0.7]}
                castShadow
              />
            </group>
          ))}
          {[-2.02, 2.02].map((offset) => (
            <group key={`entrance-lantern-${offset}`}>
              <mesh
                geometry={geometry.unitBox}
                material={materials.iron}
                position={[westWall - 0.9, bottom + 3.35, -1.1 + offset]}
                scale={[0.72, 0.075, 0.075]}
                castShadow
              />
              <mesh material={materials.iron} position={[westWall - 1.25, bottom + 3.42, -1.1 + offset]} castShadow>
                <coneGeometry args={[0.25, 0.22, 8]} />
              </mesh>
              <mesh
                geometry={geometry.unitBox}
                material={materials.lampGlass}
                position={[westWall - 1.25, bottom + 3.12, -1.1 + offset]}
                scale={[0.3, 0.48, 0.3]}
              />
              <mesh material={materials.iron} position={[westWall - 1.25, bottom + 2.83, -1.1 + offset]} castShadow>
                <cylinderGeometry args={[0.2, 0.24, 0.12, 8]} />
              </mesh>
            </group>
          ))}
          {[
            { x: westWall - 1.42, y: bottom + 0.14, width: 3.65, depth: 1.75 },
            { x: westWall - 1.12, y: bottom + 0.29, width: 3.4, depth: 1.48 },
            { x: westWall - 0.84, y: bottom + 0.44, width: 3.15, depth: 1.2 },
            { x: westWall - 0.58, y: bottom + 0.59, width: 2.9, depth: 0.94 },
          ].map((step) => (
            <mesh
              key={step.x}
              geometry={geometry.unitBox}
              material={materials.base}
              position={[step.x, step.y, -1.1]}
              scale={[step.depth, 0.3, step.width]}
              castShadow
              receiveShadow
            />
          ))}
        </group>
        {geometry.cornerGroundSurrounds.map((surround, index) => (
          <mesh key={`corner-ground-surround-${index}`} geometry={surround} material={materials.baseTrim} receiveShadow />
        ))}
        {geometry.cornerGroundWindows.map((windowGeometry, index) => (
          <mesh key={`corner-ground-window-${index}`} geometry={windowGeometry} material={index % 2 ? materials.archGlassDim : materials.archGlass} receiveShadow />
        ))}
        {[-0.6, 1.6, 3.8, 6.0, 8.15].map((x) => (
          <group key={x}>
            {[bottom + 0.65, bottom + 4.65].map((openingBottom) => (
              <group key={openingBottom}>
                <SouthArch
                  along={x}
                  bottom={openingBottom}
                  width={1.5}
                  height={2.75}
                  wallZ={southWall + 0.18}
                  fillGeometry={geometry.baseArchFill}
                  torusGeometry={geometry.unitTorus}
                  boxGeometry={geometry.unitBox}
                  glassMaterial={materials.archGlassDim}
                  trimMaterial={materials.baseTrim}
                  masonryBlocks
                />
                <SouthArchSashes
                  along={x}
                  bottom={openingBottom}
                  width={1.5}
                  height={2.75}
                  wallZ={southWall + 0.18}
                  boxGeometry={geometry.unitBox}
                  material={materials.windowSash}
                />
              </group>
            ))}
          </group>
        ))}
      </group>

      <group name="large front arcade">
        {[-4.75, -1.1, 2.55].map((z) => (
          <group key={z}>
            <WestArch
              along={z}
              bottom={podiumTop + 0.55}
              width={3.25}
              height={4.65}
              wallX={westWall - 0.15}
              fillGeometry={geometry.arcadeFill}
              torusGeometry={geometry.unitTorus}
              boxGeometry={geometry.unitBox}
              glassMaterial={materials.archGlass}
              trimMaterial={materials.arcadeTrim}
              depth={0.24}
              fillInset={0.06}
            />
            <WestArchGlazingBars
              along={z}
              bottom={podiumTop + 0.55}
              width={3.25}
              height={4.65}
              wallX={westWall - 0.15}
              boxGeometry={geometry.unitBox}
              material={materials.windowSash}
            />
            <mesh
              geometry={geometry.unitBox}
              material={materials.arcadeTrim}
              position={[westWall - 0.48, podiumTop + 5.03, z]}
              scale={[0.42, 0.56, 0.5]}
              rotation={[Math.PI / 4, 0, 0]}
              castShadow
            />
            {[-1, 1].map((side) => (
              <mesh
                key={`arcade-impost-${side}`}
                geometry={geometry.unitBox}
                material={materials.arcadeTrim}
                position={[westWall - 0.44, podiumTop + 3.58, z + side * 1.63]}
                scale={[0.38, 0.3, 0.62]}
                castShadow
              />
            ))}
          </group>
        ))}
        <mesh
          geometry={geometry.unitBox}
          material={materials.baseTrim}
          position={[westWall - 0.17, podiumTop + 0.38, -1.1]}
          scale={[0.16, 0.22, 10.55]}
          castShadow
        />
      </group>

      <group name="entrance forecourt details">
        {[-4.05, 1.85].map((z) => (
          <group key={`freestanding-lamp-${z}`} position={[westWall - 1.75, bottom + 0.2, z]}>
            <mesh material={materials.iron} position={[0, 0.12, 0]} castShadow>
              <cylinderGeometry args={[0.28, 0.36, 0.24, 12]} />
            </mesh>
            <mesh material={materials.iron} position={[0, 0.36, 0]} castShadow>
              <cylinderGeometry args={[0.17, 0.26, 0.32, 12]} />
            </mesh>
            <mesh material={materials.iron} position={[0, 1.7, 0]} castShadow>
              <cylinderGeometry args={[0.06, 0.1, 2.8, 12]} />
            </mesh>
            {[0.72, 2.7].map((y) => (
              <mesh key={`lamp-collar-${y}`} material={materials.iron} position={[0, y, 0]} castShadow>
                <cylinderGeometry args={[0.14, 0.14, 0.11, 12]} />
              </mesh>
            ))}
            <mesh material={materials.iron} position={[0, 3.02, 0]} castShadow>
              <cylinderGeometry args={[0.29, 0.34, 0.12, 8]} />
            </mesh>
            <mesh geometry={geometry.unitBox} material={materials.lampGlass} position={[0, 3.38, 0]} scale={[0.46, 0.66, 0.46]} />
            {[-0.24, 0.24].map((offset) => (
              <group key={`lantern-frame-${offset}`}>
                <mesh geometry={geometry.unitBox} material={materials.iron} position={[offset, 3.38, 0]} scale={[0.045, 0.72, 0.045]} castShadow />
                <mesh geometry={geometry.unitBox} material={materials.iron} position={[0, 3.38, offset]} scale={[0.045, 0.72, 0.045]} castShadow />
              </group>
            ))}
            <mesh material={materials.iron} position={[0, 3.78, 0]} castShadow>
              <coneGeometry args={[0.39, 0.28, 8]} />
            </mesh>
            <mesh material={materials.iron} position={[0, 4.0, 0]} castShadow>
              <sphereGeometry args={[0.1, 10, 8]} />
            </mesh>
          </group>
        ))}
        {[-2.38, 0.18].map((z) => (
          <group key={`entrance-railing-${z}`}>
            {[westWall - 1.42, westWall - 1.08, westWall - 0.74, westWall - 0.4].map((x, index) => (
              <group key={x}>
                <mesh
                  geometry={geometry.unitBox}
                  material={materials.iron}
                  position={[x, bottom + 0.66 + index * 0.11, z]}
                  scale={[0.055, 0.95, 0.055]}
                  castShadow
                />
                <mesh material={materials.iron} position={[x, bottom + 1.18 + index * 0.11, z]} castShadow>
                  <sphereGeometry args={[0.085, 8, 6]} />
                </mesh>
              </group>
            ))}
            <mesh
              geometry={geometry.unitBox}
              material={materials.iron}
              position={[westWall - 0.9, bottom + 1.13, z]}
              rotation={[0, 0, -0.28]}
              scale={[1.72, 0.07, 0.07]}
              castShadow
            />
            {[-1.16, -0.76].map((offset, index) => (
              <mesh
                key={`railing-scroll-${offset}`}
                geometry={geometry.unitTorus}
                material={materials.iron}
                position={[westWall + offset, bottom + 0.72 + index * 0.1, z]}
                rotation={[0, 0, index ? Math.PI : 0]}
                scale={[0.2, 0.2, 0.2]}
                castShadow
              />
            ))}
          </group>
        ))}
        {[-5.35, 3.25].map((z) => (
          <group key={`planter-${z}`}>
            <mesh
              geometry={geometry.unitBox}
              material={materials.baseTrim}
              position={[westWall - 0.58, bottom + 0.48, z]}
              scale={[0.9, 0.58, 2.25]}
              castShadow
              receiveShadow
            />
            {[-0.55, 0.55].map((offset, index) => (
              <FormalTopiary
                key={offset}
                position={[westWall - 0.72, bottom + 0.77, z + offset]}
                scale={0.72 + index * 0.035}
                variant={z > 0 ? index + 1 : index}
                foliageMaterials={[materials.foliage, materials.foliageLight, materials.foliageShade]}
                trunkMaterial={materials.topiaryTrunk}
              />
            ))}
          </group>
        ))}
      </group>

      <group name="upper facade window fields">
        <group name="projecting left pavilion tower">
          <mesh
            geometry={geometry.unitBox}
            material={materials.brickPanel}
            position={[westWall - 0.13, (podiumTop + eave) / 2, -8.1]}
            scale={[0.26, eave - podiumTop - 0.35, 3.7]}
            castShadow
            receiveShadow
          />
          {[-9.98, -6.22].map((z) => (
            <mesh
              key={z}
              geometry={geometry.unitBox}
              material={materials.trim}
              position={[westWall - 0.3, (podiumTop + eave) / 2, z]}
              scale={[0.28, eave - podiumTop - 0.45, 0.16]}
              castShadow
              receiveShadow
            />
          ))}
          {[bottom + 15.2, bottom + 20.5, eave - 0.55].map((y) => (
            <mesh
              key={y}
              geometry={geometry.unitBox}
              material={materials.trim}
              position={[westWall - 0.34, y, -8.1]}
              scale={[0.32, 0.28, 3.96]}
              castShadow
            />
          ))}
        </group>
        <RectWindowBatch
          name="west upper windows"
          face="west"
          records={frontUpperWindowBatch}
          width={1.2}
          height={1.85}
          wall={westWall}
          boxGeometry={geometry.unitBox}
          glassMaterials={materials}
          trimMaterial={materials.trim}
          sashMaterial={materials.windowSash}
        />
        <RectWindowBatch
          name="south upper windows"
          face="south"
          records={sideUpperWindowBatch}
          width={1.12}
          height={1.78}
          wall={southWall}
          boxGeometry={geometry.unitBox}
          glassMaterials={materials}
          trimMaterial={materials.trim}
          sashMaterial={materials.windowSash}
        />
        {geometry.cornerWindowRooms.map((roomGeometry, index) => (
          <mesh key={`corner-room-${index}`} geometry={roomGeometry} material={index % 5 === 2 ? materials.roomSoft : materials.roomDark} />
        ))}
        {geometry.cornerWindows.map((windowGeometry, index) => (
          <mesh
            key={index}
            geometry={windowGeometry}
            material={index % 3 === 1 ? materials.glassShade : materials.glass}
            receiveShadow
          />
        ))}
        {geometry.cornerWindowSills.map((sillGeometry, index) => (
          <mesh key={`corner-sill-${index}`} geometry={sillGeometry} material={materials.trim} castShadow />
        ))}
        {geometry.cornerWindowLintels.map((lintelGeometry, index) => (
          <mesh key={`corner-lintel-${index}`} geometry={lintelGeometry} material={materials.trim} castShadow />
        ))}
        {geometry.cornerWindowSashes.map((sashGeometry, index) => (
          <mesh key={`corner-sash-${index}`} geometry={sashGeometry} material={materials.windowSash} castShadow />
        ))}
      </group>

      <group name="roof and gabled crown">
        <mesh geometry={geometry.roofSkirt} material={materials.roof} position={[0, eave - 0.12, 0]} castShadow receiveShadow />
        <mesh geometry={geometry.roof} material={materials.roof} position={[0, eave + 5.18, 0]} castShadow receiveShadow />
        <InstancedBoxes name="roof cornice dentils" instances={roofDentilInstances} geometry={geometry.unitBox} material={materials.trim} />
        <InstancedBoxes name="arcade cornice ornament" instances={arcadeDentilInstances} geometry={geometry.unitBox} material={materials.trim} />

        <WestGablePavilion
          centerZ={-1.1}
          wallX={westWall}
          baseY={eave - 0.15}
          width={5.35}
          shoulderHeight={3.35}
          gableHeight={3.35}
          depth={1.3}
          gableGeometry={geometry.frontGableMain}
          boxGeometry={geometry.unitBox}
          brickMaterial={materials.brick}
          glassMaterial={materials.glass}
          roomMaterial={materials.roomDark}
          trimMaterial={materials.trim}
          sashMaterial={materials.windowSash}
          finialMaterial={materials.bronze}
          lowerWindowOffsets={[-1.3, 1.3]}
          lowerWindowY={eave + 1.58}
          upperWindowWidth={0.9}
          upperWindowHeight={1.62}
        />

        <group name="smaller left roof pavilion">
          <mesh
            geometry={geometry.unitBox}
            material={materials.brick}
            position={[westWall + 0.53, eave + 0.78, -8.1]}
            scale={[1.1, 1.9, 3.7]}
            castShadow
            receiveShadow
          />
          <mesh
            geometry={geometry.leftPavilionRoof}
            material={materials.roof}
            position={[westWall + 0.55, eave + 1.68, -8.1]}
            castShadow
            receiveShadow
          />
          <WestRectWindowAt
            x={westWall - 0.08}
            z={-8.1}
            y={eave + 0.9}
            width={0.92}
            height={1.3}
            boxGeometry={geometry.unitBox}
            glassMaterial={materials.glassShade}
            roomMaterial={materials.roomDark}
            trimMaterial={materials.trim}
            sashMaterial={materials.windowSash}
          />
          <mesh
            material={materials.bronze}
            position={[westWall + 0.55, eave + 5.65, -8.1]}
            castShadow
          >
            <sphereGeometry args={[0.19, 10, 8]} />
          </mesh>
        </group>

        {[-3.35, 0.25, 3.85].map((x, index) => (
          <SouthGablePavilion
            key={x}
            centerX={x}
            wallZ={southWall}
            baseY={eave - 0.12}
            width={2.75}
            shoulderHeight={2.05}
            gableGeometry={geometry.sideGable}
            boxGeometry={geometry.unitBox}
            brickMaterial={materials.brick}
            glassMaterial={index === 1 ? materials.glassShade : materials.glass}
            roomMaterial={materials.roomDark}
            trimMaterial={materials.trim}
            sashMaterial={materials.windowSash}
            finialMaterial={materials.bronze}
          />
        ))}

        <mesh
          material={materials.brickDark}
          position={[turretX, turretBottom + turretHeight / 2, turretZ]}
          castShadow
          receiveShadow
        >
          <cylinderGeometry args={[turretRadius, turretRadius, turretHeight, 28]} />
        </mesh>
        {geometry.turretWindows.map((windowGeometry, index) => (
          <mesh
            key={index}
            geometry={windowGeometry}
            material={index % 2 ? materials.archGlassDim : materials.archGlass}
            receiveShadow
          />
        ))}
        {geometry.turretWindowRails.map((railGeometry, index) => (
          <mesh key={`turret-window-rail-${index}`} geometry={railGeometry} material={materials.windowSash} castShadow />
        ))}
        {[turretBottom + 0.18, turretTop - 0.22].map((y, index) => (
          <mesh key={y} material={materials.trim} position={[turretX, y, turretZ]} castShadow receiveShadow>
            <cylinderGeometry args={[
              turretRadius + (index === 1 ? 0.18 : 0.1),
              turretRadius + (index === 1 ? 0.18 : 0.1),
              index === 1 ? 0.38 : 0.28,
              28,
            ]} />
          </mesh>
        ))}
        <mesh material={materials.roof} position={[turretX, turretTop + 2.45, turretZ]} castShadow receiveShadow>
          <coneGeometry args={[turretRadius + 0.3, 4.9, 32]} />
        </mesh>
        <mesh material={materials.bronze} position={[turretX, turretTop + 5.08, turretZ]} castShadow>
          <sphereGeometry args={[0.22, 12, 8]} />
        </mesh>
        <TurretPennant
          position={[turretX, turretTop + 5.08, turretZ]}
          poleMaterial={materials.bronze}
        />
        <mesh
          geometry={geometry.unitBox}
          material={materials.iron}
          position={[westWall + 2.42, eave + 7.02, -1.85]}
          scale={[0.18, 1.45, 6.7]}
          castShadow
        />
        {[-4.35, 0.65].map((z) => (
          <mesh
            key={`roof-sign-support-${z}`}
            geometry={geometry.unitBox}
            material={materials.iron}
            position={[westWall + 2.43, eave + 6.18, z]}
            scale={[0.14, 1.55, 0.14]}
            castShadow
          />
        ))}
        {[
          [westWall - 0.18, eave + 6.88, -1.1],
          [-3.35, eave + 4.55, southWall + 0.28],
          [0.25, eave + 4.55, southWall + 0.28],
          [3.85, eave + 4.55, southWall + 0.28],
        ].map(([x, y, z], index) => (
          <mesh key={index} material={materials.bronze} position={[x, y, z]} castShadow>
            <sphereGeometry args={[0.19, 10, 8]} />
          </mesh>
        ))}
      </group>
    </group>
  );
}
