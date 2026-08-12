import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BOARDING_CLIMB_SECONDS,
  advanceCarriageClimb,
  beginCarriageClimb,
  carriageSupportDelta,
  localToWorld,
  supportFor,
  worldToLocal,
} from '../src/world/carriageBoarding.js';
import { horseDrawnBoardingProfile } from '../src/world/horseDrawnTraffic.js';

const vehicle = {
  id: 'omnibus', x: 12, y: 1.18, z: 28, yaw: 0.7,
  profile: horseDrawnBoardingProfile('omnibus'),
};

test('only the cab and omnibus expose authored rear boarding profiles', () => {
  assert.ok(horseDrawnBoardingProfile('hansom'));
  assert.ok(horseDrawnBoardingProfile('omnibus'));
  assert.equal(horseDrawnBoardingProfile('brougham'), null);
});

test('carriage local and world points round trip while the vehicle turns', () => {
  const local = [-1.7, 2.4, -0.4];
  const roundTrip = worldToLocal(vehicle, localToWorld(vehicle, local));
  roundTrip.forEach((value, index) => assert.ok(Math.abs(value - local[index]) < 1e-9));
});

test('the climb follows a moving carriage and finishes on its roof', () => {
  const start = localToWorld(vehicle, vehicle.profile.access);
  let climb = beginCarriageClimb(vehicle, start);
  let result;
  for (let i = 0; i < 180; i += 1) {
    const moving = { ...vehicle, x: vehicle.x + i / 90, yaw: vehicle.yaw + i / 900 };
    result = advanceCarriageClimb(climb, moving, 1 / 60);
    climb = result.climb;
  }
  assert.equal(result.done, true);
  assert.equal(result.climb.elapsed, BOARDING_CLIMB_SECONDS);
  const finalVehicle = { ...vehicle, x: vehicle.x + 179 / 90, yaw: vehicle.yaw + 179 / 900 };
  assert.ok(Math.abs(result.yaw - finalVehicle.yaw) < 1e-9);
  const local = worldToLocal(finalVehicle, result.position);
  local.forEach((value, index) => assert.ok(Math.abs(value - vehicle.profile.target[index]) < 1e-8));
});

test('roof support carries the player until they step beyond the edge', () => {
  const roof = vehicle.profile.roof;
  const onRoof = localToWorld(vehicle, [roof.center[0], roof.top, roof.center[1]]);
  const support = supportFor(vehicle);
  const moved = { ...vehicle, x: vehicle.x + 0.4, z: vehicle.z - 0.2, yaw: vehicle.yaw + 0.08 };
  const carried = carriageSupportDelta(support, moved, onRoof);
  assert.equal(carried.supported, true);
  assert.ok(Math.hypot(...carried.delta.filter((_, index) => index !== 1)) > 0.3);

  const offRoof = localToWorld(vehicle, [
    roof.center[0] + roof.half[0] + 0.5,
    roof.top,
    roof.center[1],
  ]);
  assert.equal(carriageSupportDelta(support, moved, offRoof).supported, false);
});
