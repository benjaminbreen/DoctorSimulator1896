# 1896 Character Lab

Preset-driven pipeline for game-ready 1890s patients: MPFB parametric body in
Blender, procedural costume and layered idle animation in three.js.

## Run

```
npm run lab                 # viewer at http://localhost:5173 (or --port N)
npm run character:generate  # rebuild the GLB from the preset via headless Blender
npm run character:validate  # check preset against the schema
```

Requires Blender at `/Applications/Blender.app` with the MPFB extension and
the MakeHuman system assets pack installed (override with `make BLENDER=…`).

## How it fits together

- `public/presets/*.json` — the contract. One preset = one patient. 66 values.
- `scripts/characters/generate_patient.py` — Blender build: MPFB body, face
  morphs (exported as GLB morph targets), game rig, seated pose, two idle
  clips (ClinicIdle, RestlessIdle) stashed via NLA. **No costume** — the body
  ships in the recolored base garment only.
- `src/costume.js` — procedural 1890s costume + hair, built at the rest pose
  and attached to bones, rebuilt live when sliders move: skirt (standing or
  seated with lap drape), leg-of-mutton sleeves, cuffs, collar, buttons, hair
  cap/part/side masses/bun styles.
- `src/idle.js` — layered procedural performance: breathing (rate and
  amplitude), weight shift, fidget, gaze saccades, hand tension (curls real
  finger bones), hand tremor (symptom display), knee adduction, plus one-shot
  gestures (nod, shake, sigh, glance) from the Perform row.

## Animation sources

`idleMode` selects: `procedural` (all sliders act instantly; the GLB clip
holds frame 0 as the pose), `clip` (baked GLB clip plays; only gaze, tremor,
and gestures layer on top), `clip+procedural` (both).

## Gotchas learned the hard way

- Every statically posed bone must be **keyed inside each exported action** —
  unkeyed bones snap back to bind pose when a clip plays in three.js.
- Never pause a clip mid-fade: a paused fade sits at zero weight and exposes
  the standing bind pose. Set full effective weight before pausing.
- Thigh Y is bone twist (invisible); knee adduction is local Z, applied live
  by the `kneesTogether` control, mirrored between legs.
- The costume must be rebuilt with the skeleton snapped to rest, or the
  current animation pose bakes into the geometry.
- `window.__lab` in the viewer console exposes scene/bones/preset/idle for
  calibration probes.

## Known gaps

- Base garment is still a recolored MakeHuman suit; the procedural layers
  cover most of it, but a real bodice/skirt garment remains the asset gap.
- No expression morphs yet (identity morphs only). Add MakeHuman expression
  targets in the Blender build, keyed to the game's affect vocabulary.
- GLB is unoptimized (~32k tris, ~11 MB); run the Darwin gltf-transform pass
  before game use.
