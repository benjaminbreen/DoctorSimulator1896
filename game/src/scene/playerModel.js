// The player avatar's URL, in one place. The opening reveal waits on this
// file, so index.html preloads it before the bundle exists; a preload that
// names a different file than PlayerAvatar asks for costs a second full
// download instead of saving the first.

import { shouldRecycleWebGLContextOnTravel } from './mobileGraphics.js';

const VERSION = 'player-opt-1';

export function playerAvatarUrl() {
  const file = shouldRecycleWebGLContextOnTravel()
    ? 'tripo-victorian-player-mobile'
    : 'tripo-victorian-player';
  return `/models/${file}.glb?v=${VERSION}`;
}
