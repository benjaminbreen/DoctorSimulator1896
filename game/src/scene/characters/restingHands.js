import * as THREE from 'three';

const scratchQuat = new THREE.Quaternion();
const scratchQuatB = new THREE.Quaternion();
const scratchQuatC = new THREE.Quaternion();
const scratchQuatD = new THREE.Quaternion();
const scratchVecA = new THREE.Vector3();
const scratchVecB = new THREE.Vector3();
const scratchVecC = new THREE.Vector3();
function worldPositionOf(bone, out) {
  bone.updateWorldMatrix(true, false);
  return out.setFromMatrixPosition(bone.matrixWorld);
}
// Swing `bone` so its child points at a world target, blended toward the
// clip's pose by `weight`. World-space vectors throughout: no assumptions
// about any bone's local axes, which is what made joint-angle offsets fail.
export function aimBoneToward(bone, child, targetWorld, weight) {
  const rest = scratchQuatB.copy(bone.quaternion);
  const origin = worldPositionOf(bone, scratchVecA);
  const current = worldPositionOf(child, scratchVecB).sub(origin);
  const desired = scratchVecC.copy(targetWorld).sub(origin);
  if (current.lengthSq() < 1e-7 || desired.lengthSq() < 1e-7) return;
  current.normalize();
  desired.normalize();
  const worldQuat = bone.getWorldQuaternion(scratchQuatC);
  const delta = scratchQuat.setFromUnitVectors(current, desired);
  const desiredWorld = delta.multiply(worldQuat);
  const parentWorld = bone.parent.getWorldQuaternion(scratchQuatC);
  // Keep the target separate: slerpQuaternions copies its first argument
  // before reading the target, so aliasing it would cancel the swing.
  const aimed = scratchQuatD.copy(parentWorld.invert().multiply(desiredWorld));
  bone.quaternion.slerpQuaternions(rest, aimed, weight);
  bone.updateWorldMatrix(true, false);
}

// Keep only leg/hip triangles. Arms and hands can share the same mesh as
// trousers, so testing the whole body would make a hand land on itself.
function lapSurfaces(root) {
  const surfaces = [];
  root.traverse(mesh => {
    if (!mesh.isSkinnedMesh) return;
    const geometry = mesh.geometry;
    const joints = geometry.attributes.skinIndex, weights = geometry.attributes.skinWeight;
    if (!joints || !weights) return;
    const allowed = new Set(mesh.skeleton.bones.flatMap((bone, index) =>
      /^(hips|spine|leftupleg|rightupleg|leftleg|rightleg)$/.test(bone.name.toLowerCase().replace(/^mixamorig:?/, '')) ? [index] : []));
    if (!allowed.size) return;
    const legWeight = new Float32Array(joints.count);
    for (let i = 0; i < joints.count; i++) {
      for (let j = 0; j < 4; j++) if (allowed.has(joints.getComponent(i, j))) legWeight[i] += weights.getComponent(i, j);
    }
    const points = [], triangles = [], indices = new Map();
    const pointIndex = vertex => {
      if (!indices.has(vertex)) { indices.set(vertex, points.length); points.push({ vertex, world: new THREE.Vector3() }); }
      return indices.get(vertex);
    };
    const count = geometry.index?.count ?? joints.count;
    for (let i = 0; i < count; i += 3) {
      const a = geometry.index?.getX(i) ?? i, b = geometry.index?.getX(i + 1) ?? i + 1, c = geometry.index?.getX(i + 2) ?? i + 2;
      if (Math.min(legWeight[a], legWeight[b], legWeight[c]) < .6) continue;
      triangles.push([pointIndex(a), pointIndex(b), pointIndex(c)]);
    }
    if (triangles.length) surfaces.push({ mesh, points, triangles });
  });
  return surfaces;
}

