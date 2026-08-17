// Click a person to see who they are. The ray is tested against the agent
// positions rather than their meshes: every kind of figure reports one, so a
// doorman, a pedestrian and the park keeper all answer the same way.

import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { useThree } from '@react-three/fiber';
import { listAgents } from '../world/agents.js';
import { announce, CARRY } from '../world/announcements.js';
import { badgeFor } from '../world/acquaintance.js';
import { npcDialogueDefinition } from '../world/npcDialogue.js';
import { gameDebug } from '../debug.js';

// Chest height above the floor the player is standing on, and how wide a
// target a person is to a click.
const CHEST = 1.15;
const HEAD = 2.05;
const HIT_RADIUS = 0.62;
const MAX_DISTANCE = 40;
// A drag of the canvas turns the camera; only a still click is a question.
const CLICK_SLOP = 5;
const CLICK_MS = 500;

function pickAgent(ray, floorY) {
  let best = null;
  let bestDistance = MAX_DISTANCE;
  const point = new THREE.Vector3();
  for (const agent of listAgents()) {
    if (!agent?.dialogueId || !Number.isFinite(agent.x)) continue;
    point.set(agent.x, floorY + CHEST, agent.z);
    const along = ray.origin.distanceTo(point);
    if (along > bestDistance) continue;
    if (ray.distanceSqToPoint(point) > HIT_RADIUS * HIT_RADIUS) continue;
    best = agent;
    bestDistance = along;
  }
  return best;
}

export default function NpcInspect() {
  const camera = useThree((state) => state.camera);
  const gl = useThree((state) => state.gl);
  const raycaster = useMemo(() => new THREE.Raycaster(), []);
  const pointer = useMemo(() => new THREE.Vector2(), []);

  useEffect(() => {
    const element = gl.domElement;
    let downX = 0;
    let downY = 0;
    let downAt = 0;

    const onDown = (event) => {
      if (event.button !== 0) return;
      downX = event.clientX;
      downY = event.clientY;
      downAt = performance.now();
    };

    const onUp = (event) => {
      if (event.button !== 0) return;
      if (performance.now() - downAt > CLICK_MS) return;
      if (Math.hypot(event.clientX - downX, event.clientY - downY) > CLICK_SLOP) return;
      const rect = element.getBoundingClientRect();
      pointer.set(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        -((event.clientY - rect.top) / rect.height) * 2 + 1,
      );
      raycaster.setFromCamera(pointer, camera);
      const floorY = gameDebug.player.position?.[1] ?? 0;
      const agent = pickAgent(raycaster.ray, floorY);
      if (!agent) return;
      const badge = badgeFor(
        agent.dialogueId,
        npcDialogueDefinition(agent.dialogueId),
        agent.dialogueName,
      );
      announce({
        ...badge,
        line: null,
        carry: CARRY.inspect,
        seconds: 4.5,
        anchorId: agent.id,
        headY: floorY + HEAD,
      });
    };

    element.addEventListener('pointerdown', onDown);
    element.addEventListener('pointerup', onUp);
    return () => {
      element.removeEventListener('pointerdown', onDown);
      element.removeEventListener('pointerup', onUp);
    };
  }, [camera, gl, pointer, raycaster]);

  return null;
}
