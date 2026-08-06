# NYC 1896 Patient Generator

This directory generates fictional female patients for the Blackwell clinic and
maps them onto the Character Lab's existing preset contract.

## Boundaries

The pipeline has two deliberately separate layers:

1. `generatePatient.js` creates a game-domain patient: identity, household,
   social position, route into the clinic, and clinical presentation. It does
   not know about Blender, Three.js, morph targets, or sliders.
2. `toCharacterPreset.js` turns the consequences of that record into render
   values. This is the only patient module allowed to know the character preset.

The resulting preset stores the source record at `preset.patient`. This keeps a
generated model, its case data, and its seed together without adding narrative
fields to the 100-value render schema.

Patient and appearance seeds are deliberately distinct. A new patient seed
creates a new identity and case. An appearance seed can be advanced while
keeping that record fixed, producing another visual interpretation of the same
patient. Appearance variation waits for **Regenerate model**; **New random
patient** regenerates the GLBs immediately so the displayed anatomy and fitted
features match the new record.

## Data modules

- `data/demographics.js`: city population assumptions, clinic-access weights,
  names, languages, and appearance palettes.
- `data/social.js`: clinic classes, paid and unpaid work, households, payers,
  referrals, and residences.
- `data/clinical.js`: period case-sheet categories, neutral internal themes,
  complaints, symptoms, and performance consequences.
- `data/appearance.js`: safe face archetypes, hairstyles, outfits, and palettes.
- `random.js`: deterministic, separately salted streams for every subsystem.

## Extension rules

- Add historical facts to a data module, not to the generator's control flow.
- Keep city frequency separate from clinic access. The waiting room is not a
  census sample.
- Never derive temperament or diagnosis from ancestry.
- Appearance profiles move probabilities; they do not impose hard gates.
- Age may shift visible skin-surface distributions such as texture, pigment
  variation, lip saturation, and eye-white contrast, but seeded variation must
  remain substantial and the values must stay manually editable.
- Give a new subsystem its own stable random-stream label. Never consume extra
  draws from an unrelated subsystem.
- Period diagnostic language belongs in `periodCategory`; neutral game-facing
  interpretation belongs in `theme`.
- Add a distribution assertion or audit output for every new table.

## Verification

```bash
npm run patient:test
npm run patient:audit -- 2000
```

The audit is intentionally human-readable. Historical distribution errors tend
to be plausible-looking and cannot all be caught by unit assertions.
