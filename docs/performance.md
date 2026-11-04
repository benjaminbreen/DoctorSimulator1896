# Runtime performance

## October 30 mouth, eyelid and curated-look pass

The final assets are 8,373,664 bytes for Carmela and 8,228,668 bytes for the
second head. They include the revised dental arches, gums and tongue, plus
changing surface normals on the lips and lids. Twelve appearance recipes
reuse these two assets; they do not add twelve model downloads.

The production preview in Chrome/Metal at 1440 × 900, quality preset and DPR 1
recorded these six-second samples:

| View | p95 frame interval | Average draw calls | Triangles across passes |
| --- | ---: | ---: | ---: |
| Conversation | 16.7 ms | 744 | 809,563 |
| Examination | 16.8 ms | 944 | 1,130,196 |

Each sample contained 362 frames, no interval over 50 ms, no long tasks and no
browser errors. These samples exclude loading and transitions; the cumulative
overlay recorded a 104 ms earlier frame. They establish local steady-state
performance, not a loading or cross-device guarantee. Results and screenshots
are in `artifacts/performance/carmela-face-final/`.

## October 30 ear coverage and nape pass

The five-style assets are 8,202,204 bytes for Carmela and 8,052,644 bytes for
the second head. They include the retained three updos, two ear-covering
styles, fine-fibre and curl albedos, 512-pixel normal maps and masked strand
edges. This increases download and memory cost; only one style is rendered.
Grooming still uses morph weights, with no per-frame mesh rebuilding.

The production preview in Chrome/Metal at 1440 × 900, quality preset and DPR 1
recorded two six-second samples of the default soft side waves:

| View | p95 frame interval | Average draw calls | Triangles across passes |
| --- | ---: | ---: | ---: |
| Conversation | 16.7 ms | 732 | 801,490 |
| Examination | 16.7 ms | 929 | 1,121,236 |

Both samples contained 362 frames, no interval over 50 ms and no browser errors.
The material cutout remains active in the game; forcing it opaque was corrected.
These are local steady-state measurements, excluding download and loading, and
do not establish performance on other devices. Results and screenshots are in
`artifacts/performance/carmela-nape-final/`.

## October 30 procedural hairstyles

Carmela's asset is now 5,152,892 bytes and the second head is 5,036,948 bytes.
Each contains three complete hairstyles and their grooming targets, adding
about 0.8 MB per head. Hidden styles retain their download and memory cost but
do not submit draw calls. Grooming uses morph weights without per-frame mesh
rebuilding. The 65-joint skeleton and nine body clips are unchanged.

The production preview in Chrome/Metal at 1440 × 900, quality preset and DPR 1
recorded two six-second samples of Carmela's default chignon:

| View | p95 frame interval | Average draw calls | Triangles across passes |
| --- | ---: | ---: | ---: |
| Conversation | 16.8 ms | 729 | 782,674 |
| Examination | 16.7 ms | 924 | 1,094,356 |

The samples contained 362 and 363 frames, no interval over 50 ms and no browser
errors. This is a steady-state check of the current room on this machine;
loading and performance on other devices are not established by these samples.
Results and screenshots are in `artifacts/performance/carmela-hair-final/`.

## October 29 expression and facial-binding pass

Carmela's final asset is 4,321,072 bytes; the second head is 4,326,012 bytes.
Both retain the shared 65-joint skeleton and nine clips. The fitted-head
expression profile and corrected chin binding add no new per-frame geometry.
Instance-owned face and appearance geometry is disposed when an actor leaves.

The production preview in Chrome/Metal at 1440 × 900, quality preset and DPR 1
recorded 16.7 ms p95 frame intervals for both conversation and examination.
Each six-second sample contained 362 frames, no interval over 50 ms and no
browser errors. Conversation averaged 726 draw calls and examination 921.
Carmela's conversation camera is now closer, so the conversation draw count
is not a direct comparison with the older framing.

Results and screenshots are in
`artifacts/performance/carmela-emoting-rig-fixed/`.

## October 29 hair, mouth and sleeve pass

