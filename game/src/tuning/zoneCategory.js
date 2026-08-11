// Zone ids that take the outdoor tuning preset. Future exterior zones join
// this list; everything else counts as indoors.
const OUTDOOR_ZONES = new Set(['central-park']);

export const isOutdoorZone = (id) => OUTDOOR_ZONES.has(id);
