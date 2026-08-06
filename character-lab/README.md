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

- `public/presets/*.json` — the contract. One preset = one patient. 83 values.
- `scripts/characters/generate_patient.py` — Blender build: MPFB body, face
  and body identity baked before fitted attachments, game rig, seated pose, two idle
  clips (ClinicIdle, RestlessIdle) stashed via NLA. **No costume** — the body
  ships in the recolored base garment only.
- `src/costume.js` — procedural 1890s costume built at the rest pose and
  attached to bones, rebuilt live when sliders move: skirt (standing or seated
  with lap drape), leg-of-mutton sleeves, cuffs, collar and buttons.
- `src/hair/` — modular period-hair system: scalp sampling, anatomical
  style-specific hairlines, true open parts, textured under-shells,
  directional locks, alpha-tested wisps, waves, chignons and coiled buns.
- `src/idle.js` — layered procedural performance: breathing (rate and
  amplitude), weight shift, fidget, gaze saccades, hand tension (curls real
  finger bones), hand tremor (symptom display), knee adduction, plus one-shot
  gestures (nod, shake, sigh, glance) from the Perform row.
- `src/patients/` — seeded NYC 1896 patient-domain generator plus the one-way
  adapter into the render preset. Identity, household, clinic access, complaint,
  clothing, appearance and performance remain linked in the exported JSON.

## Procedural patients

`Seeded variation` now generates a coherent patient rather than independently
randomizing sliders. The demographic model first draws a social/access route to
the clinic, then weights city origin profiles by that route. Clinical state is
mapped into performance controls; class, occupation and mourning map into dress;
age and origin map probabilistically into body and appearance.

The patient-domain record is stored at the top-level `patient` key in every
generated preset. See `src/patients/README.md` for module boundaries and extension
rules, and `public/schema/patient.schema.json` for the record contract.

```
npm run patient:test          # determinism, coherence and render-contract tests
npm run hair:test             # hairline bounds and deterministic geometry tests
npm run patient:audit -- 2000 # inspect generated distributions
```

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
- Orange controls alter identity and require **Regenerate model**. In local
  development the Vite endpoint runs headless Blender, atomically replaces the
  GLB, saves the preset, and reloads the lab. Seeded variation does this
  automatically. Blue controls remain immediate Three.js changes.
- Identity morphs must be baked before adding the rig, eyes, teeth, proxy
  garments, and other fitted assets. Replaying them on the skin alone causes
  floating facial features and must never be used for character variation.
- Seated rigs are aligned from the generated pelvis position to the 0.455 m
  chair surface; never use a fixed vertical offset across body proportions.
- Seed demographics use an explicit 1896 elite-clinic profile rather than
  choosing MPFB ancestry targets uniformly. Hair and eye palettes are
  conditional on that profile; both remain manually editable live controls.

## Known gaps

- Base garment is still a recolored MakeHuman suit; the procedural layers
  cover most of it, but a real bodice/skirt garment remains the asset gap.
- Facial expressions currently use runtime-computed morphs; authored Blender
  targets remain the longer-term route for a larger affect vocabulary.
- GLB is unoptimized (~32k tris, ~8 MB); run the Darwin gltf-transform pass
  before game use.
