import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { PATHS, parkItems } from '../world/centralPark.js';
import { terrainHeight, pathsDistance, pondDepth } from '../world/terrain.js';
import { constructedSurfaceAt } from '../world/constructedSurfaces.js';

// Lawn-edge dressing on the main walks: low post-and-wire guards on the lesser
// walks, a granite-block gutter along the drive and the Pond walk, "Keep off
// the grass" boards, and the ordinance board at Scholars' Gate. Other walks
// keep a plain turf edge, the commonest finish in period views.
const FENCED_WALKS = ['north-walk', 'green-walk', 'dairy-walk'];
const GUTTER_WALKS = ['center-drive', 'pond-walk'];
const POST_STEP = 2.4;
const POST_HEIGHT = 0.55;
const WIRE_HEIGHTS = [0.22, 0.45];
const GUTTER_WIDTH = 0.32;
const GUTTER_STEP = 0.6;
const GUTTER_TILE = 3; // metres per texture repeat, as on the street gutters
const SIGN_EVERY = 46;
// The Pond lawn by the Plaza has people sitting and lying on it (see
// pedestrianCatalog.js), so it carries no sign telling them off.
const OPEN_LAWN = { x: 72, z: 56, radius: 16 };
const ORDINANCE_AT = [77, 62.4];

const BENCHES = parkItems.filter((item) => /bench/.test(item.model ?? '')).map((item) => item.position);

function edgeOk(x, z) {
  if (pathsDistance(x, z) < 0.25) return false; // a junction: another walk crosses here
  if (constructedSurfaceAt(x, z)) return false;
  return pondDepth(x, z) >= 0.25;
}

// Points every `step` metres along a walk, with the walk's direction there.
function samples(path, step) {
  const out = [];
  let travelled = 0;
  let next = step / 2;
  for (let i = 0; i + 1 < path.points.length; i += 1) {
    const [x1, z1] = path.points[i];
    const [x2, z2] = path.points[i + 1];
    const length = Math.hypot(x2 - x1, z2 - z1);
    const [ux, uz] = [(x2 - x1) / length, (z2 - z1) / length];
    for (; next < travelled + length; next += step) {
      const d = next - travelled;
      out.push({ x: x1 + ux * d, z: z1 + uz * d, ux, uz, along: next });
    }
    travelled += length;
  }
  return out;
}

const side = (point, offset, sign) => [point.x - point.uz * offset * sign, point.z + point.ux * offset * sign];

function layout() {
  const posts = [];
  const wires = [];
  const gutters = [];
  const signs = [];
  for (const path of PATHS) {
    const fenced = FENCED_WALKS.includes(path.id);
    const guttered = GUTTER_WALKS.includes(path.id);
    if (!fenced && !guttered) continue;

    if (fenced) {
      for (const sign of [1, -1]) {
        let last = null;
        for (const point of samples(path, POST_STEP)) {
          const [x, z] = side(point, path.width / 2 + 0.3, sign);
          const benchClear = !BENCHES.some(([bx, , bz]) => Math.hypot(bx - x, bz - z) < 1.6);
          if (!edgeOk(x, z) || !benchClear) {
            last = null;
            continue;
          }
          const post = [x, terrainHeight(x, z), z];
          posts.push(post);
          if (last && Math.hypot(x - last[0], z - last[2]) < POST_STEP * 1.5) wires.push([last, post]);
          last = post;
        }
      }
    }

    if (guttered) {
      // The blocks sit on the walk's own edge, so the outer rim is tested for junctions.
      for (const sign of [1, -1]) {
        let strip = [];
        for (const point of samples(path, GUTTER_STEP)) {
          const inner = side(point, path.width / 2 - 0.05, sign);
          const outer = side(point, path.width / 2 - 0.05 + GUTTER_WIDTH, sign);
          if (!edgeOk(...outer)) {
            if (strip.length > 1) gutters.push(strip);
            strip = [];
            continue;
          }
          // Swapped on one side so both ribbons wind to face up.
          strip.push(sign > 0 ? { inner: outer, outer: inner, along: point.along } : { inner, outer, along: point.along });
        }
        if (strip.length > 1) gutters.push(strip);
      }
    }

    for (const point of samples(path, SIGN_EVERY)) {
      const sign = signs.length % 2 ? 1 : -1;
      const [x, z] = side(point, path.width / 2 + 0.75, sign);
      if (edgeOk(x, z) && Math.hypot(x - OPEN_LAWN.x, z - OPEN_LAWN.z) > OPEN_LAWN.radius) {
        // Board faces back across the walk.
        signs.push([x, terrainHeight(x, z), z, Math.atan2(point.uz * sign, -point.ux * sign)]);
      }
    }
  }
  return { posts, wires, gutters, signs };
}

