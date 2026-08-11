import test from 'node:test';
import assert from 'node:assert/strict';
import { buildShelters, SHELTERS, quatFromUp } from '../src/world/rusticwork.js';
import { buildDairy, DAIRY } from '../src/world/dairy.js';
import { terrainHeight } from '../src/world/terrain.js';
import { PADS } from '../src/world/centralPark.js';

function rotateByQuat([qx, qy, qz, qw], [vx, vy, vz]) {
  // v' = v + 2q x (q x v + w v)
  const tx = 2 * (qy * vz - qz * vy);
  const ty = 2 * (qz * vx - qx * vz);
  const tz = 2 * (qx * vy - qy * vx);
  return [
    vx + qw * tx + qy * tz - qz * ty,
    vy + qw * ty + qz * tx - qx * tz,
    vz + qw * tz + qx * ty - qy * tx,
  ];
}

test('pole quaternions really rotate +y onto the pole direction', () => {
  // The mirrored-axis version of this bug pointed every rafter outward.
  for (const dir of [[0.6, 0.64, 0.48], [-0.6, 0.64, -0.48], [0.8, 0.6, 0], [0, 0.6, -0.8]]) {
    const len = Math.hypot(...dir);
    const unit = dir.map((v) => v / len);
    const rotated = rotateByQuat(quatFromUp(unit), [0, 1, 0]);
    for (let i = 0; i < 3; i += 1) {
      assert.ok(Math.abs(rotated[i] - unit[i]) < 1e-6, `axis ${i}: ${rotated[i]} vs ${unit[i]}`);
    }
  }
});

test('bargeboards lie on the roof rakes, ridge to eave', () => {
  const built = buildDairy();
  const { eaveY, ridgeY, width } = built.roof;
  // Full-length raked boards only; the king-post struts also pitch on x.
  const rakes = built.cream.filter((b) => b.r && Math.abs(b.r[0]) > 0.1 && b.s[2] > 3);
  assert.equal(rakes.length, 4, 'two rakes per gable end');
  for (const rake of rakes) {
    const axis = [0, -Math.sin(rake.r[0]), Math.cos(rake.r[0])];
    const ends = [1, -1].map((sign) => [
      rake.p[1] + sign * (rake.s[2] / 2) * axis[1],
      rake.p[2] + sign * (rake.s[2] / 2) * axis[2],
    ]);
    const top = ends.find(([y]) => y > ridgeY - 0.5);
    const bottom = ends.find(([y]) => y < eaveY + 0.5);
    assert.ok(top && Math.abs(top[1]) < 0.05, 'upper end meets the ridge line');
    assert.ok(bottom && Math.abs(Math.abs(bottom[1]) - width / 2) < 0.1, 'lower end meets the eave');
  }
});

test('rustic shelters are deterministic and sized to their sites', () => {
  const built = buildShelters();
  assert.deepEqual(built.poles, buildShelters().poles);
  const lanterns = SHELTERS.filter((s) => s.lantern).length;
  assert.equal(built.roofs.length, SHELTERS.length + lanterns, 'a lantern adds a second roof');
  assert.ok(built.poles.length > 30 && built.branches.length > 100, 'timberwork populated');
  for (const piece of [...built.poles, ...built.branches, ...built.seats]) {
    const inside = SHELTERS.some(
      (s) => Math.hypot(piece.p[0] - s.x, piece.p[2] - s.z) <= s.radius + s.overhang + 1.2,
    );
    assert.ok(inside, `piece at ${piece.p[0].toFixed(1)},${piece.p[2].toFixed(1)} belongs to a shelter`);
  }
});

test('shelter entries stay open and railings block the rest', () => {
  const built = buildShelters();
  const railings = built.colliders.filter((c) => c.type === 'box' && c.size[1] === 1.0);
  const expected = SHELTERS.reduce((sum, s) => sum + s.sides - s.entries.length, 0);
  assert.equal(railings.length, expected, 'one railing collider per closed bay');
});

test('building pads sit level under their structures', () => {
  for (const pad of PADS) {
    const center = terrainHeight(pad.x, pad.z);
    for (const [dx, dz] of [[pad.flat * 0.7, 0], [0, pad.flat * 0.7], [-pad.flat * 0.6, pad.flat * 0.5]]) {
      assert.ok(Math.abs(terrainHeight(pad.x + dx, pad.z + dz) - center) < 0.05, 'pad is level');
    }
  }
});

test('the Dairy is deterministic, with its loggia open to walk through', () => {
  const built = buildDairy();
  assert.deepEqual(built.stone, buildDairy().stone);
  assert.ok(built.stone.length >= 9 && built.cream.length > 30, 'cottage and trim populated');
  const posts = built.colliders.filter((c) => c.type === 'cylinder');
  assert.equal(posts.length, 8, 'loggia posts carry colliders');
  // The entry bay (south center) has no railing collider.
  const rails = built.colliders.filter((c) => c.type === 'box' && c.size[1] === 0.9);
  assert.equal(rails.length, 5, 'five railed bays, one open entry');
  assert.ok(built.ground > -0.4 && built.ground < 2.5, `Dairy pad at grade, got ${built.ground}`);
  assert.ok(DAIRY.yaw !== undefined);
});
