import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { useLoader } from '@react-three/fiber';
import { RigidBody, TrimeshCollider } from '@react-three/rapier';
import { GRAND_ARMY_APRON } from '../world/heroStreetLayout.js';
import { identifyLandmark } from '../world/landmarkInformation.js';
import { PARK_LANDMARKS } from '../world/parkLandmarks.js';
import { ROAD_TOP, STREET_SURFACES, WALK_TOP } from '../world/streetGrid.js';

const ROAD_TILE = 3.0;
const WALK_TILE = 3.3;
const PLAZA_TOP = WALK_TOP;
const EMPTY_HOLES = Object.freeze([]);

function configureTexture(texture, color = false) {
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = 8;
  if (color) texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function writeWorldUvs(geometry, tile, angle = 0) {
  const positions = geometry.attributes.position;
  const uvs = geometry.attributes.uv;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  for (let index = 0; index < positions.count; index += 1) {
    const x = positions.getX(index);
    const z = positions.getZ(index);
    uvs.setXY(index, (x * cos - z * sin) / tile, (x * sin + z * cos) / tile);
  }
  uvs.needsUpdate = true;
}

function surfaceGeometry(surface, y, tile) {
  const geometry = new THREE.PlaneGeometry(surface.sx, surface.sz);
  geometry.rotateX(-Math.PI / 2);
  geometry.translate(surface.x, y, surface.z);
  writeWorldUvs(geometry, tile, surface.axis === 'x' ? Math.PI / 2 : 0);
  return geometry;
}

function shapePath(points) {
  return points.map(([x, z]) => new THREE.Vector2(x, -z));
}

function shapeGeometry(points, holes, y, tile, angle = 0) {
  const shape = new THREE.Shape(shapePath(points));
  for (const hole of holes) shape.holes.push(new THREE.Path(shapePath(hole)));
  const geometry = new THREE.ShapeGeometry(shape);
  geometry.rotateX(-Math.PI / 2);
  if (typeof y === 'function') {
    const positions = geometry.attributes.position;
    for (let index = 0; index < positions.count; index += 1) {
      positions.setY(index, y(positions.getX(index), positions.getZ(index)));
    }
    positions.needsUpdate = true;
  } else {
    geometry.translate(0, y, 0);
  }
  writeWorldUvs(geometry, tile, angle);
  geometry.computeVertexNormals();
  return geometry;
}

function ringGeometry(outer, inner, y, tile, angle = 0) {
  if (outer.length !== inner.length) throw new Error('Paving rings need paired outlines');
  const positions = [];
  const indices = [];
  for (let index = 0; index < outer.length; index += 1) {
    const next = (index + 1) % outer.length;
    const base = positions.length / 3;
    positions.push(
      outer[index][0], y, outer[index][1],
      outer[next][0], y, outer[next][1],
      inner[next][0], y, inner[next][1],
      inner[index][0], y, inner[index][1],
    );
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array((positions.length / 3) * 2), 2));
  geometry.setIndex(indices);
  writeWorldUvs(geometry, tile, angle);
  geometry.computeVertexNormals();
  return geometry;
}

