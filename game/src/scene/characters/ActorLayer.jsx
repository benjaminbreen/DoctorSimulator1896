import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import * as THREE from 'three';
import { useLoader } from '@react-three/fiber';
import RendererCActor from './RendererCActor.jsx';
import { gameDebug } from '../../debug.js';

const MANIFEST = '/models/characters/renderer-c-cohorts.json';

export default function ActorLayer({ actors = [], warm = null }) {
  const source = useLoader(THREE.FileLoader, MANIFEST);
  const manifest = useMemo(() => JSON.parse(source), [source]);
  useEffect(() => {
    const requested = actors.map((actor) => actor.id);
    const loaded = gameDebug.actors.loaded.filter((id) => requested.includes(id));
    gameDebug.actors = { requested, loaded };
  }, [actors]);
  useEffect(() => () => { gameDebug.actors = { requested: [], loaded: [] }; }, []);
  // Keep a warmed patient mounted until their real actor is ready. Unmounting
  // it disposes its materials, and three.js would delete the shader programs
  // the real actor is about to reuse.
  const [warmed, setWarmed] = useState([]);
  const [settled, setSettled] = useState(() => new Set());
  const onStage = actors.filter((actor) => actor.visible !== false);
  const present = actors.some((actor) => actor.id === warm?.id);
  const quiet = onStage.every((actor) => settled.has(actorKey(actor)));
  // Building the hidden patient blocks the main thread for about 0.4 s. Wait
  // until the patients on stage are seated and the consultation camera has
  // settled, then for an idle moment.
  useEffect(() => {
    if (!warm || present || !quiet) return undefined;
    const idle = window.requestIdleCallback ?? ((callback) => setTimeout(callback, 1));
    const cancel = window.cancelIdleCallback ?? clearTimeout;
    let handle = null;
    const timer = setTimeout(() => {
      handle = idle(() => setWarmed((list) => list.some((recipe) => recipe.id === warm.id) ? list : [...list, warm]), { timeout: 3000 });
    }, 3000);
    return () => { clearTimeout(timer); if (handle !== null) cancel(handle); };
  }, [warm, present, quiet]);
  const onReady = useCallback((id) => {
    if (!gameDebug.actors.loaded.includes(id)) gameDebug.actors.loaded.push(id);
    setWarmed((list) => list.filter((recipe) => recipe.id !== id));
  }, []);
  const hidden = warmed.filter((recipe) => recipe.id === warm?.id || actors.some((actor) => actor.id === recipe.id))
    .map((recipe) => {
      const cohort = manifest.cohorts?.[recipe.cohort];
      if (recipe.renderer !== 'renderer-c' || !cohort) return null;
      // Its own boundary, so loading it never suspends the patients on stage.
      return (
        <Suspense key={`warm:${recipe.id}`} fallback={null}>
          <RendererCActor recipe={recipe} manifest={cohort} warmOnly />
        </Suspense>
      );
    });
  return [...hidden, ...onStage.map((actor) => {
    if (actor.recipe.renderer !== 'renderer-c') return null;
    const cohort = manifest.cohorts?.[actor.recipe.cohort];
    if (!cohort) return null;
    const key = actorKey(actor);
    return (
      <RendererCActor
        key={key}
        recipe={actor.recipe}
        manifest={cohort}
        onReady={onReady}
        onSettled={() => setSettled((set) => set.has(key) ? set : new Set(set).add(key))}
        walkIn={Boolean(actor.entranceToken)}
      />
    );
  })];
}

// A fresh entrance token remounts the actor, so a summoned patient walks in
// instead of already sitting there.
function actorKey(actor) {
  return actor.entranceToken ? `${actor.id}:${actor.entranceToken}` : actor.id;
}
