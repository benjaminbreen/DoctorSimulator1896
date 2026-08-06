import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  buildFlowRibbons, buildHairlineWisps, buildHairShells, hairlineDepth,
} from '../character-lab/src/hair/geometry.js';
import { HAIR_PROFILES } from '../character-lab/src/hair/profiles.js';

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
    assert.ok(front >= 0.43 && front <= 0.54, `${name} front depth ${front}`);
  }
});

test('parted styles produce two valid scalp patches and unparted styles one', () => {
  const { scalp, frame } = syntheticScalp();
  for (const [name, profile] of Object.entries(HAIR_PROFILES)) {
    const shells = buildHairShells(scalp, frame, profile, defaults);
    assert.equal(shells.length, profile.part ? 2 : 1, name);
    shells.forEach(assertFiniteGeometry);
  }
});

test('flow locks and hairline wisps are deterministic, finite geometry', () => {
  const { scalp, frame } = syntheticScalp();
  const profile = HAIR_PROFILES['center-parted-bun'];
  const first = buildFlowRibbons(scalp, frame, profile, defaults);
  const second = buildFlowRibbons(scalp, frame, profile, defaults);
  assert.deepEqual(first.getAttribute('position').array, second.getAttribute('position').array);
  assertFiniteGeometry(first);
  assertFiniteGeometry(buildHairlineWisps(scalp, frame, profile, defaults));
});
