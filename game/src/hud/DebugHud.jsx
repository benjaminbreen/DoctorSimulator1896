import {
  useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore,
} from 'react';
import { gameDebug } from '../debug.js';
import { getThrowablePlay } from '../world/throwablePlay.js';
import { throwableDefinition } from '../world/throwables.js';
import { goodOfThrowable, handVerb } from '../world/goods.js';
import { getAnnouncement, subscribeAnnouncement } from '../world/announcements.js';

const DIALOGUE_GAP = 12;

// Corner readout and travel prompt, refreshed on an interval, never per frame.
// The prompt remains game-facing; the stats block follows the tuning panel.
export default function DebugHud({ showStats = false }) {
  const [snapshot, setSnapshot] = useState(null);
  const announcement = useSyncExternalStore(subscribeAnnouncement, getAnnouncement);
  const [dialogueBottom, setDialogueBottom] = useState(null);
  const cachedSceneMetrics = useRef(null);
  const nextSceneSampleAt = useRef(0);

  // The event line moves to clear whatever HUD occupies the foot of the
  // screen. Read its final position instead of copying that layout here.
  useLayoutEffect(() => {
    if (!announcement?.line) {
      setDialogueBottom(null);
      return undefined;
    }
    let frame = 0;
    let resizeObserver = null;
    let mutationObserver = null;
    let line = null;
    const place = () => {
      line = document.querySelector('.event-dialogue:not(.event-dialogue--raised) .event-line');
      if (!line) {
        setDialogueBottom(null);
        return;
      }
      const rect = line.getBoundingClientRect();
      setDialogueBottom(Math.ceil(window.innerHeight - rect.top + DIALOGUE_GAP));
    };
    const watch = () => {
      place();
      if (!line) return;
      resizeObserver = new ResizeObserver(place);
      resizeObserver.observe(line);
      mutationObserver = new MutationObserver(place);
      mutationObserver.observe(line, { attributes: true, attributeFilter: ['class', 'style'] });
    };
    frame = requestAnimationFrame(watch);
    window.addEventListener('resize', place);
    return () => {
      cancelAnimationFrame(frame);
      resizeObserver?.disconnect();
      mutationObserver?.disconnect();
      window.removeEventListener('resize', place);
    };
  }, [announcement?.id, announcement?.line]);

  useEffect(() => {
    if (showStats) nextSceneSampleAt.current = 0;
    const id = setInterval(() => {
      const { position, grounded } = gameDebug.player;
      const render = gameDebug.renderer?.info?.render;
      const now = globalThis.performance?.now?.() ?? Date.now();
      // sceneMetrics traverses the full Three scene. It changes only when a
      // staged batch arrives, so sampling it five times per second adds hitches
      // without adding useful information to the tuning readout.
      if (showStats && now >= nextSceneSampleAt.current) {
        cachedSceneMetrics.current = gameDebug.sceneMetrics();
        nextSceneSampleAt.current = now + 2500;
      }
      const scene = cachedSceneMetrics.current;
      setSnapshot({
        fps: Math.round(gameDebug.stats.fps),
        pixelRatio: gameDebug.stats.pixelRatio.toFixed(2),
        graphicsQuality: gameDebug.stats.graphicsQuality,
        zone: gameDebug.zoneLabel ?? '',
        x: position[0].toFixed(2),
        y: position[1].toFixed(2),
        z: position[2].toFixed(2),
        grounded,
        camera: gameDebug.stats.cameraDistance.toFixed(2),
        draws: gameDebug.stats.draws,
        triangles: gameDebug.stats.triangles,
        pedestrianFarLods: gameDebug.stats.pedestrianFarLods,
        pedestrianLodTotal: gameDebug.stats.pedestrianLodTotal,
        skinned: scene?.skinnedVisible ?? 0,
        skinnedBones: scene?.skinnedBones ?? 0,
        landmarkBatches: scene?.landmarkBatches ?? 0,
        landmarkInstances: scene?.landmarkInstances ?? 0,
        sceneTriangles: scene?.estimatedTriangles ?? 0,
        prompt: gameDebug.prompt,
      });
    }, 500);
    return () => clearInterval(id);
  }, [showStats]);

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
          <div>{snapshot.fps} fps · {snapshot.graphicsQuality} · {snapshot.pixelRatio}× DPR</div>
          <div>{snapshot.draws} draws · {Math.round(snapshot.triangles / 1000)}k tris</div>
          <div>{snapshot.skinned} figures · {snapshot.skinnedBones} bones</div>
          <div>{snapshot.pedestrianFarLods}/{snapshot.pedestrianLodTotal} pedestrian far LODs</div>
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
        <div
          className="debug-prompt pointer-events-none absolute bottom-32 left-1/2 -translate-x-1/2 rounded border border-amber-300/40 bg-black/70 px-4 py-2 text-sm text-amber-100"
          style={dialogueBottom === null ? undefined : { bottom: `${dialogueBottom}px` }}
        >
          <span className="debug-prompt-key mr-2 rounded border border-amber-300/60 px-1.5 font-mono text-xs">E</span>
          {contextualPrompt}
        </div>
      )}
    </>
  );
}
