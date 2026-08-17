// Take the sub-texel casters out of the sun's shadow pass.
//
// The sun's shadow camera is a box around the player the width of the whole
// visible park, so one shadow-map texel is on the order of 10cm of ground. A
// 6mm railing spindle or a 3.5cm bottle lands inside a single texel: it cannot
// produce a shadow anyone can see, and pays a second draw call to try. Central
// Park was drawing ~1300 of these a frame.
//
// The test is world size against texel size rather than a fixed number, so it
// stays correct when the shadow distance or map size moves — and an interior,
// whose shadow camera is a room rather than a district, keeps its small
// shadows because there a teacup spans many texels.

import * as THREE from 'three';

// One texel of blur is invisible; two is where a shadow starts to read.
const MIN_TEXELS = 2;

const scratchScale = new THREE.Vector3();
const scratchPosition = new THREE.Vector3();
const scratchQuaternion = new THREE.Quaternion();

export function cullSubTexelShadowCasters(root, texelWorldSize) {
  if (!root || !(texelWorldSize > 0)) return 0;
  const minimum = texelWorldSize * MIN_TEXELS;
  let culled = 0;
  root.traverse((object) => {
    // Instanced batches are already one call for many pieces, and dropping one
    // would take a whole hedge's shadow with it.
    if (!object.isMesh || object.isInstancedMesh) return;
    // Remember what the scene asked for: a wider shadow box has a coarser
    // texel, a narrower one finer, and the decision has to be revisitable.
    if (object.userData.authoredCastShadow === undefined) {
      object.userData.authoredCastShadow = object.castShadow;
    }
    if (!object.userData.authoredCastShadow) return;
    const geometry = object.geometry;
    if (!geometry) return;
    if (!geometry.boundingSphere) geometry.computeBoundingSphere();
    const radius = geometry.boundingSphere?.radius;
    if (!(radius > 0)) return;
    object.matrixWorld.decompose(scratchPosition, scratchQuaternion, scratchScale);
    const diameter = radius * 2 * Math.max(scratchScale.x, scratchScale.y, scratchScale.z);
    const keep = diameter >= minimum;
    if (object.castShadow !== keep) object.castShadow = keep;
    if (!keep) culled += 1;
  });
  return culled;
}
