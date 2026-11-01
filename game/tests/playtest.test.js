import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { runSeedFromSearch } from '../src/world/runSeed.js';
import { createConsultationPatients } from '../src/consultation/patients.js';
import { installShotHarness } from '../src/shots/harness.js';
import { gameDebug } from '../src/debug.js';

test('a playtest URL repeats the cast without changing ordinary sessions', () => {
  assert.equal(runSeedFromSearch('?seed=4'), null);
  assert.equal(runSeedFromSearch('?playtest=1&seed=0'), 0);
  for (const seed of ['', '-1', '1.5', 'NaN', '4294967296']) {
    assert.equal(runSeedFromSearch(`?playtest=1&seed=${seed}`), null);
  }
  const seed = runSeedFromSearch('?playtest=1&seed=4');
  const first = createConsultationPatients({ daySeed: seed, dayIndex: 0 });
  const second = createConsultationPatients({ daySeed: seed, dayIndex: 0 });
  assert.deepEqual(first.map((patient) => patient.id), second.map((patient) => patient.id));
  assert.ok(first.some((patient) => patient.id === 'carmela-russo-1896'));
});

test('shots wait for the requested zone to finish rendering', () => {
  globalThis.window = {};
  try {
    const runtime = { values: { zone: 'consulting-office' } };
    const api = installShotHarness(runtime);
    gameDebug.room = {};
    gameDebug.camera = {};
    gameDebug.loadedZone = 'central-park';
    gameDebug.stats.boot.complete = true;
    assert.equal(api.ready, false);
    gameDebug.loadedZone = 'consulting-office';
    gameDebug.stats.boot.complete = false;
    assert.equal(api.ready, false);
    gameDebug.stats.boot.complete = true;
    assert.equal(api.ready, true);
  } finally {
    delete globalThis.window;
    gameDebug.room = null;
    gameDebug.camera = null;
    gameDebug.loadedZone = null;
    gameDebug.stats.boot.complete = false;
  }
});

test('the shot probe rejects figures wholly above or below the frame', () => {
  globalThis.window = {};
  const originalPosition = [...gameDebug.player.position];
  try {
    const api = installShotHarness({ values: {} });
    gameDebug.room = { windowHoles: [] };
    gameDebug.camera = new THREE.PerspectiveCamera(60, 1, 0.1, 100);
    gameDebug.camera.updateMatrixWorld();
    for (const y of [-20, 20]) {
      gameDebug.player.position = [0, y, -5];
      assert.equal(api.probe().figure.onScreen, false);
    }
    gameDebug.player.position = [0, -0.86, -5];
    assert.equal(api.probe().figure.onScreen, true);
    gameDebug.player.position = [0, 0, 5];
    assert.equal(api.probe().figure.onScreen, false);
  } finally {
    delete globalThis.window;
    gameDebug.player.position = originalPosition;
    gameDebug.room = null;
    gameDebug.camera = null;
  }
});
