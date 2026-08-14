// Solar position and lighting ramps, framework-free. All outdoor lighting
// keys off solar altitude (Darwin's approach), not hour-of-day directly.
//
// The game opens on 15 June 1896 in New York. Daylight saving does not reach
// the United States until 1918, so the clock is Eastern Standard year round
// and the sun peaks near noon rather than near one.

import { degToRad, clamp } from '../movement/mathUtils.js';

export function smoothstep(edge0, edge1, x) {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

// 15 June; 1896 was a leap year.
export const START_DAY_OF_YEAR = 167;
const LATITUDE = degToRad(40.78); // Central Park

// How far local apparent noon sits from 12:00 on the clock. New York is about
// a degree east of the 75 W standard meridian. The USNO calculation for the
// opening date puts upper transit at 11:56 Eastern Standard Time.
const SOLAR_NOON = 11.94;

// Cooper's approximation: within half a degree, which is finer than the half
// degree the sun's own disc subtends.
export function solarDeclination(dayOfYear) {
  return degToRad(23.45 * Math.sin(degToRad((360 * (284 + dayOfYear)) / 365)));
}

// Sun direction in world axes: +x east, +z south, +y up (see centralPark.js).
// Hour angle is negative before noon, which puts the morning sun in the east.
export function sunDirection(timeOfDay, dayOfYear = START_DAY_OF_YEAR) {
  const declination = solarDeclination(dayOfYear);
  const hourAngle = degToRad((timeOfDay - SOLAR_NOON) * 15);
  const sinDec = Math.sin(declination);
  const cosDec = Math.cos(declination);
  const sinLat = Math.sin(LATITUDE);
  const cosLat = Math.cos(LATITUDE);
  const up = sinDec * sinLat + cosDec * cosLat * Math.cos(hourAngle);
  const east = -cosDec * Math.sin(hourAngle);
  const north = sinDec * cosLat - cosDec * sinLat * Math.cos(hourAngle);
  return [east, up, -north];
}

// The game normally uses the historical solar azimuth above. Screenshot
// search can rotate that direction around the vertical axis while preserving
// its physically derived altitude, daylight and colour ramps. Azimuth is
// clockwise from north: 0 north, 90 east, 180 south, 270 west.
export function directionAtAzimuth(direction, azimuthDeg) {
  if (!Number.isFinite(azimuthDeg)) return direction;
  const up = clamp(direction[1], -1, 1);
  const horizontal = Math.sqrt(Math.max(0, 1 - up * up));
  const azimuth = degToRad(azimuthDeg);
  return [Math.sin(azimuth) * horizontal, up, -Math.cos(azimuth) * horizontal];
}

// Golden hour trades fill for key light; these ramps drive that everywhere.
export function solarRamps(timeOfDay, dayOfYear = START_DAY_OF_YEAR, azimuthDeg = null) {
  const direction = directionAtAzimuth(sunDirection(timeOfDay, dayOfYear), azimuthDeg);
  const altitude = (Math.asin(clamp(direction[1], -1, 1)) * 180) / Math.PI;
  // Light ages through the afternoon: brightness eases to 82% as the sun
  // drops from 28 to 4 degrees, instead of holding full until dusk.
  const shoulder = 0.82 + 0.18 * smoothstep(4, 28, altitude);
  const daylight = smoothstep(-6, 3, altitude) * shoulder;
  return {
    direction,
    altitude,
    daylight,
    // Onset near 25 degrees, full by 2, gone below -5: golden builds through
    // the afternoon and peaks at the horizon.
    golden: smoothstep(-5, 0.5, altitude) * (1 - smoothstep(2, 25, altitude)),
    // The analytic daylight sky becomes numerically unreliable around the
    // horizon. Hand it to the authored twilight palette before that creates
    // a black trough: begin below +2 degrees and finish by -3 degrees.
    twilight: 1 - smoothstep(-3, 2, altitude),
    night: 1 - smoothstep(-12, -4, altitude),
    // Explicit twilight stages keep the visual handoff authored all the way
    // through midnight instead of ending the grade when the sun disappears.
    civilDark: 1 - smoothstep(-6, 0, altitude),
    nauticalDark: 1 - smoothstep(-12, -6, altitude),
    astronomicalNight: 1 - smoothstep(-18, -12, altitude),
    starVisibility: 1 - smoothstep(-12, -3, altitude),
  };
}
