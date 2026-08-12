import { useFrame } from '@react-three/fiber';

// The civil clock is session state, not a tuning parameter. This bridge keeps
// the existing rendering readers live while they migrate off the tuning store.
export default function WorldClockStep({ clock, runtime }) {
  useFrame((_, delta) => {
    // Keep civil time honest at a low frame rate. Long stalls are capped at a
    // second, so returning to a suspended tab cannot skip an afternoon.
    clock.tick(Math.min(delta, 1));
    runtime.values.timeOfDay = clock.getVisualHours();
    runtime.values.dayOfYear = clock.getVisualDate().dayOfYear;
  });
  return null;
}
