import { MathUtils, Quaternion, Vector3 } from 'three';

const shoulder = new Vector3();
const elbow = new Vector3();
const wrist = new Vector3();
const direction = new Vector3();
const bend = new Vector3();
const goal = new Vector3();
const elbowGoal = new Vector3();
const from = new Vector3();
const to = new Vector3();
const parentRotation = new Quaternion();
const turn = new Quaternion();
const palmRotation = new Quaternion();

function aimJoint(joint, fromDirection, toDirection) {
  joint.parent.getWorldQuaternion(parentRotation).invert();
  fromDirection.applyQuaternion(parentRotation).normalize();
  toDirection.applyQuaternion(parentRotation).normalize();
  joint.quaternion.premultiply(turn.setFromUnitVectors(fromDirection, toDirection));
  joint.updateWorldMatrix(false, true);
}

function grip(upper, lower, hand, target, weight) {
  upper.getWorldPosition(shoulder);
  lower.getWorldPosition(elbow);
  hand.getWorldPosition(wrist);
  hand.getWorldQuaternion(palmRotation);
  const upperLength = shoulder.distanceTo(elbow);
  const lowerLength = elbow.distanceTo(wrist);
  goal.copy(wrist).lerp(target, weight);
  direction.copy(goal).sub(shoulder);
  const distance = MathUtils.clamp(direction.length(), Math.abs(upperLength - lowerLength) + 0.01, upperLength + lowerLength - 0.01);
  direction.normalize();
  goal.copy(shoulder).addScaledVector(direction, distance);
  const along = (upperLength ** 2 - lowerLength ** 2 + distance ** 2) / (2 * distance);
  bend.copy(elbow).sub(shoulder);
  bend.addScaledVector(direction, -bend.dot(direction)).normalize();
  elbowGoal.copy(shoulder).addScaledVector(direction, along)
    .addScaledVector(bend, Math.sqrt(Math.max(0, upperLength ** 2 - along ** 2)));
  aimJoint(upper, from.copy(elbow).sub(shoulder), to.copy(elbowGoal).sub(shoulder));
  lower.getWorldPosition(elbow);
  hand.getWorldPosition(wrist);
  aimJoint(lower, from.copy(wrist).sub(elbow), to.copy(goal).sub(elbow));
  lower.getWorldQuaternion(parentRotation).invert();
  hand.quaternion.copy(parentRotation.multiply(palmRotation));
}

// The supporting hand keeps its target until the next rung. The other arm
// follows the captured reach and takes over as the body advances.
export function createLadderGrip(leftHand, rightHand) {
  const target = new Vector3();
  let step = null;
  return (traversal) => {
    if (!traversal || traversal.motion.item.type !== 'ladder') { step = null; return; }
    const ladder = traversal.motion.item;
    const phase = Math.max(0, (traversal.position[1] - ladder.low[1]) / ladder.rungSpacing);
    const index = Math.floor(phase);
    const left = index % 2 === 0;
    const hand = left ? leftHand : rightHand;
    if (!hand?.parent?.parent) return;
    if (index !== step) {
      step = index;
      hand.getWorldPosition(target);
      const rung = Math.round((target.y - ladder.rungBase) / ladder.rungSpacing);
      const [rungX, rungZ] = ladder.rungPosition;
      const sin = Math.sin(ladder.yaw);
      const cos = Math.cos(ladder.yaw);
      const side = (left ? -1 : 1) * (rung >= ladder.rungCount ? 0.34 : 0.21);
      target.x = rungX + side * cos + 0.045 * sin;
      target.z = rungZ - side * sin + 0.045 * cos;
      if (rung >= ladder.rungCount) {
        target.y = Math.min(target.y, ladder.top[1] + 0.82);
      } else {
        target.y = ladder.rungBase + Math.max(0, rung) * ladder.rungSpacing + 0.025;
      }
    }
    const weight = traversal.weight * MathUtils.smoothstep(Math.sin(Math.PI * (phase - index)), 0, 0.52);
    if (weight > 0.01) grip(hand.parent.parent, hand.parent, hand, target, weight);
  };
}
