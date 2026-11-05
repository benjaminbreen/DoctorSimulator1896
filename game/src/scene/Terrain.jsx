import { useEffect,useMemo } from 'react';
import * as THREE from 'three';
import { useLoader } from '@react-three/fiber';
import { RigidBody, HeightfieldCollider } from '@react-three/rapier';
import { WORLD_BOUNDS } from '../world/streetGrid.js';
import {buildTerrainSurface,TERRAIN_COLUMNS,TERRAIN_ROWS} from './terrainSurface.js';
import { freezeStaticTransforms } from './lib/staticScene.js';

const WIDTH = WORLD_BOUNDS.maxX - WORLD_BOUNDS.minX;
const DEPTH = WORLD_BOUNDS.maxZ - WORLD_BOUNDS.minZ;
const CENTER_X = (WORLD_BOUNDS.minX + WORLD_BOUNDS.maxX) / 2;
const CENTER_Z = (WORLD_BOUNDS.minZ + WORLD_BOUNDS.maxZ) / 2;
// World meters per texture tile.
const TILE = 3.6;
// The lawn photo (ambientCG Grass001, 2K) covers less ground, so its blades
// stay sharp at standing height.
const LAWN_TILE = 2.6;

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
  const [lawnCol, lawnNrm, grassCol, pathCol, rockCol, streetCol] = useLoader(THREE.TextureLoader, [
    '/textures/lawn_col.webp',
    '/textures/lawn_nrm.webp',
    '/textures/grass_col.webp',
    '/textures/path_col.webp',
    '/textures/rock_col.webp',
    '/textures/street/carriage-setts_col.webp',
  ]);

  const { geometry, heights } = useMemo(buildTerrainSurface, []);

  const material = useMemo(() => {
    loadRepeating(lawnCol, THREE.SRGBColorSpace);
    loadRepeating(grassCol, THREE.SRGBColorSpace);
    loadRepeating(pathCol, THREE.SRGBColorSpace);
    loadRepeating(rockCol, THREE.SRGBColorSpace);
    loadRepeating(streetCol, THREE.SRGBColorSpace);
    loadRepeating(lawnNrm);
    lawnNrm.repeat.set(WIDTH / LAWN_TILE, DEPTH / LAWN_TILE);

    const mat = new THREE.MeshStandardMaterial({
      map: lawnCol,
      normalMap: lawnNrm,
      normalScale: new THREE.Vector2(0.5, 0.5),
      roughness: 0.95,
    });
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.dryMap = { value: grassCol };
      shader.uniforms.pathMap = { value: pathCol };
      shader.uniforms.rockMap = { value: rockCol };
      shader.uniforms.streetMap = { value: streetCol };
      shader.vertexShader =
        'attribute vec4 aSplat;\nattribute float aUrban;\nvarying vec4 vSplat;\nvarying float vUrban;\nvarying float vTerrainHeight;\n' +
        shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n  vSplat = aSplat;\n  vUrban = aUrban;\n  vTerrainHeight=position.y;');
      shader.fragmentShader =
        'varying vec4 vSplat;\nvarying float vUrban;\nvarying float vTerrainHeight;\nuniform sampler2D dryMap;\nuniform sampler2D pathMap;\nuniform sampler2D rockMap;\nuniform sampler2D streetMap;\n' +
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
            // The lawn tile and a turned, slightly larger copy, chosen per
            // patch by noise, so the repeat never survives. Neither sample is
            // enlarged much: a magnified photo reads as smeared blades.
            vec2 lawnUv = wuv / ${LAWN_TILE.toFixed(1)};
            vec3 blended = mix(
              texture2D(map, lawnUv).rgb,
              texture2D(map, mat2(0.8, 0.6, -0.6, 0.8) * lawnUv * 0.83 + 0.37).rgb,
              smoothstep(0.3, 0.7, turfNoise(wuv / 6.0)));
            // Drier, thinner turf in drifts across the lawn.
            float dryness = smoothstep(0.5, 0.85, turfNoise(wuv / 23.0) * 0.7 + turfNoise(wuv / 7.0) * 0.3);
            blended = mix(blended, texture2D(dryMap, uvT).rgb, dryness * 0.6);
            // Lawn patchiness at garden scale: lush to scorched over tens
            // of metres, two octaves so the patches have ragged edges.
            // ('patch' itself is a reserved word in GLSL ES 3.0.)
            float turfPatch = turfNoise(wuv / 27.0) * 0.65 + turfNoise(wuv / 9.0) * 0.35;
            blended *= mix(vec3(0.96, 1.0, 0.93), vec3(1.04, 1.0, 0.86), smoothstep(0.3, 0.8, turfPatch));
            float grassLuma = dot(blended, vec3(0.2126, 0.7152, 0.0722));
            blended = mix(vec3(grassLuma), blended, 0.76);
            // Worn verges: walked-on grass dulls and yellows near the paths,
            // noise-broken so the band has no crisp edge.
            float verge = vSplat.w * vSplat.w * (0.4 + 0.5 * turfNoise(wuv / 4.3));
            blended = mix(blended, blended * vec3(1.02, 0.97, 0.85), verge * 0.45);
            blended = mix(blended, texture2D(rockMap, uvT * 0.71).rgb, clamp(vSplat.y, 0.0, 1.0));
            // The same two-scale trick as the grass, with the far sample
            // rotated so the two lattices never line up, and a slow domain
            // warp so the tile grid itself wanders instead of repeating in
            // step down a straight walk.
            vec2 pathWarp = (vec2(turfNoise(wuv / 5.0), turfNoise(wuv / 5.0 + 31.7)) - 0.5) * 0.05;
            vec3 pathTex = mix(
              texture2D(pathMap, (uvT + pathWarp) * 1.37).rgb,
              texture2D(pathMap, (uvT.yx + pathWarp) * 0.31).rgb,
              smoothstep(0.25, 0.75, turfNoise(wuv / 13.0)));
            // At range every tile-scale feature reads as a repeat; ease the
            // surface toward a very coarse sample the eye cannot count.
            float pathFar = smoothstep(18.0, 55.0, length(vViewPosition));
            pathTex = mix(pathTex, texture2D(pathMap, uvT * 0.09).rgb, pathFar * 0.65);
            // Crushed limestone, not brown gravel: the period surface of the
            // drives and walks was pale.
            pathTex *= vec3(1.07, 1.04, 0.94);
            float pathWeight=clamp(vSplat.x+(turfNoise(wuv*1.4)-.5)*.5*vSplat.x*(1.0-vSplat.x),0.0,1.0);
            blended = mix(blended, pathTex, pathWeight);
            // Keep the pale, worn bank above the narrow wet-earth margin.
            blended = mix(blended, pathTex * vec3(1.0, 0.93, 0.79), clamp(vSplat.z, 0.0, 1.0));
            float bankNoise=turfNoise(wuv*1.15)*.65+turfNoise(wuv*3.7)*.35;
            float dampBank=smoothstep(.05,.64,vSplat.z)*(1.0-smoothstep(-.44,-.36,vTerrainHeight+(bankNoise-.5)*.045));
            float moisture=1.0-smoothstep(-.42,-.12,vTerrainHeight);
            float soilGrain=dot(texture2D(pathMap,uvT*2.7).rgb,vec3(.2126,.7152,.0722));
            vec3 soil=mix(vec3(.22,.17,.11),vec3(.10,.085,.062),moisture)*(.45+soilGrain*1.4+bankNoise*.32);
            blended = mix(blended,soil,dampBank);
            blended = mix(blended, texture2D(streetMap, uvT * 1.2).rgb, smoothstep(0.12, 0.88, vUrban));
            diffuseColor.rgb *= blended;
          }`,
        );
      shader.fragmentShader=shader.fragmentShader.replace('#include <normal_fragment_maps>',`vec3 groundNormal=normal;
        #include <normal_fragment_maps>
        float grassNormalWeight=(1.0-vSplat.x)*(1.0-vSplat.y)*(1.0-vUrban)*smoothstep(-.44,-.34,vTerrainHeight);
        normal=normalize(mix(groundNormal,normal,grassNormalWeight));`);
    };
    return mat;
  }, [lawnCol, lawnNrm, grassCol, pathCol, rockCol, streetCol]);
  useEffect(()=>()=>{geometry.dispose();material.dispose();},[geometry,material]);

  return (
    <group ref={(node) => freezeStaticTransforms(node)}>
      <RigidBody type="fixed" colliders={false} position={[CENTER_X, 0, CENTER_Z]}>
        <HeightfieldCollider
          args={[TERRAIN_ROWS, TERRAIN_COLUMNS, heights, { x: WIDTH, y: 1, z: DEPTH }]}
        />
      </RigidBody>
      <mesh geometry={geometry} material={material} receiveShadow />
    </group>
  );
}
