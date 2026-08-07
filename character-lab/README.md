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
- **New random patient** draws fresh patient seeds, selects the candidate whose
  baked facial landmarks are most distinct from the person currently visible,
  creates a new identity, household, clinical presentation, appearance, and
  performance profile, then immediately rebuilds renderer A.
- **Regenerate model** sends manually tuned or appearance-variation controls to
  Blender when the user is ready.
- Each generated renderer-A patient receives a coherent resting-face signature
  assembled from all 52 available MPFB units. **Surprise me** below the atomic
  debugger rerolls only that signature live; performances layer over it.
- Baked facial identity spans 37 structural controls: broad cranial archetype
  plus orbital depth and aperture, eyelid structure, brow angle, nose bridge
  and profile, mouth placement and projection, cheek height, and lower-face
  projection. Expression offsets are secondary and deliberately restrained.
- African, Asian, and European target weights are maintained as a normalized
  blend in the UI and normalized again by Blender before MPFB creates the body.

- `public/presets/*.json` — the contract. One preset = one patient; the schema
  defines the complete tunable render vector.
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
- `src/stylized.js` — topology-safe live skin treatment for A and Meta MHR:
  anatomy-guided facial colour, capillary colour, procedural microstructure,
  pore scale, pigment variation, lip tint, and eye-white contrast. Freckles and
  lip pigment use a landmark-derived UV overlay so their edges are independent
  of mesh triangles. The pass preserves A's indexed topology, diffuse texture,
  and facial morph library.
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
age, sex and origin map probabilistically into body and appearance.

The patient-domain record is stored at the top-level `patient` key in every
generated preset. See `src/patients/README.md` for module boundaries and extension
rules, and `public/schema/patient.schema.json` for the record contract.

Skin-rendering values are generated as identity consequences. Older patients
trend toward more micro-detail, larger visible pore
scale, greater pigment unevenness, a rougher/more matte surface, less saturated
lips, and lower eye-white contrast. Seeded variation remains broad enough that
age does not produce identical surfaces. Every value remains live and editable
in the **Skin rendering · A and Meta MHR** control group. The `stylized…` JSON
prefixes are retained for preset compatibility.

## A/B character engines

The stage toggle cycles two deliberately different character foundations:

- **A · MPFB** uses the generated MPFB basemesh and the complete exported
  `faceunits01` target library. Matching targets on brows, lashes, eyes, and
  teeth are driven together with the body.
- **B · Meta MHR** is the official LOD1 full-body rig: 126 bones, 45 identity
  components, 72 expression components, and 117 exported morph targets. The
  lab currently keeps its 35 MB float-attribute GLB while identity morphs are
  baked live into the base mesh and normals are refreshed. The earlier 2 MB
  8-bit-normal Meshopt proof is deferred because combining many quantized
  identity-normal deltas can add terracing to the shared shadow-map artifact.

Renderer B has a dedicated runtime adapter. It defaults to the preset's seated
state, eases between standing and sitting, and drives named MHR hip, knee,
ankle, spine, arm and head bones. Stature, body mass, muscularity, proportions,
shoulder width, torso length and the existing face controls update live. The
detailed face controls are anatomical projections into MHR's 20 latent head
components; no individual PCA component is mislabeled as a semantic morph.
Apparent age is primarily carried by surface treatment with only a restrained
shape tendency. MHR does not ship labeled ancestry, age, sex or body-mass axes,
so the runtime derives calibrated semantic directions by projecting anatomical
measurements into its 20 body and 20 head identity components. The
feminine/masculine continuum drives chest, waist, hip, shoulder and facial
structure; normalized African, Asian and European weights blend overlapping
population centres while leaving seed and manual feature variation independent.
An MHR-only control group exposes genuine rig dimensions from Meta's model
definition: neck, upper/lower arm, hip, upper/lower leg, foot, hand and eyeball
spacing controls. These are also varied conservatively by new patient seeds.

Every generated patient stores a versioned `appearance.mhrIdentity` record with
its seed, presentation value and normalized ancestry mixture. MHR now uses the
same procedural scalp/hair system as A and a first-pass sex-aware period costume
foundation: bodice/skirt silhouettes for women and sack-jacket/trouser
silhouettes for men. These procedural shells are validation assets pending
fitted and skinned production garments.

`character:generate` and the local regeneration endpoint produce/cache A. The
full 35 MB MHR asset remains the live-authoring master. `npm run mhr:generate`
bakes the selected patient's 45 identity coefficients into the base mesh,
removes those authoring targets, retains all 72 expression targets and the
126-bone rig, and caches a high-precision Meshopt runtime GLB by preset
signature. The current reference export is about 1.9 MB; a repeated generation
with identical values is restored from cache.

```
npm run patient:test          # determinism, coherence and render-contract tests
npm run hair:test             # hairline bounds and deterministic geometry tests
npm run renderer:test         # A face/skin behavior plus B MHR asset contracts
npm run mhr:audit             # quantitative semantic endpoint report
npm run mhr:generate          # cached patient-specific MHR runtime GLB
npm run mhr:contact-sheet     # repeatable eight-person Blender calibration sheet
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
  A's smoothing slider blends toward a topology-safe quantized normal field.

## Known gaps

- Base garment is still a recolored MakeHuman suit; the procedural layers
  cover most of it, but a real bodice/skirt garment remains the asset gap.
- Renderer-A expressions now use official MPFB named face units. Their weights
  still need visual tuning across multiple identities, and MPFB's supplied
  shapes may eventually need corrective sculpts for close-ups.
- MHR has no bundled hair or wardrobe ecosystem. Period garments need fitting,
  weight transfer, covered-body masks, and identity corrective shapes; rigid
  jewelry and medical markers can use its named bones directly.
- The browser pose currently uses MHR's ordinary exported skin weights. Meta's
  higher-quality non-linear pose correctives are distributed separately and
  should be evaluated offline before the seated pose is considered final.
- Speech visemes and facial mocap are not wired yet. The named target layer is
  intentionally compatible with adding either later.
- The current demographic directions are calibrated anatomical projections
  because the public MHR release does not provide named sex or ancestry axes.
  Keep the saved contact sheet and coefficient manifest as regressions when
  tuning them; hair and fitted clothing remain necessary presentation cues.

See [`docs/facial-animation.md`](../docs/facial-animation.md) for the design,
installation details and expression recipes.
