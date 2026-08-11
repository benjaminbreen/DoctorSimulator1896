// Wind for instanced foliage. Trees and ground cover both draw through
// InstancedMesh, so the sway has to happen in the vertex shader: moving a
// thousand plants on the CPU would cost more than drawing them.
//
// Two things make it read as wind rather than a wobble. The bend rises with
// height above the piece's own base, so a leaf at the top of a tree travels
// and the trunk does not; and the phase is offset by each instance's world
// position, so a gust crosses the park instead of every plant moving as one.
//
// The shadow pass renders through a separate depth material, so that one has
// to be patched with the same displacement or the shadows stand still while
// the leaves move.

import * as THREE from 'three';

// One writer (SkyRig's frame loop) advances the clock; every patched material
// reads it. Strength is the tuning slider, in the same units as the amplitude.
export const windUniforms = {
  uWindTime: { value: 0 },
  uWindStrength: { value: 1 },
};

// `reference` is the piece's own height in metres: it normalises the bend so
// a 10m tree and a 0.4m tuft both reach full sway at their own tips.
// `amplitude` is how far that tip travels, as a fraction of the reference.
// `rootShade` below 1 darkens each piece toward its base, so a clump reads
// as rooted in its own shadow instead of a uniformly lit card.
function patch(material, { reference, amplitude, rootShade = 1 }) {
  const rooted = rootShade < 1;
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uWindTime = windUniforms.uWindTime;
    shader.uniforms.uWindStrength = windUniforms.uWindStrength;
    shader.uniforms.uWindReference = { value: Math.max(reference, 0.05) };
    shader.uniforms.uWindAmplitude = { value: amplitude };
    if (rooted) shader.uniforms.uWindRootShade = { value: rootShade };

    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
         uniform float uWindTime;
         uniform float uWindStrength;
         uniform float uWindReference;
         uniform float uWindAmplitude;
         ${rooted ? 'varying float vWindUp;' : ''}`,
      )
      // begin_vertex defines `transformed` in the model's own space, before
      // the instance matrix scales and places it. The converter puts every
      // piece's base at y=0, so transformed.y is height above the ground.
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
         {
           vec3 windOrigin = vec3(0.0);
           #ifdef USE_INSTANCING
             windOrigin = instanceMatrix[3].xyz;
           #endif
           float windUp = clamp(transformed.y / uWindReference, 0.0, 1.0);
           ${rooted ? 'vWindUp = windUp;' : ''}
           // Squared: the bend gathers toward the tip instead of shearing the
           // whole piece sideways.
           float windBend = windUp * windUp * uWindAmplitude * uWindReference * uWindStrength;
           float windPhase = uWindTime + windOrigin.x * 0.28 + windOrigin.z * 0.21;
           // Two frequencies, so gusts build and drop rather than metronome.
           float windGust = sin(windPhase) * 0.75 + sin(windPhase * 2.37 + 1.7) * 0.25;
           transformed.x += windGust * windBend;
           transformed.z += cos(windPhase * 0.83) * windBend * 0.55;
         }`,
      );

    // The depth material has no color_fragment, so this replace no-ops there
    // and the shadow pass stays unshaded, which is what it should be.
    if (rooted) {
      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          `#include <common>
           uniform float uWindRootShade;
           varying float vWindUp;`,
        )
        .replace(
          '#include <color_fragment>',
          `#include <color_fragment>
           diffuseColor.rgb *= mix(uWindRootShade, 1.0, smoothstep(0.0, 0.55, vWindUp));`,
        );
    }
  };
  // Without this three can hand the patched material a program compiled for
  // an unpatched one with the same feature set.
  material.customProgramCacheKey = () => (rooted ? 'foliage-wind-rooted' : 'foliage-wind');
  return material;
}

// Patch a material in place and return the matching depth material, which the
// caller assigns to the mesh so its shadow sways with it.
export function applyWind(material, options) {
  patch(material, options);
  const depth = new THREE.MeshDepthMaterial({
    depthPacking: THREE.RGBADepthPacking,
    map: material.map,
    alphaTest: material.alphaTest,
    alphaMap: material.alphaMap,
    side: material.side,
  });
  patch(depth, options);
  return depth;
}
