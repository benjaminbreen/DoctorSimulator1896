import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { gameDebug } from '../debug.js';
import { playSfx } from '../audio/sound.js';

export function useFurnitureSound(bodyRef, item) {
  const soundAfter = useRef(0);
  const mountedAt = useRef(null);
  const response = useRef({ kind: 'furniture', id: item.id, scrapes: 0, speed: 0 });
  useFrame(({ clock }) => {
    if (!gameDebug.stats.boot.complete) return;
    const body = bodyRef.current;
    mountedAt.current ??= clock.elapsedTime;
    if (!body || (item.mass ?? 10) < 4) return;
    if (body.isSleeping()) { response.current.speed = 0; return; }
    const velocity = body.linvel();
    const speed = Math.hypot(velocity.x, velocity.z);
    response.current.speed = speed;
    if (clock.elapsedTime < soundAfter.current || clock.elapsedTime - mountedAt.current < 0.35) return;
    const position = body.translation();
    const distance = Math.hypot(position.x - gameDebug.player.position[0], position.z - gameDebug.player.position[2]);
    // Falling objects do not scrape. Only nearby pieces sliding at their
    // resting height get a short friction sound, with a gap between strokes.
    if (speed < 0.025 || Math.abs(velocity.y) > 0.2 || position.y > item.position[1] + 0.08 || distance > 5) return;
    if (playSfx('wood-scrape', Math.min(0.8, 0.12 + speed * 0.6) * (1 - distance / 5))) response.current.scrapes += 1;
    soundAfter.current = clock.elapsedTime + 0.28;
  });
  return response.current;
}
