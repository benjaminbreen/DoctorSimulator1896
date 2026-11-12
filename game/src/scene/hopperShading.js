import * as THREE from 'three';

// Shader changes for Hopper mode, made to three's chunks at import, so every
// material picks them up. Imported first in main.jsx, before any material
// copies its uniforms or any program compiles. All values at zero leave the
// stock shading unchanged; Effects.jsx sets them for the game's scene render
// and the paint pass's mask pass zeroes them again, so other canvases and
// later renders in the frame are untouched.
//
// hopperSurface: x texture blur (mip bias), y bump flattening, z matte,
//   w figure marking (opaque skinned meshes write 0.5 into alpha).
// hopperFigure, for skinned meshes: x texture blur, y bump flattening,
//   z two-tone light split, w split softness.
//
// Shared typed arrays: material uniform clones keep the reference (see
// atmosphere.js).
export const hopperSurface = { value: new Float32Array(4) };
export const hopperFigure = { value: new Float32Array(4) };

for (const shader of Object.values(THREE.ShaderLib)) {
  if (!shader.fragmentShader?.includes('#include <opaque_fragment>')) continue;
  shader.uniforms.hopperSurface = hopperSurface;
  shader.uniforms.hopperFigure = hopperFigure;
}

function patch(name, from, to) {
  if (!THREE.ShaderChunk[name].includes(from)) throw new Error(`hopperShading: ${name} changed`);
  THREE.ShaderChunk[name] = THREE.ShaderChunk[name].replace(from, to);
}

// Fragment shaders cannot see skinning, so the vertex stage passes it on.
// The uv chunks always come in vertex/fragment pairs; begin_vertex does not
// (shadow and points shaders include it alone), hence the define guard.
THREE.ShaderChunk.uv_pars_vertex += '\n#define HOPPER_SHADING\nvarying float vFigure;\n';
THREE.ShaderChunk.uv_vertex += '\nvFigure = 0.0;\n';
patch('skinning_vertex', '#endif', '#ifdef HOPPER_SHADING\n\tvFigure = 1.0;\n#endif\n#endif');
THREE.ShaderChunk.uv_pars_fragment += `
#define HOPPER_SHADING
varying float vFigure;
uniform vec4 hopperSurface;
uniform vec4 hopperFigure;
`;

// Plain fields of colour: a blurrier mip for colour only. Alpha keeps the
// sharp sample so leaf and railing cutouts do not thin out or vanish.
patch('map_fragment', 'vec4 sampledDiffuseColor = texture2D( map, vMapUv );', `vec4 sampledDiffuseColor = texture2D( map, vMapUv );
	#ifdef HOPPER_SHADING
	float hopperBias = mix( hopperSurface.x, hopperFigure.x, vFigure );
	if ( hopperBias > 0.0 ) sampledDiffuseColor.rgb = texture2D( map, vMapUv, hopperBias ).rgb;
	#endif`);

patch('normal_fragment_maps', 'mapN.xy *= normalScale;', `mapN.xy *= normalScale;
	#ifdef HOPPER_SHADING
	mapN.xy *= 1.0 - mix( hopperSurface.y, hopperFigure.y, vFigure );
	#endif`);

// Last, after the roughness map has multiplied in.
THREE.ShaderChunk.roughnessmap_fragment += `
#ifdef HOPPER_SHADING
roughnessFactor = mix( roughnessFactor, 1.0, hopperSurface.z );
#endif
`;

// Figures: one clean split between the lit and the shaded side, as on a
// painted doll, with a little of the falloff kept across the lit side.
const SPLIT = `float dotNL = saturate( dot( geometryNormal, directLight.direction ) );
	#ifdef HOPPER_SHADING
	float hopperLit = smoothstep( 0.0, hopperFigure.w + 1e-3, dotNL ) * ( 0.75 + 0.25 * dotNL );
	dotNL = mix( dotNL, hopperLit, hopperFigure.z * vFigure );
	#endif`;
for (const name of ['lights_physical_pars_fragment', 'lights_lambert_pars_fragment', 'lights_phong_pars_fragment']) {
  patch(name, 'float dotNL = saturate( dot( geometryNormal, directLight.direction ) );', SPLIT);
}

THREE.ShaderChunk.opaque_fragment += `
#if defined( OPAQUE ) && defined( HOPPER_SHADING )
  if ( hopperSurface.w > 0.5 && vFigure > 0.5 ) gl_FragColor.a = 0.5;
#endif
`;
