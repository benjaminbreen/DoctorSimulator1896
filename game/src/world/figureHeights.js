// Standing height in metres for every NPC, measured to the top of the model —
// a hat counts. The character GLBs are all exported one unit tall, so the
// height is also the scale factor. Adults in 1896 New York ran shorter than
// today: men averaged about 1.70 m, women about 1.58 m. The player is 1.68 m
// (his capsule, in tuning), so he stands mid-range among the men.
const FIGURE_HEIGHTS = Object.freeze({
  'bowler-man': 1.74,
  'strawhat-pedestrian': 1.73,
  'tophat-dandy': 1.78,
  'hotel-doorman': 1.79,
  'street-policeman': 1.80,
  'hotel-bellhop': 1.66,
  'park-gardener': 1.70,
  'cab-driver': 1.72,
  'carriage-driver': 1.72,
  'pushcart-vendor': 1.69,
  'teddy-roosevelt': 1.76,
  'working-woman': 1.60,
  'summer-dress-woman': 1.61,
  'somber-seated-woman': 1.58,
  'forties-walking-woman': 1.59,
  'nursemaid': 1.60,
  'lilac-dress-woman': 1.62,
  'rational-dress-woman': 1.63,
  'hotel-maid': 1.57,
  'news-boy': 1.45,
  'sailor-boy': 1.18,
});

export function figureHeight(id) {
  return FIGURE_HEIGHTS[id] ?? 1.70;
}
