import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  buildFlowPath, buildFlowRibbons, buildHairlineWisps, buildHairShells,
  flowAnchor, hairlineDepth, scalpPoint, scalpShadeFactor,
} from '../character-lab/src/hair/geometry.js';
import { HAIR_PROFILES } from '../character-lab/src/hair/profiles.js';
import { HAIR_PALETTES, nearestHairShade, resolveHairPalette } from '../character-lab/src/hair/palette.js';

function syntheticScalp() {
  const AZ = 64;
  const ROWS = 17;
  const centre = new THREE.Vector3(0, 1.15, 0);
  const samples = [];
  for (let column = 0; column < AZ; column++) {
    const azimuth = column / AZ * Math.PI * 2;
    const points = [];
    for (let row = 0; row < ROWS; row++) {
      const t = row / (ROWS - 1);
      const polar = 0.04 + t * Math.PI * 0.62;
      points.push(new THREE.Vector3(
        Math.sin(polar) * Math.sin(azimuth) * 0.076,
        1.15 + Math.cos(polar) * 0.105,
        Math.sin(polar) * Math.cos(azimuth) * 0.088,
      ));
    }
    samples.push(points);
  }
  return { scalp: { samples, AZ, ROWS }, frame: {
    centre, headUp: new THREE.Vector3(0, 1, 0), forward: new THREE.Vector3(0, 0, 1), right: new THREE.Vector3(1, 0, 0),
  } };
}

const defaults = {
  seed: 1896, age: 0.55, hairVolume: 1, hairHeight: 1, sideVolume: 1, partWidth: 0.28,
  hairlineHeight: 0, templeRecession: 0.18, wispAmount: 0.48, waveAmount: 0.35,
  flowSweep: 0.68, greyAmount: 0.24, hairShade: 'dark-brown', hairColor: '#251610',
  skinTone: '#c99378',
};

function assertFiniteGeometry(geometry) {
  const position = geometry.getAttribute('position');
  assert.ok(position.count > 0);
  for (let index = 0; index < position.array.length; index++) assert.ok(Number.isFinite(position.array[index]));
  geometry.computeBoundingBox();
  assert.ok(geometry.boundingBox.max.y > geometry.boundingBox.min.y);
}

test('period hairstyle profiles keep the front hairline on the upper forehead', () => {
  for (const [name, profile] of Object.entries(HAIR_PROFILES)) {
    const front = hairlineDepth(profile, defaults, 0);
    assert.ok(front >= 0.40 && front <= 0.47, `${name} front depth ${front}`);
  }
});

test('shells are opaque streamline grids with a flow tangent basis', () => {
  const { scalp, frame } = syntheticScalp();
  for (const [name, profile] of Object.entries(HAIR_PROFILES)) {
    const shells = buildHairShells(scalp, frame, profile, defaults);
    assert.equal(shells.length, profile.part ? 2 : 1, name);
    shells.forEach((shell) => {
      assertFiniteGeometry(shell);
      assert.equal(shell.getAttribute('color').itemSize, 3, `${name} shell carries alpha it must not have`);
      assert.ok(shell.getAttribute('tangent'), `${name} has no flow tangent basis`);
      for (const value of shell.getAttribute('tangent').array) assert.ok(Number.isFinite(value), `${name} has NaN tangents`);
    });
  }
});

test('shell texture-v runs from the hairline into the rear mass', () => {
  const { scalp, frame } = syntheticScalp();
  const profile = HAIR_PROFILES['swept-back'];
  const [shell] = buildHairShells(scalp, frame, profile, defaults);
  const position = shell.getAttribute('position');
  const uv = shell.getAttribute('uv');
  const anchor = flowAnchor(profile, defaults, 0);
  const anchorPoint = scalpPoint(scalp, anchor.azimuth, anchor.row * (scalp.ROWS - 1));
  const hairlinePoint = scalpPoint(scalp, 0, hairlineDepth(profile, defaults, 0) * (scalp.ROWS - 1));
  for (let vertex = 0; vertex < position.count; vertex++) {
    if (Math.abs(uv.getX(vertex)) > 0.002) continue; // first column only (seed azimuth 0)
    const point = new THREE.Vector3().fromBufferAttribute(position, vertex);
    if (uv.getY(vertex) < 0.002) {
      assert.ok(point.distanceTo(hairlinePoint) < 0.03, 'v=0 does not sit on the hairline');
    }
    if (uv.getY(vertex) > 0.998) {
      assert.ok(point.distanceTo(anchorPoint) < 0.05, 'v=1 does not reach the mass anchor');
    }
  }
});

