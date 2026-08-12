const MIN_FOV = 24;
const MAX_FOV = 82;
const DEFAULT_ZOOM = 0.42;

let zoom = DEFAULT_ZOOM;

export function resetInstrumentZoom() {
  zoom = DEFAULT_ZOOM;
}

export function adjustInstrumentZoom(delta) {
  zoom = Math.min(1, Math.max(0, zoom + delta));
}

export function instrumentFov(baseFov) {
  if (zoom <= DEFAULT_ZOOM) {
    const amount = zoom / DEFAULT_ZOOM;
    return MIN_FOV + (baseFov - MIN_FOV) * amount;
  }
  const amount = (zoom - DEFAULT_ZOOM) / (1 - DEFAULT_ZOOM);
  return baseFov + (MAX_FOV - baseFov) * amount;
}
