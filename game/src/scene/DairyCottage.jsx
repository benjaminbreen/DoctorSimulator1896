import { useMemo } from 'react';
import * as THREE from 'three';
import { useLoader } from '@react-three/fiber';
import { buildDairy, DAIRY } from '../world/dairy.js';
import { identifyLandmark } from '../world/landmarkInformation.js';
import { PARK_LANDMARKS } from '../world/parkLandmarks.js';
import { instanced } from './lib/instances.js';
import StaticColliders from './lib/StaticColliders.jsx';

const SLATE_TEXTURE_METRES_X = 7.8;
const SLATE_TEXTURE_METRES_Y = 3.6;
const MASONRY_TEXTURE_METRES = 2.8;

// Vaux's Dairy from world/dairy.js: instanced stone, painted trim, dark
// recesses, and plank work, under one slate roof. The stone half's walk
// collider lives in centralPark.js; the loggia's colliders come from the
// build. About seven draw calls.

let masonryMapsCache = null;

function seededRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function traceStone(context, points) {
  context.beginPath();
  context.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length; i += 1) context.lineTo(points[i][0], points[i][1]);
  context.closePath();
}

// The old source was a close-up of bare rock. This small generated map keeps
// the roughness while giving the Dairy readable stone courses and mortar.
function dairyMasonryMaps() {
  if (masonryMapsCache) return masonryMapsCache;

  const size = 512;
  const colorCanvas = document.createElement('canvas');
  const bumpCanvas = document.createElement('canvas');
  colorCanvas.width = colorCanvas.height = size;
  bumpCanvas.width = bumpCanvas.height = size;
  const colorContext = colorCanvas.getContext('2d');
  const bumpContext = bumpCanvas.getContext('2d');
  const random = seededRandom(1896);

  colorContext.fillStyle = '#aaa597';
  colorContext.fillRect(0, 0, size, size);
  bumpContext.fillStyle = '#303030';
  bumpContext.fillRect(0, 0, size, size);

  const courses = 7;
  const courseHeight = size / courses;
  for (let row = 0; row < courses; row += 1) {
    const y0 = row * courseHeight + 3;
    const y1 = (row + 1) * courseHeight - 3;
    const edgeWidth = 52 + random() * 42;
    let x = edgeWidth / 2 + 3;
    const rowEnd = size - edgeWidth / 2 - 3;
    const stones = [];

    while (x < rowEnd - 35) {
      const remaining = rowEnd - x;
      const width = remaining < 100 ? remaining : Math.min(72 + random() * 72, remaining);
      stones.push({ x0: x, x1: x + width });
      x += width + 5;
    }
    stones.push({ x0: -edgeWidth / 2, x1: edgeWidth / 2, wraps: true });

    for (const stone of stones) {
      const shade = 74 + Math.floor(random() * 38);
      const warm = Math.floor(random() * 10);
      const points = [
        [stone.x0 + random() * 2, y0 + random() * 3],
        [stone.x1 - random() * 2, y0 + random() * 3],
        [stone.x1 - random() * 2, y1 - random() * 3],
        [stone.x0 + random() * 2, y1 - random() * 3],
      ];
      const copies = stone.wraps ? [0, size] : [0];

      for (const shift of copies) {
        const shifted = points.map(([px, py]) => [px + shift, py]);
        traceStone(colorContext, shifted);
        colorContext.fillStyle = `rgb(${shade + warm}, ${shade + warm - 2}, ${shade})`;
        colorContext.fill();
        colorContext.strokeStyle = 'rgba(44, 48, 48, 0.48)';
        colorContext.lineWidth = 1.5;
        colorContext.stroke();

        colorContext.save();
        traceStone(colorContext, shifted);
        colorContext.clip();
        for (let mark = 0; mark < 5; mark += 1) {
          const markX = stone.x0 + (stone.x1 - stone.x0) * random() + shift;
          const markY = y0 + (y1 - y0) * random();
          colorContext.fillStyle = random() > 0.5 ? 'rgba(205, 201, 187, 0.11)' : 'rgba(20, 26, 27, 0.1)';
          colorContext.beginPath();
          colorContext.ellipse(markX, markY, 4 + random() * 13, 2 + random() * 7, random(), 0, Math.PI * 2);
          colorContext.fill();
        }
        colorContext.restore();

        traceStone(bumpContext, shifted);
        const height = 174 + Math.floor(random() * 48);
        bumpContext.fillStyle = `rgb(${height}, ${height}, ${height})`;
        bumpContext.fill();
      }
    }
  }

  const color = new THREE.CanvasTexture(colorCanvas);
  const bump = new THREE.CanvasTexture(bumpCanvas);
  color.colorSpace = THREE.SRGBColorSpace;
  for (const texture of [color, bump]) {
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.anisotropy = 8;
  }
  masonryMapsCache = { color, bump };
  return masonryMapsCache;
}

