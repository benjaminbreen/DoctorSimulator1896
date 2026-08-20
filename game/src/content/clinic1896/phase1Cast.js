import { createActorInstance } from '../../world/characters/actors.js';
import { createCharacterRecipe } from '../../../../shared/characters/recipe.js';

// Technical cast for the Phase 1 runtime check. These are not authored
// patients and contain no historical or clinical claims.
// The ?v= suffix must match CACHE_BUST in scripts/characters/publish-renderer-c.mjs.
export const phase1Cast = Object.freeze([
  createActorInstance({
    id: 'phase1-woman',
    recipe: createCharacterRecipe({
      id: 'phase1-woman',
      renderer: 'renderer-c',
      cohort: 'women',
      identitySeed: 189601,
      appearanceSeed: 189601,
      anchor: { index: 1, id: '02-soft-round' },
      values: {
        age: 0.61, height: 0.46, weight: 0.49, muscle: 0.27, proportions: 0.5,
        african: 0, asian: 0, caucasian: 1,
        noseLength: -0.05, eyeSpacing: 0.04, cheekboneProminence: 0.05,
        skinTone: '#d9ad91', skinRoughness: 0.92,
        eyeColor: '#65868a', hairColor: '#4a2d20', browColor: '#3c2418',
        dressColor: '#3d2630', trimColor: '#725a50', fabricRoughness: 0.96,
      },
      restingFace: { browInnerUp: 0.035, mouthPressLeft: 0.035, mouthPressRight: 0.031 },
      presentation: { outfitId: 'golden-dress' },
      animation: { body: 'clinic-idle', expression: 'neutral', gaze: 'doctor' },
      asset: { path: '/models/characters/renderer-c-women.glb?v=cast-opt-4' },
      placement: { position: [0.45, 0, -1.7], rotation: [0, Math.PI, 0], scale: 1 },
    }),
  }),
  createActorInstance({
    id: 'phase1-man',
    recipe: createCharacterRecipe({
      id: 'phase1-man',
      renderer: 'renderer-c',
      cohort: 'men',
      identitySeed: 189602,
      appearanceSeed: 189602,
      anchor: { index: 5, id: '06-long-greek' },
      values: {
        age: 0.67, height: 0.54, weight: 0.52, muscle: 0.38, proportions: 0.5,
        african: 0, asian: 0, caucasian: 1,
        headWidth: -0.035, noseBridge: 0.06, mouthWidth: -0.025,
        skinTone: '#c89578', skinRoughness: 0.94,
        eyeColor: '#735b3f', hairColor: '#33231d', browColor: '#2c1d18',
        dressColor: '#28313a', trimColor: '#615044', fabricRoughness: 0.98,
      },
      restingFace: { browDownLeft: 0.04, browDownRight: 0.036 },
      presentation: { outfitId: 'sack-suit' },
      animation: { body: 'sitting-talking', expression: 'guarded', gaze: 'away', speaking: false },
      asset: { path: '/models/characters/renderer-c-men.glb?v=cast-opt-4' },
      placement: { position: [0.45, 0, -1.7], rotation: [0, Math.PI, 0], scale: 1 },
    }),
  }),
]);
