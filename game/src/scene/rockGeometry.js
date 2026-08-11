// Craggy rock geometry and material, ported from Darwin's RockField
// (three-game/components/scene/ecology/RockField.jsx). Multi-frequency
// displacement over an icosahedron, flat shading, and a dust band at the
// ground contact are what make a rock read as rock instead of a blob.
import * as THREE from 'three';

export function makeCraggyRockGeometry(seed) {
  const geo = new THREE.IcosahedronGeometry(1, 3);
  const position = geo.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < position.count; i += 1) {
    v.fromBufferAttribute(position, i);
    const lobe = Math.sin(v.x * 3.1 + seed) * Math.cos(v.y * 2.7 + seed * 1.7) * Math.sin(v.z * 3.6 + seed * 0.6);
    const chip = Math.sin(v.x * 9.2 + v.z * 7.7 + seed * 3.1) * 0.06;
    v.normalize().multiplyScalar(1 + lobe * 0.22 + chip);
    position.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals();
  return geo;
}

// Boulder-scale variant: finer facets, horizontal shelves (schist reads as
// layered), and ridge creases, so big rocks stay craggy at close range.
export function makeHeroCraggyRockGeometry(seed) {
  const geo = new THREE.IcosahedronGeometry(1, 4);
  const position = geo.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < position.count; i += 1) {
    v.fromBufferAttribute(position, i);
    const lobe = Math.sin(v.x * 2.1 + seed) * Math.cos(v.y * 1.8 + seed * 1.7) * Math.sin(v.z * 2.4 + seed * 0.6);
    const shelf = Math.sin(v.y * 5.2 + seed * 2.3 + Math.sin(v.x * 2.6 + seed) * 1.8);
    const ridge = 1 - Math.abs(Math.sin(v.x * 4.6 + v.y * 3.4 + v.z * 3.9 + seed * 1.3));
    const chip = Math.sin(v.x * 11.4 + v.z * 9.2 + v.y * 7.7 + seed * 3.1) * 0.045;
    v.normalize().multiplyScalar(1 + lobe * 0.16 + shelf * 0.07 + ridge * ridge * 0.14 + chip);
    position.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals();
  return geo;
}

// Shared schist material: rock texture, flat shading, instance tints, and a
// soil band blended in near the base so rocks sit in the ground. `gain`
// lifts the dark rock albedo (avg 0.31) toward schist mid-grey.
export function makeSchistMaterial(colorMap, normalMap, { dustColor = '#7f7a60', dustStrength = 0.38, gain = 1.5 } = {}) {
  const material = new THREE.MeshStandardMaterial({
    map: colorMap,
    normalMap,
    normalScale: new THREE.Vector2(0.5, 0.5),
    roughness: 0.94,
    metalness: 0,
    flatShading: true,
  });
  material.color.setRGB(gain, gain, gain * 0.95);
  const dust = new THREE.Color(dustColor);
  material.onBeforeCompile = (shader) => {
    shader.uniforms.rockDustColor = { value: dust };
    shader.uniforms.rockDustStrength = { value: dustStrength };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying float vRockDust;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n  vRockDust = 1.0 - smoothstep(-0.92, -0.18, position.y);');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vRockDust;\nuniform vec3 rockDustColor;\nuniform float rockDustStrength;')
      .replace('#include <color_fragment>', '#include <color_fragment>\n  diffuseColor.rgb = mix(diffuseColor.rgb, rockDustColor, vRockDust * rockDustStrength);');
  };
  material.customProgramCacheKey = () => `schist-dust:${dustColor}:${dustStrength}`;
  return material;
}
