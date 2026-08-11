import { useCallback, useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { useLoader } from '@react-three/fiber';
import RendererCActor from './RendererCActor.jsx';
import { gameDebug } from '../../debug.js';

const MANIFEST = '/models/characters/renderer-c-cohorts.json';

export default function ActorLayer({ actors = [] }) {
  const source = useLoader(THREE.FileLoader, MANIFEST);
  const manifest = useMemo(() => JSON.parse(source), [source]);
  useEffect(() => {
    const requested = actors.map((actor) => actor.id);
    const loaded = gameDebug.actors.loaded.filter((id) => requested.includes(id));
    gameDebug.actors = { requested, loaded };
  }, [actors]);
  useEffect(() => () => { gameDebug.actors = { requested: [], loaded: [] }; }, []);
  const onReady = useCallback((id) => {
    if (!gameDebug.actors.loaded.includes(id)) gameDebug.actors.loaded.push(id);
  }, []);
  return actors.filter((actor) => actor.visible !== false).map((actor) => {
    if (actor.recipe.renderer !== 'renderer-c') return null;
    const cohort = manifest.cohorts?.[actor.recipe.cohort];
    return cohort ? <RendererCActor key={actor.id} recipe={actor.recipe} manifest={cohort} onReady={onReady} /> : null;
  });
}
