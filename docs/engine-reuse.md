# Engine reuse from Darwin-Game v1

Source: full architecture audit of `../Darwin-Game v1` (2026-08-05, ~194k LOC
of app source). Strategy: **new repo, not a fork** — the Darwin working tree
is 21 GB with 5.9 GB of Galapagos-laden git history. Pull modules in by copy
as the prototype demands them; extract a shared package only if/when a third
consumer appears.

All paths below are relative to `../Darwin-Game v1/`.

## Carries over cleanly (copy when needed)

- **LLM plumbing**: `utils/server/llmProvider.js` (provider-agnostic, 6
  models, env overrides) and `utils/server/llmSafety.js` (rate limiting,
  fallbacks). Zero Darwin content. Also the JSON-contract
  parse/normalize/fallback pattern in `pages/api/three-examine.js`,
  `three-encounter.js`, `three-narrate.js` — keep the code, rewrite the
  prose. The payload the client sends is already domain-neutral.
- **Persona templating**: `three-game/narrator/playableNarratorProfiles.js` —
  the animal-narrator profile → system-prompt builder is the pattern for the
  physician narrator. The Darwin human narrator is a hardcoded string; do NOT
  copy that approach.
- **Examine contract**: `{reply, fact{label, value, confidence, measurement},
  behavior, uncertainty}` maps directly to patient examination.
- **Interiors**: `three-game/interiors/` blueprint system (JSON room
  layouts). Only 2 blueprints exist in Darwin; this game is 90% interiors and
  will grow the system.
- **Library reader**: `three-game/library/`, `three-game/books/` — in-world
  reading of real sources. Core loop here (see repo memory: corpus artifact
  must stay lean; leaf-canvas cache; frameloop pauses while reading).
- **Prop framework**: `three-game/physics/propTypes.js` / `propRegistry.js`
  (carryable/breakable/hammerable) → instruments: galvanic battery,
  prescription scale, stethoscope, calipers.
- **Rendering/weather**: `SkyController.jsx`, `Lighting`, weather renderers,
  the `weatherEnv` wind bus — all zone-agnostic. Gaslight-through-window and
  rain are free. `Water.jsx` mostly rests (park pond at most).
- **Ecology renderers** for Central Park: `components/scene/ecology/`
  (InstancedGLBLayer, DenseGrassField, RockField, BirdFlock, etc.) consume
  layer descriptors, not species names.
- **Player rig + physics**: `PlayerController.jsx` orchestration,
  `usePlayerCameraRig.js`, kinematic character controller, collision adapter.
  Rig-specific hand-bone math in `PlayerModel.jsx` does not carry.
- **Registry pattern**: regions (`world/regions/index.js`), ecology,
  obstacles, model-asset manifest (`modelAssets.js` schema), sea state.
  Adopt the convention wholesale; it is the most valuable non-code asset.
- **Perf/dev tooling**: perf lab harness, quality ladder, screenshot loop
  (`docs/perf-lab.md` in the Darwin repo).

## Precedents to imitate

- **Terrain-as-structure**: the Beagle deck region proves a region need not
  be a landscape — terrain IS the deck there. The NYC block (sidewalk,
  facades, shopfront) is the same trick. No general city pipeline is needed yet.
- **JS↔GLSL mask sync rule** (Watkins, Wetlands): any authored-region mask
  must stay synced between JS and shader copies.

## Known gaps (the real new work)

1. **Victorian human NPCs** — Renderer C now provides two reusable cohort
   masters with sixteen curated face anchors, 52 named face units, fitted
   facial parts, ten seated, standing, and walking clips, a shared game/lab
   runtime, and bounded complexion and eye palettes. The remaining work is
   three approved patient outfits and the playable consultations. Broader
   wardrobe families and crowd LODs are later asset work.
2. **Interior asset set** — Victorian furniture, instruments, bottles.
3. **Patient/contagion sim** — new code, deliberately plain JS, no LLM.
4. **Prompt layer** — all three route prompts rewritten (~2,400 words), via
   the profile-templating pattern, not hardcoded strings.

## Warnings from the audit

- Darwin's wiring lives in three god-objects: `store.js` (4.4k lines),
  `ui/ThreeHUD.jsx` (4.8k), `ThreeDarwinGame.jsx` (5.2k). When copying from
  them, extract the piece; never copy a whole file.
- Darwin has zero unit tests; verification is screenshots and perf probes.
  This repo should grow logic tests alongside the sim (the contagion tick is
  ideal unit-test material).
- No heightmap/terrain import path exists in Darwin; regions are hand-written
  analytic noise. Fine here (block + park), but do not plan a street-level
  city on this engine without budgeting that pipeline.
