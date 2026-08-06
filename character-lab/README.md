# 1896 Character Lab

Preset-driven pipeline for game-ready 1890s patients: MPFB parametric body in
Blender, procedural costume and layered idle animation in three.js.

## Run

```
npm run lab                 # viewer at http://localhost:5173 (or --port N)
npm run character:generate  # rebuild the GLB from the preset via headless Blender
npm run character:validate  # check preset against the schema
```

Requires Blender at `/Applications/Blender.app` with MPFB 2.0.16 or newer,
the MakeHuman system assets, and MPFB's official `faceunits01` asset pack
installed (override with `make BLENDER=…`). The generator fails early with a
clear error if the face-unit pack is missing instead of silently exporting a
character without facial controls.

## How it fits together

The header keeps patient generation separate from asset baking:

- **Appearance variation** advances the appearance seed and rerolls the current
  patient's body, face, hair, palette, clothing, and surface controls without
  replacing her identity, case record, or clinically derived performance.
- **New random patient** advances the patient seed, creates a new identity,
  household, clinical presentation, appearance, and performance profile, then
  immediately rebuilds both Blender renderers so the visible person matches.
- **Regenerate model** sends manually tuned or appearance-variation controls to
  Blender when the user is ready.
- Each generated renderer-A patient receives a coherent resting-face signature
  assembled from all 52 available MPFB units. **Surprise me** below the atomic
  debugger rerolls only that signature live; performances layer over it.

- `public/presets/*.json` — the contract. One preset = one patient. 100 values.
- `scripts/characters/generate_patient.py` — Blender build: MPFB body, face
  and body identity baked before fitted attachments, all installed ARKit-named
  face units loaded and interpolated onto fitted facial assets, game rig,
  seated pose, and two idle clips (ClinicIdle, RestlessIdle) stashed via NLA.
  **No costume** — the body ships in the recolored base garment only.
- `src/costume.js` — procedural 1890s costume built at the rest pose and
  attached to bones, rebuilt live when sliders move: skirt (standing or seated
  with lap drape), leg-of-mutton sleeves, cuffs, collar and buttons.
- `src/hair/` — modular period-hair system: scalp sampling, anatomical
  style-specific hairlines, true open parts, textured under-shells,
  directional locks, alpha-tested wisps, waves, chignons and coiled buns.
- `src/stylized.js` — shared live skin treatment for both renderer topologies:
  anatomy-guided facial colour, capillary colour, procedural microstructure,
  pore scale, pigment variation, lip tint, and eye-white contrast. Freckles and
  lip pigment use a landmark-derived UV overlay so their edges are independent
  of either renderer's triangles. B also uses this module for its stronger
  faceted-normal and portrait-light treatment;
  A preserves its original indexed topology, diffuse texture, and morphs.
- `src/idle.js` — layered procedural performance: breathing (rate and
  amplitude), weight shift, fidget, gaze saccades, hand tension (curls real
  finger bones), hand tremor (symptom display), knee adduction, plus one-shot
  gestures (nod, shake, sigh, glance) from the Perform row.
- `src/expressions.js` — semantic smile, sadness, and fatigue performances
  composed from the face-unit names actually discovered in the GLB. The same
  runtime scheduler supplies attack, hold, release, asymmetry, and delayed eye
  involvement; it no longer manufactures renderer-A facial geometry.
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

Skin-rendering values are generated as identity consequences, not renderer-B
decoration. Older patients trend toward more micro-detail, larger visible pore
scale, greater pigment unevenness, a rougher/more matte surface, less saturated
lips, and lower eye-white contrast. Seeded variation remains broad enough that
age does not produce identical surfaces. Every value remains live and editable
in the **Skin rendering · A and B** control group. The `stylized…` JSON prefixes
are retained for preset compatibility even though the controls are now shared.

## A/B renderers

The stage toggle switches one patient preset between two separately exported,
equally rigged interpretations:

- **A · Current** uses the MPFB basemesh and the complete exported
  `faceunits01` target library. Matching targets on brows, lashes, eyes, and
  teeth are driven together with the body.
- **B · Stylized** fits MPFB's generic female proxy, then uses protected
  decimation to target roughly 10.5k body triangles while retaining the full
  head, neck, hand and finger regions. It is derived after identity targets are
  baked, so seed, proportions, skeleton, pose, clips and patient metadata remain
  shared. B deliberately retains the legacy procedural smile, sadness, and
  fatigue controller for now: Blender's ordinary decimation workflow does not
  safely preserve an existing shape-key library.

`character:generate` and the local regeneration endpoint produce/cache both
GLBs together. B is an additive experiment and does not overwrite A.

```
npm run patient:test          # determinism, coherence and render-contract tests
npm run hair:test             # hairline bounds and deterministic geometry tests
npm run renderer:test         # shared rig/clips, proxy reduction and expression compatibility
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
- Facial target names and count are discovered from the exported body rather
  than assumed. The current pack exports 52 body targets, but runtime support
  is based on required sentinel names and not that number.
- A face unit must be written to every fitted mesh that exports that name.
  Driving only the body recreates the floating-feature problem for expressions.
- Renderer A's skin pass must not call `toNonIndexed()`, decimate, or otherwise
  split vertices: its complete MPFB morph library depends on stable topology.
  A's smoothing slider blends toward a topology-safe quantized normal field;
  B can use true per-triangle normals on its expression-free body proxy.

## Known gaps

- Base garment is still a recolored MakeHuman suit; the procedural layers
  cover most of it, but a real bodice/skirt garment remains the asset gap.
- Renderer-A expressions now use official MPFB named face units. Their weights
  still need visual tuning across multiple identities, and MPFB's supplied
  shapes may eventually need corrective sculpts for close-ups.
- Renderer B remains on the legacy procedural controller. If its full fitted
  proxy is too heavy, establish the reduced topology first and transfer every
  deformation delta with one deterministic nearest-surface/barycentric map;
  never decimate each expression independently.
- Speech visemes and facial mocap are not wired yet. The named target layer is
  intentionally compatible with adding either later.
- GLB is unoptimized (~32k tris, ~8 MB); run the Darwin gltf-transform pass
  before game use.

See [`docs/facial-animation.md`](../docs/facial-animation.md) for the design,
installation details, expression recipes, and renderer-B migration rule.
