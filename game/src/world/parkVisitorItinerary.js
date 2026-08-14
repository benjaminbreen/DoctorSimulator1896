import { PATHS } from './centralPark.js';
import { CAROUSEL } from './carousel.js';
import { ROADS, SIDEWALK_WIDTH } from './streetGrid.js';

const CAROUSEL_DEPARTURE_HOUR = 9 + 34 / 60;
const PERIMETER_DEPARTURE_HOUR = 12;
// Four civil seconds pass per real second at the normal clock rate, so this
// produces the ordinary 1.35 m/s pedestrian pace.
const CIVIL_WALK_METRES_PER_SECOND = 1.35 / 4;

function pathPoints(id) {
  const path = PATHS.find((entry) => entry.id === id);
  if (!path) throw new Error(`Unknown visitor path: ${id}`);
  return path.points;
}

function road(id) {
  const found = ROADS.find((entry) => entry.id === id);
  if (!found) throw new Error(`Unknown visitor road: ${id}`);
  return found;
}

function freezePoints(points) {
  return Object.freeze(points.map(([x, z]) => Object.freeze([x, z])));
}

function routeLength(points) {
  let total = 0;
  for (let index = 0; index < points.length - 1; index += 1) {
    total += Math.hypot(
      points[index + 1][0] - points[index][0],
      points[index + 1][1] - points[index][1],
    );
  }
  return total;
}

const centerDrive = pathPoints('center-drive');
const dairyWalk = pathPoints('dairy-walk');
const carouselWalk = pathPoints('carousel-walk');

// She starts beside the player, joins Center Drive, cuts across the short
// lawn link to the Green, and reaches the carousel by its north entry.
const toCarouselPoints = freezePoints([
  [78, 64],
  centerDrive[1],
  ...centerDrive.slice(2, 10),
  [-8, -46],
  dairyWalk[1],
  ...carouselWalk.slice(1),
]);

// At noon she retraces the connected park walks to Scholars' Gate before
// joining the city pavement. This is a one-time approach, not part of the
// repeating street circuit.
const toPerimeterPoints = freezePoints([
  ...carouselWalk.slice().reverse(),
  dairyWalk[0],
  centerDrive[9],
  ...centerDrive.slice(0, 9).reverse(),
  [94, 80],
  [road('fifth-ave').lo - SIDEWALK_WIDTH / 2, road('cps').lo - SIDEWALK_WIDTH / 2],
]);

const cpsNorth = road('cps').lo - SIDEWALK_WIDTH / 2;
const madisonWest = road('madison-ave').lo - SIDEWALK_WIDTH / 2;
const fiftySeventhNorth = road('fifty-seventh').lo - SIDEWALK_WIDTH / 2;
const sixthWest = road('sixth-ave').lo - SIDEWALK_WIDTH / 2;
const fifthWest = road('fifth-ave').lo - SIDEWALK_WIDTH / 2;

const perimeterPoints = freezePoints([
  [fifthWest, cpsNorth],
  [madisonWest, cpsNorth],
  [madisonWest, fiftySeventhNorth],
  [sixthWest, fiftySeventhNorth],
  [sixthWest, cpsNorth],
  [fifthWest, cpsNorth],
]);

function route(id, label, points, onTerrain, roadIds = []) {
  return Object.freeze({
    id,
    label,
    points,
    length: routeLength(points),
    onTerrain,
    loop: points[0][0] === points.at(-1)[0] && points[0][1] === points.at(-1)[1],
    roadIds: Object.freeze([...roadIds]),
  });
}

const toCarousel = route('pond-to-carousel', 'To the carousel', toCarouselPoints, true);

export const PARK_VISITOR_ITINERARY = Object.freeze({
  id: 'pond-walk-visitor',
  label: 'Carousel and city-road itinerary',
  who: 'd',
  age: 24,
  initialYaw: -0.6,
  loiterYaw: Math.atan2(CAROUSEL.x - 6.1, CAROUSEL.z - (-48.8)),
  carouselDepartureHour: CAROUSEL_DEPARTURE_HOUR,
  carouselArrivalHour: CAROUSEL_DEPARTURE_HOUR
    + toCarousel.length / CIVIL_WALK_METRES_PER_SECOND / 3600,
  perimeterDepartureHour: PERIMETER_DEPARTURE_HOUR,
  toCarousel,
  toPerimeter: route('carousel-to-city-roads', 'Carousel to Scholars’ Gate', toPerimeterPoints, true),
  perimeter: route(
    'city-road-perimeter',
    'Central Park South–Madison–57th–Sixth circuit',
    perimeterPoints,
    false,
    ['cps', 'madison-ave', 'fifty-seventh', 'sixth-ave'],
  ),
});

export function parkVisitorItineraryState(timeOfDay) {
  const hour = ((Number(timeOfDay) || 0) % 24 + 24) % 24;
  const itinerary = PARK_VISITOR_ITINERARY;
  const boundaryEpsilon = 1e-9;
  if (hour < itinerary.carouselDepartureHour - boundaryEpsilon) {
    return {
      phase: 'waiting-near-pond', action: 'Idle', moving: false,
      route: itinerary.toCarousel, distance: 0, yaw: itinerary.initialYaw,
      animationTimeScale: 1,
    };
  }
  if (hour < itinerary.carouselArrivalHour - boundaryEpsilon) {
    const distance = Math.max(0, (hour - itinerary.carouselDepartureHour)
      * 3600 * CIVIL_WALK_METRES_PER_SECOND);
    return {
      phase: 'walking-to-carousel', action: 'Walk', moving: true,
      route: itinerary.toCarousel, distance, animationTimeScale: 1,
    };
  }
  if (hour < itinerary.perimeterDepartureHour - boundaryEpsilon) {
    return {
      phase: 'loitering-at-carousel', action: 'Idle', moving: false,
      route: itinerary.toCarousel, distance: itinerary.toCarousel.length,
      yaw: itinerary.loiterYaw, animationTimeScale: 1,
    };
  }

  let distance = (hour - itinerary.perimeterDepartureHour)
    * 3600 * CIVIL_WALK_METRES_PER_SECOND;
  if (distance < itinerary.toPerimeter.length) {
    return {
      phase: 'walking-to-road-perimeter', action: 'Walk', moving: true,
      route: itinerary.toPerimeter, distance, animationTimeScale: 1,
    };
  }
  distance -= itinerary.toPerimeter.length;
  return {
    phase: 'circling-road-perimeter', action: 'Walk', moving: true,
    route: itinerary.perimeter, distance: distance % itinerary.perimeter.length,
    animationTimeScale: 1,
  };
}
