import * as THREE from 'three';
import { buildLoft, chainWeights, makeSkinnedMesh, smoothstep } from './surfaces.js';

// Body measurement profiles. Garments loft over these same sections with
// ease added, so tailoring follows the figure automatically. All values are
// fractions of stature, tuned visually against 1890s photographs.

export function bodyScale(p) {
  return {
    s: p.height,
    wide: 1 + (p.build - 0.5) * 0.26,
    limb: 1 + (p.build - 0.5) * 0.18,
    belly: Math.max(0, p.build - 0.45) * (p.sex === 'male' ? 1.1 : 0.55),
  };
}

// Torso cross-sections from seat to over-shoulder. ease widens everything,
// easeY trims the vertical range: garments reuse this with their own bounds.
export function torsoSections(p, ease = 0) {
  const { s, wide, belly } = bodyScale(p);
  const f = p.sex === 'female';
  const w = (v) => (v * wide + ease) * s;
  const shoulders = p.shoulders;
  const bust = f ? 0.012 : 0;
  const waistF = p.waist * (f ? 0.86 : 1);
  const rows = [
    { y: 0.47, rx: 0.092 * p.hips, rzF: 0.060, rzB: 0.072 * p.hips, n: 2.3 },
    { y: 0.53, rx: 0.097 * p.hips, rzF: 0.063 + belly * 0.03, rzB: 0.074 * p.hips, n: 2.3 },
    { y: 0.60, rx: (f ? 0.074 : 0.086) * waistF, rzF: (0.057 + belly * 0.055) * waistF, rzB: 0.058, n: 2.35 },
    { y: 0.66, rx: f ? 0.082 : 0.091, rzF: 0.062 + belly * 0.035 + bust * 0.5, rzB: 0.060, n: 2.4 },
    { y: 0.715, rx: f ? 0.087 : 0.098, rzF: (f ? 0.072 : 0.068) + bust, rzB: 0.063, n: 2.4 },
    { y: 0.765, rx: (f ? 0.099 : 0.112) * shoulders, rzF: 0.062, rzB: 0.062, n: 2.5 },
    { y: 0.800, rx: (f ? 0.110 : 0.124) * shoulders, rzF: 0.056, rzB: 0.059, n: 2.55 },
    { y: 0.818, rx: 0.104 * shoulders, rzF: 0.051, rzB: 0.054, n: 2.4 },
    { y: 0.836, rx: 0.066 * shoulders, rzF: 0.044, rzB: 0.048, n: 2.2 },
  ];
  return rows.map((r) => ({
    pos: new THREE.Vector3(0, r.y * s, 0),
    rx: w(r.rx), rzF: w(r.rzF), rzB: w(r.rzB), n: r.n,
  }));
}

export function torsoWeights(p, rig) {
  const s = p.height;
  return (t, phi, pos) => {
    const y = pos.y / s;
    const spans = [
      { bone: rig.index.Root, to: 0.575 },
      { bone: rig.index.Spine1, to: 0.65 },
      { bone: rig.index.Spine2, to: 0.72 },
      { bone: rig.index.Chest, to: 10 },
    ];
    let i = 0;
    while (i < spans.length - 1 && y > spans[i].to) i += 1;
    const pairs = [[spans[i].bone, 1]];
    const blend = 0.035;
    if (i < spans.length - 1) {
      const wNext = smoothstep(spans[i].to - blend, spans[i].to + blend, y);
      if (wNext > 0) { pairs[0][1] = 1 - wNext; pairs.push([spans[i + 1].bone, wNext]); }
    }
    if (i > 0) {
      const wPrev = 1 - smoothstep(spans[i - 1].to - blend, spans[i - 1].to + blend, y);
      if (wPrev > 0) { pairs[0][1] -= wPrev; pairs.push([spans[i - 1].bone, wPrev]); }
    }
    return pairs;
  };
}

// Arm loft sections along the bind-pose arm axis, shoulder to wrist.
export function armSections(p, rig, side, ease = 0, puff = null) {
  const { s, limb } = bodyScale(p);
  const S = side > 0 ? 'L' : 'R';
  const sh = rig.joints[`UpperArm${S}`];
  const el = rig.joints[`Forearm${S}`];
  const wr = rig.joints[`Hand${S}`];
  const radii = [
    { t: 0, r: 0.030 }, { t: 0.12, r: 0.028 }, { t: 0.28, r: 0.026 },
    { t: 0.45, r: 0.0235 }, { t: 0.56, r: 0.021 },
    { t: 0.75, r: 0.023 }, { t: 1, r: 0.015 },
  ];
  return radii.map(({ t, r }) => {
    const pos = new THREE.Vector3();
    if (t <= 0.56) pos.lerpVectors(sh, el, t / 0.56);
    else pos.lerpVectors(el, wr, (t - 0.56) / 0.44);
    let radius = (r * limb + ease) * s;
    if (puff) radius *= puff(t);
    return { pos, rx: radius, rzF: radius, rzB: radius, n: 2.05 };
  });
}

