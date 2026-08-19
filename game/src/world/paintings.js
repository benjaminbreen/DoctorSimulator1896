// Public-domain paintings served from /art, hung by WallArt via `artTexture`.
// `aspect` is width over height, so a placement can size the frame to the
// canvas instead of stretching it.
export const PAINTINGS = [
  { texture: '/art/isle-of-the-dead.jpg', aspect: 1.88 },
  { texture: '/art/i-lock-my-door.jpg', aspect: 1.98 },
  { texture: '/art/closed-eyes.jpg', aspect: 0.81 },
  { texture: '/art/self-portrait-with-death.jpg', aspect: 0.8 },
  { texture: '/art/brooklyn-bridge.jpg', aspect: 1.39 },
  { texture: '/art/chat-noir.jpg', aspect: 0.75 },
  { texture: '/art/divan-japonais.jpg', aspect: 0.76 },
  { texture: '/art/harpers-june.jpg', aspect: 0.8 },
  { texture: '/art/just-wobbling.jpg', aspect: 0.67 },
  { texture: '/art/peacock-skirt.jpg', aspect: 0.73 },
];

// `offset` steps through the catalog so the frames in one room differ.
export function pickPainting(roll, offset = 0) {
  const index = (Math.floor(roll * PAINTINGS.length) + offset) % PAINTINGS.length;
  return PAINTINGS[index];
}
