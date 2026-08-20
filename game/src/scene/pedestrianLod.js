export const PEDESTRIAN_LOD_ENTER_DISTANCE = 30;
export const PEDESTRIAN_LOD_EXIT_DISTANCE = 25;

// Separate enter and exit distances stop the mesh from switching back and
// forth when a pedestrian walks along the boundary.
export function useFarPedestrianLod(currentlyFar, distanceSquared) {
  const threshold = currentlyFar
    ? PEDESTRIAN_LOD_EXIT_DISTANCE
    : PEDESTRIAN_LOD_ENTER_DISTANCE;
  return distanceSquared > threshold * threshold;
}
