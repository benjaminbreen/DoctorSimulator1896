import { shouldRecycleWebGLContextOnTravel } from './mobileGraphics.js';

export function streamPlayerDetail() {
  return typeof globalThis.DecompressionStream === 'function';
}

export function playerAvatarUrl() {
  if (streamPlayerDetail()) return '/models/tripo-victorian-player-opening.glb.gz?v=1';
  return `/models/${playerModelName()}.glb?v=player-motion-1`;
}

function playerModelName() {
  return shouldRecycleWebGLContextOnTravel()
    ? 'tripo-victorian-player-mobile'
    : 'tripo-victorian-player';
}

export function playerDetailUrl() {
  return `/models/${playerModelName()}-detail.glb?v=1`;
}
