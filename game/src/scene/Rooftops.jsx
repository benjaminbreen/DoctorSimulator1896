// Roof dressing for the street buildings: chimney stacks with clay pots,
// wooden water tanks, stair bulkheads and skylights. Each part is one
// instanced mesh, so the whole roofscape costs about a dozen draw calls.

import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { instanced } from './lib/instances.js';
import { rooftops } from '../world/rooftops.js';

// Unit geometry sitting on y = 0, so an instance scale of `height` puts its
// top at roof + height and the shaders can read local height as 0..1.
function onGround(geometry) {
  geometry.translate(0, 0.5, 0);
  return geometry;
}

// Shared shader additions. `vRoofLocal` is the unscaled local position, so
// soot and hoops land at the same fraction of every instance. Brick and
// stave lines fade out by screen size with fwidth, or they shimmer far off.
function roofShader(material, key, fragment) {
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = 'varying vec3 vRoofLocal;\nvarying vec3 vRoofWorld;\nvarying vec3 vRoofNormal;\n' + shader.vertexShader.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
       vRoofLocal = position;
       vec4 roofWorld = vec4(transformed, 1.0);
       #ifdef USE_INSTANCING
         roofWorld = instanceMatrix * roofWorld;
       #endif
       vRoofWorld = (modelMatrix * roofWorld).xyz;
       vRoofNormal = objectNormal;
       #ifdef USE_INSTANCING
         vRoofNormal = mat3(instanceMatrix) * vRoofNormal;
       #endif`,
    );
    shader.fragmentShader = 'varying vec3 vRoofLocal;\nvarying vec3 vRoofWorld;\nvarying vec3 vRoofNormal;\n' + shader.fragmentShader.replace(
      '#include <map_fragment>',
      `#include <map_fragment>\n${fragment}`,
    );
  };
  material.customProgramCacheKey = () => key;
  return material;
}

function brickMaterial() {
  return roofShader(new THREE.MeshStandardMaterial({ roughness: 0.95 }), 'roof-brick-v1', `
    // Running bond from world position; the face picks which horizontal axis.
    float along = abs(vRoofNormal.x) > abs(vRoofNormal.z) ? vRoofWorld.z : vRoofWorld.x;
    float course = vRoofWorld.y / 0.075;
    float row = floor(course);
    float joint = fract(along / 0.23 + mod(row, 2.0) * 0.5);
    float bed = fract(course);
    float lineWidth = max(fwidth(course), fwidth(along / 0.23));
    float mortar = max(1.0 - smoothstep(0.0, 0.12, bed), 1.0 - smoothstep(0.0, 0.06, joint));
    mortar *= 1.0 - smoothstep(0.2, 0.5, lineWidth);
    float tone = fract(sin(dot(vec2(row, floor(along / 0.23 + mod(row, 2.0) * 0.5)), vec2(12.9898, 78.233))) * 43758.5453);
    diffuseColor.rgb *= 0.88 + tone * 0.22;
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.42, 0.40, 0.36), mortar * 0.55);
    // Soot climbs from the cap down; caps are short boxes so they read black.
    float soot = smoothstep(0.55, 1.0, vRoofLocal.y);
    diffuseColor.rgb *= 1.0 - soot * 0.55;`);
}

function tankMaterial() {
  return roofShader(new THREE.MeshStandardMaterial({ roughness: 0.9 }), 'roof-tank-v1', `
    float angle = atan(vRoofLocal.z, vRoofLocal.x) / 6.2832 * 40.0;
    float stave = fract(angle);
    float staveLine = (1.0 - smoothstep(0.0, 0.08, stave)) * (1.0 - smoothstep(0.3, 0.6, fwidth(angle)));
    float hoopY = vRoofLocal.y;
    float hoop = 0.0;
    for (int i = 1; i < 5; i++) {
      hoop = max(hoop, 1.0 - smoothstep(0.012, 0.022, abs(hoopY - float(i) * 0.2)));
    }
    float staveTone = fract(sin(floor(angle) * 91.7) * 4375.85);
    diffuseColor.rgb *= 0.85 + staveTone * 0.25 - staveLine * 0.3;
    // Water staining darkens the lower staves, then the iron hoops on top.
    diffuseColor.rgb *= 1.0 - (1.0 - smoothstep(0.0, 0.45, hoopY)) * 0.3;
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.09, 0.08, 0.075), hoop);`);
}

function plainMaterial() {
  return new THREE.MeshStandardMaterial({ roughness: 0.92 });
}

function tint(hex, jitter) {
  const color = new THREE.Color(hex);
  const scale = 1 + jitter;
  return [color.r * scale, color.g * scale, color.b * scale];
}

const BRICKS = ['#6e4234', '#7a4b3a', '#633d33', '#5e4a40', '#81553f'];

