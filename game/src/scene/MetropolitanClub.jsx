import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useLoader } from '@react-three/fiber';
import { notice } from '../world/notices.js';

const MARBLE = '#dedbd0';
const MARBLE_LIGHT = '#f1ede2';
const MARBLE_SHADOW = '#b9b8af';
const SASH = '#34352f';
const IRON = '#29302e';
const COPPER = '#4f8175';
const HEDGE = '#334c2d';
const GLASS = ['#52636a', '#65716e', '#596a6a', '#6b7068'];
const ROOMS = ['#817965', '#6f7168', '#8a816f', '#686d68'];

function part(position, size, color, rotation = [0, 0, 0]) {
  return { position, size, color, rotation };
}

// Each finish is one draw call. Per-instance colour keeps the windows and
// curtains varied without multiplying materials.
function InstancedBoxes({ name, parts, color, roughness = 0.82, metalness = 0, shadows = false }) {
  const ref = useRef();
  const material = useMemo(
    () => new THREE.MeshStandardMaterial({ color: '#ffffff', roughness, metalness }),
    [metalness, roughness],
  );
  useEffect(() => () => material.dispose(), [material]);
  useLayoutEffect(() => {
    const dummy = new THREE.Object3D();
    const tint = new THREE.Color();
    parts.forEach((record, index) => {
      dummy.position.set(...record.position);
      dummy.rotation.set(...record.rotation);
      dummy.scale.set(...record.size);
      dummy.updateMatrix();
      ref.current.setMatrixAt(index, dummy.matrix);
      ref.current.setColorAt(index, tint.set(record.color ?? color));
    });
    ref.current.instanceMatrix.needsUpdate = true;
    if (ref.current.instanceColor) ref.current.instanceColor.needsUpdate = true;
    ref.current.computeBoundingSphere();
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
    const dummy = new THREE.Object3D();
    columns.forEach((column, index) => {
      dummy.position.set(...column.position);
      dummy.scale.set(...column.size);
      dummy.updateMatrix();
      ref.current.setMatrixAt(index, dummy.matrix);
    });
    ref.current.instanceMatrix.needsUpdate = true;
    ref.current.computeBoundingSphere();
  }, [columns]);
  return (
    <instancedMesh ref={ref} name="paired-marble-court-columns" args={[undefined, undefined, columns.length]} castShadow receiveShadow>
      <cylinderGeometry args={[0.5, 0.58, 1, 12]} />
      <meshStandardMaterial color={MARBLE_LIGHT} roughness={0.88} />
    </instancedMesh>
  );
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
  const awnings = [];
  const iron = [];
  const hedges = [];
  const columns = [];
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
      const angle = face === '-x' ? -0.64 : 0.64;
      const pos = face === '-x'
        ? [mainWest - 0.48, y + h * 0.06, along]
        : [mainCenterX + along, y + h * 0.06, south + 0.48];
      const size = face === '-x' ? [projection, 0.06, w * 0.94] : [w * 0.94, 0.06, projection];
      const rotation = face === '-x' ? [0, 0, angle] : [angle, 0, 0];
      awnings.push(part(pos, size, index % 2 ? '#73836d' : '#e5dfca', rotation));
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
    addWindow('-x', z, levels.ground, 1.08, 2.62, i, { awning: true });
    addWindow('-x', z, levels.principal, 1.2, 2.88, i + 5, { hood: true, awning: i !== 2 });
    addWindow('-x', z, levels.upper, 1.12, 2.48, i + 10, { hood: true, awning: i % 2 === 0 });
    addWindow('-x', z, levels.attic, 0.84, 0.96, i + 15, { attic: true });
  });
  southXs.forEach((x, i) => {
    addWindow('+z', x, levels.ground, 0.9, 2.55, i + 20, { awning: true });
    addWindow('+z', x, levels.principal, 1.02, 2.84, i + 27, { hood: true, awning: i % 2 === 0 });
    addWindow('+z', x, levels.upper, 0.96, 2.42, i + 34, { hood: true, awning: i === 1 || i === 5 });
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
  copper.push(part([mainCenterX, corniceY + 1.0, 0], [mainWidth + 2.05, 0.16, mainDepth + 2.05], COPPER));
  copper.push(part([mainCenterX, corniceY + 1.16, 0], [mainWidth + 1.55, 0.18, mainDepth + 1.55], '#477a71'));

  // Fifth Avenue's original lawn/hedge stood behind a low marble plinth. The
  // facade remains visible above it while the lot reads as a private club.
  const forecourtWest = -siteWidth / 2 + 0.55;
  const forecourtLength = mainDepth - 1.15;
  stone.push(part([forecourtWest, bottom + 0.25, 0], [0.55, 0.5, forecourtLength], MARBLE_LIGHT));
  stone.push(part([forecourtWest - 0.05, bottom + 0.53, 0], [0.68, 0.08, forecourtLength + 0.15], MARBLE_SHADOW));
  hedges.push(part([forecourtWest + 0.26, bottom + 0.75, 0], [0.72, 0.82, forecourtLength - 0.4], HEDGE));
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
  copper.push(part([courtRight - 1.25, bottom + 6.42, north + 0.05], [2.85, 0.18, 5.45], COPPER));
  copper.push(part([courtCenterX + 0.5, bottom + 6.42, north + 1.05], [courtWidth - 0.65, 0.18, 2.75], COPPER));

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
    const count = gate === 1 ? 7 : 3;
    for (let i = 0; i < count; i += 1) {
      const x = from + (to - from) * (i + 0.5) / count;
      iron.push(part([x, bottom + 1.95, screenZ + 0.03], [0.055, 3.5, 0.055], IRON));
    }
    iron.push(part([(from + to) / 2, bottom + 0.2, screenZ + 0.03], [to - from, 0.08, 0.07], IRON));
    iron.push(part([(from + to) / 2, bottom + 3.7, screenZ + 0.03], [to - from, 0.08, 0.07], IRON));
  });
  // Clipped hedges define the circular carriage approach cheaply.
  hedges.push(part([courtLeft + 0.45, bottom + 0.45, -0.8], [0.62, 0.8, 4.1], HEDGE));
  hedges.push(part([courtRight - 0.45, bottom + 0.45, -0.8], [0.62, 0.8, 4.1], HEDGE));
  hedges.push(part([courtCenterX, bottom + 0.45, north + 2.35], [courtWidth - 1.5, 0.8, 0.62], HEDGE));

  return {
    stone, sash, glass, rooms, copper, awnings, iron, hedges, columns,
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
      <InstancedBoxes name="reflected-window-glass" parts={batches.glass} color={GLASS[0]} roughness={0.38} />
      <InstancedBoxes name="curtains-and-room-depth" parts={batches.rooms} color={ROOMS[0]} roughness={0.92} />
      <InstancedBoxes name="oxidized-copper-and-awnings" parts={batches.copper} color={COPPER} roughness={0.54} metalness={0.55} />
      <InstancedBoxes name="canvas-window-awnings" parts={batches.awnings} color="#7c8874" roughness={0.96} />
      <InstancedBoxes name="entrance-court-ironwork" parts={batches.iron} color={IRON} roughness={0.52} metalness={0.72} />
      <InstancedBoxes name="clipped-evergreen-hedges" parts={batches.hedges} color={HEDGE} roughness={1} />
      <InstancedColumns columns={batches.columns} />
    </group>
  );
}
