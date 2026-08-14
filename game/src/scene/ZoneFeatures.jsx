import { lazy, Suspense } from 'react';

// Set dressing by zone. A zone lists feature ids in its registry entry
// (world/zones.js); this maps them to scene components. Adding a landmark
// means one entry here and one string there — GameCanvas never changes.
// A different game (Shakespeare's London, say) ships its own feature
// components and zone lists against the same seam.
const FEATURES = {
  backdrop: lazy(() => import('./Backdrop.jsx')),
  'street-surfaces': lazy(() => import('./StreetSurfaces.jsx')),
  'street-dressing': lazy(() => import('./StreetDressing.jsx')),
  pedestrians: lazy(() => import('./Pedestrians.jsx')),
  dandies: lazy(() => import('./Dandies.jsx')),
  'street-speaker': lazy(() => import('./TeddyRoosevelt.jsx')),
  'park-gardener': lazy(() => import('./ParkGardener.jsx')),
  'sailor-boy': lazy(() => import('./SailorBoy.jsx')),
  'hotel-doormen': lazy(() => import('./HotelDoormen.jsx')),
  'street-police': lazy(() => import('./StreetPolice.jsx')),
  'gapstow-bridge': lazy(() => import('./GapstowBridge.jsx')),
  'schist-outcrops': lazy(() => import('./SchistOutcrops.jsx')),
  'rustic-shelters': lazy(() => import('./RusticShelters.jsx')),
  'dairy-cottage': lazy(() => import('./DairyCottage.jsx')),
  carousel: lazy(() => import('./Carousel.jsx')),
  'checkers-tables': lazy(() => import('./CheckersTables.jsx')),
  'horseless-carriage': lazy(() => import('./HorselessCarriage.jsx')),
  'horse-drawn-traffic': lazy(() => import('./HorseDrawnTraffic.jsx')),
  pushcarts: lazy(() => import('./Pushcarts.jsx')),
  'pigeon-flock': lazy(() => import('./PigeonFlock.jsx')),
  bees: lazy(() => import('./BeeSwarms.jsx')),
  butterflies: lazy(() => import('./Butterflies.jsx')),
  fireflies: lazy(() => import('./Fireflies.jsx')),
};

export default function ZoneFeatures({ zone, runtime, ids = zone.features ?? [], suspendTogether = false }) {
  const nodes = ids.map((id) => {
    const Feature = FEATURES[id];
    return Feature ? <Feature key={id} runtime={runtime} /> : null;
  });
  if (suspendTogether) return nodes;
  return nodes.map((node, index) => (
    <Suspense key={ids[index]} fallback={null}>
      {node}
    </Suspense>
  ));
}
