import * as THREE from 'three';
import { findBones } from '../../../../shared/characters/costumeShell.js';

export function createPatientSeat(root, scene) {
  const bones = findBones(root);
  const left = new THREE.Vector3(), right = new THREE.Vector3();
  const knee = new THREE.Vector3();
  const contact = { value: 0 };
  // ChairSmall2 at patient-chair-e. Leave room beyond its cushion corners
  // because each skirt triangle spans several centimetres between vertices.
  const seatInverse = { value: new THREE.Matrix4().makeRotationY(-Math.PI)
    .multiply(new THREE.Matrix4().makeTranslation(.45, 0, 1.7)) };
  const originalInverse = seatInverse.value.clone();
  const seatMatrix = seatInverse.value.clone().invert();
  const anchor = new THREE.Vector3();
  const rotation = new THREE.Euler();
  let chair = null;
  let cushionHeight = .65;
  const owned = [];
  const patch = material => {
    const previous = material.onBeforeCompile;
    const key = material.customProgramCacheKey.bind(material);
    material.onBeforeCompile = (shader, renderer) => {
      previous.call(material, shader, renderer);
      shader.uniforms.patientSeatContact = contact;
      shader.uniforms.patientSeatInverse = seatInverse;
      shader.vertexShader = 'uniform float patientSeatContact;\nuniform mat4 patientSeatInverse;\n' + shader.vertexShader;
      shader.vertexShader = shader.vertexShader.replace('#include <project_vertex>', `
        vec3 seatWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;
        vec3 seatPoint = (patientSeatInverse * vec4(seatWorld, 1.0)).xyz;
        vec2 seatOffset = seatPoint.xz - vec2(0.0, 0.11);
        vec2 seatEdge = vec2(0.35, 0.34) - abs(seatOffset);
        float cushionY = 0.665 - 0.75 * seatPoint.x * seatPoint.x;
        if (patientSeatContact > 0.0 && min(seatEdge.x, seatEdge.y) > 0.0) {
          vec2 outside = seatOffset;
          if (seatEdge.x < seatEdge.y) outside.x = seatOffset.x < 0.0 ? -0.35 : 0.35;
          else outside.y = seatOffset.y < 0.0 ? -0.34 : 0.34;
          float wrap = patientSeatContact * (1.0 - smoothstep(cushionY - 0.035, cushionY + 0.015, seatPoint.y));
          vec2 shift = (outside - seatOffset) * wrap;
          vec3 worldShift = transpose(mat3(patientSeatInverse)) * vec3(shift.x, 0.0, shift.y);
          transformed += inverse(mat3(modelMatrix)) * worldShift;
        }
        #include <project_vertex>`);
    };
    material.customProgramCacheKey = () => key() + '|patient-seat-v1';
    material.needsUpdate = true;
  };
  root.traverse(mesh => {
    if (!mesh.isMesh || !['Patient_SkirtSeated', 'Patient_ApronSeated'].includes(mesh.name)) return;
    for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) patch(material);
    // Match the cloth silhouette in the shadow passes as well as the colour pass.
    mesh.customDepthMaterial = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
    mesh.customDistanceMaterial = new THREE.MeshDistanceMaterial();
    for (const material of [mesh.customDepthMaterial, mesh.customDistanceMaterial]) { patch(material); owned.push(material); }
  });
  return {
    update(amount) {
      contact.value = amount;
      chair ||= scene?.getObjectByName('furniture:patient-chair-e');
      if (!chair) return;
      chair.updateWorldMatrix(true, false);
      seatMatrix.copy(chair.matrixWorld);
      seatInverse.value.copy(seatMatrix).invert();
      cushionHeight = anchor.set(0, .65, 0).applyMatrix4(seatMatrix).y;
    },
    anchor(group, placement) {
      anchor.fromArray(placement.position).applyMatrix4(originalInverse).applyMatrix4(seatMatrix);
      group.position.x = anchor.x;
      group.position.z = anchor.z;
      rotation.setFromRotationMatrix(seatMatrix, 'YXZ');
      group.rotation.y = placement.rotation[1] + rotation.y - Math.PI;
    },
    get cushionHeight() { return cushionHeight; },
    dispose() { for (const material of owned) material.dispose(); },
    height() {
      if (!bones.thighL || !bones.thighR || !bones.calfL) return null;
      bones.thighL.getWorldPosition(left);
      bones.thighR.getWorldPosition(right);
      bones.calfL.getWorldPosition(knee);
      // Estimate the underside from the hip width and thigh length, so body
      // size and imported model scale both affect the cushion contact height.
      const radius = Math.max(left.distanceTo(right) * 0.65, left.distanceTo(knee) * 0.27);
      return Math.min(left.y, right.y) - radius;
    },
  };
}
