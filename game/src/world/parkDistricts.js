// Keep the plaza and its first block together. The neighbouring strips follow
// the paths north and west, and the street grid to the south and east.
export const PARK_DISTRICTS = [
  { id: 'plaza', bounds: [55, 134, 42, 116] },
  { id: 'pond', bounds: [-120, 57, 8, 84] },
  { id: 'south', bounds: [-120, 55, 84, 182] },
  { id: 'east', bounds: [134, 244, 42, 182] },
  { id: 'fifty-eighth', bounds: [55, 134, 116, 182] },
  { id: 'north', bounds: [-120, 55, -112, 8] },
  { id: 'fifth', bounds: [55, 244, -112, 42] },
];

export function distanceToDistrict([x, , z], { bounds: [left, right, top, bottom] }) {
  return Math.hypot(Math.max(left - x, x - right, 0), Math.max(top - z, z - bottom, 0));
}

export function parkDistrictFor(position) {
  return PARK_DISTRICTS.reduce((nearest, district) =>
    distanceToDistrict(position, district) < distanceToDistrict(position, nearest) ? district : nearest,
  );
}

export function isGroundCover(item) {
  return item.id?.startsWith('cover-') || item.id?.startsWith('tuft-');
}
