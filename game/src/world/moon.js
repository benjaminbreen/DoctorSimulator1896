// Low-cost lunar ephemeris for the 1896 New York sky. The truncated periodic
// terms are ample for rendering: they put the moon within roughly a degree,
// while avoiding an astronomy dependency in the game bundle.

import { degToRad, clamp } from '../movement/mathUtils.js';
import { smoothstep, START_DAY_OF_YEAR } from './solar.js';

export const GAME_YEAR = 1896;
export const CENTRAL_PARK_LATITUDE = 40.78;
export const CENTRAL_PARK_LONGITUDE = -73.97;
const EASTERN_STANDARD_OFFSET_HOURS = -5;

function wrapDegrees(value) {
  return ((value % 360) + 360) % 360;
}

function julianDay(year, month, day, utcHour = 0) {
  let y = year;
  let m = month;
  if (m <= 2) {
    y -= 1;
    m += 12;
  }
  const century = Math.floor(y / 100);
  const correction = 2 - century + Math.floor(century / 4);
  return (
    Math.floor(365.25 * (y + 4716))
    + Math.floor(30.6001 * (m + 1))
    + day
    + correction
    - 1524.5
    + utcHour / 24
  );
}

export function julianDayForGameTime(timeOfDay, dayOfYear = START_DAY_OF_YEAR) {
  const localDays = Math.max(0, dayOfYear - 1) + timeOfDay / 24;
  const utcDays = localDays - EASTERN_STANDARD_OFFSET_HOURS / 24;
  return julianDay(GAME_YEAR, 1, 1) + utcDays;
}

function equatorialDirection(rightAscension, declination, julian) {
  const latitude = degToRad(CENTRAL_PARK_LATITUDE);
  const sidereal = degToRad(wrapDegrees(
    280.46061837
      + 360.98564736629 * (julian - 2451545)
      + CENTRAL_PARK_LONGITUDE,
  ));
  const hourAngle = sidereal - rightAscension;
  const cosDec = Math.cos(declination);
  const sinDec = Math.sin(declination);
  const cosLat = Math.cos(latitude);
  const sinLat = Math.sin(latitude);
  const east = -cosDec * Math.sin(hourAngle);
  const up = sinLat * sinDec + cosLat * cosDec * Math.cos(hourAngle);
  const north = cosLat * sinDec - sinLat * cosDec * Math.cos(hourAngle);
  return [east, up, -north];
}

export function moonState(timeOfDay, dayOfYear = START_DAY_OF_YEAR) {
  const julian = julianDayForGameTime(timeOfDay, dayOfYear);
  const centuries = (julian - 2451545) / 36525;
  const meanLongitude = wrapDegrees(218.3164477 + 481267.88123421 * centuries);
  const elongation = wrapDegrees(297.8501921 + 445267.1114034 * centuries);
  const solarAnomaly = wrapDegrees(357.5291092 + 35999.0502909 * centuries);
  const lunarAnomaly = wrapDegrees(134.9633964 + 477198.8675055 * centuries);
  const argumentLatitude = wrapDegrees(93.272095 + 483202.0175233 * centuries);
  const d = degToRad(elongation);
  const m = degToRad(solarAnomaly);
  const mp = degToRad(lunarAnomaly);
  const f = degToRad(argumentLatitude);

  // Dominant terms from the lunar longitude and latitude series. This is not
  // an almanac, but it is stable and considerably more convincing than making
  // the moon orbit opposite the sun at a fixed height.
  const longitude = degToRad(wrapDegrees(
    meanLongitude
      + 6.289 * Math.sin(mp)
      + 1.274 * Math.sin(2 * d - mp)
      + 0.658 * Math.sin(2 * d)
      + 0.214 * Math.sin(2 * mp)
      - 0.186 * Math.sin(m)
      - 0.114 * Math.sin(2 * f),
  ));
  const latitude = degToRad(
    5.128 * Math.sin(f)
      + 0.28 * Math.sin(mp + f)
      + 0.277 * Math.sin(mp - f)
      + 0.173 * Math.sin(2 * d - f)
      + 0.055 * Math.sin(2 * d + f - mp)
      + 0.046 * Math.sin(2 * d - f - mp)
      + 0.033 * Math.sin(2 * d + f)
      + 0.017 * Math.sin(2 * mp + f),
  );
  const obliquity = degToRad(23.439291 - 0.0130042 * centuries);
  const cosLat = Math.cos(latitude);
  const eclipticX = cosLat * Math.cos(longitude);
  const eclipticY = cosLat * Math.sin(longitude);
  const eclipticZ = Math.sin(latitude);
  const equatorialY = eclipticY * Math.cos(obliquity) - eclipticZ * Math.sin(obliquity);
  const equatorialZ = eclipticY * Math.sin(obliquity) + eclipticZ * Math.cos(obliquity);
  const rightAscension = Math.atan2(equatorialY, eclipticX);
  const declination = Math.atan2(equatorialZ, Math.hypot(eclipticX, equatorialY));
  const direction = equatorialDirection(rightAscension, declination, julian);
  const altitude = Math.asin(clamp(direction[1], -1, 1)) * 180 / Math.PI;

  const solarLongitude = degToRad(wrapDegrees(
    280.46646
      + 36000.76983 * centuries
      + 1.914602 * Math.sin(m)
      + 0.019993 * Math.sin(2 * m)
      + 0.000289 * Math.sin(3 * m),
  ));
  const phaseAngle = wrapDegrees((longitude - solarLongitude) * 180 / Math.PI) * Math.PI / 180;
  const illumination = (1 - Math.cos(phaseAngle)) * 0.5;
  const horizonVisibility = smoothstep(-4, 4, altitude);
  const discVisibility = horizonVisibility * smoothstep(0.01, 0.05, illumination);

  return {
    direction,
    altitude,
    phaseAngle,
    illumination,
    waxing: phaseAngle <= Math.PI,
    visibility: discVisibility,
    // Directional moonlight falls away quickly with both phase and altitude.
    light: horizonVisibility * Math.pow(illumination, 1.35),
  };
}
