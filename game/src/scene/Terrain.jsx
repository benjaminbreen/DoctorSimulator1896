import { useMemo } from 'react';
import * as THREE from 'three';
import { useLoader } from '@react-three/fiber';
import { RigidBody, HeightfieldCollider } from '@react-three/rapier';
import { terrainHeight, pathsDistance, pondDepth, rockiness } from '../world/terrain.js';
import { WORLD_BOUNDS } from '../world/streetGrid.js';
import { constructedSurfaceAt } from '../world/constructedSurfaces.js';

const WIDTH = WORLD_BOUNDS.maxX - WORLD_BOUNDS.minX;
const DEPTH = WORLD_BOUNDS.maxZ - WORLD_BOUNDS.minZ;
const CENTER_X = (WORLD_BOUNDS.minX + WORLD_BOUNDS.maxX) / 2;
const CENTER_Z = (WORLD_BOUNDS.minZ + WORLD_BOUNDS.maxZ) / 2;
// Fine enough that the pond's narrow channels (~3 world units) span several
// cells; at 1-unit cells they collapsed into dotted puddles.
const SEGMENTS_X = 280;
const SEGMENTS_Z = 230;
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
  const [grassCol, grassNrm, pathCol, rockCol, streetCol] = useLoader(THREE.TextureLoader, [
    '/textures/grass_col.webp',
    '/textures/grass_nrm.webp',
    '/textures/path_col.webp',
    '/textures/rock_col.webp',
    '/textures/street/carriage-setts_col.webp',
  ]);

  const { geometry, heights } = useMemo(() => {
    const geo = new THREE.PlaneGeometry(WIDTH, DEPTH, SEGMENTS_X, SEGMENTS_Z);
    geo.rotateX(-Math.PI / 2);
    geo.translate(CENTER_X, 0, CENTER_Z);
    const positions = geo.attributes.position;
    const splat = new Float32Array(positions.count * 4);
    const urban = new Float32Array(positions.count);
    for (let i = 0; i < positions.count; i += 1) {
      const x = positions.getX(i);
      const z = positions.getZ(i);
      positions.setY(i, terrainHeight(x, z));

      const fromPath = pathsDistance(x, z);
      const nearPath = Math.max(0, 1 - fromPath / 1.5);
      const pond = pondDepth(x, z);
      splat[i * 4] = nearPath * nearPath;
      splat[i * 4 + 1] = Math.min(1, rockiness(x, z)) * 0.85;
      splat[i * 4 + 2] = pond < 0.3 ? 1 - Math.max(0, pond) / 0.3 : 0;
      // Worn verge: grass within a few metres of a walk, tinted in-shader.
      splat[i * 4 + 3] = Math.max(0, 1 - fromPath / 5.5);
      urban[i] = constructedSurfaceAt(x, z);
    }
    geo.setAttribute('aSplat', new THREE.BufferAttribute(splat, 4));
    geo.setAttribute('aUrban', new THREE.BufferAttribute(urban, 1));
    geo.computeVertexNormals();
    // Collider heights on rapier's heightfield grid: column-major, columns
    // along x, rows along z. A heightfield builds in milliseconds where the
    // old trimesh spent seconds on a BVH for the same surface.
    const heights = new Float32Array((SEGMENTS_X + 1) * (SEGMENTS_Z + 1));
    const dx = WIDTH / SEGMENTS_X;
    const dz = DEPTH / SEGMENTS_Z;
    for (let i = 0; i < positions.count; i += 1) {
      const ix = Math.round((positions.getX(i) - WORLD_BOUNDS.minX) / dx);
      const iz = Math.round((positions.getZ(i) - WORLD_BOUNDS.minZ) / dz);
      heights[ix * (SEGMENTS_Z + 1) + iz] = positions.getY(i);
    }
    return { geometry: geo, heights };
  }, []);

  const material = useMemo(() => {
    loadRepeating(grassCol, THREE.SRGBColorSpace);
    loadRepeating(pathCol, THREE.SRGBColorSpace);
    loadRepeating(rockCol, THREE.SRGBColorSpace);
    loadRepeating(streetCol, THREE.SRGBColorSpace);
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
      shader.uniforms.streetMap = { value: streetCol };
      shader.vertexShader =
        'attribute vec4 aSplat;\nattribute float aUrban;\nvarying vec4 vSplat;\nvarying float vUrban;\n' +
        shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n  vSplat = aSplat;\n  vUrban = aUrban;');
      shader.fragmentShader =
        'varying vec4 vSplat;\nvarying float vUrban;\nuniform sampler2D pathMap;\nuniform sampler2D rockMap;\nuniform sampler2D streetMap;\n' +
        'float turfHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }\n' +
        'float turfNoise(vec2 p) {\n' +
        '  vec2 i = floor(p); vec2 f = fract(p);\n' +
        '  vec2 u = f * f * (3.0 - 2.0 * f);\n' +
        '  return mix(mix(turfHash(i), turfHash(i + vec2(1.0, 0.0)), u.x),\n' +
        '             mix(turfHash(i + vec2(0.0, 1.0)), turfHash(i + vec2(1.0, 1.0)), u.x), u.y);\n' +
        '}\n' +
        shader.fragmentShader.replace(
          '#include <map_fragment>',
          `{
            vec2 uvT = vMapUv * vec2(${(WIDTH / TILE).toFixed(1)}, ${(DEPTH / TILE).toFixed(1)});
            vec2 wuv = uvT * ${TILE.toFixed(1)};
            // The same grass tile sampled at two unrelated scales, chosen
            // per patch by slow noise: the repeat never survives both.
            vec3 blended = mix(
              texture2D(map, uvT).rgb,
              texture2D(map, uvT * 0.23).rgb,
              smoothstep(0.25, 0.75, turfNoise(wuv / 17.0)));
            // Lawn patchiness at garden scale: lush to scorched over tens
            // of metres, two octaves so the patches have ragged edges.
            // ('patch' itself is a reserved word in GLSL ES 3.0.)
            float turfPatch = turfNoise(wuv / 27.0) * 0.65 + turfNoise(wuv / 9.0) * 0.35;
            blended *= mix(vec3(0.92, 1.04, 0.88), vec3(1.08, 1.02, 0.72), smoothstep(0.3, 0.8, turfPatch));
            // Worn verges: walked-on grass dulls and yellows near the paths,
            // noise-broken so the band has no crisp edge.
            float verge = vSplat.w * vSplat.w * (0.4 + 0.5 * turfNoise(wuv / 4.3));
            blended = mix(blended, blended * vec3(1.05, 0.96, 0.7), verge * 0.6);
            blended = mix(blended, texture2D(rockMap, uvT * 0.71).rgb, clamp(vSplat.y, 0.0, 1.0));
            blended = mix(blended, texture2D(pathMap, uvT * 1.37).rgb, clamp(vSplat.x, 0.0, 1.0));
            blended = mix(blended, texture2D(pathMap, uvT * 1.37).rgb * vec3(1.02, 0.94, 0.78), clamp(vSplat.z, 0.0, 1.0));
            blended = mix(blended, texture2D(streetMap, uvT * 1.2).rgb, smoothstep(0.12, 0.88, vUrban));
            diffuseColor.rgb *= blended;
          }`,
        );
    };
    return mat;
  }, [grassCol, grassNrm, pathCol, rockCol, streetCol]);

  return (
    <group>
      <RigidBody type="fixed" colliders={false} position={[CENTER_X, 0, CENTER_Z]}>
        <HeightfieldCollider
          args={[SEGMENTS_Z, SEGMENTS_X, heights, { x: WIDTH, y: 1, z: DEPTH }]}
        />
      </RigidBody>
      <mesh geometry={geometry} material={material} receiveShadow />
    </group>
  );
}