export default function Rooftops({ items }) {
  const group = useMemo(() => {
    const { stacks, pots, tanks, bulkheads, skylights } = rooftops(items);
    const root = new THREE.Group();
    const add = (mesh, name) => {
      mesh.name = name;
      root.add(mesh);
    };
    const jitter = (index, salt) => (Math.sin(index * 12.9898 + salt) * 0.5) * 0.18;

    const brick = brickMaterial();
    add(instanced(onGround(new THREE.BoxGeometry(1, 1, 1)), brick, stacks.map((stack, index) => ({
      p: [stack.x, stack.y, stack.z],
      r: [0, stack.yaw, 0],
      s: [stack.width, stack.height, stack.length],
      color: tint(BRICKS[index % BRICKS.length], jitter(index, 1)),
    }))), 'roof-chimney-stacks');
    // Corbelled cap: a projecting course one brick proud of the shaft.
    add(instanced(onGround(new THREE.BoxGeometry(1, 1, 1)), brick, stacks.map((stack, index) => ({
      p: [stack.x, stack.y + stack.height - 0.16, stack.z],
      r: [0, stack.yaw, 0],
      s: [stack.width + 0.14, 0.16, stack.length + 0.14],
      color: tint(BRICKS[index % BRICKS.length], -0.25),
    })), { cast: false }), 'roof-chimney-caps');

    add(instanced(
      onGround(new THREE.CylinderGeometry(0.75, 1, 1, 7, 1, true)),
      Object.assign(plainMaterial(), { side: THREE.DoubleSide }),
      pots.map((pot, index) => ({
        p: [pot.x, pot.y - 0.12, pot.z],
        s: [pot.radius, pot.height, pot.radius],
        color: tint(index % 5 === 0 ? '#5a4c42' : '#7a4a35', jitter(index, 2) - 0.1),
      })),
      { cast: false },
    ), 'roof-chimney-pots');

    add(instanced(onGround(new THREE.CylinderGeometry(1, 1, 1, 14)), tankMaterial(), tanks.map((tank, index) => ({
      p: [tank.x, tank.y + tank.legs, tank.z],
      s: [tank.radius, tank.height, tank.radius],
      color: tint('#7b6a55', jitter(index, 3)),
    }))), 'roof-water-tanks');
    add(instanced(onGround(new THREE.ConeGeometry(1, 1, 14)), plainMaterial(), tanks.map((tank) => ({
      p: [tank.x, tank.y + tank.legs + tank.height, tank.z],
      s: [tank.radius * 1.06, tank.radius * 0.45, tank.radius * 1.06],
      color: tint('#4c4842', 0),
    })), { cast: false }), 'roof-tank-lids');
    // Four timber legs and the beam platform the tank sits on.
    const legs = [];
    const decks = [];
    for (const tank of tanks) {
      const reach = tank.radius * 0.72;
      for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        legs.push({ p: [tank.x + dx * reach, tank.y, tank.z + dz * reach], s: [0.24, tank.legs, 0.24], color: tint('#4a3d31', 0) });
      }
      decks.push({ p: [tank.x, tank.y + tank.legs - 0.25, tank.z], s: [tank.radius * 2, 0.25, tank.radius * 2], color: tint('#3f362d', 0) });
    }
    add(instanced(onGround(new THREE.BoxGeometry(1, 1, 1)), plainMaterial(), legs), 'roof-tank-legs');
    add(instanced(onGround(new THREE.BoxGeometry(1, 1, 1)), plainMaterial(), decks, { cast: false }), 'roof-tank-decks');

    // Bulkhead: stuccoed box, tar-paper roof, a dark door toward the front.
    add(instanced(onGround(new THREE.BoxGeometry(1, 1, 1)), plainMaterial(), bulkheads.map((head, index) => ({
      p: [head.x, head.y, head.z],
      r: [0, head.yaw, 0],
      s: [head.width, head.height, head.length],
      color: tint('#7c766b', jitter(index, 4)),
    }))), 'roof-bulkheads');
    add(instanced(onGround(new THREE.BoxGeometry(1, 1, 1)), plainMaterial(), bulkheads.map((head) => ({
      p: [head.x, head.y + head.height, head.z],
      r: [0, head.yaw, 0],
      s: [head.width + 0.2, 0.12, head.length + 0.2],
      color: tint('#2e2c2a', 0),
    })), { cast: false }), 'roof-bulkhead-tops');
    add(instanced(onGround(new THREE.BoxGeometry(1, 1, 1)), plainMaterial(), bulkheads.map((head) => {
      const yaw = head.yaw;
      // Front face of the box: local +z after the yaw.
      const offset = head.length / 2 + 0.02;
      return {
        p: [head.x + Math.sin(yaw) * offset, head.y, head.z + Math.cos(yaw) * offset],
        r: [0, yaw, 0],
        s: [0.85, 1.95, 0.05],
        color: tint('#3a2c22', 0),
      };
    }), { cast: false }), 'roof-bulkhead-doors');

    // Skylight: a low curb with a pitched glass top.
    add(instanced(onGround(new THREE.BoxGeometry(1, 1, 1)), plainMaterial(), skylights.map((light) => ({
      p: [light.x, light.y, light.z],
      r: [0, light.yaw, 0],
      s: [light.width, 0.35, light.length],
      color: tint('#4b4640', 0),
    })), { cast: false }), 'roof-skylight-curbs');
    const glass = new THREE.MeshStandardMaterial({ roughness: 0.25, metalness: 0.35 });
    add(instanced(
      new THREE.CylinderGeometry(0.5, 0.5, 1, 3, 1).rotateX(-Math.PI / 2).translate(0, 0.25, 0),
      glass,
      skylights.map((light) => ({
        p: [light.x, light.y + 0.35, light.z],
        r: [0, light.yaw, 0],
        s: [light.width * 1.15, 0.7, light.length],
        color: tint('#56636a', 0),
      })),
      { cast: false },
    ), 'roof-skylight-glass');
    return root;
  }, [items]);

  useEffect(() => () => {
    group.traverse((child) => {
      child.geometry?.dispose();
      child.material?.dispose();
    });
  }, [group]);

  return <primitive object={group} />;
}
