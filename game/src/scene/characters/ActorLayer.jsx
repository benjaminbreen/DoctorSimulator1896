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
  const present = actors.some((actor) => actor.id === warm?.id);
  useEffect(() => {
    if (warm && !present) setWarmed((list) => list.some((recipe) => recipe.id === warm.id) ? list : [...list, warm]);
  }, [warm, present]);
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
  return [...hidden, ...actors.filter((actor) => actor.visible !== false).map((actor) => {
    if (actor.recipe.renderer !== 'renderer-c') return null;
    const cohort = manifest.cohorts?.[actor.recipe.cohort];
    if (!cohort) return null;
    // A fresh entrance token remounts the actor, so a summoned patient walks
    // in instead of already sitting there.
    const key = actor.entranceToken ? `${actor.id}:${actor.entranceToken}` : actor.id;
    return (
      <RendererCActor
        key={key}
        recipe={actor.recipe}
        manifest={cohort}
        onReady={onReady}
        walkIn={Boolean(actor.entranceToken)}
      />
    );
  })];
}
