// Sub-location line for the top bar: "Central Park — Carousel" when the
// player stands near a named feature. Positions come from the world modules
// that build the features, so the label can never drift from the geometry.

import { CAROUSEL } from '../world/carousel.js';
import { DAIRY } from '../world/dairy.js';
import { GAPSTOW } from '../world/gapstow.js';

const PARK_LANDMARKS = [
  { name: 'Carousel', x: CAROUSEL.x, z: CAROUSEL.z, radius: 14 },
  { name: 'The Dairy', x: DAIRY.x, z: DAIRY.z, radius: 14 },
  { name: 'Gapstow Bridge', x: GAPSTOW.x, z: GAPSTOW.z, radius: 12 },
];

// Nearest landmark whose radius contains the player, else null.
export function parkLandmark(x, z) {
  let best = null;
  let bestDist = Infinity;
  for (const mark of PARK_LANDMARKS) {
    const dist = Math.hypot(x - mark.x, z - mark.z);
    if (dist <= mark.radius && dist < bestDist) {
      best = mark.name;
      bestDist = dist;
    }
  }
  return best;
}
