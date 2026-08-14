import test from 'node:test';
import assert from 'node:assert/strict';
import { moonState } from '../src/world/moon.js';
import { solarRamps, START_DAY_OF_YEAR } from '../src/world/solar.js';
import { environmentPalette } from '../src/world/skyPalette.js';
import { settingsSchema, schemaParameters } from '../src/tuning/settingsSchema.js';

test('the opening-date moon agrees with the historical ephemeris', () => {
  const noon = moonState(12, START_DAY_OF_YEAR);
  assert.ok(noon.illumination > 0.3 && noon.illumination < 0.33);
  assert.equal(noon.waxing, false);

  // USNO for 06:00 UTC on 4 August: 11.37 degrees altitude and 27% lit.
  const oneAm = moonState(1, START_DAY_OF_YEAR + 1);
  assert.ok(Math.abs(oneAm.altitude - 11.37) < 0.4);
  assert.ok(Math.abs(oneAm.illumination - 0.27) < 0.015);
});

test('the solar ramps describe the full astronomical night', () => {
  const midnight = solarRamps(0, START_DAY_OF_YEAR);
  assert.ok(midnight.altitude < -20);
  assert.ok(midnight.astronomicalNight > 0.99);
  assert.ok(midnight.starVisibility > 0.99);
  assert.ok(midnight.daylight < 0.001);
});

test('the authored twilight handoff covers the analytic-sky trough', () => {
  const before = solarRamps(18.75, START_DAY_OF_YEAR);
  const horizon = solarRamps(19, START_DAY_OF_YEAR);
  const after = solarRamps(19.5, START_DAY_OF_YEAR);
  assert.ok(before.twilight < horizon.twilight);
  assert.ok(horizon.twilight > 0 && horizon.twilight < 1);
  assert.ok(after.twilight > 0.99);
  assert.equal(environmentPalette(19, START_DAY_OF_YEAR).authoredBlend, horizon.twilight);
});

test('night environment retains authored fill but stays darker than noon', () => {
  const night = environmentPalette(22, START_DAY_OF_YEAR);
  const noon = environmentPalette(12, START_DAY_OF_YEAR);
  assert.ok(night.intensity >= 0.28);
  assert.ok(night.intensity < noon.intensity);
  assert.ok(night.top.every((channel) => channel > 0));
  assert.ok(night.horizon[2] > night.horizon[0]);
});

test('existing city and moon paths strengthen the night environment', () => {
  const base = environmentPalette(22, START_DAY_OF_YEAR, {
    nightSkyBrightness: 1,
    citySkyGlow: 0,
    moonlightIntensity: 0,
  });
  const city = environmentPalette(22, START_DAY_OF_YEAR, {
    nightSkyBrightness: 1,
    citySkyGlow: 2.2,
    moonlightIntensity: 0,
  });
  assert.ok(city.intensity > base.intensity);
  assert.ok(city.horizon[0] > base.horizon[0]);
});

test('time tuning exposes every hour of the day', () => {
  const time = schemaParameters(settingsSchema).find((parameter) => parameter.id === 'timeOfDay');
  assert.equal(time.min, 0);
  assert.equal(time.max, 24);
});
