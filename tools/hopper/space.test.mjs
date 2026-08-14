import test from 'node:test';
import assert from 'node:assert/strict';

import {
  TIME_BANDS,
  VIBE_FAMILIES,
  CAMERA_STRATA,
  SHADOW_FAMILIES,
  SUN_AZIMUTH_SECTORS,
  makeRng,
  counterbalancedFactors,
  sampleTimeOfDay,
  sampleTuning,
  sampleElevatedCameraCandidates,
  sampleRooftopSubjectCandidates,
  assembleShot,
  aimAt,
} from './space.mjs';
import { selectDiverseResults, selectGamutResults } from './diversity.mjs';
import { SHOT_SUBJECT_ARCHETYPES, buildGamutPlan, familyTargets } from './gamut_plan.mjs';

test('each named time stratum samples only inside its interval', () => {
  const rng = makeRng(813);
  for (const band of TIME_BANDS) {
    for (let index = 0; index < 100; index += 1) {
      const hour = sampleTimeOfDay(rng, band);
      assert.ok(hour >= band.low && hour < band.high, `${band.id}: ${hour}`);
    }
  }
});

test('aimAt follows the free-camera yaw and pitch convention', () => {
  assert.deepEqual(aimAt([0, 1, 0], [0, 1, -5]), { yaw: -0, pitch: 0 });
  assert.ok(Math.abs(aimAt([0, 1, 0], [5, 1, 0]).yaw + Math.PI / 2) < 1e-9);
  assert.ok(aimAt([0, 1, 0], [0, 4, -5]).pitch > 0);
});

test('assembled shots retain their time band and coherent metadata', () => {
  const rng = makeRng(31);
  const bounds = { minX: -5, maxX: 5, minZ: -6, maxZ: 6, floorY: 0, ceilingY: 4 };
  const camera = { x: -2, z: 2, ground: 0 };
  const figure = { x: 1, z: -1, ground: 0 };
  for (const [index, band] of TIME_BANDS.entries()) {
    const vibe = VIBE_FAMILIES[index % VIBE_FAMILIES.length];
    const shot = assembleShot(rng, bounds, camera, figure, false, {
      timeBand: band,
      vibe,
      windows: [],
    });
    assert.equal(shot.meta.timeBand, band.id);
    assert.equal(shot.meta.vibe, vibe.id);
    assert.ok(band.low <= shot.tuning.timeOfDay && shot.tuning.timeOfDay < band.high);
    assert.ok(['figure', 'architecture'].includes(shot.meta.composition));
    assert.equal(shot.figure.visible, shot.meta.composition === 'figure');
    assert.equal(shot.figure.pose, 'still');
  }
});

test('vibe families move correlated lighting controls inside distinct envelopes', () => {
  const rng = makeRng(1896);
  for (let index = 0; index < 40; index += 1) {
    const raking = sampleTuning(rng, true, 'midday', 'raking-clarity');
    assert.ok(raking.bloomIntensity <= 0.28);
    assert.ok(raking.sunShadowRadius <= 0.9);
    assert.ok(raking.cloudCover <= 0.3);

    const overcast = sampleTuning(rng, true, 'midday', 'soft-overcast');
    assert.ok(overcast.cloudCover >= 0.76);
    assert.ok(overcast.sunShadowRadius >= 5);
    assert.ok(overcast.skySaturation <= 0.92);

    const haze = sampleTuning(rng, false, 'sunset', 'luminous-haze');
    assert.ok(haze.bloomIntensity >= 0.75);
    assert.ok(haze.shaftIntensity >= 1.55);
    assert.ok(haze.skyHaze >= 1);

    const nocturne = sampleTuning(rng, false, 'evening', 'practical-nocturne');
    assert.ok(nocturne.gaslightIntensity >= 1.25);
    assert.ok(nocturne.skyLitWindows >= 0.75);
  }
});

test('exterior candidates use skyFill rather than the inactive hemisphere control', () => {
  const rng = makeRng(1896);
  const exterior = sampleTuning(rng, true, 'evening', 'practical-nocturne');
  const interior = sampleTuning(rng, false, 'evening', 'practical-nocturne');
  assert.equal('hemisphereIntensity' in exterior, false);
  assert.equal(typeof exterior.skyFill, 'number');
  assert.equal(typeof interior.hemisphereIntensity, 'number');
});

