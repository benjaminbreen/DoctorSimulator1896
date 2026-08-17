// Keeps the speaker's badge over the speaker's head. The announcement names
// either an agent to follow or a fixed spot; this projects whichever it is
// into screen pixels every frame and leaves it in the store for the HUD to
// read. Nothing here re-renders React.

import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { getAnnouncement, setAnnouncementScreen } from '../world/announcements.js';
import { getAgent } from '../world/agents.js';
import { terrainHeight } from '../world/terrain.js';
import { gameDebug } from '../debug.js';

// Above a 1.62-scaled figure's hat, near enough.
const HEAD_HEIGHT = 2.15;

const point = new THREE.Vector3();

export default function AnnouncementAnchor({ exterior = true }) {
  const camera = useThree((state) => state.camera);
  const size = useThree((state) => state.size);

  useFrame(() => {
    const entry = getAnnouncement();
    if (!entry) {
      setAnnouncementScreen(0, 0, false);
      return;
    }
    const agent = entry.anchorId ? getAgent(entry.anchorId) : null;
    const x = agent?.x ?? entry.position?.[0];
    const z = agent?.z ?? entry.position?.[2];
    if (!Number.isFinite(x) || !Number.isFinite(z)) {
      setAnnouncementScreen(0, 0, false);
      return;
    }
    // headY is for a speaker on a soapbox. Otherwise the head is a height above
    // the ground they stand on — the terrain outdoors, the player's own floor
    // indoors, where the park's heightfield means nothing.
    const fixedY = Number.isFinite(entry.headY) ? entry.headY : (agent ? null : entry.position?.[1]);
    const ground = exterior ? terrainHeight(x, z) : (gameDebug.player.position?.[1] ?? 0);
    const y = Number.isFinite(fixedY) ? fixedY : ground + HEAD_HEIGHT;
    point.set(x, y, z).project(camera);
    // z past 1 is behind the camera, where the projection flips.
    const onScreen = point.z < 1
      && point.x > -1.02 && point.x < 1.02
      && point.y > -1.02 && point.y < 1.02;
    setAnnouncementScreen(
      (point.x * 0.5 + 0.5) * size.width,
      (-point.y * 0.5 + 0.5) * size.height,
      onScreen,
    );
  });

  return null;
}
