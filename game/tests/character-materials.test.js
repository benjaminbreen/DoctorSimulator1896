import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  normalizeNonmetallicCharacterMaterial,
  normalizeNonmetallicCharacterMaterials,
} from '../src/scene/characterMaterials.js';

test('character material normalization restores dielectric shading', () => {
  const metallicMap = new THREE.Texture();
  const material = new THREE.MeshStandardMaterial({ metalness: 1, roughness: 1 });
  material.metalnessMap = metallicMap;
  const version = material.version;

  assert.equal(normalizeNonmetallicCharacterMaterial(material), material);
  assert.equal(material.metalness, 0);
  assert.equal(material.metalnessMap, null);
  assert.equal(material.version, version + 1);
});

test('character roots normalize each shared material once', () => {
  const root = new THREE.Group();
  const material = new THREE.MeshStandardMaterial({ metalness: 0.8 });
  root.add(
    new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), material),
    new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), material),
  );

  assert.equal(normalizeNonmetallicCharacterMaterials(root), root);
  assert.equal(material.metalness, 0);
});