The polished assets are 4,297,432 bytes for Carmela and 4,302,372 for the
second head. Both keep the same 65-joint skeleton and nine clips. Added lip,
mouth, tooth and hair geometry increases rendering work slightly.

The production preview in Chrome/Metal at 1440 × 900, quality preset and DPR 1
recorded two six-second steady-state samples:

| View | p95 frame interval | Average draw calls | Triangles across passes |
| --- | ---: | ---: | ---: |
| Conversation | 16.7 ms | 784 | 845,590 |
| Examination | 16.7 ms | 921 | 1,127,776 |

Neither sample contained a frame over 50 ms or a browser error. Conversation
adds about 20 calls and 46,000 triangles across passes versus the initial modular
asset. Both versions stay near 60 FPS on this machine. These samples exclude
loading and do not establish performance on other devices.

Results are in `artifacts/performance/carmela-polish/`. The full offline case
replay and recorded video are in `artifacts/gameplay/carmela-polish-accepted/`.

## October 29 modular character pass

The initial modular Carmela asset was 4,154,148 bytes, down from a 24.4 MB Blender
export. It retains one 65-joint skeleton, nine clips and the facial controls.
The second head used an identical skeleton and was 4,117,480 bytes.

A production preview in Chrome/Metal at 1440 × 900, quality preset and DPR 1
recorded two six-second samples after Carmela's entrance:

| View | p95 frame interval | Average draw calls | Triangles across passes |
| --- | ---: | ---: | ---: |
| Conversation | 16.7 ms | 764 | 799,460 |
| Examination | 16.8 ms | 891 | 1,064,241 |

Neither sample contained a frame over 50 ms or a browser error. The previous
conversation measurement was 791 calls and about 823,000 triangles. Both
versions ran near 60 FPS here; the new model gives a modest reduction in
rendering work, not an established speedup across devices. Loading is outside
these steady-state samples.

Results and screenshots are in `artifacts/performance/carmela-modular-production/`.
The runner now rejects an empty frame sample, which can occur if a development
reload destroys its recorder. This measurement used the production preview.

## October 28 consultation pass

Seated conversations now refresh interior shadow maps at 30 Hz. Walking,
examination mode, and staged loading retain a shadow update on every frame.
The patient animation and the rest of the rendered scene still run at the
browser's normal frame rate. This reduces repeated shadow draws without
lowering screenshot resolution or removing lighting.

A local production comparison used Chrome/Metal, a 1440 × 900 viewport,
quality preset, DPR 1, the same seeded Carmela case, and six seconds of seated
conversation after the entrance. The old full-refresh frame submitted 997 draw
calls; the new run averaged 791, with 586 on cached-shadow frames. Rendered
triangles across all passes fell from about 1.15 million to 0.82 million per
frame. The scene's geometry was unchanged. Both runs stayed near 60 FPS and
had a 16.8 ms p95 frame interval. This is rendering headroom, not evidence of
a large frame-rate improvement on other hardware.

The production benchmark can now measure the consultation UI and examination
view with real browser timers:

```sh
node game/scripts/performance-playtest.mjs --url=http://127.0.0.1:5175 \
  --consultation --quality=quality --dpr=1 \
  --output=artifacts/performance/consultation
```

It keeps the civil clock at the opening time to avoid appointment interruptions,
starts Carmela through the casebook, waits for her entrance, and records separate
conversation and examination samples. JSON includes average draw and triangle
counts as well as frame percentiles. The original park route remains the default.

The same pass fixed accumulation of procedural bone rotations. A constant-clip
test previously bent the spine by up to 0.982 radians over a minute; restoring
the clip pose before each procedural update keeps it within 0.012 radians.
Unchanged clinical events no longer restart the last body gesture when the
player changes menus or edits the case record.

The September 2026 pass addresses loading and frame spikes, rather than only
average FPS. The browser benchmark is `game/scripts/performance-playtest.mjs`.
Run it against a production preview, with no other benchmark browser running:

```sh
npm --prefix game run build
npm --prefix game run preview
node game/scripts/performance-playtest.mjs --url=http://127.0.0.1:5175 --output=artifacts/performance/latest
```

It records a fresh browser boot, an initial camera sweep, arrival among park
pedestrians, first and repeated crowd sweeps, and walking at a fixed 4.1 m/s
for comparison across gait-default changes. JSON includes frame
percentiles, worst frames, shader counts, DPR, long tasks, resources and errors.
Screenshots and results stay local under `artifacts/performance/`.

## Changes

- Terrain queries index immutable road bounds, reject distant path segments,
  and avoid pond calculations beyond the shore. Terrain detail is unchanged.
  Exact comparison with the original implementation passed at 1,500 sample
  points; tests also cover road edges.
- Model consumers share parsed files. The loader limits concurrent work to
  four requests; visible-stage requests precede queued background requests.
  Crowd assets load together and character construction yields between small
  batches. Interior prefetch waits until the finished park has settled.
- Each stage prepares shader variants, textures, vertex buffers and distant
  geometry before appearing. The final pass includes the completed lighting,
  because later lights change earlier materials' shader variants.
- Immutable scenery skips Three's recursive transform walk. Pedestrians update
  bones only when their pose or placement changes; distant navigation updates
  less often while preserving its accumulated simulation time.
- Tree instances are grouped by geographic cell for culling, with simplified
  distant geometry and hysteresis to prevent repeated LOD swaps near a boundary.
  `scripts/models/build-tree-lods.mjs` rebuilds the six credited derivatives.
- Water reflections skip negligible screen coverage, refresh less often, and
  omit small scenery and redundant shadow rendering.
- The diagnostic overlay reports p95/p99 frame time and stalls. Adaptive
  resolution responds to recent sustained load, independently of the longer
  diagnostic window, and recovers cautiously. It restores detail when a
  reduction fails to improve FPS, so CPU contention does not keep blurring
  the scene.
- Shaded surfaces receive more sky and ground fill; the outdoor vignette is
  lighter. Paving has broader color variation, grass is less yellow, and
  movement speed better matches the character's gait. Customized saved tuning
  values survive the default migration.

## Verification

All 712 game tests pass. Browser captures additionally check daytime,
nighttime, travel to the waiting room and consulting office, and return to
the park with all 31 pedestrian entries restored. There were no JavaScript
or shader errors; local preview returns an expected 404 for Vercel analytics.
A Vite production build retains its existing warning about a large JavaScript chunk.

These are local Chrome/Metal measurements, not promises for every GPU, browser
or network. Compare DPR as well as frame times; automatic quality is enabled by
default. The benchmark waits for two animation frames before each sample to
exclude an earlier screenshot delay; `--no-screenshots` removes capture overhead
altogether. A camera sweep and a fixed-duration walk can reach different visible
crowd arrangements as simulation time advances.

For comparisons that hold rendering resolution fixed, append
`--no-screenshots --quality=quality`. This selects the quality preset and a
1.5 pixel-ratio cap in an isolated browser profile, for both builds.

## September 8 visual polish

- Added one instanced draw for nearby pedestrian/player contact shading and
  shelter post bases. Hidden or airborne actors do not get a patch; distant
  patches shrink away. This is ambient grounding, not another shadow-map pass.
- Corrected shelter roof UV proportions and reduced the texture's world scale.
  Timber is less saturated, pole joints have vertex shading, and roof interiors
  are darker. Small terrain wear masks mark shelter approaches.
- Lifted only dark texels on the player material slightly so the coat's folds
  remain readable. Existing adaptive resolution recovery remains in place.
- Fixed the two Belt Line passengers' floor height: their terrain coordinates
  were below the sidewalk. They now use the pavement height.
- Controls collapse five seconds after walking and camera use; the question
  mark reopens them. Nearby stationary announcement speakers turn toward the
  player. Speaker badges and subtitles share a diamond marker, and subtitles
  keep 24 pixels of clearance above overlapping bottom HUD elements.