test('exterior evening candidates remain dark but rateable', () => {
  const rng = makeRng(216);
  for (const vibe of VIBE_FAMILIES) {
    const tuning = sampleTuning(rng, true, 'evening', vibe);
    assert.ok(tuning.exposure >= 0.85);
    assert.ok(tuning.ambientIntensity >= 0.08);
    assert.ok(tuning.envIntensity >= 0.22);
    assert.ok(tuning.nightSkyBrightness >= 0.75);
    assert.ok(tuning.skyFill >= 0.9);
  }
});

test('explicit outdoor shadow and azimuth strata stay inside their ranges', () => {
  const rng = makeRng(216);
  for (const shadowFamily of SHADOW_FAMILIES) {
    for (const sunAzimuthSector of SUN_AZIMUTH_SECTORS) {
      const tuning = sampleTuning(rng, true, 'afternoon', 'raking-clarity', {
        shadowFamily,
        sunAzimuthSector,
      });
      assert.ok(tuning.sunShadowRadius >= shadowFamily.range[0]);
      assert.ok(tuning.sunShadowRadius <= shadowFamily.range[1]);
      assert.ok(tuning.sunAzimuthDeg >= sunAzimuthSector.range[0]);
      assert.ok(tuning.sunAzimuthDeg <= sunAzimuthSector.range[1]);
    }
  }
});

test('camera, shadow and azimuth controls are counterbalanced rather than locked together', () => {
  const blockSize = CAMERA_STRATA.length * SHADOW_FAMILIES.length * SUN_AZIMUTH_SECTORS.length;
  const schedule = counterbalancedFactors(
    CAMERA_STRATA,
    SHADOW_FAMILIES,
    SUN_AZIMUTH_SECTORS,
    blockSize * 2,
    813,
  );
  const combinations = new Map();
  for (const factor of schedule) {
    const key = [factor.cameraStratum.id, factor.shadowFamily.id, factor.sunAzimuthSector.id].join('|');
    combinations.set(key, (combinations.get(key) ?? 0) + 1);
  }
  assert.equal(combinations.size, blockSize);
  assert.ok([...combinations.values()].every((count) => count === 2));
  assert.deepEqual(
    counterbalancedFactors(CAMERA_STRATA, SHADOW_FAMILIES, SUN_AZIMUTH_SECTORS, 12, 9),
    counterbalancedFactors(CAMERA_STRATA, SHADOW_FAMILIES, SUN_AZIMUTH_SECTORS, 12, 9),
  );
});

test('elevated candidates use existing façades and roof tops', () => {
  const architecture = [{
    id: 'brick-block',
    position: [10, 9, -4],
    size: [12, 16, 10],
    yaw: 0,
    roofY: 17,
  }];
  const raised = sampleElevatedCameraCandidates(makeRng(7), architecture, 12, 'raised');
  const rooftops = sampleElevatedCameraCandidates(makeRng(8), architecture, 12, 'rooftop');
  assert.equal(raised.length, 12);
  assert.equal(rooftops.length, 12);
  assert.ok(raised.every((point) => point.stratum === 'raised' && point.y < 17));
  assert.ok(rooftops.every((point) => point.stratum === 'rooftop' && point.y > 19));
  assert.ok(rooftops.every((point) => Math.abs(point.x - 10) <= 3.6));
  assert.ok(rooftops.every((point) => Math.abs(point.z + 4) <= 3));
});

test('rooftop subjects stand on existing roof faces rather than camera-height points', () => {
  const architecture = [{
    id: 'brick-block',
    position: [10, 9, -4],
    size: [12, 16, 10],
    yaw: 0,
    roofY: 17,
  }];
  const figures = sampleRooftopSubjectCandidates(makeRng(9), architecture, 12);
  assert.equal(figures.length, 12);
  assert.ok(figures.every((point) => point.stratum === 'rooftop'));
  assert.ok(figures.every((point) => Math.abs(point.ground - 17.04) < 1e-9));
  assert.ok(figures.every((point) => Math.abs(point.x - 10) <= 2.88));
  assert.ok(figures.every((point) => Math.abs(point.z + 4) <= 2.4));
});

