import * as THREE from 'three';

// Builds the figure's bone hierarchy from body params. Joint heights use
// standard anthropometric fractions of stature. Returns bones by name, a
// bone-name → index map for skin weights, and bind-pose joint positions
// that the body/garment lofts are constructed around.

export function buildSkeleton(p) {
  const H = p.height;
  const sexF = p.sex === 'female';

  const hipY = 0.53 * H;
  const kneeY = 0.285 * H;
  const ankleY = 0.045 * H;
  const shoulderY = 0.818 * H;
  const neckY = 0.845 * H;
  const headY = 0.875 * H;

  const hipHalf = 0.048 * H * (sexF ? 1.06 : 1) * ((p.hips - 1) * 0.4 + 1);
  const shoulderHalf = 0.112 * H * p.shoulders * (sexF ? 0.92 : 1);
  const armUpper = 0.186 * H;
  const armFore = 0.146 * H;
  const handLen = 0.1 * H;

  const bones = {};
  const order = [];
  const make = (name, parent, x, y, z) => {
    const bone = new THREE.Bone();
    bone.name = name;
    order.push(name);
    bones[name] = bone;
    if (parent) {
      bones[parent].add(bone);
      const pw = joints[parent];
      bone.position.set(x - pw.x, y - pw.y, z - pw.z);
    } else {
      bone.position.set(x, y, z);
    }
    joints[name] = new THREE.Vector3(x, y, z);
    return bone;
  };
  const joints = {};

  make('Root', null, 0, hipY, 0);
  joints.Root = new THREE.Vector3(0, hipY, 0);
  make('Spine1', 'Root', 0, 0.60 * H, 0);
  make('Spine2', 'Spine1', 0, 0.675 * H, 0.004 * H);
  make('Chest', 'Spine2', 0, 0.74 * H, 0.002 * H);
  make('Neck', 'Chest', 0, neckY, -0.004 * H);
  make('Head', 'Neck', 0, headY, 0);
  make('Jaw', 'Head', 0, headY + 0.012 * H, 0.012 * H);
  make('BrowL', 'Head', 0.028 * H * p.headSize, headY + 0.062 * H, 0.055 * H);
  make('BrowR', 'Head', -0.028 * H * p.headSize, headY + 0.062 * H, 0.055 * H);
  make('EyeL', 'Head', 0.026 * H * p.headSize, headY + 0.049 * H, 0.052 * H);
  make('EyeR', 'Head', -0.026 * H * p.headSize, headY + 0.049 * H, 0.052 * H);
  make('LidL', 'Head', 0.026 * H * p.headSize, headY + 0.049 * H, 0.052 * H);
  make('LidR', 'Head', -0.026 * H * p.headSize, headY + 0.049 * H, 0.052 * H);

  // Arms bind in a slight A-pose: 10 degrees out, 4 forward. Sleeves are
  // lofted along these bind directions so coats hang naturally.
  for (const side of [1, -1]) {
    const S = side > 0 ? 'L' : 'R';
    const out = Math.sin(THREE.MathUtils.degToRad(10));
    const fwd = Math.sin(THREE.MathUtils.degToRad(4));
    const down = -Math.sqrt(1 - out * out - fwd * fwd);
    const dir = new THREE.Vector3(side * out, down, fwd);
    const sh = new THREE.Vector3(side * shoulderHalf, shoulderY, -0.01 * H);
    const el = sh.clone().addScaledVector(dir, armUpper);
    const wr = el.clone().addScaledVector(dir, armFore);
    const hd = wr.clone().addScaledVector(dir, handLen * 0.55).add(new THREE.Vector3(0, 0, 0.01 * H));
    make(`Clavicle${S}`, 'Chest', side * 0.02 * H, 0.8 * H, 0.01 * H);
    make(`UpperArm${S}`, `Clavicle${S}`, sh.x, sh.y, sh.z);
    make(`Forearm${S}`, `UpperArm${S}`, el.x, el.y, el.z);
    make(`Hand${S}`, `Forearm${S}`, wr.x, wr.y, wr.z);
    make(`HandEnd${S}`, `Hand${S}`, hd.x, hd.y, hd.z);
  }

  for (const side of [1, -1]) {
    const S = side > 0 ? 'L' : 'R';
    make(`Thigh${S}`, 'Root', side * hipHalf, hipY, 0);
    make(`Shin${S}`, `Thigh${S}`, side * hipHalf * 1.04, kneeY, 0.004 * H);
    make(`Foot${S}`, `Shin${S}`, side * hipHalf * 1.06, ankleY, -0.01 * H);
    make(`Toe${S}`, `Foot${S}`, side * hipHalf * 1.06, 0.012 * H, 0.115 * H);
  }

  // Skirt swing bones hang from the root; only dresses skin to them.
  make('SkirtF', 'Root', 0, hipY - 0.02 * H, 0.06 * H);
  make('SkirtB', 'Root', 0, hipY - 0.02 * H, -0.06 * H);
  make('SkirtL', 'Root', hipHalf * 1.5, hipY - 0.02 * H, 0);
  make('SkirtR', 'Root', -hipHalf * 1.5, hipY - 0.02 * H, 0);

  const boneList = order.map((name) => bones[name]);
  const index = {};
  order.forEach((name, i) => { index[name] = i; });

  return {
    bones, boneList, index, joints, order,
    measures: { hipY, kneeY, ankleY, shoulderY, neckY, headY, hipHalf, shoulderHalf, armUpper, armFore, handLen },
  };
}

// Call after the root bone is in the scene graph and world matrices are
// current; the Skeleton captures bind-pose inverses at that moment.
export function makeSkeletonBinding(rig) {
  return new THREE.Skeleton(rig.boneList);
}