Validation: the 713-test suite and production build pass. An isolated browser
check verified automatic control collapse, manual reopening, dialogue clearance,
NPC floor positions, speaker facing, and the rendered shelter. No runtime or
shader errors were reported. This pass does not establish a new performance
benchmark or eliminate the previously noted background loading pop-in.

## November 3 exterior pass

- Smaller tree cells and earlier distant geometry improve culling. Quantized
  LOD attributes are expanded before world transforms so distant crowns keep
  their shape. Bent leaf normals soften the flat-card lighting.
- Outdoor sun coverage is 32 metres instead of 50. Nearby tree cells cast
  shadows; stationary views refresh the sun map at most 30 times per second.
  Customized shadow distances survive the saved-settings migration.
- The original broad grass texture mix, colour and normal strength are kept.
  Small plants disappear sooner. Path margins have a broken texture transition.
- Pond banks slope continuously through the waterline, with varying width,
  a pale worn upper bank, narrow wet-earth margin and sparse pebble clusters.
  Extra terrain vertices are confined
  to the shore; the water depth mask has finer resolution. Foam is sparse.

Validation: 810 tests and the production build pass. Matching-camera captures
are in `artifacts/performance/exterior-approved/`, including a contact sheet
and shoreline detail. Local GPU timings vary under concurrent desktop work;
this pass does not establish a reliable FPS improvement.
The gameplay runner also checks the pond approach and the regular park route.
The shoreline regression test checks continuity across the eroded bank field.
The grass follow-up restores the original broad texture mix and pale bank;
`artifacts/performance/grass-restored/comparison.jpg` shows the corrected blend.

## November 3 procedural masonry and openings

- Four 1K colour surfaces retain the street palette. Three matching normal
  maps provide relief; 512px packed maps supply occlusion and roughness.
  Brownstone and pale stone share their relief textures. The shipped set is
  about 5.1 MB; sources, licence and rebuild instructions are in `credits.md`.
- Window returns, ground-floor lintels and layered cornices join the existing
  trim instances. One extra unlit instance batch supplies soft opening contact
  shading. No lights or shadow passes are added, and no new per-frame CPU
  animation work is required.
- Frontage families vary window proportions and use smaller top-storey
  openings. Bay centres and entrance records remain shared by interiors,
  projectile hit testing and rendering.

The comparison freezes the rest of the scene while swapping the four facade
modules, using Chrome/Metal at DPR 1.5 and the same five cameras. GPU medians
in milliseconds were:

| View | Original | Updated |
| --- | ---: | ---: |
| Brownstone close-up | 12.94 | 12.91 |
| Apartments | 9.01 | 6.25 |
| Pale stone | 7.86 | 7.12 |
| Brick | 5.47 | 6.96 |
| Full frontage | 11.25 | 12.02 |

Close street views retained a 16.7 ms median frame interval. Wider city views
remained slower, around 33 ms in the updated capture. Animated crowds, shadow
refresh cadence and concurrent desktop work vary these measurements; they do
not establish an FPS improvement. Additional surface detail has a memory and
geometry cost, including the measured increase in the brick view.

Validation: 812 game tests, the production build, daytime/evening shader checks
and the park/travel gameplay replay passed. The runner now holds `press` keys
for 100 ms so frame-polled controls can observe them. Captures and the contact
sheet are in `artifacts/performance/building-final-before/` and
`artifacts/performance/building-final-after/`; the final replay is in
`artifacts/gameplay/building-beauty-final/`.

Brick follow-up: the original regular-bond texture is the common finish;
rough PBR brick is a stable 25% choice on procedural brick parcels (18 regular,
6 rough in the current layout). `brickFinish: 'smooth'` or `'rough'` overrides
that choice. The exterior batch key and interior window proxy use the same
selection. This adds one shared brick batch and one existing 512px texture.

## November 3 shared character textures

Every modular patient GLB carried its own copy of the head, hair, eye and
skin textures, so 49 MB of the 79 MB of character images were repeats.
`scripts/characters/share-character-textures.mjs` now moves those images into
`game/public/models/characters/textures/`, named by content hash, and points
the GLBs at them. The browser caches each file once, so a later patient
fetches only the GLB and any texture it has not seen.

