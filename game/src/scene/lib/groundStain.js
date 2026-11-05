// Mud and street dirt splashed on the foot of an object, fading out `height`
// metres above `ground` (world y), patchy rather than a clean band. Mixes
// toward a mud colour, so it darkens stone and dulls black iron alike.

export function groundStain(material, { ground, height = 0.25, strength = 0.6, mud = [0.07, 0.055, 0.04] }) {
  const previous = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    previous?.(shader, renderer);
    shader.uniforms.uStainGround = { value: ground };
    shader.vertexShader = 'varying vec3 vStainWorld;\n' + shader.vertexShader.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
       vec4 stainPosition = vec4(transformed, 1.0);
       #ifdef USE_INSTANCING
         stainPosition = instanceMatrix * stainPosition;
       #endif
       vStainWorld = (modelMatrix * stainPosition).xyz;`,
    );
    shader.fragmentShader = 'varying vec3 vStainWorld;\nuniform float uStainGround;\n' + shader.fragmentShader.replace(
      '#include <map_fragment>',
      `#include <map_fragment>
       float stainRise = vStainWorld.y - uStainGround;
       float stainEdge = ${height.toFixed(3)} * (0.7 + 0.3 * sin(vStainWorld.x * 23.0 + vStainWorld.z * 17.0)
         * sin(vStainWorld.z * 31.0 - vStainWorld.x * 7.0));
       float stain = (1.0 - smoothstep(0.0, stainEdge, stainRise)) * ${strength.toFixed(3)};
       diffuseColor.rgb = mix(diffuseColor.rgb, vec3(${mud.map((value) => value.toFixed(3)).join(', ')}), stain);`,
    );
  };
  const key = material.customProgramCacheKey?.() ?? '';
  material.customProgramCacheKey = () => `${key}|ground-stain-${height}-${strength}`;
  material.needsUpdate = true;
  return material;
}
