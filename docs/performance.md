# Runtime performance

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