test('flow ribbons and hairline wisps are deterministic finite geometry', () => {
  const { scalp, frame } = syntheticScalp();
  const profile = HAIR_PROFILES['center-parted-bun'];
  const first = buildFlowRibbons(scalp, frame, profile, defaults);
  const second = buildFlowRibbons(scalp, frame, profile, defaults);
  assert.deepEqual(first.getAttribute('position').array, second.getAttribute('position').array);
  assert.deepEqual(first.getAttribute('color').array, second.getAttribute('color').array);
  assertFiniteGeometry(first);
  assertFiniteGeometry(buildHairlineWisps(scalp, frame, profile, defaults));
});

test('style flow paths run from the exposed hairline toward their rear mass anchor', () => {
  const { scalp, frame } = syntheticScalp();
  for (const style of ['center-parted-bun', 'low-bun', 'loose-chignon', 'swept-back']) {
    const profile = HAIR_PROFILES[style];
    for (const azimuth of [-1.2, -0.55, 0.55, 1.2]) {
      const path = buildFlowPath(scalp, frame, profile, defaults, azimuth);
      const start = path.centres[0];
      const end = path.centres.at(-1);
      const anchor = flowAnchor(profile, defaults, azimuth);
      const target = scalpPoint(scalp, anchor.azimuth, anchor.row * (scalp.ROWS - 1));
      assert.ok(end.distanceTo(target) < 0.05, `${style} misses its mass anchor`);
      assert.ok(start.distanceTo(end) > 0.045, `${style} has a cap-like stationary flow lock`);
      assert.ok(end.clone().sub(frame.centre).dot(frame.forward)
        < start.clone().sub(frame.centre).dot(frame.forward), `${style} does not sweep backward`);
    }
  }
});

test('scalp shading darkens just inside the hairline and leaves the face alone', () => {
  const { scalp, frame } = syntheticScalp();
  const profile = HAIR_PROFILES['center-parted-bun'];
  const depth = hairlineDepth(profile, defaults, 0);
  const justInside = scalpPoint(scalp, 0, (depth - 0.04) * (scalp.ROWS - 1));
  const onForehead = scalpPoint(scalp, 0, (depth + 0.15) * (scalp.ROWS - 1));
  const deepUnderHair = scalpPoint(scalp, 0, depth * 0.4 * (scalp.ROWS - 1));
  assert.ok(scalpShadeFactor(scalp, frame, profile, defaults, justInside) > 0.15, 'no root shadow inside the hairline');
  assert.equal(scalpShadeFactor(scalp, frame, profile, defaults, onForehead), 0, 'shadow leaks onto the forehead');
  assert.ok(scalpShadeFactor(scalp, frame, profile, defaults, deepUnderHair) > 0.1, 'covered scalp is unshaded');
  // Protruding features (an ear tip) sit beyond the fitted radius and stay clean.
  const earTip = scalpPoint(scalp, Math.PI / 2, 0.8 * (scalp.ROWS - 1))
    .add(new THREE.Vector3(0.03, 0, 0));
  assert.equal(scalpShadeFactor(scalp, frame, profile, defaults, earTip), 0, 'ear inherits the shadow band');
  const repeat = scalpShadeFactor(scalp, frame, profile, defaults, justInside);
  assert.equal(repeat, scalpShadeFactor(scalp, frame, profile, defaults, justInside));
});

test('natural shade recipes and custom fallback remain deterministic', () => {
  assert.equal(nearestHairShade('#090706'), 'black');
  assert.equal(nearestHairShade('#71351f'), 'auburn');
  assert.deepEqual(resolveHairPalette({ hairShade: 'chestnut' }), HAIR_PALETTES.chestnut);
  assert.deepEqual(
    resolveHairPalette({ hairShade: 'custom', hairColor: '#432619' }),
    resolveHairPalette({ hairShade: 'custom', hairColor: '#432619' }),
  );
});
