// Public-domain paintings served from /art, hung by WallArt via `artTexture`.
// `aspect` is width over height, so a placement can size the frame to the
// canvas instead of stretching it.
export const PAINTINGS = [
  { texture: '/art/isle-of-the-dead.jpg', aspect: 1.88 },
  { texture: '/art/i-lock-my-door.jpg', aspect: 1.98 },
  { texture: '/art/closed-eyes.jpg', aspect: 0.81 },
  { texture: '/art/self-portrait-with-death.jpg', aspect: 0.8 },
];

export function pickPainting(roll) {
  const index = Math.floor(roll * PAINTINGS.length) % PAINTINGS.length;
  return PAINTINGS[index];
}
