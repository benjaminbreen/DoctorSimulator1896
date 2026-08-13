import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useLoader } from '@react-three/fiber';
import { notice } from '../world/notices.js';

const MARBLE = '#dedbd0';
const MARBLE_LIGHT = '#f4f0e6';
const MARBLE_SHADOW = '#c5c2b8';
const SASH = '#353a38';
const IRON = '#202826';
const COPPER = '#5b8c7c';
const COPPER_DARK = '#35695f';
const COPPER_WARM = '#7f7852';
const HEDGE = '#385834';
const GLASS = ['#64777b', '#74817e', '#5d7375', '#79807a'];
const ROOMS = ['#8f876f', '#7b7c70', '#9a8d76', '#747970'];

function part(position, size, color, rotation = [0, 0, 0]) {
  return { position, size, color, rotation };
}

// Each finish is one draw call. Per-instance colour keeps the windows and
// curtains varied without multiplying materials.
function InstancedBoxes({
  name,
  parts,
  color,
  roughness = 0.82,
  metalness = 0,
  shadows = false,
  envMapIntensity = 0.7,
  emissive = '#000000',
  emissiveIntensity = 0,
}) {
  const ref = useRef();
  const material = useMemo(
    () => new THREE.MeshStandardMaterial({
      color: '#ffffff', roughness, metalness, envMapIntensity, emissive, emissiveIntensity,
    }),
    [emissive, emissiveIntensity, envMapIntensity, metalness, roughness],
  );
  useEffect(() => () => material.dispose(), [material]);
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const dummy = new THREE.Object3D();
    const tint = new THREE.Color();
    parts.forEach((record, index) => {
      dummy.position.set(...record.position);
      dummy.rotation.set(...record.rotation);
      dummy.scale.set(...record.size);
      dummy.updateMatrix();
      mesh.setMatrixAt(index, dummy.matrix);
      mesh.setColorAt(index, tint.set(record.color ?? color));
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [color, parts]);

  if (!parts.length) return null;
  return (
    <instancedMesh
      ref={ref}
      name={name}
      args={[undefined, undefined, parts.length]}
      castShadow={shadows}
      receiveShadow={shadows}
      material={material}
    >
      <boxGeometry args={[1, 1, 1]} />
    </instancedMesh>
  );
}

function InstancedColumns({ columns }) {
  const ref = useRef();
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const dummy = new THREE.Object3D();
    columns.forEach((column, index) => {
      dummy.position.set(...column.position);
      dummy.scale.set(...column.size);
      dummy.updateMatrix();
      mesh.setMatrixAt(index, dummy.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [columns]);
  return (
    <instancedMesh ref={ref} name="paired-marble-court-columns" args={[undefined, undefined, columns.length]} castShadow receiveShadow>
      <cylinderGeometry args={[0.5, 0.58, 1, 12]} />
      <meshStandardMaterial color={MARBLE_LIGHT} roughness={0.88} />
    </instancedMesh>
  );
}

function InstancedShrubs({ shrubs }) {
  const ref = useRef();
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const dummy = new THREE.Object3D();
    const tint = new THREE.Color();
    shrubs.forEach((shrub, index) => {
      dummy.position.set(...shrub.position);
      dummy.rotation.set(...shrub.rotation);
      dummy.scale.set(...shrub.size);
      dummy.updateMatrix();
      mesh.setMatrixAt(index, dummy.matrix);
      mesh.setColorAt(index, tint.set(shrub.color));
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [shrubs]);
  if (!shrubs.length) return null;
  return (
    <instancedMesh ref={ref} name="clipped-boxwood-and-yew" args={[undefined, undefined, shrubs.length]} receiveShadow>
      <dodecahedronGeometry args={[0.5, 0]} />
      <meshStandardMaterial color="#ffffff" roughness={0.94} />
    </instancedMesh>
  );
}

function InstancedFinials({ finials }) {
  const ref = useRef();
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const dummy = new THREE.Object3D();
    finials.forEach((finial, index) => {
      dummy.position.set(...finial.position);
      dummy.scale.set(...finial.size);
      dummy.updateMatrix();
      mesh.setMatrixAt(index, dummy.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [finials]);
  if (!finials.length) return null;
  return (
    <instancedMesh ref={ref} name="wrought-iron-spear-finials" args={[undefined, undefined, finials.length]} castShadow>
      <coneGeometry args={[0.5, 1, 6]} />
      <meshStandardMaterial color={IRON} metalness={0.78} roughness={0.42} envMapIntensity={0.9} />
    </instancedMesh>
  );
}

function InstancedGateCrests({ crests }) {
  const ref = useRef();
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const dummy = new THREE.Object3D();
    crests.forEach((crest, index) => {
      dummy.position.set(...crest.position);
      dummy.rotation.set(...crest.rotation);
      dummy.scale.set(...crest.size);
      dummy.updateMatrix();
      mesh.setMatrixAt(index, dummy.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [crests]);
  if (!crests.length) return null;
  return (
    <instancedMesh ref={ref} name="arched-wrought-iron-gate-crests" args={[undefined, undefined, crests.length]} castShadow>
      <torusGeometry args={[1, 0.065, 5, 18, Math.PI]} />
      <meshStandardMaterial color={IRON} metalness={0.78} roughness={0.42} envMapIntensity={0.9} />
    </instancedMesh>
  );
}

function makeCopperTexture() {
  const size = 64;
  const albedo = new Uint8Array(size * size * 4);
  const roughness = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const index = (y * size + x) * 4;
      const broad = Math.sin(x * 0.23) * Math.cos(y * 0.17);
      const mottled = Math.sin((x + y) * 0.71) * 0.5 + Math.sin((x * 3 - y) * 0.19) * 0.5;
      const seam = x % 16 === 0 || y % 16 === 0 ? -18 : 0;
      albedo[index] = 67 + broad * 8 + mottled * 5 + seam;
      albedo[index + 1] = 121 + broad * 13 + mottled * 9 + seam;
      albedo[index + 2] = 106 + broad * 11 + mottled * 7 + seam;
      albedo[index + 3] = 255;
      const r = 132 + broad * 22 - mottled * 13 - seam;
      roughness[index] = r;
      roughness[index + 1] = r;
      roughness[index + 2] = r;
      roughness[index + 3] = 255;
    }
  }
  const map = new THREE.DataTexture(albedo, size, size, THREE.RGBAFormat);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = THREE.RepeatWrapping;
  map.wrapT = THREE.RepeatWrapping;
  map.repeat.set(3, 2);
  map.needsUpdate = true;
  const roughnessMap = new THREE.DataTexture(roughness, size, size, THREE.RGBAFormat);
  roughnessMap.wrapS = THREE.RepeatWrapping;
  roughnessMap.wrapT = THREE.RepeatWrapping;
  roughnessMap.repeat.set(3, 2);
  roughnessMap.needsUpdate = true;
  return { map, roughnessMap };
}

function OxidizedCopperRoofs({ roofs }) {
  const ref = useRef();
  const { geometry, material, map, roughnessMap } = useMemo(() => {
    const textures = makeCopperTexture();
    const roofGeometry = new THREE.ConeGeometry(1, 1, 4);
    roofGeometry.rotateY(Math.PI / 4);
    const roofMaterial = new THREE.MeshPhysicalMaterial({
      color: '#ffffff',
      map: textures.map,
      roughnessMap: textures.roughnessMap,
      metalness: 0.74,
      roughness: 0.42,
      clearcoat: 0.12,
      clearcoatRoughness: 0.48,
      envMapIntensity: 1.1,
    });
    return { geometry: roofGeometry, material: roofMaterial, ...textures };
  }, []);
  useEffect(() => () => {
    geometry.dispose();
    material.dispose();
    map.dispose();
    roughnessMap.dispose();
  }, [geometry, map, material, roughnessMap]);
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const dummy = new THREE.Object3D();
    const tint = new THREE.Color();
    roofs.forEach((roof, index) => {
      dummy.position.set(...roof.position);
      dummy.rotation.set(...roof.rotation);
      dummy.scale.set(roof.size[0] / Math.SQRT2, roof.size[1], roof.size[2] / Math.SQRT2);
      dummy.updateMatrix();
      mesh.setMatrixAt(index, dummy.matrix);
      mesh.setColorAt(index, tint.set(roof.color));
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [roofs]);
  if (!roofs.length) return null;
  return <instancedMesh ref={ref} name="mottled-oxidized-copper-roofs" args={[geometry, material, roofs.length]} castShadow receiveShadow />;
}

function MarbleShell({ centerX, width, height, depth }) {
  const limestoneSource = useLoader(THREE.TextureLoader, '/textures/facades/limestone.webp');
  const [baseMaterial, upperMaterial, surface] = useMemo(() => {
    const map = limestoneSource.clone();
    map.wrapS = THREE.RepeatWrapping;
    map.wrapT = THREE.RepeatWrapping;
    map.repeat.set(Math.max(4, Math.round(width / 3)), Math.max(4, Math.round(height / 3)));
    map.colorSpace = THREE.SRGBColorSpace;
    map.needsUpdate = true;
    const base = new THREE.MeshStandardMaterial({
      map, bumpMap: map, bumpScale: 0.014, color: '#e0ddd3', roughness: 0.91,
    });
    const upper = new THREE.MeshStandardMaterial({
      map, bumpMap: map, bumpScale: 0.012, color: '#f3efe5', roughness: 0.88,
    });
    return [base, upper, map];
  }, [height, limestoneSource, width]);
  useEffect(() => () => {
    baseMaterial.dispose();
    upperMaterial.dispose();
    surface.dispose();
  }, [baseMaterial, surface, upperMaterial]);

  const bottom = -height / 2;
  return (
    <group name="main-white-marble-clubhouse">
      <mesh position={[centerX, bottom + 2.15, 0]} castShadow receiveShadow material={baseMaterial}>
        <boxGeometry args={[width, 4.3, depth]} />
      </mesh>
      <mesh position={[centerX, bottom + 10.45, 0]} castShadow receiveShadow material={upperMaterial}>
        <boxGeometry args={[width, 12.3, depth]} />
      </mesh>
    </group>
  );
}

function CourtPaving({ position, size }) {
  const source = useLoader(THREE.TextureLoader, '/textures/paving_col.webp');
  const [material, map] = useMemo(() => {
    const paving = source.clone();
    paving.wrapS = THREE.RepeatWrapping;
    paving.wrapT = THREE.RepeatWrapping;
    paving.repeat.set(Math.max(2, size[0] / 2), Math.max(2, size[2] / 2));
    paving.colorSpace = THREE.SRGBColorSpace;
    paving.needsUpdate = true;
    return [new THREE.MeshStandardMaterial({ map: paving, color: '#a49d8f', roughness: 0.94 }), paving];
  }, [size, source]);
  useEffect(() => () => {
    material.dispose();
    map.dispose();
  }, [map, material]);
  return (
    <mesh name="entrance-court-paving" position={position} receiveShadow material={material}>
      <boxGeometry args={size} />
    </mesh>
  );
}

function createClubParts(siteWidth, height, siteDepth) {
  const stone = [];
  const sash = [];
  const glass = [];
  const rooms = [];
  const copper = [];
  const copperRoofs = [];
  const awnings = [];
  const iron = [];
  const hedges = [];
  const shrubs = [];
  const columns = [];
  const finials = [];
  const gateCrests = [];
  const bottom = -height / 2;

  // The documented lot is roughly twice as long on 60th Street as on Fifth.
  // The game compresses that to 25x14m: the original main block fills the
  // west side and the open carriage court occupies the east end.
  const mainWidth = siteWidth * 0.69;
  const mainDepth = siteDepth * 0.84;
  const fifthSetback = 1.7;
  const mainCenterX = -siteWidth / 2 + fifthSetback + mainWidth / 2;
  const mainRight = mainCenterX + mainWidth / 2;
  const mainWest = mainCenterX - mainWidth / 2;
  const south = mainDepth / 2;
  const north = -mainDepth / 2;

  const facadePart = (face, along, y, span, tall, outset, thick, color, rotation) => {
    if (face === '-x') return part([mainWest - outset, y, along], [thick, tall, span], color, rotation);
    if (face === '+x') return part([mainRight + outset, y, along], [thick, tall, span], color, rotation);
    if (face === '+z') return part([mainCenterX + along, y, south + outset], [span, tall, thick], color, rotation);
    return part([mainCenterX + along, y, north - outset], [span, tall, thick], color, rotation);
  };

  const addWindow = (face, along, y, w, h, index, { hood = false, attic = false, awning = false } = {}) => {
    const frame = attic ? 0.075 : 0.1;
    const paneH = h / 2 - frame * 1.3;
    glass.push(facadePart(face, along, y + h * 0.245, w - frame * 2.2, paneH, 0.075, 0.05, GLASS[index % GLASS.length]));
    rooms.push(facadePart(face, along, y - h * 0.245, w - frame * 2.2, paneH, 0.078, 0.045, ROOMS[(index * 3 + 1) % ROOMS.length]));
    sash.push(facadePart(face, along - w / 2, y, frame, h, 0.115, 0.12, SASH));
    sash.push(facadePart(face, along + w / 2, y, frame, h, 0.115, 0.12, SASH));
    sash.push(facadePart(face, along, y + h / 2, w + frame, frame, 0.115, 0.12, SASH));
    sash.push(facadePart(face, along, y - h / 2, w + frame * 1.5, frame, 0.13, 0.15, SASH));
    sash.push(facadePart(face, along, y, w, frame * 1.2, 0.122, 0.13, SASH));
    if (!attic && index % 3 !== 1) {
      rooms.push(facadePart(face, along - w * 0.34, y - h * 0.12, 0.09, h * 0.67, 0.125, 0.035, index % 2 ? '#c9c1ad' : '#aaa994'));
    }
    if (hood) {
      stone.push(facadePart(face, along, y + h / 2 + 0.2, w + 0.46, 0.17, 0.18, 0.3, MARBLE_LIGHT));
      stone.push(facadePart(face, along, y + h / 2 + 0.33, w + 0.66, 0.08, 0.25, 0.4, MARBLE_LIGHT));
      stone.push(facadePart(face, along - w * 0.42, y + h / 2 + 0.07, 0.12, 0.34, 0.2, 0.24, MARBLE_SHADOW));
      stone.push(facadePart(face, along + w * 0.42, y + h / 2 + 0.07, 0.12, 0.34, 0.2, 0.24, MARBLE_SHADOW));
    }
    if (awning && !attic) {
      const projection = 0.82;
      const angle = face === '-x' ? 0.58 : -0.58;
      const pos = face === '-x'
        ? [mainWest - projection * 0.48, y + h * 0.29, along]
        : [mainCenterX + along, y + h * 0.29, south + projection * 0.48];
      const size = face === '-x' ? [projection, 0.06, w * 0.94] : [w * 0.94, 0.06, projection];
      const rotation = face === '-x' ? [0, 0, angle] : [angle, 0, 0];
      const canvas = index % 2 ? '#7c8b73' : '#e7e0c9';
      awnings.push(part(pos, size, canvas, rotation));
      // A short valance makes the street edge legible and fixes the previous
      // floating-board appearance.
      awnings.push(part(
        face === '-x'
          ? [mainWest - projection * 0.88, y + h * 0.05, along]
          : [mainCenterX + along, y + h * 0.05, south + projection * 0.88],
        face === '-x' ? [0.055, 0.28, w * 0.94] : [w * 0.94, 0.28, 0.055],
        canvas,
      ));
    }
  };

  const westZs = Array.from({ length: 5 }, (_, i) => -mainDepth * 0.37 + i * mainDepth * 0.185);
  const southXs = Array.from({ length: 7 }, (_, i) => -mainWidth * 0.39 + i * mainWidth * 0.13);
  const levels = {
    ground: bottom + 2.05,
    principal: bottom + 6.15,
    upper: bottom + 10.05,
    attic: bottom + 13.65,
  };

  westZs.forEach((z, i) => {
    // Only the Fifth Avenue/park elevation retains the documented first-floor
    // canvas shades. Upper storeys and the 60th Street facade stay uncovered.
    addWindow('-x', z, levels.ground, 1.08, 2.62, i, { awning: true });
    addWindow('-x', z, levels.principal, 1.2, 2.88, i + 5, { hood: true });
    addWindow('-x', z, levels.upper, 1.12, 2.48, i + 10, { hood: true });
    addWindow('-x', z, levels.attic, 0.84, 0.96, i + 15, { attic: true });
  });
  southXs.forEach((x, i) => {
    addWindow('+z', x, levels.ground, 0.9, 2.55, i + 20);
    addWindow('+z', x, levels.principal, 1.02, 2.84, i + 27, { hood: true });
    addWindow('+z', x, levels.upper, 0.96, 2.42, i + 34, { hood: true });
    addWindow('+z', x, levels.attic, 0.72, 0.94, i + 41, { attic: true });
  });
  // North service side and court-facing east wall remain restrained but not blank.
  southXs.slice(1, 6).forEach((x, i) => {
    addWindow('-z', x, levels.principal, 0.9, 2.55, i + 48);
    addWindow('-z', x, levels.upper, 0.86, 2.2, i + 53);
  });
  westZs.forEach((z, i) => {
    if (i !== 2) addWindow('+x', z, levels.principal, 0.94, 2.6, i + 58, { hood: true });
    addWindow('+x', z, levels.upper, 0.88, 2.25, i + 63, { hood: true });
  });

  for (let row = 0; row < 6; row += 1) {
    const y = bottom + 0.45 + row * 0.68;
    stone.push(facadePart('-x', 0, y, mainDepth + 0.05, 0.055, 0.06, 0.13, '#aaa9a1'));
    stone.push(facadePart('+z', 0, y, mainWidth + 0.05, 0.055, 0.06, 0.13, '#aaa9a1'));
  }
  for (const y of [bottom + 4.35, bottom + 8.25, bottom + 12.05]) {
    stone.push(facadePart('-x', 0, y, mainDepth + 0.38, 0.23, 0.14, 0.32, MARBLE_LIGHT));
    stone.push(facadePart('+z', 0, y, mainWidth + 0.38, 0.23, 0.14, 0.32, MARBLE_LIGHT));
  }

  for (let row = 0; row < 21; row += 1) {
    const y = bottom + 0.42 + row * 0.66;
    const long = row % 2 === 0 ? 0.8 : 0.6;
    for (const z of [north, south]) {
      stone.push(part([mainWest - 0.09, y, z], [0.2, 0.5, long], MARBLE_LIGHT));
      stone.push(part([mainRight + 0.09, y, z], [0.2, 0.5, long], MARBLE_LIGHT));
    }
    for (const x of [mainWest, mainRight]) {
      stone.push(part([x, y, south + 0.09], [long, 0.5, 0.2], MARBLE_LIGHT));
      stone.push(part([x, y, north - 0.09], [long, 0.5, 0.2], MARBLE_LIGHT));
    }
  }

  const balconyY = levels.principal - 1.72;
  stone.push(part([mainWest - 0.66, balconyY, 0], [1.32, 0.22, mainDepth * 0.58], MARBLE_LIGHT));
  stone.push(part([mainCenterX, balconyY, south + 0.58], [mainWidth * 0.43, 0.22, 1.16], MARBLE_LIGHT));
  for (let i = 0; i < 17; i += 1) {
    const z = -mainDepth * 0.27 + i * mainDepth * 0.54 / 16;
    stone.push(part([mainWest - 1.13, balconyY + 0.65, z], [0.11, 0.68, 0.11], MARBLE_LIGHT));
  }
  for (let i = 0; i < 13; i += 1) {
    const x = mainCenterX - mainWidth * 0.19 + i * mainWidth * 0.38 / 12;
    stone.push(part([x, balconyY + 0.65, south + 1.03], [0.11, 0.68, 0.11], MARBLE_LIGHT));
  }
  stone.push(part([mainWest - 1.13, balconyY + 1.02, 0], [0.18, 0.18, mainDepth * 0.58], MARBLE_LIGHT));
  stone.push(part([mainCenterX, balconyY + 1.02, south + 1.03], [mainWidth * 0.43, 0.18, 0.18], MARBLE_LIGHT));

  const corniceY = bottom + 15.45;
  stone.push(part([mainCenterX, corniceY, 0], [mainWidth + 0.55, 0.5, mainDepth + 0.55], MARBLE_LIGHT));
  stone.push(part([mainCenterX, corniceY + 0.38, 0], [mainWidth + 1.15, 0.28, mainDepth + 1.15], MARBLE_LIGHT));
  stone.push(part([mainCenterX, corniceY + 0.72, 0], [mainWidth + 1.8, 0.42, mainDepth + 1.8], MARBLE_LIGHT));
  for (let i = 0; i < 17; i += 1) {
    const x = mainCenterX - mainWidth * 0.46 + i * mainWidth * 0.92 / 16;
    stone.push(part([x, corniceY + 0.05, south + 0.72], [0.27, 0.34, 0.88], MARBLE_SHADOW));
    stone.push(part([x, corniceY + 0.05, north - 0.72], [0.27, 0.34, 0.88], MARBLE_SHADOW));
  }
  for (let i = 0; i < 12; i += 1) {
    const z = -mainDepth * 0.45 + i * mainDepth * 0.9 / 11;
    stone.push(part([mainWest - 0.72, corniceY + 0.05, z], [0.88, 0.34, 0.27], MARBLE_SHADOW));
    stone.push(part([mainRight + 0.72, corniceY + 0.05, z], [0.88, 0.34, 0.27], MARBLE_SHADOW));
  }
  // The copper crown is one of the building's strongest reads and must stay
  // visible from the sidewalk: a taller hip overhanging the cornice, seamed
  // slopes, eave cresting, and chimneys, per the HABS views.
  const gutterY = corniceY + 0.96;
  const roofRise = 2.15;
  const roofW = mainWidth + 2.6;
  const roofD = mainDepth + 2.6;
  const roofBaseY = gutterY + 0.085;
  copper.push(part([mainCenterX, gutterY, 0], [roofW + 0.1, 0.17, roofD + 0.1], COPPER_DARK));
  copperRoofs.push(part([mainCenterX, roofBaseY + roofRise / 2, 0], [roofW, roofRise, roofD], '#578273'));
  // Standing seams on the two street-facing slopes.
  const westAngle = Math.atan2(roofRise, roofW / 2);
  for (let i = 0; i < 9; i += 1) {
    const z = -roofD * 0.42 + i * roofD * 0.84 / 8;
    const frac = 1 - Math.abs(z) / (roofD / 2);
    const len = Math.hypot(roofW / 2, roofRise) * frac * 0.9;
    copper.push(part(
      [mainCenterX - roofW / 2 + Math.cos(westAngle) * len / 2, roofBaseY + Math.sin(westAngle) * len / 2, z],
      [len, 0.055, 0.07],
      '#4a7568',
      [0, 0, westAngle],
    ));
  }
  const southAngle = Math.atan2(roofRise, roofD / 2);
  for (let i = 0; i < 11; i += 1) {
    const x = mainCenterX - roofW * 0.42 + i * roofW * 0.84 / 10;
    const frac = 1 - Math.abs(x - mainCenterX) / (roofW / 2);
    const len = Math.hypot(roofD / 2, roofRise) * frac * 0.9;
    copper.push(part(
      [x, roofBaseY + Math.sin(southAngle) * len / 2, roofD / 2 - Math.cos(southAngle) * len / 2],
      [0.07, 0.055, len],
      '#4a7568',
      [southAngle, 0, 0],
    ));
  }
  // Cresting diamonds along the west and south eaves, corner acroteria, and
  // an apex finial stand in for the documented copper cheneau.
  for (let i = 0; i < 15; i += 1) {
    const z = -roofD * 0.45 + i * roofD * 0.9 / 14;
    copper.push(part([mainCenterX - roofW / 2 - 0.12, gutterY + 0.32, z], [0.13, 0.3, 0.3], COPPER_WARM, [Math.PI / 4, 0, 0]));
  }
  for (let i = 0; i < 19; i += 1) {
    const x = mainCenterX - roofW * 0.45 + i * roofW * 0.9 / 18;
    copper.push(part([x, gutterY + 0.32, roofD / 2 + 0.12], [0.3, 0.3, 0.13], COPPER_WARM, [0, 0, Math.PI / 4]));
  }
  for (const [cx, cz] of [[-1, -1], [-1, 1], [1, -1], [1, 1]]) {
    copper.push(part(
      [mainCenterX + cx * roofW / 2, gutterY + 0.42, cz * roofD / 2],
      [0.34, 0.62, 0.34],
      COPPER_DARK,
      [0, Math.PI / 4, 0],
    ));
  }
  copper.push(part([mainCenterX, roofBaseY + roofRise + 0.22, 0], [0.4, 0.62, 0.4], COPPER_WARM, [0, Math.PI / 4, 0]));
  // Marble chimney stacks near the 61st Street side.
  for (const [cx, cz] of [[mainCenterX - mainWidth * 0.18, north + 1.15], [mainCenterX + mainWidth * 0.26, north + 1.45]]) {
    stone.push(part([cx, corniceY + 1.85, cz], [1.0, 2.9, 0.85], MARBLE));
    stone.push(part([cx, corniceY + 3.42, cz], [1.2, 0.28, 1.05], MARBLE_SHADOW));
  }

  // A restrained rosette-and-dentil frieze distinguishes the Italian
  // Renaissance cornice at normal walking distance without unique meshes.
  for (let i = 0; i < 17; i += 1) {
    const x = mainCenterX - mainWidth * 0.46 + i * mainWidth * 0.92 / 16;
    stone.push(part([x, corniceY - 0.45, south + 0.34], [0.34, 0.34, 0.16], MARBLE_SHADOW, [0, 0, Math.PI / 4]));
    stone.push(part([x, corniceY - 0.45, north - 0.34], [0.34, 0.34, 0.16], MARBLE_SHADOW, [0, 0, Math.PI / 4]));
  }
  for (let i = 0; i < 12; i += 1) {
    const z = -mainDepth * 0.45 + i * mainDepth * 0.9 / 11;
    stone.push(part([mainWest - 0.34, corniceY - 0.45, z], [0.16, 0.34, 0.34], MARBLE_SHADOW, [Math.PI / 4, 0, 0]));
  }

  // Fifth Avenue's original lawn/hedge stood behind a low marble plinth. The
  // facade remains visible above it while the lot reads as a private club.
  const forecourtWest = -siteWidth / 2 + 0.55;
  const forecourtLength = mainDepth - 1.15;
  stone.push(part([forecourtWest, bottom + 0.25, 0], [0.55, 0.5, forecourtLength], MARBLE_LIGHT));
  stone.push(part([forecourtWest - 0.05, bottom + 0.53, 0], [0.68, 0.08, forecourtLength + 0.15], MARBLE_SHADOW));
  for (let i = 0; i < 17; i += 1) {
    const z = -forecourtLength * 0.47 + i * forecourtLength * 0.94 / 16;
    iron.push(part([forecourtWest - 0.06, bottom + 1.18, z], [0.05, 1.25, 0.05], IRON));
    finials.push(part([forecourtWest - 0.06, bottom + 1.92, z], [0.12, 0.27, 0.12], IRON));
  }
  iron.push(part([forecourtWest - 0.06, bottom + 0.76, 0], [0.07, 0.07, forecourtLength], IRON));
  iron.push(part([forecourtWest - 0.06, bottom + 1.55, 0], [0.07, 0.07, forecourtLength], IRON));
  // Low clipped yew is broken into lobes so it reads as planting rather than
  // one green rectangular wall.
  for (let i = 0; i < 13; i += 1) {
    const z = -forecourtLength * 0.46 + i * forecourtLength * 0.92 / 12;
    shrubs.push(part(
      [forecourtWest + 0.27 + Math.sin(i * 2.1) * 0.05, bottom + 0.82, z],
      [0.72 + (i % 3) * 0.06, 0.92 + (i % 2) * 0.13, 0.96],
      i % 3 === 0 ? '#45653b' : HEDGE,
      [0, i * 0.73, 0],
    ));
  }
  for (const z of [-forecourtLength / 2 - 0.05, forecourtLength / 2 + 0.05]) {
    stone.push(part([forecourtWest, bottom + 0.86, z], [0.9, 1.72, 0.9], MARBLE_LIGHT));
    stone.push(part([forecourtWest, bottom + 1.78, z], [1.12, 0.18, 1.12], MARBLE_LIGHT));
    stone.push(part([forecourtWest, bottom + 2.05, z], [0.54, 0.54, 0.54], MARBLE_LIGHT, [0, Math.PI / 4, 0]));
  }

  // The court is east of the original building. A low two-storey rear wing
  // closes its north/east edge, while the monumental paired-column screen
  // faces 60th Street at the south. Geometry is intentionally coarse and batched.
  const courtLeft = mainRight + 0.55;
  const courtRight = siteWidth / 2 - 0.35;
  const courtCenterX = (courtLeft + courtRight) / 2;
  const courtWidth = courtRight - courtLeft;
  const wingY = bottom + 3.15;
  stone.push(part([courtRight - 1.25, wingY, north + 0.05], [2.5, 6.3, 5.1], MARBLE));
  stone.push(part([courtCenterX + 0.5, wingY, north + 1.05], [courtWidth - 1.0, 6.3, 2.4], MARBLE));
  copperRoofs.push(part([courtRight - 1.25, bottom + 6.68, north + 0.05], [3.0, 0.52, 5.6], '#4d8376'));
  copperRoofs.push(part([courtCenterX + 0.5, bottom + 6.68, north + 1.05], [courtWidth - 0.5, 0.52, 2.9], '#638f7e'));

  // Main door on the west wall of the court, as documented.
  rooms.push(facadePart('+x', 1.45, bottom + 2.05, 1.55, 3.45, 0.13, 0.08, '#352d25'));
  stone.push(facadePart('+x', 1.45, bottom + 4.0, 2.35, 0.25, 0.5, 1.0, MARBLE_LIGHT));
  stone.push(facadePart('+x', 0.48, bottom + 2.25, 0.32, 3.7, 0.34, 0.48, MARBLE_LIGHT));
  stone.push(facadePart('+x', 2.42, bottom + 2.25, 0.32, 3.7, 0.34, 0.48, MARBLE_LIGHT));

  const screenZ = south + 0.2;
  const columnCenterY = bottom + 2.2;
  const screenY = bottom + 4.38;
  stone.push(part([courtCenterX, screenY, screenZ], [courtWidth + 0.7, 0.45, 0.8], MARBLE_LIGHT));
  stone.push(part([courtCenterX, screenY + 0.35, screenZ], [courtWidth + 1.0, 0.25, 1.0], MARBLE_LIGHT));
  stone.push(part([courtCenterX, screenY + 0.56, screenZ], [courtWidth + 1.25, 0.12, 1.13], MARBLE_SHADOW));
  for (const x of [courtLeft - 0.05, courtRight + 0.05]) {
    stone.push(part([x, bottom + 2.25, screenZ], [0.88, 4.5, 0.88], MARBLE_LIGHT));
    stone.push(part([x, screenY + 0.4, screenZ], [1.12, 0.25, 1.12], MARBLE_LIGHT));
  }
  const pairCenters = [courtCenterX - courtWidth * 0.27, courtCenterX + courtWidth * 0.27];
  pairCenters.forEach((x) => {
    for (const dx of [-0.25, 0.25]) {
      columns.push({ position: [x + dx, columnCenterY, screenZ], size: [0.48, 3.95, 0.48] });
      stone.push(part([x + dx, bottom + 0.2, screenZ], [0.72, 0.24, 0.72], MARBLE_LIGHT));
      stone.push(part([x + dx, screenY - 0.3, screenZ], [0.72, 0.25, 0.72], MARBLE_LIGHT));
    }
    // In 1896 each pair still had a third column projecting toward the street;
    // those front columns were removed when 60th Street was widened in 1922.
    columns.push({ position: [x, columnCenterY, screenZ + 0.48], size: [0.48, 3.95, 0.48] });
    stone.push(part([x, bottom + 0.2, screenZ + 0.48], [0.72, 0.24, 0.72], MARBLE_LIGHT));
    stone.push(part([x, screenY - 0.3, screenZ + 0.48], [0.72, 0.25, 0.72], MARBLE_LIGHT));
  });
  // Three iron gate fields: central carriage passage and pedestrian leaves.
  const gateRanges = [
    [courtLeft + 0.4, pairCenters[0] - 0.52],
    [pairCenters[0] + 0.52, pairCenters[1] - 0.52],
    [pairCenters[1] + 0.52, courtRight - 0.4],
  ];
  gateRanges.forEach(([from, to], gate) => {
    const count = gate === 1 ? 11 : 6;
    for (let i = 0; i < count; i += 1) {
      const x = from + (to - from) * (i + 0.5) / count;
      iron.push(part([x, bottom + 1.95, screenZ + 0.03], [0.055, 3.5, 0.055], IRON));
      finials.push(part([x, bottom + 3.88, screenZ + 0.03], [0.13, 0.28, 0.13], IRON));
    }
    iron.push(part([(from + to) / 2, bottom + 0.2, screenZ + 0.03], [to - from, 0.08, 0.07], IRON));
    iron.push(part([(from + to) / 2, bottom + 1.75, screenZ + 0.03], [to - from, 0.07, 0.07], IRON));
    iron.push(part([(from + to) / 2, bottom + 3.7, screenZ + 0.03], [to - from, 0.08, 0.07], IRON));
    const crestWidth = Math.max(0.65, (to - from) * 0.32);
    gateCrests.push(part([(from + to) / 2, bottom + 3.27, screenZ + 0.06], [crestWidth, crestWidth * 0.46, 1], IRON));
    // Diamond scrollwork provides the characteristic filigree without a
    // bespoke high-polygon gate asset.
    for (let i = 0; i < (gate === 1 ? 5 : 2); i += 1) {
      const x = from + (to - from) * (i + 1) / ((gate === 1 ? 5 : 2) + 1);
      iron.push(part([x, bottom + 2.72, screenZ + 0.055], [0.045, 0.72, 0.045], '#36403b', [0, 0, Math.PI / 4]));
      iron.push(part([x, bottom + 2.72, screenZ + 0.055], [0.045, 0.72, 0.045], '#36403b', [0, 0, -Math.PI / 4]));
    }
  });
  // Layered clipped boxwood marks the court edges while keeping the central
  // carriage passage visibly open.
  for (const x of [courtLeft + 0.42, courtRight - 0.42]) {
    for (let i = 0; i < 5; i += 1) {
      shrubs.push(part([x, bottom + 0.62, -2.55 + i * 0.9], [0.74, 0.88, 0.88], i % 2 ? '#3d6137' : HEDGE, [0, i * 0.6, 0]));
    }
  }
  for (let i = 0; i < 6; i += 1) {
    const x = courtLeft + 0.9 + i * Math.max(0.45, (courtWidth - 1.8) / 5);
    shrubs.push(part([x, bottom + 0.58, north + 2.35], [0.85, 0.8, 0.8], i % 2 ? '#45683e' : HEDGE, [0, i, 0]));
  }

  return {
    stone, sash, glass, rooms, copper, copperRoofs, awnings, iron, hedges,
    shrubs, columns, finials, gateCrests,
    main: { centerX: mainCenterX, width: mainWidth, depth: mainDepth },
    court: {
      position: [courtCenterX, bottom + 0.04, 0.2],
      size: [courtWidth - 0.3, 0.08, mainDepth - 1.15],
    },
  };
}

export default function MetropolitanClub({ item }) {
  const [siteWidth, height, siteDepth] = item.size;
  const batches = useMemo(
    () => createClubParts(siteWidth, height, siteDepth),
    [height, siteDepth, siteWidth],
  );
  const identify = (event) => {
    if ((event.delta ?? 0) > 5) return;
    event.stopPropagation();
    notice(item.landmarkLabel, { key: 'building-identification', seconds: 4, detail: 'Landmark' });
  };

  return (
    <group
      name="Metropolitan Club — 1894 clubhouse and court"
      position={item.position}
      rotation={[0, item.yaw ?? 0, 0]}
      onClick={identify}
      userData={{ sculptRuntime: { clickable: true, explodable: true } }}
    >
      <MarbleShell centerX={batches.main.centerX} width={batches.main.width} height={height} depth={batches.main.depth} />
      <CourtPaving position={batches.court.position} size={batches.court.size} />
      <InstancedBoxes name="marble-massing-and-ornament" parts={batches.stone} color={MARBLE_LIGHT} shadows />
      <InstancedBoxes name="wooden-sash" parts={batches.sash} color={SASH} roughness={0.74} />
      <InstancedBoxes name="reflected-window-glass" parts={batches.glass} color={GLASS[0]} roughness={0.32} metalness={0.04} envMapIntensity={0.95} />
      <InstancedBoxes name="curtains-and-room-depth" parts={batches.rooms} color={ROOMS[0]} roughness={0.92} emissive="#312b21" emissiveIntensity={0.055} />
      <InstancedBoxes name="oxidized-copper-trim" parts={batches.copper} color={COPPER} roughness={0.46} metalness={0.68} envMapIntensity={1.05} />
      <OxidizedCopperRoofs roofs={batches.copperRoofs} />
      <InstancedBoxes name="canvas-window-awnings" parts={batches.awnings} color="#7c8874" roughness={0.96} />
      <InstancedBoxes name="entrance-court-ironwork" parts={batches.iron} color={IRON} roughness={0.44} metalness={0.78} envMapIntensity={0.95} />
      <InstancedFinials finials={batches.finials} />
      <InstancedGateCrests crests={batches.gateCrests} />
      <InstancedBoxes name="clipped-evergreen-hedges" parts={batches.hedges} color={HEDGE} roughness={1} />
      <InstancedShrubs shrubs={batches.shrubs} />
      <InstancedColumns columns={batches.columns} />
    </group>
  );
}