// Weights from projection onto the arm axis: loft rings are not evenly
// spaced, so the loft parameter cannot locate the elbow.
export function armWeights(rig, side) {
  const S = side > 0 ? 'L' : 'R';
  const sh = rig.joints[`UpperArm${S}`];
  const wr = rig.joints[`Hand${S}`];
  const el = rig.joints[`Forearm${S}`];
  const axis = wr.clone().sub(sh).normalize();
  const elbowD = el.clone().sub(sh).dot(axis);
  const total = wr.clone().sub(sh).dot(axis);
  const iUpper = rig.index[`UpperArm${S}`];
  const iFore = rig.index[`Forearm${S}`];
  return (t, phi, pos) => {
    const d = pos.clone().sub(sh).dot(axis);
    const w = smoothstep(elbowD - total * 0.07, elbowD + total * 0.07, d);
    if (w <= 0) return [[iUpper, 1]];
    if (w >= 1) return [[iFore, 1]];
    return [[iUpper, 1 - w], [iFore, w]];
  };
}

export function legSections(p, rig, side, ease = 0, topY = null, bottomY = null) {
  const { s, limb } = bodyScale(p);
  const S = side > 0 ? 'L' : 'R';
  const hip = rig.joints[`Thigh${S}`];
  const knee = rig.joints[`Shin${S}`];
  const ankle = rig.joints[`Foot${S}`];
  const rows = [
    { t: 0, r: 0.050, n: 2.2 }, { t: 0.25, r: 0.045, n: 2.1 }, { t: 0.5, r: 0.034, n: 2 },
    { t: 0.68, r: 0.036, n: 2 }, { t: 0.9, r: 0.024, n: 2 }, { t: 1, r: 0.022, n: 2 },
  ];
  const top = topY === null ? hip.y : topY;
  const bottom = bottomY === null ? ankle.y : bottomY;
  return rows.map(({ t, r, n }) => {
    const y = top + (bottom - top) * t;
    const kneeT = (hip.y - knee.y) / (hip.y - ankle.y);
    const frac = (hip.y - y) / (hip.y - ankle.y);
    const pos = new THREE.Vector3();
    if (frac <= kneeT) pos.lerpVectors(hip, knee, frac / kneeT);
    else pos.lerpVectors(knee, ankle, (frac - kneeT) / (1 - kneeT));
    pos.y = y;
    const radius = (r * limb + ease) * s;
    return { pos, rx: radius, rzF: radius, rzB: radius, n };
  });
}

export function legWeights(p, rig, side, topY, bottomY) {
  const S = side > 0 ? 'L' : 'R';
  const hipY = rig.joints[`Thigh${S}`].y;
  const kneeY = rig.joints[`Shin${S}`].y;
  const blend = 0.05 * p.height;
  const iRoot = rig.index.Root;
  const iThigh = rig.index[`Thigh${S}`];
  const iShin = rig.index[`Shin${S}`];
  return (t, phi, pos) => {
    const y = pos.y;
    const toThigh = smoothstep(hipY + blend, hipY - blend, y);
    const toShin = smoothstep(kneeY + blend, kneeY - blend, y);
    if (toThigh <= 0) return [[iRoot, 1]];
    if (toShin >= 1) return [[iShin, 1]];
    if (toThigh < 1) return [[iRoot, 1 - toThigh], [iThigh, toThigh]];
    return [[iThigh, 1 - toShin], [iShin, toShin]];
  };
}

