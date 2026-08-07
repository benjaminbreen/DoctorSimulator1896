# Facial animation

## Decision

Renderer A uses MPFB's official `faceunits01` deformation library as its
facial-control foundation. The project keeps its existing runtime performance
scheduler and replaces topology-dependent JavaScript vertex manufacture with
semantic recipes made from named units such as `mouthSmileLeft`,
`cheekSquintRight`, `eyeWideLeft`, and `browInnerUp`.

This is a foundation rather than an automatic realism pass. MPFB's shapes may
need per-identity inspection and occasional corrective sculpting, but they give
the project stable controls, fitted-asset coordination, and a route to visemes
or facial capture without maintaining hand-written vertex heuristics.

## Authoring prerequisites

- Blender with MPFB 2.0.16 or newer. Development currently uses 2.0.17.
- MakeHuman system assets.
- The official `faceunits01` asset pack from the MPFB asset repository.

MPFB's generator APIs load the ARKit-compatible units onto the basemesh and
interpolate applicable deformations onto fitted MHCLO assets. The character
generator verifies that the pack is installed, loads the units before fitting
assets, interpolates after all facial assets exist, and then exports the GLB.

The documentation has referred to both 52 and 54 units over time. The current
installed implementation exports 52 on the body. Application code must inspect
the GLB's target dictionary and must not use a hard-coded count.

## Runtime design

`character-lab/src/expressions.js` selects one of two drivers:

1. `mpfb-faceunits` when the body contains the required named controls.
2. `legacy-procedural` when it does not.

Named weights are broadcast to every mesh that exports the same target. This
keeps skin, eyebrows, lashes, eyes, and teeth coordinated. Semantic expressions
are small data recipes; runtime code layers timing and intensity over them.
For example, a polite or forced smile can strongly recruit the mouth while
barely involving cheeks and eyelids, whereas a genuine smile recruits both.

The lab's **Atomic face-unit debug** inspector isolates any target discovered
on the exported body. Use it before judging a compound recipe: first verify the
individual units on several identities, then adjust the recipe weights and
timing.

## Comparison-engine boundary

Renderer A directly carries the named MPFB library. Meta MHR exports 72 numbered
facial components intact, but the upstream release does not publish a
FACS/semantic name mapping. The lab therefore exposes those
MHR components by number for isolation tests and does not pretend they are
interchangeable with MPFB's ARKit-compatible names.

## Acceptance checks

- Renderer A exposes the required named controls and at least the currently
  expected scale of the library without requiring an exact count.
- Brow and jaw-related controls exist on more than the skin mesh where fitted
  assets support them.
- A semantic expression drives every mesh carrying each selected target.
- Debug isolation zeros the preceding compound expression and drives only the
  selected unit.
- MHR retains all 72 expression components. The current proof keeps float morph
  normals while the aggressively quantized export is evaluated separately from
  the viewer's former shadow-map banding.
- Multiple patient identities are visually compared before choosing a new base.
