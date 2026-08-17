import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { getPlayer, tickPlayer } from '../world/player.js';
import { gameDebug } from '../debug.js';
import { raiseHelpForPlayer } from '../world/outcry.js';

// The player store owns its clock and passive recovery. Keeping this tiny
// bridge in the scene means simulations can stay framework-free and tested.
export default function PlayerStateStep() {
  const wasDown = useRef(false);

  useFrame((_, delta) => {
    tickPlayer(Math.min(delta, 0.1));
    const player = getPlayer();
    const down = player.clock < player.downUntil;
    // Going down is the moment somebody speaks; getting up is not.
    if (down && !wasDown.current) {
      const position = gameDebug.player.position;
      raiseHelpForPlayer({
        x: position[0],
        z: position[2],
        seed: Math.round(player.clock),
      });
    }
    wasDown.current = down;
  });

  return null;
}