function roofGeometry(roof) {
  const { x0, x1, width, eaveY, ridgeY } = roof;
  const half = width / 2;
  const positions = [];
  const uvs = [];
  const slope = Math.hypot(half, ridgeY - eaveY);
  const push = (p, u, v) => {
    positions.push(...p);
    uvs.push(u, v);
  };
  for (const side of [-1, 1]) {
    const e1 = [x0, eaveY, side * half];
    const e2 = [x1, eaveY, side * half];
    const r1 = [x0, ridgeY, 0];
    const r2 = [x1, ridgeY, 0];
    const order = side > 0 ? [e1, e2, r2, e1, r2, r1] : [e2, e1, r1, e2, r1, r2];
    const uvOrder = side > 0
      ? [[x0, 0], [x1, 0], [x1, slope], [x0, 0], [x1, slope], [x0, slope]]
      : [[x1, 0], [x0, 0], [x0, slope], [x1, 0], [x0, slope], [x1, slope]];
    for (let i = 0; i < 6; i += 1) {
      push(order[i], uvOrder[i][0] / SLATE_TEXTURE_METRES_X, uvOrder[i][1] / SLATE_TEXTURE_METRES_Y);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.computeVertexNormals();
  return geo;
}

// Vertical triangles closing the gable ends: stone over the cottage,
// near-black over the open loggia end so the roof reads hollow, not empty.
// Winding is checked so the normal points out the `facing` side.
function gableGeometry(x, width, eaveY, ridgeY, facing) {
  const half = width / 2;
  let tri = [[x, eaveY, -half], [x, eaveY, half], [x, ridgeY, 0]];
  let uv = [
    [0, 0],
    [width / MASONRY_TEXTURE_METRES, 0],
    [width / (MASONRY_TEXTURE_METRES * 2), (ridgeY - eaveY) / MASONRY_TEXTURE_METRES],
  ];
  const [a, b, c] = tri;
  const normalX = (b[1] - a[1]) * (c[2] - a[2]) - (b[2] - a[2]) * (c[1] - a[1]);
  if (Math.sign(normalX) !== Math.sign(facing)) {
    tri = [tri[1], tri[0], tri[2]];
    uv = [uv[1], uv[0], uv[2]];
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(tri.flat(), 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv.flat(), 2));
  geo.computeVertexNormals();
  return geo;
}

export default function DairyCottage() {
  const [slateCol, slateNrm, planksCol, planksNrm] = useLoader(THREE.TextureLoader, [
    '/textures/slate_col.jpg',
    '/textures/slate_nrm.jpg',
    '/textures/planks_col.jpg',
    '/textures/planks_nrm.jpg',
  ]);

  const { meshes, colliders, ground } = useMemo(() => {
    for (const texture of [slateCol, planksCol, slateNrm, planksNrm]) {
      texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
      texture.anisotropy = 8;
    }
    slateCol.colorSpace = THREE.SRGBColorSpace;
    planksCol.colorSpace = THREE.SRGBColorSpace;
    const masonry = dairyMasonryMaps();

    const built = buildDairy();
    // Each wall keeps a local texture transform. Offsetting by its world-local
    // position lets neighboring wall boxes share courses instead of restarting.
    const stoneMeshFor = (entry) => {
      const [sx, sy, sz] = entry.s;
      const across = Math.max(sx, sz);
      const horizontalStart = sx >= sz ? entry.p[0] - sx / 2 : entry.p[2] - sz / 2;
      const verticalStart = entry.p[1] - sy / 2;
      const col = masonry.color.clone();
      const bump = masonry.bump.clone();
      col.repeat.set(across / MASONRY_TEXTURE_METRES, sy / MASONRY_TEXTURE_METRES);
      bump.repeat.copy(col.repeat);
      col.offset.set(horizontalStart / MASONRY_TEXTURE_METRES, verticalStart / MASONRY_TEXTURE_METRES);
      bump.offset.copy(col.offset);
      col.needsUpdate = true;
      bump.needsUpdate = true;
      const material = new THREE.MeshStandardMaterial({
        map: col,
        bumpMap: bump,
        bumpScale: 0.08,
        roughness: 0.96,
      });
      const shade = 0.97 + (entry.tint[0] - 0.82) * 0.25;
      material.color.setRGB(shade, shade * 0.99, shade * 0.97);
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), material);
      mesh.position.set(...entry.p);
      if (entry.r) mesh.rotation.set(...entry.r);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      return mesh;
    };
    const gableStone = new THREE.MeshStandardMaterial({
      map: masonry.color,
      bumpMap: masonry.bump,
      bumpScale: 0.08,
      roughness: 0.96,
    });
    const creamMat = new THREE.MeshStandardMaterial({
      color: '#f0e6c9',
      roughness: 0.82,
    });
    // Window glass: near-black with a low-roughness sheen so panes catch
    // the sky instead of reading as tar.
    const darkMat = new THREE.MeshStandardMaterial({
      color: '#20272b',
      roughness: 0.22,
      metalness: 0.1,
      envMapIntensity: 1.1,
    });
    const planksMat = new THREE.MeshStandardMaterial({
      map: planksCol,
      normalMap: planksNrm,
      normalScale: new THREE.Vector2(0.28, 0.28),
      roughness: 0.9,
    });
    planksMat.color.setRGB(1.4, 1.32, 1.15);
    const slateMat = new THREE.MeshStandardMaterial({
      map: slateCol,
      normalMap: slateNrm,
      normalScale: new THREE.Vector2(0.35, 0.35),
      roughness: 0.9,
    });
    slateMat.color.setRGB(0.48, 0.51, 0.55);

    const unit = new THREE.BoxGeometry(1, 1, 1);
    const roofMesh = new THREE.Mesh(roofGeometry(built.roof), slateMat);
    roofMesh.castShadow = true;
    roofMesh.receiveShadow = true;
    const eastGable = new THREE.Mesh(
      gableGeometry(built.roof.gables[0] - 0.4, 5.1, built.roof.eaveY, built.roof.ridgeY - 0.15, 1),
      gableStone,
    );
    eastGable.castShadow = true;
    const westGable = new THREE.Mesh(
      gableGeometry(built.roof.gables[1] + 0.45, 5.1, built.roof.eaveY, built.roof.ridgeY - 0.15, -1),
      new THREE.MeshStandardMaterial({ color: '#242019', roughness: 1, side: THREE.DoubleSide }),
    );

    return {
      meshes: [
        ...built.stone.map(stoneMeshFor),
        instanced(unit, creamMat, built.cream),
        instanced(unit, darkMat, built.dark),
        instanced(unit, planksMat, built.planks),
        roofMesh,
        eastGable,
        westGable,
      ],
      colliders: built.colliders,
      ground: built.ground,
    };
  }, [slateCol, slateNrm, planksCol, planksNrm]);

  return (
    <>
      <group
        position={[DAIRY.x, ground, DAIRY.z]}
        rotation={[0, DAIRY.yaw, 0]}
        onClick={(event) => identifyLandmark(PARK_LANDMARKS.dairy, event)}
      >
        {meshes.map((mesh, index) => (
          <primitive key={index} object={mesh} />
        ))}
      </group>
      <StaticColliders entries={colliders} />
    </>
  );
}
