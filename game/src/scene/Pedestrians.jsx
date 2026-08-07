import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { useFrame, useLoader } from '@react-three/fiber';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { clone as cloneSkeleton } from 'three/addons/utils/SkeletonUtils.js';
import { terrainHeight } from '../world/terrain.js';

// Background pedestrians: one rigged figure from the character lab, cloned
// and tinted. Standers play the standing idle; walkers layer a procedural
// leg swing over it and follow sidewalk routes. Every figure shares one
// identity — a stand-in until the patient pipeline supplies a cast.
const WALK_TOP = 1.29;
const WALK_SPEED = 1.1;

// [x, z, yaw, onTerrain]
const STANDERS = [
  [108.4, 20, -1.6, false],
  [-8, 88.4, 3.0, false],
  [-35, 141.9, 0.8, false],
  [86, 74, -0.6, true],
  [90, 66, 2.2, true],
  [64, 50, -1.4, true],
];

// Routes are ping-ponged; onTerrain routes sample the park terrain.
const ROUTES = [
  { points: [[104, 60], [104.5, 20], [105, -20]], onTerrain: false },
  { points: [[40, 97.6], [0, 97.6], [-44, 97.6]], onTerrain: false },
  { points: [[84, 72], [60, 71], [34, 76], [8, 80]], onTerrain: true },
  { points: [[-24, 80], [-48, 77], [-66, 72]], onTerrain: true },
  { points: [[80, 52], [70, 50], [58, 52]], onTerrain: true },
  { points: [[-38, 130], [-39, 108], [-40, 92]], onTerrain: false },
];

function hash01(seed) {
  const value = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return value - Math.floor(value);
}

// The export carries both the full body and a low-poly proxy shell; both
// rendered at once shows the inner shell through the face. Keep the full
// body, drop the proxy, and force the skin opaque.
function fixFigureMaterials(figure, index) {
  figure.traverse((node) => {
    if (!node.isMesh && !node.isSkinnedMesh) return;
    if (node.name === 'low-poly' || /low-poly/i.test(node.material?.name ?? '')) {
      node.visible = false;
      return;
    }
    node.castShadow = true;
    node.frustumCulled = false;
    const material = node.material;
    if (!material) return;
    if (/eyelash|eyebrow/i.test(material.name)) {
      material.alphaTest = 0.5;
      material.transparent = false;
      material.depthWrite = true;
    } else {
      material.transparent = false;
      material.depthWrite = true;
    }
    if (/garment|suit/i.test(material.name)) {
      // Darken only, tiny hue drift: 1896 suits live in black-brown-grey.
      node.material = material.clone();
      node.material.color.offsetHSL((hash01(index * 7.1) - 0.5) * 0.02, -0.15, -0.05 - hash01(index * 5.3) * 0.2);
    }
  });
}

function routePoint(points, dist) {
  let remaining = dist;
  for (let i = 0; i < points.length - 1; i += 1) {
    const [x1, z1] = points[i];
    const [x2, z2] = points[i + 1];
    const len = Math.hypot(x2 - x1, z2 - z1);
    if (remaining <= len) {
      const t = remaining / len;
      return [x1 + (x2 - x1) * t, z1 + (z2 - z1) * t, x2 - x1, z2 - z1];
    }
    remaining -= len;
  }
  const [x1, z1] = points[points.length - 2];
  const [x2, z2] = points[points.length - 1];
  return [x2, z2, x2 - x1, z2 - z1];
}

function routeLength(points) {
  let total = 0;
  for (let i = 0; i < points.length - 1; i += 1) {
    total += Math.hypot(points[i + 1][0] - points[i][0], points[i + 1][1] - points[i][1]);
  }
  return total;
}

export default function Pedestrians() {
  // The character-lab exports are meshopt-compressed.
  const gltf = useLoader(GLTFLoader, '/models/pedestrian-a.glb', (loader) =>
    loader.setMeshoptDecoder(MeshoptDecoder),
  );

  const { group, standers, walkers } = useMemo(() => {
    const source = gltf.scene;
    const bounds = new THREE.Box3().setFromObject(source);
    const sourceHeight = Math.max(0.01, bounds.max.y - bounds.min.y);
    // Both lab clips are seated clinic idles. Dropping the hip and leg
    // tracks leaves the standing bind pose below the waist while the upper
    // body keeps the living idle motion.
    const seated = gltf.animations.find((clip) => clip.name === 'RestlessIdle') ?? gltf.animations[0];
    const idle = new THREE.AnimationClip(
      'StandingIdle',
      seated.duration,
      seated.tracks.filter((track) => !/hips|pelvis|thigh|calf|foot|ball|toe/i.test(track.name)),
    );

    const root = new THREE.Group();
    const standing = [];
    const walking = [];

    const spawn = (index) => {
      const figure = cloneSkeleton(source);
      const scale = (1.75 / sourceHeight) * (0.93 + hash01(index * 3.7) * 0.14);
      figure.scale.setScalar(scale);
      fixFigureMaterials(figure, index);
      const mixer = new THREE.AnimationMixer(figure);
      mixer.clipAction(idle).play();
      mixer.setTime(hash01(index * 11.3) * idle.duration);
      root.add(figure);
      // The rest pose's lowest point sits below the rig origin; lift by it
      // so soles meet the pavement instead of sinking through.
      return { figure, mixer, speed: 0.9 + hash01(index * 13.7) * 0.2, lift: -bounds.min.y * scale };
    };

    STANDERS.forEach(([x, z, yaw, onTerrain], index) => {
      const entry = spawn(index);
      entry.figure.position.set(x, (onTerrain ? terrainHeight(x, z) : WALK_TOP) + entry.lift, z);
      entry.figure.rotation.y = yaw;
      standing.push(entry);
    });

    ROUTES.forEach((route, index) => {
      const entry = spawn(index + 40);
      walking.push({
        ...entry,
        route,
        length: routeLength(route.points),
        dist: hash01(index * 5.9) * routeLength(route.points),
        dir: 1,
      });
    });

    return { group: root, standers: standing, walkers: walking };
  }, [gltf]);

  useFrame((_, delta) => {
    for (const { mixer, speed } of standers) mixer.update(delta * speed);
    for (const walker of walkers) {
      walker.mixer.update(delta * walker.speed);
      walker.dist += WALK_SPEED * delta * walker.dir;
      if (walker.dist > walker.length) {
        walker.dist = walker.length;
        walker.dir = -1;
      } else if (walker.dist < 0) {
        walker.dist = 0;
        walker.dir = 1;
      }
      // No leg animation: the rig's bone axes defeat a procedural gait, so
      // movers glide in the standing pose. Rig a real walk cycle later.
      const [x, z, dx, dz] = routePoint(walker.route.points, walker.dist);
      const y = walker.route.onTerrain ? terrainHeight(x, z) : WALK_TOP;
      walker.figure.position.set(x, y + walker.lift, z);
      walker.figure.rotation.y = Math.atan2(dx * walker.dir, dz * walker.dir);
    }
  });

  useEffect(
    () => () => {
      group.traverse((node) => {
        if ((node.isMesh || node.isSkinnedMesh) && /garment|suit/i.test(node.material?.name ?? '')) {
          node.material.dispose();
        }
      });
    },
    [group],
  );

  return <primitive object={group} />;
}
