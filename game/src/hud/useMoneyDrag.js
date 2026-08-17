// Dragging a piece of money out of the billfold and onto the world. Pointer
// events rather than HTML5 drag-and-drop, because the drop target is a 3D
// scene: the wallet only reports where the piece was released, and
// dropTargets.js decides what was under it.

import { useCallback, useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { gameDebug } from '../debug.js';
import { listAgents } from '../world/agents.js';
import { terrainHeight } from '../world/terrain.js';
import { OFFER_RANGE, pickDropTarget } from '../world/dropTargets.js';

const projected = new THREE.Vector3();
// Agents report only x and z, so the chest has to be built from the ground
// under them. Aiming at a fixed world height put the target below their feet.
const CHEST_ABOVE_GROUND = 1.15;

// Everyone within conversational reach who could be handed something, in
// screen coordinates.
function offerCandidates() {
  const camera = gameDebug.camera;
  const player = gameDebug.player?.position;
  if (!camera || !player) return [];
  const width = window.innerWidth;
  const height = window.innerHeight;
  const candidates = [];
  for (const agent of listAgents()) {
    if (!agent?.dialogueId) continue;
    const distance = Math.hypot(agent.x - player[0], agent.z - player[2]);
    projected.set(agent.x, terrainHeight(agent.x, agent.z) + CHEST_ABOVE_GROUND, agent.z);
    projected.project(camera);
    candidates.push({
      id: agent.dialogueId,
      name: agent.dialogueName ?? 'someone',
      distance,
      behindCamera: projected.z > 1,
      screenX: (projected.x * 0.5 + 0.5) * width,
      screenY: (projected.y * -0.5 + 0.5) * height,
    });
  }
  return candidates;
}

export function useMoneyDrag(onDrop) {
  const [drag, setDrag] = useState(null);
  const dragRef = useRef(null);
  dragRef.current = drag;

  const start = useCallback((piece, event) => {
    if (event.button !== undefined && event.button !== 0) return;
    event.preventDefault();
    setDrag({
      piece, x: event.clientX, y: event.clientY, over: null, candidates: offerCandidates(),
    });
  }, []);

  useEffect(() => {
    if (!drag) return undefined;
    const move = (event) => {
      const candidates = offerCandidates();
      const target = pickDropTarget({ x: event.clientX, y: event.clientY }, candidates);
      setDrag((current) => (current ? {
        ...current,
        x: event.clientX,
        y: event.clientY,
        over: target.kind === 'npc' ? target : null,
        candidates: candidates.filter((entry) => !entry.behindCamera && entry.distance <= OFFER_RANGE),
      } : current));
    };
    const up = (event) => {
      const current = dragRef.current;
      setDrag(null);
      if (!current) return;
      const target = pickDropTarget(
        { x: event.clientX, y: event.clientY },
        offerCandidates(),
      );
      onDrop(current.piece, target);
    };
    const cancel = (event) => {
      if (event.key === 'Escape') setDrag(null);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('keydown', cancel);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('keydown', cancel);
    };
  }, [drag, onDrop]);

  return { drag, start };
}
