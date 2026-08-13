import { createCharacterRecipe, validateCharacterRecipe } from '../../../../shared/characters/recipe.js';

export function createActorInstance(input = {}) {
  const recipe = createCharacterRecipe(input.recipe || input);
  return {
    id: String(input.id || recipe.id),
    recipe,
    visible: input.visible !== false,
  };
}

export function updateActorCue(actor, cue = {}) {
  if (!actor) return actor;
  const normalized = createCharacterRecipe({
    ...actor.recipe,
    animation: { ...actor.recipe.animation, ...cue },
  });
  return {
    ...actor,
    // Animation is the only live part of a consultation cue. Preserve the
    // appearance, asset, and placement references so the renderer can keep
    // its cloned skeleton and mixer instead of rebuilding the whole patient.
    recipe: {
      ...actor.recipe,
      animation: normalized.animation,
    },
  };
}

export function validateActors(actors, manifest = null) {
  const errors = [];
  const ids = new Set();
  for (const actor of actors || []) {
    if (ids.has(actor.id)) errors.push(`duplicate actor id: ${actor.id}`);
    ids.add(actor.id);
    for (const error of validateCharacterRecipe(actor.recipe, manifest)) {
      errors.push(`${actor.id}: ${error}`);
    }
  }
  return errors;
}

export function createActorRuntime(initialActors = []) {
  let actors = [...initialActors];
  const listeners = new Set();
  const publish = () => {
    const snapshot = [...actors];
    for (const listener of listeners) listener(snapshot);
  };
  return {
    get: () => [...actors],
    set(nextActors) {
      actors = [...(nextActors || [])];
      publish();
    },
    setSingle(actor) {
      actors = actor ? [actor] : [];
      publish();
    },
    cue(id, cue) {
      actors = actors.map((actor) => actor.id === id ? updateActorCue(actor, cue) : actor);
      publish();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
