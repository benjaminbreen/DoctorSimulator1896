# Procedural patient hair

The hair layer stays in Three.js so identity, period style, silhouette and
grooming controls remain live. It is fitted once to the generated head through
the raycast scalp grid and rebuilt deterministically from the character seed.

## Module boundaries

- `profiles.js` contains period-style geometry and flow anchors. Profiles are
  data only.
- `geometry.js` owns scalp sampling, hairline and thickness fields, swept flow
  paths, ribbons, the fitted root fringe and baby-hair wisps.
- `palette.js` owns named natural shade recipes and the custom-color fallback.
- `materials.js` owns flow texture, anisotropic response, sheen and alpha
  treatment. It does not decide geometry or demographic casting.
- `index.js` assembles the pieces and attaches them to the head bone.

The shell is the dense occluding mass, not the visible hairstyle by itself.
Its UVs bend toward the profile's rear collector; visible ribbons use the same
style anchor and run from the hairline toward the bun or chignon. A separate
root fringe bridges the shell to the scalp, allowing the shell edge to feather
without making the complete hairstyle a transparent sorting problem.

Natural greying is assigned to complete deterministic ribbons, with a higher
probability at the temples. Patient class and age influence style casting;
ancestry never chooses a style. Grooming/disarray may alter loose wisps but is
kept separate from clinical severity.

Run `npm run hair:test` after changing profiles or geometry. The tests verify
forehead exposure, part topology, deterministic flow, rear-anchor termination,
root-fringe alpha and shade resolution. Visual review should include front,
three-quarter and profile views under moving light.