| Second patient | Before | After |
| --- | ---: | ---: |
| Same head, another outfit | 7.9 MB | 4.4 MB |
| Another woman | 8.4 MB | 6.0 MB |
| Another man | 5.9 MB | 5.1 MB |

The 18 modular GLBs fell from 143 MB to 65 MB plus 24 MB of shared textures.
A first patient downloads the same bytes as before; at 20 Mbps Carmela was
ready in about 7.6 s either way. Images and geometry are unchanged.

gltf-transform embeds the images again whenever it writes one of these
models. `optimize-modular-patients.mjs` and `build-patient-expansion.mjs` run
the step at the end; after any other script that rewrites a model (the
`fix-*` scripts, `build-clothing-fabrics.mjs`), run it by hand. A test in
`game/tests/modular-patients.test.js` fails if an expansion model embeds images.

## November 4 patient load time

Before, a patient called in at 20 Mbps waited on a chain of downloads: the
model, its textures, all 28 hat-fabric textures, the clothing fabrics and the
clothing atlas, then about 1.5 s of shader compiling and texture uploads.

- The next patient on the schedule is now mounted hidden once the office
  has booted (`warmOnly` in `RendererCActor`). Their downloads, shaders and
  texture uploads are done before they are called. `ActorLayer` keeps the
  hidden copy until the real actor is ready, because disposing it first
  would delete the shader programs the real actor reuses. Phones that defer
  idle actors skip this.
- Hat fabrics load the first time a material uses them, instead of all nine
  fabrics (2.8 MB) for every patient.
- Normal maps are near-lossless webp at quality 60 instead of lossless. Hair
  normals stay within 1.3° (99th percentile), and the 18 models' unique
  normal maps fell from 3.1 MB to 1.0 MB.

| Production build, 20 Mbps, click to ready | Before | After |
| --- | ---: | ---: |
| Next patient (Nora, preloaded) | 4.3 s | 1.4 s |
| A patient who is not next (Carmela) | 7.5 s | 5.7 s |

Both include about 1 s for the test to open the casebook; unthrottled, Nora
is ready 0.1 s after "Ask to return". Building the hidden patient costs a
main-thread pause of about 0.4 s while the previous patient is on stage.

Follow-up the same day:

- Clothing weaves (wool, herringbone, silk) load per weave on first use, like
  the hat fabrics, and the actor starts its weave alongside the model.
- The hidden next patient is no longer built the moment the schedule moves
  on. `ActorLayer` waits until every patient on stage is seated after any
  walk-in, then 3 s and an idle callback. In the test above the pause now
  falls while the patient's opening lines are on screen, not during the
  entrance.

## November 4 first load and shared-texture caching

The consulting office's first load at 20 Mbps fell from 14.8 s (33 MB) to
11.8 s (25.9 MB):

- `Furniture` loaded bark, brick, paving and every facade map in every room.
  It now loads each set only when the room has an item that uses it; the
  office has none.
- `WindowView` draws its street proxy unlit, which samples only colour maps,
  but downloaded the facade normal and roughness maps too. It now loads the
  five colour maps alone.
- The three lossless facade normal maps are near-lossless at 60 (4.1 MB to
  2.5 MB), the same rule as the character normal maps.

Screenshots of the office and park, before (`-5227`) and after (`-5226`), are
in `artifacts/performance/load-trim/`; the window region differs by 0.4/255
on average.

Two smaller changes:

- The shared character textures are served with
  `max-age=31536000, immutable`. Their names change when their bytes do.
- A GLTFLoader plugin starts a model's clothing atlas as soon as the GLB's
  JSON is parsed, so it downloads alongside the model's own textures.

What remains in the office's first load is mostly what the room shows: the
player figure (5.2 MB, on screen at the reveal), the laboratory bench's wood
(6.8 MB) and the bottles. Those textures are already lossy and detailed;
smaller encodings lost visible quality.