test('an elevated composition uses the supplied lens height and hides the player', () => {
  const rng = makeRng(58);
  const bounds = { minX: -100, maxX: 230, minZ: -85, maxZ: 186, floorY: 0, ceilingY: 6 };
  const camera = { x: 5, y: 18.4, z: 12, ground: 0, stratum: CAMERA_STRATA[2].id, anchorId: 'a' };
  const figure = { x: 7, z: 8, ground: 0 };
  const architecture = [
    { id: 'a', position: [5, 8, 12], size: [10, 14, 10] },
    { id: 'b', position: [40, 10, -20], size: [14, 18, 12] },
  ];
  const shot = assembleShot(rng, bounds, camera, figure, true, {
    composition: 'figure',
    architecture,
    timeBand: TIME_BANDS[3],
    vibe: VIBE_FAMILIES[0],
    shadowFamily: SHADOW_FAMILIES[0],
    sunAzimuthSector: SUN_AZIMUTH_SECTORS[2],
  });
  assert.equal(shot.camera.position[1], 18.4);
  assert.equal(shot.meta.cameraStratum, 'rooftop');
  assert.equal(shot.meta.composition, 'architecture');
  assert.equal(shot.figure.visible, false);
  assert.equal(shot.meta.shadowFamily, 'hard');
  assert.equal(shot.meta.sunAzimuthSector, 'south-west');
});

test('requested composition controls player and window studies deterministically', () => {
  const rng = makeRng(60);
  const bounds = { minX: -5, maxX: 5, minZ: -6, maxZ: 6, floorY: 0, ceilingY: 4 };
  const camera = { x: -2, z: 2, ground: 0 };
  const figure = { x: 1, z: -1, ground: 0 };
  const windows = [{ position: [3, 2, -4] }];
  for (const composition of ['figure', 'window', 'architecture']) {
    const shot = assembleShot(rng, bounds, camera, figure, false, {
      composition,
      timeBand: TIME_BANDS[0],
      vibe: VIBE_FAMILIES[0],
      windows,
    });
    assert.equal(shot.meta.composition, composition);
    assert.equal(shot.figure.visible, composition === 'figure');
  }
});

test('window-figure reuses a still woman subject and hides the player', () => {
  const rng = makeRng(71);
  const bounds = { minX: -5, maxX: 5, minZ: -6, maxZ: 6, floorY: 0, ceilingY: 4 };
  const camera = { x: -2, z: 2, ground: 0 };
  const figure = { x: 2.2, z: -4.1, ground: 0, yaw: 1.2 };
  const windows = [{ position: [2.5, 2, -5], normal: [0, 0, -1], width: 2, height: 2.2 }];
  const shot = assembleShot(rng, bounds, camera, figure, false, {
    composition: 'window-figure',
    sceneFamily: 'window-figure',
    target: [figure.x, 0.9, figure.z],
    timeBand: TIME_BANDS[0],
    vibe: VIBE_FAMILIES[0],
    windows,
  });
  assert.equal(shot.figure.visible, false);
  assert.equal(shot.subject.kind, 'woman');
  assert.equal(shot.subject.archetype, 'w');
  assert.deepEqual(shot.subject.position, [2.2, 0, -4.1]);
  assert.equal(shot.meta.composition, 'window-figure');
  assert.equal(shot.meta.sceneFamily, 'window-figure');
});

test('placed woman compositions retain archetype and scenario metadata', () => {
  const rng = makeRng(72);
  const bounds = { minX: -100, maxX: 230, minZ: -85, maxZ: 186, floorY: 0, ceilingY: 70 };
  const camera = { x: 4, y: 22, z: 8, ground: 0, stratum: 'rooftop' };
  const figure = { x: 18, z: -7, ground: 17.04, yaw: 0.7 };
  for (const composition of ['doorway-figure', 'rooftop-figure']) {
    const shot = assembleShot(rng, bounds, camera, figure, true, {
      composition,
      sceneFamily: composition,
      subjectArchetype: 'h',
      subjectScenario: composition,
      target: [figure.x, figure.ground + 0.9, figure.z],
      timeBand: TIME_BANDS[2],
      vibe: VIBE_FAMILIES[1],
    });
    assert.equal(shot.figure.visible, false);
    assert.equal(shot.subject.kind, 'woman');
    assert.equal(shot.subject.archetype, 'h');
    assert.equal(shot.subject.scenario, composition);
    assert.equal(shot.meta.subjectArchetype, 'h');
    assert.equal(shot.meta.subjectScenario, composition);
  }
});