export function buildNeck(p, rig, skeleton, material) {
  const { s } = bodyScale(p);
  const f = p.sex === 'female';
  // the neck sits back and slims toward the top so the jaw steps forward of
  // it in profile instead of blending into one cylinder
  const r = (f ? 0.027 : 0.030) * s;
  const geometry = buildLoft({
    sections: [
      { pos: new THREE.Vector3(0, 0.812 * s, -0.008 * s), rx: r * 1.35, rzF: r * 1.3, rzB: r * 1.35, n: 2.2 },
      { pos: new THREE.Vector3(0, 0.835 * s, -0.009 * s), rx: r * 1.08, rzF: r, rzB: r * 1.15, n: 2.1 },
      { pos: new THREE.Vector3(0, 0.860 * s, -0.008 * s), rx: r * 0.98, rzF: r * 0.92, rzB: r * 1.1, n: 2.1 },
      { pos: new THREE.Vector3(0, 0.888 * s, -0.005 * s), rx: r * 1.05, rzF: r * 1.02, rzB: r * 1.18, n: 2.1 },
    ],
    segments: 12,
    ringsPer: 1,
    weightFn: chainWeights([
      { bone: rig.index.Chest, to: 0.18 },
      { bone: rig.index.Neck, to: 0.6 },
      { bone: rig.index.Head, to: 10 },
    ], 0.16),
    shadeFn: () => [1, 1, 1],
  });
  return makeSkinnedMesh(geometry, material, skeleton);
}

// Relaxed hanging hand: palm faces the thigh, fingers curl lightly toward
// the body and slightly backward. Cross-sections are thin side-to-side (rx)
// and wide fore-aft (rz) so the hand hangs edge-on, never palm-forward.
export function buildHand(p, rig, skeleton, side, material) {
  const { s } = bodyScale(p);
  const S = side > 0 ? 'L' : 'R';
  const wr = rig.joints[`Hand${S}`];
  const down = rig.joints[`HandEnd${S}`].clone().sub(wr).normalize();
  const f = p.sex === 'female' ? 0.86 : 1;
  const len = 0.098 * s * f;
  const w = (v) => v * s * f;
  const inward = new THREE.Vector3(-side, 0, 0);
  const fwd = new THREE.Vector3(0, 0, 1);

  const sections = [];
  const steps = [
    { t: 0, rx: 0.009, rz: 0.014, cIn: 0, cBk: 0 },
    { t: 0.3, rx: 0.011, rz: 0.021, cIn: 0.08, cBk: 0.02 },
    { t: 0.55, rx: 0.012, rz: 0.023, cIn: 0.22, cBk: 0.05 },
    { t: 0.8, rx: 0.010, rz: 0.018, cIn: 0.48, cBk: 0.12 },
    { t: 1, rx: 0.007, rz: 0.012, cIn: 0.78, cBk: 0.2 },
  ];
  for (const st of steps) {
    const pos = wr.clone()
      .addScaledVector(down, st.t * len)
      .addScaledVector(inward, st.cIn * 0.015 * s)
      .addScaledVector(fwd, 0.002 * s - st.cBk * 0.028 * s);
    sections.push({ pos, rx: w(st.rx), rzF: w(st.rz), rzB: w(st.rz), n: 2.5 });
  }
  const weightFn = chainWeights([
    { bone: rig.index[`Hand${S}`], to: 0.5 },
    { bone: rig.index[`HandEnd${S}`], to: 10 },
  ], 0.2);
  const palm = buildLoft({
    sections, segments: 9, ringsPer: 2, capEnd: true, weightFn,
    frontHint: new THREE.Vector3(0, 0, 1), shadeFn: () => [1, 1, 1],
  });

  // thumb tucked along the front edge, pointing down the seam of the trousers
  const thumbRoot = wr.clone().addScaledVector(down, 0.24 * len)
    .addScaledVector(fwd, w(0.013)).addScaledVector(inward, w(0.002));
  const thumbTip = thumbRoot.clone().addScaledVector(down, 0.034 * s)
    .addScaledVector(fwd, 0.004 * s).addScaledVector(inward, 0.005 * s);
  const thumb = buildLoft({
    sections: [
      { pos: thumbRoot, rx: w(0.006), rzF: w(0.006), rzB: w(0.006), n: 2 },
      { pos: thumbRoot.clone().lerp(thumbTip, 0.6), rx: w(0.005), rzF: w(0.005), rzB: w(0.005), n: 2 },
      { pos: thumbTip, rx: w(0.0038), rzF: w(0.0038), rzB: w(0.0038), n: 2 },
    ],
    segments: 7, ringsPer: 1, capEnd: true, weightFn,
    frontHint: new THREE.Vector3(0, 1, 0), shadeFn: () => [1, 1, 1],
  });

  const group = new THREE.Group();
  group.add(makeSkinnedMesh(palm, material, skeleton));
  group.add(makeSkinnedMesh(thumb, material, skeleton));
  return group;
}
