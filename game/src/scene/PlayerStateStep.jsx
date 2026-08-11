import { useFrame } from '@react-three/fiber';
import { tickPlayer } from '../world/player.js';

// The player store owns its clock and passive recovery. Keeping this tiny
// bridge in the scene means simulations can stay framework-free and tested.
export default function PlayerStateStep() {
  useFrame((_, delta) => tickPlayer(Math.min(delta, 0.1)));
  return null;
}