function sideGeometry(points, top, bottom, closed = true) {
  const positions = [];
  const indices = [];
  const edgeCount = closed ? points.length : points.length - 1;
  for (let edge = 0; edge < edgeCount; edge += 1) {
    const current = points[edge];
    const next = points[(edge + 1) % points.length];
    const base = positions.length / 3;
    positions.push(
      current[0], top, current[1],
      next[0], top, next[1],
      next[0], bottom, next[1],
      current[0], bottom, current[1],
    );
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function decorateMaterial(material, { axis, center = 0, width = 1, road = false, gutter = false }) {
  material.onBeforeCompile = (shader) => {
    shader.vertexShader =
      'varying vec3 vStreetWorldPosition;\n' +
      shader.vertexShader.replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\n  vStreetWorldPosition = (modelMatrix * vec4(transformed, 1.0)).xyz;',
      );

    const crossPosition = axis === 'x' ? 'vStreetWorldPosition.x' : 'vStreetWorldPosition.z';
    const wear = road
      ? `float streetLane = abs((${crossPosition} - ${center.toFixed(3)}) / ${Math.max(width, 0.1).toFixed(3)});
         float streetWear = exp(-pow((streetLane - 0.205) * 15.0, 2.0));`
      : 'float streetWear = 0.0;';
    const gutterDarken = gutter ? '0.82' : '1.0';

    shader.fragmentShader =
      'varying vec3 vStreetWorldPosition;\n' +
      shader.fragmentShader
        .replace(
          '#include <map_fragment>',
          `#include <map_fragment>
           float streetMacro = sin(vStreetWorldPosition.x * 0.071 + sin(vStreetWorldPosition.z * 0.043) * 2.1);
           streetMacro += sin(vStreetWorldPosition.z * 0.109 - vStreetWorldPosition.x * 0.037);
           streetMacro *= 0.5;
           float streetMottle = sin(vStreetWorldPosition.x * 0.31 + vStreetWorldPosition.z * 0.17);
           streetMottle *= sin(vStreetWorldPosition.z * 0.23 - vStreetWorldPosition.x * 0.11);
           ${wear}
           diffuseColor.rgb *= (${gutterDarken} + streetMacro * 0.035 + streetMottle * 0.018 - streetWear * 0.075);`,
        )
        .replace(
          '#include <roughnessmap_fragment>',
          '#include <roughnessmap_fragment>\n  roughnessFactor *= (1.0 - streetWear * 0.16);',
        );
  };
  material.customProgramCacheKey = () => [axis, center, width, road, gutter].join(':');
  return material;
}

function createMaterial(maps, type, surface = {}) {
  const sources = {
    road: maps.road,
    intersection: maps.intersection,
    gutter: maps.gutter,
    apron: maps.intersection,
    transition: maps.road,
    sidewalk: maps.walk,
    promenade: maps.walk,
  };
  const source = sources[type] ?? maps.walk;
  const colors = {
    road: '#e0ddd6',
    intersection: '#d8d5cf',
    gutter: '#bec2bf',
    apron: '#d2cec7',
    transition: '#ddd9d2',
    sidewalk: '#e1ddd6',
    promenade: '#ded9d1',
  };
  const material = new THREE.MeshStandardMaterial({
    map: source.color,
    normalMap: source.normal,
    roughnessMap: source.roughness,
    normalScale: new THREE.Vector2(type === 'sidewalk' || type === 'promenade' ? 0.56 : 0.74, type === 'sidewalk' || type === 'promenade' ? 0.56 : 0.74),
    color: colors[type] ?? colors.sidewalk,
    roughness: type === 'gutter' ? 0.97 : type === 'intersection' || type === 'apron' ? 0.84 : type === 'transition' ? 0.89 : 0.92,
  });
  return decorateMaterial(material, {
    axis: surface.axis,
    center: surface.roadCenter,
    width: surface.roadWidth,
    road: type === 'road',
    gutter: type === 'gutter',
  });
}

function StreetPlane({ surface, y, tile, material }) {
  const geometry = useMemo(() => surfaceGeometry(surface, y, tile), [surface, y, tile]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return <mesh geometry={geometry} material={material} receiveShadow />;
}

function ShapeSurface({ points, holes = EMPTY_HOLES, y, tile, angle = 0, material, collider = false, onClick }) {
  const geometry = useMemo(
    () => shapeGeometry(points, holes, y, tile, angle),
    [points, holes, y, tile, angle],
  );
  // Rapier requires triangle indices as Uint32 even when Three can fit this
  // small shape into a Uint16 buffer.
  const colliderIndices = useMemo(
    () => (geometry.index ? new Uint32Array(geometry.index.array) : null),
    [geometry],
  );
  useEffect(() => () => geometry.dispose(), [geometry]);
  return (
    <>
      <mesh geometry={geometry} material={material} receiveShadow onClick={onClick} />
      {collider && colliderIndices && (
        <TrimeshCollider args={[geometry.attributes.position.array, colliderIndices]} />
      )}
    </>
  );
}

function RingSurface({ outer, inner, y, tile, angle = 0, material, collider = false, onClick }) {
  const geometry = useMemo(
    () => ringGeometry(outer, inner, y, tile, angle),
    [outer, inner, y, tile, angle],
  );
  const colliderIndices = useMemo(() => new Uint32Array(geometry.index.array), [geometry]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return (
    <>
      <mesh geometry={geometry} material={material} receiveShadow onClick={onClick} />
      {collider && <TrimeshCollider args={[geometry.attributes.position.array, colliderIndices]} />}
    </>
  );
}

function mouthHeight(x, z) {
  const raw = THREE.MathUtils.clamp((x + z - 166) / 18, 0, 1);
  const eased = raw * raw * (3 - 2 * raw);
  return THREE.MathUtils.lerp(PLAZA_TOP + 0.006, ROAD_TOP + 0.01, eased);
}

function StoneFace({ points, top, bottom, material, closed = true }) {
  const geometry = useMemo(() => sideGeometry(points, top, bottom, closed), [points, top, bottom, closed]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return <mesh geometry={geometry} material={material} castShadow receiveShadow />;
}

function Curb({ curb, material }) {
  const height = WALK_TOP - ROAD_TOP;
  return (
    <mesh position={[curb.x, ROAD_TOP + height / 2, curb.z]} material={material} castShadow receiveShadow>
      <boxGeometry args={[curb.sx, height, curb.sz]} />
    </mesh>
  );
}

export default function StreetSurfaces() {
  const identifyFifthAvenuePlaza = (event) => identifyLandmark(
    PARK_LANDMARKS.fifthAvenuePlaza,
    event,
  );
  const textures = useLoader(THREE.TextureLoader, [
    '/textures/street/carriage-setts_col.webp',
    '/textures/street/carriage-setts_nrm.webp',
    '/textures/street/carriage-setts_rough.webp',
    '/textures/street/intersection-setts_col.webp',
    '/textures/street/intersection-setts_nrm.webp',
    '/textures/street/intersection-setts_rough.webp',
    '/textures/street/sidewalk-flags_col.webp',
    '/textures/street/sidewalk-flags_nrm.webp',
    '/textures/street/sidewalk-flags_rough.webp',
    '/textures/street/gutter-stones_col.webp',
    '/textures/street/gutter-stones_nrm.webp',
    '/textures/street/gutter-stones_rough.webp',
  ]);
  const maps = useMemo(() => ({
    road: {
      color: configureTexture(textures[0], true),
      normal: configureTexture(textures[1]),
      roughness: configureTexture(textures[2]),
    },
    intersection: {
      color: configureTexture(textures[3], true),
      normal: configureTexture(textures[4]),
      roughness: configureTexture(textures[5]),
    },
    walk: {
      color: configureTexture(textures[6], true),
      normal: configureTexture(textures[7]),
      roughness: configureTexture(textures[8]),
    },
    gutter: {
      color: configureTexture(textures[9], true),
      normal: configureTexture(textures[10]),
      roughness: configureTexture(textures[11]),
    },
  }), [textures]);

  const materials = useMemo(() => {
    const byRoad = new Map();
    for (const surface of STREET_SURFACES.roads) {
      if (!byRoad.has(surface.roadId)) byRoad.set(surface.roadId, createMaterial(maps, 'road', surface));
    }
    return {
      byRoad,
      intersection: createMaterial(maps, 'intersection', { axis: 'z' }),
      sidewalk: createMaterial(maps, 'sidewalk', { axis: 'z' }),
      promenade: createMaterial(maps, 'promenade', { axis: 'z' }),
      apron: createMaterial(maps, 'apron', { axis: 'z' }),
      transition: createMaterial(maps, 'transition', { axis: 'z' }),
      gutterHorizontal: createMaterial(maps, 'gutter', { axis: 'z' }),
      gutterVertical: createMaterial(maps, 'gutter', { axis: 'x' }),
      curb: new THREE.MeshStandardMaterial({ color: '#7b7972', roughness: 0.88 }),
      edge: new THREE.MeshStandardMaterial({ color: '#696a66', roughness: 0.9 }),
    };
  }, [maps]);

  useEffect(() => () => {
    for (const material of materials.byRoad.values()) material.dispose();
    for (const key of ['intersection', 'sidewalk', 'promenade', 'apron', 'transition', 'gutterHorizontal', 'gutterVertical', 'curb', 'edge']) {
      materials[key].dispose();
    }
  }, [materials]);

  return (
    <RigidBody type="fixed" colliders={false}>
      {STREET_SURFACES.roads.map((surface) => (
        <StreetPlane
          key={surface.id}
          surface={surface}
          y={ROAD_TOP + 0.002}
          tile={ROAD_TILE}
          material={materials.byRoad.get(surface.roadId)}
        />
      ))}
      {STREET_SURFACES.intersections.map((surface) => (
        <StreetPlane
          key={surface.id}
          surface={surface}
          y={ROAD_TOP + 0.002}
          tile={ROAD_TILE}
          material={materials.intersection}
        />
      ))}
      {STREET_SURFACES.sidewalks.map((surface) => (
        <StreetPlane
          key={surface.id}
          surface={surface}
          y={WALK_TOP + 0.002}
          tile={WALK_TILE}
          material={materials.sidewalk}
        />
      ))}
      {STREET_SURFACES.gutters.map((surface) => (
        <StreetPlane
          key={surface.id}
          surface={surface}
          y={ROAD_TOP + 0.004}
          tile={ROAD_TILE}
          material={surface.axis === 'x' ? materials.gutterVertical : materials.gutterHorizontal}
        />
      ))}
      {STREET_SURFACES.curbs.map((curb) => <Curb key={curb.id} curb={curb} material={materials.curb} />)}

      {STREET_SURFACES.corners.map((corner) => (
        <ShapeSurface
          key={`${corner.id}-road`}
          points={corner.road}
          y={ROAD_TOP + 0.003}
          tile={ROAD_TILE}
          material={materials.intersection}
          collider
        />
      ))}
      {STREET_SURFACES.corners.map((corner) => (
        <ShapeSurface
          key={`${corner.id}-walk`}
          points={corner.sidewalk}
          y={WALK_TOP + 0.003}
          tile={WALK_TILE}
          material={materials.sidewalk}
          collider
        />
      ))}
      {STREET_SURFACES.corners.map((corner) => (
        <ShapeSurface
          key={`${corner.id}-gutter`}
          points={corner.gutter}
          y={ROAD_TOP + 0.006}
          tile={ROAD_TILE}
          material={materials.gutterHorizontal}
        />
      ))}
      {STREET_SURFACES.corners.map((corner) => (
        <ShapeSurface
          key={`${corner.id}-curb-top`}
          points={corner.curb}
          y={WALK_TOP + 0.006}
          tile={WALK_TILE}
          material={materials.curb}
        />
      ))}
      {STREET_SURFACES.corners.map((corner) => (
        <StoneFace
          key={`${corner.id}-curb-face`}
          points={corner.sidewalk.slice(1)}
          top={WALK_TOP}
          bottom={ROAD_TOP}
          closed={false}
          material={materials.curb}
        />
      ))}

      <RingSurface
        outer={GRAND_ARMY_APRON.outer}
        inner={GRAND_ARMY_APRON.inner}
        y={PLAZA_TOP + 0.003}
        tile={WALK_TILE}
        material={materials.promenade}
        collider
        onClick={identifyFifthAvenuePlaza}
      />
      <ShapeSurface
        points={GRAND_ARMY_APRON.inner}
        y={PLAZA_TOP + 0.004}
        tile={ROAD_TILE}
        angle={-0.24}
        material={materials.apron}
        collider
        onClick={identifyFifthAvenuePlaza}
      />
      <ShapeSurface
        points={GRAND_ARMY_APRON.driveThroat}
        y={PLAZA_TOP + 0.006}
        tile={ROAD_TILE}
        angle={-0.36}
        material={materials.transition}
        collider
        onClick={identifyFifthAvenuePlaza}
      />
      <ShapeSurface
        points={GRAND_ARMY_APRON.streetMouth}
        y={mouthHeight}
        tile={ROAD_TILE}
        angle={-0.72}
        material={materials.transition}
        collider
        onClick={identifyFifthAvenuePlaza}
      />
      <RingSurface
        outer={GRAND_ARMY_APRON.outer}
        inner={GRAND_ARMY_APRON.edgeInner}
        y={PLAZA_TOP + 0.01}
        tile={WALK_TILE}
        material={materials.edge}
        onClick={identifyFifthAvenuePlaza}
      />
      <StoneFace
        points={GRAND_ARMY_APRON.outer}
        top={PLAZA_TOP + 0.008}
        bottom={PLAZA_TOP - 0.1}
        material={materials.edge}
      />
    </RigidBody>
  );
}