function palmVertices(root, hand) {
  const points = [];
  root.traverse(mesh => {
    if (!mesh.isSkinnedMesh) return;
    const joint = mesh.skeleton.bones.indexOf(hand);
    const indices = mesh.geometry.attributes.skinIndex, weights = mesh.geometry.attributes.skinWeight;
    if (joint < 0 || !indices || !weights) return;
    for (let vertex = 0; vertex < indices.count; vertex++) {
      let influence = 0;
      for (let i = 0; i < 4; i++) if (indices.getComponent(vertex, i) === joint) influence += weights.getComponent(vertex, i);
      if (influence > .6) points.push({ mesh, vertex });
    }
  });
  return points;
}

export function createRestingHands(root, bones) {
  const surfaces = lapSurfaces(root);
  const arms = ['left', 'right'].flatMap(side => {
    const upper = bones[`${side}Arm`], lower = bones[`${side}ForeArm`];
    const hand = bones[`${side}Hand`], middle = bones[`${side}Middle`];
    return upper && lower && hand && middle ? [{ upper, lower, hand, middle,
      palm: palmVertices(root, hand), clearance: null,
      upperPose: new THREE.Quaternion(), lowerPose: new THREE.Quaternion(), handPose: new THREE.Quaternion() }] : [];
  });
  const shoulder = new THREE.Vector3(), elbow = new THREE.Vector3(), wrist = new THREE.Vector3();
  const knuckle = new THREE.Vector3(), direction = new THREE.Vector3(), bend = new THREE.Vector3();
  const target = new THREE.Vector3(), elbowTarget = new THREE.Vector3(), fingerTarget = new THREE.Vector3();
  const palmForward = new THREE.Vector3(), palmUp = new THREE.Vector3(), palmAcross = new THREE.Vector3(), palmPoint = new THREE.Vector3();
  const handWorld = new THREE.Quaternion(), parentWorld = new THREE.Quaternion();
  let weight = 0;
  const visible = mesh => {
    for (let node = mesh; node; node = node.parent) if (!node.visible) return false;
    return true;
  };
  const heightAt = (point, ceiling, floor) => {
    let height = -Infinity;
    for (const { mesh, points, triangles } of surfaces) {
      if (!visible(mesh)) continue;
      for (const [ia, ib, ic] of triangles) {
        const a = points[ia].world, b = points[ib].world, c = points[ic].world;
        const det = (b.z - c.z) * (a.x - c.x) + (c.x - b.x) * (a.z - c.z);
        if (Math.abs(det) < 1e-10) continue;
        const u = ((b.z - c.z) * (point.x - c.x) + (c.x - b.x) * (point.z - c.z)) / det;
        const v = ((c.z - a.z) * (point.x - c.x) + (a.x - c.x) * (point.z - c.z)) / det;
        if (u < 0 || v < 0 || u + v > 1) continue;
        const y = u * a.y + v * b.y + (1 - u - v) * c.y;
        if (y <= ceiling && y >= floor) height = Math.max(height, y);
      }
    }
    return Number.isFinite(height) ? height : null;
  };
  return {
    update(dt, active) {
      weight += ((active ? 1 : 0) - weight) * (1 - Math.exp(-dt * 9));
      // A new gesture owns the arms immediately; fading the contact target
      // through its first frames would pull an examination hand into the lap.
      if (!active || weight < .001 || !arms.length || !surfaces.length) return;
      root.updateWorldMatrix(true, true);
      for (const { mesh, points } of surfaces) {
        if (!visible(mesh)) continue;
        for (const point of points) {
          mesh.getVertexPosition(point.vertex, point.world);
          point.world.applyMatrix4(mesh.matrixWorld);
        }
      }
      for (const arm of arms) {
        const { upper, lower, hand, middle } = arm;
        upper.getWorldPosition(shoulder); lower.getWorldPosition(elbow);
        hand.getWorldPosition(wrist); middle.getWorldPosition(knuckle);
        const handLength = wrist.distanceTo(knuckle);
        if (arm.clearance === null) {
          palmForward.copy(knuckle).sub(wrist).normalize();
          palmUp.set(0, 1, 0).addScaledVector(palmForward, -palmForward.y).normalize();
          palmAcross.crossVectors(palmForward, palmUp);
          let bottom = 0, found = false;
          for (const { mesh, vertex } of arm.palm) {
            if (!visible(mesh)) continue;
            mesh.getVertexPosition(vertex, palmPoint); mesh.localToWorld(palmPoint); palmPoint.sub(wrist);
            const along = palmPoint.dot(palmForward) / handLength;
            if (along < .2 || along > .8 || Math.abs(palmPoint.dot(palmAcross)) > handLength * .25) continue;
            bottom = Math.min(bottom, palmPoint.dot(palmUp)); found = true;
          }
          // Bone centres sit at different depths inside each exported hand.
          // Measure the palm pad instead of imposing one clearance on every body.
          arm.clearance = found ? THREE.MathUtils.clamp(-bottom * palmUp.y + .002, handLength * .04, handLength * .24) : handLength * .18;
        }
        const clearance = arm.clearance;
        const surface = heightAt(wrist, wrist.y + handLength * .8, wrist.y - handLength * 2);
        if (surface === null) continue;
        target.copy(wrist); target.y = surface + clearance;
        const a = shoulder.distanceTo(elbow), b = elbow.distanceTo(wrist);
        arm.upperPose.copy(upper.quaternion); arm.lowerPose.copy(lower.quaternion); arm.handPose.copy(hand.quaternion);
        hand.getWorldQuaternion(handWorld);
        for (let pass = 0; pass < 3; pass++) {
          direction.copy(target).sub(shoulder);
          const distance = THREE.MathUtils.clamp(direction.length(), Math.abs(a - b) + .001, a + b - .001);
          direction.normalize();
          target.copy(shoulder).addScaledVector(direction, distance);
          bend.copy(elbow).sub(shoulder);
          bend.addScaledVector(direction, -bend.dot(direction));
          if (bend.lengthSq() < 1e-8) break;
          bend.normalize();
          const along = (a * a - b * b + distance * distance) / (2 * distance);
          elbowTarget.copy(shoulder).addScaledVector(direction, along)
            .addScaledVector(bend, Math.sqrt(Math.max(0, a * a - along * along)));
          aimBoneToward(upper, lower, elbowTarget, 1);
          aimBoneToward(lower, hand, target, 1);
          hand.quaternion.copy(hand.parent.getWorldQuaternion(parentWorld).invert().multiply(handWorld));
          hand.updateWorldMatrix(true, true);
          hand.getWorldPosition(wrist); middle.getWorldPosition(knuckle);
          const middleSurface = heightAt(knuckle, wrist.y + handLength * .8, wrist.y - handLength * 2);
          if (middleSurface !== null) {
            fingerTarget.copy(knuckle);
            fingerTarget.y = THREE.MathUtils.clamp(middleSurface + clearance,
              wrist.y - handLength * .55, wrist.y + handLength * .25);
            aimBoneToward(hand, middle, fingerTarget, 1);
          }
          // The lap can curve above the chord between wrist and knuckle.
          // Check the palm too before accepting the arm target.
          hand.getWorldPosition(wrist); middle.getWorldPosition(knuckle);
          fingerTarget.copy(wrist).lerp(knuckle, .6);
          const palmSurface = heightAt(fingerTarget, wrist.y + handLength * .8, wrist.y - handLength * 2);
          const lift = palmSurface === null ? 0 : palmSurface + clearance - fingerTarget.y;
          if (lift < .001) break;
          target.y += lift;
        }
        upper.quaternion.copy(arm.upperPose.slerp(upper.quaternion, weight));
        lower.quaternion.copy(arm.lowerPose.slerp(lower.quaternion, weight));
        hand.quaternion.copy(arm.handPose.slerp(hand.quaternion, weight));
        upper.updateWorldMatrix(true, true);
      }
    },
  };
}
