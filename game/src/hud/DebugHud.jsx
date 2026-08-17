import { useEffect, useRef, useState } from 'react';
import { gameDebug } from '../debug.js';
import { getThrowablePlay } from '../world/throwablePlay.js';
import { throwableDefinition } from '../world/throwables.js';
import { goodOfThrowable, handVerb } from '../world/goods.js';

// Corner readout and travel prompt, refreshed on an interval, never per frame.
// The prompt remains game-facing; the stats block follows the tuning panel.
export default function DebugHud({ showStats = false }) {
  const [snapshot, setSnapshot] = useState(null);
  const cachedSceneMetrics = useRef(null);
  const nextSceneSampleAt = useRef(0);

  useEffect(() => {
    const id = setInterval(() => {
      const { position, grounded } = gameDebug.player;
      const render = gameDebug.renderer?.info?.render;
      const now = globalThis.performance?.now?.() ?? Date.now();
      // sceneMetrics traverses the full Three scene. It changes only when a
      // staged batch arrives, so sampling it five times per second adds hitches
      // without adding useful information to the tuning readout.
      if (now >= nextSceneSampleAt.current) {
        cachedSceneMetrics.current = gameDebug.sceneMetrics();
        nextSceneSampleAt.current = now + 2500;
      }
      const scene = cachedSceneMetrics.current;
      setSnapshot({
        fps: Math.round(gameDebug.stats.fps),
        zone: gameDebug.zoneLabel ?? '',
        x: position[0].toFixed(2),
        y: position[1].toFixed(2),
        z: position[2].toFixed(2),
        grounded,
        camera: gameDebug.stats.cameraDistance.toFixed(2),
        draws: gameDebug.stats.draws,
        triangles: gameDebug.stats.triangles,
        skinned: scene?.skinnedVisible ?? 0,
        skinnedBones: scene?.skinnedBones ?? 0,
        landmarkBatches: scene?.landmarkBatches ?? 0,
        landmarkInstances: scene?.landmarkInstances ?? 0,
        sceneTriangles: scene?.estimatedTriangles ?? 0,
        prompt: gameDebug.prompt,
      });
    }, 500);
    return () => clearInterval(id);
  }, []);

  if (!snapshot) return null;
  const throwPlay = getThrowablePlay();
  const throwLabel = throwableDefinition(throwPlay.heldType)?.label.toLowerCase() ?? 'object';
  // Not everything carried is for throwing: E runs the good's first verb.
  const heldVerb = handVerb(goodOfThrowable(throwPlay.heldType)?.id);
  const contextualPrompt = throwPlay.phase === 'held'
    ? (heldVerb && heldVerb.id !== 'throw' ? heldVerb.label : `Throw ${throwLabel}`)
    : throwPlay.phase === 'empty'
      ? snapshot.prompt
      : null;
  return (
    <>
      {showStats && (
        /* Below the game chrome's top bar, clear of the clock overhang. */
        <div className="pointer-events-none absolute left-3 top-28 rounded bg-black/55 px-3 py-2 font-mono text-[11px] leading-relaxed text-neutral-300">
          <div className="text-amber-200">{snapshot.zone}</div>
          <div>{snapshot.fps} fps</div>
          <div>{snapshot.draws} draws · {Math.round(snapshot.triangles / 1000)}k tris</div>
          <div>{snapshot.skinned} figures · {snapshot.skinnedBones} bones</div>
          <div>{snapshot.landmarkBatches} landmark batches · {snapshot.landmarkInstances} instances</div>
          <div>{Math.round(snapshot.sceneTriangles / 1000)}k scene tris (geometry estimate)</div>
          <div>
            pos {snapshot.x}, {snapshot.y}, {snapshot.z}
          </div>
          <div>
            {snapshot.grounded ? 'grounded' : 'airborne'} · cam {snapshot.camera}m
          </div>
        </div>
      )}
      {contextualPrompt && (
        <div className="debug-prompt pointer-events-none absolute bottom-32 left-1/2 -translate-x-1/2 rounded border border-amber-300/40 bg-black/70 px-4 py-2 text-sm text-amber-100">
          <span className="debug-prompt-key mr-2 rounded border border-amber-300/60 px-1.5 font-mono text-xs">E</span>
          {contextualPrompt}
        </div>
      )}
    </>
  );
}
