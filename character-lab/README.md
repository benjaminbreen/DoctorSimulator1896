# 1896 Character Lab

Development and approval tool for Renderer C patients. It uses the same
Renderer C controller, recipe contract, and material path as the game.

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

The lab is organized by task: Cast, Appearance, Wardrobe, Performance, and QA.
Renderer C is the only active renderer.

- **Appearance variation** advances the appearance seed and rerolls the current
  patient's body, face, hair, palette, clothing, and surface controls without
  replacing her identity, case record, or clinically derived performance.
- **New random patient** draws fresh patient seeds, selects the candidate whose
  facial parameters are most distinct from the person currently visible,
  creates a new identity, household, clinical presentation, appearance, and
  performance profile, then resolves it through Renderer C without Blender.
- Cohort, age band, and ancestry are derived from the patient record. The Cast
  workspace can unlock those fields for deliberate renderer experiments.
- Each generated patient receives a coherent resting-face signature
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
- `src/stylized.js` — retained experimental skin treatment from renderers A
  and B. Renderer C does not currently load this module's surface layers:
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

Skin-rendering values are generated as identity consequences, but the Renderer
C runtime currently uses only skin colour and roughness. Skin tone is selected
from six named, renderer-calibrated choices rather than a free-form colour
picker. Eye colour uses six named choices and changes the exported iris texture
without tinting the sclera. Procedural casting uses broad ancestry-aware subsets
of those palettes; these are visual sampling defaults, not fixed biological
rules, and every approved option remains manually selectable. The older-age
normal, roughness, albedo, and mask layers are Work Package 2. The `stylized…`
JSON fields remain in presets for compatibility; the lab does not present them
as working Renderer C controls.

## Retired A/B experiments

Renderers A and B are no longer selectable in Character Lab and are not part of
the game runtime. Their source files and regression tests are retained
temporarily because Renderer C's offline Blender scripts still reuse some MPFB
generation code. The notes below are historical implementation reference, not
the current workflow.

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

The current MHR visual foundation uses a shoulder-overlapping smooth bodice,
restrained 1890s sleeve volume, and a fitted hair under-cap beneath the visible
flow shells. MHR's eyes are embedded in `body_mesh`, so their sclera, iris and
pupil colors are assigned from the rig eye centres rather than waiting for a
separate `Eyes` material. Face masks are measured from current base vertices
and verified expression motion; morph-target bounding-box extremes must never
be used for lip, cheek, freckle, or pore placement.

Renderer B also has a live semantic expression driver. The public MHR release
retains 72 signed expression components but does not publish FACS/ARKit names
for them. The lab therefore keeps every component in the atomic debugger
(including its full -1…1 range), uses visually verified bilateral controls
32/33 for smile, their neighboring mouth controls for sadness, and the paired
eyelid controls for fatigue. Only quiet cheek/brow contributions are inferred
from regularized local deformation fields. Smile, sadness and fatigue share
the same attack/hold/release scheduler as renderer A, and MPFB resting-face
signatures are translated into the corresponding MHR controls.

### Renderer C wardrobe

The **Dress the figure** panel replaces the hard-coded Dress study button. It
switches directly between the women and men cohort masters and lists only
outfits the active cohort can already render live. Some are embedded skinned
garments and some are the existing procedural silhouette comparisons.
Selecting an outfit does not run Blender.

The women’s list starts with the Golden day-dress prototype, followed by the
older fitted proof, five procedural silhouette comparisons, and the plain MPFB
carrier. The men’s list exposes the
working layers, sack suit, fitted Victorian sample, authored waistcoat set, and
formal or mourning coat variants. This is an audition tool; the labels do not
claim that a garment is approved 1896 content.

The Golden day dress is a separate retained option. It copies the proven
skinned upper carrier, removes its modern short skirt, and combines it with a
full gored skirt. Its chest insert follows the fitted bodice surface, its cuffs
and standing collar are hollow skinned shells with inner and outer faces, and
its buttons are solid geometry. Primary, secondary, and accent colours are
material slots rather than screen-space or object-space paint masks. Fabric
maps add surface grain but do not define the neckline, cuffs, or trim. Separate
controls adjust bust coverage, collar height, cuff width, and the material
thickness of the collar and cuffs.

Stable seated clips use a lower-gown surface copied from the fitted source so
the skirt follows the thighs and falls toward the floor. A visible knee seam
and simple rear drape remain prototype limitations. This garment is an
approximately period-shaped technical base, not an approved historical
reconstruction.