// One ribbon per unbroken run of gutter, lifted a little off the ground.
function gutterGeometry(strips) {
  const positions = [];
  const uvs = [];
  const indices = [];
  for (const strip of strips) {
    const base = positions.length / 3;
    for (const { inner, outer, along } of strip) {
      for (const [[x, z], u] of [[inner, 0], [outer, GUTTER_WIDTH / GUTTER_TILE]]) {
        positions.push(x, terrainHeight(x, z) + 0.03, z);
        uvs.push(u, along / GUTTER_TILE);
      }
    }
    for (let i = 0; i + 1 < strip.length; i += 1) {
      const a = base + i * 2;
      indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function streetTexture(name, color) {
  const texture = new THREE.TextureLoader().load(`/textures/street/gutter-stones_${name}.webp`);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = 8;
  if (color) texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function boardTexture(lines, width, height) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const g = canvas.getContext('2d');
  g.fillStyle = '#23402f';
  g.fillRect(0, 0, width, height);
  g.strokeStyle = '#d9d2bd';
  g.lineWidth = height * 0.03;
  g.strokeRect(height * 0.06, height * 0.06, width - height * 0.12, height - height * 0.12);
  g.fillStyle = '#ece4cc';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  for (const [text, y, size] of lines) {
    g.font = `bold ${size}px Georgia, 'Times New Roman', serif`;
    g.fillText(text, width / 2, y);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

function fillInstances(mesh, list, place) {
  const dummy = new THREE.Object3D();
  list.forEach((entry, index) => {
    place(dummy, entry, index);
    dummy.updateMatrix();
    mesh.setMatrixAt(index, dummy.matrix);
  });
  mesh.instanceMatrix.needsUpdate = true;
  mesh.computeBoundingSphere();
}

export default function ParkEdging() {
  const built = useMemo(() => {
    const { posts, wires, gutters, signs } = layout();
    const iron = new THREE.MeshStandardMaterial({ color: '#1f2620', roughness: 0.55, metalness: 0.5 });
    const post = new THREE.MeshStandardMaterial({ color: '#2b2a26', roughness: 0.8 });
    const signTexture = boardTexture([['KEEP OFF', 88, 64], ['THE GRASS', 168, 64]], 512, 256);
    const boardMaterial = new THREE.MeshStandardMaterial({ map: signTexture, roughness: 0.7 });
    // An abridgement of the 1873 rules; the board's appearance is inferred.
    // Sources and the generation prompt are recorded in docs/park-signs.md.
    const ordinanceTexture = new THREE.TextureLoader().load('/textures/signs/central-park-ordinances.webp');
    ordinanceTexture.colorSpace = THREE.SRGBColorSpace;
    ordinanceTexture.anisotropy = 8;
    const ordinanceMaterial = new THREE.MeshStandardMaterial({ map: ordinanceTexture, roughness: 0.85 });
    const ordinanceBack = new THREE.MeshStandardMaterial({ color: '#3b352b', roughness: 0.85 });

    // Short iron posts with a ball top, and plain wire strung between them.
    const guardGeometry = mergeGeometries([
      new THREE.CylinderGeometry(0.018, 0.024, POST_HEIGHT, 6).translate(0, POST_HEIGHT / 2, 0),
      new THREE.SphereGeometry(0.03, 8, 6).translate(0, POST_HEIGHT + 0.01, 0),
    ]);
    const guardMesh = new THREE.InstancedMesh(guardGeometry, iron, posts.length);
    fillInstances(guardMesh, posts, (dummy, [x, y, z]) => dummy.position.set(x, y - 0.04, z));
    // A unit length along +z, so lookAt and a z scale span any two posts.
    const wireGeometry = new THREE.CylinderGeometry(0.004, 0.004, 1, 4).rotateX(Math.PI / 2);
    const strands = wires.flatMap((pair) => WIRE_HEIGHTS.map((height) => [pair, height]));
    const wireMesh = new THREE.InstancedMesh(wireGeometry, iron, strands.length);
    const from = new THREE.Vector3();
    const to = new THREE.Vector3();
    fillInstances(wireMesh, strands, (dummy, [[a, b], height]) => {
      from.set(a[0], a[1] - 0.04 + height, a[2]);
      to.set(b[0], b[1] - 0.04 + height, b[2]);
      dummy.position.copy(from).lerp(to, 0.5);
      dummy.lookAt(to);
      dummy.scale.set(1, 1, from.distanceTo(to));
    });

    const gutterMaps = ['col', 'nrm', 'rough'].map((name) => streetTexture(name, name === 'col'));
    const gutterMaterial = new THREE.MeshStandardMaterial({
      map: gutterMaps[0],
      normalMap: gutterMaps[1],
      roughnessMap: gutterMaps[2],
      // The street texture is a wet-looking dark grey; park granite read pale.
      color: new THREE.Color(1.7, 1.65, 1.55),
      polygonOffset: true,
      polygonOffsetFactor: -2,
    });
    const gutterMesh = new THREE.Mesh(gutterGeometry(gutters), gutterMaterial);

    const postGeometry = new THREE.BoxGeometry(0.06, 1.0, 0.06).translate(0, 0.5, 0);
    const boardGeometry = new THREE.BoxGeometry(0.56, 0.28, 0.025).translate(0, 0.95, 0.045);
    const postMesh = new THREE.InstancedMesh(postGeometry, post, signs.length + 2);
    const boardMesh = new THREE.InstancedMesh(boardGeometry, boardMaterial, signs.length);
    const placeSign = (dummy, [x, y, z, yaw]) => {
      dummy.position.set(x, y - 0.05, z);
      dummy.rotation.set(0, yaw, 0);
      dummy.scale.set(1, 1, 1);
    };
    fillInstances(boardMesh, signs, placeSign);

    // The ordinance board stands on two taller posts just inside Scholars'
    // Gate, turned to face someone coming in from the Plaza.
    const [gx, gz] = ORDINANCE_AT;
    const gy = terrainHeight(gx, gz);
    const facing = Math.atan2(82 - gx, 68 - gz);
    const ordinance = new THREE.Mesh(new THREE.BoxGeometry(0.8, 1.0, 0.04), [
      ordinanceBack, ordinanceBack, ordinanceBack, ordinanceBack, ordinanceMaterial, ordinanceBack,
    ]);
    ordinance.position.set(gx, gy + 1.25, gz);
    ordinance.rotation.y = facing;
    const across = [Math.cos(facing) * 0.44, -Math.sin(facing) * 0.44];
    fillInstances(postMesh, [...signs, null, null], (dummy, entry, index) => {
      if (entry) return placeSign(dummy, entry);
      const side = index === signs.length ? -1 : 1;
      dummy.position.set(gx + across[0] * side, gy - 0.05, gz + across[1] * side);
      dummy.rotation.set(0, facing, 0);
      dummy.scale.set(1.3, 1.85, 1.3);
    });

    const meshes = [guardMesh, wireMesh, gutterMesh, postMesh, boardMesh, ordinance];
    for (const mesh of meshes) {
      mesh.castShadow = mesh !== wireMesh && mesh !== gutterMesh;
      mesh.receiveShadow = true;
    }
    return { meshes, resources: [iron, post, signTexture, boardMaterial, ordinanceMaterial, ordinanceBack, ordinanceTexture, guardGeometry, wireGeometry, gutterMaterial, ...gutterMaps, gutterMesh.geometry, postGeometry, boardGeometry, ordinance.geometry] };
  }, []);

  useEffect(() => () => built.resources.forEach((resource) => resource.dispose()), [built]);

  return (
    <group>
      {built.meshes.map((mesh, index) => <primitive key={index} object={mesh} />)}
    </group>
  );
}
