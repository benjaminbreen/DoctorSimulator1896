import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createPatientSeat } from '../src/scene/characters/patientSeat.js';

function patient(scale, width) {
  const group = new THREE.Group();
  group.scale.setScalar(scale);
  group.rotation.y = Math.PI;
  const root = new THREE.Group();
  group.add(root);
  for (const side of ['Left', 'Right']) {
    const hip = new THREE.Bone();
    hip.name = `mixamorig${side}UpLeg`;
    hip.position.set((side === 'Left' ? 1 : -1) * width / 2, .48, .07);
    const knee = new THREE.Bone();
    knee.name = `mixamorig${side}Leg`;
    knee.position.set(0, 0, .4);
    hip.add(knee);
    root.add(hip);
  }
  return { group, seat: createPatientSeat(root) };
}

test('seat fitting follows body size, model scale and animated hip height without drift', () => {
  for (const [scale, width] of [[1, .19], [1, .23], [1.78, .11]]) {
    const { group, seat } = patient(scale, width);
    for (let frame = 0; frame < 60; frame++) {
      group.position.y += .003 * Math.sin(frame);
      group.position.y += .65 - seat.height();
      assert.ok(Math.abs(seat.height() - .65) < 1e-6);
    }
  }
  assert.notEqual(patient(1, .19).seat.height(), patient(1, .23).seat.height());
});

test('a model without leg anchors keeps its authored placement', () => {
  assert.equal(createPatientSeat(new THREE.Group()).height(), null);
});

test('the patient and cloth follow a chair that has moved', () => {
  const scene = new THREE.Scene();
  const chair = new THREE.Group();
  chair.name = 'furniture:patient-chair-e';
  chair.position.set(-.45, 0, -1.7);
  chair.rotation.y = Math.PI;
  scene.add(chair);
  const group = new THREE.Group();
  const seat = createPatientSeat(group, scene);
  const placement = { position: [-.45, .05, -1.57], rotation: [0, Math.PI, 0] };
  seat.update(1);
  seat.anchor(group, placement);
  assert.ok(Math.abs(group.position.z + 1.57) < 1e-6);
  chair.position.set(1.45, .1, -1.7);
  chair.rotation.y = Math.PI / 2;
  seat.update(1);
  seat.anchor(group, placement);
  assert.ok(Math.abs(group.position.x - 1.32) < 1e-6);
  assert.ok(Math.abs(group.position.z + 1.7) < 1e-6);
  assert.ok(Math.abs(seat.cushionHeight - .75) < 1e-6);
  assert.ok(Math.abs(Math.sin(group.rotation.y) - 1) < 1e-6);
});
