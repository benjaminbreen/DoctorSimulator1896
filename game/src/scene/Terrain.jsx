import { useMemo } from 'react';
import * as THREE from 'three';
import { useLoader } from '@react-three/fiber';
import { RigidBody, TrimeshCollider } from '@react-three/rapier';
import { terrainHeight, pathsDistance, pondDepth, rockiness } from '../world/terrain.js';
import { WORLD_BOUNDS } from '../world/streetGrid.js';

const WIDTH = WORLD_BOUNDS.maxX - WORLD_BOUNDS.minX;
const DEPTH = WORLD_BOUNDS.maxZ - WORLD_BOUNDS.minZ;
const CENTER_X = (WORLD_BOUNDS.minX + WORLD_BOUNDS.maxX) / 2;
const CENTER_Z = (WORLD_BOUNDS.minZ + WORLD_BOUNDS.maxZ) / 2;
const SEGMENTS_X = 200;
const SEGMENTS_Z = 164;
// World meters per texture tile.
const TILE = 3.6;

function loadRepeating(texture, colorSpace) {
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  if (colorSpace) texture.colorSpace = colorSpace;
  texture.anisotropy = 8;
  return texture;
}

// Splat-textured park ground: grass base, gravel on the paths, schist on the
// outcrops, wet sand at the pond rim. Blend weights ride a vertex attribute;
// the same masks that shape the terrain drive them.
export default function Terrain() {
  const [grassCol, grassNrm, pathCol, rockCol] = useLoader(THREE.TextureLoader, [
    '/textures/grass_col.jpg',
    '/textures/grass_nrm.jpg',
    '/textures/path_col.jpg',
    '/textures/rock_col.jpg',
  ]);

  const { geometry, vertices, indices } = useMemo(() => {
    const geo = new THREE.PlaneGeometry(WIDTH, DEPTH, SEGMENTS_X, SEGMENTS_Z);
    geo.rotateX(-Math.PI / 2);
    geo.translate(CENTER_X, 0, CENTER_Z);
    const positions = geo.attributes.position;
    const splat = new Float32Array(positions.count * 4);
    for (let i = 0; i < positions.count; i += 1) {
      const x = positions.getX(i);
      const z = positions.getZ(i);
      positions.setY(i, terrainHeight(x, z));

      const tone = Math.sin(x * 12.9898 + z * 78.233) * 43758.5453;
      const jitter = tone - Math.floor(tone);
      const nearPath = Math.max(0, 1 - pathsDistance(x, z) / 1.5);
      const pond = pondDepth(x, z);
      splat[i * 4] = nearPath * nearPath;
      splat[i * 4 + 1] = Math.min(1, rockiness(x, z)) * 0.85;
      splat[i * 4 + 2] = pond < 0.3 ? 1 - Math.max(0, pond) / 0.3 : 0;
      splat[i * 4 + 3] = jitter;
    }
    geo.setAttribute('aSplat', new THREE.BufferAttribute(splat, 4));
    geo.computeVertexNormals();
    return {
      geometry: geo,
      vertices: new Float32Array(positions.array),
      indices: new Uint32Array(geo.index.array),
    };
  }, []);

  const material = useMemo(() => {
    loadRepeating(grassCol, THREE.SRGBColorSpace);
    loadRepeating(pathCol, THREE.SRGBColorSpace);
    loadRepeating(rockCol, THREE.SRGBColorSpace);
    loadRepeating(grassNrm);
    grassNrm.repeat.set(WIDTH / TILE, DEPTH / TILE);

    const mat = new THREE.MeshStandardMaterial({
      map: grassCol,
      normalMap: grassNrm,
      normalScale: new THREE.Vector2(0.5, 0.5),
      roughness: 0.95,
    });
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.pathMap = { value: pathCol };
      shader.uniforms.rockMap = { value: rockCol };
      shader.vertexShader =
        'attribute vec4 aSplat;\nvarying vec4 vSplat;\n' +
        shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n  vSplat = aSplat;');
      shader.fragmentShader =
        'varying vec4 vSplat;\nuniform sampler2D pathMap;\nuniform sampler2D rockMap;\n' +
        shader.fragmentShader.replace(
          '#include <map_fragment>',
          `{
            vec2 uvT = vMapUv * vec2(${(WIDTH / TILE).toFixed(1)}, ${(DEPTH / TILE).toFixed(1)});
            vec3 blended = texture2D(map, uvT).rgb;
            blended = mix(blended, texture2D(rockMap, uvT * 0.71).rgb, clamp(vSplat.y, 0.0, 1.0));
            blended = mix(blended, texture2D(pathMap, uvT * 1.37).rgb, clamp(vSplat.x, 0.0, 1.0));
            blended = mix(blended, texture2D(pathMap, uvT * 1.37).rgb * vec3(1.02, 0.94, 0.78), clamp(vSplat.z, 0.0, 1.0));
            blended *= 0.86 + vSplat.w * 0.28;
            diffuseColor.rgb *= blended;
          }`,
        );
    };
    return mat;
  }, [grassCol, grassNrm, pathCol, rockCol]);

  return (
    <group>
      <RigidBody type="fixed" colliders={false}>
        <TrimeshCollider args={[vertices, indices]} />
      </RigidBody>
      <mesh geometry={geometry} material={material} receiveShadow />
    </group>
  );
}