The fitted dress uses a Blender-authored gored skirt on the same 52-bone Mixamo
skeleton as the body. The fitted MPFB/MakeClothes carrier supplies the bodice,
sleeves, body mask and body-build morphs. The visible A-line skirt uses one
continuous hip-driven envelope for standing and walking, so Mixamo leg motion
cannot split it into separate lobes.

Long skirts need different deformation strategies for locomotion and sitting.
At stable seated clips Character Lab switches to the authored fitted garment
surface, which follows the legs across the lap without rebuilding geometry into
an animation frame. The procedural shell is available only as an explicit
comparison in the **Women’s garment proof** selector. This is deterministic
prototype behavior, not cloth simulation; approved final garments should add
skirt bones, corrective shapes, or secondary physics where the animation set
needs them.

The panel also lists downloaded MPFB source garments that are not yet wearable.
They remain disabled until a checked cohort-master build embeds their fitted
mesh, morphs and rig weights. Standalone, unskinned GLBs are never presented as
wearable clothing.

Press **Shift+2** to open Asset examination. The full-screen catalog exposes
all Renderer C wearable states, retained OBJ/MHCLO sources, and imported
Victorian GLB studies.
Wearable entries appear on the live male or female figure. Source-only dresses,
suits, hats, boots and glasses appear as neutral standalone meshes in the same
orbitable Three.js stage, with their source and licence visible. Escape or
Shift+2 closes the catalog.

### Renderer C elite menswear proof

The male `mens-formal-suit` and `mens-mourning-suit` styles now use
`RendererC_EliteMorningSuit`, an authored seven-material SkinnedMesh exported
inside the Renderer C male master. It uses the existing MPFB garment only as a
source for fitted sleeves, trousers, body morph deltas, and Mixamo weights. The
visible morning-coat shell, tails and back vent, waistcoat, lapels, starched
collar, shirt, neckwear, pocket welts, buttons, lining, and watch chain are
purpose-built geometry.

Coat cut, length and fullness, lapel width, trouser width, waistcoat fit, and
collar height and spread are named garment morphs, so Character Lab can tune
them live without a Blender rebuild. Palettes, restrained patterns, wear, and
material regions also remain live. The historical interpretation is
provisional until Ben approves it; the principal silhouette reference is the
Metropolitan Museum's 1894 J. B. Johnstone morning suit (2009.300.548a-c).

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

Renderer C exposes its authored seated, standing, transition, and walking clips
in the Performance workspace. Pose transitions continue when ambient idle
motion is disabled.

## Gotchas learned the hard way

- Every statically posed bone must be **keyed inside each exported action** —
  unkeyed bones snap back to bind pose when a clip plays in three.js.
- Never pause a clip mid-fade: a paused fade sits at zero weight and exposes
  the standing bind pose. Set full effective weight before pausing.
- Thigh Y is bone twist (invisible); knee adduction is local Z, applied live
  by the `kneesTogether` control, mirrored between legs.
- Generated Renderer C garments keep one bind pose. Runtime may switch between
  authored skinned surfaces at stable clip endpoints, but it never rebuilds
  baked geometry into an in-between animation frame.
- `window.__lab` in the viewer console exposes scene/bones/preset/idle for
  calibration probes.
- Blue controls update the active Renderer C master immediately. Orange
  controls are retained schema fields that need a future asset-bank build; the
  normal lab workflow never launches Blender.
- Identity morphs must be baked before adding the rig, eyes, teeth, proxy
  garments, and other fitted assets. Replaying them on the skin alone causes
  floating facial features and must never be used for character variation.
- Seated rigs are aligned from the generated pelvis position to the 0.455 m
  chair surface; never use a fixed vertical offset across body proportions.
- Seed demographics use an explicit 1896 elite-clinic profile rather than
  choosing MPFB ancestry targets uniformly. Complexion and eye palettes use
  bounded ancestry-aware sampling defaults; all six named choices remain
  manually editable live controls.
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
- MHR's public expression components are not semantically named. The saved
  indexed atlas is the calibration record; new recipes should prefer visually
  verified authored components over broad latent projection.
- The current demographic directions are calibrated anatomical projections
  because the public MHR release does not provide named sex or ancestry axes.
  Keep the saved contact sheet and coefficient manifest as regressions when
  tuning them; hair and fitted clothing remain necessary presentation cues.

See [`docs/facial-animation.md`](../docs/facial-animation.md) for the design,
installation details and expression recipes.
