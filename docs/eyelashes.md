# Procedural eyelashes

Implemented November 1, 2026 in Face Lab and the game, using the same controller.
The five levels are **Minimal, Light, Natural, Full and Prominent**. Each changes
upper and lower lash count, length, thickness and curl. A separate seed varies
spacing, fan and individual lengths without changing the face geometry.

## Authoring

Face Lab exposes **Eyelashes** and **Lash colour** beside the face controls.
Colour follows the selected hair by default, with independent soft black,
brown, fair and grey overrides. Saved recipes retain `lashProminence` (0–4),
`lashSeed` and `lashTone`. The same fields work in an authored patient's asset
recipe and in curated cast appearances. Carmela defaults to Full; the worker
base defaults to Natural.

Generated variations use these overlapping probabilities:

| Range | Minimal | Light | Natural | Full | Prominent |
| --- | --- | --- | --- | --- | --- |
| Men | 16% | 31% | 34% | 16% | 3% |
| Women | 8% | 18% | 37% | 26% | 11% |

These weights implement the requested art direction, not a biological claim.
Every level remains available to every figure. Lash randomness is independent
of the existing face generator, so adding lashes does not reshuffle its faces.

## Fit and rendering

`shared/characters/modularEyelashes.js` finds the opening in each fitted eyelid
by its boundary topology. This survives the GLB exporter's vertex reordering.
It samples the current morphed and skinned rim after face animation, attaching
the fibres to that moving edge. Blinks, squints, gaze, head motion and identity
changes therefore use the actual lid positions rather than a separate guessed
eye curve. Lower lashes are shorter and sparser.

Each fibre is a curved, tapered strip. Screen-size coverage widens subpixel
strips and reduces their alpha, keeping them from breaking into dark dots as
the camera pulls away. The two eyes add two draw calls and 360–1,480 triangles,
with no new texture download or cast shadows. Geometry and materials belong
to the actor and are disposed with it.

The controller supports the five modular assets: Carmela, the seamstress,
lean male, broad male and complete worker. Older one-piece heads without the
fitted `Carmela_Lid_Left` / `Right` meshes retain their existing asset appearance.
This is natural lash variation, not a mascara or false-eyelash system.

## Male eye correction

The first comparison overstated the consistency between heads. Carmela and
the seamstress already have painted lashes, a dark lid margin and creases in
their original eye atlases. Their Minimal setting means the least added fibre;
it does not remove that painted base. The male cleanup previously replaced too
much of the socket with cheek skin, losing its folds and margin definition.

The correction preserves more of the male donor's lid fold and bakes a fitted
margin and crease into its skin map. The narrower opening wraps onto the globe
before meeting the surrounding skin. A smaller vertical globe radius removes
the blue/white fragments that poked through the lower socket. This applies to
both male head families and the complete worker, retaining all nine clips and
their facial controls. The eye surface also has a lighter sclera and clear coat.

The fibre fan now uses the moving eye plane instead of a local lid normal,
which could point into the socket on the worker's steep lid roll. Roots sit
on the anterior skin margin, just outside the wet inner edge. The middle and
upper levels have more visible fibres, with softer subpixel coverage.

The female painted baseline remains a limit on absolute cross-head matching.
Removing those painted strands while keeping the existing skin and crease
detail would be a separate texture cleanup; the current controls add geometry
above that baseline.

## Review

With the lab running:

```sh
node scripts/characters/capture-eyelashes.mjs --motion
node --test game/tests/eyelashes.test.js
```

Use `--url=http://127.0.0.1:PORT` for another local server. The review saves
43 poses, five-level and blink comparison sheets, two optional live videos,
and diagnostics under `artifacts/characters/eyelashes/review/`. It covers all
five heads, hair colours, profiles, expression changes and feature variations.
The game capture state also records each actor's lash level, colour and count.
Use the worker and Carmela consultation replays in `gameplay-testing.md` to
inspect the ordinary game camera as well as the lab close-ups.

Validation: both production builds, 794 game tests and 18 runtime/wardrobe tests
passed. The final lab review captured 43 poses and two live videos with no
browser/resource errors. The worker's 15-step consultation and Carmela's
45-step expression/consultation route completed without failed actions or
browser errors. Their capture metadata confirms Natural lashes on the worker
and Full lashes on Carmela. PNGs and motion contact sheets were inspected.

Add `--eye-fit` to save 15 more poses and flat eye masks across the five heads.
In Face Lab, `inspectShading('eye-fit')` shows eye surfaces red and lids blue.
For the male sclera maps, the runner checks for disconnected exposed fragments
and uncovered eyes during full closure, allowing a few antialiasing pixels.
Female atlases also contain surrounding skin, so their raw mesh masks are
diagnostic images rather than a sclera-only assertion.

The correction passed both production builds, 795 game tests and nine runtime
tests. The final review saved 58 poses and two live videos without browser or
resource errors. The three male heads passed the exposed-sclera checks, with
no uncovered eye pixels at full closure. The worker's 15-step consultation and
Carmela's 45-step route passed again. Asset comparison confirmed unchanged
joint/node names, clips, facial-control names and triangle counts. The final
captures are in `artifacts/characters/eyelashes/lid-final/` and
`artifacts/gameplay/{worker,carmela}-eye-fit/`.
