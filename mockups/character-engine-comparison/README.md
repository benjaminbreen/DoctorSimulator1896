# Character engine comparison

Visual record of seeded character-generation experiments. Heavy temporary
model files and third-party dependencies are kept outside the repository; the
contact sheets here preserve the evidence used to compare pipelines.

## Engines

- **A — MPFB:** the current MakeHuman/MPFB renderer.
- **B — MHR:** Meta's Momentum Human Rig full-body model, selected as the
  production comparison path.
- **Archived GNM proof:** Google's scan-trained GNM Head was evaluated through
  GNM Head Editor 2.2.3, then dropped because it did not serve the full-body,
  rigged patient requirement.

Each image filename includes its engine and experiment. Detailed seeds and
geometry measurements accompany the final comparison report.

## Recorded sheets

- `renderer-a-current-contact-sheet.png` — the current MPFB renderer-A Blender
  reference copied here so all engine evidence is reviewed from one directory.
- `gnm-white-female-seeds-111-666.png` — controlled within-cohort GNM identity
  variation; accompanying JSON records coefficient ranges and mesh RMS deltas.
- `gnm-mixed-demographics-seeds-111-666.png` — the same seeds with alternating
  semantic gender/ethnicity conditions.
- `mhr-head-identity-seeds-111-666.png` — MHR LOD1 with only its 20 head identity
  components randomized; body, hand, pose, and expression remain neutral.
- `mhr-expression-contact-sheet-2026-08-06.png` — current neutral, smile,
  sadness and fatigue semantic recipes after authored-component calibration.
- `mhr-expression-atlas-*.png` — indexed +0.65 visual audit of MHR's 72 signed
  expression components. The matching JSON files preserve exact weights.

The GNM sheets use only the add-on's license-safe neutral material fallback.
The optional CC BY-NC-SA photographic skin map was not downloaded or used.
