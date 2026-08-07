// Solar position and lighting ramps, framework-free. All outdoor lighting
// keys off solar altitude (Darwin's approach), not hour-of-day directly.

import { degToRad, clamp } from '../movement/mathUtils.js';

export function smoothstep(edge0, edge1, x) {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

// Sun direction from time of day: rises in the east, 15 degrees of azimuth
// per hour, elevation on a sine arc between ~5:30 and ~21:00.
export function sunDirection(timeOfDay) {
  const elevation = degToRad(Math.sin((Math.PI * (timeOfDay - 5.5)) / 15.5) * 68);
  const azimuth = degToRad(90 + (timeOfDay - 13) * 15);
  return [
    Math.cos(elevation) * Math.sin(azimuth),
    Math.sin(elevation),
    -Math.cos(elevation) * Math.cos(azimuth),
  ];
}

// Golden hour trades fill for key light; these ramps drive that everywhere.
export function solarRamps(timeOfDay) {
  const direction = sunDirection(timeOfDay);
  const altitude = (Math.asin(clamp(direction[1], -1, 1)) * 180) / Math.PI;
  return {
    direction,
    altitude,
    daylight: smoothstep(-6, 3, altitude),
    golden: smoothstep(-5, 0.5, altitude) * (1 - smoothstep(14, 30, altitude)) * 0.55,
    night: 1 - smoothstep(-12, -4, altitude),
  };
}