test('the 60-frame gamut caps elevated shots and preserves every scene family', () => {
  const plan = buildGamutPlan(60, 813);
  const targets = familyTargets(60);
  const counts = plan.reduce((result, task) => {
    result[task.family] = (result[task.family] ?? 0) + 1;
    return result;
  }, {});
  assert.equal(plan.length, 60);
  assert.deepEqual(counts, targets);
  assert.equal(counts['elevated-architecture'], 6);
  assert.equal(counts['window-figure'], 9);
  assert.equal(counts['doorway-figure'], 9);
  assert.equal(counts['rooftop-figure'], 6);
  const placed = plan.filter((task) => task.subjectArchetype);
  const archetypeCounts = placed.reduce((result, task) => {
    result[task.subjectArchetype] = (result[task.subjectArchetype] ?? 0) + 1;
    return result;
  }, {});
  assert.deepEqual(
    archetypeCounts,
    Object.fromEntries(SHOT_SUBJECT_ARCHETYPES.map((id) => [id, 6])),
  );
  assert.equal(new Set(plan.map((task) => task.timeBand)).size, TIME_BANDS.length);
  assert.equal(new Set(plan.map((task) => task.vibe)).size, VIBE_FAMILIES.length);
});

test('winner selection balances zones and time bands before score ties', () => {
  const entries = [];
  for (const zone of ['office', 'park', 'hotel']) {
    for (const band of TIME_BANDS) {
      for (let variant = 0; variant < 2; variant += 1) {
        entries.push({
          zone,
          timeBand: band.id,
          vibe: VIBE_FAMILIES[(TIME_BANDS.indexOf(band) + variant) % VIBE_FAMILIES.length].id,
          total: 1 - variant * 0.1,
          shot: {
            meta: {
              timeBand: band.id,
              composition: variant ? 'figure' : 'architecture',
              cameraStratum: CAMERA_STRATA[(TIME_BANDS.indexOf(band) + variant) % CAMERA_STRATA.length].id,
              shadowFamily: SHADOW_FAMILIES[(TIME_BANDS.indexOf(band) + variant) % SHADOW_FAMILIES.length].id,
              sunAzimuthSector: SUN_AZIMUTH_SECTORS[(TIME_BANDS.indexOf(band) + variant) % SUN_AZIMUTH_SECTORS.length].id,
            },
            camera: { position: [variant * 4, 1.5, band.low], yaw: variant },
          },
        });
      }
    }
  }
  const selected = selectDiverseResults(entries, 18);
  const counts = (key) => Object.values(selected.reduce((result, entry) => {
    const value = key(entry);
    result[value] = (result[value] ?? 0) + 1;
    return result;
  }, {}));
  const zoneCounts = counts((entry) => entry.zone);
  const timeCounts = counts((entry) => entry.timeBand);
  const vibeCounts = counts((entry) => entry.vibe);
  assert.equal(selected.length, 18);
  assert.ok(Math.max(...zoneCounts) - Math.min(...zoneCounts) <= 1);
  assert.ok(Math.max(...timeCounts) - Math.min(...timeCounts) <= 1);
  assert.equal(vibeCounts.length, VIBE_FAMILIES.length);
  // Camera de-duplication can make one exact joint zone/time/vibe cell
  // unavailable; the selector may relax by one rather than return fewer.
  assert.ok(Math.max(...vibeCounts) - Math.min(...vibeCounts) <= 2);
});

test('gamut winner selection retains the requested family proportions', () => {
  const entries = buildGamutPlan(60, 19).map((task, index) => ({
    ...task,
    sceneFamily: task.family,
    total: 1 - index / 1000,
    shot: {
      meta: {
        sceneFamily: task.family,
        timeBand: task.timeBand,
        vibe: task.vibe,
        composition: task.composition,
        cameraStratum: task.cameraStratum,
        shadowFamily: task.shadowFamily,
        sunAzimuthSector: task.sunAzimuthSector,
      },
      camera: { position: [index * 2, 1.5, index], yaw: index / 5 },
    },
  }));
  const selected = selectGamutResults(entries, 30);
  const counts = selected.reduce((result, entry) => {
    result[entry.sceneFamily] = (result[entry.sceneFamily] ?? 0) + 1;
    return result;
  }, {});
  assert.deepEqual(counts, familyTargets(30));
});
